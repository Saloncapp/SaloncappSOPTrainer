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
  assert.match(result.spokenText, /ask a question/i);
  assert.match(result.spokenText, /next video/i);
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
  assert.equal(wantsAssessmentStart(awaiting, { type: "review", stepNumber: 1 }), false);

  const failed = snap({ phase: "failed_recovery", currentStepNumber: 2 });
  assert.equal(wantsAssessmentStart(failed, { type: "retake" }), true);
  assert.equal(wantsAssessmentStart(failed, { type: "review", query: "led" }), false);
});

test("pass and fail branch from assessment_finished", () => {
  const assessing = snap({ phase: "in_assessment", currentStepNumber: 2 });
  const passed = reduceAgent(
    assessing,
    { type: "assessment_finished", passed: true, scorePercent: 90 },
    ctx({ allStepsCompleted: true, status: "passed", completedStepNumbers: [1, 2] }),
  );
  assert.equal(passed.snapshot.phase, "passed");
  assert.equal(passed.action.type, "show_result");

  const failed = reduceAgent(
    assessing,
    { type: "assessment_finished", passed: false, scorePercent: 70 },
    ctx({ allStepsCompleted: true, status: "failed_retraining", completedStepNumbers: [1, 2] }),
  );
  assert.equal(failed.snapshot.phase, "failed_recovery");
  assert.equal(failed.action.type, "listen");
  assert.match(failed.spokenText, /retake|review/i);
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

test("empty and unknown utterances stay in phase", () => {
  const empty = voice({ type: "empty" });
  assert.equal(empty.snapshot.phase, "welcome");
  assert.match(empty.spokenText, /can't get you|when you are ready/i);

  const unknown = voice({ type: "unknown", query: "blue banana" });
  assert.equal(unknown.snapshot.phase, "welcome");
  assert.equal(unknown.action.type, "listen");
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
