import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import type { SopStep } from "../data/sops/types";
import {
  multilingualUnderstandingRule,
  type ResponseLanguage,
} from "./responseLanguage";

const GEMINI_TIMEOUT_MS = 45000;
const MAX_AUDIO_BASE64_CHARS = 8_000_000;

function getApiKey(): string {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY is not configured");
  }
  return config.geminiApiKey;
}

function stripJsonFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return t.trim();
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

async function generateJson(prompt: string): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_GROUNDING,
        responseMimeType: "application/json",
        abortSignal: controller.signal,
      },
    });
    const text = extractResponseText(response);
    if (!text) {
      throw new Error("Empty Gemini response");
    }
    return JSON.parse(stripJsonFences(text));
  } finally {
    clearTimeout(timer);
  }
}

async function generateJsonWithAudio(options: {
  prompt: string;
  audioBase64: string;
  mimeType: string;
}): Promise<unknown> {
  if (options.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new Error("Audio payload too large");
  }
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
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
      },
    });
    const text = extractResponseText(response);
    if (!text) {
      throw new Error("Empty Gemini response");
    }
    return JSON.parse(stripJsonFences(text));
  } finally {
    clearTimeout(timer);
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

export async function transcribeSpeech(options: {
  audioBase64: string;
  mimeType: string;
}): Promise<{ transcript: string; emptyOrNoise: boolean }> {
  const parsed = (await generateJsonWithAudio({
    audioBase64: options.audioBase64,
    mimeType: options.mimeType,
    prompt: `
Carefully transcribe what the HUMAN said in this audio.
The speaker may use Tamil, English, Hindi, or mix those languages in the same utterance.
Transcribe in the original languages used. Do not translate.
If silence or noise only, transcript must be "".
Do not add extra words.

Return JSON:
{
  "transcript": "full careful transcription or empty string",
  "emptyOrNoise": false
}
`,
  })) as { transcript?: string; emptyOrNoise?: boolean };

  const transcript = String(parsed.transcript || "").trim();
  const emptyOrNoise =
    Boolean(parsed.emptyOrNoise) ||
    transcript.length === 0 ||
    (/^[a-zA-Z0-9+\s]+$/.test(transcript) && transcript.length < 3);
  return { transcript, emptyOrNoise };
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

The staff member just watched this training step:
${stepDetails}

Staff question or doubt: ${JSON.stringify(options.question)}

${multilingualUnderstandingRule(options.responseLanguage || "en")}

Answer as a professional ${options.trainingTitle} trainer.
Use ONLY the approved SOP above as the source of truth. Do not invent procedures, products, timings, or salon advice.
Understand the staff member's meaning even if grammar, wording, or language is imperfect or mixed.
If they ask why, how, which product, which intensity, or which skin type, explain the meaning from the SOP.
If the question is about another documented step, answer from that step in the SOP.
Answer only what they asked. Do not recap the full step unless they asked for those details.
Keep the answer concise, clear, and practical — two to four sentences unless more detail is essential.
If the question is outside the documented SOP, say so briefly and invite them to continue training.
Write the "answer" field entirely in the selected response language.

Return JSON:
{
  "answer": "professional spoken answer",
  "inScope": true
}
`)) as { answer?: string; inScope?: boolean };

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
  const stepList = options.steps
    .map(
      (s) =>
        `Step ${s.stepNumber}: ${s.title} | ${s.description} | ${(s.importantPoints || []).join("; ")}`,
    )
    .join("\n");

  const parsed = (await generateJson(`
${options.sopContext}

Approved steps:
${stepList}

Expected staff reply type: ${options.expectedInput}
Staff said: ${JSON.stringify(options.transcript)}

Classify the staff utterance for a voice training tutor.
The staff may speak Tamil, English, Hindi, or mix them in one sentence. Classify by meaning, not by which language they used.
Valid intents: confirm, next, rewatch, assessment, retake, review, exit, replay, unknown.
If they are asking a question or expressing a doubt about a product, method, or step, use intent=unknown (the tutor will answer the doubt). Do NOT use review unless they clearly asked to play or watch that step's video.
If they name a step only to ask about it, intent=unknown.
If they clearly ask to play/watch/go to a step, intent=review and the matching stepNumber.
Only use a stepNumber that exists in the approved steps.
Do NOT invent SOP content.
If unsure, intent=unknown and confidence below 0.5.

Return JSON:
{
  "intent": "confirm",
  "stepNumber": null,
  "confidence": 0.0,
  "clarification": "short message if unknown or ambiguous"
}
`)) as {
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
${options.sopContext}

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

Rewrite the following salon trainer utterance so a staff member can hear it spoken aloud.
Keep the same meaning, facts, step numbers, product names, and timings.
Do not add new SOP content.
Do not explain the translation.
Output only the rewritten spoken line in the selected response language.

Source utterance:
${JSON.stringify(text)}

Return JSON:
{ "speech": "rewritten spoken utterance" }
`)) as { speech?: string };
    const speech = String(parsed.speech || "").trim() || text;
    localizeCache.set(cacheKey, speech);
    return speech;
  } catch {
    return text;
  }
}

