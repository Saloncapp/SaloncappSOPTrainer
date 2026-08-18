export const PLACEHOLDER_VIDEO_URL = "PLACEHOLDER_VIDEO_URL";

export type SopStep = {
  stepNumber: number;
  title: string;
  description: string;
  importantPoints: string[];
  videoUrl: string;
  videoDurationSeconds: number;
};

export type SopDefinition = {
  slug: string;
  title: string;
  description: string;
  isActive: boolean;
  /** Bump this whenever SOP text, steps, or video URLs change. */
  contentVersion: number;
  steps: SopStep[];
};

export function isPlaceholderVideoUrl(videoUrl: string): boolean {
  const url = (videoUrl || "").trim();
  return !url || url === PLACEHOLDER_VIDEO_URL || !/^https?:\/\//i.test(url);
}
