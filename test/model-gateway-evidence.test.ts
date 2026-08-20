import { describe, expect, it } from "vitest";
import {
  canonicalFingerprint,
  canonicalJson,
  projectGatewayAttemptLineage,
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

  it("projects primary, fallback and refusal lineage without customer content", () => {
    const secret = "the customer asked for a confidential supplier list";
    const projected = projectGatewayAttemptLineage([
      {
        attempt: 2,
        routeKey: "fallback",
        routeVersion: 1,
        decision: "route_authorized",
        reasonClass: "fallback_authorized",
        holdStatus: "held",
        heldMicros: 90_000n,
        settledMicros: null,
        dispatchState: "not_dispatched",
        attemptStatus: "prepared",
        errorClass: null,
        providerRequestRef: "request:2",
      },
      {
        attempt: 1,
        routeKey: "primary",
        routeVersion: 1,
        decision: "route_authorized",
        reasonClass: "initial_route",
        holdStatus: "settled",
        heldMicros: 100_000n,
        settledMicros: 10_000n,
        dispatchState: "settled",
        attemptStatus: "failed",
        errorClass: "rate_limit",
        providerRequestRef: "request:1",
      },
      {
        attempt: 3,
        routeKey: null,
        routeVersion: null,
        decision: "refused",
        reasonClass: "open_breaker",
        holdStatus: "released",
        heldMicros: 0n,
        settledMicros: 0n,
        dispatchState: "not_dispatched",
        attemptStatus: "cancelled_before_dispatch",
        errorClass: null,
        providerRequestRef: null,
      },
    ]);
    expect(projected.map((entry) => [entry.attempt, entry.route, entry.exposureMicros])).toEqual([
      [1, "primary@1", 10_000n],
      [2, "fallback@1", 90_000n],
      [3, null, 0n],
    ]);
    expect(canonicalJson(projected)).not.toContain(secret);
  });
});
