import { describe, expect, it } from "vitest";
import {
  createPrepareAccountingAccountCommand,
  createPrepareAccountingInvoiceCommand,
  formatAccountingDraftInspection,
  mobileAccountingDraftCommandSchema,
  parseMobileAccountingCockpit,
} from "../src/lib/accounting";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";
import type { MobileWorkspace } from "../src/lib/contracts";

function memoryStore() {
  const values = new Map<string, string>();
  const store: SecureOutboxStore = {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
  return store;
}

const ownerWorkspace: MobileWorkspace = {
  id: "workspace-1",
  name: "ENDVERA Construction",
  defaultTimezone: "America/Toronto",
  defaultLocale: "fr-CA",
  role: "OWNER",
  permissions: {
    financialsVisible: true,
    canManageReceivables: true,
    canScheduleFollowUps: true,
    canApprovePreparedActions: true,
    canAddEvidence: true,
    externalTransportAuthorized: false,
  },
};

describe("R27 mobile accounting cockpit", () => {
  it("restores the exact local-disabled account command after restart", async () => {
    const store = memoryStore();
    const command = createPrepareAccountingAccountCommand({
      workspace: ownerWorkspace,
      commandId: "00000000-0000-4000-8000-000000000127",
      provider: "QUICKBOOKS_ONLINE",
      accountRef: `accounting_${"a".repeat(64)}`,
      tenantRef: `accounting_${"b".repeat(64)}`,
    });
    const queued = await enqueueMobileOutbox({ kind: "ACCOUNTING_ACCOUNT_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: queued.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: ownerWorkspace.id, store });
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      entryId: command.commandId,
      kind: "ACCOUNTING_ACCOUNT_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
    const xero = createPrepareAccountingAccountCommand({
      workspace: ownerWorkspace,
      commandId: "00000000-0000-4000-8000-000000000129",
      provider: "XERO",
      accountRef: `accounting_${"c".repeat(64)}`,
      tenantRef: `accounting_${"d".repeat(64)}`,
    });
    if (xero.action !== "PREPARE_ACCOUNTING_ACCOUNT") throw new Error("EXPECTED_ACCOUNT_COMMAND");
    expect(xero.provider).toBe("XERO");
  });

  it("builds one exact invoice line and refuses an invalid approval hash", () => {
    const command = createPrepareAccountingInvoiceCommand({
      workspace: ownerWorkspace,
      commandId: "00000000-0000-4000-8000-000000000128",
      accountId: "account-1",
      receivableId: "receivable-1",
      expectedReceivableVersion: 3,
      description: "Dosseret de cuisine",
      baseAmountMinor: 100_000,
      taxCode: "TPS-TVQ",
      taxAmountMinor: 20_000,
    });
    if (command.action !== "PREPARE_ACCOUNTING_INVOICE") throw new Error("EXPECTED_INVOICE_COMMAND");
    expect(command.lines).toEqual([{ description: "Dosseret de cuisine", quantity: 1, unitAmountMinor: 100_000,
      taxCode: "TPS-TVQ", taxAmountMinor: 20_000 }]);
    expect(mobileAccountingDraftCommandSchema.safeParse({
      schemaVersion: 1,
      action: "APPROVE_ACCOUNTING_DRAFT",
      commandId: crypto.randomUUID(),
      workspaceId: ownerWorkspace.id,
      draftId: "draft-1",
      expectedVersion: 1,
      expectedPayloadHash: "not-a-hash",
    }).success).toBe(false);
  });

  it("refuses financial or provider data in the field-worker projection", () => {
    const field = {
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "field_worker",
      accounts: [], observations: [], drafts: [], receivables: [],
      counts: { accounts: 0, observations: 0, drafts: 0, unresolved: 0 },
      financialDataVisible: false,
      providerObserved: false,
      externalWriteEnabled: false,
    };
    expect(parseMobileAccountingCockpit(field).role).toBe("field_worker");
    expect(() => parseMobileAccountingCockpit({ ...field, provider: "QUICKBOOKS_ONLINE" })).toThrow(
      "MOBILE_ACCOUNTING_FIELD_LEAK_REFUSED",
    );
    expect(() => parseMobileAccountingCockpit({ ...field, amountMinor: 120_000 })).toThrow(
      "MOBILE_ACCOUNTING_FIELD_LEAK_REFUSED",
    );
  });

  it("shows the exact provider, payload and binding hash before approval", () => {
    const inspection = formatAccountingDraftInspection({
      id: "draft-1",
      kind: "INVOICE",
      provider: "QUICKBOOKS_ONLINE",
      projectId: "project-1",
      receivableId: "receivable-1",
      version: 1,
      payload: {
        contactId: "contact-1",
        currency: "CAD",
        dueAt: "2026-09-30T04:00:00.000Z",
        lines: [{ description: "Dosseret", quantity: 1, unitAmountMinor: 100_000, taxAmountMinor: 20_000 }],
        selectedEvidenceIds: ["evidence-1"],
        decisionHash: "c".repeat(64),
      },
      payloadHash: "d".repeat(64),
      status: "PREPARED_UNPOSTED",
      canonicalEffectApplied: false,
      createdAt: "2026-09-02T05:00:00.000Z",
    });
    expect(inspection).toContain("QUICKBOOKS_ONLINE");
    expect(inspection).toContain("contact-1");
    expect(inspection).toContain("Dosseret");
    expect(inspection).toContain("evidence-1");
    expect(inspection).toContain("d".repeat(64));
  });
});
