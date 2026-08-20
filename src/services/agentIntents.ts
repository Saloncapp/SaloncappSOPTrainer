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
  /\b(next|continue|move on|move to next|go to next|go ahead|proceed|skip|next step|next video|play the next|go to the next)\b/;
const REWATCH_RE =
  /\b(rewatch|watch again|play again|replay|once more|one more time|again)\b/;
const ASSESSMENT_RE =
  /\b(assessment|assesment|quiz|test|exam|evaluation|questions)\b/;
const RETAKE_RE =
  /\b(retake|re take|try again|take again|attempt again|do it again)\b/;
const EXIT_RE = /\b(stop|exit|quit|later|not now|pause)\b/;
const REPLAY_RE =
  /\b(repeat|say that again|what was that|pardon|come again|say again)\b/;
const REVIEW_RE =
  /\b(review|rewatch|watch|play|show me|go to|open)\b/;
const PREVIOUS_RE =
  /\b(previous|go back|earlier step|earlier video|watch previous|last video|previous step|play the previous)\b/;
const TA_PREVIOUS_RE = /முந்தைய|முந்தய|முன் படி|முன்படி/;
const TA_NEXT_RE = /அடுத்த படி|அடுத்தது/;
const HI_PREVIOUS_RE = /पिछला|पिछले|पहले वाला|पिछला स्टेप/;
const HI_NEXT_RE = /अगला कदम|अगला स्टेप|अगला चरण/;
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

const EN_STEP_WORDS: Record<string, number> = {
  one: 1,
  first: 1,
  "1st": 1,
  two: 2,
  second: 2,
  "2nd": 2,
  three: 3,
  third: 3,
  "3rd": 3,
  four: 4,
  fourth: 4,
  "4th": 4,
  five: 5,
  fifth: 5,
  "5th": 5,
  six: 6,
  sixth: 6,
  "6th": 6,
  seven: 7,
  seventh: 7,
  "7th": 7,
  eight: 8,
  eighth: 8,
  "8th": 8,
  nine: 9,
  ninth: 9,
  "9th": 9,
  ten: 10,
  tenth: 10,
  "10th": 10,
};

const TA_STEP_WORDS: Record<string, number> = {
  ஒன்று: 1,
  முதல்: 1,
  இரண்டு: 2,
  மூன்று: 3,
  நான்கு: 4,
  ஐந்து: 5,
  ஆறு: 6,
  ஏழு: 7,
  எட்டு: 8,
  ஒன்பது: 9,
  பத்து: 10,
};

const HI_STEP_WORDS: Record<string, number> = {
  एक: 1,
  पहला: 1,
  पहले: 1,
  दो: 2,
  दूसरा: 2,
  तीन: 3,
  तीसरा: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
};

function parseStepToken(token: string): number | null {
  const raw = String(token || "").trim().toLowerCase();
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n > 0 ? n : null;
  }
  return EN_STEP_WORDS[raw] ?? TA_STEP_WORDS[token] ?? HI_STEP_WORDS[token] ?? null;
}

