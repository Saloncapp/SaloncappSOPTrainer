import AgentSession, { IAgentSession } from "../models/AgentSession";
import type { StaffAuth } from "../middleware/auth";
import type { SopDefinition } from "../data/sops/types";
import { httpError } from "../errors";
import {
  allStepsCompleted,
  completeStep,
  findTrainingOrThrow,
  getOrCreateProgress,
  reconcilePrerequisiteSteps,
  serializeProgress,
  updateVideoProgress,
} from "./progress";
import {
  answerAssessmentQuestion,
  expireAssessmentIfNeeded,
  serializeAttempt,
  startAssessment,
} from "./assessment";
import AssessmentAttempt from "../models/AssessmentAttempt";
import {
  formatSopContext,
  answerStepDoubt,
  interpretTrainingUtterance,
  selectReviewStep,
  transcribeSpeech,
  localizeTrainerSpeech,
} from "./gemini";
import {
  extractStepNumber,
  isPreviousStepRequest,
  looksLikeAgentEcho,
  extractStaffReplyFromAgentEcho,
  looksLikeDecline,
  looksLikeEmptyOrNoiseTranscript,
  looksLikeExplicitStepNavigation,
  looksLikePlayStepRequest,
  looksLikeQuestion,
  hasNonLatinScript,
  matchSteps,
  parseRuleIntent,
  stripAgentPlaybackEcho,
} from "./agentIntents";
import {
  bootstrap,
  expectedInputFor,
  expectedInputForSnapshot,
  firstIncompleteStep,
  reconcileForServiceEntry,
  reduceAgent,
  wantsAssessmentStart,
} from "./agentState";
import type {
  AgentAction,
  AgentClientAction,
  AgentContext,
  AgentReduceResult,
  AgentSnapshot,
  AgentTurnResponse,
  AgentUiState,
  ExpectedInput,
  ParsedIntent,
} from "./agentTypes";
import { IStaffTrainingProgress } from "../models/StaffTrainingProgress";
import { normalizeResponseLanguage, type ResponseLanguage } from "./responseLanguage";
import { detectSpeechScript, langLog, speechPreview } from "./langDebug";
import { isClientHandlingTraining } from "./trainingModes";
import {
  abandonClientHandlingSession,
  noopClientHandlingVideoComplete,
  startClientHandlingSession,
  submitClientHandlingTurn,
} from "./clientHandlingAgent";

function sessionLanguage(session: IAgentSession): ResponseLanguage {
  return normalizeResponseLanguage(session.responseLanguage);
}

function applySessionLanguage(session: IAgentSession, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    langLog("session.language.skip", {
      sessionId: String(session._id),
      current: sessionLanguage(session),
      raw: value,
    });
    return;
  }
  const previous = sessionLanguage(session);
  session.responseLanguage = normalizeResponseLanguage(value);
  langLog("session.language.set", {
    sessionId: String(session._id),
    raw: value,
    previous,
    next: session.responseLanguage,
  });
}

async function localizeOutput(
  session: IAgentSession,
  text: string,
): Promise<string> {
  return localizeTrainerSpeech({
    text,
    responseLanguage: sessionLanguage(session),
  });
}

function snapshotFromSession(session: IAgentSession): AgentSnapshot {
  return {
    phase: session.phase,
    currentStepNumber: session.currentStepNumber,
    reviewStepNumber: session.reviewStepNumber,
    navigationOffered: Boolean(session.navigationOffered),
  };
}

function buildContext(
  training: SopDefinition,
  progress: IStaffTrainingProgress,
  currentStepNumber?: number,
): AgentContext {
  const completed = progress.steps
    .filter((s) => Boolean(s.completedAt))
    .map((s) => s.stepNumber);
  const current = currentStepNumber
    ? progress.steps.find((s) => s.stepNumber === currentStepNumber)
    : undefined;
  return {
    trainingTitle: training.title,
    steps: training.steps.map((step) => ({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      importantPoints: step.importantPoints || [],
      videoUrl: step.videoUrl,
      videoDurationSeconds: step.videoDurationSeconds || 0,
    })),
    completedStepNumbers: completed,
    currentStepVideoCompleted: Boolean(current?.videoCompleted || current?.completedAt),
    status: progress.status,
    allStepsCompleted: allStepsCompleted(progress, training),
    completionGuidance: training.completionGuidance?.trim() || undefined,
  };
}

function applyResult(session: IAgentSession, reduced: AgentReduceResult): void {
  session.phase = reduced.snapshot.phase;
  session.currentStepNumber = reduced.snapshot.currentStepNumber;
  session.reviewStepNumber = reduced.snapshot.reviewStepNumber;
  session.navigationOffered = reduced.snapshot.navigationOffered;
  session.expectedInput = reduced.expectedInput;
  session.lastActionType = reduced.action.type;
  session.lastActionStepNumber =
    reduced.action.type === "play_video" ? reduced.action.stepNumber : null;
  if (reduced.speak && reduced.spokenText) {
    session.lastSpokenText = reduced.spokenText;
    session.utteranceSeq += 1;
  } else if (reduced.spokenText) {
    session.lastSpokenText = reduced.spokenText;
  }
  if (reduced.snapshot.phase === "passed" && reduced.action.type !== "listen" && reduced.action.type !== "play_video") {
    session.status = "completed";
  } else if (reduced.action.type === "idle") {
    session.status = "abandoned";
  } else {
    session.status = "active";
  }
}

