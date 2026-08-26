import { Router, Response } from "express";
import StaffTrainingProgress from "../models/StaffTrainingProgress";
import { AuthedRequest, requireStaffAuth } from "../middleware/auth";
import { listCatalog } from "../services/catalog";
import {
  findTrainingOrThrow,
  getOrCreateProgress,
  serializeProgress,
  updateVideoProgress,
  completeStep,
  resetTrainingProgress,
} from "../services/progress";

const router = Router();

function errorStatus(err: unknown): number {
  return (err as { status?: number })?.status || 500;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Server error";
}

router.get("/", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const trainings = listCatalog();

    const progressDocs = await StaffTrainingProgress.find({
      staffId: auth.staffId,
      tenantStoreId: auth.tenantStoreId,
      trainingSlug: { $in: trainings.map((t) => t.slug) },
    }).lean();

    const bySlug = new Map(progressDocs.map((p) => [p.trainingSlug, p]));

    const data = trainings.map((t) => {
      const p = bySlug.get(t.slug);
      const stale = Boolean(p && p.contentVersion !== t.contentVersion);
      const steps = p?.steps || [];
      const hasAnyProgress = steps.some(
        (s) =>
          Boolean(s.completedAt) ||
          Boolean(s.videoCompleted) ||
          (Number(s.videoPositionSeconds) || 0) > 0,
      );
      // Reset leaves status "in_progress" with empty steps — surface as not_started.
      const effectivelyNotStarted =
        !p ||
        (p.status === "in_progress" && !hasAnyProgress && !stale);
      return {
        id: t.slug,
        slug: t.slug,
        title: t.title,
        description: t.description,
        contentVersion: t.contentVersion,
        stepCount: t.steps?.length ?? 0,
        status: effectivelyNotStarted
          ? "not_started"
          : stale
            ? "in_progress"
            : p!.status,
        cycleNumber: p?.cycleNumber ?? 0,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.get("/:id", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);
    res.json({ success: true, data: serializeProgress(training, progress) });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.get("/:id/progress", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const training = findTrainingOrThrow(req.params.id);
    const progress = await getOrCreateProgress(auth, training);
    res.json({ success: true, data: serializeProgress(training, progress) });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post(
  "/:id/steps/:stepNumber/progress",
  requireStaffAuth,
  async (req, res: Response) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const stepNumber = Number(req.params.stepNumber);
      const { positionSeconds, durationSeconds, ended } = req.body || {};
      const { progress, training } = await updateVideoProgress({
        auth,
        trainingId: req.params.id,
        stepNumber,
        positionSeconds: Number(positionSeconds),
        durationSeconds:
          durationSeconds != null ? Number(durationSeconds) : undefined,
        ended: Boolean(ended),
      });
      res.json({ success: true, data: serializeProgress(training, progress) });
    } catch (err) {
      res
        .status(errorStatus(err))
        .json({ success: false, error: errorMessage(err) });
    }
  },
);

router.post(
  "/:id/steps/:stepNumber/complete",
  requireStaffAuth,
  async (req, res: Response) => {
    try {
      const auth = (req as AuthedRequest).auth;
      const stepNumber = Number(req.params.stepNumber);
      const { progress, training } = await completeStep({
        auth,
        trainingId: req.params.id,
        stepNumber,
      });
      res.json({ success: true, data: serializeProgress(training, progress) });
    } catch (err) {
      res
        .status(errorStatus(err))
        .json({ success: false, error: errorMessage(err) });
    }
  },
);

router.post("/:id/reset", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const { progress, training } = await resetTrainingProgress({
      auth,
      trainingId: req.params.id,
    });
    res.json({ success: true, data: serializeProgress(training, progress) });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

export default router;
