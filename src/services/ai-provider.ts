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

export function getActiveSttModelName(): string {
  if (getAiProvider() === "sarvam") {
    return config.sarvamSttModel || "saaras:v3";
  }
  if (config.googleSttProvider === "cloud") {
    return `cloud:${config.googleCloudSttModel || "latest_short"}`;
  }
  return config.geminiSttModel || config.geminiModel || "gemini-2.5-flash-lite";
}

export function getActiveTtsModelName(): string {
  if (getAiProvider() === "sarvam") {
    return `${config.sarvamTtsModel || "bulbul:v3"}/${config.sarvamTtsSpeaker || "priya"}`;
  }
  const voices = [config.ttsVoices.ta, config.ttsVoices.hi, config.ttsVoices.en]
    .filter(Boolean)
    .join(",") || "locale-female";
  return `cloud-tts(${voices});fallback=${config.geminiTtsModel || "gemini-2.5-flash-preview-tts"}/${config.geminiTtsVoice || "Kore"}`;
}

/** One-line ops dump of the active chat / STT / TTS stack. */
export function getSpeechStackSummary(): string {
  return [
    `provider=${getAiProvider()}`,
    `chat=${getActiveAiModelName()}`,
    `stt=${getActiveSttModelName()}`,
    `tts=${getActiveTtsModelName()}`,
  ].join(" ");
}

export function requireAiConfigured(): void {
  if (isAiConfigured()) return;
  if (getAiProvider() === "sarvam") {
    throw new Error("SARVAM_API_KEY is not configured");
  }
  throw new Error("GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY is not configured");
}

/** Staff/Genie should skip device TTS and play server AI audio for every line. */
export function prefersServerTts(): boolean {
  return true;
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