function uiStateFor(reduced: AgentReduceResult): AgentUiState {
  if (reduced.action.type === "play_video") return reduced.speak ? "speaking" : "video";
  if (reduced.action.type === "show_result") return "result";
  if (reduced.action.type === "idle") return "idle";
  if (reduced.speak && reduced.spokenText) return "speaking";
  if (reduced.action.type === "listen") return "listening";
  return "idle";
}

function ignoredDuringVideoTurn(options: {
  session: IAgentSession;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
}): AgentTurnResponse {
  const snapshot = snapshotFromSession(options.session);
  return {
    sessionId: String(options.session._id),
    responseId: `${String(options.session._id)}-${options.session.utteranceSeq}`,
    phase: snapshot.phase,
    expectedInput: "none",
    spokenText: "",
    caption: options.session.lastSpokenText || "",
    uiState: "video",
    action: { type: "idle" },
    currentStep: currentStepInfo(options.training, snapshot, { type: "idle" }),
    progress: serializeProgress(options.training, options.progress),
    assessment: null,
    recoveryMessage: "The trainer stays quiet while a video is playing.",
    responseLanguage: sessionLanguage(options.session),
  };
}

function clientAction(
  training: SopDefinition,
  action: AgentAction,
): AgentClientAction {
  if (action.type === "play_video") {
    const step = training.steps.find((s) => s.stepNumber === action.stepNumber);
    return {
      type: "play_video",
      stepNumber: action.stepNumber,
      videoUrl: step?.videoUrl,
      title: step?.title,
      description: step?.description,
      importantPoints: step?.importantPoints || [],
      locales: step?.locales,
      audio: step?.audio,
    };
  }
  return { type: action.type };
}

function currentStepInfo(
  training: SopDefinition,
  snapshot: AgentSnapshot,
  action: AgentAction,
) {
  const stepNumber =
    action.type === "play_video"
      ? action.stepNumber
      : snapshot.reviewStepNumber || snapshot.currentStepNumber;
  const step = training.steps.find((s) => s.stepNumber === stepNumber);
  return step
    ? {
        stepNumber: step.stepNumber,
        title: step.title,
        description: step.description,
        importantPoints: step.importantPoints || [],
        locales: step.locales,
        videoUrl: step.videoUrl,
        videoDurationSeconds: step.videoDurationSeconds || 0,
        audio: step.audio,
      }
    : null;
}

async function serializeTurn(options: {
  session: IAgentSession;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
  reduced: AgentReduceResult;
  assessment?: unknown;
  recoveryMessage?: string;
}): Promise<AgentTurnResponse> {
  const { session, training, progress, reduced } = options;
  const spokenSource = reduced.spokenText || "";
  const spokenText = spokenSource
    ? await localizeOutput(session, spokenSource)
    : "";
  const recoveryMessage = options.recoveryMessage
    ? await localizeOutput(session, options.recoveryMessage)
    : undefined;
  langLog("turn.serialize", {
    sessionId: String(session._id),
    trainingSlug: training.slug,
    phase: reduced.snapshot.phase,
    action: reduced.action.type,
    speak: reduced.speak,
    responseLanguage: sessionLanguage(session),
    sourceScript: detectSpeechScript(spokenSource),
    outputScript: detectSpeechScript(spokenText),
    sourcePreview: speechPreview(spokenSource),
    outputPreview: speechPreview(spokenText),
    localized: spokenSource !== spokenText,
  });
  return {
    sessionId: String(session._id),
    responseId: `${String(session._id)}-${session.utteranceSeq}`,
    phase: reduced.snapshot.phase,
    expectedInput: reduced.expectedInput,
    spokenText: reduced.speak ? spokenText : spokenText,
    caption: spokenText,
    uiState: uiStateFor(reduced),
    action: clientAction(training, reduced.action),
    currentStep: currentStepInfo(training, reduced.snapshot, reduced.action),
    progress: serializeProgress(training, progress),
    assessment: options.assessment ?? null,
    recoveryMessage,
    responseLanguage: sessionLanguage(session),
  };
}

async function getActiveAttempt(
  progress: IStaffTrainingProgress,
  auth: StaffAuth,
  training: SopDefinition,
) {
  if (!progress.currentAssessmentAttemptId) return null;
  const attempt = await AssessmentAttempt.findById(progress.currentAssessmentAttemptId);
  if (!attempt) return null;
  if (attempt.staffId !== auth.staffId || attempt.tenantStoreId !== auth.tenantStoreId) {
    return null;
  }
  const expired = await expireAssessmentIfNeeded({ attempt, progress, training });
  return expired;
}

