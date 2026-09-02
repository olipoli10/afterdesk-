import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addInvoiceReadinessEvidence,
  recordWorkFinished,
} from "@/server/construction-operating-assistant-r0/open-loops";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  recordConstructionReceivablePayment,
} from "@/server/construction-operating-assistant-r6/receivables";
import {
  economicCockpitForUser,
  prepareDueCollections,
  processEconomicCommand,
} from "@/server/construction-operating-assistant-r21/economic-engine";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R21 owner ${label}`,
      email: `r21-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R21 field ${label}`,
      email: `r21-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `R21 outsider ${label}`,
      email: `r21-outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R21 ${label}`,
  });
  await prisma.constructionWorkspaceMember.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId: field.id,
      role: "member",
      status: "active",
    },
  });
  const projectCode = `R21-${label}`;
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: projectCode,
    name: `Rénovation Laval ${label}`,
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: `Marc ${label}`,
    role: "Client synthétique",
  });
  const message = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      contactId: contact.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: `r21-source-${label}`,
      sender: `user:${owner.id}`,
      recipients: ["ENDVERA_LOCAL"],
      originalBody: "Travail terminé pour l'extra synthétique.",
      normalizedBody: "Travail terminé pour l'extra synthétique.",
      status: "received",
      receivedAt: new Date("2026-09-01T13:00:00.000Z"),
    },
  });
  const opened = await recordWorkFinished({
    schemaVersion: 1,
    commandId: `r21-report-${label}`,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    actorId: owner.id,
    sourceMessageId: message.id,
    commandType: "REPORT_WORK_FINISHED",
    claims: {
      billingBasis: "CHANGE_ORDER",
      workDescription: "Dosseret de cuisine synthétique terminé",
      amountMinor: 120_000,
      currency: "CAD",
      completion: true,
      approvalState: "APPROVED",
    },
  });
  await addInvoiceReadinessEvidence({
    schemaVersion: 1,
    eventId: `r21-approval-${label}`,
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    loopId: opened.loopId,
    expectedStateVersion: 1,
    kind: "WRITTEN_APPROVAL",
    state: "VERIFIED",
    sourceRef: `synthetic://r21/${label}/approval`,
    contentHash: "4d5d430818ffed2f38fd83a0fc860755473daf427dae314d00d74549a84dad07",
  });
  const ready = await addInvoiceReadinessEvidence({
    schemaVersion: 1,
    eventId: `r21-photo-${label}`,
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    loopId: opened.loopId,
    expectedStateVersion: 2,
    kind: "PHOTO",
    state: "VERIFIED",
    sourceRef: `synthetic://r21/${label}/photo`,
    contentHash: "06f060e968a6adac165498541dbc25cf9aee69fc70d36c3917fe6a4382db91fe",
  });
  return {
    owner,
    field,
    outsider,
    workspaceId: workspace.workspaceId,
    project,
    projectCode,
    contact,
    loopId: opened.loopId,
    loopVersion: ready.decision.stateVersion,
  };
}

function issueCommand(
  f: Awaited<ReturnType<typeof fixture>>,
  commandId = crypto.randomUUID(),
  dueAt = "2026-10-02T14:00:00.000Z",
) {
  return {
    schemaVersion: 1 as const,
    commandId,
    workspaceId: f.workspaceId,
    action: "ISSUE_READY_INVOICE" as const,
    openLoopId: f.loopId,
    expectedLoopVersion: f.loopVersion,
    contactId: f.contact.id,
    invoiceReference: `INV-${f.projectCode}`,
    issuedAt: "2026-09-02T14:00:00.000Z",
    dueAt,
  };
}

