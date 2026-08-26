import StaffTrainingProgress, {
  IStaffTrainingProgress,
  ProgressStatus,
  StepProgress,
} from "../models/StaffTrainingProgress";
import AgentSession from "../models/AgentSession";
import { config } from "../config";
import type { StaffAuth } from "../middleware/auth";
import { findSopOrThrow } from "./catalog";
import type { SopDefinition, SopStep, SopStepLocales } from "../data/sops/types";
import { isPlaceholderVideoUrl } from "../data/sops/types";

export type StepLockState = "locked" | "unlocked" | "completed";

export type StepView = {
  stepNumber: number;
  title: string;
  description: string;
  importantPoints: string[];
  locales?: SopStepLocales;
  videoUrl: string;
  videoDurationSeconds: number;
  audio?: { ta: string; en: string; hi: string };
  state: StepLockState;
  videoPositionSeconds: number;
  videoCompleted: boolean;
  completedAt: Date | null;
};

function emptySteps(trainingSteps: SopStep[]): StepProgress[] {
  return trainingSteps
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((s) => ({
      stepNumber: s.stepNumber,
      videoPositionSeconds: 0,
      videoCompleted: false,
      completedAt: null,
    }));
}

function emptyLearningCheck() {
  return {
    questions: [],
    ready: false,
    feedback: "",
    startedAt: null,
    completedAt: null,
  };
}

export function getStepState(
  progress: IStaffTrainingProgress,
  stepNumber: number,
): StepLockState {
  const step = progress.steps.find((s) => s.stepNumber === stepNumber);
  if (step?.completedAt) return "completed";
  if (stepNumber === 1) return "unlocked";
  const prev = progress.steps.find((s) => s.stepNumber === stepNumber - 1);
  if (prev?.completedAt) return "unlocked";
  return "locked";
}

export async function reconcilePrerequisiteSteps(options: {
  auth: StaffAuth;
  trainingId: string;
  stepNumber: number;
  progress?: IStaffTrainingProgress;
}): Promise<{ progress: IStaffTrainingProgress; training: SopDefinition }> {
  const training = findTrainingOrThrow(options.trainingId);
  let progress =
    options.progress ?? (await getOrCreateProgress(options.auth, training));

  for (const meta of [...training.steps].sort((a, b) => a.stepNumber - b.stepNumber)) {
    if (meta.stepNumber >= options.stepNumber) break;
    const step = progress.steps.find((s) => s.stepNumber === meta.stepNumber);
    if (step?.completedAt) continue;
    if (!step?.videoCompleted) continue;
    const completed = await completeStep({
      auth: options.auth,
      trainingId: options.trainingId,
      stepNumber: meta.stepNumber,
    });
    progress = completed.progress;
  }

  return { progress, training };
}

export function allStepsCompleted(
  progress: IStaffTrainingProgress,
  training: SopDefinition,
): boolean {
  return training.steps.every((s) => {
    const p = progress.steps.find((x) => x.stepNumber === s.stepNumber);
    return Boolean(p?.completedAt);
  });
}

export function findTrainingOrThrow(slug: string): SopDefinition {
  return findSopOrThrow(slug);
}

function applyContentVersionReset(
  progress: IStaffTrainingProgress,
  training: SopDefinition,
): boolean {
  if (progress.contentVersion === training.contentVersion) return false;
  progress.contentVersion = training.contentVersion;
  progress.status = "in_progress";
  progress.cycleNumber = Math.max(1, progress.cycleNumber) + 1;
  progress.steps = emptySteps(training.steps);
  progress.learningCheck = emptyLearningCheck();
  progress.previousLearningQuestionTexts = [];
  progress.currentAssessmentAttemptId = null;
  return true;
}

