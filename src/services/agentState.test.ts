import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrap,
  reconcileForServiceEntry,
  reduceAgent,
  wantsAssessmentStart,
} from "./agentState";
import type { AgentContext, AgentSnapshot, ParsedIntent } from "./agentTypes";

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  const steps = [
    {
      stepNumber: 1,
      title: "Foamy Gel Cleanser",
      description: "Using hands.",
      importantPoints: [],
      videoUrl: "https://example.com/1.mp4",
      videoDurationSeconds: 15,
    },
    {
      stepNumber: 2,
      title: "Suction Pen",
      description: "",
      importantPoints: ["Mixing Ratio: 1:10"],
      videoUrl: "https://example.com/2.mp4",
      videoDurationSeconds: 15,
    },
  ];
  return {
    trainingTitle: "HydraFacial",
    steps,
    completedStepNumbers: [],
    currentStepVideoCompleted: false,
    status: "in_progress",
    allStepsCompleted: false,
    ...overrides,
  };
}

function snap(overrides: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    phase: "welcome",
    currentStepNumber: 1,
    reviewStepNumber: null,
    navigationOffered: false,
    ...overrides,
  };
}

const welcome = snap();

function voice(intent: ParsedIntent, snapshot = welcome, context = ctx()) {
  return reduceAgent(snapshot, { type: "voice", intent }, context, "previous");
}

test("bootstrap welcomes at the first incomplete step", () => {
  const result = bootstrap(null, ctx());
  assert.equal(result.snapshot.phase, "welcome");
  assert.equal(result.action.type, "listen");
  assert.match(result.spokenText, /step 1/i);
});

test("reconcile after step 1 complete targets step 2 welcome", () => {
  const stale = snap({ phase: "playing_video", currentStepNumber: 1 });
  const reconciled = reconcileForServiceEntry(
    stale,
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: false }),
  );
  assert.equal(reconciled.phase, "welcome");
  assert.equal(reconciled.currentStepNumber, 2);

  const result = bootstrap(reconciled, ctx({ completedStepNumbers: [1] }));
  assert.equal(result.snapshot.phase, "welcome");
  assert.equal(result.snapshot.currentStepNumber, 2);
  assert.match(result.spokenText, /completed step 1/i);
  assert.match(result.spokenText, /resume with step 2/i);
});

test("confirming resume welcome starts step 2 video", () => {
  const resume = snap({ phase: "welcome", currentStepNumber: 2 });
  const result = reduceAgent(
    resume,
    { type: "voice", intent: { type: "confirm" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: false }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 2 });
  assert.match(result.spokenText, /step 2/i);
});

test("reconcile preserves assessment and failed recovery entry states", () => {
  const assessment = reconcileForServiceEntry(
    snap({ phase: "post_video", currentStepNumber: 2 }),
    ctx({
      allStepsCompleted: true,
      status: "ready_for_assessment",
      completedStepNumbers: [1, 2],
    }),
  );
  assert.equal(assessment.phase, "awaiting_assessment");

  const failed = reconcileForServiceEntry(
    snap({ phase: "post_review", currentStepNumber: 2, reviewStepNumber: 1 }),
    ctx({
      allStepsCompleted: true,
      status: "failed_retraining",
      completedStepNumbers: [1, 2],
    }),
  );
  assert.equal(failed.phase, "failed_recovery");
});

test("interrupted step remains the resume target", () => {
  const interrupted = reconcileForServiceEntry(
    snap({ phase: "playing_video", currentStepNumber: 2 }),
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: false }),
  );
  assert.equal(interrupted.phase, "welcome");
  assert.equal(interrupted.currentStepNumber, 2);
});

test("confirming welcome starts the current step video", () => {
  const result = voice({ type: "confirm" });
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 1 });
  assert.match(result.spokenText, /step 1/i);
  assert.doesNotMatch(result.spokenText, /using hands/i);
});

test("next is rejected until the video is fully completed", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 1 });
  const result = reduceAgent(
    post,
    { type: "voice", intent: { type: "next" } },
    ctx({ currentStepVideoCompleted: false, completedStepNumbers: [] }),
    "done?",
  );
  assert.equal(result.snapshot.phase, "post_video");
  assert.match(result.spokenText, /finish watching/i);
  assert.equal(result.action.type, "listen");
});

