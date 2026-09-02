import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_POLICY_VERSION,
  accountingCockpitSchema,
  approveAccountingDraftCommandSchema,
  normalizedAccountingObservationSchema,
  prepareAccountingAccountCommandSchema,
  prepareAccountingInvoiceDraftCommandSchema,
} from "@/lib/construction-operating-assistant-r27/contracts";
import {
  accountingDraftPayloadHash,
  accountingObservationHash,
  classifyAccountingMatch,
  opaqueAccountingRef,
} from "@/lib/construction-operating-assistant-r27/policy";

const refs = {
  account: opaqueAccountingRef("account"),
  tenant: opaqueAccountingRef("tenant"),
  entity: opaqueAccountingRef("entity"),
  cursor: opaqueAccountingRef("cursor"),
};

const observation = {
  schemaVersion: 1 as const,
  observationId: "3cb408f9-a6c2-4f8d-a31d-9cc263d838d5",
  workspaceId: "workspace-1",
  accountId: "account-1",
  provider: "QUICKBOOKS_ONLINE" as const,
  entityRef: refs.entity,
  cursorRef: refs.cursor,
  kind: "PAYMENT" as const,
  projectId: "project-1",
  contactId: "contact-1",
  receivableId: "receivable-1",
  documentNumberHash: "a".repeat(64),
  amountMinor: 120_000,
  currency: "CAD",
  observedStatus: "PAID",
  suppliedAt: "2026-09-02T05:00:00.000Z",
  adapter: {
    adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R27" as const,
    authenticityVerified: true as const,
    externalTransportPerformed: false as const,
  },
  externalWritePerformed: false as const,
};

describe("R27 accounting connector contracts", () => {
  it("accepts only opaque local-disabled accounting authority", () => {
    expect(prepareAccountingAccountCommandSchema.safeParse({
      schemaVersion: 1,
      action: "PREPARE_ACCOUNTING_ACCOUNT",
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      provider: "QUICKBOOKS_ONLINE",
      accountRef: refs.account,
      tenantRef: refs.tenant,
      capabilities: ["READ_RECEIVABLES", "READ_PAYMENTS", "PREPARE_INVOICE", "PREPARE_RECONCILIATION"],
    }).success).toBe(true);
    expect(prepareAccountingAccountCommandSchema.safeParse({
      schemaVersion: 1,
      action: "PREPARE_ACCOUNTING_ACCOUNT",
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      provider: "XERO",
      accountRef: refs.account,
      tenantRef: refs.tenant,
      capabilities: ["READ_RECEIVABLES", "PREPARE_INVOICE"],
    }).success).toBe(true);
    expect(prepareAccountingAccountCommandSchema.safeParse({
      schemaVersion: 1,
      action: "PREPARE_ACCOUNTING_ACCOUNT",
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      provider: "QUICKBOOKS_ONLINE",
      accountRef: "https://quickbooks.example/account",
      tenantRef: refs.tenant,
      capabilities: ["POST_INVOICE"],
      accessToken: "secret",
    }).success).toBe(false);
  });

  it("rejects secrets, remote URLs, external writes and unknown observation fields", () => {
    expect(normalizedAccountingObservationSchema.safeParse(observation).success).toBe(true);
    expect(normalizedAccountingObservationSchema.safeParse({ ...observation, accessToken: "secret" }).success).toBe(false);
    expect(normalizedAccountingObservationSchema.safeParse({ ...observation, entityRef: "https://xero.example/payment" }).success).toBe(false);
    expect(normalizedAccountingObservationSchema.safeParse({ ...observation, externalWritePerformed: true }).success).toBe(false);
  });

  it("classifies exact, partial, overpayment and binding conflicts without guessing", () => {
    const base = {
      kind: "PAYMENT" as const,
      observationCurrency: "CAD",
      receivableCurrency: "CAD",
      amountMinor: 120_000,
      originalAmountMinor: 120_000,
      outstandingAmountMinor: 120_000,
      projectMatches: true,
      contactMatches: true,
      receivableStatus: "open",
    };
    expect(classifyAccountingMatch(base).status).toBe("EXACT");
    expect(classifyAccountingMatch({ ...base, amountMinor: 50_000 }).status).toBe("PARTIAL");
    expect(classifyAccountingMatch({ ...base, amountMinor: 130_000 }).status).toBe("OVERPAYMENT");
    expect(classifyAccountingMatch({ ...base, projectMatches: false }).status).toBe("AMBIGUOUS");
    expect(classifyAccountingMatch({ ...base, observationCurrency: "USD" }).status).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("binds exact observation content and draft approval", () => {
    expect(accountingObservationHash(observation)).toBe(accountingObservationHash({ ...observation }));
    expect(accountingObservationHash(observation)).not.toBe(accountingObservationHash({ ...observation, amountMinor: 119_999 }));

    const command = {
      schemaVersion: 1 as const,
      action: "PREPARE_ACCOUNTING_INVOICE" as const,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      accountId: "account-1",
      receivableId: "receivable-1",
      expectedReceivableVersion: 1,
      lines: [{ description: "Dosseret", quantity: 1, unitAmountMinor: 100_000, taxCode: "TPS-TVQ", taxAmountMinor: 20_000 }],
      selectedEvidenceIds: [],
      expectedPolicyVersion: ACCOUNTING_POLICY_VERSION,
    };
    expect(prepareAccountingInvoiceDraftCommandSchema.safeParse(command).success).toBe(true);
    const payloadHash = accountingDraftPayloadHash({
      workspaceId: command.workspaceId,
      accountId: command.accountId,
      kind: "INVOICE",
      receivableId: command.receivableId,
      observationId: null,
      expectedReceivableVersion: 1,
      payload: { lines: command.lines, amountMinor: 120_000 },
      version: 1,
    });
    expect(approveAccountingDraftCommandSchema.safeParse({
      schemaVersion: 1,
      action: "APPROVE_ACCOUNTING_DRAFT",
      commandId: crypto.randomUUID(),
      workspaceId: command.workspaceId,
      draftId: "draft-1",
      expectedVersion: 1,
      expectedPayloadHash: payloadHash,
    }).success).toBe(true);
    expect(payloadHash).not.toBe(accountingDraftPayloadHash({
      workspaceId: command.workspaceId,
      accountId: command.accountId,
      kind: "INVOICE",
      receivableId: command.receivableId,
      observationId: null,
      expectedReceivableVersion: 1,
      payload: { lines: command.lines, amountMinor: 119_999 },
      version: 1,
    }));
  });

  it("fails closed if a field-worker accounting projection contains any financial detail", () => {
    const emptyField = {
      schemaVersion: 1 as const,
      workspaceId: "workspace-1",
      role: "field_worker" as const,
      accounts: [], observations: [], drafts: [], receivables: [],
      counts: { accounts: 0, observations: 0, drafts: 0, unresolved: 0 },
      financialDataVisible: false,
      providerObserved: false as const,
      externalWriteEnabled: false as const,
    };
    expect(accountingCockpitSchema.safeParse(emptyField).success).toBe(true);
    expect(accountingCockpitSchema.safeParse({
      ...emptyField,
      receivables: [{ id: "r1", projectId: "p1", invoiceReference: "INV-1", originalAmountMinor: 1,
        outstandingAmountMinor: 1, currency: "CAD", status: "open", version: 1 }],
    }).success).toBe(false);
  });
});
