import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableError, retryOnce } from "./retryOnce";
import { httpError } from "../errors";

test("isRetryableError accepts timeouts, 5xx, and 429", () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(isRetryableError(abort), true);
  assert.equal(isRetryableError(new Error("Cloud TTS timed out.")), true);
  assert.equal(isRetryableError(new Error("fetch failed")), true);
  assert.equal(isRetryableError(httpError("Speech synthesis failed (502)", 502)), true);
  assert.equal(isRetryableError(new Error("Sarvam STT failed (429): rate")), true);
});

test("isRetryableError rejects 4xx and explicit retryable=false", () => {
  assert.equal(isRetryableError(httpError("text is required", 400)), false);
  assert.equal(isRetryableError(new Error("Sarvam STT failed (400): bad")), false);
  const disabled = new Error("Cloud STT unavailable (403)");
  (disabled as Error & { retryable: boolean }).retryable = false;
  assert.equal(isRetryableError(disabled), false);
});

test("retryOnce retries a transient failure once then succeeds", async () => {
  let attempts = 0;
  const result = await retryOnce(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("fetch failed");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("retryOnce does not retry a 4xx", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      retryOnce(async () => {
        attempts += 1;
        throw httpError("text is required", 400);
      }),
    /text is required/,
  );
  assert.equal(attempts, 1);
});