function repairSessionAfterAssessment(
  session: IAgentSession,
  progress: IStaffTrainingProgress,
): boolean {
  const watchingVideo =
    session.phase === "playing_video" ||
    session.phase === "playing_review" ||
    session.phase === "post_review" ||
    session.phase === "post_video";
  let changed = false;
  if (progress.status === "passed") {
    if (!watchingVideo && session.phase !== "passed") {
      session.phase = "passed";
      changed = true;
    }
    if (session.phase === "passed" && session.expectedInput !== "doubt_or_navigate") {
      session.expectedInput = "doubt_or_navigate";
      changed = true;
    }
  } else if (progress.status === "failed_retraining") {
    if (!watchingVideo && session.phase !== "failed_recovery") {
      session.phase = "failed_recovery";
      changed = true;
    }
    if (
      session.phase === "failed_recovery" &&
      session.expectedInput !== "retake_or_review"
    ) {
      session.expectedInput = "retake_or_review";
      changed = true;
    }
  }
  return changed;
}

async function getOrCreateSession(
  auth: StaffAuth,
  training: SopDefinition,
  progress: IStaffTrainingProgress,
): Promise<IAgentSession> {
  let session = await AgentSession.findOne({
    staffId: auth.staffId,
    tenantStoreId: auth.tenantStoreId,
    trainingSlug: training.slug,
  });

  const ctx = buildContext(training, progress);
  const startStep = firstIncompleteStep(ctx);

  if (!session) {
    const reduced = bootstrap(null, ctx);
    session = await AgentSession.create({
      staffId: auth.staffId,
      tenantStoreId: auth.tenantStoreId,
      tenantMongoId: auth.tenantMongoId,
      trainingSlug: training.slug,
      contentVersion: training.contentVersion,
      cycleNumber: progress.cycleNumber,
      phase: reduced.snapshot.phase,
      currentStepNumber: reduced.snapshot.currentStepNumber || startStep,
      reviewStepNumber: reduced.snapshot.reviewStepNumber,
      navigationOffered: reduced.snapshot.navigationOffered,
      expectedInput: reduced.expectedInput,
      lastSpokenText: reduced.spokenText,
      lastActionType: reduced.action.type,
      lastActionStepNumber:
        reduced.action.type === "play_video" ? reduced.action.stepNumber : null,
      utteranceSeq: reduced.speak ? 1 : 0,
      responseLanguage: "en",
      status: reduced.snapshot.phase === "passed" ? "completed" : "active",
    });
    return session;
  }

  let changed = false;
  if (session.contentVersion !== training.contentVersion) {
    session.contentVersion = training.contentVersion;
    session.cycleNumber = progress.cycleNumber;
    session.phase = "welcome";
    session.currentStepNumber = startStep;
    session.reviewStepNumber = null;
    session.navigationOffered = false;
    session.expectedInput = "confirm";
    session.status = "active";
    changed = true;
  }
  if (session.cycleNumber !== progress.cycleNumber) {
    session.cycleNumber = progress.cycleNumber;
    changed = true;
  }
  if (auth.tenantMongoId && session.tenantMongoId !== auth.tenantMongoId) {
    session.tenantMongoId = auth.tenantMongoId;
    changed = true;
  }
  if (session.status === "abandoned") {
    session.status = "active";
    changed = true;
  }
  if (repairSessionAfterAssessment(session, progress)) {
    changed = true;
  }
  if (changed) await session.save();
  return session;
}

