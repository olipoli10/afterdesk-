import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";
import {
  constructionMobileAssistantHistoryForUser,
  processConstructionMobileAssistantRequest,
} from "@/server/construction-operating-assistant-r9/mobile-assistant";

async function fixture() {
  const owner = await prisma.user.create({
    data: { name: "R9 owner", email: `r9-owner-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const admin = await prisma.user.create({
    data: { name: "R9 office", email: `r9-admin-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const field = await prisma.user.create({
    data: { name: "R9 field", email: `r9-field-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const other = await prisma.user.create({
    data: { name: "R9 other", email: `r9-other-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R9 Mobile Assistant" });
  const otherWorkspace = await initializeConstructionWorkspace({ userId: other.id, name: "R9 Other" });
  await prisma.constructionWorkspaceMember.createMany({
    data: [
      { workspaceId: workspace.workspaceId, userId: admin.id, role: "admin", status: "active" },
      { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
    ],
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: "LAVAL-001",
    name: "Rénovation Laval",
  });
  await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    normalizedPhone: "+15555550184",
  });
  return { owner, admin, field, other, workspaceId: workspace.workspaceId, otherWorkspaceId: otherWorkspace.workspaceId };
}

function request(workspaceId: string, message: string, requestId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    requestId,
    workspaceId,
    message,
    occurredAt: "2026-09-01T12:00:00.000Z",
  };
}

describe("Construction Operating Assistant R9 on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("uses the existing core for owner/admin, persists user-scoped history and replays once", async () => {
    const f = await fixture();
    const ownerCommand = request(f.workspaceId, "Qu'est-ce que j'ai demain?");
    const first = await processConstructionMobileAssistantRequest({ userId: f.owner.id, request: ownerCommand });
    const replay = await processConstructionMobileAssistantRequest({ userId: f.owner.id, request: ownerCommand });
    expect(first.status).toBe("ANSWERED");
    expect(first.externalTransportPerformed).toBe(false);
    expect(replay.replayed).toBe(true);

    const adminResult = await processConstructionMobileAssistantRequest({
      userId: f.admin.id,
      request: request(f.workspaceId, "Rendez-vous avec Marc mardi à 14 h pour Laval."),
    });
    expect(adminResult.status).toBe("APPLIED");
    const ambiguous = await processConstructionMobileAssistantRequest({
      userId: f.admin.id,
      request: request(f.workspaceId, "Rendez-vous avec Marc mardi à 2 pour Laval."),
    });
    expect(ambiguous.status).toBe("CLARIFICATION_REQUIRED");

    const ownerHistory = await constructionMobileAssistantHistoryForUser({ userId: f.owner.id, workspaceId: f.workspaceId });
    const adminHistory = await constructionMobileAssistantHistoryForUser({ userId: f.admin.id, workspaceId: f.workspaceId });
    expect(ownerHistory.messages).toHaveLength(2);
    expect(adminHistory.messages).toHaveLength(4);
    expect(ownerHistory.messages.map((item) => item.body).join(" ")).not.toContain("Rendez-vous avec Marc");
    expect(adminHistory.messages.map((item) => item.body).join(" ")).not.toContain("Vous n’avez rien");
    expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  });

  it("prepares one unsent message and refuses field, cross-workspace and forged portal actors", async () => {
    const f = await fixture();
    const commandId = crypto.randomUUID();
    const prepared = await processConstructionMobileAssistantRequest({
      userId: f.owner.id,
      request: request(f.workspaceId, "Texte Marc que je serai 30 minutes en retard.", commandId),
    });
    const replay = await processConstructionMobileAssistantRequest({
      userId: f.owner.id,
      request: request(f.workspaceId, "Texte Marc que je serai 30 minutes en retard.", commandId),
    });
    expect(prepared.status).toBe("PREPARED_UNSENT");
    expect(replay.replayed).toBe(true);
    expect(await prisma.constructionAction.count({ where: { id: prepared.canonicalEffectId ?? "" } })).toBe(1);
    expect(await prisma.constructionConnectorOperation.count({ where: { externalTransportPerformed: true } })).toBe(0);

    await expect(processConstructionMobileAssistantRequest({ userId: f.field.id, request: request(f.workspaceId, "Agenda") })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processConstructionMobileAssistantRequest({ userId: f.other.id, request: request(f.workspaceId, "Agenda") })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processConstructionMobileAssistantRequest({ userId: f.owner.id, request: request(f.otherWorkspaceId, "Agenda") })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processOperatingAssistantCommand({
      userId: f.owner.id,
      envelope: {
        schemaVersion: 1,
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        channel: "PORTAL",
        body: "Agenda",
        occurredAt: "2026-09-01T12:00:00.000Z",
        senderAddress: `user:${f.other.id}`,
      },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
