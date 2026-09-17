import assert from "node:assert/strict";
import test from "node:test";
import { parseAiProvider, getSpeechStackSummary } from "./ai-provider";

test("parseAiProvider treats sarvam as the only non-google value", () => {
  assert.equal(parseAiProvider("sarvam"), "sarvam");
  assert.equal(parseAiProvider("SARVAM"), "sarvam");
  assert.equal(parseAiProvider(" sarvam "), "sarvam");
});

test("parseAiProvider defaults unset or unknown values to google", () => {
  assert.equal(parseAiProvider(undefined), "google");
  assert.equal(parseAiProvider(""), "google");
  assert.equal(parseAiProvider("google"), "google");
  assert.equal(parseAiProvider("Gemini"), "google");
  assert.equal(parseAiProvider("openai"), "google");
});

test("sarvam is the only provider that prefers server TTS", () => {
  assert.equal(parseAiProvider("sarvam") === "sarvam", true);
  assert.equal(parseAiProvider("google") === "sarvam", false);
});

test("getSpeechStackSummary names the active chat, STT, and TTS models", () => {
  const summary = getSpeechStackSummary();
  assert.match(summary, /provider=/);
  assert.match(summary, /chat=/);
  assert.match(summary, /stt=/);
  assert.match(summary, /tts=/);
});
