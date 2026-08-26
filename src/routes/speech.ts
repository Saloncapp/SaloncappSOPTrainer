import { Router, Response } from "express";
import { AuthedRequest, requireStaffAuth } from "../middleware/auth";
import { errorMessage, errorStatus } from "../errors";
import { langLog } from "../services/langDebug";
import { normalizeResponseLanguage } from "../services/responseLanguage";
import {
  isTrainerTtsConfigured,
  synthesizeTrainerSpeech,
} from "../services/trainerTts";

const router = Router();

/**
 * Server-rendered speech for devices whose TTS engine has no voice for the
 * selected language (common on Samsung handsets, which ship no Tamil voice).
 */
router.post("/", requireStaffAuth, async (req, res: Response) => {
  try {
    const auth = (req as AuthedRequest).auth;
    const text = String(req.body?.text ?? "").trim();
    const language = normalizeResponseLanguage(
      req.body?.language ?? req.body?.responseLanguage,
    );

    if (!text) {
      res.status(400).json({ success: false, error: "text is required" });
      return;
    }
    if (!isTrainerTtsConfigured()) {
      res.status(503).json({
        success: false,
        error: "Server speech synthesis is not configured.",
      });
      return;
    }

    langLog("http.speech", {
      staffId: auth.staffId,
      language,
      textLen: text.length,
    });

    const data = await synthesizeTrainerSpeech({ text, language });
    res.json({ success: true, data });
  } catch (err) {
    res.status(errorStatus(err)).json({ success: false, error: errorMessage(err) });
  }
});

export default router;
