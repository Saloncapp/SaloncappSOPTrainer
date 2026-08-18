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
  corsOrigin: process.env.CORS_ORIGIN || "*",
  videoCompletionRatio: 0.95,
  assessmentQuestionCount: Math.max(
    1,
    Number(process.env.ASSESSMENT_QUESTION_COUNT || 5) || 5,
  ),
  assessmentTimeLimitSeconds: Number(process.env.ASSESSMENT_TIME_LIMIT_SECONDS || 300),
};
