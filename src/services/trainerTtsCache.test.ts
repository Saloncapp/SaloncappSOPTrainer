import assert from "node:assert/strict";
import test from "node:test";
import { speechCacheKey } from "./trainerTtsCache";

test("speechCacheKey includes a model fingerprint and is stable", () => {
  const key = speechCacheKey("en", "Welcome to training.");
  assert.match(key, /^en-[a-f0-9]{8}-[a-f0-9]{40}$/);
  assert.equal(speechCacheKey("en", "Welcome to training."), key);
  assert.notEqual(speechCacheKey("ta", "Welcome to training."), key);
  assert.notEqual(speechCacheKey("en", "Shall we start?"), key);
});
