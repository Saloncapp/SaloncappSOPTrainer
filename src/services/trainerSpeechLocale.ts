import {
  ensureTargetScriptLead,
  speechMatchesResponseLanguage,
  type ResponseLanguage,
} from "./responseLanguage";

type LocalePair = { ta: string; hi: string };

const SPOKEN_LABELS: Array<{ en: string; ta: string; hi: string }> = [
  { en: "Gentle Scrub / Exfoliation", ta: "மென்மையான ஸ்க்ரப் மற்றும் எக்ஸ்ஃபோலியேஷன்", hi: "हल्का स्क्रब और एक्सफोलिएशन" },
  { en: "Hydration & Glow Mask", ta: "ஈரப்பதம் மற்றும் க்ளோ மாஸ்க்", hi: "हाइड्रेशन और ग्लो मास्क" },
  { en: "Cleanser (Using hands)", ta: "கைகளால் சுத்தம் செய்தல்", hi: "हाथों से क्लींजिंग" },
  { en: "Cold Compression", ta: "குளிர் அழுத்தம்", hi: "कोल्ड कंप्रेशन" },
  { en: "Skin Analysis", ta: "தோல் பகுப்பாய்வு", hi: "त्वचा विश्लेषण" },
  { en: "Massage Cream", ta: "மசாஜ் கிரீம்", hi: "मसाज क्रीम" },
  { en: "Suction Pen", ta: "சக்ஷன் பேன்", hi: "सक्शन पेन" },
  { en: "Toning Gel", ta: "டோனிங் ஜெல்", hi: "टोनिंग जेल" },
  { en: "Detan SAP", ta: "டிடான் எஸ் ஏ பி", hi: "डिटैन एसएपी" },
  { en: "HydraFacial", ta: "ஹைட்ராஃபேஷியல்", hi: "हाइड्राफेशियल" },
  { en: "Hydra Facial", ta: "ஹைட்ராஃபேஷியல்", hi: "हाइड्राफेशियल" },
  { en: "SPF", ta: "எஸ் பி எஃப்", hi: "एसपीएफ" },
];

function spokenLabel(english: string, lang: "ta" | "hi"): string {
  const key = String(english || "").trim();
  const found = SPOKEN_LABELS.find((item) => item.en.toLowerCase() === key.toLowerCase());
  return found ? found[lang] : key;
}

function fill(template: LocalePair, lang: "ta" | "hi", vars: Record<string, string>): string {
  let out = template[lang];
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

/** Replace known English training/step names so TTS does not stay in English. */
export function applySpokenLabels(text: string, responseLanguage: ResponseLanguage): string {
  if (responseLanguage === "en") return text;
  let out = String(text || "");
  const sorted = [...SPOKEN_LABELS].sort((a, b) => b.en.length - a.en.length);
  for (const item of sorted) {
    out = out.replaceAll(item.en, item[responseLanguage]);
  }
  return out;
}

const TEMPLATES: Array<{
  pattern: RegExp;
  ta: string;
  hi: string;
}> = [
  {
    pattern:
      /^Welcome back to (.+) training\. You completed step (\d+), (.+)\. Would you like to resume with step (\d+), (.+)\?$/,
    ta: "மீண்டும் வரவேற்கிறோம். {title} பயிற்சி. நீங்கள் படி {done}, {doneTitle} முடித்துவிட்டீர்கள். படி {next}, {nextTitle} இல் தொடர விரும்புகிறீர்களா?",
    hi: "वापस स्वागत है। {title} प्रशिक्षण। आपने चरण {done}, {doneTitle} पूरा कर लिया है। क्या आप चरण {next}, {nextTitle} से जारी रखना चाहेंगे?",
  },
  {
    pattern: /^Welcome back to (.+) training\. You are on step (\d+), (.+)\. Shall we continue\?$/,
    ta: "மீண்டும் வரவேற்கிறோம். {title} பயிற்சி. நீங்கள் படி {step}, {stepTitle} இல் இருக்கிறீர்கள். தொடரலாமா?",
    hi: "वापस स्वागत है। {title} प्रशिक्षण। आप चरण {step}, {stepTitle} पर हैं। क्या हम जारी रखें?",
  },
  {
    pattern: /^Welcome to (.+) training\. We can begin with step (\d+), (.+)\. Shall we start\?$/,
    ta: "வரவேற்கிறோம். {title} பயிற்சி. படி {step}, {stepTitle} இல் தொடங்கலாம். தொடங்கலாமா?",
    hi: "स्वागत है। {title} प्रशिक्षण। हम चरण {step}, {stepTitle} से शुरू कर सकते हैं। क्या हम शुरू करें?",
  },
  {
    pattern:
      /^Welcome back\. You completed all the training steps earlier\. You were ready for the assessment\. Would you like to start it now\?$/,
    ta: "மீண்டும் வரவேற்கிறோம். நீங்கள் முன்பு அனைத்து பயிற்சி படிகளையும் முடித்திருந்தீர்கள். மதிப்பீட்டைத் தொடங்க தயாராக இருந்தீர்கள். இப்போது தொடங்கலாமா?",
    hi: "वापस स्वागत है। आपने पहले सभी प्रशिक्षण चरण पूरे कर लिए थे। आप आकलन के लिए तैयार थे। क्या आप अभी शुरू करना चाहेंगे?",
  },
  {
    pattern:
      /^This (.+) training is already complete\. You can rewatch any step or ask a question\. The assessment cannot be taken again\.$/,
    ta: "இந்த {title} பயிற்சி ஏற்கனவே முடிந்துவிட்டது. நீங்கள் எந்தப் படியையும் மீண்டும் பார்க்கலாம் அல்லது சந்தேகம் கேட்கலாம். மதிப்பீட்டை மீண்டும் எடுக்க முடியாது.",
    hi: "यह {title} प्रशिक्षण पहले ही पूरा हो चुका है। आप कोई भी चरण दोबारा देख सकते हैं या सवाल पूछ सकते हैं। आकलन दोबारा नहीं लिया जा सकता।",
  },
];

export function localizeKnownTrainerSpeech(
  text: string,
  responseLanguage: ResponseLanguage,
): string | null {
  if (responseLanguage === "en") return text;
  const source = String(text || "").trim();
  if (!source) return null;

  for (const item of TEMPLATES) {
    const match = source.match(item.pattern);
    if (!match) continue;
    const localized = fill(item, responseLanguage, {
      title: spokenLabel(match[1] || "", responseLanguage),
      done: match[2] || "",
      doneTitle: spokenLabel(match[3] || "", responseLanguage),
      next: match[4] || "",
      nextTitle: spokenLabel(match[5] || "", responseLanguage),
      step: match[2] || "",
      stepTitle: spokenLabel(match[3] || "", responseLanguage),
    });
    const spoken = ensureTargetScriptLead(
      applySpokenLabels(localized, responseLanguage),
      responseLanguage,
    );
    if (speechMatchesResponseLanguage(spoken, responseLanguage)) return spoken;
  }
  return null;
}
