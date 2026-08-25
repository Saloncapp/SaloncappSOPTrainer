import type { SopDefinition } from "../data/sops/types";

export type TrainingMode = "SOP_VIDEO" | "MANAGER_CLIENT_HANDLING";

export const TRAINING_MODE_MANAGER_CLIENT_HANDLING = "MANAGER_CLIENT_HANDLING" as const;

const CLIENT_HANDLING_SLUG = "manager-client-handling";

export function trainingModeFor(training: SopDefinition): TrainingMode {
  if (training.slug === CLIENT_HANDLING_SLUG) {
    return "MANAGER_CLIENT_HANDLING";
  }
  return "SOP_VIDEO";
}

export function isManagerClientHandling(training: SopDefinition): boolean {
  return trainingModeFor(training) === "MANAGER_CLIENT_HANDLING";
}
