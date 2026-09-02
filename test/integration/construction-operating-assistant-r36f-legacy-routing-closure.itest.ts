import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processAuthenticatedPortalCommand } from "@/server/construction-operating-assistant-r36c/orchestrator";

async function fixture() {
  const owner = await prisma.user.create({
    data: {
      name: "R36F owner",
      email: `r36f-owner-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R36F Legacy Closure" });
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
  return { owner, workspaceId: workspace.workspaceId };
}

function envelope(input: {
  userId: string;
  workspaceId: string;
  body: string;
  commandId?: string;
}) {
  return {
    schemaVersion: 1 as const,
    commandId: input.commandId ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    channel: "PORTAL" as const,
    body: input.body,
    occurredAt: "2026-09-02T16:00:00.000Z",
    senderAddress: `user:${input.userId}`,
  };
}

describe("R36F legacy portal routing on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("routes internal portal work through the brain with exact replay", async () => {
    const f = await fixture();
    const command = envelope({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      body: "Rendez-vous avec Marc mardi à 14 h pour Laval.",
    });
    const first = await processAuthenticatedPortalCommand({ userId: f.owner.id, envelope: command });
    const replay = await processAuthenticatedPortalCommand({ userId: f.owner.id, envelope: command });
    expect(first).toMatchObject({
      status: "APPLIED",
      replayed: false,
      routing: { disposition: "INTERNAL_TOOL", readiness: "INTERNAL_READY" },
      externalTransportPerformed: false,
    });
    expect(replay).toMatchObject({
      status: first.status,
      reply: first.reply,
      canonicalEffectId: first.canonicalEffectId,
      replayed: true,
      routing: first.routing,
    });
    expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  });

  it("retains provider-required work truthfully without dispatch", async () => {
    const f = await fixture();
    const command = envelope({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      body: "Recherche la réputation publique de l’entreprise ABC avec des sources.",
    });
    const first = await processAuthenticatedPortalCommand({ userId: f.owner.id, envelope: command });
    const replay = await processAuthenticatedPortalCommand({ userId: f.owner.id, envelope: command });
    expect(first).toMatchObject({
      status: "REFUSED",
      replayed: false,
      routing: {
        disposition: "CANDIDATE_PREPARED",
        readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED",
        externalDispatchPerformed: false,
      },
    });
    expect(first.reply).toContain("Aucune recherche n’a été exécutée");
    expect(replay).toMatchObject({
      reply: first.reply,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      replayed: true,
      routing: first.routing,
    });
    expect(await prisma.constructionConnectorOperation.count({ where: { externalTransportPerformed: true } })).toBe(0);
  });

  it("rejects forged portal identity before creating a routing exchange", async () => {
    const f = await fixture();
    const before = await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } });
    const forged = envelope({
      userId: "someone-else",
      workspaceId: f.workspaceId,
      body: "Qu’est-ce que j’ai demain?",
    });
    await expect(processAuthenticatedPortalCommand({ userId: f.owner.id, envelope: forged }))
      .rejects.toThrow("ASSISTANT_PORTAL_COMMAND_SOURCE_REFUSED");
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } })).toBe(before);
  });
});
