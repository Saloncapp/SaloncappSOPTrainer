import { hydrafacialStepLocales } from "./hydrafacialLocales";
import { trainingMedia } from "./trainingMedia";
import type { SopDefinition, SopStep } from "./types";

// Collection: https://collection.cloudinary.com/dtls8sxsx/e0416a0d581c5d6934542f6b28cb161b
const HYDRAFACIAL_VIDEO_URL =
  "https://res.cloudinary.com/dtls8sxsx/video/upload/q_auto/v1787028985/vidssave.com_Hydra_facial_Treatment_Step_by_Step___HydraFacial_Full_Procedure___Real_Patient_Results___SkinZest_480P_uzspad.mp4";
const HYDRAFACIAL_VIDEO_DURATION_SECONDS = 318;

/**
 * Source of truth: Hydra Facial Steps.pdf (SEASOUL TRAINING)
 * Title in document: FreshFace – Hydra Facial Complete Service Procedure.
 * Do not invent procedures; bump contentVersion when this file changes.
 */
export const hydrafacial: SopDefinition = {
  slug: "hydrafacial",
  title: "HydraFacial",
  description: "FreshFace-Hydra Facial Training",
  isActive: true,
  contentVersion: 12,
  steps: withLocales(withMedia([
    {
      stepNumber: 1,
      title: "Skin Analysis",
      description:
        "When a client comes in for a Hydra Facial, the first and most crucial step is to properly analyze their skin. Look for concerns such as open pores, pigmentation, dryness, oiliness, acne, or sensitivity. This analysis decides which solutions, nozzles, and intensities to use later. A Hydra Facial is a medicated facial, so hygiene and precautions are essential before any product or machine is used.",
      importantPoints: [
        "Analyze skin type and concerns before starting (open pores, pigmentation, dry, oily, acne, sensitive).",
        "Hydra Facial is a medicated treatment — precautions are mandatory.",
        "Wear clean gloves.",
        "Use new disposable tissue wipes or sponges for every client (single-use only).",
        "A complete Hydra Facial usually takes about 1.5 to 2 hours.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 2,
      title: "Cleanser (Using hands)",
      description:
        "Perform cleansing with your hands, not a machine. Give a gentle hand massage to thoroughly cleanse the face for about two minutes. When a client arrives, the face carries dirt, dust, and sometimes light makeup, so remove all of that first. Use a little water if needed. This prepares the skin for peeling, scrubbing, and machine work.",
      importantPoints: [
        "Use hands only for this cleanse.",
        "Gentle hand massage for about 2 minutes.",
        "Remove dirt, dust, and light makeup.",
        "Use a little water if needed.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 3,
      title: "Gentle Scrub / Exfoliation",
      description:
        "Exfoliate using hands first, then the skin scrubber. If using peeling gel, apply it evenly with a brush, strictly avoiding the under-eye area and the lips. Leave the peeling gel on for 5 minutes, then wipe it off clean with a cloth. Never use any machine tool or probe over the peel. Next, take a small amount of scrub and apply it with gentle fingertip movements for 3 to 4 minutes. Then use the Skin Scrubber for deep cleansing: it has an on/off switch and adjustable intensity. Set intensity to level 6 or 7 — do not increase to 8, 9, or 10, because high intensity can irritate sensitive skin. Work the scrubber gently across the face and neck, wiping the tool head with cotton as needed. To hydrate dry skin and add glow, spray Hyaluronic Acid serum onto the face before machine suction.",
      importantPoints: [
        "Hands first, then scrubber.",
        "Peeling gel: apply with a brush, avoid under-eye and lips, leave 5 minutes, wipe off — never use a machine over the peel.",
        "Hand scrub: 3 to 4 minutes with soft fingertips.",
        "Skin scrubber intensity: 6 or 7 only (not 8, 9, or 10).",
        "Acne / sensitive / oily: 3–4. Normal to dry: 5–6. Dehydrated: 6–7.",
        "Run the scrubber on the neck as well and wipe the probe head with cotton.",
        "Spray Hyaluronic Acid serum to hydrate dry skin before abrasion.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 4,
      title: "Suction Pen",
      description:
        "The abrasion / suction pen is the main Hydra Facial machine tool. It uses vacuum suction for deep cleansing and extracts dead skin, dirt, blackheads, and whiteheads. Choose the solution and nozzle tip for the client's skin type. Perform the treatment with gentle movements. Use your second hand to stretch the skin taut, then glide the probe over it — the motion should feel soft and smooth, not harsh. Pair different nozzle tips depending on acne, wrinkles, fine lines, or hyperpigmentation.",
      importantPoints: [
        "AS1: Normal to dry skin.",
        "SA2: Oily, acne, sensitive, and open pores.",
        "AO3: Matured and dehydrated skin.",
        "Mixing ratio: 1:10.",
        "Stretch the skin taut with the other hand before gliding the probe.",
        "Vacuum suction extracts dead skin, dirt, blackheads, and whiteheads.",
        "Select the serum bottle to match the skin concern (for example Bottle C for dry skin with pigmentation).",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 5,
      title: "Detan SAP",
      description:
        "Use the jet spray / spray probe. Fill about 20% of the bottle with the facial toner from the kit or a chosen serum. Hold the spray pen at an angle and mist it evenly across the face. After pores have opened during cleansing, spraying toner helps close them and lets active ingredients work more deeply into the skin.",
      importantPoints: [
        "Using jet spray.",
        "Fill 20% of the bottle.",
        "Hold the spray pen at an angle and mist evenly.",
        "Helps close open pores and drive actives deeper.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 6,
      title: "Toning Gel",
      description:
        "Apply cooling / toning gel evenly to soothe skin after deep cleansing and scrubbing. Then use the ultrasound flat probe over the gel for the entire face. Use a small probe for the eye area if the machine has one. Always operate the ultrasound probe over a layer of gel or serum — never on dry skin. The probe emits high-frequency sound waves that help serums absorb, generate mild heat, stimulate collagen, tighten skin, increase circulation, and even out pigmented areas. Provide ultrasound massage for at least 10 minutes; the probe turns off automatically when the timer ends.",
      importantPoints: [
        "Spread cooling / toning gel first to soothe stressed skin.",
        "Ultrasound flat probe on the full face; small probe for the eye area if available.",
        "Always use the probe over gel or serum.",
        "Acne / sensitive / oily: 3–4. Normal to dry: 5–6. Dehydrated: 6–7.",
        "Intensity 7 with a 10-minute timer (massage for at least 10 minutes).",
        "Helps absorption, collagen, tightening, circulation, and even skin tone.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 7,
      title: "Massage Cream",
      description:
        "Apply massage cream and massage with your hands only. Do not use any Hydra machine probe over the massage cream. After the cream is absorbed, use RF (radio frequency) on the face for 5 to 7 minutes. Use magic balls if available. Use RF mainly for visible wrinkles or hyperpigmentation. For forehead wrinkles, massage with upward lifting motions. Never use the RF probe directly over or under the eye area, because it uses radio frequency energy. RF reduces signs of aging, lifts sagging skin, minimizes fine lines, and delivers energy to deeper tissues.",
      importantPoints: [
        "Hand massage only over massage cream — no machine probe on the cream.",
        "RF for 5–7 minutes on the face.",
        "Use magic balls if available.",
        "Never use RF over or under the eyes.",
        "Forehead wrinkles: upward lifting motions.",
        "Use RF especially for wrinkles or hyperpigmentation.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 8,
      title: "Hydration & Glow Mask",
      description:
        "This is the face pack / hydration step. Apply the pack evenly, then place a sheet mask over it (for example a rice water sheet mask for dryness and pigmentation). Then apply the LED mask. On the machine, select Mask, set intensity to 7, choose Cycle mode, and set the timer for 10 minutes. The mask cycles through light wavelengths; each colour targets a specific concern. After 10 minutes, remove the LED mask and gently wipe off the face pack. Total mask time is 10 to 12 minutes.",
      importantPoints: [
        "Use for 10–12 minutes.",
        "Apply pack evenly, then a sheet mask over it.",
        "LED mask: Mask option, intensity 7, Cycle mode, 10 minutes.",
        "Red: Anti-aging, skin tightening, and depigmentation.",
        "Blue: Anti-fungal.",
        "Green: Skin pH balance, soothing, and calming.",
        "Yellow: Anti-inflammation.",
        "Purple: Rejuvenation, revitalizing, and nourishing.",
        "Light Blue: Sensitive and calming.",
        "White: Cell production and cell growth.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 9,
      title: "Cold Compression",
      description:
        "Right after the LED mask, do cold compression with the Cold Hammer. This locks in the sheet-mask benefits without diluting them. Turn the Cold Hammer to its lowest cooling temperature. Place the cold surface gently on the skin with light press-and-hold motions across the face and neck. Focus on open pores or any areas that feel warm. The cold shrinks blood vessels, reduces redness, and seals pores to trap hydration. Do this for 2 minutes (up to 2 to 3 minutes) so the skin feels calm, firm, and refreshed.",
      importantPoints: [
        "Duration: 2 minutes (up to 2–3 minutes).",
        "Use the Cold Hammer on the lowest cooling temperature.",
        "Light press-and-hold on face and neck; focus on open pores or warm areas.",
        "Shrinks blood vessels, reduces redness, and seals pores.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
    {
      stepNumber: 10,
      title: "SPF",
      description:
        "Finish the service by applying the brightening serum from the kit. Massage it gently into the skin for 2 minutes to lock in the treatment. Then apply SPF / sunscreen as the final protective step. The result should be fresh, hydrated, and refreshed skin.",
      importantPoints: [
        "Apply brightening serum and massage for 2 minutes.",
        "Finish with SPF / sunscreen.",
        "This is the last step of the Hydra Facial.",
      ],
      videoUrl: HYDRAFACIAL_VIDEO_URL,
      videoDurationSeconds: HYDRAFACIAL_VIDEO_DURATION_SECONDS,
    },
  ])),
};

function withMedia(steps: SopStep[]): SopStep[] {
  return steps.map((step) => {
    const media = trainingMedia[step.stepNumber];
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
    locales: hydrafacialStepLocales[step.stepNumber],
  }));
}
