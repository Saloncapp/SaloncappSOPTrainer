import type { AgentStepInfo, ExpectedInput, ParsedIntent } from "./agentTypes";

export function normalizeText(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "please",
  "want",
  "wanna",
  "like",
  "can",
  "we",
  "you",
  "i",
  "me",
  "my",
  "that",
  "this",
  "it",
  "is",
  "are",
  "be",
  "do",
  "did",
  "play",
  "watch",
  "show",
  "video",
  "again",
  "step",
  "service",
]);

const CONFIRM_RE =
  /\b(ok|okay|okey|yes|yeah|yep|yup|sure|start|begin|go ahead|lets go|let s go|proceed|continue|alright|all right|ready)\b/;
const DECLINE_RE =
  /\b(no|nope|nah|not now|not yet|not ready|not today|not right now|do not start|don t start|dont start|do not want|don t want|dont want|wait|later|hold on|hold up|maybe later)\b/;
const TA_CONFIRM_RE = /ஆம்|ஆமாம்|சரி|ஆரம்பி|தொடங்கு|தயார்/;
const TA_DECLINE_RE = /இல்லை|வேண்டாம்|வேணாம்/;
const HI_CONFIRM_RE = /हाँ|हां|जी हाँ|जी हां|ठीक|शुरू|तैयार/;
const HI_DECLINE_RE = /नहीं|नही|अभी नहीं|नहीं चाहिए|बाद में/;
const NEXT_RE =
  /\b(next|continue|move on|move to next|go to next|go ahead|proceed|skip)\b/;
const REWATCH_RE =
  /\b(rewatch|watch again|play again|replay|once more|one more time|again)\b/;
const ASSESSMENT_RE =
  /\b(assessment|assesment|quiz|test|exam|evaluation|questions)\b/;
const RETAKE_RE =
  /\b(retake|re take|try again|take again|attempt again|do it again)\b/;
const EXIT_RE = /\b(stop|exit|quit|later|not now|pause|go back)\b/;
const REPLAY_RE =
  /\b(repeat|say that again|what was that|pardon|come again|say again)\b/;
const REVIEW_RE =
  /\b(review|rewatch|watch|play|show me|go to|open)\b/;
const PREVIOUS_RE =
  /\b(previous|earlier step|earlier video|watch previous|last video)\b/;
const NO_DOUBT_RE =
  /\b(no doubt|no doubts|no question|no questions|all clear|got it|understood|nothing else|that's clear|thats clear|i'm good|im good|clear|no thanks|nothing|no more questions)\b/;
const QUESTION_RE =
  /\b(what|why|how|when|where|can|should|is|are|does|do|could|would|explain|tell me|mean|difference)\b/;
const FILLER_ONLY_RE = /^(um+|uh+|er+|ah+|oh+|hmm+|mm+|mhm+|huh+|eh+|ha+|hm+)$/;

export function looksLikeEmptyOrNoiseTranscript(transcript: string): boolean {
  const original = String(transcript || "").trim();
  if (!original) return true;
  const text = normalizeText(original);
  if (!text) return true;
  if (hasNonLatinScript(original)) return false;
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 2) return true;
  if (FILLER_ONLY_RE.test(text)) return true;
  return false;
}

