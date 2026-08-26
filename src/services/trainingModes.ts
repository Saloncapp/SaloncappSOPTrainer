import type { SopDefinition } from "../data/sops/types";

export type TrainingMode =
  | "SOP_VIDEO"
  | "MANAGER_CLIENT_HANDLING"
  | "STYLIST_CLIENT_HANDLING";

export const TRAINING_MODE_MANAGER_CLIENT_HANDLING = "MANAGER_CLIENT_HANDLING" as const;
export const TRAINING_MODE_STYLIST_CLIENT_HANDLING = "STYLIST_CLIENT_HANDLING" as const;

const MANAGER_CLIENT_HANDLING_SLUG = "manager-client-handling";
const STYLIST_CLIENT_HANDLING_SLUG = "stylist-client-handling";

export function trainingModeFor(training: SopDefinition): TrainingMode {
  if (training.slug === MANAGER_CLIENT_HANDLING_SLUG) {
    return "MANAGER_CLIENT_HANDLING";
  }
  if (training.slug === STYLIST_CLIENT_HANDLING_SLUG) {
    return "STYLIST_CLIENT_HANDLING";
  }
  return "SOP_VIDEO";
}

export function isManagerClientHandling(training: SopDefinition): boolean {
  return trainingModeFor(training) === "MANAGER_CLIENT_HANDLING";
}

export function isStylistClientHandling(training: SopDefinition): boolean {
  return trainingModeFor(training) === "STYLIST_CLIENT_HANDLING";
}

export function isClientHandlingTraining(training: SopDefinition): boolean {
  const mode = trainingModeFor(training);
  return (
    mode === "MANAGER_CLIENT_HANDLING" || mode === "STYLIST_CLIENT_HANDLING"
  );
}

export type ClientHandlingRole = "manager" | "stylist";

export function clientHandlingRoleFor(
  training: SopDefinition,
): ClientHandlingRole | null {
  if (isManagerClientHandling(training)) return "manager";
  if (isStylistClientHandling(training)) return "stylist";
  return null;
}
