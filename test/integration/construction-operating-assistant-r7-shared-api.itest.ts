import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  constructionSharedCockpitForUser,
  processConstructionSharedApiCommand,
} from "@/server/construction-operating-assistant-r7/gateway";
import { prepareDueConstructionFollowUps } from "@/server/construction-operating-assistant-r6/receivables";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R7 owner ${label}`,
      email: `r7-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const fieldWorker = await prisma.user.create({
    data: {
      name: `R7 field ${label}`,
      email: `r7-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `R7 outsider ${label}`,
      email: `r7-outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R7 Construction ${label}`,
  });
  await prisma.constructionWorkspaceMember.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId: fieldWorker.id,
      role: "member",
      status: "active",
    },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R7-${label}`,
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
    fieldWorkerId: fieldWorker.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    contactId: contact.id,
  };
}

describe("Construction Operating Assistant R7 shared API on disposable PostgreSQL", () => {
  it("runs all R6 commands through one actor-bound idempotent gateway", async () => {
    const f = await fixture("gateway");
    const issuedAt = "2026-09-01T12:00:00.000Z";
    const dueAt = "2026-09-08T12:00:00.000Z";
    const createCommand = {
      schemaVersion: 1 as const,
      requestId: "request-invoice-184",
      type: "RECORD_RECEIVABLE" as const,
      payload: {
        idempotencyKey: "invoice-184",
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        contactId: f.contactId,
        invoiceReference: "184",
        amountMinor: 845_000,
        currency: "CAD" as const,
        issuedAt,
        dueAt,
        sourceRef: "synthetic:invoice-184",
      },
    };
    const created = await processConstructionSharedApiCommand({
      userId: f.ownerId,
      command: createCommand,
    });
    const replay = await processConstructionSharedApiCommand({
      userId: f.ownerId,
      command: createCommand,
    });
    expect(created.resultType).toBe("RECEIVABLE_RECORDED");
    expect(created.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    if (created.resultType !== "RECEIVABLE_RECORDED") throw new Error("unreachable");

    const payment = await processConstructionSharedApiCommand({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        requestId: "request-payment-5000",
        type: "RECORD_PAYMENT",
        payload: {
          eventId: "payment-5000",
          workspaceId: f.workspaceId,
          receivableId: created.data.id,
          expectedVersion: 1,
          amountMinor: 500_000,
          receivedAt: "2026-09-02T12:00:00.000Z",
          sourceRef: "synthetic:payment-5000",
          note: "Paiement synthétique",
        },
      },
    });
    expect(payment.resultType).toBe("PAYMENT_RECORDED");
    if (payment.resultType !== "PAYMENT_RECORDED") throw new Error("unreachable");
    expect(payment.data.outstandingAmountMinor).toBe(345_000);

    const followUp = await processConstructionSharedApiCommand({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        requestId: "request-follow-up-184",
        type: "SCHEDULE_FOLLOW_UP",
        payload: {
          idempotencyKey: "follow-up-184",
          workspaceId: f.workspaceId,
          projectId: f.projectId,
          contactId: f.contactId,
          target: {
            kind: "RECEIVABLE_PAYMENT",
            receivableId: created.data.id,
          },
          dueAt: "2026-09-09T12:00:00.000Z",
          channel: "SMS",
          body: "Bonjour Marc, rappel concernant la facture 184.",
        },
      },
    });
    expect(followUp.resultType).toBe("FOLLOW_UP_SCHEDULED");
    expect(followUp.replayed).toBe(false);

    expect(
      await prisma.constructionReceivable.count({
        where: { workspaceId: f.workspaceId },
      }),
    ).toBe(1);
    expect(
      await prisma.constructionConnectorOperation.count({
        where: {
          workspaceId: f.workspaceId,
          externalTransportPerformed: true,
        },
      }),
    ).toBe(0);
  });

  it("derives cockpit permissions and omits money and payloads for a field worker", async () => {
    const f = await fixture("projection");
    const created = await processConstructionSharedApiCommand({
      userId: f.ownerId,
      command: {
        schemaVersion: 1,
        requestId: "projection-invoice",
        type: "RECORD_RECEIVABLE",
        payload: {
          idempotencyKey: "projection-invoice",
          workspaceId: f.workspaceId,
          projectId: f.projectId,
          contactId: f.contactId,
          invoiceReference: "SECRET-184",
          amountMinor: 845_000,
          currency: "CAD",
          issuedAt: "2026-09-01T12:00:00.000Z",
          dueAt: "2026-09-08T12:00:00.000Z",
          sourceRef: "synthetic:secret-invoice",
        },
      },
    });
    if (created.resultType !== "RECEIVABLE_RECORDED") throw new Error("unreachable");
    const followUpCommand = {
      schemaVersion: 1 as const,
      requestId: "projection-follow-up",
      type: "SCHEDULE_FOLLOW_UP" as const,
      payload: {
        idempotencyKey: "projection-follow-up",
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        contactId: f.contactId,
        target: {
          kind: "RECEIVABLE_PAYMENT" as const,
          receivableId: created.data.id,
        },
        dueAt: "2026-09-02T12:00:00.000Z",
        channel: "SMS" as const,
        body: "MESSAGE-SENSIBLE-FACTURE-184",
      },
    };
    await processConstructionSharedApiCommand({
      userId: f.ownerId,
      command: followUpCommand,
    });
    await prepareDueConstructionFollowUps({
      now: new Date("2026-09-03T12:00:00.000Z"),
    });

    const owner = await constructionSharedCockpitForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    const field = await constructionSharedCockpitForUser({
      userId: f.fieldWorkerId,
      workspaceId: f.workspaceId,
    });

    expect(owner.workspace.role).toBe("OWNER");
    expect(owner.permissions.financialsVisible).toBe(true);
    expect(JSON.stringify(owner)).toContain("SECRET-184");
    expect(JSON.stringify(owner)).toContain("845000");
    expect(JSON.stringify(owner)).toContain("MESSAGE-SENSIBLE-FACTURE-184");

    const fieldJson = JSON.stringify(field);
    expect(field.workspace.role).toBe("FIELD_WORKER");
    expect(field.permissions.financialsVisible).toBe(false);
    expect(fieldJson).not.toContain("SECRET-184");
    expect(fieldJson).not.toContain("845000");
    expect(fieldJson).not.toContain("invoiceReference");
    expect(fieldJson).not.toContain("outstandingAmountMinor");
    expect(fieldJson).not.toContain("payloadHash");
    expect(fieldJson).not.toContain("MESSAGE-SENSIBLE-FACTURE-184");
    expect(fieldJson).not.toContain("synthetic:secret-invoice");

    await expect(
      processConstructionSharedApiCommand({
        userId: f.fieldWorkerId,
        command: {
          ...followUpCommand,
          requestId: "field-worker-follow-up",
          payload: {
            ...followUpCommand.payload,
            idempotencyKey: "field-worker-follow-up",
          },
        },
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    await expect(
      constructionSharedCockpitForUser({
        userId: f.outsiderId,
        workspaceId: f.workspaceId,
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
