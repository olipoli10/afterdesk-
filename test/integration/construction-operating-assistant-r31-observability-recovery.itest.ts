import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  processReliabilityCommand,
  reliabilityCockpitForUser,
} from "@/server/construction-operating-assistant-r31/reliability";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const referenceNow = new Date("2026-09-02T12:00:00.000Z");

async function fixture(label: string) {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { name: `R31 owner ${label}`, email: `r31-owner-${suffix}@example.invalid`, role: "CLIENT" } });
  const field = await prisma.user.create({ data: { name: `R31 field ${label}`, email: `r31-field-${suffix}@example.invalid`, role: "CLIENT" } });
  const outsider = await prisma.user.create({ data: { name: `R31 outsider ${label}`, email: `r31-outsider-${suffix}@example.invalid`, role: "CLIENT" } });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R31 ${label}` });
  await prisma.constructionWorkspaceMember.create({ data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" } });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: `R31-${label}`, name: `R31 ${label}` });
  const contact = await prisma.constructionContact.create({ data: { workspaceId: workspace.workspaceId, projectId: project.id, displayName: "Marc", role: "Fournisseur" } });
  const message = await prisma.constructionMessage.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, contactId: contact.id,
    direction: "inbound", channel: "portal", idempotencyKey: crypto.randomUUID(),
    recipients: ["ENDVERA_LOCAL"], sender: `user:${owner.id}`,
    originalBody: "Rendez-vous synthétique.", normalizedBody: "Rendez-vous synthétique.", status: "received",
  } });
  const calendar = await prisma.constructionCalendarItem.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, contactId: contact.id,
    sourceMessageId: message.id, type: "meeting", title: "Suivi local", startsAt: referenceNow,
    timezone: "America/Toronto", confidence: 1, verificationState: "verified",
  } });
  const body = "Confirmer le prochain rendez-vous local.";
  const followUp = await prisma.constructionFollowUp.create({ data: {
    workspaceId: workspace.workspaceId, projectId: project.id, contactId: contact.id,
    calendarItemId: calendar.id, kind: "calendar_confirmation", status: "scheduled",
    dueAt: new Date(referenceNow.getTime() - 3_600_000), channel: "SMS", body,
    bodyHash: sha256Canonical(body), idempotencyKey: crypto.randomUUID(), requestedById: owner.id,
    ownerKind: "member", ownerId: owner.id, nextDecision: "Confirmer le rendez-vous.",
    policy: { schemaVersion: 1, synthetic: true }, policyHash: sha256Canonical({ schemaVersion: 1, synthetic: true }),
  } });
  const account = await prisma.constructionConnectorAccount.create({ data: {
    workspaceId: workspace.workspaceId, provider: "google_calendar", status: "prepared", createdByUserId: owner.id,
  } });
  const request = { schemaVersion: 1, operation: "UPSERT_EVENT", synthetic: true };
  const connector = await prisma.constructionConnectorOperation.create({ data: {
    workspaceId: workspace.workspaceId, connectorAccountId: account.id, kind: "calendar_insert", status: "prepared",
    idempotencyKey: crypto.randomUUID(), request, requestHash: sha256Canonical(request), createdByUserId: owner.id,
    preparedAt: new Date(referenceNow.getTime() - 48 * 3_600_000), externalTransportPerformed: false,
  } });
  return { ownerId: owner.id, fieldId: field.id, outsiderId: outsider.id, workspaceId: workspace.workspaceId, followUpId: followUp.id, connectorId: connector.id };
}

async function scan(ownerId: string, workspaceId: string, commandId = crypto.randomUUID()) {
  return processReliabilityCommand({ userId: ownerId, command: { schemaVersion: 1, action: "SCAN_WORKSPACE", commandId, workspaceId }, referenceNow });
}

describe("R31 observability and recovery on disposable PostgreSQL", () => {
  it("opens one alert per stale queue item, exactly replays the scan and isolates role projections", async () => {
    const f = await fixture("SCAN");
    const commandId = crypto.randomUUID();
    const first = await scan(f.ownerId, f.workspaceId, commandId);
    const replay = await scan(f.ownerId, f.workspaceId, commandId);
    expect(first).toMatchObject({ resultType: "SCAN", findingCount: 2, openedAlertCount: 2, replayed: false, externalEffectCount: 0 });
    expect(replay).toMatchObject({ resultType: "SCAN", findingCount: 2, openedAlertCount: 2, replayed: true });
    await expect(processReliabilityCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "ACKNOWLEDGE_ALERT", commandId, workspaceId: f.workspaceId, alertId: "altered", expectedAlertVersion: 1, reasonCode: "OWNER_REVIEWED" }, referenceNow })).rejects.toThrow("RELIABILITY_COMMAND_IDEMPOTENCY_CONFLICT");
    expect(await prisma.constructionReliabilityAlert.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
    expect(await prisma.constructionReliabilitySignal.count({ where: { workspaceId: f.workspaceId, kind: "QUEUE_STALE" } })).toBe(2);

    const owner = await reliabilityCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId, referenceNow });
    const field = await reliabilityCockpitForUser({ userId: f.fieldId, workspaceId: f.workspaceId, referenceNow });
    expect(owner.role).toBe("OWNER");
    expect(field.role).toBe("FIELD_WORKER");
    for (const forbidden of ["resourceId", "queueKind", "beforeFingerprint", "requestHash", "credentialRef", "amountMinor"]) expect(JSON.stringify(field)).not.toContain(forbidden);
    await expect(reliabilityCockpitForUser({ userId: f.outsiderId, workspaceId: f.workspaceId, referenceNow })).rejects.toThrow();
    await prisma.$disconnect();
    await prisma.$connect();
    expect(await reliabilityCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId, referenceNow })).toEqual(owner);
  });

  it("applies the exact R20 local handler once and quarantines uncertain connector work", async () => {
    const f = await fixture("RECOVER");
    await scan(f.ownerId, f.workspaceId);
    const cockpit = await reliabilityCockpitForUser({ userId: f.ownerId, workspaceId: f.workspaceId, referenceNow });
    if (cockpit.role === "FIELD_WORKER") throw new Error("R31_OWNER_REQUIRED");
    const followAlert = cockpit.alerts.find((alert) => alert.resourceType === "FOLLOW_UP")!;
    const connectorAlert = cockpit.alerts.find((alert) => alert.resourceType === "CONNECTOR_OPERATION")!;
    const prepared = await processReliabilityCommand({ userId: f.ownerId, command: {
      schemaVersion: 1, action: "PREPARE_RECOVERY", commandId: crypto.randomUUID(), workspaceId: f.workspaceId,
      alertId: followAlert.id, expectedAlertVersion: followAlert.stateVersion, queueKind: "FOLLOW_UP_DUE",
      itemId: f.followUpId, expectedItemVersion: 1, recoveryAction: "REQUEUE_LOCAL",
    }, referenceNow });
    if (prepared.resultType !== "RECOVERY") throw new Error("R31_RECOVERY_REQUIRED");
    const applyCommand = { schemaVersion: 1 as const, action: "APPLY_RECOVERY" as const, commandId: crypto.randomUUID(), workspaceId: f.workspaceId, recoveryOperationId: prepared.recoveryOperationId, expectedRecoveryVersion: prepared.stateVersion };
    const applied = await processReliabilityCommand({ userId: f.ownerId, command: applyCommand, referenceNow });
    const replay = await processReliabilityCommand({ userId: f.ownerId, command: applyCommand, referenceNow });
    expect(applied).toMatchObject({ resultType: "RECOVERY", status: "APPLIED", replayClass: "LOCAL_REPLAY_SAFE", externalEffectCount: 0 });
    expect(replay).toMatchObject({ resultType: "RECOVERY", status: "APPLIED", replayed: true });
    expect(await prisma.constructionFollowUpAttempt.count({ where: { followUpId: f.followUpId } })).toBe(1);

    const quarantinePrepared = await processReliabilityCommand({ userId: f.ownerId, command: {
      schemaVersion: 1, action: "PREPARE_RECOVERY", commandId: crypto.randomUUID(), workspaceId: f.workspaceId,
      alertId: connectorAlert.id, expectedAlertVersion: connectorAlert.stateVersion, queueKind: "CONNECTOR_PREPARED",
      itemId: f.connectorId, expectedItemVersion: 1, recoveryAction: "QUARANTINE",
    }, referenceNow });
    if (quarantinePrepared.resultType !== "RECOVERY") throw new Error("R31_RECOVERY_REQUIRED");
    const quarantined = await processReliabilityCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "APPLY_RECOVERY", commandId: crypto.randomUUID(), workspaceId: f.workspaceId, recoveryOperationId: quarantinePrepared.recoveryOperationId, expectedRecoveryVersion: quarantinePrepared.stateVersion }, referenceNow });
    expect(quarantined).toMatchObject({ resultType: "RECOVERY", status: "QUARANTINED", replayClass: "EXTERNAL_EFFECT_UNCERTAIN", externalEffectCount: 0 });
    expect(await prisma.constructionConnectorOperation.findUniqueOrThrow({ where: { id: f.connectorId }, select: { status: true, externalTransportPerformed: true } })).toEqual({ status: "prepared", externalTransportPerformed: false });
  });

  it("records minimized checkpoints, guarded restore evidence and bounded synthetic gates", async () => {
    const f = await fixture("CHECKPOINT");
    await scan(f.ownerId, f.workspaceId);
    const checkpoint = await processReliabilityCommand({ userId: f.ownerId, command: { schemaVersion: 1, action: "CREATE_CHECKPOINT", commandId: crypto.randomUUID(), workspaceId: f.workspaceId, checkpointKey: crypto.randomUUID() }, referenceNow });
    if (checkpoint.resultType !== "CHECKPOINT") throw new Error("R31_CHECKPOINT_REQUIRED");
    const drill = await processReliabilityCommand({ userId: f.ownerId, command: {
      schemaVersion: 1, action: "RECORD_RESTORE_DRILL", commandId: crypto.randomUUID(), workspaceId: f.workspaceId,
      checkpointId: checkpoint.checkpointId, drillKey: crypto.randomUUID(), sourceDatabaseLabel: "endvera-r31-source-disposable",
      targetDatabaseLabel: "endvera-r31-restored-disposable", sourceFingerprint: checkpoint.manifestFingerprint,
      restoredFingerprint: checkpoint.manifestFingerprint, schemaMatch: true, countsMatch: true, reasonCodes: [],
      startedAt: new Date(referenceNow.getTime() - 5_000).toISOString(), completedAt: referenceNow.toISOString(),
    }, referenceNow });
    expect(drill).toMatchObject({ resultType: "RESTORE_DRILL", status: "PASSED", externalEffectCount: 0 });
    const gate = await processReliabilityCommand({ userId: f.ownerId, command: {
      schemaVersion: 1, action: "RECORD_GATE_RUN", commandId: crypto.randomUUID(), workspaceId: f.workspaceId,
      gateKey: crypto.randomUUID(), gateKind: "SIGNAL_CONCURRENCY", operationCount: 500, concurrency: 20,
      canonicalEffectCount: 500, duplicateCount: 0, durationMs: 1000, p50LatencyMs: 2, p95LatencyMs: 4,
      thresholdMs: 50, status: "PASSED", resultFingerprint: sha256Canonical({ operationCount: 500, concurrency: 20, p95LatencyMs: 4 }),
    }, referenceNow });
    expect(gate).toMatchObject({ resultType: "GATE_RUN", status: "PASSED", evidenceLabel: "SYNTHETIC", externalEffectCount: 0 });
    await expect(processReliabilityCommand({ userId: f.ownerId, command: {
      schemaVersion: 1, action: "RECORD_RESTORE_DRILL", commandId: crypto.randomUUID(), workspaceId: f.workspaceId,
      checkpointId: checkpoint.checkpointId, drillKey: crypto.randomUUID(), sourceDatabaseLabel: "shared-production",
      targetDatabaseLabel: "endvera-r31-restored-disposable", sourceFingerprint: checkpoint.manifestFingerprint,
      restoredFingerprint: checkpoint.manifestFingerprint, schemaMatch: true, countsMatch: true, reasonCodes: [],
      startedAt: new Date(referenceNow.getTime() - 5_000).toISOString(), completedAt: referenceNow.toISOString(),
    }, referenceNow })).rejects.toThrow("RECOVERY_DATABASE_LABEL_REFUSED");
  });
});
