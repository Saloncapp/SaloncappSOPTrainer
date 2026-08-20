import { extractStepNumber, isPreviousStepRequest, titlesForSteps } from "./agentIntents";
import type {
  AgentAction,
  AgentContext,
  AgentEvent,
  AgentPhase,
  AgentReduceResult,
  AgentSnapshot,
  AgentStepInfo,
  ExpectedInput,
  ParsedIntent,
} from "./agentTypes";

export function expectedInputFor(phase: AgentPhase): ExpectedInput {
  switch (phase) {
    case "welcome":
      return "confirm";
    case "playing_video":
    case "playing_review":
      return "none";
    case "post_video":
      return "doubt_or_navigate";
    case "awaiting_assessment":
      return "assessment_confirm";
    case "in_assessment":
      return "assessment_answer";
    case "passed":
      return "none";
    case "failed_recovery":
      return "retake_or_review";
    case "post_review":
      return "review_or_assessment";
    default:
      return "none";
  }
}

export function expectedInputForSnapshot(snapshot: AgentSnapshot): ExpectedInput {
  if (
    (snapshot.phase === "post_video" || snapshot.phase === "post_review") &&
    !snapshot.navigationOffered
  ) {
    return "doubt_or_navigate";
  }
  return expectedInputFor(snapshot.phase);
}

