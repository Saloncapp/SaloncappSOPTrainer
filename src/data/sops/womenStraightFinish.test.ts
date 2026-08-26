import assert from "node:assert/strict";
import test from "node:test";
import { getActiveSopBySlug, getSopBySlug, listActiveSops } from "./index";
import { hydrafacial } from "./hydrafacial";
import { womenStraightFinish } from "./womenStraightFinish";
import { womenStraightFinishMedia } from "./womenStraightFinishMedia";
import { womenStraightFinishStepLocales } from "./womenStraightFinishLocales";
import { trainingMedia } from "./trainingMedia";
import { resolveSopStepCopy } from "./types";
import { trainingModeFor } from "../../services/trainingModes";
import { postWatchPrompt } from "../../services/agentState";
import type { AgentContext } from "../../services/agentTypes";

test("women-straight-finish is registered and active", () => {
  const sop = getActiveSopBySlug("women-straight-finish");
  assert.ok(sop);
  assert.equal(sop?.slug, "women-straight-finish");
  assert.equal(sop?.title, "Women Straight Finish");
  assert.equal(sop?.isActive, true);
  assert.ok(listActiveSops().some((item) => item.slug === "women-straight-finish"));
  assert.equal(getSopBySlug("women-straight-finish"), sop);
});

test("women-straight-finish has exactly four ordered steps from the SOP", () => {
  assert.equal(womenStraightFinish.steps.length, 4);
  assert.deepEqual(
    womenStraightFinish.steps.map((step) => step.title),
    [
      "Hair Wash & Protection",
      "4-Sectioning & Blow Dry",
      "Ironing Technique & Grip",
      "Crown Box-Sectioning",
    ],
  );
  assert.deepEqual(
    womenStraightFinish.steps.map((step) => step.stepNumber),
    [1, 2, 3, 4],
  );
});

test("women-straight-finish has English Tamil Hindi SOP copy", () => {
  for (const step of womenStraightFinish.steps) {
    assert.ok(step.description.trim());
    assert.ok(step.importantPoints.length > 0);
    const ta = womenStraightFinishStepLocales[step.stepNumber]?.ta;
    const hi = womenStraightFinishStepLocales[step.stepNumber]?.hi;
    assert.ok(ta?.description, `Tamil missing for step ${step.stepNumber}`);
    assert.ok(hi?.description, `Hindi missing for step ${step.stepNumber}`);
    assert.equal(ta?.importantPoints.length, step.importantPoints.length);
    assert.equal(hi?.importantPoints.length, step.importantPoints.length);

    const en = resolveSopStepCopy(step, "en");
    const taCopy = resolveSopStepCopy(step, "ta");
    const hiCopy = resolveSopStepCopy(step, "hi");
    assert.equal(en.description, step.description);
    assert.notEqual(taCopy.description, en.description);
    assert.notEqual(hiCopy.description, en.description);
  }
});

test("women-straight-finish media is real Cloudinary URLs, never Hydrafacial", () => {
  for (let step = 1; step <= 4; step += 1) {
    const media = womenStraightFinishMedia[step];
    assert.ok(media);
    assert.match(media.videoUrl, /^https:\/\/res\.cloudinary\.com\/saloncapp-production\/.+\.mp4$/);
    assert.match(media.audio.ta, /^https:\/\/res\.cloudinary\.com\/saloncapp-production\/.+\.mp3$/);
    assert.match(media.audio.en, /^https:\/\/res\.cloudinary\.com\/saloncapp-production\/.+\.mp3$/);
    assert.match(media.audio.hi, /^https:\/\/res\.cloudinary\.com\/saloncapp-production\/.+\.mp3$/);
  }
  for (const step of womenStraightFinish.steps) {
    assert.equal(step.videoUrl, womenStraightFinishMedia[step.stepNumber].videoUrl);
    assert.deepEqual(step.audio, womenStraightFinishMedia[step.stepNumber].audio);
    assert.notEqual(step.videoUrl, trainingMedia[step.stepNumber]?.videoUrl);
  }
});

test("women-straight-finish uses SOP_VIDEO mode", () => {
  assert.equal(trainingModeFor(womenStraightFinish), "SOP_VIDEO");
});

test("completion guidance is spoken only when present; Hydrafacial prompts unchanged", () => {
  const hydraCtx: AgentContext = {
    trainingTitle: hydrafacial.title,
    steps: hydrafacial.steps.map((step) => ({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      importantPoints: step.importantPoints,
      videoUrl: step.videoUrl,
      videoDurationSeconds: step.videoDurationSeconds,
    })),
    completedStepNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    currentStepVideoCompleted: true,
    status: "in_progress",
    allStepsCompleted: true,
  };
  assert.equal(
    postWatchPrompt(hydraCtx, 10),
    "Step 10, SPF, is complete. Ask doubts, rewatch it, revisit an earlier step, or start the assessment.",
  );

  assert.ok(womenStraightFinish.completionGuidance?.includes("silky"));
  const wsfCtx: AgentContext = {
    trainingTitle: womenStraightFinish.title,
    steps: womenStraightFinish.steps.map((step) => ({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      importantPoints: step.importantPoints,
      videoUrl: step.videoUrl,
      videoDurationSeconds: step.videoDurationSeconds,
    })),
    completedStepNumbers: [1, 2, 3, 4],
    currentStepVideoCompleted: true,
    status: "in_progress",
    allStepsCompleted: true,
    completionGuidance: womenStraightFinish.completionGuidance,
  };
  const last = postWatchPrompt(wsfCtx, 4);
  assert.match(last, /Crown Box-Sectioning/);
  assert.match(last, /silky/);
  assert.match(last, /start the assessment/);
});
