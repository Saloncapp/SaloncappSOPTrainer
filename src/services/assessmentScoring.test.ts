import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeAssessmentCorrectness,
  looksLikeQuestionEcho,
} from "./assessmentScoring";

test("reading the assessment question is not a correct answer", () => {
  const question = "What is the mixing ratio for the suction pen?";
  assert.equal(looksLikeQuestionEcho(question, question), true);
  assert.equal(looksLikeQuestionEcho(question, "what is the mixing ratio for the suction pen"), true);
  assert.equal(looksLikeQuestionEcho(question, "mixing ratio for the suction pen"), true);
  assert.equal(
    finalizeAssessmentCorrectness({
      questionText: question,
      transcript: "What is the mixing ratio for the suction pen",
      modelCorrect: true,
    }),
    false,
  );
});

test("topic keywords from the question are not enough to pass", () => {
  assert.equal(
    looksLikeQuestionEcho("Explain skin analysis.", "skin analysis"),
    true,
  );
  assert.equal(
    looksLikeQuestionEcho("What is cleansing in this service?", "cleansing"),
    true,
  );
  assert.equal(
    finalizeAssessmentCorrectness({
      questionText: "What is cleansing?",
      transcript: "cleansing",
      modelCorrect: true,
    }),
    false,
  );
});

test("a specific SOP fact is not treated as a question echo", () => {
  const question = "What is the mixing ratio for the suction pen?";
  assert.equal(looksLikeQuestionEcho(question, "one to ten"), false);
  assert.equal(looksLikeQuestionEcho(question, "1:10"), false);
  assert.equal(
    looksLikeQuestionEcho(
      "How should you cleanse the face?",
      "Use hands only and give a gentle hand massage for about two minutes",
    ),
    false,
  );
  assert.equal(
    finalizeAssessmentCorrectness({
      questionText: question,
      transcript: "The mixing ratio is 1 to 10",
      modelCorrect: true,
    }),
    true,
  );
});