export function extractStepNumber(text: string): number | null {
  const match = normalizeText(text).match(/\bstep\s+(\d{1,2})\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

function hasWord(text: string, re: RegExp): boolean {
  return re.test(normalizeText(text));
}

const DOUBT_QUESTION_RE =
  /\b(what|why|how|when|where|which|explain|tell me|mean|difference)\b/;

export function looksLikeQuestion(transcript: string): boolean {
  const original = String(transcript || "").trim();
  if (!original) return false;
  if (original.includes("?")) return true;
  const latin = normalizeText(original);
  if (DOUBT_QUESTION_RE.test(latin)) return true;
  if (/[\u0B80-\u0BFF]/.test(original) && /என்ன|எப்படி|ஏன்|எங்கே|எது|வேண்டு|பண்ண|செய்/.test(original)) {
    return true;
  }
  if (/[\u0900-\u097F]/.test(original) && /क्या|कैसे|क्यों|कहाँ|कब|कौन/.test(original)) {
    return true;
  }
  return false;
}

export function hasNonLatinScript(transcript: string): boolean {
  return /[\u0B80-\u0BFF\u0900-\u097F]/.test(String(transcript || ""));
}

function isAssessmentOfferInput(expectedInput: ExpectedInput): boolean {
  return (
    expectedInput === "assessment_confirm" ||
    expectedInput === "review_or_assessment" ||
    expectedInput === "retake_or_review"
  );
}

export function looksLikeDecline(transcript: string): boolean {
  const original = String(transcript || "").trim();
  if (!original) return false;
  if (TA_DECLINE_RE.test(original) || HI_DECLINE_RE.test(original)) return true;
  const text = normalizeText(original);
  return Boolean(text) && DECLINE_RE.test(text);
}

export function looksLikeAssessmentConfirm(transcript: string): boolean {
  if (looksLikeDecline(transcript)) return false;
  const original = String(transcript || "").trim();
  if (!original) return false;
  if (TA_CONFIRM_RE.test(original) || HI_CONFIRM_RE.test(original)) return true;
  const text = normalizeText(original);
  return Boolean(text) && (hasWord(text, CONFIRM_RE) || hasWord(text, ASSESSMENT_RE));
}

export function parseRuleIntent(
  transcript: string,
  expectedInput: ExpectedInput,
): ParsedIntent {
  const original = String(transcript || "").trim();
  if (!original) {
    return { type: "empty" };
  }
  const text = normalizeText(transcript);
  const nativeScript = hasNonLatinScript(original);
  if (looksLikeEmptyOrNoiseTranscript(original) && !nativeScript) {
    return { type: "empty" };
  }
  if ((!text || text.length < 2) && !nativeScript) {
    return { type: "empty" };
  }

  if (text && hasWord(text, REPLAY_RE)) {
    return { type: "replay" };
  }
  if (isAssessmentOfferInput(expectedInput) && looksLikeDecline(original)) {
    return { type: "decline" };
  }
  if (text && hasWord(text, EXIT_RE)) {
    return { type: "exit" };
  }

  if (expectedInput === "assessment_answer") {
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "none") {
    return { type: "unknown", query: transcript };
  }

  const stepNumber = extractStepNumber(text);

  if (expectedInput === "doubt_or_navigate") {
    if (text && hasWord(text, NO_DOUBT_RE)) {
      return { type: "no_doubt" };
    }
    if (text && hasWord(text, REWATCH_RE) && !stepNumber) {
      return { type: "rewatch" };
    }
    if (text && hasWord(text, PREVIOUS_RE) && !stepNumber) {
      return { type: "review", query: transcript, stepNumber: null };
    }
    if (text && (hasWord(text, NEXT_RE) || hasWord(text, CONFIRM_RE)) && !looksLikeQuestion(original)) {
      return { type: "next" };
    }
    if (text && hasWord(text, ASSESSMENT_RE) && !looksLikeQuestion(original)) {
      return { type: "assessment" };
    }
    if (looksLikeQuestion(original)) {
      return { type: "doubt", query: transcript };
    }
    if (nativeScript) {
      return { type: "unknown", query: transcript };
    }
    if (stepNumber || looksLikeReviewRequest(text)) {
      return { type: "review", query: transcript, stepNumber };
    }
    if (text && hasWord(text, REWATCH_RE) && stepNumber) {
      return { type: "review", query: transcript, stepNumber };
    }
    if (text.includes("?") || QUESTION_RE.test(text) || text.split(" ").length >= 5) {
      return { type: "doubt", query: transcript };
    }
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "next_or_rewatch") {
    if (hasWord(text, REWATCH_RE) && !stepNumber) {
      return { type: "rewatch" };
    }
    if (hasWord(text, NEXT_RE) || hasWord(text, CONFIRM_RE)) {
      return { type: "next" };
    }
    if (stepNumber || looksLikeReviewRequest(text)) {
      return { type: "review", query: transcript, stepNumber };
    }
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "assessment_confirm") {
    if (looksLikeAssessmentConfirm(original)) {
      return { type: "assessment" };
    }
    if (hasWord(text, REWATCH_RE) && !stepNumber && !looksLikeReviewRequest(text)) {
      return { type: "rewatch" };
    }
    if (stepNumber || looksLikeReviewRequest(text) || hasWord(text, REVIEW_RE)) {
      return { type: "review", query: transcript, stepNumber };
    }
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "retake_or_review") {
    if (hasWord(text, RETAKE_RE) || hasWord(text, ASSESSMENT_RE)) {
      return { type: "retake" };
    }
    if (stepNumber || looksLikeReviewRequest(text) || hasWord(text, REVIEW_RE)) {
      return { type: "review", query: transcript, stepNumber };
    }
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "review_or_assessment") {
    if (looksLikeAssessmentConfirm(original) || hasWord(text, RETAKE_RE)) {
      return { type: "assessment" };
    }
    if (hasWord(text, REWATCH_RE) && !stepNumber && !looksLikeReviewRequest(text)) {
      return { type: "rewatch" };
    }
    if (stepNumber || looksLikeReviewRequest(text) || hasWord(text, REVIEW_RE)) {
      return { type: "review", query: transcript, stepNumber };
    }
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "confirm") {
    if (hasWord(text, CONFIRM_RE) || hasWord(text, NEXT_RE) || hasWord(text, ASSESSMENT_RE)) {
      return { type: "confirm" };
    }
    if (stepNumber || hasWord(text, REVIEW_RE) || hasWord(text, PREVIOUS_RE)) {
      return { type: "review", query: transcript, stepNumber };
    }
    return { type: "unknown", query: transcript };
  }

  if (hasWord(text, RETAKE_RE)) return { type: "retake" };
  if (hasWord(text, ASSESSMENT_RE)) return { type: "assessment" };
  if (hasWord(text, REWATCH_RE)) return { type: "rewatch" };
  if (hasWord(text, NEXT_RE)) return { type: "next" };
  if (hasWord(text, CONFIRM_RE)) return { type: "confirm" };
  if (stepNumber || looksLikeReviewRequest(text)) {
    return { type: "review", query: transcript, stepNumber };
  }
  return { type: "unknown", query: transcript };
}

function looksLikeReviewRequest(text: string): boolean {
  if (extractStepNumber(text) != null) return true;
  if (hasWord(text, REVIEW_RE)) return true;
  if (hasWord(text, PREVIOUS_RE)) return true;
  const tokens = tokenize(text);
  if (tokens.length === 0) return false;
  if (QUESTION_RE.test(text)) return false;
  return tokens.length >= 2;
}

export function looksLikeStepNavigation(transcript: string): boolean {
  const original = String(transcript || "");
  if (looksLikeQuestion(original)) return false;
  const text = normalizeText(transcript);
  if (extractStepNumber(text) != null) return true;
  if (hasWord(text, PREVIOUS_RE)) return true;
  if (hasWord(text, REWATCH_RE)) return true;
  return looksLikeReviewRequest(text);
}

export type StepMatchResult = {
  stepNumber: number | null;
  candidates: number[];
  confidence: number;
};

export function scoreStep(query: string, step: AgentStepInfo): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const title = normalizeText(step.title);
  const description = normalizeText(step.description || "");
  const points = normalizeText((step.importantPoints || []).join(" "));
  const queryTokens = tokenize(q);
  let score = 0;

  if (title && title === q) score += 12;
  else if (title && q.length >= 3 && title.includes(q)) score += 8;
  else if (title && q.length >= 3 && q.includes(title)) score += 8;

  const titleTokens = tokenize(step.title);
  const descTokens = tokenize(step.description || "");
  const pointTokens = tokenize((step.importantPoints || []).join(" "));

  for (const token of queryTokens) {
    if (titleTokens.includes(token)) score += 4;
    else if (pointTokens.includes(token)) score += 3;
    else if (descTokens.includes(token)) score += 2;
    else if (title.includes(token) || points.includes(token) || description.includes(token)) {
      score += 1;
    }
  }

  const stepNum = extractStepNumber(q);
  if (stepNum === step.stepNumber) score += 10;

  return score;
}

export function matchSteps(
  query: string,
  steps: AgentStepInfo[],
): StepMatchResult {
  const stepNum = extractStepNumber(query);
  if (stepNum && steps.some((s) => s.stepNumber === stepNum)) {
    return { stepNumber: stepNum, candidates: [stepNum], confidence: 1 };
  }

  const scored = steps
    .map((step) => ({ stepNumber: step.stepNumber, score: scoreStep(query, step) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { stepNumber: null, candidates: [], confidence: 0 };
  }

  const best = scored[0];
  const second = scored[1];
  const uniqueLead = !second || best.score >= second.score + 3;
  const strong = best.score >= 4;

  if (uniqueLead && strong) {
    return {
      stepNumber: best.stepNumber,
      candidates: scored.slice(0, 3).map((row) => row.stepNumber),
      confidence: Math.min(1, best.score / 10),
    };
  }

  const near = scored.filter((row) => row.score >= best.score - 2).map((row) => row.stepNumber);
  return {
    stepNumber: null,
    candidates: near,
    confidence: strong ? 0.45 : 0.2,
  };
}

export function titlesForSteps(
  steps: AgentStepInfo[],
  numbers: number[],
): string {
  return numbers
    .map((n) => {
      const step = steps.find((s) => s.stepNumber === n);
      return step ? `step ${step.stepNumber}, ${step.title}` : `step ${n}`;
    })
    .join("; ");
}
