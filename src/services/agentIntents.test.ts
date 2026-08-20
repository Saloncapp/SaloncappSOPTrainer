import assert from "node:assert/strict";
import test from "node:test";
import { extractStepNumber, isPreviousStepRequest, matchSteps, parseRuleIntent, scoreStep } from "./agentIntents";
import type { AgentStepInfo, ExpectedInput } from "./agentTypes";

const steps: AgentStepInfo[] = [
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
    importantPoints: ["AS1: Normal to dry skin", "Mixing Ratio: 1:10"],
    videoUrl: "https://example.com/2.mp4",
    videoDurationSeconds: 15,
  },
  {
    stepNumber: 7,
    title: "Peptide Gel Mask + Sheet Mask + LED Mask",
    description: "Use for 10–12 minutes.",
    importantPoints: ["LED Mask Light Ray Benefits — Blue: Anti-fungal"],
    videoUrl: "https://example.com/7.mp4",
    videoDurationSeconds: 15,
  },
  {
    stepNumber: 9,
    title: "SPF",
    description: "",
    importantPoints: [],
    videoUrl: "https://example.com/9.mp4",
    videoDurationSeconds: 15,
  },
];

test("tamil-only speech is not treated as empty", () => {
  const intent = parseRuleIntent("ஆம்", "confirm");
  assert.equal(intent.type, "unknown");
});

test("welcome confirmations map to confirm", () => {
  for (const phrase of ["yes", "okay", "sure", "let's go", "start"]) {
    assert.equal(parseRuleIntent(phrase, "confirm").type, "confirm", phrase);
  }
});

test("silence, fillers, and garbled welcome speech stay empty", () => {
  for (const phrase of ["", "  ", "um", "uh", "hmm", "ah", "mm"]) {
    assert.equal(parseRuleIntent(phrase, "confirm").type, "empty", phrase);
  }
  assert.equal(parseRuleIntent("ok", "confirm").type, "confirm");
  assert.equal(parseRuleIntent("foamy gel cleanser", "confirm").type, "unknown");
  assert.equal(parseRuleIntent("play step 1", "confirm").type, "review");
});

test("post-video ok means next, watch again means rewatch", () => {
  assert.equal(parseRuleIntent("ok", "next_or_rewatch").type, "next");
  assert.equal(parseRuleIntent("move on", "next_or_rewatch").type, "next");
  assert.equal(parseRuleIntent("watch again", "next_or_rewatch").type, "rewatch");
});

