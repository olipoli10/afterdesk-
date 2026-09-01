import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db";
import { localInboundEnvelopeSchema } from "../src/lib/construction-assistant-v1/messaging";
import { processConstructionMessage, portalIdempotencyKey } from "../src/server/construction-assistant-v1/intake";
import { simulateInboundMessage } from "../src/server/construction-assistant-v1/simulator";
import { approveAndSimulateOutbound } from "../src/server/construction-assistant-v1/outbound";
import { createConstructionContact, createConstructionProject, initializeConstructionWorkspace } from "../src/server/construction-assistant-v1/workspace";
import { R3_MESSAGES, R3_REFERENCE_NOW } from "../src/components/construction-assistant-v1/founder-retest/contract";

async function portal(userId: string, workspaceId: string, body: string) {
  return processConstructionMessage({
    userId,
    workspaceId,
    channel: "portal",
    body,
    idempotencyKey: portalIdempotencyKey({ workspaceId, userId, requestId: randomUUID() }),
    referenceNow: new Date(R3_REFERENCE_NOW),
  });
}

const enabled = process.env.ENDVERA_R3_DISPOSABLE_DB_NAME === "endvera-construction-v1-r3" && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

describe.runIf(enabled)("R3 corrected founder loop on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("runs the exact nine technical steps with one canonical inbound and one local delivery", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "olivier.r3@example.invalid" } });
    const initialized = await initializeConstructionWorkspace({ userId: user.id, name: "ENDVERA Construction — Olivier", timezone: "America/Toronto", locale: "fr-CA" });
    const project = await createConstructionProject({ userId: user.id, workspaceId: initialized.workspaceId, code: "LAVAL-001", name: "Rénovation Laval", address: "Laval, Québec — dossier synthétique" });
    await createConstructionContact({ userId: user.id, workspaceId: initialized.workspaceId, projectId: project.id, displayName: "Marc", role: "Fournisseur", normalizedPhone: "+15555550184", normalizedEmail: "marc@example.invalid" });

    const clear = await portal(user.id, initialized.workspaceId, R3_MESSAGES.clearAppointment);
    const ambiguous = await portal(user.id, initialized.workspaceId, R3_MESSAGES.ambiguousAppointment);
    const tomorrow = await portal(user.id, initialized.workspaceId, R3_MESSAGES.tomorrowQuery);
    expect(clear).toMatchObject({ intent: "CALENDAR_ITEM_CREATE", replayed: false });
    expect(ambiguous).toMatchObject({ intent: "CLARIFICATION_REQUIRED", reply: "Est-ce 2 h ou 14 h?" });
    expect(tomorrow.reply).toContain("14 h");
    expect(await prisma.constructionCalendarItem.count({ where: { workspaceId: initialized.workspaceId } })).toBe(1);

    const providerMessageId = `r3-local-${randomUUID()}`;
    const envelope = localInboundEnvelopeSchema.parse({ schemaVersion: 1, provider: "ENDVERA_LOCAL_SIMULATOR", providerMessageId, channel: "SMS", normalizedSender: `sim-sms:${user.id}`, body: R3_MESSAGES.inbound, receivedAt: R3_REFERENCE_NOW, signatureValid: true, projectHint: "LAVAL-001" });
    const firstInbound = await simulateInboundMessage({ workspaceId: initialized.workspaceId, envelope });
    const duplicate = await simulateInboundMessage({ workspaceId: initialized.workspaceId, envelope });
    expect(firstInbound.admitted && firstInbound.result.replayed).toBe(false);
    expect(duplicate.admitted && duplicate.result.replayed).toBe(true);
    expect(await prisma.constructionMessage.count({ where: { provider: envelope.provider, providerMessageId } })).toBe(1);
    const inbound = await prisma.constructionMessage.findFirstOrThrow({ where: { provider: envelope.provider, providerMessageId }, select: { projectId: true, interpretation: { select: { structuredResult: true } } } });
    expect(inbound.projectId).toBe(project.id);

    const draft = await portal(user.id, initialized.workspaceId, R3_MESSAGES.outbound);
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: draft.actionId! }, select: { id: true, status: true, version: true, payloadHash: true, simulatedDeliveryCount: true } });
    expect(action.status).toBe("proposed");
    expect(action.simulatedDeliveryCount).toBe(0);
    const firstApproval = await approveAndSimulateOutbound({ userId: user.id, workspaceId: initialized.workspaceId, actionId: action.id, expectedVersion: action.version, expectedPayloadHash: action.payloadHash });
    const secondApproval = await approveAndSimulateOutbound({ userId: user.id, workspaceId: initialized.workspaceId, actionId: action.id, expectedVersion: action.version, expectedPayloadHash: action.payloadHash });
    expect(firstApproval).toEqual({ delivered: true, provider: "ENDVERA_LOCAL_SIMULATOR" });
    expect(secondApproval).toEqual({ delivered: false, reason: "REPLAY_REFUSED" });
    expect(await prisma.constructionAction.findUniqueOrThrow({ where: { id: action.id }, select: { simulatedDeliveryCount: true } })).toEqual({ simulatedDeliveryCount: 1 });
    expect(await prisma.constructionMessage.count({ where: { workspaceId: initialized.workspaceId, provider: { not: null, notIn: ["ENDVERA_LOCAL_SIMULATOR"] } } })).toBe(0);
  });
});