/** Drop the Agent's own "Got it, I'll play Step N..." so TTS echo cannot become the target. */
export function stripAgentPlaybackEcho(transcript: string): string {
  return String(transcript || "")
    .replace(
      /\bgot it\.?\s*i(?:'|’| will|\s+)?l*l play the step \d+ training video now(?:\.\s*please watch carefully)?\.?/gi,
      " ",
    )
    .replace(
      /\bi(?:'|’| will|\s+)?l*l play the step \d+ training video now(?:\.\s*please watch carefully)?\.?/gi,
      " ",
    )
    .replace(/\bplease watch carefully\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lastCapturedStep(matches: Iterable<RegExpMatchArray>): number | null {
  let found: number | null = null;
  for (const match of matches) {
    const parsed = parseStepToken(match[1] || "");
    if (parsed) found = parsed;
  }
  return found;
}

export function extractStepNumber(text: string): number | null {
  const original = stripAgentPlaybackEcho(text);
  if (!original) return null;
  const latin = normalizeText(original);

  const commanded = lastCapturedStep(
    latin.matchAll(
      /\b(?:play|go to|goto|move to|open|watch|show|want to watch|want to play)\s+(?:the\s+)?(?:step\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b/g,
    ),
  );
  if (commanded) return commanded;

  const firstStep = lastCapturedStep(
    latin.matchAll(
      /\b(?:play|go to|goto|move to|open|watch|show)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+step\b/g,
    ),
  );
  if (firstStep) return firstStep;

  const ta = original.match(
    /(?:ஸ்டெப்|ஸ்டேப்|படி)\s*(\d{1,2}|ஒன்று|முதல்|இரண்டு|மூன்று|நான்கு|ஐந்து|ஆறு|ஏழு|எட்டு|ஒன்பது|பத்து)/,
  );
  if (ta) {
    const parsed = parseStepToken(ta[1]);
    if (parsed) return parsed;
  }
  if (/முதல்\s*(?:படி|ஸ்டெப்|ஸ்டேப்)/.test(original)) return 1;

  const hi = original.match(
    /(?:स्टेप|चरण)\s*(\d{1,2}|एक|पहला|दो|दूसरा|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस)/,
  );
  if (hi) {
    const parsed = parseStepToken(hi[1]);
    if (parsed) return parsed;
  }
  if (/पहला\s*(?:स्टेप|चरण)/.test(original)) return 1;

  return lastCapturedStep(
    latin.matchAll(
      /\bstep\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g,
    ),
  );
}

export function looksLikePlayStepRequest(transcript: string): boolean {
  if (extractStepNumber(transcript) == null) return false;
  const original = String(transcript || "");
  const latin = normalizeText(stripAgentPlaybackEcho(original));
  if (
    /\b(play|go to|goto|move to|open|watch|show|want to watch|want to play|first step|second step)\b/.test(
      latin,
    )
  ) {
    return true;
  }
  if (/(ஸ்டெப்|ஸ்டேப்|படி|வீடியோ|பார்)/.test(original)) return true;
  if (/(स्टेप|चरण|वीडियो|चलाओ|देखो)/.test(original)) return true;
  return false;
}

function hasWord(text: string, re: RegExp): boolean {
  return re.test(normalizeText(text));
}

function looksLikePreviousUtterance(original: string, text: string): boolean {
  if (TA_PREVIOUS_RE.test(original) || HI_PREVIOUS_RE.test(original)) return true;
  return Boolean(text) && hasWord(text, PREVIOUS_RE);
}

export function isPreviousStepRequest(transcript: string): boolean {
  const original = String(transcript || "").trim();
  if (!original) return false;
  if (extractStepNumber(original) != null) return false;
  return looksLikePreviousUtterance(original, normalizeText(original));
}

function looksLikeNextUtterance(original: string, text: string): boolean {
  if (TA_NEXT_RE.test(original) || HI_NEXT_RE.test(original)) return true;
  return Boolean(text) && hasWord(text, NEXT_RE);
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

  const stepNumber = extractStepNumber(original);
  if (stepNumber && looksLikePlayStepRequest(original)) {
    return { type: "review", query: transcript, stepNumber };
  }
  if (looksLikePreviousUtterance(original, text) && !stepNumber) {
    return { type: "review", query: transcript, stepNumber: null };
  }
  if (
    stepNumber &&
    !looksLikeQuestion(original) &&
    (looksLikeReviewRequest(text) || hasWord(text, REVIEW_RE) || looksLikeNextUtterance(original, text))
  ) {
    return { type: "review", query: transcript, stepNumber };
  }

  if (expectedInput === "none") {
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "doubt_or_navigate") {
    if (text && hasWord(text, NO_DOUBT_RE)) {
      return { type: "no_doubt" };
    }
    if (text && hasWord(text, REWATCH_RE) && !stepNumber) {
      return { type: "rewatch" };
    }
    if (looksLikePreviousUtterance(original, text) && !stepNumber) {
      return { type: "review", query: transcript, stepNumber: null };
    }
    if ((looksLikeNextUtterance(original, text) || hasWord(text, CONFIRM_RE)) && !looksLikeQuestion(original)) {
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
    if (looksLikeNextUtterance(original, text) || hasWord(text, CONFIRM_RE)) {
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
    if (hasWord(text, REWATCH_RE) && !stepNumber && !looksLikeReviewRequest(text)) {
      return { type: "rewatch" };
    }
    if (looksLikeNextUtterance(original, text) && !looksLikeQuestion(original)) {
      return { type: "next" };
    }
    if (stepNumber || looksLikeReviewRequest(text) || hasWord(text, REVIEW_RE)) {
      return { type: "review", query: transcript, stepNumber };
    }
    if (looksLikeQuestion(original) || text.includes("?") || QUESTION_RE.test(text) || text.split(" ").length >= 5) {
      return { type: "doubt", query: transcript };
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
    if (looksLikeQuestion(original) || text.includes("?") || QUESTION_RE.test(text)) {
      return { type: "doubt", query: transcript };
    }
    return { type: "unknown", query: transcript };
  }

  if (expectedInput === "confirm") {
    if (hasWord(text, CONFIRM_RE) || looksLikeNextUtterance(original, text) || hasWord(text, ASSESSMENT_RE)) {
      return { type: "confirm" };
    }
    if (stepNumber || hasWord(text, REVIEW_RE) || looksLikePreviousUtterance(original, text)) {
      return { type: "review", query: transcript, stepNumber };
    }
    return { type: "unknown", query: transcript };
  }

  if (hasWord(text, RETAKE_RE)) return { type: "retake" };
  if (hasWord(text, ASSESSMENT_RE)) return { type: "assessment" };
  if (hasWord(text, REWATCH_RE)) return { type: "rewatch" };
  if (looksLikeNextUtterance(original, text)) return { type: "next" };
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
  if (looksLikePreviousUtterance(original, text)) return true;
  if (looksLikeNextUtterance(original, text)) return true;
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
