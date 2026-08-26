import type { TrainingStepMedia } from "./trainingMedia";
import { PLACEHOLDER_VIDEO_URL } from "./types";

/**
 * Per-step muted video + Tamil / English / Hindi narration for Women Straight Finish.
 * Cloudinary URLs will replace these placeholders when media is uploaded.
 * Never fall back to Hydrafacial or any other training's media.
 */
export const womenStraightFinishMedia: Record<number, TrainingStepMedia> = {
  1: {
    videoUrl: PLACEHOLDER_VIDEO_URL,
    audio: {
      ta: "",
      en: "",
      hi: "",
    },
  },
  2: {
    videoUrl: PLACEHOLDER_VIDEO_URL,
    audio: {
      ta: "",
      en: "",
      hi: "",
    },
  },
  3: {
    videoUrl: PLACEHOLDER_VIDEO_URL,
    audio: {
      ta: "",
      en: "",
      hi: "",
    },
  },
  4: {
    videoUrl: PLACEHOLDER_VIDEO_URL,
    audio: {
      ta: "",
      en: "",
      hi: "",
    },
  },
};
