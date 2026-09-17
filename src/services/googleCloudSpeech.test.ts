import assert from "node:assert/strict";
import test from "node:test";
import { encodingForMime } from "./googleCloudSpeech";

test("encodingForMime maps known containers and leaves m4a unspecified", () => {
  assert.equal(encodingForMime("audio/mpeg"), "MP3");
  assert.equal(encodingForMime("audio/mp3"), "MP3");
  assert.equal(encodingForMime("audio/flac"), "FLAC");
  assert.equal(encodingForMime("audio/ogg"), "OGG_OPUS");
  assert.equal(encodingForMime("audio/webm"), "WEBM_OPUS");
  assert.equal(encodingForMime("audio/wav"), "LINEAR16");
  assert.equal(encodingForMime("audio/amr-wb"), "AMR_WB");
  assert.equal(encodingForMime("audio/amr"), "AMR");
  assert.equal(encodingForMime("audio/m4a"), undefined);
  assert.equal(encodingForMime("audio/mp4"), undefined);
  assert.equal(encodingForMime("audio/aac"), undefined);
  assert.equal(encodingForMime(undefined), undefined);
});
