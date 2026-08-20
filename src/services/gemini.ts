import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import type { SopStep } from "../data/sops/types";
import { looksLikeEmptyOrNoiseTranscript } from "./agentIntents";
import {
  multilingualUnderstandingRule,
  type ResponseLanguage,
} from "./responseLanguage";

const GEMINI_TIMEOUT_MS = 45000;
const MAX_AUDIO_BASE64_CHARS = 8_000_000;

let geminiClient: GoogleGenAI | null = null;

function getApiKey(): string {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY is not configured");
  }
  return config.geminiApiKey;
}

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: getApiKey() });
  }
  return geminiClient;
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t.trim();
}

function repairTruncatedJson(text: string): string {
  let t = text.trim();
  if (!t) return t;
  const quotes = (t.match(/"/g) || []).length;
  if (quotes % 2 === 1) t += '"';
  const openBrackets = (t.match(/\[/g) || []).length;
  const closeBrackets = (t.match(/]/g) || []).length;
  if (openBrackets > closeBrackets) t += "]".repeat(openBrackets - closeBrackets);
  const openBraces = (t.match(/{/g) || []).length;
  const closeBraces = (t.match(/}/g) || []).length;
  if (openBraces > closeBraces) t += "}".repeat(openBraces - closeBraces);
  return t;
}

export function parseModelJson(text: string): unknown {
  const stripped = stripJsonFences(text);
  const candidates = [stripped];
  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart >= 0) {
    if (objectEnd > objectStart) {
      candidates.push(stripped.slice(objectStart, objectEnd + 1));
    }
    candidates.push(repairTruncatedJson(stripped.slice(objectStart)));
  }
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Empty Gemini response");
}

function extractResponseText(response: unknown): string {
  const r = response as {
    text?: string;
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  if (typeof r.text === "string" && r.text.trim()) {
    return r.text.trim();
  }
  let text = "";
  for (const part of r.candidates?.[0]?.content?.parts ?? []) {
    if (typeof part.text === "string" && !part.thought) {
      text += part.text;
    }
  }
  return text.trim();
}

export function formatSopContext(input: {
  title: string;
  description: string;
  steps: SopStep[];
}): string {
  const lines: string[] = [
    `Service: ${input.title}`,
    input.description ? `Description: ${input.description}` : "",
    "",
    "Approved SOP steps (SOURCE OF TRUTH — do not invent procedures):",
  ];
  for (const step of input.steps) {
    lines.push(`Step ${step.stepNumber}: ${step.title}`);
    lines.push(`Description: ${step.description}`);
    if (step.importantPoints?.length) {
      lines.push(`Important points: ${step.importantPoints.join("; ")}`);
    }
    lines.push("");
  }
  return lines.filter((l) => l !== undefined).join("\n");
}

const SYSTEM_GROUNDING = `You are an SOP training evaluator for a salon staff training system.
You MUST only use the approved SOP content provided.
Do NOT invent procedures, products, steps, or salon advice that is not in the SOP.
Accept answers that convey the correct meaning even if wording differs or language varies.
The staff may speak Tamil, English, Hindi, or mix those languages in one sentence.
Return valid JSON only.`;

function logGeminiMs(label: string, startedAt: number): void {
  console.log(`[agent-latency] gemini ${label} ${Date.now() - startedAt}ms`);
}

async function generateJson(prompt: string, maxOutputTokens = 512): Promise<unknown> {
  const ai = getGeminiClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_GROUNDING,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
        maxOutputTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = extractResponseText(response);
    if (!text) {
      throw new Error("Empty Gemini response");
    }
    return parseModelJson(text);
  } finally {
    clearTimeout(timer);
    logGeminiMs("json", startedAt);
  }
}

async function generateJsonWithAudio(options: {
  prompt: string;
  audioBase64: string;
  mimeType: string;
  maxOutputTokens?: number;
}): Promise<unknown> {
  if (options.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new Error("Audio payload too large");
  }
  const ai = getGeminiClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: options.audioBase64,
                mimeType: options.mimeType,
              },
            },
            { text: options.prompt },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_GROUNDING,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
        maxOutputTokens: options.maxOutputTokens ?? 256,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = extractResponseText(response);
    if (!text) {
      throw new Error("Empty Gemini response");
    }
    return parseModelJson(text);
  } finally {
    clearTimeout(timer);
    logGeminiMs("audio", startedAt);
  }
}

