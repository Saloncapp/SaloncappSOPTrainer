import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { httpError } from "../errors";
import { detectSpeechScript, langLog, speechPreview } from "./langDebug";
import type { ResponseLanguage } from "./responseLanguage";
import {
  readSpeechCache,
  speechCacheKey,
  writeSpeechCache,
  type CachedSpeech,
} from "./trainerTtsCache";

const CLOUD_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const CLOUD_TIMEOUT_MS = 15000;
const GEMINI_TIMEOUT_MS = 60000;

/**
 * Cloud TTS rejects a request whose input exceeds 5000 bytes, and Tamil or
 * Devanagari characters cost three bytes each. Chunk well below the limit so a
 * long trainer line still fits after the margin.
 */
const MAX_CHUNK_BYTES = 2800;
const MAX_TEXT_CHARS = 6000;
const MAX_SEGMENTS = 12;
const CHUNK_CONCURRENCY = 3;

/** How long to trust that Cloud TTS is unavailable before probing it again. */
const CLOUD_RETRY_AFTER_MS = 10 * 60 * 1000;

const LANGUAGE_CODES: Record<ResponseLanguage, string> = {
  ta: "ta-IN",
  hi: "hi-IN",
  en: "en-IN",
};

export type TrainerSpeechAudio = {
  language: ResponseLanguage;
  languageCode: string;
  mimeType: string;
  segments: string[];
  provider: string;
  cached: boolean;
};

let cloudUnavailableUntil = 0;
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: config.ttsApiKey });
  return geminiClient;
}

