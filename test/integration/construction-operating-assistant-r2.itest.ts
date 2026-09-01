import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";

async function fixture(label: string) {
  const user = await prisma.user.create({
    data: { name: `R2 ${label}`, email: `r2-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: user.id, name: `R2 ${label}` });
  const project = await createConstructionProject({
    userId: user.id,
    workspaceId: workspace.workspaceId,
    code: `R2-${label}`,
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

function command(fixtureData: Awaited<ReturnType<typeof fixture>>, body: string, commandId = crypto.randomUUID(), occurredAt = "2026-08-31T13:00:00.000Z") {
  return processOperatingAssistantCommand({
    userId: fixtureData.userId,
    envelope: {
      schemaVersion: 1,
      commandId,
      workspaceId: fixtureData.workspaceId,
      channel: "PORTAL",
      body,
      occurredAt,
      senderAddress: `user:${fixtureData.userId}`,
    },
  });
}

describe("Construction Operating Assistant R2 on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("persists a low-risk reminder, its answer and one canonical effect across replay", async () => {
    const f = await fixture("reminder");
    const commandId = crypto.randomUUID();
    const first = await command(f, "Rappelle-moi mardi à 9 h d'appeler Marc pour Laval.", commandId);
    const replay = await command(f, "Rappelle-moi mardi à 9 h d'appeler Marc pour Laval.", commandId);
    expect(first.status).toBe("APPLIED");
    expect(first.externalTransportPerformed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.canonicalEffectId).toBe(first.canonicalEffectId);
    expect(await prisma.constructionAction.count({ where: { workspaceId: f.workspaceId, type: "reminder" } })).toBe(1);
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
  });

  it("answers from persisted agenda and safely reschedules by preserving the old row", async () => {
    const f = await fixture("calendar");
    await command(f, "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval calendar.");
    const today = await command(f, "Qu'est-ce que j'ai aujourd'hui?", crypto.randomUUID(), "2026-09-01T12:00:00.000Z");
    expect(today.status).toBe("ANSWERED");
    expect(today.reply).toContain("Rendez-vous avec Marc");
    const moved = await command(f, "Déplace le rendez-vous avec Marc mardi de 14 h à 16 h pour Laval.");
    expect(moved.status).toBe("APPLIED");
    const rows = await prisma.constructionCalendarItem.findMany({
      where: { workspaceId: f.workspaceId },
      orderBy: { createdAt: "asc" },
      select: { status: true, startsAt: true },
    });
    expect(rows.map((row) => row.status)).toEqual(["rescheduled", "scheduled"]);
    expect(rows[1].startsAt.toISOString()).toBe("2026-09-01T20:00:00.000Z");
  });

  it("prepares outbound text without transport and refuses cross-workspace authority", async () => {
    const first = await fixture("outbound-a");
    const second = await fixture("outbound-b");
    const prepared = await command(first, "Texte Marc que je serai 30 minutes en retard.");
    expect(prepared.status).toBe("PREPARED_UNSENT");
    expect(prepared.externalTransportPerformed).toBe(false);
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: prepared.canonicalEffectId ?? "" } });
    expect(action.status).toBe("proposed");
    expect(action.simulatedDeliveryCount).toBe(0);
    await expect(processOperatingAssistantCommand({
      userId: second.userId,
      envelope: {
        schemaVersion: 1,
        commandId: crypto.randomUUID(),
        workspaceId: first.workspaceId,
        channel: "PORTAL",
        body: "Qu'est-ce que j'ai aujourd'hui?",
        occurredAt: "2026-09-01T12:00:00.000Z",
        senderAddress: `user:${second.userId}`,
      },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