export type GeneratedQuestion = {
  index: number;
  questionText: string;
  relatedStepNumbers: number[];
};

export async function generateLearningQuestions(options: {
  sopContext: string;
  previousQuestions?: string[];
}): Promise<GeneratedQuestion[]> {
  const previous = options.previousQuestions || [];
  const avoid =
    previous.length > 0
      ? `Avoid repeating these previous learning-check questions where possible:\n${previous
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}`
      : "No previous learning-check questions.";

  const parsed = (await generateJson(`
${options.sopContext}

Task: Generate exactly 3 learning-check questions based ONLY on the SOP above.
Cover different steps where possible.
Questions should check basic understanding before a final assessment.
Do NOT invent SOP procedures.
${avoid}

Return JSON:
{
  "questions": [
    { "index": 1, "questionText": "...", "relatedStepNumbers": [1] },
    { "index": 2, "questionText": "...", "relatedStepNumbers": [2] },
    { "index": 3, "questionText": "...", "relatedStepNumbers": [3] }
  ]
}
`)) as { questions?: GeneratedQuestion[] };

  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (questions.length !== 3) {
    throw new Error("Gemini did not return exactly 3 learning questions");
  }
  return questions.map((q, i) => ({
    index: i + 1,
    questionText: String(q.questionText || "").trim(),
    relatedStepNumbers: Array.isArray(q.relatedStepNumbers)
      ? q.relatedStepNumbers.map(Number).filter((n) => n > 0)
      : [],
  }));
}

export async function evaluateLearningAnswers(options: {
  sopContext: string;
  questions: Array<{ index: number; questionText: string }>;
  answers: Array<{ index: number; transcript: string }>;
}): Promise<{
  ready: boolean;
  feedback: string;
  perQuestion: Array<{ index: number; correct: boolean; feedback: string }>;
}> {
  const parsed = (await generateJson(`
${options.sopContext}

Learning-check questions and staff answers (transcripts):
${JSON.stringify({ questions: options.questions, answers: options.answers }, null, 2)}

Evaluate whether the staff demonstrates sufficient basic understanding of the approved SOP to take the final assessment.
Be fair: accept correct meaning, not exact wording.
If most answers are substantially correct, set ready=true.
If understanding is insufficient, set ready=false and tell them which SOP steps to review.

Return JSON:
{
  "ready": true,
  "feedback": "short message for the staff",
  "perQuestion": [
    { "index": 1, "correct": true, "feedback": "..." }
  ]
}
`)) as {
    ready?: boolean;
    feedback?: string;
    perQuestion?: Array<{ index: number; correct: boolean; feedback: string }>;
  };

  return {
    ready: Boolean(parsed.ready),
    feedback: String(parsed.feedback || "").trim(),
    perQuestion: Array.isArray(parsed.perQuestion)
      ? parsed.perQuestion.map((p) => ({
          index: Number(p.index),
          correct: Boolean(p.correct),
          feedback: String(p.feedback || "").trim(),
        }))
      : [],
  };
}

