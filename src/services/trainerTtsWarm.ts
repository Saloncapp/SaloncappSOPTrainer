import { config } from "../config";
import { listActiveSops } from "../data/sops";
import type { SopDefinition } from "../data/sops/types";
import { localizeTrainerSpeech } from "./gemini";
import type { ResponseLanguage } from "./responseLanguage";
import { isTrainerTtsConfigured, synthesizeTrainerSpeech } from "./trainerTts";
import { hasSpeechCache, speechCacheKey } from "./trainerTtsCache";
import { trainingModeFor } from "./trainingModes";

/** Bounded per boot so a cold cache cannot exhaust the daily API quota. */
const DEFAULT_WARM_LIMIT = 24;
const PAUSE_BETWEEN_MS = 400;

const WARM_LANGUAGES: ResponseLanguage[] = ["ta", "hi"];

type WarmLine = { text: string; language: ResponseLanguage; priority: number };

/**
 * Mirrors the welcome lines built in agentState.ts. These must match verbatim,
 * because the cache is keyed by a hash of the localized text.
 */
function welcomeLinesFor(sop: SopDefinition): Array<{ text: string; priority: number }> {
  const steps = [...(sop.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
  if (!steps.length) return [];
  const lines: Array<{ text: string; priority: number }> = [];

  const first = steps[0];
  lines.push({
    text: `Welcome to ${sop.title} training. We can begin with step ${first.stepNumber}, ${first.title}. Shall we start?`,
    priority: 0,
  });

  for (const step of steps) {
    lines.push({
      text: `Welcome back to ${sop.title} training. You are on step ${step.stepNumber}, ${step.title}. Shall we continue?`,
      priority: 1,
    });
  }

  for (let i = 1; i < steps.length; i += 1) {
    const previous = steps[i - 1];
    const step = steps[i];
    lines.push({
      text: `Welcome back to ${sop.title} training. You completed step ${previous.stepNumber}, ${previous.title}. Would you like to resume with step ${step.stepNumber}, ${step.title}?`,
      priority: 2,
    });
  }

  return lines;
}

/** The English trainer lines that are stable enough to pre-render. */
export function buildWarmSourceLines(): Array<{ text: string; priority: number }> {
  const lines: Array<{ text: string; priority: number }> = [];
  for (const sop of listActiveSops()) {
    // Client-handling openings are generated per session, so there is nothing
    // stable to pre-render for them.
    if (trainingModeFor(sop) !== "SOP_VIDEO") continue;
    lines.push(...welcomeLinesFor(sop));
  }
  return lines;
}

async function collectWarmLines(): Promise<WarmLine[]> {
  const lines: WarmLine[] = [];
  for (const { text, priority } of buildWarmSourceLines()) {
    for (const language of WARM_LANGUAGES) {
      const localized = await localizeTrainerSpeech({ text, responseLanguage: language });
      if (!localized) continue;
      lines.push({ text: localized, language, priority });
    }
  }
  // Entry prompts first: they are what a staff member hits on every open.
  return lines.sort((a, b) => a.priority - b.priority);
}

let warmRunning = false;

/**
 * Pre-renders the fixed trainer prompts so the common lines play instantly,
 * leaving synthesis latency only on dynamic replies. Runs in the background and
 * never blocks or fails startup.
 */
export async function warmTrainerSpeechCache(options: { limit?: number } = {}): Promise<void> {
  if (warmRunning || !config.ttsWarmOnStart || !isTrainerTtsConfigured()) return;
  warmRunning = true;

  const limit = Math.max(
    0,
    options.limit ?? Number(process.env.TTS_WARM_LIMIT || DEFAULT_WARM_LIMIT) ??
      DEFAULT_WARM_LIMIT,
  );
  if (!limit) {
    warmRunning = false;
    return;
  }

  const startedAt = Date.now();
  let synthesized = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const lines = await collectWarmLines();
    for (const line of lines) {
      if (synthesized >= limit) break;
      if (await hasSpeechCache(speechCacheKey(line.language, line.text))) {
        skipped += 1;
        continue;
      }
      try {
        await synthesizeTrainerSpeech({ text: line.text, language: line.language });
        synthesized += 1;
      } catch (error) {
        failed += 1;
        // Quota or transient errors should not abort the remaining warm-up.
        console.warn(
          `[tts-warm] ${line.language} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (failed >= 3) break;
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_MS));
    }
    console.log(
      `[tts-warm] done in ${Date.now() - startedAt}ms (synthesized=${synthesized} cached=${skipped} failed=${failed})`,
    );
  } catch (error) {
    console.warn(
      `[tts-warm] aborted: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    warmRunning = false;
  }
}
