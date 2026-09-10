import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import {
  getActiveAiModelName,
  getAiProvider,
  isAiConfigured,
  requireAiConfigured,
} from "./ai-provider";
import { looksLikeEmptyOrNoiseTranscript } from "./agentIntents";
import { langLog } from "./langDebug";
import {
  SarvamAudioTooLongError,
  sarvamChatJson,
  sarvamTranscribeAudio,
} from "./sarvam-client";

const AI_TIMEOUT_MS = 45000;
const MAX_AUDIO_BASE64_CHARS = 8_000_000;

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  requireAiConfigured();
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return geminiClient;
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t.trim();
}

function repairTruncatedJson(text: string): string {
  let t = text.trim();
  if (!t) return t;
  const quotes = (t.match(/"/g) || []).length;
  if (quotes % 2 === 1) t += '"';
  const openBrackets = (t.match(/\[/g) || []).length;
  const closeBrackets = (t.match(/]/g) || []).length;
  if (openBrackets > closeBrackets) t += "]".repeat(openBrackets - closeBrackets);
  const openBraces = (t.match(/{/g) || []).length;
  const closeBraces = (t.match(/}/g) || []).length;
  if (openBraces > closeBraces) t += "}".repeat(openBraces - closeBraces);
  return t;
}

export function parseModelJson(text: string): unknown {
  const stripped = stripJsonFences(text);
  const candidates = [stripped];
  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart >= 0) {
    if (objectEnd > objectStart) {
      candidates.push(stripped.slice(objectStart, objectEnd + 1));
    }
    candidates.push(repairTruncatedJson(stripped.slice(objectStart)));
  }
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Empty AI response");
}

function extractGeminiText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  if (typeof r.text === "string" && r.text.trim()) {
    return r.text.trim();
  }
  let text = "";
  for (const part of r.candidates?.[0]?.content?.parts ?? []) {
    if (typeof part.text === "string" && !part.thought) {
      text += part.text;
    }
  }
  return text.trim();
}

function logAiMs(label: string, startedAt: number): void {
  console.log(
    `[agent-latency] ${getAiProvider()} ${getActiveAiModelName()} ${label} ${Date.now() - startedAt}ms`,
  );
}

export type GenerateAiJsonOptions = {
  prompt: string;
  systemInstruction: string;
  maxOutputTokens?: number;
};

async function generateGeminiJson(options: GenerateAiJsonOptions): Promise<unknown> {
  const ai = getGeminiClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: options.prompt,
      config: {
        systemInstruction: options.systemInstruction,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
        maxOutputTokens: options.maxOutputTokens ?? 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = extractGeminiText(response);
    if (!text) throw new Error("Empty AI response");
    return parseModelJson(text);
  } finally {
    clearTimeout(timer);
  }
}

async function generateSarvamJson(options: GenerateAiJsonOptions): Promise<unknown> {
  requireAiConfigured();
  const text = await sarvamChatJson({
    systemInstruction: options.systemInstruction,
    prompt: options.prompt,
    maxOutputTokens: options.maxOutputTokens ?? 512,
  });
  return parseModelJson(text);
}

export async function generateAiJson(options: GenerateAiJsonOptions): Promise<unknown> {
  requireAiConfigured();
  const startedAt = Date.now();
  try {
    if (getAiProvider() === "sarvam") {
      return await generateSarvamJson(options);
    }
    return await generateGeminiJson(options);
  } finally {
    logAiMs("json", startedAt);
  }
}

export type GenerateAiJsonFromAudioOptions = GenerateAiJsonOptions & {
  audioBase64: string;
  mimeType: string;
};

