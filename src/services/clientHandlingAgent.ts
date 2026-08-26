import AgentSession, { IAgentSession } from "../models/AgentSession";
import type { StaffAuth } from "../middleware/auth";
import type { SopDefinition } from "../data/sops/types";
import { findTrainingOrThrow, getOrCreateProgress, serializeProgress } from "./progress";
import { transcribeSpeech, localizeTrainerSpeech } from "./gemini";
import { looksLikeEmptyOrNoiseTranscript } from "./agentIntents";
import type { AgentTurnResponse, AgentUiState } from "./agentTypes";
import { normalizeResponseLanguage, type ResponseLanguage } from "./responseLanguage";
import {
  CLIENT_HANDLING_GOODBYE,
  defaultConversationState,
  type ClientHandlingConversationState,
} from "./clientHandlingTypes";
import { normalizeConversationState } from "./clientHandlingFlow";
import { parseClientHandlingIntent } from "./clientHandlingIntents";
import {
  generateClientHandlingOpening,
  processClientHandlingTurn,
  type TurnResult,
} from "./clientHandlingGemini";
import {
  generateStylistClientHandlingOpening,
  processStylistClientHandlingTurn,
} from "./stylistClientHandlingGemini";
import {
  TRAINING_MODE_MANAGER_CLIENT_HANDLING,
  TRAINING_MODE_STYLIST_CLIENT_HANDLING,
  clientHandlingRoleFor,
  type ClientHandlingRole,
} from "./trainingModes";

const CLIENT_HANDLING_PHASE = "client_handling" as const;

function trainingModeForRole(role: ClientHandlingRole): string {
  return role === "stylist"
    ? TRAINING_MODE_STYLIST_CLIENT_HANDLING
    : TRAINING_MODE_MANAGER_CLIENT_HANDLING;
}

function resolveRoleOrThrow(training: SopDefinition): ClientHandlingRole {
  const role = clientHandlingRoleFor(training);
  if (!role) {
    throw new Error(`Training ${training.slug} is not a client-handling role`);
  }
  return role;
}

async function generateOpeningForRole(role: ClientHandlingRole): Promise<TurnResult> {
  if (role === "stylist") return generateStylistClientHandlingOpening();
  return generateClientHandlingOpening();
}

async function processTurnForRole(options: {
  role: ClientHandlingRole;
  state: ClientHandlingConversationState;
  intent: ReturnType<typeof parseClientHandlingIntent>;
  transcript: string;
}): Promise<TurnResult> {
  if (options.role === "stylist") {
    return processStylistClientHandlingTurn({
      state: options.state,
      intent: options.intent,
      transcript: options.transcript,
    });
  }
  return processClientHandlingTurn({
    state: options.state,
    intent: options.intent,
    transcript: options.transcript,
  });
}

function sessionLanguage(session: IAgentSession): ResponseLanguage {
  return normalizeResponseLanguage(session.responseLanguage);
}

function applySessionLanguage(session: IAgentSession, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  session.responseLanguage = normalizeResponseLanguage(value);
}

function readConversationState(session: IAgentSession): ClientHandlingConversationState {
  return normalizeConversationState(session.conversationState);
}

function writeConversationState(
  session: IAgentSession,
  state: ClientHandlingConversationState,
  role: ClientHandlingRole,
): void {
  session.conversationState = state;
  session.trainingMode = trainingModeForRole(role);
}

async function localizeOutput(session: IAgentSession, text: string): Promise<string> {
  return localizeTrainerSpeech({
    text,
    responseLanguage: sessionLanguage(session),
  });
}

function uiStateFor(spokenText: string, action: "listen" | "idle"): AgentUiState {
  if (action === "idle") return "idle";
  return spokenText ? "speaking" : "listening";
}

