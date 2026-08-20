import assert from "node:assert/strict";
import test from "node:test";
import { hydrafacial } from "./hydrafacial";
import { resolveStepAudioUrl, trainingMedia } from "./trainingMedia";

test("trainingMedia has 10 muted-video steps with Tamil English Hindi audio placeholders", () => {
  for (let step = 1; step <= 10; step += 1) {
    const media = trainingMedia[step];
    assert.ok(media, `missing media for step ${step}`);
    assert.equal(typeof media.videoUrl, "string");
    assert.equal(typeof media.audio.ta, "string");
    assert.equal(typeof media.audio.en, "string");
    assert.equal(typeof media.audio.hi, "string");
  }
});

test("hydrafacial steps use trainingMedia video and audio", () => {
  assert.equal(hydrafacial.steps.length, 10);
  for (const step of hydrafacial.steps) {
    assert.equal(step.videoUrl, trainingMedia[step.stepNumber].videoUrl);
    assert.deepEqual(step.audio, trainingMedia[step.stepNumber].audio);
  }
});

test("resolveStepAudioUrl follows the selected language", () => {
  const audio = { ta: "https://ta.mp3", en: "https://en.mp3", hi: "https://hi.mp3" };
  assert.equal(resolveStepAudioUrl(audio, "ta"), "https://ta.mp3");
  assert.equal(resolveStepAudioUrl(audio, "en"), "https://en.mp3");
  assert.equal(resolveStepAudioUrl(audio, "hi"), "https://hi.mp3");
});