test("video complete after a full watch asks about doubts first", () => {
  const playing = snap({ phase: "playing_video", currentStepNumber: 1 });
  const result = reduceAgent(
    playing,
    { type: "video_complete", stepNumber: 1 },
    ctx({ currentStepVideoCompleted: true, completedStepNumbers: [1] }),
  );
  assert.equal(result.snapshot.phase, "post_video");
  assert.equal(result.snapshot.navigationOffered, false);
  assert.equal(result.expectedInput, "doubt_or_navigate");
  assert.equal(result.action.type, "listen");
  assert.match(result.spokenText, /ask doubts/i);
  assert.match(result.spokenText, /next step/i);
  assert.doesNotMatch(result.spokenText, /assessment/i);
});

test("video complete waits for persisted step completion before post_video", () => {
  const playing = snap({ phase: "playing_video", currentStepNumber: 2 });
  const result = reduceAgent(
    playing,
    { type: "video_complete", stepNumber: 2 },
    ctx({ currentStepVideoCompleted: true, completedStepNumbers: [1] }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 2 });
  assert.equal(result.speak, false);
});

test("no doubts after a completed step plays the next video", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 1 });
  const result = reduceAgent(
    post,
    { type: "voice", intent: { type: "no_doubt" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 2 });
});

test("doubt answer keeps listening for more questions", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 1 });
  const result = reduceAgent(
    post,
    { type: "doubt_answered", answerText: "Use gentle circular motions with your hands." },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(result.snapshot.phase, "post_video");
  assert.equal(result.snapshot.navigationOffered, false);
  assert.equal(result.expectedInput, "doubt_or_navigate");
  assert.match(result.spokenText, /another question|next video|earlier step/i);
});

test("duplicate video complete stays on post_video", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 1 });
  const first = reduceAgent(
    post,
    { type: "video_complete", stepNumber: 1 },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  const second = reduceAgent(
    first.snapshot,
    { type: "video_complete", stepNumber: 1 },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(second.snapshot.phase, "post_video");
  assert.equal(second.action.type, "listen");
});

test("out-of-order video complete does not skip ahead", () => {
  const playing = snap({ phase: "playing_video", currentStepNumber: 1 });
  const result = reduceAgent(
    playing,
    { type: "video_complete", stepNumber: 2 },
    ctx({ currentStepVideoCompleted: true }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 1 });
  assert.equal(result.speak, false);
});

test("rewatch replays the same step", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 1 });
  const result = reduceAgent(
    post,
    { type: "voice", intent: { type: "rewatch" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 1 });
});

test("next after a completed step introduces step 2", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 1 });
  const result = reduceAgent(
    post,
    { type: "voice", intent: { type: "next" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 2 });
  assert.match(result.spokenText, /step 2/i);
  assert.doesNotMatch(result.spokenText, /mixing ratio|important points|using hands/i);
});

test("naming the next step after a completed video plays that video", () => {
  const steps = [
    ...ctx().steps,
    {
      stepNumber: 3,
      title: "Coco-Coffee Scrub",
      description: "Using hands first.",
      importantPoints: [],
      videoUrl: "https://example.com/3.mp4",
      videoDurationSeconds: 15,
    },
    {
      stepNumber: 4,
      title: "Extraction",
      description: "",
      importantPoints: [],
      videoUrl: "https://example.com/4.mp4",
      videoDurationSeconds: 15,
    },
  ];
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const context = ctx({
    steps,
    completedStepNumbers: [1, 2],
    currentStepVideoCompleted: true,
  });
  const nextNamed = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", stepNumber: 3, query: "play step 3 video" } },
    context,
  );
  assert.equal(nextNamed.snapshot.phase, "playing_video");
  assert.deepEqual(nextNamed.action, { type: "play_video", stepNumber: 3 });
  assert.doesNotMatch(nextNamed.spokenText, /comes later/i);

  const skipped = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", stepNumber: 4, query: "play step 4 video" } },
    context,
  );
  assert.equal(skipped.snapshot.phase, "post_video");
  assert.equal(skipped.action.type, "listen");
  assert.match(skipped.spokenText, /comes later/i);
  assert.match(skipped.spokenText, /continue with Step 3 first/i);
});

