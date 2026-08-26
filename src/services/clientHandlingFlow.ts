import {
  MAX_SCENARIOS_PER_SESSION,
  defaultConversationState,
  type ClientHandlingAnswerVerdict,
  type ClientHandlingConversationState,
  type ClientHandlingPhase,
  type ClientHandlingRecentTurn,
  type ClientHandlingScenario,
} from "./clientHandlingTypes";

const RECENT_TURN_LIMIT = 24;

const LEGACY_PHASES: Record<string, ClientHandlingPhase> = {
  awaiting_doubts: "awaiting_post_scenario_intent",
  awaiting_next_scenario: "awaiting_post_scenario_intent",
};

function asFiniteCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_SCENARIOS_PER_SESSION, Math.floor(n));
}

function asScenario(raw: unknown): ClientHandlingScenario | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const topic = String(s.topic || "").trim();
  if (!topic) return null;
  const summary = String(s.summary || s.situation || "").trim();
  return {
    topic,
    summary: summary || "A client needs manager support.",
    guidance: String(s.guidance || "").trim(),
    question:
      String(s.question || "").trim() ||
      "As the manager, how would you handle this situation?",
  };
}

function asRecentTurns(raw: unknown): ClientHandlingRecentTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ClientHandlingRecentTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const role =
      t.role === "manager" || t.role === "stylist" || t.role === "trainer"
        ? t.role
        : null;
    const text = String(t.text || "").trim();
    if (!role || !text) continue;
    const verdict =
      t.verdict === "appropriate" || t.verdict === "not_appropriate"
        ? t.verdict
        : undefined;
    turns.push({
      role,
      text,
      topic: t.topic ? String(t.topic) : undefined,
      verdict,
    });
  }
  return turns.slice(-RECENT_TURN_LIMIT);
}

export function normalizeConversationState(
  raw: unknown,
): ClientHandlingConversationState {
  const base = defaultConversationState();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Record<string, unknown>;
  const mappedPhase = LEGACY_PHASES[String(s.phase || "")] || s.phase;
  const phase: ClientHandlingPhase =
    mappedPhase === "awaiting_answer" ||
    mappedPhase === "awaiting_retry_answer" ||
    mappedPhase === "awaiting_post_scenario_intent" ||
    mappedPhase === "completed"
      ? mappedPhase
      : "awaiting_answer";

  return {
    phase,
    completedScenarioCount: asFiniteCount(s.completedScenarioCount),
    currentScenario: asScenario(s.currentScenario),
    firstAttemptWasIncorrect: Boolean(s.firstAttemptWasIncorrect),
    usedScenarioTopics: Array.isArray(s.usedScenarioTopics)
      ? s.usedScenarioTopics.map((t) => String(t)).filter(Boolean)
      : [],
    recentTurns: asRecentTurns(s.recentTurns),
  };
}

export function appendRecentTurn(
  turns: ClientHandlingRecentTurn[],
  turn: ClientHandlingRecentTurn,
): ClientHandlingRecentTurn[] {
  return [...turns, turn].slice(-RECENT_TURN_LIMIT);
}

export function canStartNextScenario(completedScenarioCount: number): boolean {
  return completedScenarioCount < MAX_SCENARIOS_PER_SESSION;
}

export function parseAnswerVerdict(raw: unknown): ClientHandlingAnswerVerdict {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    value === "not_appropriate" ||
    value === "incorrect" ||
    value === "inappropriate" ||
    value === "wrong" ||
    value === "no"
  ) {
    return "not_appropriate";
  }
  return "appropriate";
}

export type AnswerOutcome = {
  nextPhase: ClientHandlingPhase;
  firstAttemptWasIncorrect: boolean;
  completedScenarioCount: number;
  sessionShouldEnd: boolean;
  scenarioCompleted: boolean;
};

export function applyAnswerVerdict(
  state: ClientHandlingConversationState,
  verdict: ClientHandlingAnswerVerdict,
): AnswerOutcome {
  if (state.phase === "awaiting_retry_answer") {
    const completedScenarioCount = state.completedScenarioCount + 1;
    const sessionShouldEnd = completedScenarioCount >= MAX_SCENARIOS_PER_SESSION;
    return {
      nextPhase: sessionShouldEnd ? "completed" : "awaiting_post_scenario_intent",
      firstAttemptWasIncorrect: true,
      completedScenarioCount,
      sessionShouldEnd,
      scenarioCompleted: true,
    };
  }

  if (verdict === "not_appropriate") {
    return {
      nextPhase: "awaiting_retry_answer",
      firstAttemptWasIncorrect: true,
      completedScenarioCount: state.completedScenarioCount,
      sessionShouldEnd: false,
      scenarioCompleted: false,
    };
  }

  const completedScenarioCount = state.completedScenarioCount + 1;
  const sessionShouldEnd = completedScenarioCount >= MAX_SCENARIOS_PER_SESSION;
  return {
    nextPhase: sessionShouldEnd ? "completed" : "awaiting_post_scenario_intent",
    firstAttemptWasIncorrect: false,
    completedScenarioCount,
    sessionShouldEnd,
    scenarioCompleted: true,
  };
}