async function resolveIntent(options: {
  transcript: string;
  expectedInput: ExpectedInput;
  training: SopDefinition;
}): Promise<ParsedIntent> {
  const { transcript, expectedInput, training } = options;
  const steps = training.steps.map((step) => ({
    stepNumber: step.stepNumber,
    title: step.title,
    description: step.description,
    importantPoints: step.importantPoints || [],
    videoUrl: step.videoUrl,
    videoDurationSeconds: step.videoDurationSeconds || 0,
  }));

  const ruleIntent = parseRuleIntent(transcript, expectedInput);
  if (ruleIntent.type === "empty") return ruleIntent;
  if (
    ruleIntent.type === "replay" ||
    ruleIntent.type === "exit" ||
    ruleIntent.type === "decline"
  ) {
    return ruleIntent;
  }
  // Question / doubt phrases must never become play-step, even if a title matches.
  if (
    looksLikeQuestion(transcript) &&
    !looksLikeExplicitStepNavigation(transcript) &&
    ruleIntent.type !== "retake" &&
    ruleIntent.type !== "assessment" &&
    ruleIntent.type !== "confirm" &&
    ruleIntent.type !== "next" &&
    ruleIntent.type !== "no_doubt" &&
    ruleIntent.type !== "rewatch"
  ) {
    return { type: "doubt", query: transcript };
  }
  if (
    looksLikeDecline(transcript) &&
    (expectedInput === "assessment_confirm" ||
      expectedInput === "review_or_assessment" ||
      expectedInput === "retake_or_review") &&
    ruleIntent.type !== "review"
  ) {
    return { type: "decline", query: transcript };
  }

  const explicitStep = extractStepNumber(transcript);
  if (explicitStep && looksLikePlayStepRequest(transcript)) {
    return {
      type: "review",
      query: transcript,
      stepNumber: explicitStep,
      candidates: [explicitStep],
      confidence: 1,
    };
  }

  if (ruleIntent.type === "review") {
    if (isPreviousStepRequest(transcript) && !extractStepNumber(transcript)) {
      return { type: "review", query: transcript, stepNumber: null };
    }
    if (explicitStep) {
      return {
        type: "review",
        query: transcript,
        stepNumber: explicitStep,
        candidates: [explicitStep],
        confidence: 1,
      };
    }
    const matched = matchSteps(ruleIntent.query || transcript, steps);
    if (matched.stepNumber) {
      return {
        type: "review",
        query: transcript,
        stepNumber: matched.stepNumber,
        candidates: matched.candidates,
        confidence: matched.confidence,
      };
    }
    if (matched.candidates.length > 1) {
      try {
        const selected = await selectReviewStep({
          query: transcript,
          sopContext: formatSopContext(training),
          steps,
        });
        if (selected.stepNumber && selected.confidence >= 0.55) {
          return {
            type: "review",
            query: transcript,
            stepNumber: selected.stepNumber,
            candidates: selected.alternatives,
            confidence: selected.confidence,
          };
        }
        return {
          type: "review",
          query: transcript,
          stepNumber: null,
          candidates: selected.alternatives.length
            ? selected.alternatives
            : matched.candidates,
          confidence: selected.confidence,
        };
      } catch {
        return {
          type: "review",
          query: transcript,
          stepNumber: null,
          candidates: matched.candidates,
          confidence: matched.confidence,
        };
      }
    }
    if (matched.candidates.length === 0) {
      try {
        const selected = await selectReviewStep({
          query: transcript,
          sopContext: formatSopContext(training),
          steps,
        });
        return {
          type: "review",
          query: transcript,
          stepNumber: selected.stepNumber,
          candidates: selected.alternatives,
          confidence: selected.confidence,
        };
      } catch {
        return ruleIntent;
      }
    }
    return {
      type: "review",
      query: transcript,
      stepNumber: matched.stepNumber,
      candidates: matched.candidates,
      confidence: matched.confidence,
    };
  }

  if (ruleIntent.type !== "unknown") {
    return ruleIntent;
  }

  if (expectedInput === "assessment_answer") {
    return { type: "unknown", query: transcript };
  }

  // Welcome: unknown is silence/garbled speech — never guess yes/doubt from it.
  if (expectedInput === "confirm") {
    return { type: "unknown", query: transcript };
  }

  try {
    const gemini = await interpretTrainingUtterance({
      transcript,
      expectedInput,
      sopContext: formatSopContext(training),
      steps,
    });
    if (gemini.confidence < 0.5 || gemini.intent === "unknown") {
      return { type: "unknown", query: transcript };
    }
    if (gemini.intent === "decline") {
      return { type: "decline", query: transcript };
    }
    if (gemini.intent === "review") {
      if (looksLikeQuestion(transcript) && !looksLikeExplicitStepNavigation(transcript)) {
        return { type: "doubt", query: transcript };
      }
      const matched = matchSteps(transcript, steps);
      const explicit = extractStepNumber(transcript);
      return {
        type: "review",
        query: transcript,
        stepNumber: explicit || matched.stepNumber || gemini.stepNumber,
        candidates: explicit ? [explicit] : matched.candidates,
        confidence: explicit ? 1 : gemini.confidence,
      };
    }
    return { type: gemini.intent, query: transcript, stepNumber: gemini.stepNumber };
  } catch {
    return { type: "unknown", query: transcript };
  }
}

async function maybeStartAssessment(options: {
  auth: StaffAuth;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
  session: IAgentSession;
  ctx: AgentContext;
}): Promise<{
  progress: IStaffTrainingProgress;
  reduced: AgentReduceResult;
  assessment: unknown;
}> {
  const started = await startAssessment({
    auth: options.auth,
    training: options.training,
    progress: options.progress,
  });
  const serialized = serializeAttempt(started.attempt);
  const next = serialized.nextQuestion;
  const reduced = reduceAgent(
    snapshotFromSession(options.session),
    next
      ? {
          type: "assessment_started",
          questionText: next.questionText,
          questionIndex: next.index,
          total: serialized.totalQuestions,
        }
      : {
          type: "assessment_finished",
          passed: Boolean(serialized.passed),
          scorePercent: serialized.scorePercent || 0,
        },
    options.ctx,
    options.session.lastSpokenText,
  );
  applyResult(options.session, reduced);
  await options.session.save();
  return { progress: started.progress, reduced, assessment: serialized };
}

