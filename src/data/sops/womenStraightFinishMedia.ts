import type { TrainingStepMedia } from "./trainingMedia";

/**
 * Per-step muted video + Tamil / English / Hindi narration for Women Straight Finish.
 * Never fall back to Hydrafacial or any other training's media.
 */
export const womenStraightFinishMedia: Record<number, TrainingStepMedia> = {
  1: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748183/Step_1_Hair_Wash_Protectio_english_vrgxvx.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787750236/Step_1_Hair_Wash_Protectio_Tamil_zm5ckp.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748457/Step_1_Hair_Wash_Protectio_english_xa7cjy.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748431/Step_1_Hair_Wash_Protection_Hindi_uovct8.mp3",
    },
  },
  2: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748184/Step_2_4-Sectioning_Blow_Dry_English_hfglsj.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787750245/Step_2_4_Sectioning_Blow_Dry_Tamil_mkrnka.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748458/Step_2_4_Sectioning_Blow_Dry_English_sa1mnt.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748431/Step_2_4_Sectioning_Blow_Dry_Hindi_khyfel.mp3",
    },
  },
  3: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748199/Step_3_Ironing_Technique_Grip_English_pzv4nt.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787750244/Step_3_Ironing_Technique_Grip_Tamil_qtffgo.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748460/Step_3_Ironing_Technique_Grip_English_sylr5u.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748432/Step_3_Ironing_Technique_Grip_hindi_qu8ftl.mp3",
    },
  },
  4: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748161/Step_4_Crown_Box-Sectioning__english_ekuxyc.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787750235/Step_4_Crown_Box_Sectioning_Tamil_vvg72n.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748456/Step_4_Crown_Box_Sectioning_english_tgepyf.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748431/Step_4_Crown_Box_Sectioning_hindi_jdnhlk.mp3",
    },
  },
};

/** Final Look & Results — completion guidance media (not a fifth training step). */
export const womenStraightFinishCompletionMedia: TrainingStepMedia = {
  videoUrl:
    "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748161/Final_Look_Results_english_xr8bub.mp4",
  audio: {
    ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787750235/Final_Look_Results_Tamil_ipzysw.mp3",
    en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748457/Final_Look_Results_english_erolsc.mp3",
    hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787748431/Final_Look_Results_hindi_zp9co7.mp3",
  },
};