export async function getOrCreateProgress(
  auth: StaffAuth,
  training: SopDefinition,
): Promise<IStaffTrainingProgress> {
  let progress = await StaffTrainingProgress.findOne({
    staffId: auth.staffId,
    tenantStoreId: auth.tenantStoreId,
    trainingSlug: training.slug,
  });

  if (!progress) {
    progress = await StaffTrainingProgress.create({
      staffId: auth.staffId,
      tenantStoreId: auth.tenantStoreId,
      tenantMongoId: auth.tenantMongoId,
      trainingSlug: training.slug,
      contentVersion: training.contentVersion,
      status: "in_progress" as ProgressStatus,
      cycleNumber: 1,
      steps: emptySteps(training.steps),
      learningCheck: emptyLearningCheck(),
      previousLearningQuestionTexts: [],
    });
    return progress;
  }

  let changed = applyContentVersionReset(progress, training);

  if (auth.tenantMongoId && progress.tenantMongoId !== auth.tenantMongoId) {
    progress.tenantMongoId = auth.tenantMongoId;
    changed = true;
  }

  if (normalizeReadyForAssessment(progress, training)) {
    changed = true;
  }

  if (changed) {
    await progress.save();
  }
  return progress;
}

export function buildStepViews(
  training: SopDefinition,
  progress: IStaffTrainingProgress,
): StepView[] {
  return training.steps
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((step) => {
      const p = progress.steps.find((s) => s.stepNumber === step.stepNumber);
      return {
        stepNumber: step.stepNumber,
        title: step.title,
        description: step.description,
        importantPoints: step.importantPoints || [],
        locales: step.locales,
        videoUrl: step.videoUrl,
        videoDurationSeconds: step.videoDurationSeconds || 0,
        audio: step.audio,
        state: getStepState(progress, step.stepNumber),
        videoPositionSeconds: p?.videoPositionSeconds ?? 0,
        videoCompleted: Boolean(p?.videoCompleted),
        completedAt: p?.completedAt ?? null,
      };
    });
}

export function serializeProgress(
  training: SopDefinition,
  progress: IStaffTrainingProgress,
) {
  return {
    trainingId: training.slug,
    slug: training.slug,
    title: training.title,
    description: training.description,
    contentVersion: training.contentVersion,
    status: progress.status,
    cycleNumber: progress.cycleNumber,
    steps: buildStepViews(training, progress),
    learningCheck: {
      ready: progress.learningCheck?.ready ?? false,
      feedback: progress.learningCheck?.feedback ?? "",
      questionCount: progress.learningCheck?.questions?.length ?? 0,
      startedAt: progress.learningCheck?.startedAt ?? null,
      completedAt: progress.learningCheck?.completedAt ?? null,
      questions: (progress.learningCheck?.questions || []).map((q) => ({
        index: q.index,
        questionText: q.questionText,
        relatedStepNumbers: q.relatedStepNumbers,
        transcript: q.transcript || "",
        evaluationFeedback: q.evaluationFeedback || "",
        correct: q.correct,
        answeredAt: q.answeredAt ?? null,
      })),
    },
    currentAssessmentAttemptId: progress.currentAssessmentAttemptId
      ? String(progress.currentAssessmentAttemptId)
      : null,
    allStepsCompleted: allStepsCompleted(progress, training),
  };
}

