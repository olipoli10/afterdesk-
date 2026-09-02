import { describe, expect, it } from "vitest";
import {
  reliabilityCommandSchema,
  reliabilityCockpitSchema,
  reliabilitySignalInputSchema,
} from "@/lib/construction-operating-assistant-r31/contracts";
import {
  deriveReliabilityHealth,
  rejectFieldReliabilityLeaks,
  reliabilitySignalFingerprint,
} from "@/lib/construction-operating-assistant-r31/policy";
import { evaluateReliabilityGate, percentileNearestRank } from "@/lib/construction-operating-assistant-r31/gates";
import { assertDisposableLocalDatabaseLabel, compareRecoveryManifests } from "@/lib/construction-operating-assistant-r31/recovery";

const signal = {
  schemaVersion: 1 as const,
  workspaceId: "workspace-a",
  signalKey: "follow-up:stale:item-a:v1",
  kind: "QUEUE_STALE" as const,
  severity: "ERROR" as const,
  outcomeCode: "FOLLOW_UP_DUE_STALE" as const,
  traceId: "trace-a",
  spanId: "span-a",
  parentSpanId: null,
  sourceModule: "construction-r20",
  resourceType: "FOLLOW_UP",
  resourceId: "item-a",
  resourceVersion: 1,
  durationMs: 25,
  dimensions: {
    queueKind: "FOLLOW_UP_DUE" as const,
    replayClass: "LOCAL_REPLAY_SAFE" as const,
    itemVersion: 1,
  },
  observedAt: "2026-09-02T08:00:00.000Z",
};

describe("R31 observability and recovery contracts", () => {
  it("accepts one bounded safe signal and refuses arbitrary or sensitive dimensions", () => {
    expect(reliabilitySignalInputSchema.parse(signal)).toEqual(signal);
    expect(reliabilitySignalFingerprint(signal)).toMatch(/^[a-f0-9]{64}$/u);
    expect(reliabilitySignalInputSchema.safeParse({ ...signal, dimensions: { messageBody: "secret" } }).success).toBe(false);
    expect(reliabilitySignalInputSchema.safeParse({ ...signal, credentialRef: "secret" }).success).toBe(false);
    expect(reliabilitySignalInputSchema.safeParse({ ...signal, outcomeCode: "FREE_TEXT" }).success).toBe(false);
  });

  it("keeps commands closed, exact-versioned and fail-closed", () => {
    const command = {
      schemaVersion: 1 as const,
      action: "PREPARE_RECOVERY" as const,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-a",
      alertId: "alert-a",
      expectedAlertVersion: 1,
      queueKind: "FOLLOW_UP_DUE" as const,
      itemId: "item-a",
      expectedItemVersion: 1,
      recoveryAction: "REQUEUE_LOCAL" as const,
    };
    expect(reliabilityCommandSchema.safeParse(command).success).toBe(true);
    expect(reliabilityCommandSchema.safeParse({ ...command, queueKind: "ARBITRARY_TABLE" }).success).toBe(false);
    expect(reliabilityCommandSchema.safeParse({ ...command, expectedItemVersion: 0 }).success).toBe(false);
    expect(reliabilityCommandSchema.safeParse({ ...command, rawSql: "UPDATE" }).success).toBe(false);
  });

  it("derives honest health and never treats unknown as healthy", () => {
    expect(deriveReliabilityHealth({ critical: 0, error: 0, warning: 0, metricsAvailable: false })).toBe("UNKNOWN");
    expect(deriveReliabilityHealth({ critical: 0, error: 0, warning: 0, metricsAvailable: true })).toBe("HEALTHY");
    expect(deriveReliabilityHealth({ critical: 0, error: 0, warning: 2, metricsAvailable: true })).toBe("ATTENTION");
    expect(deriveReliabilityHealth({ critical: 0, error: 1, warning: 0, metricsAvailable: true })).toBe("BLOCKED");
  });

  it("uses an independent minimal field schema and recursively rejects hidden aggregates", () => {
    const field = {
      schemaVersion: 1 as const,
      generatedAt: "2026-09-02T08:00:00.000Z",
      workspace: { id: "workspace-a", name: "ENDVERA Construction" },
      role: "FIELD_WORKER" as const,
      interruptions: [],
      providerObserved: false as const,
      externalEffectCount: 0 as const,
    };
    expect(reliabilityCockpitSchema.parse(field)).toEqual(field);
    for (const leak of [
      { metrics: [] },
      { traceId: "trace-a" },
      { checkpointFingerprint: "a".repeat(64) },
      { credentialRef: "secret" },
      { amountMinor: 120_000 },
    ]) expect(() => rejectFieldReliabilityLeaks(leak)).toThrow("FIELD_RELIABILITY_LEAK_REFUSED");
  });

  it("computes bounded gate denominators and fails missed correctness or latency", () => {
    expect(percentileNearestRank([1, 5, 2, 3, 4], 95)).toBe(5);
    expect(evaluateReliabilityGate({ operationCount: 500, concurrency: 20, canonicalEffectCount: 500, duplicateCount: 50, durationMs: 1_000, latenciesMs: Array.from({ length: 500 }, (_, i) => (i % 20) + 1), thresholdMs: 30 }).status).toBe("PASSED");
    expect(evaluateReliabilityGate({ operationCount: 500, concurrency: 20, canonicalEffectCount: 499, duplicateCount: 50, durationMs: 1_000, latenciesMs: Array.from({ length: 500 }, () => 40), thresholdMs: 30 }).status).toBe("FAILED");
  });

  it("guards disposable databases and compares minimized manifests exactly", () => {
    expect(assertDisposableLocalDatabaseLabel("endvera-r31-source")).toBe("endvera-r31-source");
    expect(() => assertDisposableLocalDatabaseLabel("nightlexicon-production")).toThrow("RECOVERY_DATABASE_NOT_DISPOSABLE");
    const manifest = { schemaIdentity: "56:migration", tableCounts: { ConstructionProject: 1 }, highWaterMarks: { ConstructionProject: "project-a" }, totalRows: 1 };
    expect(compareRecoveryManifests(manifest, manifest)).toEqual({ schemaMatch: true, countsMatch: true, fingerprintMatch: true, reasonCodes: [] });
    expect(compareRecoveryManifests(manifest, { ...manifest, totalRows: 2 }).reasonCodes).toContain("RECOVERY_TOTAL_ROWS_MISMATCH");
  });
});