export async function startOrResumeAgentSession(options: {
  auth: StaffAuth;
  trainingId: string;
  responseLanguage?: string;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  if (isClientHandlingTraining(training)) {
    return startClientHandlingSession(options);
  }
  const progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateSession(options.auth, training, progress);
  applySessionLanguage(session, options.responseLanguage);
  repairSessionAfterAssessment(session, progress);
  const ctx = buildContext(training, progress, session.currentStepNumber);

  if (progress.status === "passed" || progress.status === "failed_retraining") {
    const entrySnapshot = reconcileForServiceEntry(snapshotFromSession(session), ctx);
    session.phase = entrySnapshot.phase;
    session.currentStepNumber = entrySnapshot.currentStepNumber;
    session.reviewStepNumber = entrySnapshot.reviewStepNumber;
    session.navigationOffered = entrySnapshot.navigationOffered;
    if (session.status === "abandoned" || session.status === "completed") {
      session.status = "active";
    }
    const entryCtx = buildContext(training, progress, entrySnapshot.currentStepNumber);
    const reduced = reduceAgent(entrySnapshot, { type: "bootstrap" }, entryCtx, "");
    applyResult(session, reduced);
    await session.save();
    const attemptState = await getActiveAttempt(progress, options.auth, training);
    return serializeTurn({
      session,
      training,
      progress,
      reduced,
      assessment: attemptState?.attempt ? serializeAttempt(attemptState.attempt) : null,
    });
  }

  const attemptState = await getActiveAttempt(progress, options.auth, training);
  const stillInLiveAssessment =
    session.phase === "in_assessment" &&
    progress.status === "in_assessment";
  const completedDuringAssessment =
    stillInLiveAssessment &&
    Boolean(attemptState?.attempt?.completedAt || attemptState?.expired);
  if ((attemptState?.expired && stillInLiveAssessment) || completedDuringAssessment) {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      {
        type: "assessment_finished",
        passed: Boolean(attemptState!.attempt.passed),
        scorePercent: attemptState!.attempt.scorePercent || 0,
      },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress: attemptState!.progress,
      reduced,
      assessment: serializeAttempt(attemptState!.attempt),
    });
  }

  if (progress.status === "in_assessment" && attemptState?.attempt && !attemptState.attempt.completedAt) {
    const serialized = serializeAttempt(attemptState.attempt);
    const next = serialized.nextQuestion;
    const reduced = reduceAgent(
      snapshotFromSession(session),
      next
        ? {
            type: "assessment_started",
            questionText: next.questionText,
            questionIndex: next.index,
            total: serialized.totalQuestions,
          }
        : { type: "bootstrap" },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress: attemptState.progress,
      reduced,
      assessment: serialized,
    });
  }

  const entrySnapshot = reconcileForServiceEntry(snapshotFromSession(session), ctx);
  session.phase = entrySnapshot.phase;
  session.currentStepNumber = entrySnapshot.currentStepNumber;
  session.reviewStepNumber = entrySnapshot.reviewStepNumber;
  session.navigationOffered = entrySnapshot.navigationOffered;
  if (session.status === "abandoned") {
    session.status = "active";
  }

  const entryCtx = buildContext(training, progress, entrySnapshot.currentStepNumber);
  const reduced = reduceAgent(entrySnapshot, { type: "bootstrap" }, entryCtx, "");
  applyResult(session, reduced);
  await session.save();
  return serializeTurn({
    session,
    training,
    progress,
    reduced,
    assessment: attemptState?.attempt ? serializeAttempt(attemptState.attempt) : null,
  });
}

