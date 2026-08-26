import type { SopStepLocales } from "../data/sops/types";

export type AgentPhase =
  | "welcome"
  | "playing_video"
  | "post_video"
  | "awaiting_assessment"
  | "in_assessment"
  | "passed"
  | "failed_recovery"
  | "playing_review"
  | "post_review"
  | "client_handling";

export type ExpectedInput =
  | "confirm"
  | "doubt_or_navigate"
  | "next_or_rewatch"
  | "assessment_confirm"
  | "assessment_answer"
  | "retake_or_review"
  | "review_or_assessment"
  | "none";

export type AgentActionType = "listen" | "play_video" | "show_result" | "idle";

export type AgentAction =
  | { type: "listen" }
  | { type: "play_video"; stepNumber: number }
  | { type: "show_result" }
  | { type: "idle" };

export type AgentSnapshot = {
  phase: AgentPhase;
  currentStepNumber: number;
  reviewStepNumber: number | null;
  navigationOffered: boolean;
};

export type AgentStepInfo = {
  stepNumber: number;
  title: string;
  description: string;
  importantPoints: string[];
  locales?: SopStepLocales;
  videoUrl: string;
  videoDurationSeconds: number;
  audio?: { ta: string; en: string; hi: string };
};

export type AgentContext = {
  trainingTitle: string;
  steps: AgentStepInfo[];
  completedStepNumbers: number[];
  currentStepVideoCompleted: boolean;
  status: string;
  allStepsCompleted: boolean;
  /** Optional guidance spoken after the last step, before assessment offer. */
  completionGuidance?: string;
};

export type IntentType =
  | "confirm"
  | "next"
  | "rewatch"
  | "no_doubt"
  | "doubt"
  | "assessment"
  | "retake"
  | "review"
  | "exit"
  | "replay"
  | "decline"
  | "unknown"
  | "empty";

export type ParsedIntent = {
  type: IntentType;
  query?: string;
  stepNumber?: number | null;
  candidates?: number[];
  confidence?: number;
};

export type AgentEvent =
  | { type: "bootstrap" }
  | { type: "voice"; intent: ParsedIntent }
  | { type: "video_complete"; stepNumber: number }
  | {
      type: "assessment_started";
      questionText: string;
      questionIndex: number;
      total: number;
    }
  | {
      type: "assessment_progress";
      questionText: string;
      questionIndex: number;
      total: number;
      emptyOrNoise?: boolean;
    }
  | {
      type: "assessment_finished";
      passed: boolean;
      scorePercent: number;
    }
  | { type: "doubt_answered"; answerText: string }
  | { type: "replay" };

export type AgentReduceResult = {
  snapshot: AgentSnapshot;
  expectedInput: ExpectedInput;
  spokenText: string;
  action: AgentAction;
  speak: boolean;
};

export type AgentUiState =
  | "speaking"
  | "listening"
  | "thinking"
  | "video"
  | "paused"
  | "error"
  | "result"
  | "idle";

export type AgentClientAction = {
  type: AgentActionType;
  stepNumber?: number;
  videoUrl?: string;
  title?: string;
  description?: string;
  importantPoints?: string[];
  locales?: SopStepLocales;
  audio?: { ta: string; en: string; hi: string };
};

export type AgentTurnResponse = {
  sessionId: string;
  responseId: string;
  phase: AgentPhase;
  expectedInput: ExpectedInput;
  spokenText: string;
  caption: string;
  uiState: AgentUiState;
  action: AgentClientAction;
  currentStep: AgentStepInfo | null;
  progress: unknown;
  assessment: unknown;
  recoveryMessage?: string;
  responseLanguage?: string;
  trainingMode?: string;
  conversationPhase?: string;
};
