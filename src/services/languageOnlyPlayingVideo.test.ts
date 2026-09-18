import assert from "node:assert/strict";
import test from "node:test";
import { languageOnlyReduceWhilePlayingVideo } from "./languageOnlyPlayingVideo";

test("language-only during play-video intro keeps play_video instead of idle", () => {
  const reduced = languageOnlyReduceWhilePlayingVideo({
    phase: "playing_video",
    currentStepNumber: 1,
    reviewStepNumber: null,
    navigationOffered: false,
    lastActionStepNumber: 1,
    lastSpokenText:
      "Got it. I'll play the Step 1 training video now. Please watch carefully.",
  });

  assert.equal(reduced.action.type, "play_video");
  if (reduced.action.type === "play_video") {
    assert.equal(reduced.action.stepNumber, 1);
  }
  assert.equal(reduced.speak, true);
  assert.match(reduced.spokenText, /Step 1/i);
  assert.equal(reduced.expectedInput, "none");
  assert.equal(reduced.snapshot.phase, "playing_video");
});

test("language-only during review uses the review step number", () => {
  const reduced = languageOnlyReduceWhilePlayingVideo({
    phase: "playing_review",
    currentStepNumber: 3,
    reviewStepNumber: 2,
    navigationOffered: false,
    lastSpokenText: "Let's rewatch Step 2.",
  });

  assert.equal(reduced.action.type, "play_video");
  if (reduced.action.type === "play_video") {
    assert.equal(reduced.action.stepNumber, 2);
  }
  assert.equal(reduced.snapshot.phase, "playing_review");
});

test("language-only with empty intro still returns play_video without speaking", () => {
  const reduced = languageOnlyReduceWhilePlayingVideo({
    phase: "playing_video",
    currentStepNumber: 4,
    reviewStepNumber: null,
    navigationOffered: false,
    lastSpokenText: "   ",
  });

  assert.deepEqual(reduced.action, { type: "play_video", stepNumber: 4 });
  assert.equal(reduced.speak, false);
  assert.equal(reduced.spokenText, "");
});
