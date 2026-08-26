import assert from "node:assert/strict";
import test from "node:test";
import { localizeKnownTrainerSpeech } from "./trainerSpeechLocale";
import { speechMatchesResponseLanguage } from "./responseLanguage";

/**
 * Regression cover for the client-handling language switch. The session used to
 * persist the localized utterance and re-localize it on the next switch, but
 * localizing to English is a passthrough, so switching back from Tamil or Hindi
 * replayed the original non-English text with an English voice.
 */

const ENGLISH_SOURCE =
  "Welcome to Women Straight Finish training. We can begin with step 1, Hair Wash & Protection. Shall we start?";

function localize(text: string, language: "en" | "ta" | "hi"): string {
  if (language === "en") return text;
  return localizeKnownTrainerSpeech(text, language) ?? text;
}

test("localizing to English is a passthrough, so localized text cannot round-trip", () => {
  const tamil = localize(ENGLISH_SOURCE, "ta");
  assert.ok(speechMatchesResponseLanguage(tamil, "ta"));

  // Re-localizing the Tamil utterance to English returns the Tamil unchanged.
  assert.equal(localize(tamil, "en"), tamil);
  assert.equal(
    speechMatchesResponseLanguage(localize(tamil, "en"), "en"),
    false,
    "this is the defect: English playback would still be Tamil",
  );
});

test("re-localizing from the English source restores English on switch back", () => {
  const tamil = localize(ENGLISH_SOURCE, "ta");
  assert.ok(speechMatchesResponseLanguage(tamil, "ta"));

  const backToEnglish = localize(ENGLISH_SOURCE, "en");
  assert.equal(backToEnglish, ENGLISH_SOURCE);
  assert.ok(speechMatchesResponseLanguage(backToEnglish, "en"));
});

test("source-based switching survives a full ta -> hi -> en -> ta cycle", () => {
  const seen: string[] = [];
  for (const language of ["ta", "hi", "en", "ta"] as const) {
    const spoken = localize(ENGLISH_SOURCE, language);
    assert.ok(
      speechMatchesResponseLanguage(spoken, language),
      `expected ${language} script, got: ${spoken}`,
    );
    seen.push(spoken);
  }
  // Returning to Tamil reproduces the identical utterance, so the speech cache
  // keeps hitting instead of re-synthesizing a slightly different line.
  assert.equal(seen[0], seen[3]);
});
