import { config } from "../config";

export type AiProvider = "google" | "sarvam";

export function parseAiProvider(value: unknown): AiProvider {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "sarvam" ? "sarvam" : "google";
}

export function getAiProvider(): AiProvider {
  return parseAiProvider(config.aiProvider);
}

export function isAiConfigured(): boolean {
  if (getAiProvider() === "sarvam") {
    return Boolean(config.sarvamApiKey);
  }
  return Boolean(config.geminiApiKey);
}

export function getActiveAiModelName(): string {
  if (getAiProvider() === "sarvam") {
    return config.sarvamModel || "sarvam-105b";
  }
  return config.geminiModel || "gemini-2.5-flash-lite";
}

export function requireAiConfigured(): void {
  if (isAiConfigured()) return;
  if (getAiProvider() === "sarvam") {
    throw new Error("SARVAM_API_KEY is not configured");
  }
  throw new Error("GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY is not configured");
}

/** Staff app should skip device TTS and play Sarvam/server audio for every line. */
export function prefersServerTts(): boolean {
  return getAiProvider() === "sarvam";
}

export function ttsClientHints(): {
  preferServerTts: boolean;
  aiProvider: AiProvider;
} {
  return {
    preferServerTts: prefersServerTts(),
    aiProvider: getAiProvider(),
  };
}