test("play step N after completing step N-1 plays the unlocked next video", () => {
  const steps = [
    ...ctx().steps,
    {
      stepNumber: 3,
      title: "Coco-Coffee Scrub",
      description: "Using hands first.",
      importantPoints: [],
      videoUrl: "https://example.com/3.mp4",
      videoDurationSeconds: 15,
    },
    {
      stepNumber: 4,
      title: "Extraction",
      description: "",
      importantPoints: [],
      videoUrl: "https://example.com/4.mp4",
      videoDurationSeconds: 15,
    },
  ];
  const post = snap({ phase: "post_video", currentStepNumber: 3 });
  const context = ctx({
    steps,
    completedStepNumbers: [1, 2, 3],
    currentStepVideoCompleted: true,
  });

  const byNext = reduceAgent(post, { type: "voice", intent: { type: "next" } }, context);
  assert.deepEqual(byNext.action, { type: "play_video", stepNumber: 4 });

  const byName = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", stepNumber: 4, query: "play step 4" } },
    context,
  );
  assert.equal(byName.snapshot.phase, "playing_video");
  assert.deepEqual(byName.action, { type: "play_video", stepNumber: 4 });
  assert.doesNotMatch(byName.spokenText, /comes later/i);
  assert.match(byName.spokenText, /step 4/i);

  // Stale cursor must not block an unlocked next step.
  const staleCursor = reduceAgent(
    snap({ phase: "post_video", currentStepNumber: 2 }),
    { type: "voice", intent: { type: "review", stepNumber: 4, query: "play step 4" } },
    context,
  );
  assert.deepEqual(staleCursor.action, { type: "play_video", stepNumber: 4 });
  assert.doesNotMatch(staleCursor.spokenText, /comes later/i);
});

test("previous step from a later video plays the prior step", () => {
  const steps = [
    ...ctx().steps,
    {
      stepNumber: 3,
      title: "Coco-Coffee Scrub",
      description: "Using hands first.",
      importantPoints: [],
      videoUrl: "https://example.com/3.mp4",
      videoDurationSeconds: 15,
    },
  ];
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const context = ctx({
    steps,
    completedStepNumbers: [1, 2],
    currentStepVideoCompleted: true,
  });
  const previous = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", query: "previous step", stepNumber: null } },
    context,
  );
  assert.equal(previous.snapshot.phase, "playing_review");
  assert.deepEqual(previous.action, { type: "play_video", stepNumber: 1 });
  assert.match(previous.spokenText, /step 1/i);
  assert.doesNotMatch(previous.spokenText, /comes later/i);

  const inferredLater = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", query: "previous step", stepNumber: 4 } },
    context,
  );
  assert.deepEqual(inferredLater.action, { type: "play_video", stepNumber: 1 });
  assert.doesNotMatch(inferredLater.spokenText, /comes later/i);

  const namedEarlier = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", query: "play step 1", stepNumber: 1 } },
    context,
  );
  assert.deepEqual(namedEarlier.action, { type: "play_video", stepNumber: 1 });
});

test("explicit play-step transcript wins over a stale current step", () => {
  const steps = [
    ...ctx().steps,
    {
      stepNumber: 3,
      title: "Coco-Coffee Scrub",
      description: "Using hands first.",
      importantPoints: [],
      videoUrl: "https://example.com/3.mp4",
      videoDurationSeconds: 15,
    },
    {
      stepNumber: 4,
      title: "Extraction",
      description: "",
      importantPoints: [],
      videoUrl: "https://example.com/4.mp4",
      videoDurationSeconds: 15,
    },
    {
      stepNumber: 7,
      title: "LED Mask",
      description: "",
      importantPoints: [],
      videoUrl: "https://example.com/7.mp4",
      videoDurationSeconds: 15,
    },
  ];
  const post = snap({ phase: "post_video", currentStepNumber: 7 });
  const context = ctx({
    steps,
    completedStepNumbers: [1, 2, 3, 4, 5, 6, 7],
    currentStepVideoCompleted: true,
  });
  const fromTranscript = reduceAgent(
    post,
    {
      type: "voice",
      intent: {
        type: "review",
        query: "Got it. I'll play the Step 7 training video now. Play Step 1 video",
        stepNumber: 7,
      },
    },
    context,
  );
  assert.deepEqual(fromTranscript.action, { type: "play_video", stepNumber: 1 });
  assert.match(fromTranscript.spokenText, /step 1/i);
  assert.doesNotMatch(fromTranscript.spokenText, /I'll play the Step 7/i);

  const playStep4 = reduceAgent(
    post,
    {
      type: "voice",
      intent: {
        type: "review",
        query: "Play Step 4",
        stepNumber: 2,
      },
    },
    context,
  );
  assert.deepEqual(playStep4.action, { type: "play_video", stepNumber: 4 });
  assert.match(playStep4.spokenText, /step 4/i);

  const playStep1Only = reduceAgent(
    snap({ phase: "post_video", currentStepNumber: 4, reviewStepNumber: 3 }),
    {
      type: "voice",
      intent: {
        type: "review",
        query: "play step 1",
        stepNumber: 3,
      },
    },
    context,
  );
  assert.deepEqual(playStep1Only.action, { type: "play_video", stepNumber: 1 });
  assert.match(playStep1Only.spokenText, /Got it\. I'll play the Step 1/i);
});

test("only next and previous calculate relative to currentStep", () => {
  const steps = [
    ...ctx().steps,
    {
      stepNumber: 3,
      title: "Coco-Coffee Scrub",
      description: "Using hands first.",
      importantPoints: [],
      videoUrl: "https://example.com/3.mp4",
      videoDurationSeconds: 15,
    },
  ];
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const context = ctx({
    steps,
    completedStepNumbers: [1, 2],
    currentStepVideoCompleted: true,
  });
  const next = reduceAgent(post, { type: "voice", intent: { type: "next" } }, context);
  assert.deepEqual(next.action, { type: "play_video", stepNumber: 3 });

  const previous = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", query: "previous step", stepNumber: null } },
    context,
  );
  assert.deepEqual(previous.action, { type: "play_video", stepNumber: 1 });
});

test("next still plays the next incomplete video if currentStep already advanced", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const result = reduceAgent(
    post,
    { type: "voice", intent: { type: "next" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: false }),
  );
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 2 });
  assert.doesNotMatch(result.spokenText, /finish watching/i);
});

