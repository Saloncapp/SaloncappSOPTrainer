import type { AgentReduceResult, AgentSnapshot } from "./agentTypes";

/**
 * Language-only turns during play-video / play-review must keep the play_video
 * action. Returning idle here made the mobile client treat the response as a
 * session exit (leave to the training menu) when staff changed language during
 * the "I'll play the step video" intro TTS.
 */
export function languageOnlyReduceWhilePlayingVideo(options: {
  phase: "playing_video" | "playing_review";
  currentStepNumber: number;
  reviewStepNumber: number | null;
  navigationOffered: boolean;
  lastActionStepNumber?: number | null;
  lastSpokenText?: string | null;
}): AgentReduceResult {
  const snapshot: AgentSnapshot = {
    phase: options.phase,
    currentStepNumber: options.currentStepNumber,
    reviewStepNumber: options.reviewStepNumber,
    navigationOffered: Boolean(options.navigationOffered),
  };
  const stepNumber =
    options.lastActionStepNumber ||
    (options.phase === "playing_review"
      ? options.reviewStepNumber || options.currentStepNumber
      : options.currentStepNumber);
  const spokenText = String(options.lastSpokenText || "").trim();
  return {
    snapshot,
    expectedInput: "none",
    spokenText,
    action: { type: "play_video", stepNumber },
    speak: Boolean(spokenText),
  };
}
