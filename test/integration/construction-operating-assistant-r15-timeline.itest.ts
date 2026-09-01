import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  addInvoiceReadinessEvidence,
  recordWorkFinished,
} from "@/server/construction-operating-assistant-r0/open-loops";
import { processConstructionSharedApiCommand } from "@/server/construction-operating-assistant-r7/gateway";
import { projectTimelineForUser } from "@/server/construction-operating-assistant-r15/timeline";
import { prepareDueConstructionFollowUps } from "@/server/construction-operating-assistant-r6/receivables";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

async function setup() {
  const owner = await prisma.user.create({
    data: {
      name: "R15 owner",
      email: `r15-owner-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: "R15 field",
      email: `r15-field-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: "R15 outsider",
      email: `r15-outsider-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: "R15 Construction",
  });
  await prisma.constructionWorkspaceMember.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId: field.id,
      role: "member",
      status: "active",
    },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: "LAVAL-R15",
    name: "Rénovation Laval R15",
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    role: "Fournisseur synthétique",
    normalizedPhone: "+15555550184",
  });
  await processConstructionMessage({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    channel: "portal",
    body: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval R15.",
    idempotencyKey: `r15-calendar-${crypto.randomUUID()}`,
    referenceNow: new Date("2026-08-31T13:00:00.000Z"),
  });
  const source = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: `r15-work-${crypto.randomUUID()}`,
      sender: `user:${owner.id}`,
      recipients: ["ENDVERA_LOCAL"],
      originalBody: "Le dosseret est terminé.",
      normalizedBody: "Le dosseret est terminé.",
      status: "received",
      receivedAt: new Date("2026-09-01T13:05:00.000Z"),
    },
  });
  const loop = await recordWorkFinished({
    schemaVersion: 1,
    commandId: `r15-loop-${crypto.randomUUID()}`,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    actorId: owner.id,
    sourceMessageId: source.id,
    commandType: "REPORT_WORK_FINISHED",
    claims: {
      billingBasis: "CHANGE_ORDER",
      workDescription: "Dosseret de cuisine",
      amountMinor: 120_000,
      currency: "CAD",
      completion: true,
      approvalState: "UNKNOWN",
    },
  });
  await addInvoiceReadinessEvidence({
    schemaVersion: 1,
    eventId: `r15-evidence-${crypto.randomUUID()}`,
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    loopId: loop.loopId,
    expectedStateVersion: loop.decision.stateVersion,
    kind: "PHOTO",
    state: "PRESENT_UNVERIFIED",
    sourceRef: "synthetic:r15-photo",
    contentHash: "a".repeat(64),
  });
  const receivable = await processConstructionSharedApiCommand({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      requestId: `r15-receivable-${crypto.randomUUID()}`,
      type: "RECORD_RECEIVABLE",
      payload: {
        idempotencyKey: `r15-invoice-${crypto.randomUUID()}`,
        workspaceId: workspace.workspaceId,
        projectId: project.id,
        contactId: contact.id,
        invoiceReference: "SECRET-R15-184",
        amountMinor: 845_000,
        currency: "CAD",
        issuedAt: "2026-08-20T12:00:00.000Z",
        dueAt: "2026-08-31T12:00:00.000Z",
        sourceRef: "synthetic:r15-invoice",
      },
    },
  });
  if (receivable.resultType !== "RECEIVABLE_RECORDED") throw new Error("unreachable");
  await processConstructionSharedApiCommand({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      requestId: `r15-followup-${crypto.randomUUID()}`,
      type: "SCHEDULE_FOLLOW_UP",
      payload: {
        idempotencyKey: `r15-followup-${crypto.randomUUID()}`,
        workspaceId: workspace.workspaceId,
        projectId: project.id,
        contactId: contact.id,
        target: { kind: "RECEIVABLE_PAYMENT", receivableId: receivable.data.id },
        dueAt: "2026-09-01T13:30:00.000Z",
        channel: "SMS",
        body: "Message financier sensible R15",
      },
    },
  });
  await prepareDueConstructionFollowUps({ now: new Date("2026-09-01T14:00:00.000Z") });
  return {
    ownerId: owner.id,
    fieldId: field.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
  };
}

describe("Construction Operating Assistant R15 timeline on disposable PostgreSQL", () => {
  it("reconstructs one deterministic role-safe project history after a fresh query", async () => {
    const fixture = await setup();
    const referenceNow = new Date("2026-09-01T14:00:00.000Z");
    const owner = await projectTimelineForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      referenceNow,
    });
    expect(owner.role).toBe("OWNER");
    expect(owner.localDate).toBe("2026-09-01");
    expect(new Set(owner.events.map((event) => event.kind))).toEqual(
      new Set(["CALENDAR", "OPEN_LOOP", "EVIDENCE", "ACTION", "RECEIVABLE"]),
    );
    expect(owner.brief).toMatchObject({
      appointmentsToday: 1,
      openLoops: 1,
      evidencePendingVerification: 1,
      preparedActions: 1,
      openReceivables: 1,
      outstandingAmountMinor: 845_000,
      nextDecision: "OPEN_LOOP_ACTION",
    });
    expect(JSON.stringify(owner)).toContain("SECRET-R15-184");

    const afterFreshQuery = await projectTimelineForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      referenceNow,
    });
    expect(afterFreshQuery).toEqual(owner);

    const field = await projectTimelineForUser({
      userId: fixture.fieldId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      referenceNow,
    });
    const fieldJson = JSON.stringify(field);
    expect(field.role).toBe("FIELD_WORKER");
    expect(field.events.some((event) => event.kind === "RECEIVABLE")).toBe(false);
    expect(fieldJson).not.toContain("SECRET-R15-184");
    expect(fieldJson).not.toContain("845000");
    expect(fieldJson).not.toContain("outstandingAmountMinor");
    expect(fieldJson).not.toContain("financial");
    expect(fieldJson).not.toContain("Message financier sensible R15");
    expect(fieldJson).not.toContain("sourceRef");

    await expect(projectTimelineForUser({
      userId: fixture.outsiderId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      referenceNow,
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
