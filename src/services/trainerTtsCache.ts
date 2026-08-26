import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import type { ResponseLanguage } from "./responseLanguage";

const MEMORY_LIMIT = 240;

export type CachedSpeech = {
  mimeType: string;
  /** Base64-encoded audio, in playback order. */
  segments: string[];
};

type Manifest = {
  mimeType: string;
  files: string[];
  provider?: string;
  createdAt: string;
};

const memory = new Map<string, CachedSpeech>();
let diskReady: Promise<boolean> | null = null;

export function speechCacheKey(language: ResponseLanguage, text: string): string {
  return `${language}-${createHash("sha1").update(text).digest("hex")}`;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "mp3";
}

function manifestPath(key: string): string {
  return path.join(config.ttsCacheDir, `${key}.json`);
}

/**
 * The cache is an optimisation, never a hard dependency — a read-only or
 * missing directory must not take speech down.
 */
async function ensureDisk(): Promise<boolean> {
  if (!diskReady) {
    diskReady = mkdir(config.ttsCacheDir, { recursive: true })
      .then(() => true)
      .catch((error) => {
        console.warn(
          `[tts-cache] disabled (${config.ttsCacheDir}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return false;
      });
  }
  return diskReady;
}

function readMemory(key: string): CachedSpeech | null {
  const hit = memory.get(key);
  if (!hit) return null;
  memory.delete(key);
  memory.set(key, hit);
  return hit;
}

function writeMemory(key: string, value: CachedSpeech): void {
  memory.set(key, value);
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next();
    if (oldest.done) break;
    memory.delete(oldest.value);
  }
}

export async function readSpeechCache(key: string): Promise<CachedSpeech | null> {
  const inMemory = readMemory(key);
  if (inMemory) return inMemory;
  if (!(await ensureDisk())) return null;

  try {
    const manifest = JSON.parse(
      await readFile(manifestPath(key), "utf8"),
    ) as Manifest;
    if (!manifest?.files?.length) return null;
    const segments: string[] = [];
    for (const file of manifest.files) {
      const buffer = await readFile(path.join(config.ttsCacheDir, file));
      segments.push(buffer.toString("base64"));
    }
    const value: CachedSpeech = { mimeType: manifest.mimeType, segments };
    writeMemory(key, value);
    return value;
  } catch {
    // Missing or corrupt entry: treat as a miss and re-synthesize.
    return null;
  }
}

export async function writeSpeechCache(
  key: string,
  value: CachedSpeech,
  provider: string,
): Promise<void> {
  writeMemory(key, value);
  if (!(await ensureDisk())) return;

  try {
    const extension = extensionFor(value.mimeType);
    const files: string[] = [];
    for (let i = 0; i < value.segments.length; i += 1) {
      const file = `${key}-${i}.${extension}`;
      await writeFile(
        path.join(config.ttsCacheDir, file),
        Buffer.from(value.segments[i], "base64"),
      );
      files.push(file);
    }
    const manifest: Manifest = {
      mimeType: value.mimeType,
      files,
      provider,
      createdAt: new Date().toISOString(),
    };
    await writeFile(manifestPath(key), JSON.stringify(manifest), "utf8");
  } catch (error) {
    console.warn(
      `[tts-cache] write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function hasSpeechCache(key: string): Promise<boolean> {
  if (memory.has(key)) return true;
  if (!(await ensureDisk())) return false;
  try {
    await readFile(manifestPath(key), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function speechCacheSize(): Promise<number> {
  if (!(await ensureDisk())) return memory.size;
  try {
    const entries = await readdir(config.ttsCacheDir);
    return entries.filter((name) => name.endsWith(".json")).length;
  } catch {
    return memory.size;
  }
}

export function clearSpeechMemoryCache(): void {
  memory.clear();
}