export function isTrainerTtsConfigured(): boolean {
  return Boolean(config.ttsApiKey);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Split on sentence boundaries so each request stays under the Cloud TTS byte
 * limit without cutting a word in half, which would be audible.
 */
export function chunkSpeechText(text: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  if (byteLength(value) <= maxBytes) return [value];

  const sentences = value.match(/[^.!?।\n]+[.!?।\n]*\s*/g) || [value];
  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (byteLength(sentence) <= maxBytes) {
      pieces.push(sentence);
      continue;
    }
    // A single sentence longer than the limit still has to be broken up.
    let current = "";
    for (const word of sentence.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && byteLength(candidate) > maxBytes) {
        pieces.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let buffer = "";
  for (const piece of pieces) {
    const candidate = buffer ? `${buffer} ${piece.trim()}` : piece.trim();
    if (buffer && byteLength(candidate) > maxBytes) {
      chunks.push(buffer.trim());
      buffer = piece.trim();
    } else {
      buffer = candidate;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.filter(Boolean);
}

function speakingRateFor(language: ResponseLanguage): number {
  // Match the on-device rates so remote and native playback sound the same.
  return language === "en" ? 0.95 : 0.88;
}

/** Runs tasks with a small concurrency cap while preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// --- Cloud Text-to-Speech (preferred: fast, compact MP3) --------------------

class CloudTtsUnavailable extends Error {}

async function synthesizeCloudChunk(
  text: string,
  language: ResponseLanguage,
): Promise<string> {
  const languageCode = LANGUAGE_CODES[language];
  const voiceName = config.ttsVoices[language];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${CLOUD_TTS_URL}?key=${encodeURIComponent(config.ttsApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          // Omitting `name` lets Google pick an available voice for the locale,
          // which keeps working when a named voice is retired.
          voice: voiceName
            ? { languageCode, name: voiceName }
            : { languageCode, ssmlGender: "FEMALE" },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: speakingRateFor(language),
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // 403 SERVICE_DISABLED / 400 API-key problems mean the project is not set
      // up for Cloud TTS; fall back rather than failing the utterance.
      if (response.status === 400 || response.status === 403 || response.status === 404) {
        throw new CloudTtsUnavailable(
          `Cloud TTS unavailable (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`,
        );
      }
      throw httpError(`Speech synthesis failed (${response.status})`, 502);
    }

    const body = (await response.json()) as { audioContent?: string };
    const audio = String(body.audioContent || "").trim();
    if (!audio) throw new CloudTtsUnavailable("Cloud TTS returned no audio.");
    return audio;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CloudTtsUnavailable("Cloud TTS timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// --- Gemini TTS (fallback: works on a plain Generative Language key) --------

/** expo-audio cannot play raw PCM, so L16 output needs a RIFF header. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function parsePcmSampleRate(mimeType: string): number {
  const match = /rate=(\d+)/.exec(mimeType || "");
  const rate = match ? Number(match[1]) : 0;
  return rate > 0 ? rate : 24000;
}

async function synthesizeGeminiChunk(
  text: string,
  language: ResponseLanguage,
): Promise<string> {
  const ai = getGeminiClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: config.geminiTtsModel,
      // The model is an LLM, so it has to be told not to answer the text.
      contents: `Read the following aloud exactly as written, in a warm, calm, professional trainer voice. Do not translate it, do not answer it, and do not add or omit any words.\n\n${text}`,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.geminiTtsVoice },
          },
        },
        abortSignal: controller.signal,
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const data = part?.inlineData?.data;
    if (!data) throw httpError("Gemini TTS returned no audio.", 502);
    const pcm = Buffer.from(data, "base64");
    const wav = pcmToWav(pcm, parsePcmSampleRate(part?.inlineData?.mimeType || ""));
    return wav.toString("base64");
  } finally {
    clearTimeout(timer);
  }
}

// --- Orchestration ---------------------------------------------------------

async function synthesizeAll(
  chunks: string[],
  language: ResponseLanguage,
): Promise<{ segments: string[]; mimeType: string; provider: string }> {
  const cloudReady = Date.now() >= cloudUnavailableUntil;
  if (cloudReady) {
    try {
      const segments = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, (chunk) =>
        synthesizeCloudChunk(chunk, language),
      );
      cloudUnavailableUntil = 0;
      return { segments, mimeType: "audio/mpeg", provider: "cloud-tts" };
    } catch (error) {
      if (!(error instanceof CloudTtsUnavailable)) throw error;
      cloudUnavailableUntil = Date.now() + CLOUD_RETRY_AFTER_MS;
      langLog("tts.cloud.unavailable", {
        error: error.message,
        // Gemini TTS is far slower and heavier, so make the downgrade obvious.
        fallback: config.geminiTtsModel,
      });
    }
  }

  const segments = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, (chunk) =>
    synthesizeGeminiChunk(chunk, language),
  );
  return { segments, mimeType: "audio/wav", provider: "gemini-tts" };
}

export async function synthesizeTrainerSpeech(options: {
  text: string;
  language: ResponseLanguage;
}): Promise<TrainerSpeechAudio> {
  if (!isTrainerTtsConfigured()) {
    throw httpError(
      "Server speech synthesis is not configured (GOOGLE_TTS_API_KEY).",
      503,
    );
  }

  const text = String(options.text || "").trim();
  if (!text) throw httpError("text is required", 400);
  if (text.length > MAX_TEXT_CHARS) {
    throw httpError("text is too long to synthesize", 413);
  }

  const key = speechCacheKey(options.language, text);
  const cached: CachedSpeech | null = await readSpeechCache(key);
  if (cached) {
    langLog("tts.server.cache", {
      language: options.language,
      segments: cached.segments.length,
      preview: speechPreview(text),
    });
    return {
      language: options.language,
      languageCode: LANGUAGE_CODES[options.language],
      mimeType: cached.mimeType,
      segments: cached.segments,
      provider: "cache",
      cached: true,
    };
  }

  const chunks = chunkSpeechText(text);
  if (!chunks.length) throw httpError("text is required", 400);
  if (chunks.length > MAX_SEGMENTS) {
    throw httpError("text is too long to synthesize", 413);
  }

  const startedAt = Date.now();
  const { segments, mimeType, provider } = await synthesizeAll(chunks, options.language);
  await writeSpeechCache(key, { mimeType, segments }, provider);

  langLog("tts.server.synthesized", {
    language: options.language,
    provider,
    segments: segments.length,
    ms: Date.now() - startedAt,
    script: detectSpeechScript(text),
    preview: speechPreview(text),
  });

  return {
    language: options.language,
    languageCode: LANGUAGE_CODES[options.language],
    mimeType,
    segments,
    provider,
    cached: false,
  };
}
