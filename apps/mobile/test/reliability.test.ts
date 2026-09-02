import { describe, expect, it } from "vitest";
import { mobileReliabilityCommandSchema, parseMobileReliabilityCockpit } from "../src/lib/reliability";

const workspaceId = "workspace-r31";

describe("R31 native reliability", () => {
  it("binds recovery to exact alert and item versions", () => {
    const command = { schemaVersion: 1, action: "PREPARE_RECOVERY", commandId: "00000000-0000-4000-8000-000000000131", workspaceId, alertId: "alert-1", expectedAlertVersion: 2, queueKind: "FOLLOW_UP_DUE", itemId: "follow-up-1", expectedItemVersion: 3, recoveryAction: "REQUEUE_LOCAL" };
    expect(mobileReliabilityCommandSchema.safeParse(command).success).toBe(true);
    expect(mobileReliabilityCommandSchema.safeParse({ ...command, expectedItemVersion: 0 }).success).toBe(false);
    expect(mobileReliabilityCommandSchema.safeParse({ ...command, automaticExecute: true }).success).toBe(false);
  });

  it("accepts only the minimized field projection", () => {
    const field = { schemaVersion: 1, generatedAt: "2026-09-02T12:00:00.000Z", workspace: { id: workspaceId, name: "R31" }, role: "FIELD_WORKER", interruptions: [], providerObserved: false, externalEffectCount: 0 };
    expect(parseMobileReliabilityCockpit(field).role).toBe("FIELD_WORKER");
    expect(() => parseMobileReliabilityCockpit({ ...field, metrics: [] })).toThrow();
    expect(() => parseMobileReliabilityCockpit({ ...field, nested: { amountMinor: 120_000 } })).toThrow();
  });

  it("refuses provider claims and external effects", () => {
    const owner = { schemaVersion: 1, generatedAt: "2026-09-02T12:00:00.000Z", workspace: { id: workspaceId, name: "R31" }, role: "OWNER", health: "HEALTHY", metrics: ["OPEN_ALERTS", "STALE_QUEUE_ITEMS", "RECOVERIES", "RESTORE_DRILLS", "LOAD_GATES"].map((key) => ({ key, numerator: 0, denominator: 0, windowStartedAt: "2026-09-01T12:00:00.000Z", windowEndedAt: "2026-09-02T12:00:00.000Z", evidenceLabel: "TEST" })), alerts: [], recoveries: [], traces: [], latestCheckpoint: null, latestRestoreDrill: null, latestGate: null, providerObserved: false, externalEffectCount: 0 };
    expect(parseMobileReliabilityCockpit(owner).role).toBe("OWNER");
    expect(() => parseMobileReliabilityCockpit({ ...owner, providerObserved: true })).toThrow();
    expect(() => parseMobileReliabilityCockpit({ ...owner, externalEffectCount: 1 })).toThrow();
  });
});
