import mongoose, { Document, Schema, Model } from "mongoose";

export type AssessmentQuestion = {
  index: number;
  questionText: string;
  relatedStepNumbers: number[];
  transcript?: string;
  evaluationFeedback?: string;
  correct?: boolean | null;
  answeredAt?: Date | null;
};

export interface IAssessmentAttempt extends Document {
  staffId: string;
  tenantStoreId: string;
  trainingSlug: string;
  contentVersion: number;
  cycleNumber: number;
  attemptNumber: number;
  questions: AssessmentQuestion[];
  scorePercent?: number | null;
  passed?: boolean | null;
  timedOut?: boolean;
  timeLimitSeconds?: number;
  expiresAt?: Date | null;
  startedAt: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentQuestionSchema = new Schema(
  {
    index: { type: Number, required: true },
    questionText: { type: String, required: true },
    relatedStepNumbers: { type: [Number], default: [] },
    transcript: { type: String, default: "" },
    evaluationFeedback: { type: String, default: "" },
    correct: { type: Boolean, default: null },
    answeredAt: { type: Date, default: null },
  },
  { _id: false },
);

const AssessmentAttemptSchema = new Schema<IAssessmentAttempt>(
  {
    staffId: { type: String, required: true, index: true },
    tenantStoreId: { type: String, required: true, index: true },
    trainingSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    contentVersion: { type: Number, required: true, min: 1 },
    cycleNumber: { type: Number, required: true, min: 1 },
    attemptNumber: { type: Number, required: true, min: 1 },
    questions: { type: [AssessmentQuestionSchema], default: [] },
    scorePercent: { type: Number, default: null },
    passed: { type: Boolean, default: null },
    timedOut: { type: Boolean, default: false },
    timeLimitSeconds: { type: Number, default: 600, min: 1 },
    expiresAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "assessment_attempts" },
);

AssessmentAttemptSchema.index({
  staffId: 1,
  tenantStoreId: 1,
  trainingSlug: 1,
  attemptNumber: -1,
});

const AssessmentAttempt: Model<IAssessmentAttempt> =
  mongoose.models.AssessmentAttempt ||
  mongoose.model<IAssessmentAttempt>("AssessmentAttempt", AssessmentAttemptSchema);

export default AssessmentAttempt;
