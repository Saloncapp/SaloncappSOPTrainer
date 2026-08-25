import type { ClientHandlingIntent, ClientHandlingPhase } from "./clientHandlingTypes";

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GLOBAL_STOP_PATTERNS = [
  /\b(stop|exit|quit)\b/i,
  /\b(end training|leave training|done training|finish training)\b/i,
  /\b(that'?s all|that is all|that'?s enough|that is enough)\b/i,
  /\b(i don'?t want another( scenario)?|no more scenarios|no more training)\b/i,
];

const POST_SCENARIO_STOP_PATTERNS = [
  ...GLOBAL_STOP_PATTERNS,
  /^(no|nope|nah|finish|end)\.?$/i,
  /\b(no thanks|no thank you|not now|i'?m done|i am done)\b/i,
];

const YES_NEXT_PATTERNS = [
  /^(yes|yeah|yep|sure)(\s+(please|thanks))?\.?$/,
  /\b(another scenario|next scenario|one more|give me another|tell me another|another one)\b/i,
  /^(continue|let'?s continue|let us continue|okay next|ok next|move on|next one|next)\.?$/,
];

const NO_DOUBT_PATTERNS = [
  /^(no doubt|no doubts|no questions|all clear|nothing|none|nope none)\.?$/,
  /\b(no more doubts|no other doubts|no further doubts|no doubts)\b/i,
  /^(i'?m good|i am good|no question)\.?$/,
];

const BARE_OK_PATTERNS = [
  /^(ok|okay|k|got it|understood|i understand|fine|alright|all right)\.?$/,
  /^(that makes sense|makes sense)\.?$/,
];

const ASK_ANSWER_PATTERNS = [
  /\b(what should i do|what do i do|tell me the (correct|right) (approach|answer|way)|give me the answer)\b/i,
  /\b(how should i handle|what is the correct approach|what'?s the correct approach)\b/i,
  /\b(i don'?t know|not sure what to do|help me with this)\b/i,
];

const DOUBT_PATTERNS = [
  /\?$/,
  /\b(what if|how about|can i|should i|why would|why should|is it okay|what happens if)\b/i,
  /\b(explain|clarify|example|mean by|doubt)\b/i,
];

function isAnswerPhase(phase: ClientHandlingPhase): boolean {
  return phase === "awaiting_answer" || phase === "awaiting_retry_answer";
}

export function parseClientHandlingIntent(
  transcript: string,
  phase: ClientHandlingPhase,
): ClientHandlingIntent {
  const text = normalize(transcript);
  if (!text) return "empty";

  if (phase === "awaiting_post_scenario_intent") {
    if (POST_SCENARIO_STOP_PATTERNS.some((p) => p.test(text))) return "stop";
  } else if (GLOBAL_STOP_PATTERNS.some((p) => p.test(text))) {
    return "stop";
  }

  if (isAnswerPhase(phase) && ASK_ANSWER_PATTERNS.some((p) => p.test(text))) {
    return "ask_for_answer";
  }

  if (phase === "awaiting_post_scenario_intent") {
    if (NO_DOUBT_PATTERNS.some((p) => p.test(text))) return "no_doubt";
    if (DOUBT_PATTERNS.some((p) => p.test(text))) return "doubt";
    if (YES_NEXT_PATTERNS.some((p) => p.test(text))) return "yes_next_scenario";
    if (BARE_OK_PATTERNS.some((p) => p.test(text))) return "bare_ok";
    return "doubt";
  }

  if (DOUBT_PATTERNS.some((p) => p.test(text))) return "doubt";

  if (isAnswerPhase(phase)) return "answer";
  if (phase === "completed") return "stop";
  return "answer";
}