export async function generateAssessmentQuestions(options: {
  sopContext: string;
  previousQuestions: string[];
}): Promise<GeneratedQuestion[]> {
  const count = Math.max(1, Number(config.assessmentQuestionCount) || 5);
  const avoid =
    options.previousQuestions.length > 0
      ? `Avoid repeating these previous questions where possible:\n${options.previousQuestions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}`
      : "No previous questions.";

  const parsed = (await generateJson(`
${options.sopContext}

Task: Generate exactly ${count} final assessment questions based ONLY on this SOP.
Cover different steps where possible. Do NOT ask random general salon questions.
${avoid}

Return JSON:
{
  "questions": [
    { "index": 1, "questionText": "...", "relatedStepNumbers": [1] }
  ]
}
`)) as { questions?: GeneratedQuestion[] };

  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const usable = questions
    .map((q) => ({
      questionText: String(q.questionText || "").trim(),
      relatedStepNumbers: Array.isArray(q.relatedStepNumbers)
        ? q.relatedStepNumbers.map(Number).filter((n) => n > 0)
        : [],
    }))
    .filter((q) => q.questionText.length > 0);

  if (usable.length < count) {
    throw new Error(`Gemini did not return exactly ${count} assessment questions`);
  }

  return shuffle(usable)
    .slice(0, count)
    .map((q, i) => ({
      index: i + 1,
      questionText: q.questionText,
      relatedStepNumbers: q.relatedStepNumbers,
    }));
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

export function formatSopIndex(
  steps: Array<{ stepNumber: number; title: string }>,
): string {
  return steps.map((s) => `Step ${s.stepNumber}: ${s.title}`).join("\n");
}

export async function transcribeSpeech(options: {
  audioBase64: string;
  mimeType: string;
  expectedInput?: string;
  stepIndex?: string;
}): Promise<{
  transcript: string;
  emptyOrNoise: boolean;
  intent?: GeminiAgentIntent["intent"];
  stepNumber?: number | null;
  confidence?: number;
}> {
  const classify = Boolean(options.expectedInput);
  try {
    const parsed = (await generateJsonWithAudio({
    audioBase64: options.audioBase64,
    mimeType: options.mimeType,
    maxOutputTokens: classify ? 280 : 160,
    prompt: `
Transcribe the HUMAN speech. Tamil, English, Hindi, or mixed is allowed.
Transcribe in the original languages. Do not translate.
If silence or noise only, transcript must be "" and emptyOrNoise true.
Do not invent words.

${classify ? `Also classify meaning for expected reply type: ${options.expectedInput}.
Steps:\n${options.stepIndex || "(none)"}
Valid intents: confirm, next, rewatch, assessment, retake, review, exit, replay, decline, unknown.
Use confirm/assessment only for an explicit yes/ready/start. Use decline for no/not yet/later/இல்லை/வேண்டாம்/नहीं.
If they ask a training question, intent=unknown. If they ask to play a step, intent=review with stepNumber.
` : ""}
Return JSON:
{
  "transcript": "",
  "emptyOrNoise": false${classify ? `,
  "intent": "unknown",
  "stepNumber": null,
  "confidence": 0.0` : ""}
}
`,
  })) as {
    transcript?: string;
    emptyOrNoise?: boolean;
    intent?: GeminiAgentIntent["intent"];
    stepNumber?: number | null;
    confidence?: number;
  };

  const transcript = String(parsed.transcript || "").trim();
  const emptyOrNoise =
    Boolean(parsed.emptyOrNoise) || looksLikeEmptyOrNoiseTranscript(transcript);
  if (!classify || emptyOrNoise) {
    return { transcript, emptyOrNoise };
  }
  return {
    transcript,
    emptyOrNoise,
    intent: parsed.intent,
    stepNumber: parsed.stepNumber ?? null,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
  };
  } catch {
    return { transcript: "", emptyOrNoise: true };
  }
}

export async function transcribeAndEvaluateAnswer(options: {
  sopContext: string;
  questionText: string;
  relatedStepNumbers: number[];
  audioBase64: string;
  mimeType: string;
}): Promise<{
  transcript: string;
  emptyOrNoise: boolean;
  correct: boolean;
  feedback: string;
}> {
  try {
    const parsed = (await generateJsonWithAudio({
    audioBase64: options.audioBase64,
    mimeType: options.mimeType,
    prompt: `
${options.sopContext}

Current assessment question:
"${options.questionText}"
Related SOP steps: ${options.relatedStepNumbers.join(", ") || "n/a"}

1) Carefully transcribe what the HUMAN said. They may speak Tamil, English, Hindi, or mix them. Transcribe in the original languages; do not translate. If silence/noise only, transcript must be "".
2) Evaluate whether the answer demonstrates correct understanding based ONLY on the approved SOP.
Accept natural wording / meaning matches in any language. Do not invent SOP content.

Return JSON:
{
  "transcript": "full careful transcription or empty string",
  "emptyOrNoise": false,
  "correct": true,
  "feedback": "short feedback"
}
`,
  })) as {
    transcript?: string;
    emptyOrNoise?: boolean;
    correct?: boolean;
    feedback?: string;
  };

  const transcript = String(parsed.transcript || "").trim();
  const emptyOrNoise =
    Boolean(parsed.emptyOrNoise) ||
    transcript.length === 0 ||
    (/^[a-zA-Z0-9+\s]+$/.test(transcript) && transcript.length < 3);

  return {
    transcript,
    emptyOrNoise,
    correct: emptyOrNoise ? false : Boolean(parsed.correct),
    feedback: String(parsed.feedback || "").trim(),
  };
  } catch {
    return {
      transcript: "",
      emptyOrNoise: true,
      correct: false,
      feedback: "",
    };
  }
}

export async function evaluateTextAnswer(options: {
  sopContext: string;
  questionText: string;
  relatedStepNumbers: number[];
  transcript: string;
}): Promise<{ correct: boolean; feedback: string }> {
  const parsed = (await generateJson(`
${options.sopContext}

Question: ${options.questionText}
Related steps: ${options.relatedStepNumbers.join(", ") || "n/a"}
Staff answer transcript: ${options.transcript}

Evaluate based ONLY on the approved SOP. Accept meaning matches in any language (Tamil, English, Hindi, or mixed).

Return JSON:
{ "correct": true, "feedback": "short feedback" }
`)) as { correct?: boolean; feedback?: string };

  return {
    correct: Boolean(parsed.correct),
    feedback: String(parsed.feedback || "").trim(),
  };
}

export async function answerStepDoubt(options: {
  sopContext: string;
  trainingTitle: string;
  step: {
    stepNumber: number;
    title: string;
    description: string;
    importantPoints: string[];
  };
  question: string;
  responseLanguage?: ResponseLanguage;
}): Promise<{ answer: string; inScope: boolean }> {
  const stepDetails = [
    `Step ${options.step.stepNumber}: ${options.step.title}`,
    options.step.description ? `Description: ${options.step.description}` : "",
    options.step.importantPoints?.length
      ? `Important points: ${options.step.importantPoints.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = (await generateJson(`
${options.sopContext}

Staff question about step ${options.step.stepNumber} (${options.step.title}): ${JSON.stringify(options.question)}
Current step details: ${stepDetails}

${multilingualUnderstandingRule(options.responseLanguage || "en")}

Answer as a professional ${options.trainingTitle} trainer.
Use ONLY the approved SOP. Do not invent procedures or products.
Understand mixed Tamil/English/Hindi. Answer only what they asked, in two to four sentences.
Write the "answer" field entirely in the selected response language.

Return JSON:
{
  "answer": "professional spoken answer",
  "inScope": true
}
`, 400)) as { answer?: string; inScope?: boolean };

  const answer = String(parsed.answer || "").trim();
  if (!answer) {
    return {
      answer:
        "I could not find that in the approved SOP for this step. We can continue whenever you are ready.",
      inScope: false,
    };
  }
  return {
    answer,
    inScope: Boolean(parsed.inScope),
  };
}

export type GeminiAgentIntent = {
  intent:
    | "confirm"
    | "next"
    | "rewatch"
    | "assessment"
    | "retake"
    | "review"
    | "exit"
    | "replay"
    | "decline"
    | "unknown";
  stepNumber: number | null;
  confidence: number;
  clarification: string;
};

export async function interpretTrainingUtterance(options: {
  transcript: string;
  expectedInput: string;
  sopContext: string;
  steps: Array<{
    stepNumber: number;
    title: string;
    description: string;
    importantPoints: string[];
  }>;
}): Promise<GeminiAgentIntent> {
  const stepList = formatSopIndex(options.steps);

  const parsed = (await generateJson(`
Expected staff reply type: ${options.expectedInput}
Staff said: ${JSON.stringify(options.transcript)}
Steps:
${stepList}

Classify by meaning. Tamil, English, Hindi, or mixed is allowed.
Valid intents: confirm, next, rewatch, assessment, retake, review, exit, replay, decline, unknown.
If expected reply is assessment_confirm, review_or_assessment, or retake_or_review:
- confirm/assessment only for explicit yes/ready/start (ஆம், हाँ included).
- decline for no/not yet/later (இல்லை, வேண்டாம், नहीं included).
If they ask a question about a step, unknown. If they ask to play a step, review plus stepNumber.
If unsure, unknown and confidence below 0.5.

Return JSON:
{
  "intent": "unknown",
  "stepNumber": null,
  "confidence": 0.0,
  "clarification": ""
}
`, 220)) as {
    intent?: GeminiAgentIntent["intent"];
    stepNumber?: number | null;
    confidence?: number;
    clarification?: string;
  };

  const allowed: GeminiAgentIntent["intent"][] = [
    "confirm",
    "next",
    "rewatch",
    "assessment",
    "retake",
    "review",
    "exit",
    "replay",
    "decline",
    "unknown",
  ];
  const intent = allowed.includes(parsed.intent as GeminiAgentIntent["intent"])
    ? (parsed.intent as GeminiAgentIntent["intent"])
    : "unknown";
  const stepNumber =
    parsed.stepNumber != null && Number(parsed.stepNumber) > 0
      ? Number(parsed.stepNumber)
      : null;
  const validStep =
    stepNumber && options.steps.some((s) => s.stepNumber === stepNumber)
      ? stepNumber
      : null;

  return {
    intent,
    stepNumber: validStep,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    clarification: String(parsed.clarification || "").trim(),
  };
}

export async function selectReviewStep(options: {
  query: string;
  sopContext: string;
  steps: Array<{
    stepNumber: number;
    title: string;
    description: string;
    importantPoints: string[];
  }>;
}): Promise<{
  stepNumber: number | null;
  confidence: number;
  alternatives: number[];
  clarification: string;
}> {
  const stepList = options.steps
    .map(
      (s) =>
        `Step ${s.stepNumber}: ${s.title} | ${s.description} | ${(s.importantPoints || []).join("; ")}`,
    )
    .join("\n");

  const parsed = (await generateJson(`
Approved steps:
${stepList}

Staff asked to review: ${JSON.stringify(options.query)}

Pick the single best matching step number from the approved list.
If two or more steps are equally likely, set stepNumber to null and list them in alternatives.
Only use existing step numbers. Do NOT invent procedures.

Return JSON:
{
  "stepNumber": 1,
  "confidence": 0.0,
  "alternatives": [1],
  "clarification": "short message if ambiguous or not found"
}
`)) as {
    stepNumber?: number | null;
    confidence?: number;
    alternatives?: number[];
    clarification?: string;
  };

  const valid = new Set(options.steps.map((s) => s.stepNumber));
  const alternatives = (Array.isArray(parsed.alternatives) ? parsed.alternatives : [])
    .map(Number)
    .filter((n) => valid.has(n));
  const stepNumber =
    parsed.stepNumber != null && valid.has(Number(parsed.stepNumber))
      ? Number(parsed.stepNumber)
      : null;

  return {
    stepNumber,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    alternatives: alternatives.length ? alternatives : stepNumber ? [stepNumber] : [],
    clarification: String(parsed.clarification || "").trim(),
  };
}

const localizeCache = new Map<string, string>();

export async function localizeTrainerSpeech(options: {
  text: string;
  responseLanguage: ResponseLanguage;
}): Promise<string> {
  const text = String(options.text || "").trim();
  if (!text) return "";
  if (options.responseLanguage === "en") return text;

  const cacheKey = `${options.responseLanguage}::${text}`;
  const cached = localizeCache.get(cacheKey);
  if (cached) return cached;

  try {
    const parsed = (await generateJson(`
${multilingualUnderstandingRule(options.responseLanguage)}

Rewrite this trainer line for spoken playback in the selected response language.
Keep facts, step numbers, product names, and timings. Do not add SOP content.

${JSON.stringify(text)}

Return JSON:
{ "speech": "rewritten spoken utterance" }
`, 220)) as { speech?: string };
    const speech = String(parsed.speech || "").trim() || text;
    localizeCache.set(cacheKey, speech);
    return speech;
  } catch {
    return text;
  }
}

