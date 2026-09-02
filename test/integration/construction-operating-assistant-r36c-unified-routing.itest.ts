import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processUnifiedAssistantRequest } from "@/server/construction-operating-assistant-r36c/orchestrator";
import { persistDeferredAssistantExchange } from "@/server/construction-operating-assistant-r36c/deferred-exchange";

async function fixture() {
  const owner = await prisma.user.create({
    data: { name: "R36C owner", email: `r36c-owner-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const field = await prisma.user.create({
    data: { name: "R36C field", email: `r36c-field-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const other = await prisma.user.create({
    data: { name: "R36C other", email: `r36c-other-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R36C Unified" });
  const otherWorkspace = await initializeConstructionWorkspace({ userId: other.id, name: "R36C Other" });
  await prisma.constructionWorkspaceMember.create({
    data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
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
  return { owner, field, other, workspaceId: workspace.workspaceId, otherWorkspaceId: otherWorkspace.workspaceId };
}

function request(workspaceId: string, message: string, requestId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    requestId,
    workspaceId,
    message,
    occurredAt: "2026-09-02T16:00:00.000Z",
  };
}

describe("R36C unified assistant routing on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("delegates internal work and keeps exactly one canonical effect", async () => {
    const f = await fixture();
    const command = request(f.workspaceId, "Rendez-vous avec Marc mardi à 14 h pour Laval.");
    const first = await processUnifiedAssistantRequest({ userId: f.owner.id, channel: "MOBILE_APP", request: command });
    const replay = await processUnifiedAssistantRequest({ userId: f.owner.id, channel: "MOBILE_APP", request: command });
    expect(first).toMatchObject({
      status: "APPLIED",
      routing: { disposition: "INTERNAL_TOOL", readiness: "INTERNAL_READY" },
    });
    expect(replay.replayed).toBe(true);
    expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  });

  it("persists one truthful provider-required exchange and refuses replay drift", async () => {
    const f = await fixture();
    const requestId = crypto.randomUUID();
    const command = request(
      f.workspaceId,
      "Recherche la réputation publique de l'entreprise ABC avec des sources.",
      requestId,
    );
    const first = await processUnifiedAssistantRequest({ userId: f.owner.id, channel: "MOBILE_APP", request: command });
    const replay = await processUnifiedAssistantRequest({ userId: f.owner.id, channel: "MOBILE_APP", request: command });
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
    expect(replay).toMatchObject({ replayed: true, messageId: first.messageId, assistantMessageId: first.assistantMessageId });
    const replayWithChangedProjection = await persistDeferredAssistantExchange({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: command,
      deferred: {
        intent: "UNSUPPORTED",
        status: "REFUSED",
        reply: "Une nouvelle politique ne doit pas réécrire la réponse historique.",
      },
      routing: {
        schemaVersion: 1,
        intentClass: "COMPLEX_REASONING",
        capabilityKey: "CONTROLLER_REASONING",
        disposition: "HUMAN_HANDOFF",
        readiness: "HUMAN_SUPPORT_AVAILABLE",
        citationsRequired: false,
        approvalRequired: false,
        providerExecutionAuthorized: false,
        externalDispatchPerformed: false,
      },
    });
    expect(replayWithChangedProjection).toMatchObject({
      reply: first.reply,
      routing: first.routing,
      replayed: true,
    });
    expect(await prisma.constructionMessage.count({
      where: { workspaceId: f.workspaceId, provider: "ENDVERA_ROUTING_R36C" },
    })).toBe(2);
    expect(await prisma.constructionInterpretation.count({
      where: { workspaceId: f.workspaceId, interpreterVersion: "endvera-unified-assistant-r36c-v1" },
    })).toBe(1);
    await expect(processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: request(f.workspaceId, "Recherche une autre entreprise.", requestId),
    })).rejects.toThrow("ASSISTANT_ROUTING_REPLAY_MISMATCH");
    expect(await prisma.constructionConnectorOperation.count({ where: { externalTransportPerformed: true } })).toBe(0);
  });

  it("refuses field workers and cross-workspace users before persistence", async () => {
    const f = await fixture();
    const command = request(f.workspaceId, "Recherche l'entreprise ABC.");
    await expect(processUnifiedAssistantRequest({ userId: f.field.id, channel: "MOBILE_APP", request: command }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processUnifiedAssistantRequest({ userId: f.other.id, channel: "MOBILE_APP", request: command }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processUnifiedAssistantRequest({
      userId: f.owner.id,
      channel: "MOBILE_APP",
      request: request(f.otherWorkspaceId, "Recherche l'entreprise ABC."),
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(await prisma.constructionMessage.count({
      where: { workspaceId: f.workspaceId, provider: "ENDVERA_ROUTING_R36C" },
    })).toBe(0);
  });
});
