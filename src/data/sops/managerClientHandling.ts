import type { SopDefinition } from "./types";

/** Conversation-only training — no SOP steps or videos. */
export const managerClientHandling: SopDefinition = {
  slug: "manager-client-handling",
  title: "Client Handling",
  description:
    "Scenario-based manager training for salon client handling, complaints, and service recovery.",
  isActive: true,
  contentVersion: 1,
  steps: [],
};