export async function updateVideoProgress(options: {
  auth: StaffAuth;
  trainingId: string;
  stepNumber: number;
  positionSeconds: number;
  durationSeconds?: number;
  ended?: boolean;
}): Promise<{ progress: IStaffTrainingProgress; training: SopDefinition }> {
  const training = findTrainingOrThrow(options.trainingId);
  let progress = await getOrCreateProgress(options.auth, training);

  if (progress.status === "passed") {
    const err = new Error("Training already completed");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  ({ progress } = await reconcilePrerequisiteSteps({
    auth: options.auth,
    trainingId: options.trainingId,
    stepNumber: options.stepNumber,
    progress,
  }));

  const state = getStepState(progress, options.stepNumber);
  if (state === "locked") {
    const err = new Error("Step is locked. Complete previous steps first.");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const stepMeta = training.steps.find((s) => s.stepNumber === options.stepNumber);
  if (!stepMeta) {
    const err = new Error("Step not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  let step = progress.steps.find((s) => s.stepNumber === options.stepNumber);
  if (!step) {
    step = {
      stepNumber: options.stepNumber,
      videoPositionSeconds: 0,
      videoCompleted: false,
      completedAt: null,
    };
    progress.steps.push(step);
  }

  const position = Math.max(0, Number(options.positionSeconds) || 0);
  step.videoPositionSeconds = Math.max(step.videoPositionSeconds, position);

  const duration =
    Number(options.durationSeconds) > 0
      ? Number(options.durationSeconds)
      : stepMeta.videoDurationSeconds || 0;

  const ratioComplete =
    duration > 0 && position / duration >= config.videoCompletionRatio;
  if (
    options.ended ||
    ratioComplete ||
    (options.ended && isPlaceholderVideoUrl(stepMeta.videoUrl))
  ) {
    step.videoCompleted = true;
    if (duration > 0) {
      step.videoPositionSeconds = Math.max(step.videoPositionSeconds, duration);
    }
  }

  await progress.save();
  return { progress, training };
}

export async function completeStep(options: {
  auth: StaffAuth;
  trainingId: string;
  stepNumber: number;
}): Promise<{ progress: IStaffTrainingProgress; training: SopDefinition }> {
  const training = findTrainingOrThrow(options.trainingId);
  const progress = await getOrCreateProgress(options.auth, training);

  if (progress.status === "passed") {
    const err = new Error("Training already completed");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const state = getStepState(progress, options.stepNumber);
  if (state === "locked") {
    const err = new Error("Step is locked. Complete previous steps first.");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const stepMeta = training.steps.find((s) => s.stepNumber === options.stepNumber);
  let step = progress.steps.find((s) => s.stepNumber === options.stepNumber);
  if (!step) {
    step = {
      stepNumber: options.stepNumber,
      videoPositionSeconds: 0,
      videoCompleted: false,
      completedAt: null,
    };
    progress.steps.push(step);
  }

  if (stepMeta && isPlaceholderVideoUrl(stepMeta.videoUrl)) {
    step.videoCompleted = true;
  }

  if (!step.videoCompleted) {
    const err = new Error("Watch the full video before completing this step.");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  if (!step.completedAt) {
    step.completedAt = new Date();
  }

  if (allStepsCompleted(progress, training)) {
    if (progress.status === "in_progress") {
      progress.status = "ready_for_assessment";
      progress.learningCheck = emptyLearningCheck();
    } else if (progress.status === "awaiting_learning_check") {
      progress.status = "ready_for_assessment";
    }
  }

  await progress.save();
  return { progress, training };
}

export function normalizeReadyForAssessment(
  progress: IStaffTrainingProgress,
  training: SopDefinition,
): boolean {
  if (!allStepsCompleted(progress, training)) return false;
  if (progress.status === "awaiting_learning_check") {
    progress.status = "ready_for_assessment";
    return true;
  }
  if (progress.status === "in_progress") {
    progress.status = "ready_for_assessment";
    return true;
  }
  return false;
}

export async function resetForRetraining(
  progress: IStaffTrainingProgress,
  training: SopDefinition,
): Promise<IStaffTrainingProgress> {
  progress.cycleNumber += 1;
  progress.status = "failed_retraining";
  progress.steps = emptySteps(training.steps);
  progress.learningCheck = emptyLearningCheck();
  progress.previousLearningQuestionTexts = [];
  progress.currentAssessmentAttemptId = null;
  await progress.save();
  return progress;
}

/**
 * Full staff-initiated "Start Over": wipe step/video/learning-check progress,
 * bump the cycle, and delete the agent session so the next /agent/session
 * recreates a fresh welcome. Assessment attempt history is kept for audit.
 */
export async function resetTrainingProgress(options: {
  auth: StaffAuth;
  trainingId: string;
}): Promise<{ progress: IStaffTrainingProgress; training: SopDefinition }> {
  const training = findTrainingOrThrow(options.trainingId);
  const progress = await getOrCreateProgress(options.auth, training);

  progress.contentVersion = training.contentVersion;
  progress.status = "in_progress";
  progress.cycleNumber = Math.max(1, progress.cycleNumber) + 1;
  progress.steps = emptySteps(training.steps);
  progress.learningCheck = emptyLearningCheck();
  progress.previousLearningQuestionTexts = [];
  progress.currentAssessmentAttemptId = null;
  await progress.save();

  await AgentSession.deleteOne({
    staffId: options.auth.staffId,
    tenantStoreId: options.auth.tenantStoreId,
    trainingSlug: training.slug,
  });

  return { progress, training };
}

export async function markAssessmentFailed(
  progress: IStaffTrainingProgress,
): Promise<IStaffTrainingProgress> {
  progress.status = "failed_retraining";
  progress.currentAssessmentAttemptId = null;
  await progress.save();
  return progress;
}
