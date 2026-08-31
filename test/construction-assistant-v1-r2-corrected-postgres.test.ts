import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db";
import { localInboundEnvelopeSchema } from "../src/lib/construction-assistant-v1/messaging";
import { processConstructionMessage, portalIdempotencyKey } from "../src/server/construction-assistant-v1/intake";
import { simulateInboundMessage } from "../src/server/construction-assistant-v1/simulator";
import { approveAndSimulateOutbound } from "../src/server/construction-assistant-v1/outbound";

async function portal(userId: string, workspaceId: string, body: string, referenceNow: Date) {
  return processConstructionMessage({
    userId,
    workspaceId,
    channel: "portal",
    body,
    idempotencyKey: portalIdempotencyKey({ workspaceId, userId, requestId: randomUUID() }),
    referenceNow,
  });
}

describe.runIf(process.env.DATABASE_URL?.includes("localhost:51282/template1"))("corrected founder loop on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("closes the five reproduced technical defects without external transport", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "olivier.r2@example.invalid" } });
    const workspace = await prisma.constructionWorkspace.findFirstOrThrow({ where: { ownerUserId: user.id }, select: { id: true } });
    const referenceNow = new Date("2026-08-31T13:00:00.000Z");
    const beforeCalendar = await prisma.constructionCalendarItem.count({ where: { workspaceId: workspace.id } });
    const clear = await portal(user.id, workspace.id, "Rendez-vous avec Marc mardi à 14 h pour Laval.", referenceNow);
    const ambiguous = await portal(user.id, workspace.id, "Rendez-vous avec Marc mardi à 2 pour Laval.", referenceNow);
    const tomorrow = await portal(user.id, workspace.id, "Qu’est-ce que j’ai demain?", referenceNow);
    const afterCalendar = await prisma.constructionCalendarItem.count({ where: { workspaceId: workspace.id } });

    expect(clear.intent).toBe("CALENDAR_ITEM_CREATE");
    expect(ambiguous).toMatchObject({ intent: "CLARIFICATION_REQUIRED", reply: "Est-ce 2 h ou 14 h?" });
    expect(tomorrow.intent).toBe("CALENDAR_QUERY");
    expect(tomorrow.reply).toContain("Rendez-vous avec Marc");
    expect(afterCalendar - beforeCalendar).toBe(1);

    const providerMessageId = `r2-corrected-${randomUUID()}`;
    const envelope = localInboundEnvelopeSchema.parse({
      schemaVersion: 1,
      provider: "ENDVERA_LOCAL_SIMULATOR",
      providerMessageId,
      channel: "SMS",
      normalizedSender: `sim-sms:${user.id}`,
      body: "Le matériel de Laval est prêt pour mardi.",
      receivedAt: referenceNow.toISOString(),
      signatureValid: true,
    });
    const firstInbound = await simulateInboundMessage({ workspaceId: workspace.id, envelope });
    const replayInbound = await simulateInboundMessage({ workspaceId: workspace.id, envelope });
    expect(firstInbound.admitted && firstInbound.result.replayed).toBe(false);
    expect(replayInbound.admitted && replayInbound.result.replayed).toBe(true);
    expect(await prisma.constructionMessage.count({ where: { provider: envelope.provider, providerMessageId } })).toBe(1);

    const draft = await portal(user.id, workspace.id, "Texte Marc que je serai 30 minutes en retard.", referenceNow);
    expect(draft.intent).toBe("OUTBOUND_MESSAGE_DRAFT");
    expect(draft.actionId).toBeTruthy();
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: draft.actionId! }, select: { version: true, payloadHash: true } });
    const firstApproval = await approveAndSimulateOutbound({ userId: user.id, workspaceId: workspace.id, actionId: draft.actionId!, expectedVersion: action.version, expectedPayloadHash: action.payloadHash });
    const replayApproval = await approveAndSimulateOutbound({ userId: user.id, workspaceId: workspace.id, actionId: draft.actionId!, expectedVersion: action.version, expectedPayloadHash: action.payloadHash });
    expect(firstApproval.delivered).toBe(true);
    expect(replayApproval).toEqual({ delivered: false, reason: "REPLAY_REFUSED" });
  });
});
