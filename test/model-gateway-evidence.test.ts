import { describe, expect, it } from "vitest";
import {
  canonicalFingerprint,
  protectedContentRef,
  redactProviderFailure,
} from "@/server/model-gateway/evidence";

describe("Model Gateway content-free evidence", () => {
  it("produces stable fingerprints without embedding content", () => {
    const secret = "client-secret-value";
    const fingerprint = canonicalFingerprint({ operation: "classification", content: secret });
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain(secret);
  });

  it("accepts protected references but rejects raw content-shaped keys", () => {
    const fingerprint = `sha256:${"a".repeat(64)}` as const;
    expect(protectedContentRef({ kind: "task", id: "task_123", fingerprint })).toEqual({
      kind: "task",
      id: "task_123",
      fingerprint,
    });
    expect(() =>
      protectedContentRef({ kind: "task", id: "task_123", fingerprint, rawPrompt: "secret" } as never)
    )
      .toThrow("PROTECTED_REFERENCE_CONTAINS_CONTENT");
  });

  it("maps provider failures to closed evidence without provider text", () => {
    const evidence = redactProviderFailure("rate_limit", 429);
    expect(evidence).toEqual({ errorClass: "rate_limit", httpStatus: 429 });
    expect(JSON.stringify(evidence)).not.toContain("message");
  });
});
