import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import { tomorrowAnswer } from "@/server/construction-assistant-v1/queries";
import { approveAndSimulateOutbound } from "@/server/construction-assistant-v1/outbound";

async function fixture(label: string) {
  const user = await prisma.user.create({
    data: { name: `Olivier ${label}`, email: `${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: user.id, name: `Construction ${label}` });
  const project = await createConstructionProject({
    userId: user.id,
    workspaceId: workspace.workspaceId,
    code: `LAV-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  const contact = await createConstructionContact({
    userId: user.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    normalizedPhone: "+15555550184",
  });
  return { userId: user.id, workspaceId: workspace.workspaceId, projectId: project.id, contactId: contact.id };
}

describe("Construction Assistant V1 on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("commits inbox, interpretation, calendar decision and audit atomically", async () => {
    const f = await fixture("atomic");
    const result = await processConstructionMessage({
      userId: f.userId,
      workspaceId: f.workspaceId,
      channel: "portal",
      body: "Rendez-vous avec Marc pour Rénovation Laval atomic mardi à 14 h",
      idempotencyKey: "atomic-calendar-1",
      referenceNow: new Date("2026-08-31T14:00:00.000Z"),
    });
    expect(result.intent).toBe("CALENDAR_ITEM_CREATE");
    const [messages, interpretations, items, audit] = await Promise.all([
      prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionInterpretation.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } }),
      prisma.constructionAuditEvent.count({ where: { workspaceId: f.workspaceId } }),
    ]);
    expect({ messages, interpretations, items }).toEqual({ messages: 1, interpretations: 1, items: 1 });
    expect(audit).toBeGreaterThanOrEqual(5);
  });

  it("converges concurrent duplicate delivery to one canonical application", async () => {
    const f = await fixture("race");
    const input = {
      userId: f.userId,
      workspaceId: f.workspaceId,
      channel: "sms" as const,
      body: "Rendez-vous avec Marc pour Rénovation Laval race mardi à 14 h",
      idempotencyKey: "same-provider-event",
      referenceNow: new Date("2026-08-31T14:00:00.000Z"),
    };
    const results = await Promise.all([processConstructionMessage(input), processConstructionMessage(input)]);
    expect(results.filter((row) => row.replayed)).toHaveLength(1);
    expect(results[0].intent).toBe(results[1].intent);
    expect(results[0].reply).toBe(results[1].reply);
    expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  });

  it("answers tomorrow from canonical persisted state after a fresh query", async () => {
    const f = await fixture("restart");
    await processConstructionMessage({
      userId: f.userId,
      workspaceId: f.workspaceId,
      channel: "portal",
      body: "Rendez-vous avec Marc pour Rénovation Laval restart mardi à 14 h",
      idempotencyKey: "restart-calendar",
      referenceNow: new Date("2026-08-31T14:00:00.000Z"),
    });
    const answer = await tomorrowAnswer({ userId: f.userId, workspaceId: f.workspaceId, referenceNow: new Date("2026-08-31T20:00:00.000Z") });
    expect(answer?.items).toHaveLength(1);
    expect(answer?.items[0].title).toBe("Rendez-vous avec Marc");
  });

  it("hides a workspace from an unrelated client", async () => {
    const first = await fixture("tenant-a");
    const second = await fixture("tenant-b");
    await expect(processConstructionMessage({
      userId: second.userId,
      workspaceId: first.workspaceId,
      channel: "portal",
      body: "Qu'est-ce que j'ai demain?",
      idempotencyKey: "cross-tenant",
      referenceNow: new Date("2026-08-31T14:00:00.000Z"),
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(await prisma.constructionMessage.count({ where: { workspaceId: first.workspaceId, idempotencyKey: "cross-tenant" } })).toBe(0);
  });

  it("requires the exact action version and simulates delivery only once", async () => {
    const f = await fixture("approval");
    const proposed = await processConstructionMessage({
      userId: f.userId,
      workspaceId: f.workspaceId,
      channel: "portal",
      body: "Texte Marc que je serai 30 minutes en retard",
      idempotencyKey: "outbound-command",
      referenceNow: new Date("2026-08-31T14:00:00.000Z"),
    });
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: proposed.actionId } });
    const stale = await approveAndSimulateOutbound({ userId: f.userId, workspaceId: f.workspaceId, actionId: action.id, expectedVersion: 2, expectedPayloadHash: action.payloadHash });
    expect(stale.delivered).toBe(false);
    const delivered = await approveAndSimulateOutbound({ userId: f.userId, workspaceId: f.workspaceId, actionId: action.id, expectedVersion: 1, expectedPayloadHash: action.payloadHash });
    expect(delivered.delivered).toBe(true);
    const replay = await approveAndSimulateOutbound({ userId: f.userId, workspaceId: f.workspaceId, actionId: action.id, expectedVersion: 1, expectedPayloadHash: action.payloadHash });
    expect(replay).toEqual({ delivered: false, reason: "REPLAY_REFUSED" });
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId, direction: "outbound" } })).toBe(1);
  });
});