describe("R21 invoice and collections engine on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("creates one receivable from fresh readiness under concurrent exact replay", async () => {
    const f = await fixture("ISSUE");
    const command = issueCommand(f);
    const [first, second] = await Promise.all([
      processEconomicCommand({ userId: f.owner.id, command }),
      processEconomicCommand({ userId: f.owner.id, command }),
    ]);
    expect(first.receivableId).toBe(second.receivableId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(first.outstandingAmountMinor).toBe(120_000);
    expect(await prisma.constructionReceivable.count({ where: { openLoopId: f.loopId } })).toBe(1);
    expect(await prisma.constructionReceivableEvent.count({
      where: { receivableId: first.receivableId, kind: "issued" },
    })).toBe(1);
    expect(await prisma.constructionEconomicCommand.count({
      where: { workspaceId: f.workspaceId },
    })).toBe(1);
    await expect(processEconomicCommand({
      userId: f.owner.id,
      command: { ...command, invoiceReference: `${command.invoiceReference}-CHANGED` },
    })).rejects.toThrow("ECONOMIC_COMMAND_IDEMPOTENCY_CONFLICT");
    await expect(processEconomicCommand({
      userId: f.outsider.id,
      command: { ...command, commandId: crypto.randomUUID() },
    })).rejects.toThrow();
  });

  it("preserves a promise separately, proves kept from a payment, and reconstructs", async () => {
    const f = await fixture("PROMISE");
    const issued = await processEconomicCommand({ userId: f.owner.id, command: issueCommand(f) });
    const promiseCommand = {
      schemaVersion: 1 as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      action: "RECORD_PAYMENT_PROMISE" as const,
      receivableId: issued.receivableId,
      expectedReceivableVersion: 1,
      promisedAmountMinor: 30_000,
      currency: "CAD" as const,
      promisedFor: "2026-09-05T14:00:00.000Z",
      sourceRef: "synthetic://r21/promise",
    };
    const promised = await processEconomicCommand({ userId: f.owner.id, command: promiseCommand });
    expect(promised).toMatchObject({
      outstandingAmountMinor: 120_000,
      promiseStatus: "ACTIVE",
      receivableVersion: 2,
    });
    await expect(processEconomicCommand({
      userId: f.owner.id,
      command: {
        schemaVersion: 1,
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        action: "RESOLVE_PAYMENT_PROMISE",
        receivableId: issued.receivableId,
        promiseId: promised.promiseId!,
        expectedReceivableVersion: 2,
        expectedPromiseVersion: 1,
        outcome: "KEPT",
        occurredAt: "2026-09-05T14:00:00.000Z",
        reason: "Aucun paiement ne prouve encore la promesse.",
      },
    })).rejects.toThrow("PAYMENT_PROMISE_NOT_PROVEN_KEPT");
    await recordConstructionReceivablePayment({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      actorId: f.owner.id,
      workspaceId: f.workspaceId,
      receivableId: issued.receivableId,
      expectedVersion: 2,
      amountMinor: 30_000,
      receivedAt: "2026-09-05T13:00:00.000Z",
      sourceRef: "synthetic://r21/payment",
      note: "Paiement synthétique confirmé.",
    });
    const resolvedCommand = {
      schemaVersion: 1 as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      action: "RESOLVE_PAYMENT_PROMISE" as const,
      receivableId: issued.receivableId,
      promiseId: promised.promiseId!,
      expectedReceivableVersion: 3,
      expectedPromiseVersion: 1,
      outcome: "KEPT" as const,
      occurredAt: "2026-09-05T14:00:00.000Z",
      reason: "Paiement synthétique reçu et conservé dans le registre.",
    };
    const resolved = await processEconomicCommand({ userId: f.owner.id, command: resolvedCommand });
    expect(resolved).toMatchObject({ promiseStatus: "KEPT", outstandingAmountMinor: 90_000 });
    const replay = await processEconomicCommand({ userId: f.owner.id, command: resolvedCommand });
    expect(replay).toMatchObject({ replayed: true, applied: false, promiseStatus: "KEPT" });
    const before = await economicCockpitForUser({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      now: new Date("2026-09-06T14:00:00.000Z"),
    });
    await prisma.$disconnect();
    const after = await economicCockpitForUser({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      now: new Date("2026-09-06T14:00:00.000Z"),
    });
    expect(after).toEqual(before);
  });

  it("prepares overdue collection once and projects zero economics to field", async () => {
    const f = await fixture("COLLECT");
    const issued = await processEconomicCommand({
      userId: f.owner.id,
      command: issueCommand(f, crypto.randomUUID(), "2026-09-03T14:00:00.000Z"),
    });
    const first = await prepareDueCollections({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      now: new Date("2026-09-04T14:00:00.000Z"),
    });
    const second = await prepareDueCollections({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      now: new Date("2026-09-04T14:00:00.000Z"),
    });
    expect(first.externalTransportPerformed).toBe(false);
    expect(first.prepared).toHaveLength(1);
    expect(first.prepared[0]).toMatchObject({
      disposition: "PREPARED_UNSENT",
      externalTransportPerformed: false,
    });
    expect(second.created[0]).toMatchObject({ replayed: true });
    expect(await prisma.constructionFollowUp.count({ where: { receivableId: issued.receivableId } })).toBe(1);
    expect(await prisma.constructionFollowUpAttempt.count({
      where: { followUp: { receivableId: issued.receivableId } },
    })).toBe(1);
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
    const field = await economicCockpitForUser({ userId: f.field.id, workspaceId: f.workspaceId });
    expect(field).toMatchObject({
      role: "FIELD_WORKER",
      invoiceReadiness: [],
      receivables: [],
      financialDataVisible: false,
    });
    expect(JSON.stringify(field)).not.toContain("120000");
    expect(JSON.stringify(field)).not.toContain("INV-");
  });
});
