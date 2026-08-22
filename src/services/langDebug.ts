const PREFIX = "[lang-debug][trainer]";

export function detectSpeechScript(text: string): string {
  const value = String(text || "");
  if (!value.trim()) return "empty";
  const tamil = /[\u0B80-\u0BFF]/.test(value);
  const hindi = /[\u0900-\u097F]/.test(value);
  const latin = /[A-Za-z]/.test(value);
  if (tamil && hindi) return "tamil+devanagari";
  if (tamil && latin) return "tamil+latin";
  if (hindi && latin) return "devanagari+latin";
  if (tamil) return "tamil";
  if (hindi) return "devanagari";
  if (latin) return "latin";
  return "other";
}

export function speechPreview(text: string, max = 80): string {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function langLog(event: string, details: Record<string, unknown> = {}): void {
  console.log(PREFIX, event, details);
}
