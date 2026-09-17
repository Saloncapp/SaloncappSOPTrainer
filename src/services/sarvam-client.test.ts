import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSarvamAudioMime } from "./sarvam-client";

test("normalizeSarvamAudioMime maps Expo m4a/aac types to audio/x-m4a", () => {
  assert.equal(normalizeSarvamAudioMime("audio/m4a"), "audio/x-m4a");
  assert.equal(normalizeSarvamAudioMime("audio/m4a; codecs=mp4a.40.2"), "audio/x-m4a");
  assert.equal(normalizeSarvamAudioMime("audio/aac"), "audio/x-m4a");
  assert.equal(normalizeSarvamAudioMime("audio/x-aac"), "audio/x-m4a");
  assert.equal(normalizeSarvamAudioMime("audio/mp4a-latm"), "audio/x-m4a");
});

test("normalizeSarvamAudioMime fills empty or generic MIME with audio/mp4", () => {
  assert.equal(normalizeSarvamAudioMime(undefined), "audio/mp4");
  assert.equal(normalizeSarvamAudioMime(""), "audio/mp4");
  assert.equal(normalizeSarvamAudioMime("application/octet-stream"), "audio/mp4");
});

test("normalizeSarvamAudioMime passes through allowed types", () => {
  assert.equal(normalizeSarvamAudioMime("audio/wav"), "audio/wav");
  assert.equal(normalizeSarvamAudioMime("audio/mpeg"), "audio/mpeg");
  assert.equal(normalizeSarvamAudioMime("audio/webm"), "audio/webm");
});
