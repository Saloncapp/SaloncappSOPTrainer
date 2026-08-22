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
  const script =
    responseLanguage === "hi"
      ? "Write Hindi in Devanagari script only. Never use Tamil, Telugu, Malayalam, or Kannada."
      : responseLanguage === "ta"
        ? "Write Tamil in Tamil script only. Never use Hindi, Telugu, Malayalam, or Kannada."
        : "Write English using the Latin alphabet.";
  return [
    `response_language: ${name} (${responseLanguage})`,
    "Understand the user's message regardless of the language or combination of languages used.",
    "The staff may speak Tamil, English, Hindi, or mix them in the same sentence (code-switching).",
    `Always generate the final response in the currently selected response language: ${name}.`,
    script,
    "Do not assume that the detected input language is the desired response language.",
  ].join("\n");
}

const SCRIPT = {
  devanagari: /[\u0900-\u097F]/,
  tamil: /[\u0B80-\u0BFF]/,
  telugu: /[\u0C00-\u0C7F]/,
  kannada: /[\u0C80-\u0CFF]/,
  malayalam: /[\u0D00-\u0D7F]/,
};

export function speechMatchesResponseLanguage(
  text: string,
  responseLanguage: ResponseLanguage,
): boolean {
  const value = String(text || "");
  if (!value.trim()) return false;
  if (responseLanguage === "en") {
    return !SCRIPT.devanagari.test(value) && !SCRIPT.tamil.test(value);
  }
  if (responseLanguage === "hi") {
    return (
      SCRIPT.devanagari.test(value) &&
      !SCRIPT.tamil.test(value) &&
      !SCRIPT.telugu.test(value) &&
      !SCRIPT.kannada.test(value) &&
      !SCRIPT.malayalam.test(value)
    );
  }
  return (
    SCRIPT.tamil.test(value) &&
    !SCRIPT.devanagari.test(value) &&
    !SCRIPT.telugu.test(value) &&
    !SCRIPT.kannada.test(value) &&
    !SCRIPT.malayalam.test(value)
  );
}
