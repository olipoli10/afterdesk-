import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  RELIABILITY_REGISTRY_VERSION,
  reliabilityCockpitSchema,
  reliabilityCommandResultSchema,
  reliabilityCommandSchema,
  reliabilitySignalInputSchema,
  type ReliabilityCockpit,
  type ReliabilityCommand,
  type ReliabilityCommandResult,
  type ReliabilitySignalInput,
} from "@/lib/construction-operating-assistant-r31/contracts";
import {
  deriveReliabilityHealth,
  rejectFieldReliabilityLeaks,
  reliabilitySignalFingerprint,
} from "@/lib/construction-operating-assistant-r31/policy";
import { assertDisposableLocalDatabaseLabel } from "@/lib/construction-operating-assistant-r31/recovery";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";
import { buildRecoveryManifest, fingerprintRecoveryManifest } from "./checkpoints";
import {
  RELIABILITY_QUEUE_REGISTRY_VERSION,
  applyRegisteredLocalRecovery,
  inspectReliabilityQueueItem,
} from "./queue-registry";

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const CONNECTOR_STALE_MS = 24 * 60 * 60 * 1000;
const SERIALIZABLE_RETRY_LIMIT = 8;

async function withTransactionRetry<T>(
  operation: (tx: PrismaTypes.TransactionClient) => Promise<T>,
  isolationLevel?: Prisma.TransactionIsolationLevel,
) {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return isolationLevel
        ? await prisma.$transaction(operation, { isolationLevel })
        : await prisma.$transaction(operation);
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("RELIABILITY_SERIALIZABLE_RETRY_EXHAUSTED");
}

async function lock(tx: PrismaTypes.TransactionClient, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r31:${key}`}, 0))::text AS acquired
  `);
}

async function requireManager(tx: PrismaTypes.TransactionClient, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") throw new Error("RELIABILITY_OWNER_REQUIRED");
  return membership.role === "owner" ? "OWNER" as const : "OFFICE_MANAGER" as const;
}

