import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4010),
  mongodbUri: required(
    "MONGODB_URI",
    "mongodb://127.0.0.1:27017/saloncapp_sop_trainer",
  ),
  nextAuthSecret: required("NEXTAUTH_SECRET", "dev-secret-change-me"),
  geminiApiKey:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  // Independent of GEMINI_MODEL so STT can stay on a faster multimodal model.
  geminiSttModel:
    process.env.GEMINI_STT_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash-lite",
  // gemini (default, multimodal generateContent) | cloud (Google Cloud Speech-to-Text).
  googleSttProvider:
    String(process.env.GOOGLE_STT_PROVIDER || "gemini").trim().toLowerCase() ===
    "cloud"
      ? ("cloud" as const)
      : ("gemini" as const),
  googleCloudSttModel: process.env.GOOGLE_CLOUD_STT_MODEL || "latest_short",
  googleSttApiKey:
    process.env.GOOGLE_STT_API_KEY ||
    process.env.GOOGLE_TTS_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    "",
  // google | sarvam. Unset or any other value keeps the current Google path.
  aiProvider: process.env.AI_PROVIDER || "google",
  sarvamApiKey: process.env.SARVAM_API_KEY || "",
  sarvamModel: process.env.SARVAM_MODEL || "sarvam-105b",
  sarvamSttModel: process.env.SARVAM_STT_MODEL || "saaras:v3",
  sarvamTtsModel: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
  sarvamTtsSpeaker: process.env.SARVAM_TTS_SPEAKER || "priya",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  // Cloud Text-to-Speech accepts the same Google API key as Gemini once the
  // "Cloud Text-to-Speech API" is enabled on the project.
  ttsApiKey:
    process.env.GOOGLE_TTS_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    "",
  ttsVoices: {
    ta: process.env.TTS_VOICE_TA || "",
    hi: process.env.TTS_VOICE_HI || "",
    en: process.env.TTS_VOICE_EN || "",
  },
  // Fallback provider for projects without Cloud Text-to-Speech enabled.
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
  geminiTtsVoice: process.env.GEMINI_TTS_VOICE || "Kore",
  // Synthesized audio is cached here so a line is only ever paid for once.
  // In production point this at a path that survives releases.
  ttsCacheDir:
    process.env.TTS_CACHE_DIR || path.join(process.cwd(), ".cache", "tts"),
  ttsWarmOnStart: process.env.TTS_WARM_ON_START !== "false",
  ttsChunkConcurrency: Math.min(
    6,
    Math.max(1, Number(process.env.TTS_CHUNK_CONCURRENCY || 3) || 3),
  ),
  videoCompletionRatio: 0.95,
  assessmentQuestionCount: Math.max(
    1,
    Number(process.env.ASSESSMENT_QUESTION_COUNT || 5) || 5,
  ),
  assessmentTimeLimitSeconds: Number(process.env.ASSESSMENT_TIME_LIMIT_SECONDS || 300),
};
