import { Router, Response } from "express";
import { AuthedRequest, requireStaffAuth } from "../middleware/auth";
import {
  findTrainingOrThrow,
  getOrCreateProgress,
  serializeProgress,
} from "../services/progress";
import {
  startLearningCheck,
  answerLearningCheckQuestion,
  finalizeLearningCheck,
  startAssessment,
  answerAssessmentQuestion,
  transcribeAssessmentAudio,
  expireAssessmentIfNeeded,
  serializeAttempt,
  listAttempts,
} from "../services/assessment";
import AssessmentAttempt from "../models/AssessmentAttempt";

const router = Router({ mergeParams: true });

function errorStatus(err: unknown): number {
  return (err as { status?: number })?.status || 500;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Server error";
}

router.post("/learning-check/start", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);
    const updated = await startLearningCheck({ auth, training, progress });
    res.json({ success: true, data: serializeProgress(training, updated) });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post(
  "/learning-check/answer",
  requireStaffAuth,
  async (req, res: Response) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const training = await findTrainingOrThrow(req.params.id);
      const progress = await getOrCreateProgress(auth, training);
      const { questionIndex, audioBase64, mimeType } = req.body || {};

      if (!audioBase64 || !mimeType) {
        res.status(400).json({
          success: false,
          error: "audioBase64 and mimeType are required",
        });
        return;
      }

      const result = await answerLearningCheckQuestion({
        training,
        progress,
        questionIndex: Number(questionIndex),
        audioBase64: String(audioBase64),
        mimeType: String(mimeType),
      });

      if (result.emptyOrNoise) {
        res.json({
          success: true,
          data: {
            emptyOrNoise: true,
            transcript: result.transcript,
            message: "No speech detected. Please record again.",
            progress: serializeProgress(training, result.progress),
          },
        });
        return;
      }

      let finalized = result.progress;
      if (result.allAnswered) {
        finalized = await finalizeLearningCheck({
          training,
          progress: result.progress,
        });
      }

      res.json({
        success: true,
        data: {
          emptyOrNoise: false,
          transcript: result.transcript,
          allAnswered: result.allAnswered,
          progress: serializeProgress(training, finalized),
        },
      });
    } catch (err) {
      res
        .status(errorStatus(err))
        .json({ success: false, error: errorMessage(err) });
    }
  },
);

router.post("/assessment/start", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);
    const { attempt, progress: updated } = await startAssessment({
      auth,
      training,
      progress,
    });
    res.json({
      success: true,
      data: {
        progress: serializeProgress(training, updated),
        assessment: serializeAttempt(attempt),
      },
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.get("/assessment/current", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);

    if (!progress.currentAssessmentAttemptId) {
      res.json({
        success: true,
        data: {
          progress: serializeProgress(training, progress),
          assessment: null,
        },
      });
      return;
    }

    const attempt = await AssessmentAttempt.findById(
      progress.currentAssessmentAttemptId,
    );
    if (!attempt) {
      res.json({
        success: true,
        data: {
          progress: serializeProgress(training, progress),
          assessment: null,
        },
      });
      return;
    }

    if (
      attempt.staffId !== auth.staffId ||
      attempt.tenantStoreId !== auth.tenantStoreId
    ) {
      res.status(403).json({ success: false, error: "Forbidden" });
      return;
    }

    const expired = await expireAssessmentIfNeeded({
      attempt,
      progress,
      training,
    });

    res.json({
      success: true,
      data: {
        progress: serializeProgress(training, expired.progress),
        assessment: serializeAttempt(expired.attempt),
      },
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post("/assessment/transcribe", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);
    const { audioBase64, mimeType } = req.body || {};

    if (!audioBase64 || !mimeType) {
      res.status(400).json({
        success: false,
        error: "audioBase64 and mimeType are required",
      });
      return;
    }

    const result = await transcribeAssessmentAudio({
      auth,
      training,
      progress,
      audioBase64: String(audioBase64),
      mimeType: String(mimeType),
    });

    res.json({
      success: true,
      data: {
        emptyOrNoise: result.emptyOrNoise,
        transcript: result.transcript,
        expired: result.expired,
        message: result.emptyOrNoise
          ? "No speech detected. Please record again."
          : undefined,
        progress: serializeProgress(training, result.progress),
        assessment: serializeAttempt(result.attempt),
      },
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post("/assessment/expire", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);

    if (!progress.currentAssessmentAttemptId) {
      res.status(400).json({ success: false, error: "No active assessment" });
      return;
    }

    const attempt = await AssessmentAttempt.findById(
      progress.currentAssessmentAttemptId,
    );
    if (!attempt) {
      res.status(400).json({ success: false, error: "No active assessment" });
      return;
    }

    const expired = await expireAssessmentIfNeeded({
      attempt,
      progress,
      training,
    });

    res.json({
      success: true,
      data: {
        expired: expired.expired || Boolean(expired.attempt.completedAt),
        progress: serializeProgress(training, expired.progress),
        assessment: serializeAttempt(expired.attempt),
      },
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post("/assessment/answer", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);
    const { questionIndex, audioBase64, mimeType, transcript } = req.body || {};

    if (!transcript && (!audioBase64 || !mimeType)) {
      res.status(400).json({
        success: false,
        error: "transcript or audioBase64 and mimeType are required",
      });
      return;
    }

    const result = await answerAssessmentQuestion({
      auth,
      training,
      progress,
      questionIndex: Number(questionIndex),
      audioBase64: audioBase64 != null ? String(audioBase64) : undefined,
      mimeType: mimeType != null ? String(mimeType) : undefined,
      transcript: transcript != null ? String(transcript) : undefined,
    });

    if (result.emptyOrNoise) {
      res.json({
        success: true,
        data: {
          emptyOrNoise: true,
          transcript: result.transcript,
          message: "No speech detected. Please record again.",
          expired: result.expired,
          progress: serializeProgress(training, result.progress),
          assessment: serializeAttempt(result.attempt),
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        emptyOrNoise: false,
        transcript: result.transcript,
        finished: result.finished,
        expired: result.expired,
        progress: serializeProgress(training, result.progress),
        assessment: serializeAttempt(result.attempt),
      },
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.get("/attempts", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = await findTrainingOrThrow(req.params.id);
    // ensure ownership scope via auth only
    void training;
    const attempts = await listAttempts({
      auth,
      trainingId: req.params.id,
    });
    res.json({
      success: true,
      data: attempts.map((a) => ({
        attemptId: String(a._id),
        attemptNumber: a.attemptNumber,
        cycleNumber: a.cycleNumber,
        scorePercent: a.scorePercent,
        passed: a.passed,
        timedOut: Boolean(a.timedOut),
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        correctCount: (a.questions || []).filter((q) => q.correct === true).length,
        totalQuestions: (a.questions || []).length,
      })),
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

export default router;
