import AssessmentAttempt, {
  IAssessmentAttempt,
} from "../models/AssessmentAttempt";
import { IStaffTrainingProgress } from "../models/StaffTrainingProgress";
import type { SopDefinition } from "../data/sops/types";
import type { StaffAuth } from "../middleware/auth";
import {
  formatSopContext,
  generateAssessmentQuestions,
  generateLearningQuestions,
  evaluateLearningAnswers,
  transcribeAndEvaluateAnswer,
  transcribeSpeech,
  evaluateTextAnswer,
} from "./gemini";
import { allStepsCompleted, markAssessmentFailed } from "./progress";
import { config } from "../config";
import { formatRelatedStepAnswerKey } from "./assessmentScoring";

function sopContext(training: SopDefinition): string {
  return formatSopContext({
    title: training.title,
    description: training.description,
    steps: training.steps,
  });
}

function timeLimitSeconds(): number {
  return Number(config.assessmentTimeLimitSeconds) > 0
    ? Number(config.assessmentTimeLimitSeconds)
    : 300;
}

function assessmentQuestionCount(): number {
  return Number(config.assessmentQuestionCount) > 0
    ? Number(config.assessmentQuestionCount)
    : 5;
}

export function getAttemptExpiresAt(attempt: IAssessmentAttempt): Date {
  if (attempt.expiresAt) return new Date(attempt.expiresAt);
  const limit = attempt.timeLimitSeconds || timeLimitSeconds();
  return new Date(new Date(attempt.startedAt).getTime() + limit * 1000);
}

export function remainingSecondsForAttempt(
  attempt: IAssessmentAttempt,
  now = new Date(),
): number {
  if (attempt.completedAt) return 0;
  return Math.max(
    0,
    Math.floor((getAttemptExpiresAt(attempt).getTime() - now.getTime()) / 1000),
  );
}

export function isAttemptExpired(
  attempt: IAssessmentAttempt,
  now = new Date(),
): boolean {
  return !attempt.completedAt && remainingSecondsForAttempt(attempt, now) <= 0;
}

async function completeAttempt(options: {
  attempt: IAssessmentAttempt;
  progress: IStaffTrainingProgress;
  training: SopDefinition;
  timedOut: boolean;
}): Promise<{ attempt: IAssessmentAttempt; progress: IStaffTrainingProgress }> {
  const { attempt, progress, timedOut } = options;
  const total = attempt.questions.length || assessmentQuestionCount();
  const correctCount = attempt.questions.filter((q) => q.correct === true).length;
  const scorePercent = (correctCount / total) * 100;
  const passed = scorePercent > 80;

  attempt.scorePercent = scorePercent;
  attempt.passed = passed;
  attempt.timedOut = timedOut;
  attempt.completedAt = new Date();
  await attempt.save();

  if (passed) {
    progress.status = "passed";
    progress.currentAssessmentAttemptId = attempt._id;
    await progress.save();
  } else {
    await markAssessmentFailed(progress);
  }

  return { attempt, progress };
}

export async function expireAssessmentIfNeeded(options: {
  attempt: IAssessmentAttempt;
  progress: IStaffTrainingProgress;
  training: SopDefinition;
}): Promise<{
  attempt: IAssessmentAttempt;
  progress: IStaffTrainingProgress;
  expired: boolean;
}> {
  const { attempt, training } = options;
  let { progress } = options;
  if (attempt.completedAt) {
    return { attempt, progress, expired: false };
  }
  if (!isAttemptExpired(attempt)) {
    return { attempt, progress, expired: false };
  }
  const completed = await completeAttempt({
    attempt,
    progress,
    training,
    timedOut: true,
  });
  return { ...completed, expired: true };
}

