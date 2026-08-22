import type { SopDefinition } from "../data/sops/types";
import { normalizeText, tokenize } from "./agentIntents";

/**
 * True when the staff mostly repeated the question instead of answering it.
 * Used to stop keyword-overlap / question-read transcripts from scoring as correct.
 */
export function looksLikeQuestionEcho(questionText: string, transcript: string): boolean {
  const question = String(questionText || "").trim();
  const answer = String(transcript || "").trim();
  if (!answer) return false;

  const q = normalizeText(question);
  const a = normalizeText(answer);
  if (q && a) {
    if (a === q) return true;
    if (q.includes(a) && a.length >= Math.min(12, q.length)) return true;
    if (a.includes(q) && a.length <= q.length + 24) return true;
  }

  const questionTokens = tokenize(question);
  const answerTokens = tokenize(answer);
  if (answerTokens.length === 0) {
    // Non-Latin answers may not tokenize; fall back to raw overlap.
    const compactQ = question.replace(/\s+/g, "");
    const compactA = answer.replace(/\s+/g, "");
    return Boolean(compactQ && compactA && compactQ.includes(compactA) && compactA.length >= 8);
  }

  const questionSet = new Set(questionTokens);
  const overlap = answerTokens.filter((token) => questionSet.has(token)).length;
  const overlapRatio = overlap / answerTokens.length;
  const extraTokens = answerTokens.filter((token) => !questionSet.has(token));
  // Reading the question back, or adding only filler around it, is not an answer.
  if (overlapRatio >= 0.75 && extraTokens.length <= 1) return true;
  if (answerTokens.length <= 6 && overlap === answerTokens.length && extraTokens.length === 0) {
    return true;
  }
  return false;
}

export function formatRelatedStepAnswerKey(
  training: Pick<SopDefinition, "steps">,
  relatedStepNumbers: number[],
): string {
  const wanted =
    relatedStepNumbers?.length > 0
      ? relatedStepNumbers
      : training.steps.map((step) => step.stepNumber);
  const lines: string[] = [
    "Approved answer content (SOP text and caption-equivalent locale copy).",
    "Mark correct only if the staff stated a fact from this content that actually answers the question.",
  ];
  for (const stepNumber of wanted) {
    const step = training.steps.find((item) => item.stepNumber === stepNumber);
    if (!step) continue;
    lines.push(`Step ${step.stepNumber}: ${step.title}`);
    lines.push(`English SOP / caption: ${step.description}`);
    if (step.importantPoints?.length) {
      lines.push(`English key points: ${step.importantPoints.join("; ")}`);
    }
    const ta = step.locales?.ta;
    if (ta?.description) lines.push(`Tamil caption/content: ${ta.description}`);
    if (ta?.importantPoints?.length) {
      lines.push(`Tamil key points: ${ta.importantPoints.join("; ")}`);
    }
    const hi = step.locales?.hi;
    if (hi?.description) lines.push(`Hindi caption/content: ${hi.description}`);
    if (hi?.importantPoints?.length) {
      lines.push(`Hindi key points: ${hi.importantPoints.join("; ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export const STRICT_ASSESSMENT_RUBRIC = `STRICT assessment grading (do not be lenient):
- correct=true only if the staff actually answered the question with a specific SOP/caption fact (method, product, number, duration, ratio, intensity, or named concern).
- Repeating or reading the question is always incorrect.
- Mentioning a topic, step title, or keywords that already appear in the question is not enough.
- Partial or vague answers (for example "cleansing", "skin analysis", "use the machine") are incorrect unless they include the required SOP fact.
- The fact must match the approved SOP / caption content. Do not invent procedures.
- Accept Tamil, English, Hindi, or mixed wording when the meaning of that SOP fact is clearly present.
- If unsure, set correct=false.`;

export function finalizeAssessmentCorrectness(options: {
  questionText: string;
  transcript: string;
  modelCorrect: boolean;
}): boolean {
  if (!options.transcript.trim()) return false;
  if (looksLikeQuestionEcho(options.questionText, options.transcript)) return false;
  return Boolean(options.modelCorrect);
}
