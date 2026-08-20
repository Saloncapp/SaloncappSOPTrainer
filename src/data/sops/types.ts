export const PLACEHOLDER_VIDEO_URL = "PLACEHOLDER_VIDEO_URL";

export type SopDisplayLanguage = "en" | "ta" | "hi";

export type SopStepCopy = {
  description: string;
  importantPoints: string[];
};

export type SopStepLocales = Partial<Record<"ta" | "hi", SopStepCopy>>;

export type SopStep = {
  stepNumber: number;
  title: string;
  description: string;
  importantPoints: string[];
  videoUrl: string;
  videoDurationSeconds: number;
  locales?: SopStepLocales;
  audio?: {
    ta: string;
    en: string;
    hi: string;
  };
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

export function resolveSopStepCopy(
  step: Pick<SopStep, "description" | "importantPoints" | "locales"> | null | undefined,
  language: string | null | undefined,
): SopStepCopy {
  const description = String(step?.description || "");
  const importantPoints = Array.isArray(step?.importantPoints) ? step.importantPoints : [];
  const code = String(language || "en").trim().toLowerCase();
  if (code === "ta" || code === "hi") {
    const localized = step?.locales?.[code];
    if (localized?.description) {
      return {
        description: localized.description,
        importantPoints:
          localized.importantPoints?.length ? localized.importantPoints : importantPoints,
      };
    }
  }
  return { description, importantPoints };
}
