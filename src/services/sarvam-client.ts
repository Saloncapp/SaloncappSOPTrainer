import { config } from "../config";
import { httpError } from "../errors";
import type { ResponseLanguage } from "./responseLanguage";

const SARVAM_BASE = "https://api.sarvam.ai";
const CHAT_TIMEOUT_MS = 45000;
const STT_TIMEOUT_MS = 45000;
const TTS_TIMEOUT_MS = 20000;

export class SarvamAudioTooLongError extends Error {
  constructor(message = "Recording is too long for speech recognition. Keep it under 30 seconds.") {
    super(message);
    this.name = "SarvamAudioTooLongError";
  }
}

function getApiKey(): string {
  const key = String(config.sarvamApiKey || "").trim();
  if (!key) {
    throw new Error("SARVAM_API_KEY is not configured");
  }
  return key;
}

function subscriptionHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "api-subscription-key": getApiKey(),
    ...extra,
  };
}

async function readErrorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return `Sarvam request failed (${response.status})`;
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string; code?: string } | string;
      message?: string;
    };
    if (typeof json.error === "string" && json.error.trim()) return json.error.trim();
    if (json.error && typeof json.error === "object") {
      const message = String(json.error.message || "").trim();
      if (message) return message;
    }
    if (typeof json.message === "string" && json.message.trim()) return json.message.trim();
  } catch {
    /* fall through */
  }
  return text.slice(0, 240);
}

function looksLikeTooLongAudio(status: number, detail: string): boolean {
  if (status !== 400 && status !== 413 && status !== 422) return false;
  const lower = detail.toLowerCase();
  return (
    lower.includes("30 second") ||
    lower.includes("too long") ||
    lower.includes("duration") ||
    lower.includes("max duration") ||
    lower.includes("file too large")
  );
}

/**
 * Sarvam STT rejects bare `audio/m4a` (common from Expo/iOS). Map to an
 * allowed type from their list (`audio/x-m4a`, `audio/mp4`, …).
 */
export function normalizeSarvamAudioMime(mimeType: string | undefined): string {
  const raw = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    raw === "audio/m4a" ||
    raw === "audio/aac" ||
    raw === "audio/x-aac" ||
    raw === "audio/mp4a-latm"
  ) {
    return "audio/x-m4a";
  }
  if (!raw || raw === "application/octet-stream") {
    return "audio/mp4";
  }
  return raw;
}

function extensionForMime(mimeType: string): string {
  const t = String(mimeType || "").toLowerCase();
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("mp4") || t.includes("m4a")) return "m4a";
  if (t.includes("aac")) return "aac";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("flac")) return "flac";
  if (t.includes("webm")) return "webm";
  return "wav";
}

function extractChatContent(payload: unknown): string {
  const body = payload as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return String(body.choices?.[0]?.message?.content || "").trim();
}

export async function sarvamChatJson(options: {
  systemInstruction: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const response = await fetch(`${SARVAM_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: subscriptionHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: config.sarvamModel || "sarvam-105b",
        messages: [
          { role: "system", content: options.systemInstruction },
          { role: "user", content: options.prompt },
        ],
        max_tokens: options.maxOutputTokens ?? 512,
        temperature: 0.2,
        reasoning_effort: null,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Sarvam chat failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as unknown;
    const text = extractChatContent(payload);
    if (!text) throw new Error("Empty AI response");
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Sarvam chat timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function sarvamTranscribeAudio(options: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const mimeType = normalizeSarvamAudioMime(options.mimeType);
  const bytes = new Uint8Array(Buffer.from(options.audioBase64, "base64"));
  if (!bytes.byteLength) return "";

  const form = new FormData();
  const filename = `speech.${extensionForMime(mimeType)}`;
  form.append("file", new File([bytes], filename, { type: mimeType }));
  form.append("model", config.sarvamSttModel || "saaras:v3");
  form.append("mode", "transcribe");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const response = await fetch(`${SARVAM_BASE}/speech-to-text`, {
      method: "POST",
      headers: subscriptionHeaders(),
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      if (looksLikeTooLongAudio(response.status, detail)) {
        throw new SarvamAudioTooLongError();
      }
      throw new Error(`Sarvam STT failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as { transcript?: string | null };
    return String(payload.transcript || "").trim();
  } catch (error) {
    if (error instanceof SarvamAudioTooLongError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Sarvam STT timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const LANGUAGE_CODES: Record<ResponseLanguage, "ta-IN" | "hi-IN" | "en-IN"> = {
  ta: "ta-IN",
  hi: "hi-IN",
  en: "en-IN",
};

export async function sarvamSynthesizeSpeech(options: {
  text: string;
  language: ResponseLanguage;
  pace?: number;
}): Promise<string> {
  const text = String(options.text || "").trim();
  if (!text) throw httpError("text is required", 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const response = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: "POST",
      headers: subscriptionHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        text,
        model: config.sarvamTtsModel || "bulbul:v3",
        speaker: String(config.sarvamTtsSpeaker || "priya").toLowerCase(),
        language_code: LANGUAGE_CODES[options.language],
        pace: options.pace ?? 1,
        output_audio_codec: "mp3",
        speech_sample_rate: 24000,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      if (response.status === 422 || /too long|2500/.test(detail.toLowerCase())) {
        throw httpError("text is too long to synthesize", 413);
      }
      throw httpError(`Speech synthesis failed (${response.status}): ${detail}`, 502);
    }
    const payload = (await response.json()) as { audios?: string[] };
    const audio = (payload.audios || []).join("").trim();
    if (!audio) throw httpError("Sarvam TTS returned no audio.", 502);
    return audio;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw httpError("Speech synthesis timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
