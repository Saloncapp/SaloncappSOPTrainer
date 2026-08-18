export const RESPONSE_LANGUAGES = ["en", "ta", "hi"] as const;

export type ResponseLanguage = (typeof RESPONSE_LANGUAGES)[number];

const LANGUAGE_NAMES: Record<ResponseLanguage, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
};

export function normalizeResponseLanguage(value: unknown): ResponseLanguage {
  const code = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (code === "ta" || code === "ta-in" || code === "tamil") return "ta";
  if (code === "hi" || code === "hi-in" || code === "hindi") return "hi";
  if (code === "en" || code === "en-in" || code === "en-us" || code === "english") {
    return "en";
  }
  return "en";
}

export function responseLanguageName(code: ResponseLanguage): string {
  return LANGUAGE_NAMES[code];
}

export function multilingualUnderstandingRule(responseLanguage: ResponseLanguage): string {
  const name = responseLanguageName(responseLanguage);
  return [
    `response_language: ${name} (${responseLanguage})`,
    "Understand the user's message regardless of the language or combination of languages used.",
    "The staff may speak Tamil, English, Hindi, or mix them in the same sentence (code-switching).",
    `Always generate the final response in the currently selected response language: ${name}.`,
    "Do not assume that the detected input language is the desired response language.",
  ].join("\n");
}