export function firstIncompleteStep(ctx: AgentContext): number {
  const ordered = [...ctx.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const incomplete = ordered.find(
    (step) => !ctx.completedStepNumbers.includes(step.stepNumber),
  );
  return incomplete?.stepNumber ?? ordered[0]?.stepNumber ?? 1;
}

export function stepByNumber(
  ctx: AgentContext,
  stepNumber: number,
): AgentStepInfo | undefined {
  return ctx.steps.find((s) => s.stepNumber === stepNumber);
}

export function nextStepNumber(
  ctx: AgentContext,
  stepNumber: number,
): number | null {
  const ordered = [...ctx.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const index = ordered.findIndex((s) => s.stepNumber === stepNumber);
  if (index < 0 || index >= ordered.length - 1) return null;
  return ordered[index + 1].stepNumber;
}

export function isLastStep(ctx: AgentContext, stepNumber: number): boolean {
  return nextStepNumber(ctx, stepNumber) == null;
}

function result(
  snapshot: AgentSnapshot,
  spokenText: string,
  action: AgentAction,
  speak = true,
): AgentReduceResult {
  return {
    snapshot,
    expectedInput: expectedInputForSnapshot(snapshot),
    spokenText,
    action,
    speak,
  };
}

function stay(
  snapshot: AgentSnapshot,
  spokenText: string,
  action?: AgentAction,
): AgentReduceResult {
  const listenOrIdle: AgentAction =
    expectedInputForSnapshot(snapshot) === "none"
      ? { type: snapshot.phase === "passed" ? "show_result" : "idle" }
      : { type: "listen" };
  return result(snapshot, spokenText, action || listenOrIdle, true);
}

function titleOf(ctx: AgentContext, stepNumber: number): string {
  return stepByNumber(ctx, stepNumber)?.title || `Step ${stepNumber}`;
}

export function welcomePrompt(ctx: AgentContext, stepNumber: number): string {
  const title = titleOf(ctx, stepNumber);
  const completed = [...ctx.completedStepNumbers].sort((a, b) => a - b);
  if (completed.length > 0) {
    const lastCompleted = completed[completed.length - 1];
    const lastTitle = titleOf(ctx, lastCompleted);
    if (lastCompleted < stepNumber) {
      return `Welcome back to ${ctx.trainingTitle} training. You completed step ${lastCompleted}, ${lastTitle}. Would you like to resume with step ${stepNumber}, ${title}?`;
    }
    return `Welcome back to ${ctx.trainingTitle} training. You are on step ${stepNumber}, ${title}. Shall we continue?`;
  }
  return `Welcome to ${ctx.trainingTitle} training. We can begin with step ${stepNumber}, ${title}. Shall we start?`;
}

export function reconcileForServiceEntry(
  snapshot: AgentSnapshot | null,
  ctx: AgentContext,
): AgentSnapshot {
  const stepNumber = firstIncompleteStep(ctx);

  if (ctx.status === "passed") {
    return {
      phase: "passed",
      currentStepNumber: snapshot?.currentStepNumber || stepNumber,
      reviewStepNumber: null,
      navigationOffered: false,
    };
  }

  if (ctx.status === "in_assessment") {
    return {
      phase: "in_assessment",
      currentStepNumber: snapshot?.currentStepNumber || stepNumber,
      reviewStepNumber: null,
      navigationOffered: false,
    };
  }

  if (ctx.allStepsCompleted) {
    if (ctx.status === "failed_retraining") {
      return {
        phase: "failed_recovery",
        currentStepNumber: snapshot?.currentStepNumber || stepNumber,
        reviewStepNumber: null,
        navigationOffered: false,
      };
    }
    return {
      phase: "awaiting_assessment",
      currentStepNumber: snapshot?.currentStepNumber || stepNumber,
      reviewStepNumber: null,
      navigationOffered: false,
    };
  }

  return {
    phase: "welcome",
    currentStepNumber: stepNumber,
    reviewStepNumber: null,
    navigationOffered: false,
  };
}

export function stepIntroPrompt(ctx: AgentContext, stepNumber: number): string {
  return `Got it. I'll play the Step ${stepNumber} training video now. Please watch carefully.`;
}

export function postWatchPrompt(
  ctx: AgentContext,
  cursorStepNumber: number,
  watchedStepNumber?: number,
): string {
  const watched = watchedStepNumber || cursorStepNumber;
  const title = titleOf(ctx, watched);

  if (isLastStep(ctx, cursorStepNumber)) {
    return `Step ${watched}, ${title}, is complete. Ask doubts, rewatch it, revisit an earlier step, or start the assessment.`;
  }

  return `Step ${watched} is complete. Ask doubts, rewatch it, revisit an earlier step, or play the next step.`;
}

export function postVideoDoubtPrompt(ctx: AgentContext, stepNumber: number): string {
  return postWatchPrompt(ctx, stepNumber);
}

export function postVideoPrompt(ctx: AgentContext, stepNumber: number): string {
  return postWatchPrompt(ctx, stepNumber);
}

export function doubtFollowUpPrompt(ctx: AgentContext, cursorStepNumber: number): string {
  if (isLastStep(ctx, cursorStepNumber)) {
    return "If you have another question, ask it. You can also watch this again, watch an earlier step, or say you are ready for the assessment.";
  }
  return "If you have another question, ask it. You can also watch this again, watch an earlier step, or move to the next video.";
}

export function assessmentOfferPrompt(ctx: AgentContext): string {
  return `You have finished every step of ${ctx.trainingTitle}. Would you like to take the five-question assessment now? You have five minutes, and you need more than 80 percent to pass.`;
}

export function assessmentDeclinePrompt(): string {
  return "Okay, no problem. You can continue later. Take your time.";
}

export function assessmentResumePrompt(): string {
  return "Welcome back. You completed all the training steps earlier. You were ready for the assessment. Would you like to start it now?";
}

export function assessmentAskAgainPrompt(): string {
  return "Would you like to start the assessment now?";
}

export function reviewIntroPrompt(ctx: AgentContext, stepNumber: number): string {
  return stepIntroPrompt(ctx, stepNumber);
}

export function postReviewDoubtPrompt(ctx: AgentContext, stepNumber: number): string {
  return postWatchPrompt(ctx, stepNumber, stepNumber);
}

export function postReviewPrompt(ctx: AgentContext, stepNumber: number): string {
  const title = titleOf(ctx, stepNumber);
  return `That was step ${stepNumber}, ${title}. Ask doubts, watch it again, watch another step, or say you are ready for the assessment.`;
}

export function failPrompt(scorePercent: number): string {
  const score = Math.round(scorePercent);
  return `The assessment is complete. Your score is ${score} percent, which is below the passing mark of more than 80 percent. You can retake it now, or tell me a step title or concept you want to review.`;
}

export function passPrompt(ctx: AgentContext, scorePercent: number): string {
  const score = Math.round(scorePercent);
  return `Well done. You passed the ${ctx.trainingTitle} assessment with ${score} percent. Training is complete.`;
}

export function questionPrompt(
  questionText: string,
  questionIndex: number,
  total: number,
): string {
  return `Question ${questionIndex} of ${total}. ${questionText}`;
}

function clarify(snapshot: AgentSnapshot, detail?: string): AgentReduceResult {
  return stay(
    snapshot,
    detail ||
      "I did not catch that. Please say that again, or tell me what you would like to do next.",
  );
}

const EMPTY_REPLY_PREFIX = "I can't get you.";

function looksLikePlayVideoIntro(text: string): boolean {
  return /\bi(?:'|’)?ll play\b|\btraining video now\b/i.test(String(text || ""));
}

function underlyingPrompt(text: string): string {
  let next = String(text || "").trim();
  const prefix = EMPTY_REPLY_PREFIX.toLowerCase();
  while (next.toLowerCase().startsWith(prefix)) {
    next = next.slice(EMPTY_REPLY_PREFIX.length).trim();
  }
  return next;
}

function phaseReprompt(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  lastSpokenText: string,
): string {
  const previous = underlyingPrompt(lastSpokenText);
  if (previous && !looksLikePlayVideoIntro(previous)) {
    return previous;
  }
  if (snapshot.phase === "post_video") {
    return postWatchPrompt(
      ctx,
      snapshot.currentStepNumber,
      snapshot.reviewStepNumber || snapshot.currentStepNumber,
    );
  }
  if (snapshot.phase === "post_review") {
    const reviewStep = snapshot.reviewStepNumber || snapshot.currentStepNumber;
    return snapshot.navigationOffered
      ? postReviewPrompt(ctx, reviewStep)
      : postReviewDoubtPrompt(ctx, reviewStep);
  }
  if (snapshot.phase === "welcome") {
    return welcomePrompt(ctx, snapshot.currentStepNumber);
  }
  if (snapshot.phase === "awaiting_assessment") {
    return assessmentOfferPrompt(ctx);
  }
  if (snapshot.phase === "failed_recovery") {
    return "You can retake the assessment now, or tell me a step title or concept you want to review.";
  }
  return "Please try again when you are ready.";
}

function looksLikePostponeSpeech(text: string): boolean {
  const t = String(text || "").toLowerCase();
  return (
    t.includes("continue later") ||
    t.includes("take your time") ||
    t.includes("no problem")
  );
}

function emptyReply(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  lastSpokenText: string,
): AgentReduceResult {
  if (
    (snapshot.phase === "awaiting_assessment" ||
      snapshot.phase === "failed_recovery" ||
      snapshot.phase === "post_review") &&
    looksLikePostponeSpeech(lastSpokenText)
  ) {
    return postponeAssessment(snapshot);
  }
  return stay(
    snapshot,
    `${EMPTY_REPLY_PREFIX} ${phaseReprompt(snapshot, ctx, lastSpokenText)}`,
  );
}

function replayLast(snapshot: AgentSnapshot, lastSpokenText: string): AgentReduceResult {
  if (snapshot.phase === "post_video" || snapshot.phase === "post_review") {
    return stay(
      snapshot,
      lastSpokenText || "Let me repeat that. Please listen and reply when you are ready.",
    );
  }
  const action: AgentAction =
    expectedInputForSnapshot(snapshot) === "none"
      ? snapshot.phase === "playing_video" || snapshot.phase === "playing_review"
        ? { type: "play_video", stepNumber: snapshot.reviewStepNumber || snapshot.currentStepNumber }
        : snapshot.phase === "passed"
          ? { type: "show_result" }
          : { type: "idle" }
      : { type: "listen" };
  return result(
    snapshot,
    lastSpokenText || "Let me repeat that. Please listen again.",
    action,
    true,
  );
}

export function reduceAgent(
  snapshot: AgentSnapshot | null,
  event: AgentEvent,
  ctx: AgentContext,
  lastSpokenText = "",
): AgentReduceResult {
  if (event.type === "bootstrap") {
    return bootstrap(snapshot, ctx);
  }

  const current = snapshot || bootstrap(null, ctx).snapshot;

  if (event.type === "replay") {
    return replayLast(current, lastSpokenText);
  }

  if (event.type === "video_complete") {
    return onVideoComplete(current, ctx, event.stepNumber);
  }

  if (event.type === "assessment_started") {
    return result(
      { phase: "in_assessment", currentStepNumber: current.currentStepNumber, reviewStepNumber: null, navigationOffered: false },
      questionPrompt(event.questionText, event.questionIndex, event.total),
      { type: "listen" },
    );
  }

  if (event.type === "assessment_progress") {
    if (event.emptyOrNoise) {
      return stay(
        { ...current, phase: "in_assessment" },
        `I did not catch an answer. ${questionPrompt(event.questionText, event.questionIndex, event.total)}`,
      );
    }
    return result(
      { phase: "in_assessment", currentStepNumber: current.currentStepNumber, reviewStepNumber: null, navigationOffered: false },
      questionPrompt(event.questionText, event.questionIndex, event.total),
      { type: "listen" },
    );
  }

  if (event.type === "assessment_finished") {
    if (event.passed) {
      return result(
        { phase: "passed", currentStepNumber: current.currentStepNumber, reviewStepNumber: null, navigationOffered: false },
        passPrompt(ctx, event.scorePercent),
        { type: "show_result" },
      );
    }
    return result(
      {
        phase: "failed_recovery",
        currentStepNumber: current.currentStepNumber,
        reviewStepNumber: null,
        navigationOffered: false,
      },
      failPrompt(event.scorePercent),
      { type: "listen" },
    );
  }

  if (event.type === "doubt_answered") {
    const followUp =
      current.phase === "post_review"
        ? doubtFollowUpPrompt(ctx, current.currentStepNumber)
        : doubtFollowUpPrompt(ctx, current.currentStepNumber);
    return stay(
      { ...current, navigationOffered: false },
      `${event.answerText} ${followUp}`,
    );
  }

  if (event.type === "voice") {
    return onVoice(current, ctx, event.intent, lastSpokenText);
  }

  return stay(current, lastSpokenText || welcomePrompt(ctx, firstIncompleteStep(ctx)));
}

export function bootstrap(
  snapshot: AgentSnapshot | null,
  ctx: AgentContext,
): AgentReduceResult {
  if (ctx.status === "passed") {
    return result(
      {
        phase: "passed",
        currentStepNumber: snapshot?.currentStepNumber || firstIncompleteStep(ctx),
        reviewStepNumber: null,
        navigationOffered: false,
      },
      `This ${ctx.trainingTitle} training is already complete. Great work.`,
      { type: "show_result" },
    );
  }

  if (ctx.status === "in_assessment") {
    return result(
      {
        phase: "in_assessment",
        currentStepNumber: snapshot?.currentStepNumber || firstIncompleteStep(ctx),
        reviewStepNumber: null,
        navigationOffered: false,
      },
      lastQuestionFallback(),
      { type: "listen" },
      false,
    );
  }

  if (snapshot?.phase === "playing_video") {
    const stepNumber = snapshot.currentStepNumber;
    const completed = ctx.completedStepNumbers.includes(stepNumber);
    if (!completed) {
      return result(snapshot, "", { type: "play_video", stepNumber }, false);
    }
    return result(
      { ...snapshot, phase: "post_video", reviewStepNumber: null, navigationOffered: false },
      postWatchPrompt(ctx, stepNumber),
      { type: "listen" },
    );
  }

  if (snapshot?.phase === "playing_review" && snapshot.reviewStepNumber) {
    return result(
      snapshot,
      "",
      { type: "play_video", stepNumber: snapshot.reviewStepNumber },
      false,
    );
  }

  if (ctx.status === "failed_retraining" && ctx.allStepsCompleted) {
    return result(
      {
        phase: "failed_recovery",
        currentStepNumber: snapshot?.currentStepNumber || firstIncompleteStep(ctx),
        reviewStepNumber: null,
        navigationOffered: false,
      },
      "You can retake the assessment now, or tell me a step title or concept you want to review.",
      { type: "listen" },
    );
  }

  if (ctx.allStepsCompleted) {
    if (snapshot?.phase === "post_review") {
      const reviewStep = snapshot.reviewStepNumber || snapshot.currentStepNumber;
      return result(
        snapshot,
        snapshot.navigationOffered
          ? postReviewPrompt(ctx, reviewStep)
          : postReviewDoubtPrompt(ctx, reviewStep),
        { type: "listen" },
      );
    }
    return result(
      {
        phase: "awaiting_assessment",
        currentStepNumber: snapshot?.currentStepNumber || firstIncompleteStep(ctx),
        reviewStepNumber: null,
        navigationOffered: false,
      },
      assessmentResumePrompt(),
      { type: "listen" },
    );
  }

  if (snapshot?.phase === "post_video") {
    return result(
      snapshot,
      postWatchPrompt(
        ctx,
        snapshot.currentStepNumber,
        snapshot.reviewStepNumber || snapshot.currentStepNumber,
      ),
      { type: "listen" },
    );
  }

  if (snapshot?.phase === "post_review") {
    const reviewStep = snapshot.reviewStepNumber || snapshot.currentStepNumber;
    return result(
      snapshot,
      snapshot.navigationOffered
        ? postReviewPrompt(ctx, reviewStep)
        : postReviewDoubtPrompt(ctx, reviewStep),
      { type: "listen" },
    );
  }

  const stepNumber = firstIncompleteStep(ctx);
  return result(
    { phase: "welcome", currentStepNumber: stepNumber, reviewStepNumber: null, navigationOffered: false },
    welcomePrompt(ctx, stepNumber),
    { type: "listen" },
  );
}

function lastQuestionFallback(): string {
  return "Let us continue the assessment. Please listen for the next question.";
}

function onVideoComplete(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  stepNumber: number,
): AgentReduceResult {
  if (snapshot.phase === "playing_review") {
    const expected = snapshot.reviewStepNumber ?? stepNumber;
    if (stepNumber !== expected) {
      return result(snapshot, "", { type: "play_video", stepNumber: expected }, false);
    }
    return result(
      {
        phase: ctx.status === "failed_retraining" ? "post_review" : "post_video",
        currentStepNumber: snapshot.currentStepNumber,
        reviewStepNumber: expected,
        navigationOffered: false,
      },
      postWatchPrompt(ctx, snapshot.currentStepNumber, expected),
      { type: "listen" },
    );
  }

  if (snapshot.phase === "post_video" && snapshot.currentStepNumber === stepNumber) {
    return result(
      snapshot,
      postWatchPrompt(ctx, stepNumber, snapshot.reviewStepNumber || stepNumber),
      { type: "listen" },
    );
  }

  if (snapshot.phase === "post_review" && snapshot.reviewStepNumber === stepNumber) {
    return result(
      snapshot,
      snapshot.navigationOffered
        ? postReviewPrompt(ctx, stepNumber)
        : postReviewDoubtPrompt(ctx, stepNumber),
      { type: "listen" },
    );
  }

  const expected = snapshot.currentStepNumber;
  if (snapshot.phase !== "playing_video" || stepNumber !== expected) {
    if (snapshot.phase === "playing_video") {
      return result(snapshot, "", { type: "play_video", stepNumber: expected }, false);
    }
    return stay(
      snapshot,
      "Please finish the current video before moving on.",
    );
  }

  const completed = ctx.completedStepNumbers.includes(stepNumber);
  if (!completed) {
    return result(snapshot, "", { type: "play_video", stepNumber }, false);
  }

  return result(
    {
      phase: "post_video",
      currentStepNumber: stepNumber,
      reviewStepNumber: null,
      navigationOffered: false,
    },
    postWatchPrompt(ctx, stepNumber),
    { type: "listen" },
  );
}

function onVoice(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
  lastSpokenText: string,
): AgentReduceResult {
  if (snapshot.phase === "playing_video" || snapshot.phase === "playing_review") {
    const stepNumber = snapshot.reviewStepNumber || snapshot.currentStepNumber;
    return result(snapshot, "", { type: "play_video", stepNumber }, false);
  }

  if (intent.type === "empty") {
    return emptyReply(snapshot, ctx, lastSpokenText);
  }
  if (intent.type === "replay") {
    return replayLast(snapshot, lastSpokenText);
  }
  if (intent.type === "exit") {
    return result(
      snapshot,
      "Okay. We can continue this training later.",
      { type: "idle" },
    );
  }

  switch (snapshot.phase) {
    case "welcome":
      return onWelcomeVoice(snapshot, ctx, intent, lastSpokenText);
    case "post_video":
      return onPostVideoVoice(snapshot, ctx, intent);
    case "awaiting_assessment":
      return onAwaitingAssessmentVoice(snapshot, ctx, intent);
    case "failed_recovery":
      return onFailedRecoveryVoice(snapshot, ctx, intent);
    case "post_review":
      return onPostReviewVoice(snapshot, ctx, intent);
    case "passed":
      return result(snapshot, passPrompt(ctx, 100), { type: "show_result" }, true);
    case "in_assessment":
      return stay(snapshot, lastSpokenText || lastQuestionFallback());
    default:
      return clarify(snapshot);
  }
}

function beginStep(ctx: AgentContext, stepNumber: number): AgentReduceResult {
  return result(
    {
      phase: "playing_video",
      currentStepNumber: stepNumber,
      reviewStepNumber: null,
      navigationOffered: false,
    },
    stepIntroPrompt(ctx, stepNumber),
    { type: "play_video", stepNumber },
  );
}

function beginReview(ctx: AgentContext, snapshot: AgentSnapshot, stepNumber: number): AgentReduceResult {
  return result(
    {
      phase: "playing_review",
      currentStepNumber: snapshot.currentStepNumber,
      reviewStepNumber: stepNumber,
      navigationOffered: false,
    },
    reviewIntroPrompt(ctx, stepNumber),
    { type: "play_video", stepNumber },
  );
}

function advanceFromPostVideo(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
): AgentReduceResult {
  const current = snapshot.currentStepNumber;
  const currentDone = ctx.completedStepNumbers.includes(current);
  if (currentDone) {
    const next = nextStepNumber(ctx, current);
    if (next) {
      return beginStep(ctx, next);
    }
    return result(
      {
        phase: "awaiting_assessment",
        currentStepNumber: current,
        reviewStepNumber: null,
        navigationOffered: false,
      },
      assessmentOfferPrompt(ctx),
      { type: "listen" },
    );
  }

  const priorSteps = ctx.steps.filter((step) => step.stepNumber < current);
  const priorDone =
    priorSteps.length > 0 &&
    priorSteps.every((step) => ctx.completedStepNumbers.includes(step.stepNumber));
  if (priorDone) {
    return beginStep(ctx, current);
  }

  return stay(
    snapshot,
    "Please finish watching the current video before moving on.",
  );
}

function offerPostReviewNavigation(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
): AgentReduceResult {
  const reviewStep = snapshot.reviewStepNumber || snapshot.currentStepNumber;
  return result(
    { ...snapshot, navigationOffered: true },
    postReviewPrompt(ctx, reviewStep),
    { type: "listen" },
  );
}

function replayWatchedVideo(
  ctx: AgentContext,
  snapshot: AgentSnapshot,
): AgentReduceResult {
  const watched = snapshot.reviewStepNumber || snapshot.currentStepNumber;
  if (watched !== snapshot.currentStepNumber) {
    return beginReview(ctx, snapshot, watched);
  }
  return beginStep(ctx, snapshot.currentStepNumber);
}

function handleReviewIntent(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
): AgentReduceResult | null {
  if (intent.type !== "review") return null;
  const query = String(intent.query || "");
  const numbered = extractStepNumber(query);
  const previousAsk = isPreviousStepRequest(query);
  const cursor = snapshot.reviewStepNumber || snapshot.currentStepNumber;
  let stepNumber = numbered || intent.stepNumber || null;
  if (previousAsk) {
    stepNumber = cursor - 1;
    if (!stepNumber || stepNumber < 1) {
      return stay(
        snapshot,
        "You are already on the first step. You can watch this video, or move to the next step.",
      );
    }
  }
  if (!stepNumber) {
    const candidates = (intent.candidates || []).filter(
      (n) => n <= snapshot.currentStepNumber,
    );
    if (candidates.length > 1) {
      return stay(
        snapshot,
        `I found more than one match: ${titlesForSteps(ctx.steps, candidates)}. Which one should I play?`,
      );
    }
    if (candidates.length === 1 && stepByNumber(ctx, candidates[0])) {
      return beginReview(ctx, snapshot, candidates[0]);
    }
    return stay(
      snapshot,
      "I could not find that earlier step. Please say a step number or title you have already watched.",
    );
  }
  if (stepNumber === snapshot.currentStepNumber && !snapshot.reviewStepNumber) {
    return beginStep(ctx, stepNumber);
  }
  if (stepNumber > snapshot.currentStepNumber) {
    const currentDone = ctx.completedStepNumbers.includes(snapshot.currentStepNumber);
    const next = nextStepNumber(ctx, snapshot.currentStepNumber);
    if (currentDone && next != null && stepNumber === next) {
      return beginStep(ctx, stepNumber);
    }
    const allowed = currentDone ? next ?? snapshot.currentStepNumber : snapshot.currentStepNumber;
    return stay(
      snapshot,
      isLastStep(ctx, snapshot.currentStepNumber)
        ? "That step is later in the training. You can watch an earlier step, or say you are ready for the assessment."
        : `That step comes later. Let's continue with Step ${allowed} first.`,
    );
  }
  if (stepByNumber(ctx, stepNumber)) {
    return beginReview(ctx, snapshot, stepNumber);
  }
  const candidates = (intent.candidates || []).filter(
    (n) => n <= snapshot.currentStepNumber,
  );
  if (candidates.length > 1) {
    return stay(
      snapshot,
      `I found more than one match: ${titlesForSteps(ctx.steps, candidates)}. Which one should I play?`,
    );
  }
  if (candidates.length === 1 && stepByNumber(ctx, candidates[0])) {
    return beginReview(ctx, snapshot, candidates[0]);
  }
  return stay(
    snapshot,
    "I could not find that earlier step. Please say a step number or title you have already watched.",
  );
}

function onWelcomeVoice(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
  lastSpokenText: string,
): AgentReduceResult {
  const review = handleReviewIntent(snapshot, ctx, intent);
  if (review) return review;
  if (intent.type === "confirm" || intent.type === "next" || intent.type === "assessment") {
    return beginStep(ctx, snapshot.currentStepNumber);
  }
  return emptyReply(snapshot, ctx, lastSpokenText);
}

function onPostVideoVoice(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
): AgentReduceResult {
  if (intent.type === "assessment") {
    if (isLastStep(ctx, snapshot.currentStepNumber) || ctx.allStepsCompleted) {
      return result(
        {
          phase: "awaiting_assessment",
          currentStepNumber: snapshot.currentStepNumber,
          reviewStepNumber: null,
          navigationOffered: false,
        },
        assessmentOfferPrompt(ctx),
        { type: "listen" },
      );
    }
    return stay(
      snapshot,
      "The assessment comes after the last step. You can ask a question, watch this again, watch an earlier step, or move to the next video.",
    );
  }

  if (intent.type === "rewatch") {
    return replayWatchedVideo(ctx, snapshot);
  }

  if (intent.type === "next" || intent.type === "confirm" || intent.type === "no_doubt") {
    return advanceFromPostVideo(snapshot, ctx);
  }

  const review = handleReviewIntent(snapshot, ctx, intent);
  if (review) return review;

  return clarify(
    snapshot,
    isLastStep(ctx, snapshot.currentStepNumber)
      ? "You can ask a question, watch this again, watch an earlier step, or say you are ready for the assessment."
      : "You can ask a question, watch this again, watch an earlier step, or move to the next video.",
  );
}

function postponeAssessment(snapshot: AgentSnapshot): AgentReduceResult {
  return {
    snapshot: {
      phase: "awaiting_assessment",
      currentStepNumber: snapshot.currentStepNumber,
      reviewStepNumber: null,
      navigationOffered: false,
    },
    expectedInput: "none",
    spokenText: assessmentDeclinePrompt(),
    action: { type: "idle" },
    speak: true,
  };
}

function onAwaitingAssessmentVoice(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
): AgentReduceResult {
  if (intent.type === "decline") {
    return postponeAssessment(snapshot);
  }
  const review = handleReviewIntent(snapshot, ctx, intent);
  if (review) return review;
  if (intent.type === "rewatch") {
    return beginStep(ctx, snapshot.currentStepNumber);
  }
  if (intent.type === "assessment" || intent.type === "confirm" || intent.type === "retake") {
    return result(snapshot, "", { type: "listen" }, false);
  }
  return stay(snapshot, assessmentAskAgainPrompt());
}

function onFailedRecoveryVoice(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
): AgentReduceResult {
  if (intent.type === "decline") {
    return postponeAssessment(snapshot);
  }
  const review = handleReviewIntent(snapshot, ctx, intent);
  if (review) return review;
  if (intent.type === "retake" || intent.type === "assessment") {
    return result(snapshot, "", { type: "listen" }, false);
  }
  return clarify(
    snapshot,
    "You can say retake to try the assessment again, or name a step title or concept to review.",
  );
}

function onPostReviewVoice(
  snapshot: AgentSnapshot,
  ctx: AgentContext,
  intent: ParsedIntent,
): AgentReduceResult {
  if (!snapshot.navigationOffered) {
    if (intent.type === "no_doubt") {
      return offerPostReviewNavigation(snapshot, ctx);
    }
    if (intent.type === "next") {
      return offerPostReviewNavigation(snapshot, ctx);
    }
    if (intent.type === "rewatch" && snapshot.reviewStepNumber) {
      return beginReview(ctx, snapshot, snapshot.reviewStepNumber);
    }
    const review = handleReviewIntent(snapshot, ctx, intent);
    if (review) return review;
    return clarify(
      snapshot,
      "Ask your question, say you have no doubts, or tell me when you are ready to continue.",
    );
  }

  const review = handleReviewIntent(snapshot, ctx, intent);
  if (review) return review;
  if (intent.type === "rewatch" && snapshot.reviewStepNumber) {
    return beginReview(ctx, snapshot, snapshot.reviewStepNumber);
  }
  if (intent.type === "decline") {
    return postponeAssessment(snapshot);
  }
  if (intent.type === "assessment" || intent.type === "confirm" || intent.type === "retake") {
    return result(snapshot, "", { type: "listen" }, false);
  }
  return stay(snapshot, assessmentAskAgainPrompt());
}

export function wantsAssessmentStart(
  snapshot: AgentSnapshot,
  intent: ParsedIntent,
  ctx?: AgentContext,
): boolean {
  if (
    intent.type === "exit" ||
    intent.type === "empty" ||
    intent.type === "replay" ||
    intent.type === "decline" ||
    intent.type === "unknown"
  ) {
    return false;
  }
  if (snapshot.phase === "awaiting_assessment") {
    return intent.type === "assessment" || intent.type === "confirm" || intent.type === "retake";
  }
  if (snapshot.phase === "failed_recovery") {
    return intent.type === "retake" || intent.type === "assessment";
  }
  if (snapshot.phase === "post_review") {
    return intent.type === "assessment" || intent.type === "confirm" || intent.type === "retake";
  }
  if (snapshot.phase === "post_video") {
    const last =
      Boolean(ctx?.allStepsCompleted) ||
      (ctx ? isLastStep(ctx, snapshot.currentStepNumber) : false);
    return last && intent.type === "assessment";
  }
  return false;
}
