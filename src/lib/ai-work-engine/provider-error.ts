/**
 * PROVIDER FAILURES, CLASSIFIED. Pure, no SDK import, no server-only.
 *
 * Before this file, one catch in workflow-runs.ts treated a permanent 401, a
 * transient 429 and a network timeout identically: same attempt budget, same
 * 1/4/9 minute backoff. Replaying an expired API key three times is not
 * resilience, it is three identical failures and a run that pauses nine
 * minutes later than it should have.
 *
 * The classification is deliberately conservative in one direction only: an
 * error it cannot recognise is `unknown` and IS retried. A wrong `retryable`
 * on a permanent error wastes money; a wrong non-retryable on a transient one
 * strands a paid mandate. The first is the cheaper mistake, so unknown retries.
 */

export const PROVIDER_ERROR_CLASSES = [
  /** Credentials rejected or missing. Never transient. */
  "auth",
  /** Plan or credit exhausted. Retrying inside the same run cannot fix it. */
  "quota",
  /** Too many requests right now. The only class that honours Retry-After. */
  "rate_limit",
  /** No response inside our deadline. Says nothing about whether it was billed. */
  "timeout",
  /** We sent something the provider refuses. A replay sends the same thing. */
  "bad_request",
  /** The provider broke. Worth retrying. */
  "provider_5xx",
  /** Unrecognised. Retried, because stranding a paid mandate is worse. */
  "unknown",
] as const;

export type ProviderErrorClass = (typeof PROVIDER_ERROR_CLASSES)[number];

export type ClassifiedProviderError = {
  errorClass: ProviderErrorClass;
  httpStatus: number | null;
  /** May a further attempt of the SAME operation help? */
  retryable: boolean;
  /**
   * Seconds the provider asked us to wait, when it said so. Null means "use
   * the deterministic backoff". Never invented from a guess.
   */
  retryAfterSeconds: number | null;
  /**
   * True when the run must stop NOW rather than burn its remaining attempts.
   * Permanent classes set this: three identical failures teach nothing and
   * delay the human fallback that was always going to be the answer.
   */
  pauseRunImmediately: boolean;
  /** Short, provider-supplied, already redacted. For the admin console. */
  message: string;
};

/** Header and property names providers use for the retry hint. */
function readRetryAfter(error: unknown): number | null {
  const headers = (error as { headers?: unknown })?.headers;
  let raw: unknown = null;
  if (headers instanceof Headers) raw = headers.get("retry-after");
  else if (headers && typeof headers === "object") {
    const h = headers as Record<string, unknown>;
    raw = h["retry-after"] ?? h["Retry-After"] ?? null;
  }
  if (raw === null || raw === undefined) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3600, Math.ceil(seconds));
  // Providers may send an HTTP-date. Parse it rather than dropping the hint.
  const at = Date.parse(String(raw));
  if (Number.isNaN(at)) return null;
  return null; // A date needs `now` to become a delay; the caller owns the clock.
}

function statusOf(error: unknown): number | null {
  const s = (error as { status?: unknown })?.status;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  const code = (error as { statusCode?: unknown })?.statusCode;
  if (typeof code === "number" && Number.isFinite(code)) return code;
  return null;
}

/**
 * Redacted message. Provider errors can echo the request back, and the request
 * carries the client's brief; `AiOperation.lastError` is re-displayed in the
 * admin console, so an unbounded echo is a quiet way to move client text into
 * a surface that was never reviewed for it. Bounded and stripped of anything
 * shaped like a key.
 */
export function safeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "provider error";
  return raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function classifyProviderError(error: unknown): ClassifiedProviderError {
  const httpStatus = statusOf(error);
  const message = safeErrorMessage(error);
  const retryAfterSeconds = readRetryAfter(error);

  const name = (error as { name?: unknown })?.name;
  const isAbort =
    name === "AbortError" ||
    name === "APIUserAbortError" ||
    /aborted|abort signal/i.test(message);
  const isTimeout =
    name === "APIConnectionTimeoutError" || /timed? ?out|exceeded \d+ms|ETIMEDOUT/i.test(message);

  if (isTimeout || isAbort) {
    return {
      errorClass: "timeout",
      httpStatus,
      // A timeout may or may not have been billed; a further attempt is still
      // reasonable, and the SPEND question is answered separately by the
      // dispatch state, not by this flag.
      retryable: true,
      retryAfterSeconds,
      pauseRunImmediately: false,
      message,
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      errorClass: "auth",
      httpStatus,
      retryable: false,
      retryAfterSeconds: null,
      pauseRunImmediately: true,
      message,
    };
  }
  if (httpStatus === 429) {
    return {
      errorClass: /quota|credit|billing|insufficient/i.test(message) ? "quota" : "rate_limit",
      httpStatus,
      // Quota is not fixable inside this run; rate limit is.
      retryable: !/quota|credit|billing|insufficient/i.test(message),
      retryAfterSeconds,
      pauseRunImmediately: /quota|credit|billing|insufficient/i.test(message),
      message,
    };
  }
  if (httpStatus === 402) {
    return {
      errorClass: "quota",
      httpStatus,
      retryable: false,
      retryAfterSeconds: null,
      pauseRunImmediately: true,
      message,
    };
  }
  if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
    return {
      errorClass: "bad_request",
      httpStatus,
      // A replay sends the identical payload and gets the identical refusal.
      retryable: false,
      retryAfterSeconds: null,
      pauseRunImmediately: true,
      message,
    };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return {
      errorClass: "provider_5xx",
      httpStatus,
      retryable: true,
      retryAfterSeconds,
      pauseRunImmediately: false,
      message,
    };
  }

  return {
    errorClass: "unknown",
    httpStatus,
    retryable: true,
    retryAfterSeconds,
    pauseRunImmediately: false,
    message,
  };
}
