import { describe, expect, it } from "vitest";
import {
  economicCommandSchema,
  fieldEconomicCockpitSchema,
} from "@/lib/construction-operating-assistant-r21/contracts";
import {
  assertPaymentPromiseResolution,
  nextCollectionDecision,
} from "@/lib/construction-operating-assistant-r21/policy";

describe("Construction Operating Assistant R21 economic contracts", () => {
  it("accepts a strict ready-invoice command and rejects reversed dates", () => {
    const command = {
      schemaVersion: 1 as const,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace",
      action: "ISSUE_READY_INVOICE" as const,
      openLoopId: "loop",
      expectedLoopVersion: 3,
      contactId: "contact",
      invoiceReference: "INV-101",
      issuedAt: "2026-09-02T14:00:00.000Z",
      dueAt: "2026-10-02T14:00:00.000Z",
    };
    expect(economicCommandSchema.parse(command).action).toBe("ISSUE_READY_INVOICE");
    expect(() => economicCommandSchema.parse({
      ...command,
      dueAt: "2026-08-02T14:00:00.000Z",
    })).toThrow("The due date cannot precede the issue date");
  });

  it("keeps promises separate from balance evidence", () => {
    expect(() => assertPaymentPromiseResolution({
      outcome: "KEPT",
      occurredAt: "2026-09-05T14:00:00.000Z",
      promisedFor: "2026-09-05T14:00:00.000Z",
      promisedAmountMinor: 30_000,
      receivedSincePromiseMinor: 0,
      outstandingAmountMinor: 120_000,
    })).toThrow("PAYMENT_PROMISE_NOT_PROVEN_KEPT");
    expect(() => assertPaymentPromiseResolution({
      outcome: "KEPT",
      occurredAt: "2026-09-05T14:00:00.000Z",
      promisedFor: "2026-09-05T14:00:00.000Z",
      promisedAmountMinor: 30_000,
      receivedSincePromiseMinor: 30_000,
      outstandingAmountMinor: 90_000,
    })).not.toThrow();
  });

  it("refuses to call a promise broken before it is due", () => {
    expect(() => assertPaymentPromiseResolution({
      outcome: "BROKEN",
      occurredAt: "2026-09-04T14:00:00.000Z",
      promisedFor: "2026-09-05T14:00:00.000Z",
      promisedAmountMinor: 30_000,
      receivedSincePromiseMinor: 0,
      outstandingAmountMinor: 120_000,
    })).toThrow("PAYMENT_PROMISE_NOT_DUE_OR_ALREADY_PAID");
  });

  it("selects the managed next collection decision deterministically", () => {
    expect(nextCollectionDecision({
      receivableStatus: "OPEN",
      outstandingAmountMinor: 120_000,
      dueAt: "2026-09-01T14:00:00.000Z",
      activePromise: null,
      latestBrokenPromise: false,
      now: "2026-09-02T14:00:00.000Z",
    })).toBe("COLLECT_OVERDUE_INVOICE");
    expect(nextCollectionDecision({
      receivableStatus: "PARTIAL",
      outstandingAmountMinor: 90_000,
      dueAt: "2026-09-01T14:00:00.000Z",
      activePromise: { status: "ACTIVE", promisedFor: "2026-09-05T14:00:00.000Z" },
      latestBrokenPromise: false,
      now: "2026-09-02T14:00:00.000Z",
    })).toBe("WAIT_FOR_PROMISE");
    expect(nextCollectionDecision({
      receivableStatus: "PARTIAL",
      outstandingAmountMinor: 90_000,
      dueAt: "2026-09-01T14:00:00.000Z",
      activePromise: null,
      latestBrokenPromise: true,
      now: "2026-09-02T14:00:00.000Z",
    })).toBe("COLLECT_BROKEN_PROMISE");
  });

  it("enforces a financially empty field projection", () => {
    const field = {
      schemaVersion: 1 as const,
      generatedAt: "2026-09-02T14:00:00.000Z",
      workspaceId: "workspace",
      role: "FIELD_WORKER" as const,
      invoiceReadiness: [],
      receivables: [],
      financialDataVisible: false as const,
      externalTransportPerformed: false as const,
    };
    expect(fieldEconomicCockpitSchema.parse(field)).toEqual(field);
    expect(() => fieldEconomicCockpitSchema.parse({
      ...field,
      receivables: [{ id: "leak", amountMinor: 120_000 }],
    })).toThrow();
  });
});