async function replayCommand(
  tx: PrismaTypes.TransactionClient,
  command: ReliabilityCommand,
  commandHash: string,
): Promise<ReliabilityCommandResult | null> {
  const existing = await tx.constructionReliabilityCommand.findUnique({
    where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
    select: { commandHash: true, result: true, resultFingerprint: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) throw new Error("RELIABILITY_COMMAND_IDEMPOTENCY_CONFLICT");
  const result = reliabilityCommandResultSchema.parse(existing.result);
  if (sha256Canonical(result) !== existing.resultFingerprint) throw new Error("RELIABILITY_COMMAND_RESULT_CORRUPT");
  return reliabilityCommandResultSchema.parse({ ...result, replayed: true });
}

async function persistCommand(
  tx: PrismaTypes.TransactionClient,
  actorId: string,
  command: ReliabilityCommand,
  commandHash: string,
  result: ReliabilityCommandResult,
) {
  await tx.constructionReliabilityCommand.create({ data: {
    workspaceId: command.workspaceId,
    commandId: command.commandId,
    commandHash,
    action: command.action,
    result: asJson(result),
    resultFingerprint: sha256Canonical(result),
    actorId,
  } });
  return result;
}

async function recordSignalTx(tx: PrismaTypes.TransactionClient, raw: ReliabilitySignalInput) {
  const signal = reliabilitySignalInputSchema.parse(raw);
  const fingerprint = reliabilitySignalFingerprint(signal);
  await lock(tx, `signal:${signal.workspaceId}:${signal.signalKey}`);
  const existing = await tx.constructionReliabilitySignal.findUnique({
    where: { workspaceId_signalKey: { workspaceId: signal.workspaceId, signalKey: signal.signalKey } },
  });
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new Error("RELIABILITY_SIGNAL_IDEMPOTENCY_CONFLICT");
    return { row: existing, created: false };
  }
  const row = await tx.constructionReliabilitySignal.create({ data: {
    workspaceId: signal.workspaceId,
    signalKey: signal.signalKey,
    fingerprint,
    kind: signal.kind,
    severity: signal.severity,
    outcomeCode: signal.outcomeCode,
    traceId: signal.traceId,
    spanId: signal.spanId,
    parentSpanId: signal.parentSpanId,
    sourceModule: signal.sourceModule,
    resourceType: signal.resourceType,
    resourceId: signal.resourceId,
    resourceVersion: signal.resourceVersion,
    durationMs: signal.durationMs,
    dimensions: asJson(signal.dimensions),
    observedAt: new Date(signal.observedAt),
  } });
  return { row, created: true };
}

export async function recordReliabilitySignal(input: { userId: string; signal: unknown }) {
  const signal = reliabilitySignalInputSchema.parse(input.signal);
  return withTransactionRetry(async (tx) => {
    await requireManager(tx, input.userId, signal.workspaceId);
    return recordSignalTx(tx, signal);
  });
}

type Finding = {
  queueKind: "FOLLOW_UP_DUE" | "CONNECTOR_PREPARED";
  itemId: string;
  itemVersion: number;
  observedAt: Date;
  alertType: "FOLLOW_UP_STALE" | "CONNECTOR_PREPARED_STALE";
  resourceType: "FOLLOW_UP" | "CONNECTOR_OPERATION";
  outcomeCode: "FOLLOW_UP_DUE_STALE" | "CONNECTOR_PREPARED_STALE";
  replayClass: "LOCAL_REPLAY_SAFE" | "EXTERNAL_EFFECT_UNCERTAIN";
  nextResponsibleRole: "OFFICE_MANAGER" | "OWNER";
};

async function scanWorkspaceTx(tx: PrismaTypes.TransactionClient, command: ReliabilityCommand & { action: "SCAN_WORKSPACE" }, referenceNow: Date) {
  await lock(tx, `scan:${command.workspaceId}`);
  const connectorCutoff = new Date(referenceNow.getTime() - CONNECTOR_STALE_MS);
  const [followUps, connectors] = await Promise.all([
    tx.constructionFollowUp.findMany({
      where: { workspaceId: command.workspaceId, policyHash: { not: null }, status: { in: ["scheduled", "escalated"] }, dueAt: { lte: referenceNow } },
      select: { id: true, version: true, dueAt: true },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    }),
    tx.constructionConnectorOperation.findMany({
      where: { workspaceId: command.workspaceId, status: "prepared", externalTransportPerformed: false, preparedAt: { lte: connectorCutoff } },
      select: { id: true, preparedAt: true },
      orderBy: [{ preparedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const findings: Finding[] = [
    ...followUps.map((row): Finding => ({
      queueKind: "FOLLOW_UP_DUE", itemId: row.id, itemVersion: row.version, observedAt: row.dueAt,
      alertType: "FOLLOW_UP_STALE", resourceType: "FOLLOW_UP", outcomeCode: "FOLLOW_UP_DUE_STALE",
      replayClass: "LOCAL_REPLAY_SAFE", nextResponsibleRole: "OFFICE_MANAGER",
    })),
    ...connectors.map((row): Finding => ({
      queueKind: "CONNECTOR_PREPARED", itemId: row.id, itemVersion: 1, observedAt: row.preparedAt,
      alertType: "CONNECTOR_PREPARED_STALE", resourceType: "CONNECTOR_OPERATION", outcomeCode: "CONNECTOR_PREPARED_STALE",
      replayClass: "EXTERNAL_EFFECT_UNCERTAIN", nextResponsibleRole: "OWNER",
    })),
  ];
  let openedAlertCount = 0;
  let updatedAlertCount = 0;
  for (const finding of findings) {
    const traceId = `r31:${finding.queueKind}:${finding.itemId}:${finding.itemVersion}`;
    const accepted = await recordSignalTx(tx, {
      schemaVersion: 1,
      workspaceId: command.workspaceId,
      signalKey: `queue-stale:v1:${finding.queueKind}:${finding.itemId}:${finding.itemVersion}`,
      kind: "QUEUE_STALE",
      severity: "WARNING",
      outcomeCode: finding.outcomeCode,
      traceId,
      spanId: `${traceId}:detect`,
      parentSpanId: null,
      sourceModule: finding.queueKind === "FOLLOW_UP_DUE" ? "construction-r20" : "construction-r23",
      resourceType: finding.resourceType,
      resourceId: finding.itemId,
      resourceVersion: finding.itemVersion,
      durationMs: null,
      dimensions: { queueKind: finding.queueKind, replayClass: finding.replayClass, operationKind: "SCAN", itemVersion: finding.itemVersion },
      observedAt: finding.observedAt.toISOString(),
    });
    const alertKey = `alert:v1:${finding.queueKind}:${finding.itemId}`;
    const alert = await tx.constructionReliabilityAlert.findUnique({ where: { workspaceId_alertKey: { workspaceId: command.workspaceId, alertKey } } });
    if (!alert) {
      await tx.constructionReliabilityAlert.create({ data: {
        workspaceId: command.workspaceId,
        alertKey,
        alertType: finding.alertType,
        severity: "WARNING",
        resourceType: finding.resourceType,
        resourceId: finding.itemId,
        firstObservedAt: finding.observedAt,
        lastObservedAt: finding.observedAt,
        latestSignalId: accepted.row.id,
        nextResponsibleRole: finding.nextResponsibleRole,
        reasonCode: finding.outcomeCode,
      } });
      openedAlertCount += 1;
    } else if (accepted.created) {
      await tx.constructionReliabilityAlert.update({ where: { id: alert.id }, data: {
        status: "OPEN",
        severity: "WARNING",
        occurrenceCount: { increment: 1 },
        stateVersion: { increment: 1 },
        lastObservedAt: finding.observedAt,
        latestSignalId: accepted.row.id,
        nextResponsibleRole: finding.nextResponsibleRole,
        reasonCode: finding.outcomeCode,
        acknowledgedAt: null,
        resolvedAt: null,
      } });
      updatedAlertCount += 1;
    }
  }
  return reliabilityCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    replayed: false,
    providerObserved: false,
    externalEffectCount: 0,
    resultType: "SCAN",
    findingCount: findings.length,
    openedAlertCount,
    updatedAlertCount,
    scanFingerprint: sha256Canonical(findings.map(({ observedAt, ...finding }) => ({ ...finding, observedAt: observedAt.toISOString() }))),
  });
}

function alertResult(command: ReliabilityCommand, alert: {
  id: string; status: string; stateVersion: number; alertType: string; resourceType: string; resourceId: string;
  occurrenceCount: number; nextResponsibleRole: string; reasonCode: string;
}) {
  return reliabilityCommandResultSchema.parse({
    schemaVersion: 1, commandId: command.commandId, workspaceId: command.workspaceId,
    replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "ALERT",
    alertId: alert.id, status: alert.status, stateVersion: alert.stateVersion, alertType: alert.alertType,
    resourceType: alert.resourceType, resourceId: alert.resourceId, occurrenceCount: alert.occurrenceCount,
    nextResponsibleRole: alert.nextResponsibleRole, reasonCode: alert.reasonCode,
  });
}

async function transitionAlertTx(
  tx: PrismaTypes.TransactionClient,
  command: Extract<ReliabilityCommand, { action: "ACKNOWLEDGE_ALERT" | "RESOLVE_ALERT" }>,
  referenceNow: Date,
) {
  await lock(tx, `alert:${command.workspaceId}:${command.alertId}`);
  const before = await tx.constructionReliabilityAlert.findFirst({ where: { id: command.alertId, workspaceId: command.workspaceId } });
  if (!before) throw new Error("RELIABILITY_ALERT_NOT_FOUND");
  if (before.stateVersion !== command.expectedAlertVersion) throw new Error("RELIABILITY_ALERT_VERSION_CONFLICT");
  if (command.action === "ACKNOWLEDGE_ALERT" && before.status !== "OPEN") throw new Error("RELIABILITY_ALERT_NOT_OPEN");
  if (command.action === "RESOLVE_ALERT" && before.status === "RESOLVED") throw new Error("RELIABILITY_ALERT_ALREADY_RESOLVED");
  const row = await tx.constructionReliabilityAlert.update({ where: { id: before.id }, data: {
    status: command.action === "ACKNOWLEDGE_ALERT" ? "ACKNOWLEDGED" : "RESOLVED",
    stateVersion: { increment: 1 },
    reasonCode: command.reasonCode,
    acknowledgedAt: command.action === "ACKNOWLEDGE_ALERT" ? referenceNow : before.acknowledgedAt,
    resolvedAt: command.action === "RESOLVE_ALERT" ? referenceNow : null,
  } });
  return alertResult(command, row);
}

function recoveryResult(input: {
  command: ReliabilityCommand;
  recoveryOperationId: string;
  alertId: string;
  queueKind: string;
  itemId: string;
  status: string;
  stateVersion: number;
  replayClass: string;
  beforeFingerprint: string;
  afterFingerprint: string | null;
  nextResponsibleRole: string;
  reasonCodes: string[];
}) {
  return reliabilityCommandResultSchema.parse({
    schemaVersion: 1, commandId: input.command.commandId, workspaceId: input.command.workspaceId,
    replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "RECOVERY",
    recoveryOperationId: input.recoveryOperationId, alertId: input.alertId, queueKind: input.queueKind,
    itemId: input.itemId, status: input.status, stateVersion: input.stateVersion,
    replayClass: input.replayClass, beforeFingerprint: input.beforeFingerprint,
    afterFingerprint: input.afterFingerprint, nextResponsibleRole: input.nextResponsibleRole,
    reasonCodes: input.reasonCodes,
  });
}

async function prepareRecoveryTx(
  tx: PrismaTypes.TransactionClient,
  actorId: string,
  command: Extract<ReliabilityCommand, { action: "PREPARE_RECOVERY" }>,
  commandHash: string,
) {
  await lock(tx, `alert:${command.workspaceId}:${command.alertId}`);
  const alert = await tx.constructionReliabilityAlert.findFirst({ where: { id: command.alertId, workspaceId: command.workspaceId } });
  if (!alert) throw new Error("RELIABILITY_ALERT_NOT_FOUND");
  if (alert.stateVersion !== command.expectedAlertVersion) throw new Error("RELIABILITY_ALERT_VERSION_CONFLICT");
  if (alert.status === "RESOLVED") throw new Error("RELIABILITY_ALERT_ALREADY_RESOLVED");
  if (alert.resourceId !== command.itemId) throw new Error("RELIABILITY_ALERT_ITEM_MISMATCH");
  const item = await inspectReliabilityQueueItem(tx, command);
  if (item.itemVersion !== command.expectedItemVersion) throw new Error("RELIABILITY_QUEUE_ITEM_VERSION_CONFLICT");
  if (item.recoveryAction !== command.recoveryAction) throw new Error("RELIABILITY_RECOVERY_ACTION_REFUSED");
  const operationId = randomUUID();
  const nextResponsibleRole = item.replayClass === "LOCAL_REPLAY_SAFE" ? "OFFICE_MANAGER" : "OWNER";
  const result = recoveryResult({
    command, recoveryOperationId: operationId, alertId: alert.id, queueKind: item.queueKind, itemId: item.itemId,
    status: "PREPARED", stateVersion: 1, replayClass: item.replayClass,
    beforeFingerprint: item.fingerprint, afterFingerprint: null, nextResponsibleRole, reasonCodes: [],
  });
  await tx.constructionRecoveryOperation.create({ data: {
    id: operationId,
    workspaceId: command.workspaceId,
    commandId: command.commandId,
    commandHash,
    registryVersion: RELIABILITY_QUEUE_REGISTRY_VERSION,
    alertId: alert.id,
    queueKind: item.queueKind,
    itemId: item.itemId,
    expectedItemVersion: item.itemVersion,
    action: command.recoveryAction,
    replayClass: item.replayClass,
    beforeFingerprint: item.fingerprint,
    result: asJson(result),
    resultFingerprint: sha256Canonical(result),
    actorId,
    nextResponsibleRole,
  } });
  return result;
}

async function applyRecoveryTx(
  tx: PrismaTypes.TransactionClient,
  command: Extract<ReliabilityCommand, { action: "APPLY_RECOVERY" }>,
  referenceNow: Date,
) {
  await lock(tx, `recovery:${command.workspaceId}:${command.recoveryOperationId}`);
  const before = await tx.constructionRecoveryOperation.findFirst({ where: { id: command.recoveryOperationId, workspaceId: command.workspaceId } });
  if (!before) throw new Error("RELIABILITY_RECOVERY_NOT_FOUND");
  if (before.stateVersion !== command.expectedRecoveryVersion) throw new Error("RELIABILITY_RECOVERY_VERSION_CONFLICT");
  if (before.status !== "PREPARED") throw new Error("RELIABILITY_RECOVERY_NOT_PREPARED");
  const item = await inspectReliabilityQueueItem(tx, { workspaceId: command.workspaceId, queueKind: before.queueKind as "FOLLOW_UP_DUE" | "CONNECTOR_PREPARED", itemId: before.itemId });
  if (item.itemVersion !== before.expectedItemVersion || item.fingerprint !== before.beforeFingerprint) throw new Error("RELIABILITY_QUEUE_ITEM_VERSION_CONFLICT");

  let status: "APPLIED" | "QUARANTINED";
  let reasonCodes: string[];
  if (before.replayClass === "LOCAL_REPLAY_SAFE") {
    await applyRegisteredLocalRecovery(tx, { queueKind: item.queueKind, itemId: item.itemId, referenceNow });
    status = "APPLIED";
    reasonCodes = ["RECOVERY_LOCAL_APPLIED"];
  } else {
    status = "QUARANTINED";
    reasonCodes = ["RECOVERY_EXTERNAL_UNCERTAIN"];
  }
  const afterItem = await inspectReliabilityQueueItem(tx, { workspaceId: command.workspaceId, queueKind: item.queueKind, itemId: item.itemId });
  const nextVersion = before.stateVersion + 1;
  const result = recoveryResult({
    command, recoveryOperationId: before.id, alertId: before.alertId, queueKind: before.queueKind,
    itemId: before.itemId, status, stateVersion: nextVersion, replayClass: before.replayClass,
    beforeFingerprint: before.beforeFingerprint, afterFingerprint: afterItem.fingerprint,
    nextResponsibleRole: before.nextResponsibleRole, reasonCodes,
  });
  await tx.constructionRecoveryOperation.update({ where: { id: before.id }, data: {
    status,
    stateVersion: nextVersion,
    afterFingerprint: afterItem.fingerprint,
    result: asJson(result),
    resultFingerprint: sha256Canonical(result),
    appliedAt: status === "APPLIED" ? referenceNow : null,
    quarantinedAt: status === "QUARANTINED" ? referenceNow : null,
  } });
  await lock(tx, `alert:${command.workspaceId}:${before.alertId}`);
  await tx.constructionReliabilityAlert.update({ where: { id: before.alertId }, data: {
    status: status === "APPLIED" ? "RESOLVED" : "ACKNOWLEDGED",
    stateVersion: { increment: 1 },
    reasonCode: reasonCodes[0]!,
    acknowledgedAt: referenceNow,
    resolvedAt: status === "APPLIED" ? referenceNow : null,
  } });
  return result;
}

async function revokeRecoveryTx(
  tx: PrismaTypes.TransactionClient,
  command: Extract<ReliabilityCommand, { action: "REVOKE_RECOVERY" }>,
  referenceNow: Date,
) {
  await lock(tx, `recovery:${command.workspaceId}:${command.recoveryOperationId}`);
  const before = await tx.constructionRecoveryOperation.findFirst({ where: { id: command.recoveryOperationId, workspaceId: command.workspaceId } });
  if (!before) throw new Error("RELIABILITY_RECOVERY_NOT_FOUND");
  if (before.stateVersion !== command.expectedRecoveryVersion) throw new Error("RELIABILITY_RECOVERY_VERSION_CONFLICT");
  if (before.status !== "PREPARED") throw new Error("RELIABILITY_RECOVERY_NOT_PREPARED");
  const result = recoveryResult({
    command, recoveryOperationId: before.id, alertId: before.alertId, queueKind: before.queueKind,
    itemId: before.itemId, status: "REVOKED", stateVersion: before.stateVersion + 1,
    replayClass: before.replayClass, beforeFingerprint: before.beforeFingerprint,
    afterFingerprint: null, nextResponsibleRole: before.nextResponsibleRole, reasonCodes: ["RECOVERY_REVOKED"],
  });
  await tx.constructionRecoveryOperation.update({ where: { id: before.id }, data: {
    status: "REVOKED", stateVersion: { increment: 1 }, revokedAt: referenceNow,
    result: asJson(result), resultFingerprint: sha256Canonical(result),
  } });
  return result;
}

async function createCheckpointTx(
  tx: PrismaTypes.TransactionClient,
  actorId: string,
  command: Extract<ReliabilityCommand, { action: "CREATE_CHECKPOINT" }>,
) {
  await lock(tx, `checkpoint:${command.workspaceId}:${command.checkpointKey}`);
  if (await tx.constructionRecoveryCheckpoint.findUnique({ where: { workspaceId_checkpointKey: { workspaceId: command.workspaceId, checkpointKey: command.checkpointKey } } })) throw new Error("RECOVERY_CHECKPOINT_KEY_CONFLICT");
  const manifest = await buildRecoveryManifest(tx, command.workspaceId);
  const manifestFingerprint = fingerprintRecoveryManifest(manifest);
  const row = await tx.constructionRecoveryCheckpoint.create({ data: {
    workspaceId: command.workspaceId,
    checkpointKey: command.checkpointKey,
    registryVersion: RELIABILITY_REGISTRY_VERSION,
    schemaIdentity: manifest.schemaIdentity,
    tableCounts: asJson(manifest.tableCounts),
    highWaterMarks: asJson(manifest.highWaterMarks),
    manifestFingerprint,
    totalRows: manifest.totalRows,
    createdByUserId: actorId,
  } });
  return reliabilityCommandResultSchema.parse({
    schemaVersion: 1, commandId: command.commandId, workspaceId: command.workspaceId,
    replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "CHECKPOINT",
    checkpointId: row.id, registryVersion: RELIABILITY_REGISTRY_VERSION,
    manifestFingerprint, totalRows: manifest.totalRows, tableCount: Object.keys(manifest.tableCounts).length,
  });
}

async function recordRestoreDrillTx(
  tx: PrismaTypes.TransactionClient,
  actorId: string,
  command: Extract<ReliabilityCommand, { action: "RECORD_RESTORE_DRILL" }>,
) {
  try {
    assertDisposableLocalDatabaseLabel(command.sourceDatabaseLabel);
    assertDisposableLocalDatabaseLabel(command.targetDatabaseLabel);
  } catch {
    throw new Error("RECOVERY_DATABASE_LABEL_REFUSED");
  }
  if (new Date(command.completedAt) < new Date(command.startedAt)) throw new Error("RECOVERY_DRILL_TIME_INVALID");
  const checkpoint = await tx.constructionRecoveryCheckpoint.findFirst({ where: { id: command.checkpointId, workspaceId: command.workspaceId } });
  if (!checkpoint) throw new Error("RECOVERY_CHECKPOINT_NOT_FOUND");
  const fingerprintMatch = command.sourceFingerprint === command.restoredFingerprint && command.sourceFingerprint === checkpoint.manifestFingerprint;
  const status = command.schemaMatch && command.countsMatch && fingerprintMatch && command.reasonCodes.length === 0 ? "PASSED" : "FAILED";
  const row = await tx.constructionRecoveryDrill.create({ data: {
    workspaceId: command.workspaceId, drillKey: command.drillKey, checkpointId: checkpoint.id, status,
    sourceFingerprint: command.sourceFingerprint, restoredFingerprint: command.restoredFingerprint,
    schemaMatch: command.schemaMatch, countsMatch: command.countsMatch, reasonCodes: command.reasonCodes,
    sourceDatabaseLabel: command.sourceDatabaseLabel, targetDatabaseLabel: command.targetDatabaseLabel,
    startedAt: new Date(command.startedAt), completedAt: new Date(command.completedAt), recordedByUserId: actorId,
  } });
  return reliabilityCommandResultSchema.parse({
    schemaVersion: 1, commandId: command.commandId, workspaceId: command.workspaceId,
    replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "RESTORE_DRILL",
    drillId: row.id, status, sourceFingerprint: row.sourceFingerprint, restoredFingerprint: row.restoredFingerprint,
    schemaMatch: row.schemaMatch, countsMatch: row.countsMatch, reasonCodes: row.reasonCodes,
  });
}

async function recordGateTx(
  tx: PrismaTypes.TransactionClient,
  actorId: string,
  command: Extract<ReliabilityCommand, { action: "RECORD_GATE_RUN" }>,
) {
  const expectedStatus = command.canonicalEffectCount === command.operationCount && command.p95LatencyMs <= command.thresholdMs ? "PASSED" : "FAILED";
  if (expectedStatus !== command.status) throw new Error("RELIABILITY_GATE_STATUS_MISMATCH");
  const row = await tx.constructionReliabilityGateRun.create({ data: {
    workspaceId: command.workspaceId, gateKey: command.gateKey, gateKind: command.gateKind,
    operationCount: command.operationCount, concurrency: command.concurrency,
    canonicalEffectCount: command.canonicalEffectCount, duplicateCount: command.duplicateCount,
    durationMs: command.durationMs, p50LatencyMs: command.p50LatencyMs, p95LatencyMs: command.p95LatencyMs,
    thresholdMs: command.thresholdMs, status: command.status, resultFingerprint: command.resultFingerprint,
    recordedByUserId: actorId,
  } });
  return reliabilityCommandResultSchema.parse({
    schemaVersion: 1, commandId: command.commandId, workspaceId: command.workspaceId,
    replayed: false, providerObserved: false, externalEffectCount: 0, resultType: "GATE_RUN",
    gateRunId: row.id, status: row.status, operationCount: row.operationCount, concurrency: row.concurrency,
    canonicalEffectCount: row.canonicalEffectCount, duplicateCount: row.duplicateCount,
    p95LatencyMs: row.p95LatencyMs, thresholdMs: row.thresholdMs, evidenceLabel: "SYNTHETIC",
  });
}

export async function processReliabilityCommand(input: { userId: string; command: unknown; referenceNow?: Date }) {
  const command = reliabilityCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  const referenceNow = input.referenceNow ?? new Date();
  return withTransactionRetry(async (tx) => {
    await requireManager(tx, input.userId, command.workspaceId);
    await lock(tx, `command:${command.workspaceId}:${command.commandId}`);
    const replay = await replayCommand(tx, command, commandHash);
    if (replay) return replay;
    let result: ReliabilityCommandResult;
    switch (command.action) {
      case "SCAN_WORKSPACE": result = await scanWorkspaceTx(tx, command, referenceNow); break;
      case "ACKNOWLEDGE_ALERT":
      case "RESOLVE_ALERT": result = await transitionAlertTx(tx, command, referenceNow); break;
      case "PREPARE_RECOVERY": result = await prepareRecoveryTx(tx, input.userId, command, commandHash); break;
      case "APPLY_RECOVERY": result = await applyRecoveryTx(tx, command, referenceNow); break;
      case "REVOKE_RECOVERY": result = await revokeRecoveryTx(tx, command, referenceNow); break;
      case "CREATE_CHECKPOINT": result = await createCheckpointTx(tx, input.userId, command); break;
      case "RECORD_RESTORE_DRILL": result = await recordRestoreDrillTx(tx, input.userId, command); break;
      case "RECORD_GATE_RUN": result = await recordGateTx(tx, input.userId, command); break;
    }
    return persistCommand(tx, input.userId, command, commandHash, result);
  }, Prisma.TransactionIsolationLevel.Serializable);
}

export async function reliabilityCockpitForUser(input: { userId: string; workspaceId: string; referenceNow?: Date }): Promise<ReliabilityCockpit> {
  const referenceNow = input.referenceNow ?? new Date();
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const workspace = await prisma.constructionWorkspace.findUnique({ where: { id: input.workspaceId }, select: { id: true, name: true } });
  if (!workspace) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  if (membership.role !== "owner" && membership.role !== "admin") {
    const rows = await prisma.constructionReliabilityAlert.findMany({
      where: { workspaceId: input.workspaceId, status: { not: "RESOLVED" }, nextResponsibleRole: "FIELD_WORKER" },
      orderBy: [{ lastObservedAt: "desc" }, { id: "asc" }],
      select: { id: true, status: true, reasonCode: true },
    });
    const result = reliabilityCockpitSchema.parse({
      schemaVersion: 1, generatedAt: referenceNow.toISOString(), workspace,
      role: "FIELD_WORKER", interruptions: rows.map((row) => ({ id: row.id, status: row.status, nextAction: row.reasonCode })),
      providerObserved: false, externalEffectCount: 0,
    });
    rejectFieldReliabilityLeaks(result);
    return result;
  }

  const windowStartedAt = new Date(referenceNow.getTime() - WINDOW_MS);
  const connectorCutoff = new Date(referenceNow.getTime() - CONNECTOR_STALE_MS);
  // Prisma Dev's disposable local server intentionally uses a small pool. Keep
  // this read projection bounded instead of opening one connection per metric.
  const alerts = await prisma.constructionReliabilityAlert.findMany({ where: { workspaceId: input.workspaceId }, orderBy: [{ lastObservedAt: "desc" }, { id: "asc" }], include: { latestSignal: { select: { resourceVersion: true } } } });
  const recoveries = await prisma.constructionRecoveryOperation.findMany({ where: { workspaceId: input.workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const signals = await prisma.constructionReliabilitySignal.findMany({ where: { workspaceId: input.workspaceId, traceId: { not: null }, spanId: { not: null } }, orderBy: [{ observedAt: "asc" }, { id: "asc" }] });
  const latestCheckpoint = await prisma.constructionRecoveryCheckpoint.findFirst({ where: { workspaceId: input.workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const latestRestoreDrill = await prisma.constructionRecoveryDrill.findFirst({ where: { workspaceId: input.workspaceId }, orderBy: [{ completedAt: "desc" }, { id: "desc" }] });
  const latestGate = await prisma.constructionReliabilityGateRun.findFirst({ where: { workspaceId: input.workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const totalAlerts = await prisma.constructionReliabilityAlert.count({ where: { workspaceId: input.workspaceId } });
  const staleFollowUps = await prisma.constructionFollowUp.count({ where: { workspaceId: input.workspaceId, policyHash: { not: null }, status: { in: ["scheduled", "escalated"] }, dueAt: { lte: referenceNow } } });
  const totalManagedFollowUps = await prisma.constructionFollowUp.count({ where: { workspaceId: input.workspaceId, policyHash: { not: null } } });
  const staleConnectors = await prisma.constructionConnectorOperation.count({ where: { workspaceId: input.workspaceId, status: "prepared", externalTransportPerformed: false, preparedAt: { lte: connectorCutoff } } });
  const totalPreparedConnectors = await prisma.constructionConnectorOperation.count({ where: { workspaceId: input.workspaceId, status: "prepared" } });
  const recoveryTotal = await prisma.constructionRecoveryOperation.count({ where: { workspaceId: input.workspaceId } });
  const recoverySuccessful = await prisma.constructionRecoveryOperation.count({ where: { workspaceId: input.workspaceId, status: { in: ["APPLIED", "QUARANTINED"] } } });
  const drillTotal = await prisma.constructionRecoveryDrill.count({ where: { workspaceId: input.workspaceId } });
  const drillPassed = await prisma.constructionRecoveryDrill.count({ where: { workspaceId: input.workspaceId, status: "PASSED" } });
  const gateTotal = await prisma.constructionReliabilityGateRun.count({ where: { workspaceId: input.workspaceId } });
  const gatePassed = await prisma.constructionReliabilityGateRun.count({ where: { workspaceId: input.workspaceId, status: "PASSED" } });
  const severityCounts = alerts.filter((row) => row.status !== "RESOLVED").reduce((counts, row) => {
    if (row.severity === "CRITICAL") counts.critical += 1;
    if (row.severity === "ERROR") counts.error += 1;
    if (row.severity === "WARNING") counts.warning += 1;
    return counts;
  }, { critical: 0, error: 0, warning: 0 });
  const traceMap = new Map<string, typeof signals>();
  for (const signal of signals) {
    const traceId = signal.traceId!;
    const current = traceMap.get(traceId) ?? [];
    current.push(signal);
    traceMap.set(traceId, current);
  }
  return reliabilityCockpitSchema.parse({
    schemaVersion: 1,
    generatedAt: referenceNow.toISOString(),
    workspace,
    role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
    health: deriveReliabilityHealth({ ...severityCounts, metricsAvailable: true }),
    metrics: [
      { key: "OPEN_ALERTS", numerator: alerts.filter((row) => row.status !== "RESOLVED").length, denominator: totalAlerts, windowStartedAt: windowStartedAt.toISOString(), windowEndedAt: referenceNow.toISOString(), evidenceLabel: "TEST" },
      { key: "STALE_QUEUE_ITEMS", numerator: staleFollowUps + staleConnectors, denominator: totalManagedFollowUps + totalPreparedConnectors, windowStartedAt: windowStartedAt.toISOString(), windowEndedAt: referenceNow.toISOString(), evidenceLabel: "TEST" },
      { key: "RECOVERIES", numerator: recoverySuccessful, denominator: recoveryTotal, windowStartedAt: windowStartedAt.toISOString(), windowEndedAt: referenceNow.toISOString(), evidenceLabel: "TEST" },
      { key: "RESTORE_DRILLS", numerator: drillPassed, denominator: drillTotal, windowStartedAt: windowStartedAt.toISOString(), windowEndedAt: referenceNow.toISOString(), evidenceLabel: "TEST" },
      { key: "LOAD_GATES", numerator: gatePassed, denominator: gateTotal, windowStartedAt: windowStartedAt.toISOString(), windowEndedAt: referenceNow.toISOString(), evidenceLabel: "TEST" },
    ],
    alerts: alerts.map((row) => ({ id: row.id, alertType: row.alertType, severity: row.severity, status: row.status, stateVersion: row.stateVersion, resourceType: row.resourceType, resourceId: row.resourceId, resourceVersion: row.latestSignal.resourceVersion ?? 1, occurrenceCount: row.occurrenceCount, firstObservedAt: row.firstObservedAt.toISOString(), lastObservedAt: row.lastObservedAt.toISOString(), nextResponsibleRole: row.nextResponsibleRole, reasonCode: row.reasonCode })),
    recoveries: recoveries.map((row) => ({ id: row.id, alertId: row.alertId, queueKind: row.queueKind, itemId: row.itemId, status: row.status, stateVersion: row.stateVersion, replayClass: row.replayClass, nextResponsibleRole: row.nextResponsibleRole, createdAt: row.createdAt.toISOString() })),
    traces: [...traceMap.entries()].map(([traceId, spans]) => ({ traceId, spans: spans.map((span) => ({ spanId: span.spanId!, parentSpanId: span.parentSpanId, kind: span.kind, outcomeCode: span.outcomeCode, resourceType: span.resourceType, resourceId: span.resourceId, durationMs: span.durationMs, observedAt: span.observedAt.toISOString() })) })),
    latestCheckpoint: latestCheckpoint ? { id: latestCheckpoint.id, manifestFingerprint: latestCheckpoint.manifestFingerprint, totalRows: latestCheckpoint.totalRows, tableCount: Object.keys(latestCheckpoint.tableCounts as object).length, createdAt: latestCheckpoint.createdAt.toISOString() } : null,
    latestRestoreDrill: latestRestoreDrill ? { id: latestRestoreDrill.id, status: latestRestoreDrill.status, schemaMatch: latestRestoreDrill.schemaMatch, countsMatch: latestRestoreDrill.countsMatch, completedAt: latestRestoreDrill.completedAt.toISOString() } : null,
    latestGate: latestGate ? { id: latestGate.id, status: latestGate.status, operationCount: latestGate.operationCount, p95LatencyMs: latestGate.p95LatencyMs, thresholdMs: latestGate.thresholdMs, evidenceLabel: "SYNTHETIC", createdAt: latestGate.createdAt.toISOString() } : null,
    providerObserved: false,
    externalEffectCount: 0,
  });
}