test("post-video doubt phase recognizes no doubts and questions", () => {
  assert.equal(parseRuleIntent("no doubts", "doubt_or_navigate").type, "no_doubt");
  assert.equal(parseRuleIntent("next", "doubt_or_navigate").type, "next");
  assert.equal(parseRuleIntent("ok", "doubt_or_navigate").type, "next");
  assert.equal(parseRuleIntent("play step 3 video", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("play step 3 video", "doubt_or_navigate").stepNumber, 3);
  assert.equal(parseRuleIntent("play step3 video", "doubt_or_navigate").stepNumber, 3);
  assert.equal(parseRuleIntent("watch step 2", "doubt_or_navigate").stepNumber, 2);
  assert.equal(parseRuleIntent("watch step 1", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("watch step 1", "doubt_or_navigate").stepNumber, 1);
  assert.equal(parseRuleIntent("can I watch step 1", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("I want to watch step 1 video", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("previous step", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("play the previous step", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("go back", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("play step 4", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("play step 4", "doubt_or_navigate").stepNumber, 4);
  assert.equal(parseRuleIntent("Play Step 1", "doubt_or_navigate").stepNumber, 1);
  assert.equal(parseRuleIntent("Play Step 4", "next_or_rewatch").stepNumber, 4);
  assert.equal(
    parseRuleIntent(
      "Got it. I'll play the Step 6 training video now. play step 1",
      "doubt_or_navigate",
    ).stepNumber,
    1,
  );
  assert.equal(
    extractStepNumber("Got it. I'll play the Step 6 training video now. play step 1"),
    1,
  );
  assert.equal(extractStepNumber("Step 3 is complete. Play step 1"), 1);
  assert.equal(extractStepNumber("play step 1"), 1);
  assert.equal(extractStepNumber("Play Step 1 video"), 1);
  assert.equal(extractStepNumber("play step one"), 1);
  assert.equal(extractStepNumber("I want to watch step 1"), 1);
  assert.equal(extractStepNumber("Go to step 1"), 1);
  assert.equal(extractStepNumber("Can you play the first step?"), 1);
  assert.equal(
    extractStepNumber("Got it. I'll play the Step 7 training video now. Play Step 1 video"),
    1,
  );
  assert.equal(
    extractStepNumber("Got it. I'll play the Step 7 training video now. Please watch carefully."),
    null,
  );
  assert.equal(parseRuleIntent("Play Step 1 video", "doubt_or_navigate").stepNumber, 1);
  assert.equal(parseRuleIntent("play step one", "doubt_or_navigate").stepNumber, 1);
  assert.equal(parseRuleIntent("Can you play the first step?", "doubt_or_navigate").stepNumber, 1);
  assert.equal(parseRuleIntent("play the next step", "doubt_or_navigate").type, "next");
  assert.equal(parseRuleIntent("move to step 6", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("move to step 6", "doubt_or_navigate").stepNumber, 6);
  assert.equal(parseRuleIntent("continue", "doubt_or_navigate").type, "next");
  assert.equal(parseRuleIntent("go to the next video", "doubt_or_navigate").type, "next");
  assert.equal(isPreviousStepRequest("previous step"), true);
  assert.equal(isPreviousStepRequest("go back"), true);
  assert.equal(isPreviousStepRequest("play step 4"), false);
  assert.equal(isPreviousStepRequest("play step 7"), false);
  assert.equal(parseRuleIntent("முந்தைய படி", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("அடுத்த படி", "doubt_or_navigate").type, "next");
  assert.equal(parseRuleIntent("पिछला स्टेप", "doubt_or_navigate").type, "review");
  assert.equal(parseRuleIntent("अगला स्टेप", "doubt_or_navigate").type, "next");
  assert.equal(
    parseRuleIntent("what is the mixing ratio for this step", "doubt_or_navigate").type,
    "doubt",
  );
  assert.equal(
    parseRuleIntent("Hydrafacial step 2-la enna product use பண்ணணும்", "doubt_or_navigate").type,
    "doubt",
  );
  assert.equal(
    parseRuleIntent("What is the next step? இதை எப்படி செய்ய வேண்டும்?", "doubt_or_navigate").type,
    "doubt",
  );
});

test("assessment confirm and retake intents", () => {
  assert.equal(parseRuleIntent("yes", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("yes, start", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("I'm ready", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("let's start", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("start the assessment", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("okay, begin", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("take the assessment", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("ஆம்", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("ஆமாம்", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("हाँ", "assessment_confirm").type, "assessment");
  assert.equal(parseRuleIntent("retake", "retake_or_review").type, "retake");
  assert.equal(parseRuleIntent("try again", "review_or_assessment").type, "assessment");
  assert.equal(
    parseRuleIntent("what is the mixing ratio for this step", "retake_or_review").type,
    "doubt",
  );
  assert.equal(parseRuleIntent("play step 2", "retake_or_review").type, "review");
});

test("assessment offer negatives are decline, not start", () => {
  for (const phrase of [
    "No",
    "Not now",
    "Not yet",
    "Don't start",
    "I don't want to",
    "Wait",
    "Later",
    "I'm not ready",
    "இல்லை",
    "வேண்டாம்",
    "नहीं",
  ]) {
    assert.equal(parseRuleIntent(phrase, "assessment_confirm").type, "decline", phrase);
  }
  assert.equal(parseRuleIntent("maybe", "assessment_confirm").type, "unknown");
});

test("assessment answers are not treated as confirmations", () => {
  const intent = parseRuleIntent("apply foamy gel with hands", "assessment_answer");
  assert.equal(intent.type, "unknown");
});

test("step number and concept queries become review", () => {
  const numbered = parseRuleIntent("play step 7", "retake_or_review");
  assert.equal(numbered.type, "review");
  assert.equal(numbered.stepNumber, 7);

  const goTo = parseRuleIntent("go to step 2", "doubt_or_navigate");
  assert.equal(goTo.type, "review");
  assert.equal(goTo.stepNumber, 2);

  const concept = parseRuleIntent("show me the led mask", "retake_or_review");
  assert.equal(concept.type, "review");
});

test("exact title and concept matching finds the right video", () => {
  const cleanser = matchSteps("foamy gel cleanser", steps);
  assert.equal(cleanser.stepNumber, 1);
  assert.ok(cleanser.confidence > 0.5);

  const led = matchSteps("led mask", steps);
  assert.equal(led.stepNumber, 7);

  const spf = matchSteps("spf", steps);
  assert.equal(spf.stepNumber, 9);

  const suction = matchSteps("suction pen mixing ratio", steps);
  assert.equal(suction.stepNumber, 2);
});

test("ambiguous or unknown concepts do not pick a step", () => {
  const unknown = matchSteps("hair coloring toner", steps);
  assert.equal(unknown.stepNumber, null);

  const maskScore = scoreStep("mask", steps[2]);
  assert.ok(maskScore > 0);
});
