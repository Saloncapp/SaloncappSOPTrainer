import assert from "node:assert/strict";
import test from "node:test";
import { chunkSpeechText, parsePcmSampleRate, pcmToWav } from "./trainerTts";

const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

test("returns a single chunk for short text", () => {
  assert.deepEqual(chunkSpeechText("Welcome back to HydraFacial training."), [
    "Welcome back to HydraFacial training.",
  ]);
});

test("returns nothing for blank text", () => {
  assert.deepEqual(chunkSpeechText(""), []);
  assert.deepEqual(chunkSpeechText("   \n  "), []);
});

test("collapses whitespace", () => {
  assert.deepEqual(chunkSpeechText("hello   there\n\nfriend"), ["hello there friend"]);
});

test("keeps every chunk under the byte limit for Tamil text", () => {
  const sentence = "வாடிக்கையாளர் வருத்தமாக இருக்கும்போது அவர்களின் மன உளைச்சலை ஒப்புக்கொள்ளுங்கள். ";
  const text = sentence.repeat(40);
  const chunks = chunkSpeechText(text, 2800);
  assert.ok(chunks.length > 1, "long Tamil text should be split");
  for (const chunk of chunks) {
    assert.ok(byteLength(chunk) <= 2800, `chunk of ${byteLength(chunk)} bytes exceeds limit`);
  }
});

test("splits a single oversized sentence without dropping words", () => {
  const words = Array.from({ length: 400 }, (_, i) => `word${i}`);
  const chunks = chunkSpeechText(words.join(" "), 300);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(byteLength(chunk) <= 300);
  }
  assert.deepEqual(chunks.join(" ").split(" "), words);
});

test("preserves all words across chunk boundaries", () => {
  const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} here.`).join(" ");
  const chunks = chunkSpeechText(text, 200);
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), text);
});

test("splits Devanagari text on the danda", () => {
  const text = `${"नमस्ते आपका स्वागत है। ".repeat(60)}`;
  const chunks = chunkSpeechText(text, 900);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(byteLength(chunk) <= 900);
  }
});

test("parsePcmSampleRate reads the rate and falls back to 24kHz", () => {
  assert.equal(parsePcmSampleRate("audio/L16;codec=pcm;rate=24000"), 24000);
  assert.equal(parsePcmSampleRate("audio/L16;codec=pcm;rate=16000"), 16000);
  assert.equal(parsePcmSampleRate("audio/L16;codec=pcm"), 24000);
  assert.equal(parsePcmSampleRate(""), 24000);
});

test("pcmToWav writes a valid 16-bit mono RIFF header", () => {
  const pcm = Buffer.alloc(960, 7);
  const wav = pcmToWav(pcm, 24000);

  assert.equal(wav.length, pcm.length + 44);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wav.subarray(12, 16).toString("ascii"), "fmt ");
  assert.equal(wav.subarray(36, 40).toString("ascii"), "data");

  assert.equal(wav.readUInt32LE(4), 36 + pcm.length, "RIFF chunk size");
  assert.equal(wav.readUInt16LE(20), 1, "PCM format");
  assert.equal(wav.readUInt16LE(22), 1, "mono");
  assert.equal(wav.readUInt32LE(24), 24000, "sample rate");
  assert.equal(wav.readUInt32LE(28), 48000, "byte rate");
  assert.equal(wav.readUInt16LE(32), 2, "block align");
  assert.equal(wav.readUInt16LE(34), 16, "bits per sample");
  assert.equal(wav.readUInt32LE(40), pcm.length, "data size");
  assert.deepEqual(wav.subarray(44), pcm, "payload preserved");
});
