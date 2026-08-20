export type TrainingAudioLanguage = "ta" | "en" | "hi";

export type TrainingStepAudio = {
  ta: string;
  en: string;
  hi: string;
};

export type TrainingStepMedia = {
  videoUrl: string;
  audio: TrainingStepAudio;
};

/**
 * Per-step muted video + Tamil / English / Hindi narration (Cloudinary).
 */
export const trainingMedia: Record<number, TrainingStepMedia> = {
  1: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130895/Step_1_Skin_Analysis_gv8ft6.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131228/Step_1_Skin_Analysis_Tamil_rewust.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131705/Step_1_Skin_Analysis_English_myxuc6.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131668/Step_1_Skin_Analysis_Hindi_xltky1.mp3",
    },
  },
  2: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130914/Step_2_Cleanser_iquf8j.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131230/Step_2_Cleanser_Tamil_hai90r.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131707/Step_2_Cleanser_English_rydqxg.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131670/Step_2_Cleanser_Hindi_jxbgtb.mp3",
    },
  },
  3: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130881/Step_3_Gentle_Scrub_Exfoliation_oxnfes.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131230/Step_3_Gentle_Scrub_Exfoliation_Tamil_jmzag8.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131709/Step_3_Gentle_Scrub_Exfoliation_English_eln04l.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131669/Step_3_Gentle_Scrub_Exfoliation_Hindi_gxe3av.mp3",
    },
  },
  4: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130929/Step_4_Suction_Pen_tenysm.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131232/Step_4_Suction_Pen_Tamil_xm9ktq.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131712/Step_4_Suction_Pen_English_s1zspk.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131670/Step_4_Suction_Pen_Hindi_kirtmi.mp3",
    },
  },
  5: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130906/Step_5_Detan_SAP_Using_Jetspray_brsbbh.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131232/Step_5_Detan_SAP_Using_Jetspray_Tamil_ljjcpn.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131713/Step_5_Detan_SAP_Using_Jetspray_English_lfh0gc.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131671/Step_5_Detan_SAP_Using_Jetspray_Hindi_wxaksm.mp3",
    },
  },
  6: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130914/Step_6_Toning_Gel_Using_Ultrasound_l1t6zr.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131233/Step_6_Toning_Gel_Using_Ultrasound_Tamil_mbi4ln.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131716/Step_6_Toning_Gel_Using_Ultrasound_English_q1wnoy.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131675/Step_6_Toning_Gel_Using_Ultrasound_Hindi_sesrp2.mp3",
    },
  },
  7: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130895/Step_7_Massage_Cream_Using_RF_ztm3sn.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131236/Step_7_Massage_Cream_Using_RF_Tamil_klhci7.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131718/Step_7_Massage_Cream_Using_RF_English_cblqmt.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131676/Step_7_Massage_Cream_Using_RF_Hindi_xshtax.mp3",
    },
  },
  8: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130885/Step_8_Hydration_Glow_Mask_f8cdrm.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131237/Step_8_Hydration_Glow_Mask_Tamil_mf2v25.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131720/Step_8_Hydration_Glow_Mask_English_bvfbxt.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131678/Step_8_Hydration_Glow_Mask_Hindi_dbg2z7.mp3",
    },
  },
  9: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130886/Step_9_Cold_Compression_u6wj0m.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131239/Step_9_Cold_Compression_Tamil_qadut9.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131723/Step_9_Cold_Compression_English_i07vhw.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131681/Step_9_Cold_Compression_Hindi_cigxeb.mp3",
    },
  },
  10: {
    videoUrl:
      "https://res.cloudinary.com/saloncapp-production/video/upload/v1787130897/Step_10_SPF_exta9y.mp4",
    audio: {
      ta: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131240/Step_10_SPF_Tamil_ig1kut.mp3",
      en: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131725/Step_10_SPF_English_e2lqf1.mp3",
      hi: "https://res.cloudinary.com/saloncapp-production/video/upload/v1787131683/Step_10_SPF_Hindi_cydbrf.mp3",
    },
  },
};

export function resolveStepAudioUrl(
  audio: TrainingStepAudio | null | undefined,
  language: string | null | undefined,
): string {
  if (!audio) return "";
  const code = String(language || "en").trim().toLowerCase();
  if (code === "ta") return String(audio.ta || "").trim();
  if (code === "hi") return String(audio.hi || "").trim();
  return String(audio.en || "").trim();
}

export function isPlaceholderMediaUrl(url: string | null | undefined): boolean {
  const value = String(url || "").trim();
  return !value || value === "PLACEHOLDER_VIDEO_URL" || !/^https?:\/\//i.test(value);
}
