import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  constructionReceivablesForRole,
  prepareDueConstructionFollowUps,
  recordConstructionReceivable,
  recordConstructionReceivablePayment,
  scheduleConstructionFollowUp,
} from "@/server/construction-operating-assistant-r6/receivables";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R6 owner ${label}`,
      email: `r6-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R6 Construction ${label}`,
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R6-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Client synthétique",
    normalizedPhone: "+15555550184",
    normalizedEmail: "marc@example.invalid",
  });
  return {
    ownerId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    contactId: contact.id,
  };
}

async function invoice(f: Awaited<ReturnType<typeof fixture>>, key: string) {
  return recordConstructionReceivable({
    schemaVersion: 1,
    requestId: `request-${key}`,
    idempotencyKey: key,
    actorId: f.ownerId,
    workspaceId: f.workspaceId,
    projectId: f.projectId,
    contactId: f.contactId,
    invoiceReference: "184",
    amountMinor: 845_000,
    currency: "CAD",
    issuedAt: "2026-09-01T12:00:00.000Z",
    dueAt: "2026-09-05T12:00:00.000Z",
    sourceRef: `portal:${key}`,
  });
}

describe("Construction Operating Assistant R6 receivables on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("keeps one invoice and one partial-payment effect under concurrent replay", async () => {
    const f = await fixture("balance");
    const [created, replay] = await Promise.all([
      invoice(f, "invoice-184-balance"),
      invoice(f, "invoice-184-balance"),
    ]);
    expect(created.id).toBe(replay.id);
    expect([created.replayed, replay.replayed].sort()).toEqual([false, true]);

    const payment = {
      schemaVersion: 1 as const,
      eventId: "payment-5000",
      actorId: f.ownerId,
      workspaceId: f.workspaceId,
      receivableId: created.id,
      expectedVersion: 1,
      amountMinor: 500_000,
      receivedAt: "2026-09-05T15:00:00.000Z",
      sourceRef: "synthetic-bank-record:payment-5000",
      note: "Paiement partiel synthétique.",
    };
    const [first, second] = await Promise.all([
      recordConstructionReceivablePayment(payment),
      recordConstructionReceivablePayment(payment),
    ]);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(first.outstandingAmountMinor).toBe(345_000);
    expect(second.outstandingAmountMinor).toBe(345_000);
    expect(
      await prisma.constructionReceivableEvent.count({
        where: { receivableId: created.id, kind: "payment_received" },
      }),
    ).toBe(1);
    await expect(
      recordConstructionReceivablePayment({
        ...payment,
        eventId: "overpayment",
        expectedVersion: 2,
        amountMinor: 400_000,
      }),
    ).rejects.toThrow("CONSTRUCTION_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE");
  });

  it("prepares one due follow-up, survives reconnect and leaks no money to a field worker", async () => {
    const f = await fixture("followup");
    const receivable = await invoice(f, "invoice-184-followup");
    const scheduled = await scheduleConstructionFollowUp({
      schemaVersion: 1,
      requestId: "followup-request-1",
      idempotencyKey: "followup-invoice-184",
      actorId: f.ownerId,
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      contactId: f.contactId,
      target: {
        kind: "RECEIVABLE_PAYMENT",
        receivableId: receivable.id,
      },
      dueAt: "2026-09-06T12:00:00.000Z",
      channel: "SMS",
      body: "Bonjour Marc, rappel concernant la facture 184.",
    });
    const [first, second] = await Promise.all([
      prepareDueConstructionFollowUps({
        now: new Date("2026-09-06T12:01:00.000Z"),
      }),
      prepareDueConstructionFollowUps({
        now: new Date("2026-09-06T12:01:00.000Z"),
      }),
    ]);
    expect(first.length + second.length).toBe(1);
    expect(
      await prisma.constructionAction.count({
        where: { workspaceId: f.workspaceId, type: "follow_up" },
      }),
    ).toBe(1);
    const durable = await prisma.constructionFollowUp.findUniqueOrThrow({
      where: { id: scheduled.id },
      select: { status: true, actionId: true, attempt: true },
    });
    expect(durable).toMatchObject({ status: "prepared_unsent", attempt: 1 });
    expect(durable.actionId).not.toBeNull();
    expect(
      await prisma.constructionConnectorOperation.count({
        where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
      }),
    ).toBe(0);

    const field = await prisma.user.create({
      data: {
        name: "R6 field worker",
        email: `r6-field-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: f.workspaceId,
        userId: field.id,
        role: "member",
        status: "active",
      },
    });
    const fieldProjection = await constructionReceivablesForRole({
      userId: field.id,
      workspaceId: f.workspaceId,
      role: "FIELD_WORKER",
    });
    const serialized = JSON.stringify(fieldProjection);
    expect(serialized).not.toContain("845000");
    expect(serialized).not.toContain("outstandingAmountMinor");
    expect(serialized).not.toContain("invoiceReference");

    await prisma.$disconnect();
    await prisma.$connect();
    expect(
      await prisma.constructionFollowUp.findUniqueOrThrow({
        where: { id: scheduled.id },
        select: { status: true, actionId: true, attempt: true },
      }),
    ).toEqual(durable);
  });

  it("cancels an unprepared payment follow-up when the balance reaches zero", async () => {
    const f = await fixture("paid");
    const receivable = await invoice(f, "invoice-184-paid");
    const scheduled = await scheduleConstructionFollowUp({
      schemaVersion: 1,
      requestId: "followup-paid",
      idempotencyKey: "followup-paid",
      actorId: f.ownerId,
      workspaceId: f.workspaceId,
      projectId: f.projectId,
      contactId: f.contactId,
      target: {
        kind: "RECEIVABLE_PAYMENT",
        receivableId: receivable.id,
      },
      dueAt: "2026-09-10T12:00:00.000Z",
      channel: "HUMAN_CALL",
      body: "Confirmer la réception du solde de la facture 184.",
    });
    const paid = await recordConstructionReceivablePayment({
      schemaVersion: 1,
      eventId: "payment-full",
      actorId: f.ownerId,
      workspaceId: f.workspaceId,
      receivableId: receivable.id,
      expectedVersion: 1,
      amountMinor: 845_000,
      receivedAt: "2026-09-07T12:00:00.000Z",
      sourceRef: "synthetic-bank-record:payment-full",
      note: null,
    });
    expect(paid).toMatchObject({ status: "paid", outstandingAmountMinor: 0 });
    expect(
      await prisma.constructionFollowUp.findUniqueOrThrow({
        where: { id: scheduled.id },
        select: { status: true },
      }),
    ).toEqual({ status: "cancelled" });
  });
});