export async function submitAgentTurn(options: {
  auth: StaffAuth;
  trainingId: string;
  transcript?: string;
  audioBase64?: string;
  mimeType?: string;
  responseLanguage?: string;
  languageOnly?: boolean;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  if (isClientHandlingTraining(training)) {
    return submitClientHandlingTurn(options);
  }
  let progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateSession(options.auth, training, progress);
  repairSessionAfterAssessment(session, progress);
  applySessionLanguage(session, options.responseLanguage);
  let ctx = buildContext(training, progress, session.currentStepNumber);

  if (options.languageOnly) {
    langLog("turn.languageOnly", {
      sessionId: String(session._id),
      responseLanguage: sessionLanguage(session),
      phase: session.phase,
      lastSpokenScript: detectSpeechScript(session.lastSpokenText || ""),
      lastSpokenPreview: speechPreview(session.lastSpokenText || ""),
    });
    if (session.phase === "playing_video" || session.phase === "playing_review") {
      await session.save();
      return ignoredDuringVideoTurn({ session, training, progress });
    }
    const reduced: AgentReduceResult = {
      snapshot: snapshotFromSession(session),
      expectedInput: expectedInputForSnapshot(snapshotFromSession(session)),
      spokenText: session.lastSpokenText || "",
      action: { type: session.expectedInput === "none" ? "idle" : "listen" },
      speak: Boolean(session.lastSpokenText),
    };
    if (reduced.speak) session.utteranceSeq += 1;
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  let transcript = String(options.transcript || "").trim();

  if (session.phase === "playing_video" || session.phase === "playing_review") {
    if (!transcript && options.audioBase64 && options.mimeType) {
      const stt = await transcribeSpeech({
        audioBase64: options.audioBase64,
        mimeType: options.mimeType,
      });
      if (!stt.emptyOrNoise) {
        transcript = stt.transcript.trim();
      }
    }
    if (!transcript) {
      return ignoredDuringVideoTurn({ session, training, progress });
    }
    // Staff interrupted the intro (or asked a question before playback).
    // Leave the video unplayed and uncompleted so they can navigate or ask.
    session.phase = session.phase === "playing_review" ? "post_review" : "post_video";
    session.navigationOffered = false;
    session.expectedInput = expectedInputForSnapshot(snapshotFromSession(session));
    ctx = buildContext(training, progress, session.currentStepNumber);
  }

  if (session.phase === "in_assessment" && progress.status === "in_assessment") {
    const attemptState = await getActiveAttempt(progress, options.auth, training);
    if (attemptState?.expired || attemptState?.attempt?.completedAt) {
      const reduced = reduceAgent(
        snapshotFromSession(session),
        {
          type: "assessment_finished",
          passed: Boolean(attemptState.attempt.passed),
          scorePercent: attemptState.attempt.scorePercent || 0,
        },
        ctx,
        session.lastSpokenText,
      );
      applyResult(session, reduced);
      await session.save();
      return serializeTurn({
        session,
        training,
        progress: attemptState.progress,
        reduced,
        assessment: serializeAttempt(attemptState.attempt),
      });
    }
  }

  if (!transcript && !options.audioBase64) {
    if (session.phase === "in_assessment" && progress.status === "in_assessment") {
      const attemptState = await getActiveAttempt(progress, options.auth, training);
      const question = attemptState?.attempt
        ? serializeAttempt(attemptState.attempt).nextQuestion
        : null;
      if (question && attemptState && !attemptState.attempt.completedAt) {
        const reduced = reduceAgent(
          snapshotFromSession(session),
          {
            type: "assessment_progress",
            questionText: question.questionText,
            questionIndex: question.index,
            total: attemptState.attempt.questions.length,
            emptyOrNoise: true,
          },
          ctx,
          session.lastSpokenText,
        );
        applyResult(session, reduced);
        await session.save();
        return serializeTurn({
          session,
          training,
          progress: attemptState.progress,
          reduced,
          assessment: serializeAttempt(attemptState.attempt),
        });
      }
    }
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "voice", intent: { type: "empty" } },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  if (!transcript && options.audioBase64 && options.mimeType) {
    const stt = await transcribeSpeech({
      audioBase64: options.audioBase64,
      mimeType: options.mimeType,
    });
    if (stt.emptyOrNoise || looksLikeEmptyOrNoiseTranscript(stt.transcript)) {
      transcript = "";
    } else {
      transcript = stt.transcript;
    }
  }

  if (!transcript) {
    if (session.phase === "in_assessment" && progress.status === "in_assessment") {
      const attemptState = await getActiveAttempt(progress, options.auth, training);
      const question = attemptState?.attempt
        ? serializeAttempt(attemptState.attempt).nextQuestion
        : null;
      if (question && attemptState && !attemptState.attempt.completedAt) {
        const reduced = reduceAgent(
          snapshotFromSession(session),
          {
            type: "assessment_progress",
            questionText: question.questionText,
            questionIndex: question.index,
            total: attemptState.attempt.questions.length,
            emptyOrNoise: true,
          },
          ctx,
          session.lastSpokenText,
        );
        applyResult(session, reduced);
        await session.save();
        return serializeTurn({
          session,
          training,
          progress: attemptState.progress,
          reduced,
          assessment: serializeAttempt(attemptState.attempt),
        });
      }
    }
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "voice", intent: { type: "empty" } },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  transcript = stripAgentPlaybackEcho(transcript);

  const inAssessment =
    session.phase === "in_assessment" && progress.status === "in_assessment";

  // Training only: peel agent TTS echo. Assessment accepts any staff speech
  // (including reading the question) so it can be graded and the next question asked.
  if (!inAssessment) {
    const peeled = extractStaffReplyFromAgentEcho(transcript, session.lastSpokenText);
    transcript = peeled.staffSpeech.trim();
    if (
      peeled.echoOnly ||
      looksLikeEmptyOrNoiseTranscript(transcript) ||
      looksLikeAgentEcho(transcript, session.lastSpokenText)
    ) {
      const reduced = reduceAgent(
        snapshotFromSession(session),
        { type: "voice", intent: { type: "empty" } },
        ctx,
        session.lastSpokenText,
      );
      applyResult(session, reduced);
      await session.save();
      return serializeTurn({ session, training, progress, reduced });
    }
  } else if (looksLikeEmptyOrNoiseTranscript(transcript)) {
    const attemptState = await getActiveAttempt(progress, options.auth, training);
    const question = attemptState?.attempt
      ? serializeAttempt(attemptState.attempt).nextQuestion
      : null;
    if (question && attemptState && !attemptState.attempt.completedAt) {
      const reduced = reduceAgent(
        snapshotFromSession(session),
        {
          type: "assessment_progress",
          questionText: question.questionText,
          questionIndex: question.index,
          total: attemptState.attempt.questions.length,
          emptyOrNoise: true,
        },
        ctx,
        session.lastSpokenText,
      );
      applyResult(session, reduced);
      await session.save();
      return serializeTurn({
        session,
        training,
        progress: attemptState.progress,
        reduced,
        assessment: serializeAttempt(attemptState.attempt),
      });
    }
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "voice", intent: { type: "empty" } },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  if (session.phase === "in_assessment" && progress.status === "in_assessment") {
    return handleAssessmentTurn({
      auth: options.auth,
      training,
      progress,
      session,
      ctx,
      transcript,
    });
  }

  const snapshot = snapshotFromSession(session);
  const expectedInput =
    progress.status === "passed" &&
    snapshot.phase !== "playing_video" &&
    snapshot.phase !== "playing_review"
      ? "doubt_or_navigate"
      : expectedInputForSnapshot(snapshot);
  let intent = await resolveIntent({
    transcript,
    expectedInput,
    training,
  });

  // Safety net: title-fuzzy "review" must not override a spoken question/doubt.
  if (
    intent.type === "review" &&
    looksLikeQuestion(transcript) &&
    !looksLikeExplicitStepNavigation(transcript)
  ) {
    intent = { type: "doubt", query: transcript };
  }

  const shouldAnswerDoubt =
    (expectedInput === "doubt_or_navigate" ||
      expectedInput === "retake_or_review" ||
      expectedInput === "review_or_assessment" ||
      expectedInput === "confirm" ||
      snapshot.phase === "passed" ||
      snapshot.phase === "failed_recovery" ||
      snapshot.phase === "welcome" ||
      snapshot.phase === "post_review") &&
    !looksLikeExplicitStepNavigation(transcript) &&
    !looksLikeDecline(transcript) &&
    (intent.type === "doubt" ||
      (intent.type === "unknown" && hasNonLatinScript(transcript)) ||
      (intent.type === "review" && looksLikeQuestion(transcript)));

  if (shouldAnswerDoubt) {
    const matched = matchSteps(transcript, training.steps.map((step) => ({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description,
      importantPoints: step.importantPoints || [],
      videoUrl: step.videoUrl,
      videoDurationSeconds: step.videoDurationSeconds || 0,
    })));
    const stepNumber =
      matched.stepNumber ||
      snapshot.reviewStepNumber ||
      snapshot.currentStepNumber;
    const step = training.steps.find((s) => s.stepNumber === stepNumber);
    if (step) {
      try {
        const answered = await answerStepDoubt({
          sopContext: formatSopContext(training),
          trainingTitle: training.title,
          step: {
            stepNumber: step.stepNumber,
            title: step.title,
            description: step.description,
            importantPoints: step.importantPoints || [],
          },
          question: transcript,
          responseLanguage: sessionLanguage(session),
        });
        const reduced = reduceAgent(
          snapshot,
          { type: "doubt_answered", answerText: answered.answer },
          ctx,
          session.lastSpokenText,
        );
        applyResult(session, reduced);
        await session.save();
        return serializeTurn({ session, training, progress, reduced });
      } catch {
        // Fall back to normal voice handling if the answer service fails.
      }
    }
  }

  if (intent.type === "replay") {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "replay" },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  if (
    looksLikeDecline(transcript) &&
    (snapshot.phase === "passed" ||
      snapshot.phase === "awaiting_assessment" ||
      snapshot.phase === "post_review" ||
      snapshot.phase === "failed_recovery") &&
    intent.type !== "review"
  ) {
    intent = { type: "decline", query: transcript };
  }

  if (wantsAssessmentStart(snapshot, intent, ctx) && !looksLikeDecline(transcript) && progress.status !== "passed") {
    const started = await maybeStartAssessment({
      auth: options.auth,
      training,
      progress,
      session,
      ctx,
    });
    return serializeTurn({
      session,
      training,
      progress: started.progress,
      reduced: started.reduced,
      assessment: started.assessment,
    });
  }

  const reduced = reduceAgent(
    snapshot,
    { type: "voice", intent },
    ctx,
    session.lastSpokenText,
  );
  applyResult(session, reduced);
  await session.save();
  return serializeTurn({ session, training, progress, reduced });
}

async function handleAssessmentTurn(options: {
  auth: StaffAuth;
  training: SopDefinition;
  progress: IStaffTrainingProgress;
  session: IAgentSession;
  ctx: AgentContext;
  transcript: string;
}): Promise<AgentTurnResponse> {
  const { auth, training, session, ctx } = options;
  let { progress } = options;

  const replayIntent = parseRuleIntent(options.transcript, "assessment_answer");
  if (replayIntent.type === "replay") {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "replay" },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    const attemptState = await getActiveAttempt(progress, auth, training);
    return serializeTurn({
      session,
      training,
      progress,
      reduced,
      assessment: attemptState?.attempt ? serializeAttempt(attemptState.attempt) : null,
    });
  }

  const attemptState = await getActiveAttempt(progress, auth, training);
  if (attemptState?.expired) {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      {
        type: "assessment_finished",
        passed: Boolean(attemptState.attempt.passed),
        scorePercent: attemptState.attempt.scorePercent || 0,
      },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress: attemptState.progress,
      reduced,
      assessment: serializeAttempt(attemptState.attempt),
    });
  }

  if (!attemptState?.attempt || attemptState.attempt.completedAt) {
    const started = await maybeStartAssessment({ auth, training, progress, session, ctx });
    return serializeTurn({
      session,
      training,
      progress: started.progress,
      reduced: started.reduced,
      assessment: started.assessment,
    });
  }

  const serializedBefore = serializeAttempt(attemptState.attempt);
  const question = serializedBefore.nextQuestion;
  if (!question) {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      {
        type: "assessment_finished",
        passed: Boolean(serializedBefore.passed),
        scorePercent: serializedBefore.scorePercent || 0,
      },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress,
      reduced,
      assessment: serializedBefore,
    });
  }

  const answered = await answerAssessmentQuestion({
    auth,
    training,
    progress,
    questionIndex: question.index,
    transcript: options.transcript,
  });
  progress = answered.progress;
  const serialized = serializeAttempt(answered.attempt);

  if (answered.emptyOrNoise) {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      {
        type: "assessment_progress",
        questionText: question.questionText,
        questionIndex: question.index,
        total: serialized.totalQuestions,
        emptyOrNoise: true,
      },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress,
      reduced,
      assessment: serialized,
    });
  }

  if (answered.finished || serialized.completedAt) {
    const reduced = reduceAgent(
      snapshotFromSession(session),
      {
        type: "assessment_finished",
        passed: Boolean(serialized.passed),
        scorePercent: serialized.scorePercent || 0,
      },
      buildContext(training, progress, session.currentStepNumber),
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress,
      reduced,
      assessment: serialized,
    });
  }

  const next = serialized.nextQuestion;
  const reduced = reduceAgent(
    snapshotFromSession(session),
    next
      ? {
          type: "assessment_progress",
          questionText: next.questionText,
          questionIndex: next.index,
          total: serialized.totalQuestions,
        }
      : {
          type: "assessment_finished",
          passed: Boolean(serialized.passed),
          scorePercent: serialized.scorePercent || 0,
        },
    ctx,
    session.lastSpokenText,
  );
  applyResult(session, reduced);
  await session.save();
  return serializeTurn({
    session,
    training,
    progress,
    reduced,
    assessment: serialized,
  });
}

