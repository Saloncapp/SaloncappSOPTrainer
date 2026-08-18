import mongoose, { Document, Schema, Model, Types } from "mongoose";

export type ProgressStatus =
  | "in_progress"
  | "awaiting_learning_check"
  | "ready_for_assessment"
  | "in_assessment"
  | "passed"
  | "failed_retraining";

export type StepProgress = {
  stepNumber: number;
  videoPositionSeconds: number;
  videoCompleted: boolean;
  completedAt?: Date | null;
};

export type LearningCheckQuestion = {
  index: number;
  questionText: string;
  relatedStepNumbers: number[];
  transcript?: string;
  evaluationFeedback?: string;
  correct?: boolean;
  answeredAt?: Date | null;
};

export type LearningCheckState = {
  questions: LearningCheckQuestion[];
  ready: boolean;
  feedback?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export interface IStaffTrainingProgress extends Document {
  staffId: string;
  tenantStoreId: string;
  tenantMongoId?: string | null;
  trainingSlug: string;
  contentVersion: number;
  status: ProgressStatus;
  cycleNumber: number;
  steps: StepProgress[];
  learningCheck: LearningCheckState;
  previousLearningQuestionTexts: string[];
  currentAssessmentAttemptId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const StepProgressSchema = new Schema(
  {
    stepNumber: { type: Number, required: true, min: 1 },
    videoPositionSeconds: { type: Number, default: 0, min: 0 },
    videoCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const LearningCheckQuestionSchema = new Schema(
  {
    index: { type: Number, required: true },
    questionText: { type: String, required: true },
    relatedStepNumbers: { type: [Number], default: [] },
    transcript: { type: String, default: "" },
    evaluationFeedback: { type: String, default: "" },
    correct: { type: Boolean },
    answeredAt: { type: Date, default: null },
  },
  { _id: false },
);

const LearningCheckSchema = new Schema(
  {
    questions: { type: [LearningCheckQuestionSchema], default: [] },
    ready: { type: Boolean, default: false },
    feedback: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const StaffTrainingProgressSchema = new Schema<IStaffTrainingProgress>(
  {
    staffId: { type: String, required: true, index: true },
    tenantStoreId: { type: String, required: true, index: true },
    tenantMongoId: { type: String, default: null },
    trainingSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    contentVersion: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: [
        "in_progress",
        "awaiting_learning_check",
        "ready_for_assessment",
        "in_assessment",
        "passed",
        "failed_retraining",
      ],
      default: "in_progress",
    },
    cycleNumber: { type: Number, default: 1, min: 1 },
    steps: { type: [StepProgressSchema], default: [] },
    learningCheck: {
      type: LearningCheckSchema,
      default: () => ({ questions: [], ready: false }),
    },
    previousLearningQuestionTexts: { type: [String], default: [] },
    currentAssessmentAttemptId: {
      type: Schema.Types.ObjectId,
      ref: "AssessmentAttempt",
      default: null,
    },
  },
  { timestamps: true, collection: "staff_training_progress" },
);

StaffTrainingProgressSchema.index(
  { staffId: 1, tenantStoreId: 1, trainingSlug: 1 },
  { unique: true },
);

const StaffTrainingProgress: Model<IStaffTrainingProgress> =
  mongoose.models.StaffTrainingProgress ||
  mongoose.model<IStaffTrainingProgress>(
    "StaffTrainingProgress",
    StaffTrainingProgressSchema,
  );

export default StaffTrainingProgress;
