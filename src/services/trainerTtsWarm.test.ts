import assert from "node:assert/strict";
import test from "node:test";
import { speechMatchesResponseLanguage } from "./responseLanguage";
import { localizeKnownTrainerSpeech } from "./trainerSpeechLocale";
import { buildWarmSourceLines } from "./trainerTtsWarm";

test("there are warm lines to pre-render", () => {
  const lines = buildWarmSourceLines();
  assert.ok(lines.length > 0);
  assert.ok(lines.some((line) => line.priority === 0), "entry prompts exist");
});

/**
 * Warming is keyed by a hash of the localized text, so every warm line must
 * localize offline through a known template. Anything falling through to Gemini
 * would be reworded per call and never hit the cache at runtime.
 */
test("every warm line localizes offline via a known template", () => {
  for (const { text } of buildWarmSourceLines()) {
    for (const language of ["ta", "hi"] as const) {
      const localized = localizeKnownTrainerSpeech(text, language);
      assert.ok(localized, `no template matched for ${language}: ${text}`);
      assert.ok(
        speechMatchesResponseLanguage(localized, language),
        `wrong script for ${language}: ${localized}`,
      );
    }
  }
});

test("localization is deterministic, so cache keys stay stable", () => {
  for (const { text } of buildWarmSourceLines().slice(0, 5)) {
    assert.equal(
      localizeKnownTrainerSpeech(text, "ta"),
      localizeKnownTrainerSpeech(text, "ta"),
    );
  }
});

test("warm lines leave no untranslated English training or step names", () => {
  for (const { text } of buildWarmSourceLines()) {
    const ta = localizeKnownTrainerSpeech(text, "ta");
    assert.ok(ta);
    assert.doesNotMatch(ta, /HydraFacial|Women Straight Finish/);
  }
});
