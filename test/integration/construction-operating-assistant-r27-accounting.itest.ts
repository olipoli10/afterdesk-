import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ACCOUNTING_POLICY_VERSION } from "@/lib/construction-operating-assistant-r27/contracts";
import { opaqueAccountingRef } from "@/lib/construction-operating-assistant-r27/policy";
import {
  accountingCockpitForUser,
  admitAccountingObservation,
  approveAccountingDraft,
  prepareAccountingDraft,
  processAccountingAccountCommand,
} from "@/server/construction-operating-assistant-r27/accounting";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R27 owner ${label}`,
      email: `r27-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R27 field ${label}`,
      email: `r27-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R27 ${label}` });
  await prisma.constructionWorkspaceMember.create({
    data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `ACC-${label}`,
    name: `Comptabilité ${label}`,
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Client synthétique",
  });
  const source = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: crypto.randomUUID(),
      recipients: [],
      originalBody: "Dossier synthétique prêt à facturer.",
      normalizedBody: "Dossier synthétique prêt à facturer.",
    },
  });
  const loop = await prisma.constructionOpenLoop.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      openedByMessageId: source.id,
      desiredOutcome: "Facture prête",
      status: "ready_to_invoice",
      policyVersion: "r27-test",
      stateVersion: 4,
      idempotencyKey: crypto.randomUUID(),
      semanticKey: crypto.randomUUID(),
      nextResponsibleRole: "OWNER",
      nextAction: "Préparer la facture exacte",
      decisionHash: "a".repeat(64),
      readyAt: new Date("2026-09-02T04:00:00.000Z"),
    },
  });
  const evidence = await prisma.constructionOpenLoopEvidence.create({
    data: {
      loopId: loop.id,
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      evidenceKey: crypto.randomUUID(),
      kind: "document",
      state: "verified",
      sourceRef: "file:synthetic-r27",
      contentHash: "b".repeat(64),
    },
  });
  const receivable = await prisma.constructionReceivable.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      contactId: contact.id,
      openLoopId: loop.id,
      invoiceReference: `R27-${label}-${crypto.randomUUID()}`,
      originalAmountMinor: 120_000,
      outstandingAmountMinor: 120_000,
      currency: "CAD",
      issuedAt: new Date("2026-09-02T04:00:00.000Z"),
      dueAt: new Date("2026-09-30T04:00:00.000Z"),
      status: "open",
      version: 1,
      idempotencyKey: crypto.randomUUID(),
      createdById: owner.id,
    },
  });
  const accountCommand = {
    schemaVersion: 1 as const,
    action: "PREPARE_ACCOUNTING_ACCOUNT" as const,
    commandId: crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    provider: "QUICKBOOKS_ONLINE" as const,
    accountRef: opaqueAccountingRef({ workspaceId: workspace.workspaceId, account: "local" }),
    tenantRef: opaqueAccountingRef({ workspaceId: workspace.workspaceId, tenant: "local" }),
    capabilities: ["READ_RECEIVABLES", "READ_PAYMENTS", "PREPARE_INVOICE", "PREPARE_RECONCILIATION"] as const,
  };
  const account = await processAccountingAccountCommand({ userId: owner.id, command: accountCommand });
  return {
    ownerId: owner.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    contactId: contact.id,
    loopId: loop.id,
    evidenceId: evidence.id,
    receivableId: receivable.id,
    accountId: account.accountId,
    accountCommand,
  };
}

function paymentObservation(f: Awaited<ReturnType<typeof fixture>>, input: { amountMinor?: number; observationId?: string; entitySeed?: string } = {}) {
  return {
    schemaVersion: 1 as const,
    observationId: input.observationId ?? crypto.randomUUID(),
    workspaceId: f.workspaceId,
    accountId: f.accountId,
    provider: "QUICKBOOKS_ONLINE" as const,
    entityRef: opaqueAccountingRef(input.entitySeed ?? crypto.randomUUID()),
    cursorRef: opaqueAccountingRef(crypto.randomUUID()),
    kind: "PAYMENT" as const,
    projectId: f.projectId,
    contactId: f.contactId,
    receivableId: f.receivableId,
    documentNumberHash: "c".repeat(64),
    amountMinor: input.amountMinor ?? 120_000,
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
}

describe("R27 accounting connectors on disposable PostgreSQL", () => {
  it("replays an exact account command, rejects drift and revokes with no external authority", async () => {
    const f = await fixture("ACCOUNT");
    const replay = await processAccountingAccountCommand({ userId: f.ownerId, command: f.accountCommand });
    expect(replay).toMatchObject({ accountId: f.accountId, replayed: true, credentialStored: false, externalWriteEnabled: false });
    await expect(processAccountingAccountCommand({
      userId: f.ownerId,
      command: { ...f.accountCommand, provider: "XERO" },
    })).rejects.toThrow("ACCOUNTING_COMMAND_IDEMPOTENCY_CONFLICT");

    const current = await prisma.constructionAccountingAccount.findUniqueOrThrow({ where: { id: f.accountId } });
    const revoked = await processAccountingAccountCommand({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "REVOKE_ACCOUNTING_ACCOUNT",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        accountId: f.accountId,
        expectedVersion: current.version,
      },
    });
    expect(revoked).toMatchObject({ status: "REVOKED", credentialStored: false, externalWriteEnabled: false });
  });

  it("admits one exact observation under replay and refuses entity drift and cross-workspace use", async () => {
    const f = await fixture("OBSERVATION");
    const observation = paymentObservation(f, { observationId: crypto.randomUUID(), entitySeed: "stable-payment" });
    const results = await Promise.all([
      admitAccountingObservation({ userId: f.ownerId, observation }),
      admitAccountingObservation({ userId: f.ownerId, observation }),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]).toMatchObject({ matchStatus: "EXACT", canonicalEffectApplied: false, externalWritePerformed: false });
    expect(await prisma.constructionAccountingObservation.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionReceivableEvent.count({ where: { receivableId: f.receivableId } })).toBe(0);

    await expect(admitAccountingObservation({
      userId: f.ownerId,
      observation: { ...observation, observationId: crypto.randomUUID(), amountMinor: 119_999 },
    })).rejects.toThrow("ACCOUNTING_ENTITY_DRIFT");
    expect(await prisma.constructionAccountingRefusal.count({
      where: { workspaceId: f.workspaceId, operationKind: "ADMIT_PAYMENT", refusalCode: "ACCOUNTING_ENTITY_DRIFT" },
    })).toBe(1);

    const other = await fixture("OTHER");
    await expect(admitAccountingObservation({
      userId: other.ownerId,
      observation: { ...observation, observationId: crypto.randomUUID(), workspaceId: other.workspaceId },
    })).rejects.toThrow();
    // Prisma Dev's pooled local proxy can retain the transaction session used
    // by the concurrent replay proof. Reconnect before the next independent
    // scenario so a proxy session is never mistaken for product state.
    await prisma.$disconnect();
    await prisma.$connect();
  });

  it("applies one exact internal reconciliation atomically and survives reconnect unchanged", async () => {
    const f = await fixture("RECONCILE");
    const admitted = await admitAccountingObservation({ userId: f.ownerId, observation: paymentObservation(f) });
    const prepared = await prepareAccountingDraft({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_ACCOUNTING_RECONCILIATION",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        accountId: f.accountId,
        observationId: admitted.accountingObservationId,
        receivableId: f.receivableId,
        expectedReceivableVersion: 1,
        expectedPolicyVersion: ACCOUNTING_POLICY_VERSION,
      },
    });
    const approval = {
      schemaVersion: 1 as const,
      action: "APPROVE_ACCOUNTING_DRAFT" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      draftId: prepared.draftId,
      expectedVersion: prepared.version,
      expectedPayloadHash: prepared.payloadHash,
    };
    const outcomes = await Promise.all([
      approveAccountingDraft({ userId: f.ownerId, command: approval }),
      approveAccountingDraft({ userId: f.ownerId, command: approval }),
    ]);
    expect(outcomes.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(outcomes[0]).toMatchObject({ status: "APPROVED_UNPOSTED", canonicalEffectApplied: true, externalEffectCount: 0, externalWritePerformed: false });
    expect(await prisma.constructionReceivableEvent.count({
      where: { receivableId: f.receivableId, kind: "payment_received" },
    })).toBe(1);
    const before = await prisma.constructionReceivable.findUniqueOrThrow({ where: { id: f.receivableId } });
    expect(before).toMatchObject({ outstandingAmountMinor: 0, status: "paid", version: 2 });

    await prisma.$disconnect();
    await prisma.$connect();
    const after = await prisma.constructionReceivable.findUniqueOrThrow({ where: { id: f.receivableId } });
    expect({ outstandingAmountMinor: after.outstandingAmountMinor, status: after.status, version: after.version })
      .toEqual({ outstandingAmountMinor: before.outstandingAmountMinor, status: before.status, version: before.version });
    await expect(approveAccountingDraft({
      userId: f.ownerId,
      command: { ...approval, commandId: crypto.randomUUID() },
    })).rejects.toThrow("ACCOUNTING_DRAFT_ALREADY_DECIDED");
    expect(await prisma.constructionAccountingRefusal.count({
      where: { workspaceId: f.workspaceId, operationKind: "APPROVE_ACCOUNTING_DRAFT", refusalCode: "ACCOUNTING_DRAFT_ALREADY_DECIDED" },
    })).toBe(1);
  });

  it("prepares an exact invoice and exposes no accounting data to a field worker", async () => {
    const f = await fixture("INVOICE");
    const invoice = await prepareAccountingDraft({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_ACCOUNTING_INVOICE",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        accountId: f.accountId,
        receivableId: f.receivableId,
        expectedReceivableVersion: 1,
        lines: [{ description: "Dosseret de cuisine", quantity: 1, unitAmountMinor: 100_000, taxCode: "TPS-TVQ", taxAmountMinor: 20_000 }],
        selectedEvidenceIds: [f.evidenceId],
        expectedPolicyVersion: ACCOUNTING_POLICY_VERSION,
      },
    });
    expect(invoice).toMatchObject({ kind: "INVOICE", status: "PREPARED_UNPOSTED", externalEffectCount: 0, externalWritePerformed: false });
    await expect(prepareAccountingDraft({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_ACCOUNTING_INVOICE",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        accountId: f.accountId,
        receivableId: f.receivableId,
        expectedReceivableVersion: 1,
        lines: [{ description: "Montant erroné", quantity: 1, unitAmountMinor: 1, taxCode: "TPS-TVQ", taxAmountMinor: 0 }],
        selectedEvidenceIds: [],
        expectedPolicyVersion: ACCOUNTING_POLICY_VERSION,
      },
    })).rejects.toThrow("ACCOUNTING_INVOICE_TOTAL_MISMATCH");
    expect(await prisma.constructionAccountingRefusal.count({
      where: { workspaceId: f.workspaceId, operationKind: "PREPARE_ACCOUNTING_INVOICE", refusalCode: "ACCOUNTING_INVOICE_TOTAL_MISMATCH" },
    })).toBe(1);

    const owner = await accountingCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId });
    const field = await accountingCockpitForUser({ userId: f.fieldId, workspaceId: f.workspaceId });
    expect(owner.financialDataVisible).toBe(true);
    expect(owner.drafts).toHaveLength(1);
    expect(field).toMatchObject({
      role: "field_worker",
      accounts: [], observations: [], drafts: [], receivables: [],
      financialDataVisible: false,
      providerObserved: false,
      externalWriteEnabled: false,
    });
  });
});