async function buildTurnResponse(options: {
  session: IAgentSession;
  training: SopDefinition;
  progress: Awaited<ReturnType<typeof getOrCreateProgress>>;
  spokenText: string;
  action: "listen" | "idle";
  conversationState: ClientHandlingConversationState;
  role: ClientHandlingRole;
}): Promise<AgentTurnResponse> {
  const { session, training, progress, spokenText, action, conversationState, role } =
    options;
  const localized = spokenText ? await localizeOutput(session, spokenText) : "";
  if (localized) {
    session.lastSpokenText = localized;
    session.utteranceSeq += 1;
  }
  session.lastActionType = action;
  session.phase = CLIENT_HANDLING_PHASE;
  session.expectedInput = action === "listen" ? "doubt_or_navigate" : "none";
  session.status = action === "idle" ? "abandoned" : "active";
  writeConversationState(session, conversationState, role);
  await session.save();

  return {
    sessionId: String(session._id),
    responseId: `${String(session._id)}-${session.utteranceSeq}`,
    phase: CLIENT_HANDLING_PHASE,
    expectedInput: action === "listen" ? "doubt_or_navigate" : "none",
    spokenText: localized,
    caption: localized,
    uiState: uiStateFor(localized, action),
    action: { type: action },
    currentStep: null,
    progress: serializeProgress(training, progress),
    assessment: null,
    responseLanguage: sessionLanguage(session),
    trainingMode: trainingModeForRole(role),
    conversationPhase: conversationState.phase,
  };
}

async function getOrCreateClientHandlingSession(
  auth: StaffAuth,
  training: SopDefinition,
  progress: Awaited<ReturnType<typeof getOrCreateProgress>>,
  role: ClientHandlingRole,
): Promise<IAgentSession> {
  let session = await AgentSession.findOne({
    staffId: auth.staffId,
    tenantStoreId: auth.tenantStoreId,
    trainingSlug: training.slug,
  });

  if (!session) {
    session = await AgentSession.create({
      staffId: auth.staffId,
      tenantStoreId: auth.tenantStoreId,
      tenantMongoId: auth.tenantMongoId,
      trainingSlug: training.slug,
      contentVersion: training.contentVersion,
      cycleNumber: progress.cycleNumber,
      trainingMode: trainingModeForRole(role),
      phase: CLIENT_HANDLING_PHASE,
      currentStepNumber: 1,
      reviewStepNumber: null,
      navigationOffered: false,
      expectedInput: "doubt_or_navigate",
      lastSpokenText: "",
      lastActionType: "listen",
      utteranceSeq: 0,
      responseLanguage: "en",
      status: "active",
      conversationState: defaultConversationState(),
    });
    return session;
  }

  let changed = false;
  if (session.contentVersion !== training.contentVersion) {
    session.contentVersion = training.contentVersion;
    session.cycleNumber = progress.cycleNumber;
    changed = true;
  }
  if (auth.tenantMongoId && session.tenantMongoId !== auth.tenantMongoId) {
    session.tenantMongoId = auth.tenantMongoId;
    changed = true;
  }
  const expectedMode = trainingModeForRole(role);
  if (session.trainingMode !== expectedMode) {
    session.trainingMode = expectedMode;
    changed = true;
  }
  if (changed) await session.save();
  return session;
}

