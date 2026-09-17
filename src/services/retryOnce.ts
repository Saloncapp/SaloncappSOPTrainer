const RETRY_DELAY_MS = 200;

/**
 * Retry only transient failures: timeouts, network errors, 429, and 5xx.
 * Caller-marked `{ retryable: false }` always wins (API not enabled, 4xx).
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Error & { status?: number; retryable?: boolean };
  if (typeof err.retryable === "boolean") return err.retryable;
  if (err.name === "AbortError") return true;

  if (typeof err.status === "number") {
    return err.status >= 500 || err.status === 429;
  }

  const message = String(err.message || "").toLowerCase();
  if (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("aborted")
  ) {
    return true;
  }
  if (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    message.includes("network")
  ) {
    return true;
  }

  const codeMatch = String(err.message || "").match(/\((\d{3})\)/);
  if (codeMatch) {
    const code = Number(codeMatch[1]);
    return code >= 500 || code === 429;
  }
  return false;
}

export async function retryOnce<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (!isRetryableError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return task();
  }
}
