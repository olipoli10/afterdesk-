import { describe, expect, it } from "vitest";
import {
  mobileEconomicCommandSchema,
  mobileEconomicResultSchema,
  parseMobileEconomicCockpit,
} from "../src/lib/invoices";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-02T12:00:00.000Z",
  workspaceId: "workspace-1",
  externalTransportPerformed: false as const,
};

const readiness = {
  loopId: "loop-1",
  projectId: "project-1",
  projectCode: "LAVAL-001",
  projectName: "Rénovation Laval",
  stateVersion: 4,
  status: "READY_TO_INVOICE" as const,
  amountMinor: 120_000,
  currency: "CAD" as const,
  missing: [],
  verificationRequired: [],
  contradictionCount: 0,
  nextResponsibleRole: "OWNER",
  nextAction: "Émettre la facture.",
  decisionHash: "a".repeat(64),
};

describe("native R21 invoice contracts", () => {
  it("accepts the owner economic cockpit and a financially empty field cockpit", () => {
    const owner = parseMobileEconomicCockpit({
      ...base,
      role: "OWNER",
      invoiceReadiness: [readiness],
      receivables: [],
    });
    const field = parseMobileEconomicCockpit({
      ...base,
      role: "FIELD_WORKER",
      invoiceReadiness: [],
      receivables: [],
      financialDataVisible: false,
    });
    expect(owner.role).toBe("OWNER");
    expect(owner.invoiceReadiness).toHaveLength(1);
    expect(field).toMatchObject({
      role: "FIELD_WORKER",
      invoiceReadiness: [],
      receivables: [],
      financialDataVisible: false,
    });
  });

  it("recursively refuses any financial leak in the field projection", () => {
    expect(() => parseMobileEconomicCockpit({
      ...base,
      role: "FIELD_WORKER",
      invoiceReadiness: [],
      receivables: [],
      financialDataVisible: false,
      nested: { amountMinor: 120_000 },
    })).toThrow("MOBILE_INVOICE_FIELD_LEAK_REFUSED");
  });

  it("pins invoice and promise commands to strict local, zero-transport results", () => {
    const command = mobileEconomicCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      action: "ISSUE_READY_INVOICE",
      openLoopId: "loop-1",
      expectedLoopVersion: 4,
      contactId: "contact-1",
      invoiceReference: "LAVAL-001-01",
      issuedAt: "2026-09-02T12:00:00.000Z",
      dueAt: "2026-10-02T12:00:00.000Z",
    });
    expect(() => mobileEconomicCommandSchema.parse({ ...command, provider: "quickbooks" })).toThrow();
    const result = mobileEconomicResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      action: command.action,
      openLoopId: "loop-1",
      receivableId: "receivable-1",
      receivableVersion: 1,
      promiseId: null,
      promiseVersion: null,
      promiseStatus: null,
      outstandingAmountMinor: 120_000,
      disposition: "INVOICE_RECORDED",
      applied: true,
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(result.externalTransportPerformed).toBe(false);
  });

  it("restores the exact economic command after a mobile restart", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const command = mobileEconomicCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      action: "RECORD_PAYMENT_PROMISE",
      receivableId: "receivable-1",
      expectedReceivableVersion: 1,
      promisedAmountMinor: 50_000,
      currency: "CAD",
      promisedFor: "2026-09-09T12:00:00.000Z",
      sourceRef: "mobile:test",
    });
    const entry = await enqueueMobileOutbox({ kind: "ECONOMIC_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: command.workspaceId, store });
    expect(restored[0]).toMatchObject({
      kind: "ECONOMIC_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });
});
