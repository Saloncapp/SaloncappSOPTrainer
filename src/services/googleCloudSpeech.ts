import { config } from "../config";
import { retryOnce } from "./retryOnce";

const CLOUD_STT_URL = "https://speech.googleapis.com/v1/speech:recognize";
const CLOUD_STT_TIMEOUT_MS = 8000;
const CLOUD_RETRY_AFTER_MS = 10 * 60 * 1000;

export class CloudSttUnavailable extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "CloudSttUnavailable";
    this.retryable = retryable;
  }
}

let cloudUnavailableUntil = 0;

export function isCloudSttConfigured(): boolean {
  return Boolean(String(config.googleSttApiKey || "").trim());
}

export function isCloudSttReady(): boolean {
  return isCloudSttConfigured() && Date.now() >= cloudUnavailableUntil;
}

export function markCloudSttUnavailable(): void {
  cloudUnavailableUntil = Date.now() + CLOUD_RETRY_AFTER_MS;
}

/** Map Expo / browser MIME types onto Cloud Speech encodings when known. */
export function encodingForMime(mimeType: string | undefined): string | undefined {
  const raw = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (raw.includes("mpeg") || raw.includes("mp3")) return "MP3";
  if (raw.includes("flac")) return "FLAC";
  if (raw.includes("ogg")) return "OGG_OPUS";
  if (raw.includes("webm")) return "WEBM_OPUS";
  if (raw.includes("wav") || raw.includes("l16") || raw.includes("linear")) {
    return "LINEAR16";
  }
  if (raw.includes("amr-wb")) return "AMR_WB";
  if (raw.includes("amr")) return "AMR";
  // m4a / aac / mp4: omit encoding and let the API inspect the container.
  return undefined;
}

function recognitionConfig(mimeType: string | undefined): Record<string, unknown> {
  const encoding = encodingForMime(mimeType);
  const cfg: Record<string, unknown> = {
    languageCode: "en-IN",
    alternativeLanguageCodes: ["ta-IN", "hi-IN"],
    model: config.googleCloudSttModel || "latest_short",
    enableAutomaticPunctuation: true,
  };
  if (encoding) cfg.encoding = encoding;
  return cfg;
}

async function transcribeCloudSpeechOnce(options: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  const audio = String(options.audioBase64 || "").trim();
  if (!audio) return "";
  if (!isCloudSttConfigured()) {
    throw new CloudSttUnavailable("Google Cloud Speech-to-Text is not configured.", false);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_STT_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${CLOUD_STT_URL}?key=${encodeURIComponent(config.googleSttApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: recognitionConfig(options.mimeType),
          audio: { content: audio },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 400 || response.status === 403 || response.status === 404) {
        throw new CloudSttUnavailable(
          `Cloud STT unavailable (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`,
          false,
        );
      }
      throw new CloudSttUnavailable(
        `Cloud STT failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`,
        response.status >= 500 || response.status === 429,
      );
    }

    const body = (await response.json()) as {
      results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
    };
    const parts = (body.results || [])
      .map((result) => String(result.alternatives?.[0]?.transcript || "").trim())
      .filter(Boolean);
    return parts.join(" ").trim();
  } catch (error) {
    if (error instanceof CloudSttUnavailable) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CloudSttUnavailable("Cloud STT timed out.", true);
    }
    throw new CloudSttUnavailable(
      error instanceof Error ? error.message : "Cloud STT request failed.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeCloudSpeech(options: {
  audioBase64: string;
  mimeType: string;
}): Promise<string> {
  return retryOnce(() => transcribeCloudSpeechOnce(options));
}
