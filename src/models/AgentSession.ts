import mongoose, { Document, Schema, Model } from "mongoose";
import type { AgentPhase, ExpectedInput } from "../services/agentTypes";

export interface IAgentSession extends Document {
  staffId: string;
  tenantStoreId: string;
  tenantMongoId?: string | null;
  trainingSlug: string;
  contentVersion: number;
  cycleNumber: number;
  phase: AgentPhase;
  currentStepNumber: number;
  reviewStepNumber: number | null;
  navigationOffered: boolean;
  expectedInput: ExpectedInput;
  lastSpokenText: string;
  /**
   * The untranslated source of lastSpokenText. Re-localizing already-localized
   * speech cannot recover English, so language switches must start from this.
   */
  lastSpokenSource: string;
  lastActionType: string;
  lastActionStepNumber: number | null;
  utteranceSeq: number;
  responseLanguage: string;
  trainingMode?: string;
  conversationState?: Record<string, unknown>;
  status: "active" | "abandoned" | "completed";
  createdAt: Date;
  updatedAt: Date;
}

const AgentSessionSchema = new Schema<IAgentSession>(
  {
    staffId: { type: String, required: true, index: true },
    tenantStoreId: { type: String, required: true, index: true },
    tenantMongoId: { type: String, default: null },
    trainingSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    contentVersion: { type: Number, required: true, min: 1 },
    cycleNumber: { type: Number, default: 1, min: 1 },
    phase: { type: String, required: true },
    currentStepNumber: { type: Number, default: 1, min: 1 },
    reviewStepNumber: { type: Number, default: null },
    navigationOffered: { type: Boolean, default: false },
    expectedInput: { type: String, required: true, default: "confirm" },
    lastSpokenText: { type: String, default: "" },
    lastSpokenSource: { type: String, default: "" },
    lastActionType: { type: String, default: "listen" },
    lastActionStepNumber: { type: Number, default: null },
    utteranceSeq: { type: Number, default: 0, min: 0 },
    responseLanguage: { type: String, default: "en", trim: true, lowercase: true },
    trainingMode: { type: String, default: null },
    conversationState: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ["active", "abandoned", "completed"],
      default: "active",
    },
  },
  { timestamps: true, collection: "agent_sessions" },
);

AgentSessionSchema.index(
  { staffId: 1, tenantStoreId: 1, trainingSlug: 1 },
  { unique: true },
);

const AgentSession: Model<IAgentSession> =
  mongoose.models.AgentSession ||
  mongoose.model<IAgentSession>("AgentSession", AgentSessionSchema);

export default AgentSession;
