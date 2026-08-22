import assert from "node:assert/strict";
import test from "node:test";
import { speechMatchesResponseLanguage } from "./responseLanguage";
import { localizeKnownTrainerSpeech } from "./trainerSpeechLocale";

test("welcome back localizes to Hindi Devanagari, not South Indian scripts", () => {
  const en =
    "Welcome back to HydraFacial training. You completed step 2, Cleanser (Using hands). Would you like to resume with step 3, Gentle Scrub / Exfoliation?";
  const hi = localizeKnownTrainerSpeech(en, "hi");
  assert.ok(hi);
  assert.match(hi, /वापस स्वागत/);
  assert.ok(speechMatchesResponseLanguage(hi, "hi"));
  assert.equal(speechMatchesResponseLanguage(hi, "ta"), false);
});

test("already-complete prompt localizes to Hindi", () => {
  const en =
    "This HydraFacial training is already complete. You can rewatch any step or ask a question. The assessment cannot be taken again.";
  const hi = localizeKnownTrainerSpeech(en, "hi");
  assert.ok(hi);
  assert.match(hi, /हिंदी|प्रशिक्षण|पूरा/);
  assert.ok(speechMatchesResponseLanguage(hi, "hi"));
});

test("Malayalam or Telugu text is not accepted as Hindi", () => {
  assert.equal(speechMatchesResponseLanguage("സ്വാഗതം", "hi"), false);
  assert.equal(speechMatchesResponseLanguage("స్వాగతం", "hi"), false);
  assert.equal(speechMatchesResponseLanguage("वापस स्वागत है", "hi"), true);
});

test("Tamil welcome uses Tamil script only", () => {
  const en = "Welcome back to HydraFacial training. You are on step 4, Suction Pen. Shall we continue?";
  const ta = localizeKnownTrainerSpeech(en, "ta");
  assert.ok(ta);
  assert.ok(speechMatchesResponseLanguage(ta, "ta"));
  assert.equal(speechMatchesResponseLanguage(ta, "hi"), false);
});
