import { describe, expect, it } from "vitest";
import {
  classifyProviderError,
  PROVIDER_ERROR_CLASSES,
  safeErrorMessage,
} from "@/lib/ai-work-engine/provider-error";

class HttpError extends Error {
  status: number;
  headers?: Record<string, string>;
  constructor(status: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

describe("the taxonomy is the seven the mandate names", () => {
  it("no more, no fewer", () => {
    expect([...PROVIDER_ERROR_CLASSES].sort()).toEqual(
      ["auth", "bad_request", "provider_5xx", "quota", "rate_limit", "timeout", "unknown"].sort()
    );
  });
});

describe("permanent failures are never replayed as transient ones", () => {
  /**
   * The defect this fixes: one catch treated a 401 exactly like a 429, so an
   * expired key burned three attempts and nine minutes of backoff before the
   * run paused. Three identical failures teach nothing.
   */
  it("401 is auth: not retryable, pauses the run at once", () => {
    const c = classifyProviderError(new HttpError(401, "invalid x-api-key"));
    expect(c.errorClass).toBe("auth");
    expect(c.retryable).toBe(false);
    expect(c.pauseRunImmediately).toBe(true);
  });

  it("403 is auth too", () => {
    expect(classifyProviderError(new HttpError(403, "forbidden")).errorClass).toBe("auth");
  });

  it("400 is bad_request: a replay sends the identical payload", () => {
    const c = classifyProviderError(new HttpError(400, "invalid schema"));
    expect(c.errorClass).toBe("bad_request");
    expect(c.retryable).toBe(false);
    expect(c.pauseRunImmediately).toBe(true);
  });

  it("402 is quota and stops the run", () => {
    const c = classifyProviderError(new HttpError(402, "payment required"));
    expect(c.errorClass).toBe("quota");
    expect(c.retryable).toBe(false);
  });
});

describe("transient failures retry, and honour the provider's own hint", () => {
  it("429 without a billing word is rate_limit and IS retryable", () => {
    const c = classifyProviderError(new HttpError(429, "too many requests"));
    expect(c.errorClass).toBe("rate_limit");
    expect(c.retryable).toBe(true);
    expect(c.pauseRunImmediately).toBe(false);
  });

  it("429 that mentions credit is quota, and quota does not retry inside the run", () => {
    const c = classifyProviderError(new HttpError(429, "insufficient credit balance"));
    expect(c.errorClass).toBe("quota");
    expect(c.retryable).toBe(false);
    expect(c.pauseRunImmediately).toBe(true);
  });

  it("reads Retry-After in seconds", () => {
    const c = classifyProviderError(
      new HttpError(429, "slow down", { "retry-after": "30" })
    );
    expect(c.retryAfterSeconds).toBe(30);
  });

  it("clamps an absurd Retry-After rather than trusting it", () => {
    const c = classifyProviderError(
      new HttpError(429, "slow down", { "retry-after": "999999" })
    );
    expect(c.retryAfterSeconds).toBe(3600);
  });

  it("500 and 503 are provider_5xx and retry", () => {
    expect(classifyProviderError(new HttpError(500, "boom")).retryable).toBe(true);
    expect(classifyProviderError(new HttpError(503, "unavailable")).errorClass).toBe("provider_5xx");
  });
});

describe("aborts and timeouts", () => {
  it("an AbortError classifies as timeout and stays retryable", () => {
    const e = new Error("The operation was aborted");
    e.name = "AbortError";
    const c = classifyProviderError(e);
    expect(c.errorClass).toBe("timeout");
    expect(c.retryable).toBe(true);
  });

  it("a message-shaped timeout classifies too", () => {
    expect(classifyProviderError(new Error("request timed out")).errorClass).toBe("timeout");
  });
});

describe("an unrecognised failure retries", () => {
  it("because stranding a paid mandate is worse than one wasted attempt", () => {
    const c = classifyProviderError(new Error("something odd"));
    expect(c.errorClass).toBe("unknown");
    expect(c.retryable).toBe(true);
    expect(c.pauseRunImmediately).toBe(false);
  });
});

describe("the message that reaches the admin console is redacted and bounded", () => {
  it("strips anything shaped like a key", () => {
    const msg = safeErrorMessage(
      new Error("bad key sk-ant-api03-AAAABBBBCCCCDDDD and Bearer abcdefghijklmnop")
    );
    expect(msg).not.toContain("sk-ant-api03-AAAABBBBCCCCDDDD");
    expect(msg).toContain("[redacted-key]");
    expect(msg).toContain("Bearer [redacted]");
  });

  it("bounds the echo, because a provider can quote our request back at us", () => {
    // The request carries the client's brief, and lastError is re-displayed
    // in the admin console.
    const msg = safeErrorMessage(new Error("x".repeat(5000)));
    expect(msg.length).toBeLessThanOrEqual(300);
  });
});