export async function startLearningCheck(options: {
  auth: StaffAuth;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
}): Promise<IStaffTrainingProgress> {
  const { training, progress } = options;

  if (progress.status === "passed") {
    const err = new Error("Training already completed");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (!allStepsCompleted(progress, training)) {
    const err = new Error("Complete all SOP steps before the learning check.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (progress.learningCheck?.ready) {
    progress.status = "ready_for_assessment";
    await progress.save();
    return progress;
  }

  const questions = progress.learningCheck?.questions || [];
  const hasOpenSet =
    questions.length === 3 &&
    !progress.learningCheck.ready &&
    !progress.learningCheck.completedAt &&
    questions.some((q) => !q.answeredAt);

  if (hasOpenSet) {
    progress.status = "awaiting_learning_check";
    await progress.save();
    return progress;
  }

  const previous = [
    ...(progress.previousLearningQuestionTexts || []),
    ...questions.map((q) => q.questionText).filter(Boolean),
  ];

  const generated = await generateLearningQuestions({
    sopContext: sopContext(training),
    previousQuestions: previous,
  });
  progress.previousLearningQuestionTexts = previous;
  progress.learningCheck = {
    questions: generated.map((q) => ({
      index: q.index,
      questionText: q.questionText,
      relatedStepNumbers: q.relatedStepNumbers,
      transcript: "",
      evaluationFeedback: "",
      answeredAt: null,
    })),
    ready: false,
    feedback: "",
    startedAt: new Date(),
    completedAt: null,
  };
  progress.status = "awaiting_learning_check";
  await progress.save();
  return progress;
}

export async function answerLearningCheckQuestion(options: {
  training: SopDefinition;
  progress: IStaffTrainingProgress;
  questionIndex: number;
  audioBase64: string;
  mimeType: string;
}): Promise<{
  progress: IStaffTrainingProgress;
  emptyOrNoise: boolean;
  transcript: string;
  questionDone: boolean;
  allAnswered: boolean;
}> {
  const { training, progress } = options;
  if (progress.status !== "awaiting_learning_check") {
    const err = new Error("Learning check is not active.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const questions = progress.learningCheck?.questions || [];
  if (questions.length !== 3) {
    const err = new Error("Start the learning check first.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const question = questions.find((q) => q.index === options.questionIndex);
  if (!question) {
    const err = new Error("Question not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  // Enforce sequential answering
  const prior = questions
    .filter((q) => q.index < options.questionIndex)
    .every((q) => Boolean(q.answeredAt));
  if (!prior) {
    const err = new Error("Answer previous learning questions first.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (question.answeredAt) {
    const err = new Error("This question was already answered.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const result = await transcribeAndEvaluateAnswer({
    sopContext: sopContext(training),
    questionText: question.questionText,
    relatedStepNumbers: question.relatedStepNumbers,
    audioBase64: options.audioBase64,
    mimeType: options.mimeType,
  });

  if (result.emptyOrNoise) {
    return {
      progress,
      emptyOrNoise: true,
      transcript: result.transcript,
      questionDone: false,
      allAnswered: false,
    };
  }

  question.transcript = result.transcript;
  question.evaluationFeedback = result.feedback;
  question.correct = result.correct;
  question.answeredAt = new Date();
  await progress.save();

  const allAnswered = questions.every((q) => Boolean(q.answeredAt));
  return {
    progress,
    emptyOrNoise: false,
    transcript: result.transcript,
    questionDone: true,
    allAnswered,
  };
}

export async function finalizeLearningCheck(options: {
  training: SopDefinition;
  progress: IStaffTrainingProgress;
}): Promise<IStaffTrainingProgress> {
  const { training, progress } = options;
  const questions = progress.learningCheck?.questions || [];
  if (questions.length !== 3 || !questions.every((q) => q.answeredAt)) {
    const err = new Error("Answer all 3 learning questions first.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const evaluation = await evaluateLearningAnswers({
    sopContext: sopContext(training),
    questions: questions.map((q) => ({
      index: q.index,
      questionText: q.questionText,
    })),
    answers: questions.map((q) => ({
      index: q.index,
      transcript: q.transcript || "",
    })),
  });

  for (const per of evaluation.perQuestion) {
    const q = questions.find((x) => x.index === per.index);
    if (q) {
      q.correct = per.correct;
      q.evaluationFeedback = per.feedback || q.evaluationFeedback;
    }
  }

  progress.learningCheck.ready = evaluation.ready;
  progress.learningCheck.feedback = evaluation.feedback;
  progress.learningCheck.completedAt = new Date();
  progress.status = evaluation.ready
    ? "ready_for_assessment"
    : "awaiting_learning_check";
  await progress.save();
  return progress;
}

export async function startAssessment(options: {
  auth: StaffAuth;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
}): Promise<{ attempt: IAssessmentAttempt; progress: IStaffTrainingProgress }> {
  const { auth, training, progress } = options;

  if (progress.status === "passed") {
    const err = new Error("Training already completed");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (!allStepsCompleted(progress, training)) {
    const err = new Error("Complete all SOP steps before assessment.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  // Resume unfinished attempt
  if (progress.currentAssessmentAttemptId) {
    const existing = await AssessmentAttempt.findById(
      progress.currentAssessmentAttemptId,
    );
    if (existing && !existing.completedAt) {
      const expired = await expireAssessmentIfNeeded({
        attempt: existing,
        progress,
        training,
      });
      if (!expired.expired) {
        expired.progress.status = "in_assessment";
        await expired.progress.save();
      }
      return { attempt: expired.attempt, progress: expired.progress };
    }
  }

  const priorAttempts = await AssessmentAttempt.find({
    staffId: auth.staffId,
    tenantStoreId: auth.tenantStoreId,
    trainingSlug: training.slug,
  })
    .select("questions.questionText attemptNumber")
    .lean();

  const previousQuestions = priorAttempts.flatMap((a) =>
    (a.questions || []).map((q) => q.questionText),
  );
  const attemptNumber =
    priorAttempts.reduce((max, a) => Math.max(max, a.attemptNumber || 0), 0) + 1;

  const questions = await generateAssessmentQuestions({
    sopContext: sopContext(training),
    previousQuestions,
  });

  const limit = timeLimitSeconds();
  const startedAt = new Date();
  const attempt = await AssessmentAttempt.create({
    staffId: auth.staffId,
    tenantStoreId: auth.tenantStoreId,
    trainingSlug: training.slug,
    contentVersion: training.contentVersion,
    cycleNumber: progress.cycleNumber,
    attemptNumber,
    questions: questions.map((q) => ({
      index: q.index,
      questionText: q.questionText,
      relatedStepNumbers: q.relatedStepNumbers,
      transcript: "",
      evaluationFeedback: "",
      correct: null,
      answeredAt: null,
    })),
    scorePercent: null,
    passed: null,
    timedOut: false,
    timeLimitSeconds: limit,
    startedAt,
    expiresAt: new Date(startedAt.getTime() + limit * 1000),
    completedAt: null,
  });

  progress.currentAssessmentAttemptId = attempt._id;
  progress.status = "in_assessment";
  await progress.save();

  return { attempt, progress };
}

export function serializeAttempt(attempt: IAssessmentAttempt) {
  const answered = attempt.questions.filter((q) => q.answeredAt).length;
  const correctCount = attempt.questions.filter((q) => q.correct === true).length;
  const nextQuestion = attempt.completedAt
    ? null
    : attempt.questions.find((q) => !q.answeredAt) || null;
  const now = new Date();
  const expiresAt = getAttemptExpiresAt(attempt);

  return {
    attemptId: String(attempt._id),
    attemptNumber: attempt.attemptNumber,
    cycleNumber: attempt.cycleNumber,
    scorePercent: attempt.scorePercent,
    passed: attempt.passed,
    timedOut: Boolean(attempt.timedOut),
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    expiresAt,
    timeLimitSeconds: attempt.timeLimitSeconds || timeLimitSeconds(),
    remainingSeconds: remainingSecondsForAttempt(attempt, now),
    serverNow: now,
    answeredCount: answered,
    totalQuestions: attempt.questions.length,
    correctCount,
    nextQuestion: nextQuestion
      ? {
          index: nextQuestion.index,
          questionText: nextQuestion.questionText,
          relatedStepNumbers: nextQuestion.relatedStepNumbers,
        }
      : null,
    questions: attempt.questions.map((q) => ({
      index: q.index,
      questionText: q.questionText,
      relatedStepNumbers: q.relatedStepNumbers,
      transcript: q.transcript || "",
      evaluationFeedback: q.evaluationFeedback || "",
      correct: q.correct,
      answeredAt: q.answeredAt ?? null,
    })),
  };
}

export async function transcribeAssessmentAudio(options: {
  auth: StaffAuth;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
  audioBase64: string;
  mimeType: string;
}): Promise<{
  attempt: IAssessmentAttempt;
  progress: IStaffTrainingProgress;
  emptyOrNoise: boolean;
  transcript: string;
  expired: boolean;
}> {
  const { training, progress } = options;
  if (!progress.currentAssessmentAttemptId) {
    const err = new Error("No active assessment. Start assessment first.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const loaded = await AssessmentAttempt.findById(progress.currentAssessmentAttemptId);
  if (!loaded) {
    const err = new Error("No active assessment attempt.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }
  if (
    loaded.staffId !== options.auth.staffId ||
    loaded.tenantStoreId !== options.auth.tenantStoreId
  ) {
    const err = new Error("Forbidden");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const expired = await expireAssessmentIfNeeded({
    attempt: loaded,
    progress,
    training,
  });
  if (expired.expired || expired.attempt.completedAt) {
    return {
      attempt: expired.attempt,
      progress: expired.progress,
      emptyOrNoise: false,
      transcript: "",
      expired: true,
    };
  }

  const result = await transcribeSpeech({
    audioBase64: options.audioBase64,
    mimeType: options.mimeType,
  });
  return {
    attempt: expired.attempt,
    progress: expired.progress,
    emptyOrNoise: result.emptyOrNoise,
    transcript: result.transcript,
    expired: false,
  };
}

export async function answerAssessmentQuestion(options: {
  auth: StaffAuth;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
  questionIndex: number;
  audioBase64?: string;
  mimeType?: string;
  transcript?: string;
}): Promise<{
  attempt: IAssessmentAttempt;
  progress: IStaffTrainingProgress;
  emptyOrNoise: boolean;
  transcript: string;
  finished: boolean;
  expired: boolean;
}> {
  const { training, progress } = options;

  if (!progress.currentAssessmentAttemptId) {
    const err = new Error("No active assessment. Start assessment first.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const loaded = await AssessmentAttempt.findById(
    progress.currentAssessmentAttemptId,
  );
  if (!loaded) {
    const err = new Error("No active assessment attempt.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (
    loaded.staffId !== options.auth.staffId ||
    loaded.tenantStoreId !== options.auth.tenantStoreId
  ) {
    const err = new Error("Forbidden");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const expired = await expireAssessmentIfNeeded({
    attempt: loaded,
    progress,
    training,
  });
  if (expired.expired || expired.attempt.completedAt) {
    return {
      attempt: expired.attempt,
      progress: expired.progress,
      emptyOrNoise: false,
      transcript: "",
      finished: true,
      expired: true,
    };
  }

  const attempt = expired.attempt;
  let nextProgress = expired.progress;

  const question = attempt.questions.find((q) => q.index === options.questionIndex);
  if (!question) {
    const err = new Error("Question not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const priorAnswered = attempt.questions
    .filter((q) => q.index < options.questionIndex)
    .every((q) => Boolean(q.answeredAt));
  if (!priorAnswered) {
    const err = new Error("Answer previous questions first.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (question.answeredAt) {
    const err = new Error("This question was already answered.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const providedTranscript = String(options.transcript || "").trim();
  let transcript = providedTranscript;
  let correct = false;
  let feedback = "";
  const answerKey = formatRelatedStepAnswerKey(
    training,
    question.relatedStepNumbers || [],
  );

  if (providedTranscript) {
    const evaluation = await evaluateTextAnswer({
      sopContext: sopContext(training),
      questionText: question.questionText,
      relatedStepNumbers: question.relatedStepNumbers,
      transcript: providedTranscript,
      answerKey,
    });
    correct = evaluation.correct;
    feedback = evaluation.feedback;
  } else if (options.audioBase64 && options.mimeType) {
    const result = await transcribeAndEvaluateAnswer({
      sopContext: sopContext(training),
      questionText: question.questionText,
      relatedStepNumbers: question.relatedStepNumbers,
      audioBase64: options.audioBase64,
      mimeType: options.mimeType,
      answerKey,
    });
    if (result.emptyOrNoise) {
      return {
        attempt,
        progress: nextProgress,
        emptyOrNoise: true,
        transcript: result.transcript,
        finished: false,
        expired: false,
      };
    }
    transcript = result.transcript;
    correct = result.correct;
    feedback = result.feedback;
  } else {
    const err = new Error("transcript or audioBase64 is required");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (!transcript || transcript.length < 3) {
    return {
      attempt,
      progress: nextProgress,
      emptyOrNoise: true,
      transcript,
      finished: false,
      expired: false,
    };
  }

  question.transcript = transcript;
  question.evaluationFeedback = feedback;
  question.correct = correct;
  question.answeredAt = new Date();
  await attempt.save();

  const finished = attempt.questions.every((q) => Boolean(q.answeredAt));
  if (!finished) {
    return {
      attempt,
      progress: nextProgress,
      emptyOrNoise: false,
      transcript,
      finished: false,
      expired: false,
    };
  }

  const completed = await completeAttempt({
    attempt,
    progress: nextProgress,
    training,
    timedOut: false,
  });
  return {
    attempt: completed.attempt,
    progress: completed.progress,
    emptyOrNoise: false,
    transcript,
    finished: true,
    expired: false,
  };
}

export async function listAttempts(options: {
  auth: StaffAuth;
  trainingId: string;
}) {
  return AssessmentAttempt.find({
    staffId: options.auth.staffId,
    tenantStoreId: options.auth.tenantStoreId,
    trainingSlug: options.trainingId,
  })
    .sort({ attemptNumber: -1 })
    .lean();
}
