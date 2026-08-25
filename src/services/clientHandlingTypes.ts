export type ClientHandlingPhase =
  | "awaiting_answer"
  | "awaiting_retry_answer"
  | "awaiting_post_scenario_intent"
  | "completed";

export type ClientHandlingAnswerVerdict = "appropriate" | "not_appropriate";

export type ClientHandlingScenario = {
  topic: string;
  summary: string;
  guidance: string;
  question: string;
};

export type ClientHandlingRecentTurn = {
  role: "manager" | "trainer";
  text: string;
  topic?: string;
  verdict?: ClientHandlingAnswerVerdict;
};

export type ClientHandlingConversationState = {
  phase: ClientHandlingPhase;
  completedScenarioCount: number;
  currentScenario: ClientHandlingScenario | null;
  firstAttemptWasIncorrect: boolean;
  usedScenarioTopics: string[];
  recentTurns: ClientHandlingRecentTurn[];
};

export type ClientHandlingIntent =
  | "answer"
  | "doubt"
  | "ask_for_answer"
  | "yes_next_scenario"
  | "no_next_scenario"
  | "no_doubt"
  | "bare_ok"
  | "stop"
  | "empty";

export const MAX_SCENARIOS_PER_SESSION = 5;

export const SCENARIO_TOPIC_BANK = [
  "angry_client",
  "unhappy_service_result",
  "client_complaint",
  "long_wait",
  "refund_request",
  "pricing_dispute",
  "staff_behaviour_complaint",
  "demands_manager",
  "repeat_unhappy_client",
  "difficult_demanding_client",
  "refusing_to_pay",
  "unauthorized_discount",
  "comparing_other_salon",
  "unexpected_service",
  "post_treatment_dissatisfaction",
  "communication_misunderstanding",
  "immediate_correction_request",
  "client_escalation",
  "negative_review_threat",
  "unrealistic_expectations",
] as const;

export const CLIENT_HANDLING_POLICY_FALLBACK =
  "Follow your salon's applicable policy or escalate the matter to the appropriate authority.";

export const CLIENT_HANDLING_GOODBYE =
  "Okay. Great job practising Client Handling today. Remember to stay calm, listen carefully, show empathy and focus on finding an appropriate solution. You can come back anytime to practise more scenarios.";

export const POST_SCENARIO_PROMPT =
  "Do you have any doubts about this situation, or would you like another scenario?";

export const POST_DOUBT_PROMPT =
  "Do you have any other doubts, or would you like another scenario?";

export const ANOTHER_SCENARIO_PROMPT = "Would you like another scenario?";

export const FIVE_SCENARIO_INTRO =
  "Great job. You've completed five Client Handling scenarios in this session. You've practised different situations that can happen while managing salon clients.";

export function defaultConversationState(): ClientHandlingConversationState {
  return {
    phase: "awaiting_answer",
    completedScenarioCount: 0,
    currentScenario: null,
    firstAttemptWasIncorrect: false,
    usedScenarioTopics: [],
    recentTurns: [],
  };
}
