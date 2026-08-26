import type { SopDefinition } from "./types";

/** Conversation-only training — no SOP steps or videos. */
export const stylistClientHandling: SopDefinition = {
  slug: "stylist-client-handling",
  title: "Client Handling",
  description:
    "Scenario-based stylist training for salon client greeting, consultation, service explanation, expectations, and complaint recovery.",
  isActive: true,
  contentVersion: 1,
  steps: [],
};
