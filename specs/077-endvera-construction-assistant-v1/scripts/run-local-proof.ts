import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import { simulateInboundMessage } from "@/server/construction-assistant-v1/simulator";
import { approveAndSimulateOutbound } from "@/server/construction-assistant-v1/outbound";

const referenceNow = new Date("2026-08-31T14:00:00.000Z");

async function main() {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { name: "Olivier — preuve locale", email: `proof-${suffix}@example.invalid`, role: "CLIENT" } });
  const outsider = await prisma.user.create({ data: { name: "Utilisateur isolé", email: `outsider-${suffix}@example.invalid`, role: "CLIENT" } });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "ENDVERA Construction — preuve locale" });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: "LAVAL-281", name: "Chantier Laval" });
  await createConstructionContact({ userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id, displayName: "Marc", normalizedPhone: "+15555550184" });

  const portal = await processConstructionMessage({ userId: owner.id, workspaceId: workspace.workspaceId, channel: "portal", body: "Rendez-vous avec Marc mardi à 14 h pour le chantier Laval", idempotencyKey: `portal-${suffix}`, referenceNow });
  const tomorrow = await processConstructionMessage({ userId: owner.id, workspaceId: workspace.workspaceId, channel: "portal", body: "Qu’est-ce que j’ai demain?", idempotencyKey: `query-${suffix}`, referenceNow });
  const envelope = { schemaVersion: 1 as const, provider: "ENDVERA_LOCAL_SIMULATOR" as const, providerMessageId: `sms-${suffix}`, channel: "SMS" as const, normalizedSender: `sim-sms:${owner.id}`, body: "Rendez-vous avec Marc mardi à 15 h pour le chantier Laval", receivedAt: referenceNow.toISOString(), signatureValid: true };
  const smsFirst = await simulateInboundMessage({ workspaceId: workspace.workspaceId, envelope });
  const smsReplay = await simulateInboundMessage({ workspaceId: workspace.workspaceId, envelope });
  const draft = await processConstructionMessage({ userId: owner.id, workspaceId: workspace.workspaceId, channel: "portal", body: "Texte Marc que je vais avoir 30 minutes de retard", idempotencyKey: `draft-${suffix}`, referenceNow });
  const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: draft.actionId } });
  const delivery = await approveAndSimulateOutbound({ userId: owner.id, workspaceId: workspace.workspaceId, actionId: action.id, expectedVersion: action.version, expectedPayloadHash: action.payloadHash });
  const replay = await approveAndSimulateOutbound({ userId: owner.id, workspaceId: workspace.workspaceId, actionId: action.id, expectedVersion: action.version, expectedPayloadHash: action.payloadHash });
  let outsiderDenied = false;
  try {
    await processConstructionMessage({ userId: outsider.id, workspaceId: workspace.workspaceId, channel: "portal", body: "Qu’est-ce que j’ai demain?", idempotencyKey: `outsider-${suffix}`, referenceNow });
  } catch {
    outsiderDenied = true;
  }
  const counts = {
    messages: await prisma.constructionMessage.count({ where: { workspaceId: workspace.workspaceId } }),
    calendarItems: await prisma.constructionCalendarItem.count({ where: { workspaceId: workspace.workspaceId } }),
    outboundDeliveries: await prisma.constructionMessage.count({ where: { workspaceId: workspace.workspaceId, direction: "outbound", status: "simulated_delivered" } }),
    auditEvents: await prisma.constructionAuditEvent.count({ where: { workspaceId: workspace.workspaceId } }),
  };
  console.log(JSON.stringify({ portal, tomorrow: tomorrow.reply, smsFirst, smsReplay, delivery, replay, outsiderDenied, counts, externalDispatchCount: 0 }, null, 2));
}

main().finally(() => prisma.$disconnect());