test("next on the last completed step offers the assessment", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const result = reduceAgent(
    post,
    { type: "voice", intent: { type: "next" } },
    ctx({
      completedStepNumbers: [1, 2],
      currentStepVideoCompleted: true,
      allStepsCompleted: true,
      status: "ready_for_assessment",
    }),
  );
  assert.equal(result.snapshot.phase, "awaiting_assessment");
  assert.match(result.spokenText, /assessment/i);
  assert.match(result.spokenText, /60 percent or more/i);
});

test("last step prompt mentions assessment, earlier steps do not", () => {
  const lastPlaying = snap({ phase: "playing_video", currentStepNumber: 2 });
  const last = reduceAgent(
    lastPlaying,
    { type: "video_complete", stepNumber: 2 },
    ctx({
      completedStepNumbers: [1, 2],
      currentStepVideoCompleted: true,
      allStepsCompleted: true,
      status: "ready_for_assessment",
    }),
  );
  assert.match(last.spokenText, /assessment/i);

  const mid = reduceAgent(
    snap({ phase: "post_video", currentStepNumber: 1 }),
    { type: "voice", intent: { type: "assessment" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(mid.snapshot.phase, "post_video");
  assert.match(mid.spokenText, /after the last step/i);
});

test("after a later step the staff can replay a previous step video", () => {
  const steps = [
    ...ctx().steps,
    {
      stepNumber: 3,
      title: "Coco-Coffee Scrub",
      description: "Using hands first.",
      importantPoints: [],
      videoUrl: "https://example.com/3.mp4",
      videoDurationSeconds: 15,
    },
  ];
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const context = ctx({
    steps,
    completedStepNumbers: [1, 2],
    currentStepVideoCompleted: true,
  });
  const start = reduceAgent(
    post,
    { type: "voice", intent: { type: "review", stepNumber: 1, query: "watch step 1" } },
    context,
  );
  assert.equal(start.snapshot.phase, "playing_review");
  assert.equal(start.snapshot.currentStepNumber, 2);
  assert.deepEqual(start.action, { type: "play_video", stepNumber: 1 });

  const after = reduceAgent(
    start.snapshot,
    { type: "video_complete", stepNumber: 1 },
    context,
  );
  assert.equal(after.snapshot.phase, "post_video");
  assert.equal(after.snapshot.currentStepNumber, 2);
  assert.doesNotMatch(after.spokenText, /assessment/i);

  const next = reduceAgent(
    after.snapshot,
    { type: "voice", intent: { type: "next" } },
    context,
  );
  assert.deepEqual(next.action, { type: "play_video", stepNumber: 3 });
});

test("voice cannot start assessment from welcome without watching", () => {
  const result = voice({ type: "assessment" });
  assert.equal(result.snapshot.phase, "playing_video");
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 1 });
});

test("assessment confirm and retake flags", () => {
  const awaiting = snap({ phase: "awaiting_assessment", currentStepNumber: 2 });
  assert.equal(wantsAssessmentStart(awaiting, { type: "confirm" }), true);
  assert.equal(wantsAssessmentStart(awaiting, { type: "assessment" }), true);
  assert.equal(wantsAssessmentStart(awaiting, { type: "review", stepNumber: 1 }), false);
  assert.equal(wantsAssessmentStart(awaiting, { type: "decline" }), false);
  assert.equal(wantsAssessmentStart(awaiting, { type: "unknown", query: "hmm" }), false);

  const failed = snap({ phase: "failed_recovery", currentStepNumber: 2 });
  assert.equal(wantsAssessmentStart(failed, { type: "retake" }), true);
  assert.equal(wantsAssessmentStart(failed, { type: "review", query: "led" }), false);
  assert.equal(wantsAssessmentStart(failed, { type: "decline" }), false);
});

test("declining the assessment offer postpones without starting", () => {
  const awaiting = snap({ phase: "awaiting_assessment", currentStepNumber: 2 });
  const context = ctx({
    allStepsCompleted: true,
    status: "ready_for_assessment",
    completedStepNumbers: [1, 2],
  });
  const declined = reduceAgent(
    awaiting,
    { type: "voice", intent: { type: "decline" } },
    context,
  );
  assert.equal(declined.snapshot.phase, "awaiting_assessment");
  assert.equal(declined.action.type, "idle");
  assert.equal(declined.expectedInput, "none");
  assert.match(declined.spokenText, /continue later/i);
  assert.equal(wantsAssessmentStart(declined.snapshot, { type: "decline" }, context), false);

  const silentAfterDecline = reduceAgent(
    declined.snapshot,
    { type: "voice", intent: { type: "empty" } },
    context,
    declined.spokenText,
  );
  assert.equal(silentAfterDecline.action.type, "idle");
  assert.notEqual(silentAfterDecline.action.type, "play_video");
  assert.doesNotMatch(silentAfterDecline.spokenText, /i'll play/i);

  const unclear = reduceAgent(
    awaiting,
    { type: "voice", intent: { type: "unknown", query: "maybe" } },
    context,
  );
  assert.equal(unclear.snapshot.phase, "awaiting_assessment");
  assert.equal(unclear.action.type, "listen");
  assert.match(unclear.spokenText, /would you like to start the assessment now/i);
});

test("returning after postponed assessment resumes at the offer", () => {
  const context = ctx({
    allStepsCompleted: true,
    status: "ready_for_assessment",
    completedStepNumbers: [1, 2],
  });
  const resumed = bootstrap(
    snap({ phase: "awaiting_assessment", currentStepNumber: 2 }),
    context,
  );
  assert.equal(resumed.snapshot.phase, "awaiting_assessment");
  assert.equal(resumed.action.type, "listen");
  assert.match(resumed.spokenText, /welcome back/i);
  assert.match(resumed.spokenText, /would you like to start it now/i);
  assert.doesNotMatch(resumed.spokenText, /failed/i);
  assert.equal(wantsAssessmentStart(resumed.snapshot, { type: "unknown" }, context), false);
});

test("pass and fail branch from assessment_finished", () => {
  const assessing = snap({ phase: "in_assessment", currentStepNumber: 2 });
  const passed = reduceAgent(
    assessing,
    { type: "assessment_finished", passed: true, scorePercent: 90 },
    ctx({ allStepsCompleted: true, status: "passed", completedStepNumbers: [1, 2] }),
  );
  assert.equal(passed.snapshot.phase, "passed");
  assert.equal(passed.action.type, "listen");
  assert.equal(passed.expectedInput, "doubt_or_navigate");
  assert.match(passed.spokenText, /passed/i);
  assert.match(passed.spokenText, /cannot be taken again|rewatch/i);

  const failed = reduceAgent(
    assessing,
    { type: "assessment_finished", passed: false, scorePercent: 40 },
    ctx({ allStepsCompleted: true, status: "failed_retraining", completedStepNumbers: [1, 2] }),
  );
  assert.equal(failed.snapshot.phase, "failed_recovery");
  assert.equal(failed.action.type, "listen");
  assert.match(failed.spokenText, /retake|review/i);
});

test("passed staff can review a step but cannot retake", () => {
  const passedSnap = snap({ phase: "passed", currentStepNumber: 2 });
  const passedCtx = ctx({
    allStepsCompleted: true,
    status: "passed",
    completedStepNumbers: [1, 2],
  });
  const retake = reduceAgent(
    passedSnap,
    { type: "voice", intent: { type: "retake" } },
    passedCtx,
  );
  assert.equal(retake.snapshot.phase, "passed");
  assert.equal(retake.action.type, "listen");
  assert.match(retake.spokenText, /cannot be taken again/i);
  assert.equal(wantsAssessmentStart(passedSnap, { type: "retake" }, passedCtx), false);
  assert.equal(wantsAssessmentStart(passedSnap, { type: "assessment" }, passedCtx), false);

  const decline = reduceAgent(
    passedSnap,
    { type: "voice", intent: { type: "decline", query: "no dont start the assessment" } },
    passedCtx,
  );
  assert.equal(decline.snapshot.phase, "passed");
  assert.equal(decline.action.type, "idle");
  assert.equal(decline.expectedInput, "none");
  assert.match(decline.spokenText, /no problem|take your time/i);

  const review = reduceAgent(
    passedSnap,
    { type: "voice", intent: { type: "review", stepNumber: 1, query: "play step 1", confidence: 1 } },
    passedCtx,
  );
  assert.equal(review.snapshot.phase, "playing_review");
  assert.deepEqual(review.action, { type: "play_video", stepNumber: 1 });

  const after = reduceAgent(
    review.snapshot,
    { type: "video_complete", stepNumber: 1 },
    passedCtx,
  );
  assert.equal(after.snapshot.phase, "post_review");
  assert.equal(after.action.type, "listen");
  assert.doesNotMatch(after.spokenText, /ready for the assessment|start the assessment|retake/i);

  const tryAgain = reduceAgent(
    after.snapshot,
    { type: "voice", intent: { type: "assessment" } },
    passedCtx,
  );
  assert.notEqual(tryAgain.action.type, "idle");
  assert.match(tryAgain.spokenText, /cannot be taken again/i);
  assert.equal(wantsAssessmentStart(after.snapshot, { type: "assessment" }, passedCtx), false);
});

test("reopening a passed training listens and does not repeat the pass score", () => {
  const passedCtx = ctx({
    allStepsCompleted: true,
    status: "passed",
    completedStepNumbers: [1, 2],
  });
  const opened = bootstrap(snap({ phase: "passed", currentStepNumber: 2 }), passedCtx);
  assert.equal(opened.action.type, "listen");
  assert.match(opened.spokenText, /already complete/i);
  assert.doesNotMatch(opened.spokenText, /well done/i);

  const empty = reduceAgent(
    opened.snapshot,
    { type: "voice", intent: { type: "empty" } },
    passedCtx,
    "Well done. You passed the HydraFacial assessment with 90 percent. Training is complete.",
  );
  assert.equal(empty.action.type, "listen");
  assert.doesNotMatch(empty.spokenText, /well done/i);

  const play = reduceAgent(
    opened.snapshot,
    { type: "voice", intent: { type: "review", query: "go to step 2", stepNumber: 2 } },
    passedCtx,
  );
  assert.deepEqual(play.action, { type: "play_video", stepNumber: 2 });

  const replayed = reduceAgent(
    opened.snapshot,
    { type: "replay" },
    passedCtx,
    "Well done. You passed the HydraFacial assessment with 90 percent. Training is complete.",
  );
  assert.equal(replayed.action.type, "listen");
  assert.doesNotMatch(replayed.spokenText, /well done/i);
});

test("reopening a failed training listens for retake or review", () => {
  const failedCtx = ctx({
    allStepsCompleted: true,
    status: "failed_retraining",
    completedStepNumbers: [1, 2],
  });
  const opened = bootstrap(snap({ phase: "failed_recovery", currentStepNumber: 2 }), failedCtx);
  assert.equal(opened.action.type, "listen");
  assert.match(opened.spokenText, /did not pass|retake/i);
});

test("targeted review asks about doubts then offers assessment navigation", () => {
  const failed = snap({ phase: "failed_recovery", currentStepNumber: 2 });
  const startReview = reduceAgent(
    failed,
    { type: "voice", intent: { type: "review", stepNumber: 1, confidence: 1 } },
    ctx({ allStepsCompleted: true, status: "failed_retraining", completedStepNumbers: [1, 2] }),
  );
  assert.equal(startReview.snapshot.phase, "playing_review");
  assert.deepEqual(startReview.action, { type: "play_video", stepNumber: 1 });

  const after = reduceAgent(
    startReview.snapshot,
    { type: "video_complete", stepNumber: 1 },
    ctx({
      allStepsCompleted: true,
      status: "failed_retraining",
      completedStepNumbers: [1, 2],
      currentStepVideoCompleted: true,
    }),
  );
  assert.equal(after.snapshot.phase, "post_review");
  assert.equal(after.snapshot.navigationOffered, false);
  assert.match(after.spokenText, /assessment/i);

  const ready = reduceAgent(
    after.snapshot,
    { type: "voice", intent: { type: "no_doubt" } },
    ctx({
      allStepsCompleted: true,
      status: "failed_retraining",
      completedStepNumbers: [1, 2],
      currentStepVideoCompleted: true,
    }),
  );
  assert.equal(ready.snapshot.navigationOffered, true);
  assert.match(ready.spokenText, /assessment/i);
});

test("declining retake after a failed review says take your time", () => {
  const failedCtx = ctx({
    allStepsCompleted: true,
    status: "failed_retraining",
    completedStepNumbers: [1, 2],
    currentStepVideoCompleted: true,
  });
  const afterReview = snap({
    phase: "post_review",
    currentStepNumber: 2,
    reviewStepNumber: 1,
    navigationOffered: false,
  });

  const declineBeforeNav = reduceAgent(
    afterReview,
    { type: "voice", intent: { type: "decline", query: "no dont start the assessment" } },
    failedCtx,
  );
  assert.equal(declineBeforeNav.action.type, "idle");
  assert.equal(declineBeforeNav.snapshot.phase, "failed_recovery");
  assert.match(declineBeforeNav.spokenText, /take your time|continue later/i);

  const declineAfterNav = reduceAgent(
    { ...afterReview, navigationOffered: true },
    { type: "voice", intent: { type: "decline", query: "not now" } },
    failedCtx,
  );
  assert.equal(declineAfterNav.action.type, "idle");
  assert.match(declineAfterNav.spokenText, /take your time|continue later/i);

  const fromFailed = reduceAgent(
    snap({ phase: "failed_recovery", currentStepNumber: 2 }),
    { type: "voice", intent: { type: "decline", query: "dont start" } },
    failedCtx,
  );
  assert.equal(fromFailed.action.type, "idle");
  assert.match(fromFailed.spokenText, /take your time|continue later/i);
});

test("welcome resume can keep listening for a doubt without starting video", () => {
  const result = reduceAgent(
    snap({ phase: "welcome", currentStepNumber: 2 }),
    { type: "voice", intent: { type: "doubt", query: "what is the mixing ratio?" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: false }),
  );
  assert.equal(result.snapshot.phase, "welcome");
  assert.equal(result.action.type, "listen");
  assert.notEqual(result.action.type, "play_video");
  assert.doesNotMatch(result.spokenText, /can't get you/i);

  const answered = reduceAgent(
    snap({ phase: "welcome", currentStepNumber: 2 }),
    { type: "doubt_answered", answerText: "Use a one to ten mixing ratio." },
    ctx({ completedStepNumbers: [1] }),
  );
  assert.equal(answered.snapshot.phase, "welcome");
  assert.equal(answered.action.type, "listen");
  assert.match(answered.spokenText, /mixing ratio/i);
  assert.match(answered.spokenText, /say yes to start step 2/i);
});

test("ambiguous review asks which step without playing", () => {
  const failed = snap({ phase: "failed_recovery", currentStepNumber: 2 });
  const result = reduceAgent(
    failed,
    {
      type: "voice",
      intent: { type: "review", query: "mask", stepNumber: null, candidates: [1, 2] },
    },
    ctx({ allStepsCompleted: true, status: "failed_retraining", completedStepNumbers: [1, 2] }),
  );
  assert.equal(result.snapshot.phase, "failed_recovery");
  assert.equal(result.action.type, "listen");
  assert.match(result.spokenText, /more than one match/i);
});

test("session resume during video does not speak", () => {
  const playing = snap({ phase: "playing_video", currentStepNumber: 1 });
  const result = bootstrap(playing, ctx());
  assert.equal(result.snapshot.phase, "playing_video");
  assert.equal(result.speak, false);
  assert.deepEqual(result.action, { type: "play_video", stepNumber: 1 });
});

test("empty and unknown utterances stay in phase without playing video", () => {
  const empty = voice({ type: "empty" });
  assert.equal(empty.snapshot.phase, "welcome");
  assert.equal(empty.action.type, "listen");
  assert.match(empty.spokenText, /can't get you/i);
  assert.notEqual(empty.action.type, "play_video");

  const unknown = voice({ type: "unknown", query: "blue banana" });
  assert.equal(unknown.snapshot.phase, "welcome");
  assert.equal(unknown.action.type, "listen");
  assert.match(unknown.spokenText, /can't get you/i);
  assert.notEqual(unknown.action.type, "play_video");
});

test("empty welcome does not replay a video-start intro", () => {
  const empty = reduceAgent(
    welcome,
    { type: "voice", intent: { type: "empty" } },
    ctx(),
    "Got it. I'll play the Step 1 training video now. Please watch carefully.",
  );
  assert.equal(empty.snapshot.phase, "welcome");
  assert.equal(empty.action.type, "listen");
  assert.match(empty.spokenText, /can't get you/i);
  assert.doesNotMatch(empty.spokenText, /i'll play/i);
});

test("repeated empty replies speak one no-response prompt without concatenating", () => {
  const first = voice({ type: "empty" });
  assert.match(first.spokenText, /^I can't get you\./i);
  assert.equal(first.spokenText.match(/can't get you/gi)?.length, 1);

  const second = reduceAgent(
    first.snapshot,
    { type: "voice", intent: { type: "empty" } },
    ctx(),
    first.spokenText,
  );
  assert.equal(second.spokenText, first.spokenText);
  assert.equal(second.spokenText.match(/can't get you/gi)?.length, 1);

  const fourth = reduceAgent(
    second.snapshot,
    { type: "voice", intent: { type: "empty" } },
    ctx(),
    `I can't get you. I can't get you. I can't get you. ${first.spokenText}`,
  );
  assert.equal(fourth.spokenText, first.spokenText);
  assert.equal(fourth.spokenText.match(/can't get you/gi)?.length, 1);
});

test("post_video silence repeats the navigation prompt without replaying video", () => {
  const post = snap({ phase: "post_video", currentStepNumber: 2 });
  const context = ctx({ completedStepNumbers: [1, 2], currentStepVideoCompleted: true });
  const prompt = "We have finished step 2. You can ask a question, watch it again, watch an earlier step, or move to the next video.";
  const empty = reduceAgent(
    post,
    { type: "voice", intent: { type: "empty" } },
    context,
    prompt,
  );
  assert.equal(empty.snapshot.phase, "post_video");
  assert.equal(empty.action.type, "listen");
  assert.equal(empty.spokenText, `I can't get you. ${prompt}`);
  assert.notEqual(empty.action.type, "play_video");
});

test("assessment emptyOrNoise and clarify replies use the no-input prefix", () => {
  const assessing = snap({ phase: "in_assessment", currentStepNumber: 2 });
  const emptyAnswer = reduceAgent(
    assessing,
    {
      type: "assessment_progress",
      questionText: "What is the mixing ratio?",
      questionIndex: 1,
      total: 3,
      emptyOrNoise: true,
    },
    ctx({ allStepsCompleted: true, status: "in_assessment", completedStepNumbers: [1, 2] }),
  );
  assert.equal(emptyAnswer.action.type, "listen");
  assert.match(emptyAnswer.spokenText, /^I can't get you\./i);
  assert.match(emptyAnswer.spokenText, /question 1 of 3/i);

  const unclear = reduceAgent(
    snap({ phase: "post_video", currentStepNumber: 1 }),
    { type: "voice", intent: { type: "unknown", query: "maybe later banana" } },
    ctx({ completedStepNumbers: [1], currentStepVideoCompleted: true }),
  );
  assert.equal(unclear.action.type, "listen");
  assert.match(unclear.spokenText, /^I can't get you\./i);

  const recovery = reduceAgent(
    snap({ phase: "failed_recovery", currentStepNumber: 2 }),
    { type: "voice", intent: { type: "empty" } },
    ctx({ allStepsCompleted: true, status: "failed_retraining", completedStepNumbers: [1, 2] }),
    "You did not pass. You can retake the assessment, or review a step.",
  );
  assert.equal(recovery.action.type, "listen");
  assert.match(recovery.spokenText, /^I can't get you\./i);
});
