import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { projectProvenanceForUser } from "@/server/construction-operating-assistant-r29/provenance";
import { recordWorkFinished } from "@/server/construction-operating-assistant-r0/open-loops";
import { processHumanEscalationCommand } from "@/server/construction-operating-assistant-r22/human-escalation-cockpit";
import { createConstructionProject, initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";

async function fixture() {
  await prisma.setting.upsert({
    where: { key: "humanWorkUnitResumeEnabled" },
    create: { key: "humanWorkUnitResumeEnabled", value: true },
    update: { value: true },
  });
  const owner = await prisma.user.create({ data: { name: "R29 owner", email: `r29-owner-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const field = await prisma.user.create({ data: { name: "R29 field", email: `r29-field-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const outsider = await prisma.user.create({ data: { name: "R29 outsider", email: `r29-outsider-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R29 Construction" });
  await prisma.constructionWorkspaceMember.create({ data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" } });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: "LAVAL-R29", name: "Rénovation Laval R29" });
  const message = await prisma.constructionMessage.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, direction: "inbound", channel: "portal",
    idempotencyKey: `r29-message-${crypto.randomUUID()}`, sender: `user:${owner.id}`, recipients: ["ENDVERA_LOCAL"],
    originalBody: "Le dosseret est terminé pour 1 200 $.", normalizedBody: "Le dosseret est terminé pour 1 200 $.",
    status: "received", receivedAt: new Date("2026-09-02T05:00:00.000Z"),
  } });
  await prisma.constructionInterpretation.create({ data: {
    workspaceId: workspace.workspaceId, messageId: message.id, intent: "report_work_finished", confidence: 0.91,
    language: "fr-CA", structuredResult: { proposed: true }, interpreterVersion: "r29-deterministic-test",
  } });
  const opened = await recordWorkFinished({
    schemaVersion: 1, commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id,
    actorId: owner.id, sourceMessageId: message.id, commandType: "REPORT_WORK_FINISHED",
    claims: { billingBasis: "CHANGE_ORDER", workDescription: "Dosseret de cuisine", amountMinor: 120_000, currency: "CAD", completion: true, approvalState: "UNKNOWN" },
  });
  const actionMessage = await prisma.constructionMessage.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, direction: "inbound", channel: "portal",
    idempotencyKey: `r29-action-${crypto.randomUUID()}`, sender: `user:${owner.id}`, recipients: ["ENDVERA_LOCAL"],
    originalBody: "Prépare un suivi.", normalizedBody: "Prépare un suivi.", status: "received", receivedAt: new Date("2026-09-02T05:05:00.000Z"),
  } });
  await prisma.constructionAction.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, openLoopId: opened.loopId, sourceMessageId: actionMessage.id,
    type: "follow_up", status: "proposed", riskClass: "medium", approvalRequired: true,
    payload: { localOnly: true }, payloadHash: "b".repeat(64),
  } });
  const escalationCommandId = crypto.randomUUID();
  await processHumanEscalationCommand({ userId: owner.id, command: {
    schemaVersion: 1, action: "PREPARE", commandId: escalationCommandId, requestId: escalationCommandId,
    idempotencyKey: escalationCommandId, workspaceId: workspace.workspaceId, projectId: project.id,
    openLoopId: opened.loopId, expectedStateVersion: opened.decision.stateVersion,
    purpose: "OBTAIN_MISSING_EVIDENCE", evidenceKind: "PHOTO",
    acceptedClientPriceCents: 5_000, acceptedWorkerPayoutCents: 2_500,
    acceptedEstimatedMinutes: 30, acceptedCurrency: "CAD",
  } });
  return { ownerId: owner.id, fieldId: field.id, outsiderId: outsider.id, workspaceId: workspace.workspaceId, projectId: project.id };
}

describe("R29 provenance UX on disposable PostgreSQL", () => {
  it("reconstructs all six truth kinds, survives reconnect and minimizes field projection", async () => {
    const f = await fixture();
    const referenceNow = new Date("2026-09-02T06:00:00.000Z");
    const owner = await projectProvenanceForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId, referenceNow });
    expect(owner.role).toBe("OWNER");
    expect(new Set(owner.entries.map((entry) => entry.kind))).toEqual(new Set(["FACT", "INFERENCE", "DECISION", "ACTION", "HUMAN_RESULT", "VERIFIED_STATE"]));
    expect(owner.externalEffectCount).toBe(0);
    const amount = owner.entries.find((entry) => entry.kind === "FACT" && "field" in entry.details && entry.details.field === "AMOUNT");
    expect(amount && "valueLabel" in amount.details ? amount.details.valueLabel : null).toMatch(/1.*200.*\$/u);
    expect(owner.entries.every((entry) => entry.canonicalRef.entityId.length > 0)).toBe(true);

    await prisma.$disconnect();
    await prisma.$connect();
    const restarted = await projectProvenanceForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId, referenceNow });
    expect(restarted).toEqual(owner);

    const field = await projectProvenanceForUser({ userId: f.fieldId, workspaceId: f.workspaceId, projectId: f.projectId, referenceNow });
    expect(field.role).toBe("FIELD_WORKER");
    const fieldJson = JSON.stringify(field);
    for (const forbidden of ["120000", "valueLabel", "sourceEntityId", "snapshotFingerprint", "acceptedResultFingerprint", "policyVersion", "reasonCodes", "interpreterVersion", "confidenceBand", "localSimulationCount", "payloadHash"]) {
      expect(fieldJson).not.toContain(forbidden);
    }
    await expect(projectProvenanceForUser({ userId: f.outsiderId, workspaceId: f.workspaceId, projectId: f.projectId, referenceNow })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
