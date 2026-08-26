import {
  womenStraightFinishCompletionGuidanceLocales,
  womenStraightFinishStepLocales,
} from "./womenStraightFinishLocales";
import { womenStraightFinishMedia } from "./womenStraightFinishMedia";
import type { SopDefinition, SopStep } from "./types";
import { PLACEHOLDER_VIDEO_URL } from "./types";

/**
 * Source of truth: Step 1_ Hair Wash & Protection.pdf (Women Straight Finish / temporary ironing).
 * Final Look & Results is completion guidance, not a fifth training step.
 * Do not invent procedures; bump contentVersion when this file changes.
 */
export const womenStraightFinish: SopDefinition = {
  slug: "women-straight-finish",
  title: "Women Straight Finish",
  description: "Women Straight Finish (temporary ironing) service procedure training.",
  isActive: true,
  contentVersion: 1,
  completionGuidance:
    "Final look: the hair should look silky, smooth, and shiny — with no dryness, damage, or static. A properly settled, beautiful result.",
  completionGuidanceLocales: womenStraightFinishCompletionGuidanceLocales,
  steps: withLocales(
    withMedia([
      {
        stepNumber: 1,
        title: "Hair Wash & Protection",
        description:
          "First, wash the hair. When a client comes for hair ironing, check whether the hair is already washed. If it is not, shampoo properly, apply a hair mask, then apply a hair serum. After the serum, detangle the hair. Before ironing, use a heat protectant from any brand. Heat protectant keeps hair safe during ironing. Clients who frequently straighten or iron their hair should always use heat protectant.",
        importantPoints: [
          "Wash the hair first, or check that it is already washed.",
          "Shampoo, apply a hair mask, then apply hair serum.",
          "Detangle the hair after serum.",
          "Apply heat protectant before ironing.",
          "Always use heat protectant for frequent straightener or iron users.",
        ],
        videoUrl: PLACEHOLDER_VIDEO_URL,
        videoDurationSeconds: 0,
      },
      {
        stepNumber: 2,
        title: "4-Sectioning & Blow Dry",
        description:
          "Next, do a proper blow-dry. Dry the hair first, then create four basic sections — classic bob sections. From each section, take two sub-sections and perform a proper straight blow-dry. Blow-drying before ironing matters: ironing becomes easier, and the smooth, silky, shiny look the client wants comes from a correct straight blow-dry. Whether temporary styling, permanent smoothing, keratin, or rebonding, always do a proper straight blow-dry before ironing.",
        importantPoints: [
          "Dry the hair first, then create four classic bob sections.",
          "From each section, take two sub-sections and straight blow-dry.",
          "Blow-dry before ironing so ironing is easier.",
          "Smoothness, silky feel, and shine come from a proper straight blow-dry.",
          "Always blow-dry before temporary or permanent straight processes.",
        ],
        videoUrl: PLACEHOLDER_VIDEO_URL,
        videoDurationSeconds: 0,
      },
      {
        stepNumber: 3,
        title: "Ironing Technique & Grip",
        description:
          "Set the temperature to 210°C. Because the hair is already blow-dried, higher heat is not needed — strong results are possible at this lower temperature. Take sections less than an inch, around half an inch. Do not take thick sections. For temporary ironing, straightening, smoothing, keratin, or Botox ironing, thinner sections give better results. Comb through the section, build a grip, and pull the iron from root to mid-length. Pressure should come from the grip and iron plates — do not yank the hair. Hold the iron with the whole palm, not only fingers or the thumb. Without a firm grip, results will not be fully straight.",
        importantPoints: [
          "Set temperature to 210°C — higher heat is not needed after blow-dry.",
          "Take thin sections around half an inch (not a full 1-inch section).",
          "Comb through, build grip, and pull from root to mid-length.",
          "Apply pressure through the iron plates — do not yank the hair.",
          "Hold the iron with the whole palm, not just fingers or thumb.",
        ],
        videoUrl: PLACEHOLDER_VIDEO_URL,
        videoDurationSeconds: 0,
      },
      {
        stepNumber: 4,
        title: "Crown Box-Sectioning",
        description:
          "After basic ironing is complete, iron a box section at the top for extra bounce. Taking out a box section at the crown adds volume and gives strong results on the hair.",
        importantPoints: [
          "After basic ironing, iron a box section at the top.",
          "A crown box section adds extra bounce and volume.",
          "This technique delivers strong finishing results.",
        ],
        videoUrl: PLACEHOLDER_VIDEO_URL,
        videoDurationSeconds: 0,
      },
    ]),
  ),
};

function withMedia(steps: SopStep[]): SopStep[] {
  return steps.map((step) => {
    const media = womenStraightFinishMedia[step.stepNumber];
    if (!media) return step;
    return {
      ...step,
      videoUrl: media.videoUrl,
      audio: { ...media.audio },
    };
  });
}

function withLocales(steps: SopStep[]): SopStep[] {
  return steps.map((step) => ({
    ...step,
    locales: womenStraightFinishStepLocales[step.stepNumber],
  }));
}
