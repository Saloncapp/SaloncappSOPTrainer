import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAnswerVerdict,
  canStartNextScenario,
  normalizeConversationState,
  parseAnswerVerdict,
} from "./clientHandlingFlow";
import {
  MAX_SCENARIOS_PER_SESSION,
  defaultConversationState,
  type ClientHandlingConversationState,
} from "./clientHandlingTypes";

function state(
  patch: Partial<ClientHandlingConversationState>,
): ClientHandlingConversationState {
  return { ...defaultConversationState(), ...patch };
}

test("first appropriate answer completes the scenario and asks for intent", () => {
  const outcome = applyAnswerVerdict(state({ phase: "awaiting_answer" }), "appropriate");
  assert.equal(outcome.scenarioCompleted, true);
  assert.equal(outcome.completedScenarioCount, 1);
  assert.equal(outcome.nextPhase, "awaiting_post_scenario_intent");
  assert.equal(outcome.firstAttemptWasIncorrect, false);
  assert.equal(outcome.sessionShouldEnd, false);
});

test("first inappropriate answer retries the same scenario without incrementing count", () => {
  const outcome = applyAnswerVerdict(state({ phase: "awaiting_answer" }), "not_appropriate");
  assert.equal(outcome.scenarioCompleted, false);
  assert.equal(outcome.completedScenarioCount, 0);
  assert.equal(outcome.nextPhase, "awaiting_retry_answer");
  assert.equal(outcome.firstAttemptWasIncorrect, true);
});

test("second answer completes the scenario even if still incorrect", () => {
  const outcome = applyAnswerVerdict(
    state({
      phase: "awaiting_retry_answer",
      completedScenarioCount: 1,
      firstAttemptWasIncorrect: true,
    }),
    "not_appropriate",
  );
  assert.equal(outcome.scenarioCompleted, true);
  assert.equal(outcome.completedScenarioCount, 2);
  assert.equal(outcome.nextPhase, "awaiting_post_scenario_intent");
  assert.equal(outcome.sessionShouldEnd, false);
});

test("fifth completed scenario ends the session and does not allow a sixth", () => {
  const outcome = applyAnswerVerdict(
    state({ phase: "awaiting_answer", completedScenarioCount: 4 }),
    "appropriate",
  );
  assert.equal(outcome.completedScenarioCount, MAX_SCENARIOS_PER_SESSION);
  assert.equal(outcome.nextPhase, "completed");
  assert.equal(outcome.sessionShouldEnd, true);
  assert.equal(canStartNextScenario(outcome.completedScenarioCount), false);
});

test("legacy doubt and next-scenario phases map to post-scenario intent", () => {
  const doubts = normalizeConversationState({
    phase: "awaiting_doubts",
    currentScenario: { topic: "long_wait", situation: "Client waited 40 minutes" },
  });
  assert.equal(doubts.phase, "awaiting_post_scenario_intent");
  assert.equal(doubts.currentScenario?.summary, "Client waited 40 minutes");

  const next = normalizeConversationState({ phase: "awaiting_next_scenario" });
  assert.equal(next.phase, "awaiting_post_scenario_intent");
});

test("parseAnswerVerdict accepts common model wordings", () => {
  assert.equal(parseAnswerVerdict("CORRECT / APPROPRIATE"), "appropriate");
  assert.equal(parseAnswerVerdict("not-appropriate"), "not_appropriate");
  assert.equal(parseAnswerVerdict("incorrect"), "not_appropriate");
});