export async function completeAgentVideo(options: {
  auth: StaffAuth;
  trainingId: string;
  stepNumber: number;
  positionSeconds?: number;
  durationSeconds?: number;
  ended?: boolean;
  responseLanguage?: string;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  if (isClientHandlingTraining(training)) {
    return noopClientHandlingVideoComplete(options);
  }
  let progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateSession(options.auth, training, progress);
  applySessionLanguage(session, options.responseLanguage);

  if (session.phase !== "playing_video" && session.phase !== "playing_review") {
    const ctx = buildContext(training, progress, session.currentStepNumber);
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "video_complete", stepNumber: options.stepNumber },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  const expectedStep =
    session.phase === "playing_review"
      ? session.reviewStepNumber || options.stepNumber
      : session.currentStepNumber;

  if (options.stepNumber !== expectedStep) {
    throw httpError("Video completion does not match the current step.", 400);
  }

  if (progress.status === "passed") {
    const ctx = buildContext(training, progress, options.stepNumber);
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "video_complete", stepNumber: options.stepNumber },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({ session, training, progress, reduced });
  }

  let reconciled = await reconcilePrerequisiteSteps({
    auth: options.auth,
    trainingId: options.trainingId,
    stepNumber: options.stepNumber,
    progress,
  });
  progress = reconciled.progress;

  const updated = await updateVideoProgress({
    auth: options.auth,
    trainingId: options.trainingId,
    stepNumber: options.stepNumber,
    positionSeconds: Number(options.positionSeconds) || 0,
    durationSeconds:
      options.durationSeconds != null ? Number(options.durationSeconds) : undefined,
    ended: options.ended !== false,
  });
  progress = updated.progress;

  const stepProgress = progress.steps.find((s) => s.stepNumber === options.stepNumber);
  if (!stepProgress?.videoCompleted) {
    const ctx = buildContext(training, progress, options.stepNumber);
    const reduced = reduceAgent(
      snapshotFromSession(session),
      { type: "bootstrap" },
      ctx,
      session.lastSpokenText,
    );
    applyResult(session, reduced);
    await session.save();
    return serializeTurn({
      session,
      training,
      progress,
      reduced,
      recoveryMessage: "Watch the full video before continuing.",
    });
  }

  if (session.phase === "playing_video" && options.stepNumber === session.currentStepNumber) {
    reconciled = await reconcilePrerequisiteSteps({
      auth: options.auth,
      trainingId: options.trainingId,
      stepNumber: options.stepNumber,
      progress,
    });
    progress = reconciled.progress;
    const completed = await completeStep({
      auth: options.auth,
      trainingId: options.trainingId,
      stepNumber: options.stepNumber,
    });
    progress = completed.progress;
  }

  const ctx = buildContext(training, progress, options.stepNumber);
  const reduced = reduceAgent(
    snapshotFromSession(session),
    { type: "video_complete", stepNumber: options.stepNumber },
    ctx,
    session.lastSpokenText,
  );
  applyResult(session, reduced);
  await session.save();
  return serializeTurn({ session, training, progress, reduced });
}

