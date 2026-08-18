import { Router, Response } from "express";
import { AuthedRequest, requireStaffAuth } from "../middleware/auth";
import { errorMessage, errorStatus } from "../errors";
import {
  abandonAgentSession,
  completeAgentVideo,
  startOrResumeAgentSession,
  submitAgentTurn,
} from "../services/agent";

const router = Router({ mergeParams: true });

router.post("/session", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const data = await startOrResumeAgentSession({
      auth,
      trainingId: req.params.id,
      responseLanguage: req.body?.responseLanguage ?? req.body?.response_language,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post("/turn", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const {
      transcript,
      audioBase64,
      mimeType,
      responseLanguage = req.body?.response_language,
    } = req.body || {};
    const hasTranscriptField = transcript !== undefined && transcript !== null;
    const hasAudio = Boolean(audioBase64 && mimeType);
    const languageOnly = Boolean(responseLanguage) && !hasTranscriptField && !hasAudio;
    if (!hasTranscriptField && !hasAudio && !languageOnly) {
      res.status(400).json({
        success: false,
        error: "transcript or audioBase64 and mimeType are required",
      });
      return;
    }
    const data = await submitAgentTurn({
      auth,
      trainingId: req.params.id,
      transcript: transcript != null ? String(transcript) : undefined,
      audioBase64: audioBase64 != null ? String(audioBase64) : undefined,
      mimeType: mimeType != null ? String(mimeType) : undefined,
      responseLanguage: responseLanguage != null ? String(responseLanguage) : undefined,
      languageOnly,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post("/video-complete", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const {
      stepNumber,
      positionSeconds,
      durationSeconds,
      ended,
      responseLanguage = req.body?.response_language,
    } = req.body || {};
    if (!Number(stepNumber)) {
      res.status(400).json({ success: false, error: "stepNumber is required" });
      return;
    }
    const data = await completeAgentVideo({
      auth,
      trainingId: req.params.id,
      stepNumber: Number(stepNumber),
      positionSeconds:
        positionSeconds != null ? Number(positionSeconds) : undefined,
      durationSeconds:
        durationSeconds != null ? Number(durationSeconds) : undefined,
      ended: ended !== false,
      responseLanguage: responseLanguage != null ? String(responseLanguage) : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

router.post("/abandon", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const data = await abandonAgentSession({
      auth,
      trainingId: req.params.id,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

export default router;
