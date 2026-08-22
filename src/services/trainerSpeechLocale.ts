import {
  speechMatchesResponseLanguage,
  type ResponseLanguage,
} from "./responseLanguage";

type LocalePair = { ta: string; hi: string };

function fill(template: LocalePair, lang: "ta" | "hi", vars: Record<string, string>): string {
  let out = template[lang];
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
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
    ta: "{title} பயிற்சிக்கு மீண்டும் வரவேற்கிறோம். நீங்கள் படி {done}, {doneTitle} முடித்துவிட்டீர்கள். படி {next}, {nextTitle} இல் தொடர விரும்புகிறீர்களா?",
    hi: "{title} प्रशिक्षण में वापस स्वागत है। आपने चरण {done}, {doneTitle} पूरा कर लिया है। क्या आप चरण {next}, {nextTitle} से जारी रखना चाहेंगे?",
  },
  {
    pattern: /^Welcome back to (.+) training\. You are on step (\d+), (.+)\. Shall we continue\?$/,
    ta: "{title} பயிற்சிக்கு மீண்டும் வரவேற்கிறோம். நீங்கள் படி {step}, {stepTitle} இல் இருக்கிறீர்கள். தொடரலாமா?",
    hi: "{title} प्रशिक्षण में वापस स्वागत है। आप चरण {step}, {stepTitle} पर हैं। क्या हम जारी रखें?",
  },
  {
    pattern: /^Welcome to (.+) training\. We can begin with step (\d+), (.+)\. Shall we start\?$/,
    ta: "{title} பயிற்சிக்கு வரவேற்கிறோம். படி {step}, {stepTitle} இல் தொடங்கலாம். தொடங்கலாமா?",
    hi: "{title} प्रशिक्षण में आपका स्वागत है। हम चरण {step}, {stepTitle} से शुरू कर सकते हैं। क्या हम शुरू करें?",
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
      title: match[1] || "",
      done: match[2] || "",
      doneTitle: match[3] || "",
      next: match[4] || "",
      nextTitle: match[5] || "",
      step: match[2] || "",
      stepTitle: match[3] || "",
    });
    if (speechMatchesResponseLanguage(localized, responseLanguage)) return localized;
  }
  return null;
}