export async function abandonAgentSession(options: {
  auth: StaffAuth;
  trainingId: string;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  if (isClientHandlingTraining(training)) {
    return abandonClientHandlingSession(options);
  }
  const progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateSession(options.auth, training, progress);
  const ctx = buildContext(training, progress);
  const entrySnapshot = reconcileForServiceEntry(snapshotFromSession(session), ctx);
  session.phase = entrySnapshot.phase;
  session.currentStepNumber = entrySnapshot.currentStepNumber;
  session.reviewStepNumber = entrySnapshot.reviewStepNumber;
  session.navigationOffered = entrySnapshot.navigationOffered;
  session.status = "abandoned";
  session.lastSpokenText = "Okay. We can continue this training later.";
  session.utteranceSeq += 1;
  session.lastActionType = "idle";
  session.expectedInput = "none";
  await session.save();
  return {
    sessionId: String(session._id),
    responseId: `${String(session._id)}-${session.utteranceSeq}`,
    phase: session.phase,
    expectedInput: "none",
    spokenText: session.lastSpokenText,
    caption: session.lastSpokenText,
    uiState: "idle",
    action: { type: "idle" },
    currentStep: currentStepInfo(training, snapshotFromSession(session), { type: "idle" }),
    progress: serializeProgress(training, progress),
    assessment: null,
    responseLanguage: sessionLanguage(session),
  };
}