async function generateGeminiJsonFromAudio(
  options: GenerateAiJsonFromAudioOptions,
): Promise<unknown> {
  const ai = getGeminiClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: options.audioBase64,
                mimeType: options.mimeType,
              },
            },
            { text: options.prompt },
          ],
        },
      ],
      config: {
        systemInstruction: options.systemInstruction,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
        maxOutputTokens: options.maxOutputTokens ?? 256,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = extractGeminiText(response);
    if (!text) throw new Error("Empty AI response");
    return parseModelJson(text);
  } finally {
    clearTimeout(timer);
  }
}

function emptyAudioJson(): unknown {
  return { transcript: "", emptyOrNoise: true };
}

async function generateSarvamJsonFromAudio(
  options: GenerateAiJsonFromAudioOptions,
): Promise<unknown> {
  requireAiConfigured();
  let transcript: string;
  try {
    transcript = await sarvamTranscribeAudio({
      audioBase64: options.audioBase64,
      mimeType: options.mimeType,
    });
  } catch (error) {
    if (error instanceof SarvamAudioTooLongError) {
      langLog("stt.sarvam.too-long", { error: error.message });
      return emptyAudioJson();
    }
    throw error;
  }

  const emptyOrNoise =
    !transcript || looksLikeEmptyOrNoiseTranscript(transcript);
  if (emptyOrNoise) {
    return { transcript: transcript || "", emptyOrNoise: true };
  }

  const prompt = `Staff audio transcript (do not translate; keep original languages):\n${JSON.stringify(transcript)}\n\n${options.prompt}`;
  const parsed = await generateSarvamJson({
    systemInstruction: options.systemInstruction,
    prompt,
    maxOutputTokens: options.maxOutputTokens ?? 256,
  });
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      ...(parsed as Record<string, unknown>),
      transcript,
      emptyOrNoise: false,
    };
  }
  return { transcript, emptyOrNoise: false };
}

export async function generateAiJsonFromAudio(
  options: GenerateAiJsonFromAudioOptions,
): Promise<unknown> {
  requireAiConfigured();
  if (options.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new Error("Audio payload too large");
  }
  const startedAt = Date.now();
  try {
    if (getAiProvider() === "sarvam") {
      return await generateSarvamJsonFromAudio(options);
    }
    return await generateGeminiJsonFromAudio(options);
  } finally {
    logAiMs("audio", startedAt);
  }
}

export async function transcribeAiAudio(options: {
  audioBase64: string;
  mimeType: string;
}): Promise<{ transcript: string; emptyOrNoise: boolean }> {
  requireAiConfigured();
  if (options.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new Error("Audio payload too large");
  }
  const startedAt = Date.now();
  try {
    if (getAiProvider() === "sarvam") {
      try {
        const transcript = await sarvamTranscribeAudio(options);
        const emptyOrNoise =
          !transcript || looksLikeEmptyOrNoiseTranscript(transcript);
        return { transcript: transcript || "", emptyOrNoise };
      } catch (error) {
        if (error instanceof SarvamAudioTooLongError) {
          langLog("stt.sarvam.too-long", { error: error.message });
          return { transcript: "", emptyOrNoise: true };
        }
        throw error;
      }
    }

    const parsed = (await generateGeminiJsonFromAudio({
      prompt: `
Transcribe the HUMAN speech. Tamil, English, Hindi, or mixed is allowed.
Transcribe in the original languages. Do not translate.
If silence or noise only, transcript must be "" and emptyOrNoise true.
Do not invent words.
Return JSON:
{ "transcript": "", "emptyOrNoise": false }
`,
      systemInstruction: "Return valid JSON only.",
      audioBase64: options.audioBase64,
      mimeType: options.mimeType,
      maxOutputTokens: 160,
    })) as { transcript?: string; emptyOrNoise?: boolean };
    const transcript = String(parsed.transcript || "").trim();
    return {
      transcript,
      emptyOrNoise:
        Boolean(parsed.emptyOrNoise) || looksLikeEmptyOrNoiseTranscript(transcript),
    };
  } finally {
    logAiMs("stt", startedAt);
  }
}

export { getActiveAiModelName, getAiProvider, isAiConfigured };