export async function startClientHandlingSession(options: {
  auth: StaffAuth;
  trainingId: string;
  responseLanguage?: string;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  const role = resolveRoleOrThrow(training);
  const progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateClientHandlingSession(
    options.auth,
    training,
    progress,
    role,
  );
  applySessionLanguage(session, options.responseLanguage);

  const opening = await generateOpeningForRole(role);
  const conversationState: ClientHandlingConversationState = {
    phase: opening.nextPhase,
    completedScenarioCount: 0,
    currentScenario: opening.currentScenario,
    firstAttemptWasIncorrect: false,
    usedScenarioTopics: opening.usedScenarioTopics,
    recentTurns: opening.recentTurns,
  };

  return buildTurnResponse({
    session,
    training,
    progress,
    spokenText: opening.spokenText,
    action: "listen",
    conversationState,
    role,
  });
}

function emptyReprompt(state: ClientHandlingConversationState): string {
  if (state.phase === "awaiting_answer" && state.currentScenario) {
    return `I didn't catch that. ${state.currentScenario.question}`;
  }
  if (state.phase === "awaiting_retry_answer" && state.currentScenario) {
    return `I didn't catch that. Now let's try the same situation again. ${state.currentScenario.question}`;
  }
  if (state.phase === "awaiting_post_scenario_intent") {
    return "I didn't catch that. Do you have any doubts about this situation, or would you like another scenario?";
  }
  return "I didn't catch that. Would you like another client-handling scenario?";
}

export async function submitClientHandlingTurn(options: {
  auth: StaffAuth;
  trainingId: string;
  transcript?: string;
  audioBase64?: string;
  mimeType?: string;
  responseLanguage?: string;
  languageOnly?: boolean;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  const role = resolveRoleOrThrow(training);
  const progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateClientHandlingSession(
    options.auth,
    training,
    progress,
    role,
  );
  applySessionLanguage(session, options.responseLanguage);

  const state = readConversationState(session);

  if (options.languageOnly) {
    const spoken = session.lastSpokenText || "";
    return buildTurnResponse({
      session,
      training,
      progress,
      spokenText: spoken,
      action: state.phase === "completed" ? "idle" : "listen",
      conversationState: state,
      role,
    });
  }

  let transcript = String(options.transcript || "").trim();
  if (!transcript && options.audioBase64 && options.mimeType) {
    const stt = await transcribeSpeech({
      audioBase64: options.audioBase64,
      mimeType: options.mimeType,
    });
    if (!stt.emptyOrNoise) transcript = stt.transcript.trim();
  }

  if (!transcript || looksLikeEmptyOrNoiseTranscript(transcript)) {
    return buildTurnResponse({
      session,
      training,
      progress,
      spokenText: emptyReprompt(state),
      action: "listen",
      conversationState: state,
      role,
    });
  }

  const intent = parseClientHandlingIntent(transcript, state.phase);
  const result = await processTurnForRole({
    role,
    state,
    intent,
    transcript,
  });

  const conversationState: ClientHandlingConversationState = {
    phase: result.nextPhase,
    completedScenarioCount: result.completedScenarioCount,
    currentScenario: result.currentScenario,
    firstAttemptWasIncorrect: result.firstAttemptWasIncorrect,
    usedScenarioTopics: result.usedScenarioTopics,
    recentTurns: result.recentTurns,
  };

  const action = result.nextPhase === "completed" ? "idle" : "listen";

  return buildTurnResponse({
    session,
    training,
    progress,
    spokenText: result.spokenText,
    action,
    conversationState,
    role,
  });
}

export async function abandonClientHandlingSession(options: {
  auth: StaffAuth;
  trainingId: string;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  const role = resolveRoleOrThrow(training);
  const progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateClientHandlingSession(
    options.auth,
    training,
    progress,
    role,
  );

  const conversationState: ClientHandlingConversationState = {
    ...readConversationState(session),
    phase: "completed",
    currentScenario: null,
  };

  return buildTurnResponse({
    session,
    training,
    progress,
    spokenText: CLIENT_HANDLING_GOODBYE,
    action: "idle",
    conversationState,
    role,
  });
}

export async function noopClientHandlingVideoComplete(options: {
  auth: StaffAuth;
  trainingId: string;
  responseLanguage?: string;
}): Promise<AgentTurnResponse> {
  const training = findTrainingOrThrow(options.trainingId);
  const role = resolveRoleOrThrow(training);
  const progress = await getOrCreateProgress(options.auth, training);
  const session = await getOrCreateClientHandlingSession(
    options.auth,
    training,
    progress,
    role,
  );
  applySessionLanguage(session, options.responseLanguage);
  const state = readConversationState(session);
  return buildTurnResponse({
    session,
    training,
    progress,
    spokenText: session.lastSpokenText || "",
    action: state.phase === "completed" ? "idle" : "listen",
    conversationState: state,
    role,
  });
}
