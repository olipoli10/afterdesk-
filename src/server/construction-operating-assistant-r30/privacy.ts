import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  privacyCockpitSchema,
  privacyCommandResultSchema,
  privacyCommandSchema,
  privacyDeletionResultSchema,
  privacyExportResultSchema,
  privacyPolicyResultSchema,
  rejectFieldPrivacyLeaks,
  type PrivacyCommand,
  type PrivacyDataClass,
  type PrivacyDeletionMode,
} from "@/lib/construction-operating-assistant-r30/contracts";
import {
  PRIVACY_DATA_CLASSES,
  assertCompletePrivacyRules,
  baselinePrivacyRules,
  privacyPolicyHash,
  privacyRuleHash,
  type PrivacyRule,
} from "@/lib/construction-operating-assistant-r30/policy";
import { prisma } from "@/lib/db";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

type Tx = Prisma.TransactionClient;
type PolicyRow = {
  id: string;
  version: number;
  stateVersion: number;
  status: string;
  policyHash: string;
  rules: Array<{ dataClass: string; retentionDays: number; deletionMode: string; holdBehavior: string }>;
};

export class PrivacyConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PrivacyConflict";
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function lock(tx: Tx, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r30:${key}`}, 0))::text AS acquired
  `);
}

async function requireOwner(tx: Tx, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner") throw new ConstructionAccessDenied();
  return membership;
}

function roleLabel(role: string): "OWNER" | "OFFICE_MANAGER" | "FIELD_WORKER" {
  if (role === "owner") return "OWNER";
  if (role === "admin") return "OFFICE_MANAGER";
  return "FIELD_WORKER";
}

function refusalCode(error: unknown): string | null {
  if (error instanceof PrivacyConflict) return error.code;
  if (error instanceof ConstructionAccessDenied) return "PRIVACY_ACCESS_DENIED";
  if (error instanceof Error && error.message.startsWith("PRIVACY_POLICY_")) return error.message;
  return null;
}

async function withRefusal<T>(input: {
  workspaceId: string;
  operationId: string;
  operationKind: string;
  inputHash: string;
  actorId: string;
}, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    const code = refusalCode(error);
    if (code) {
      const member = await prisma.constructionWorkspaceMember.findFirst({
        where: { workspaceId: input.workspaceId, userId: input.actorId, status: "active" },
        select: { id: true },
      }).catch(() => null);
      if (member) {
        await prisma.constructionPrivacyRefusal.create({
          data: { ...input, refusalCode: code },
        }).catch(() => null);
      }
    }
    throw error;
  }
}

async function existingOperation(tx: Tx, workspaceId: string, commandId: string, commandHash: string) {
  const existing = await tx.constructionPrivacyOperation.findUnique({
    where: { workspaceId_commandId: { workspaceId, commandId } },
    select: { commandHash: true, result: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) throw new PrivacyConflict("PRIVACY_COMMAND_IDEMPOTENCY_CONFLICT");
  return privacyCommandResultSchema.parse({ ...privacyCommandResultSchema.parse(existing.result), replayed: true });
}

async function saveOperation(tx: Tx, input: {
  workspaceId: string;
  commandId: string;
  commandHash: string;
  operationKind: string;
  result: unknown;
  actorId: string;
}) {
  await tx.constructionPrivacyOperation.create({ data: { ...input, result: asJson(input.result) } });
}

function normalizeRules(rows: PolicyRow["rules"]): PrivacyRule[] {
  return rows.map((rule) => ({
    dataClass: rule.dataClass as PrivacyDataClass,
    retentionDays: rule.retentionDays,
    deletionMode: rule.deletionMode as PrivacyDeletionMode,
    holdBehavior: rule.holdBehavior as "BLOCK_WHILE_HELD",
  })).sort((a, b) => a.dataClass.localeCompare(b.dataClass));
}

async function nextPolicyVersion(tx: Tx, workspaceId: string) {
  const aggregate = await tx.constructionPrivacyPolicySet.aggregate({
    where: { workspaceId },
    _max: { version: true },
  });
  return (aggregate._max.version ?? 0) + 1;
}

async function policyResult(tx: Tx, input: { workspaceId: string; commandId: string; policySetId: string; replayed: boolean }) {
  const set = await tx.constructionPrivacyPolicySet.findFirstOrThrow({
    where: { id: input.policySetId, workspaceId: input.workspaceId },
    include: { rules: { orderBy: { dataClass: "asc" } } },
  });
  return privacyPolicyResultSchema.parse({
    schemaVersion: 1,
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    resultType: "POLICY_SET",
    policySetId: set.id,
    policySetVersion: set.version,
    stateVersion: set.stateVersion,
    status: set.status,
    policyHash: set.policyHash,
    ruleCount: set.rules.length,
    replayed: input.replayed,
    externalEffectCount: 0,
  });
}

async function createPolicyDraft(tx: Tx, userId: string, command: Extract<PrivacyCommand, { action: "CREATE_POLICY_DRAFT" }>) {
  let source: PolicyRow | null = null;
  if (command.sourcePolicySetId) {
    source = await tx.constructionPrivacyPolicySet.findFirst({
      where: { id: command.sourcePolicySetId, workspaceId: command.workspaceId },
      include: { rules: { orderBy: { dataClass: "asc" } } },
    });
    if (!source) throw new ConstructionAccessDenied();
    if (source.stateVersion !== command.expectedSourceStateVersion) throw new PrivacyConflict("PRIVACY_POLICY_SOURCE_VERSION_CONFLICT");
  } else if (command.expectedSourceStateVersion !== null) {
    throw new PrivacyConflict("PRIVACY_POLICY_SOURCE_MISMATCH");
  }
  const version = await nextPolicyVersion(tx, command.workspaceId);
  const rules = source ? normalizeRules(source.rules) : baselinePrivacyRules();
  assertCompletePrivacyRules(rules);
  const set = await tx.constructionPrivacyPolicySet.create({
    data: {
      workspaceId: command.workspaceId,
      version,
      status: "DRAFT",
      policyHash: privacyPolicyHash(version, rules),
      sourcePolicySetId: source?.id ?? null,
      createdByUserId: userId,
      rules: { create: rules.map((rule) => ({ ...rule, ruleHash: privacyRuleHash(rule) })) },
    },
  });
  return policyResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, policySetId: set.id, replayed: false });
}

async function setRetentionRule(tx: Tx, command: Extract<PrivacyCommand, { action: "SET_RETENTION_RULE" }>) {
  const set = await tx.constructionPrivacyPolicySet.findFirst({
    where: { id: command.policySetId, workspaceId: command.workspaceId },
    include: { rules: true },
  });
  if (!set) throw new ConstructionAccessDenied();
  if (set.status !== "DRAFT") throw new PrivacyConflict("PRIVACY_POLICY_IMMUTABLE");
  if (set.stateVersion !== command.expectedStateVersion) throw new PrivacyConflict("PRIVACY_POLICY_VERSION_CONFLICT");
  const proposed: PrivacyRule = {
    dataClass: command.dataClass,
    retentionDays: command.retentionDays,
    deletionMode: command.deletionMode,
    holdBehavior: command.holdBehavior,
  };
  const rules = normalizeRules(set.rules).filter((rule) => rule.dataClass !== proposed.dataClass).concat(proposed);
  assertCompletePrivacyRules(rules);
  await tx.constructionPrivacyRetentionRule.upsert({
    where: { policySetId_dataClass: { policySetId: set.id, dataClass: command.dataClass } },
    create: { policySetId: set.id, ...proposed, ruleHash: privacyRuleHash(proposed) },
    update: { retentionDays: proposed.retentionDays, deletionMode: proposed.deletionMode, holdBehavior: proposed.holdBehavior, ruleHash: privacyRuleHash(proposed) },
  });
  await tx.constructionPrivacyPolicySet.update({
    where: { id: set.id },
    data: { policyHash: privacyPolicyHash(set.version, rules), stateVersion: { increment: 1 } },
  });
  return policyResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, policySetId: set.id, replayed: false });
}

async function activatePolicy(tx: Tx, userId: string, command: Extract<PrivacyCommand, { action: "ACTIVATE_POLICY_SET" }>) {
  const set = await tx.constructionPrivacyPolicySet.findFirst({
    where: { id: command.policySetId, workspaceId: command.workspaceId },
    include: { rules: { orderBy: { dataClass: "asc" } } },
  });
  if (!set) throw new ConstructionAccessDenied();
  if (set.status !== "DRAFT") throw new PrivacyConflict("PRIVACY_POLICY_NOT_DRAFT");
  if (set.stateVersion !== command.expectedStateVersion || set.policyHash !== command.expectedPolicyHash) {
    throw new PrivacyConflict("PRIVACY_POLICY_ACTIVATION_CONFLICT");
  }
  const rules = normalizeRules(set.rules);
  assertCompletePrivacyRules(rules);
  if (privacyPolicyHash(set.version, rules) !== set.policyHash) throw new PrivacyConflict("PRIVACY_POLICY_HASH_MISMATCH");
  const now = new Date();
  await tx.constructionPrivacyPolicySet.updateMany({
    where: { workspaceId: command.workspaceId, status: "ACTIVE" },
    data: { status: "SUPERSEDED", supersededAt: now, stateVersion: { increment: 1 } },
  });
  await tx.constructionPrivacyPolicySet.update({
    where: { id: set.id },
    data: { status: "ACTIVE", activatedByUserId: userId, activatedAt: now, stateVersion: { increment: 1 } },
  });
  return policyResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, policySetId: set.id, replayed: false });
}

async function revokePolicy(tx: Tx, command: Extract<PrivacyCommand, { action: "REVOKE_POLICY_SET" }>) {
  const set = await tx.constructionPrivacyPolicySet.findFirst({ where: { id: command.policySetId, workspaceId: command.workspaceId } });
  if (!set) throw new ConstructionAccessDenied();
  if (set.status !== "ACTIVE") throw new PrivacyConflict("PRIVACY_POLICY_NOT_ACTIVE");
  if (set.stateVersion !== command.expectedStateVersion || set.policyHash !== command.expectedPolicyHash) {
    throw new PrivacyConflict("PRIVACY_POLICY_REVOCATION_CONFLICT");
  }
  await tx.constructionPrivacyPolicySet.update({
    where: { id: set.id },
    data: { status: "REVOKED", revokedAt: new Date(), stateVersion: { increment: 1 } },
  });
  return policyResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, policySetId: set.id, replayed: false });
}

async function activePolicy(tx: Tx, workspaceId: string, expectedId?: string, expectedVersion?: number): Promise<PolicyRow> {
  const set = await tx.constructionPrivacyPolicySet.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    include: { rules: { orderBy: { dataClass: "asc" } } },
  });
  if (!set) throw new PrivacyConflict("PRIVACY_ACTIVE_POLICY_REQUIRED");
  if ((expectedId && set.id !== expectedId) || (expectedVersion && set.version !== expectedVersion)) {
    throw new PrivacyConflict("PRIVACY_ACTIVE_POLICY_VERSION_CONFLICT");
  }
  assertCompletePrivacyRules(normalizeRules(set.rules));
  return set;
}

async function inventoryCounts(tx: Tx, workspaceId: string): Promise<Record<PrivacyDataClass, number>> {
  const [members, identities, contacts, messages, emails, calls, projects, calendar, actions, loops, jobs,
    loopEvidence, media, voiceNotes, emailEvidence, receivables, receivableEvents, accountingObservations,
    accountingDrafts, connectors, grants, emailAccounts, accountingAccounts, audits, transitions,
    authorityOps, privacyOps, humanEscalations] = await Promise.all([
    tx.constructionWorkspaceMember.count({ where: { workspaceId } }),
    tx.constructionCommunicationIdentity.count({ where: { workspaceId } }),
    tx.constructionContact.count({ where: { workspaceId } }),
    tx.constructionMessage.count({ where: { workspaceId } }),
    tx.constructionEmailEvent.count({ where: { workspaceId } }),
    tx.constructionCallSession.count({ where: { workspaceId } }),
    tx.constructionProject.count({ where: { workspaceId } }),
    tx.constructionCalendarItem.count({ where: { workspaceId } }),
    tx.constructionAction.count({ where: { workspaceId } }),
    tx.constructionOpenLoop.count({ where: { workspaceId } }),
    tx.constructionJob.count({ where: { workspaceId } }),
    tx.constructionOpenLoopEvidence.count({ where: { workspaceId } }),
    tx.constructionMessageMediaReference.count({ where: { workspaceId } }),
    tx.constructionVoiceNoteReference.count({ where: { workspaceId } }),
    tx.constructionEmailEvidenceLink.count({ where: { workspaceId } }),
    tx.constructionReceivable.count({ where: { workspaceId } }),
    tx.constructionReceivableEvent.count({ where: { workspaceId } }),
    tx.constructionAccountingObservation.count({ where: { workspaceId } }),
    tx.constructionAccountingDraft.count({ where: { workspaceId } }),
    tx.constructionConnectorAccount.count({ where: { workspaceId } }),
    tx.constructionConnectorGrant.count({ where: { account: { workspaceId } } }),
    tx.constructionEmailAccount.count({ where: { workspaceId } }),
    tx.constructionAccountingAccount.count({ where: { workspaceId } }),
    tx.constructionAuditEvent.count({ where: { workspaceId } }),
    tx.constructionOpenLoopTransition.count({ where: { workspaceId } }),
    tx.constructionAuthorityOperation.count({ where: { workspaceId } }),
    tx.constructionPrivacyOperation.count({ where: { workspaceId } }),
    tx.constructionHumanEscalation.count({ where: { workspaceId } }),
  ]);
  return {
    IDENTITY: members + identities + contacts,
    COMMUNICATION: messages + emails + calls,
    PROJECT_STATE: projects + calendar + actions + loops + jobs,
    EVIDENCE: loopEvidence + media + voiceNotes + emailEvidence,
    FINANCIAL: receivables + receivableEvents + accountingObservations + accountingDrafts,
    CONNECTOR_METADATA: connectors + grants + emailAccounts + accountingAccounts,
    AUDIT: audits + transitions + authorityOps + privacyOps,
    HUMAN_WORK: humanEscalations,
  };
}

async function inventoryProjection(tx: Tx, workspaceId: string, rules: readonly PrivacyRule[]) {
  const counts = await inventoryCounts(tx, workspaceId);
  return PRIVACY_DATA_CLASSES.map((dataClass) => {
    const rule = rules.find((item) => item.dataClass === dataClass);
    if (!rule) throw new PrivacyConflict("PRIVACY_POLICY_INCOMPLETE");
    return { dataClass, recordCount: counts[dataClass], retentionDays: rule.retentionDays, deletionMode: rule.deletionMode };
  });
}

async function timeBounds(tx: Tx, workspaceId: string) {
  const [workspace, projects, messages, evidence, operations] = await Promise.all([
    tx.constructionWorkspace.findFirst({ where: { id: workspaceId }, select: { createdAt: true, updatedAt: true } }),
    tx.constructionProject.aggregate({ where: { workspaceId }, _min: { createdAt: true }, _max: { updatedAt: true } }),
    tx.constructionMessage.aggregate({ where: { workspaceId }, _min: { createdAt: true }, _max: { updatedAt: true } }),
    tx.constructionOpenLoopEvidence.aggregate({ where: { workspaceId }, _min: { createdAt: true }, _max: { updatedAt: true } }),
    tx.constructionPrivacyOperation.aggregate({ where: { workspaceId }, _min: { createdAt: true }, _max: { createdAt: true } }),
  ]);
  const earliest = [workspace?.createdAt, projects._min.createdAt, messages._min.createdAt, evidence._min.createdAt, operations._min.createdAt].filter((item): item is Date => Boolean(item)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const latest = [workspace?.updatedAt, projects._max.updatedAt, messages._max.updatedAt, evidence._max.updatedAt, operations._max.createdAt].filter((item): item is Date => Boolean(item)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { earliest, latest };
}

async function prepareExport(tx: Tx, command: Extract<PrivacyCommand, { action: "PREPARE_EXPORT_MANIFEST" }>, referenceNow: Date) {
  const policy = await activePolicy(tx, command.workspaceId, command.expectedPolicySetId, command.expectedPolicySetVersion);
  const inventory = await inventoryProjection(tx, command.workspaceId, normalizeRules(policy.rules));
  const bounds = await timeBounds(tx, command.workspaceId);
  const manifest = {
    schemaVersion: 1,
    workspaceId: command.workspaceId,
    policySetId: policy.id,
    policySetVersion: policy.version,
    generatedAt: referenceNow.toISOString(),
    inventory,
    totalRecordCount: inventory.reduce((total, item) => total + item.recordCount, 0),
    earliestRecordedAt: bounds.earliest?.toISOString() ?? null,
    latestRecordedAt: bounds.latest?.toISOString() ?? null,
    excludedClasses: ["AUTHENTICATION_SECRET", "PROVIDER_TOKEN", "STORAGE_KEY", "HIDDEN_WORKER_ECONOMICS"] as const,
  };
  return privacyExportResultSchema.parse({
    ...manifest,
    commandId: command.commandId,
    resultType: "EXPORT_MANIFEST",
    manifestFingerprint: sha256Canonical(manifest),
    replayed: false,
    externalEffectCount: 0,
  });
}

type DeletionTarget = {
  type: "OPEN_LOOP_EVIDENCE" | "VOICE_NOTE_REFERENCE" | "MESSAGE_MEDIA_REFERENCE" | "EMAIL_EVIDENCE_LINK";
  id: string;
  createdAt: Date;
  fingerprint: string;
  held: boolean;
};

async function deletionTarget(tx: Tx, workspaceId: string, type: DeletionTarget["type"], targetId: string): Promise<DeletionTarget> {
  if (type === "OPEN_LOOP_EVIDENCE") {
    const row = await tx.constructionOpenLoopEvidence.findFirst({ where: { id: targetId, workspaceId }, include: { loop: { select: { status: true } } } });
    if (!row) throw new ConstructionAccessDenied();
    return { type, id: row.id, createdAt: row.createdAt, held: row.state === "verified" || ["ready_to_invoice", "closed"].includes(row.loop.status), fingerprint: sha256Canonical({ type, id: row.id, kind: row.kind, state: row.state, contentHash: row.contentHash }) };
  }
  if (type === "VOICE_NOTE_REFERENCE") {
    const row = await tx.constructionVoiceNoteReference.findFirst({ where: { id: targetId, workspaceId } });
    if (!row) throw new ConstructionAccessDenied();
    return { type, id: row.id, createdAt: row.createdAt, held: false, fingerprint: sha256Canonical({ type, id: row.id, contentHash: row.contentHash }) };
  }
  if (type === "MESSAGE_MEDIA_REFERENCE") {
    const row = await tx.constructionMessageMediaReference.findFirst({ where: { id: targetId, workspaceId } });
    if (!row) throw new ConstructionAccessDenied();
    return { type, id: row.id, createdAt: row.createdAt, held: false, fingerprint: sha256Canonical({ type, id: row.id, contentHash: row.contentHash }) };
  }
  const row = await tx.constructionEmailEvidenceLink.findFirst({ where: { id: targetId, workspaceId } });
  if (!row) throw new ConstructionAccessDenied();
  return { type, id: row.id, createdAt: row.createdAt, held: false, fingerprint: sha256Canonical({ type, id: row.id, contentHash: row.contentHash }) };
}

async function deletionResult(tx: Tx, input: { workspaceId: string; commandId: string; deletionRequestId: string; replayed: boolean }) {
  const request = await tx.constructionPrivacyDeletionRequest.findFirstOrThrow({
    where: { id: input.deletionRequestId, workspaceId: input.workspaceId },
    include: { tombstone: true },
  });
  return privacyDeletionResultSchema.parse({
    schemaVersion: 1,
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    resultType: "DELETION_REQUEST",
    deletionRequestId: request.id,
    targetType: request.targetType,
    targetFingerprint: request.targetFingerprint,
    eligibilityFingerprint: request.eligibilityFingerprint,
    status: request.status,
    stateVersion: request.stateVersion,
    reasonCodes: request.reasonCodes,
    localTombstoneCreated: Boolean(request.tombstone),
    externalDeletionState: request.tombstone?.externalDeletionState ?? null,
    replayed: input.replayed,
    externalEffectCount: 0,
  });
}

async function requestDeletion(tx: Tx, userId: string, command: Extract<PrivacyCommand, { action: "REQUEST_DELETION" }>, referenceNow: Date) {
  const policy = await activePolicy(tx, command.workspaceId, command.expectedPolicySetId, command.expectedPolicySetVersion);
  const evidenceRule = normalizeRules(policy.rules).find((rule) => rule.dataClass === "EVIDENCE");
  if (!evidenceRule) throw new PrivacyConflict("PRIVACY_POLICY_INCOMPLETE");
  const priorTombstone = await tx.constructionPrivacyTombstone.findFirst({ where: { workspaceId: command.workspaceId, targetType: command.targetType, targetId: command.targetId } });
  if (priorTombstone) throw new PrivacyConflict("PRIVACY_TARGET_ALREADY_TOMBSTONED");
  const activeRequest = await tx.constructionPrivacyDeletionRequest.findFirst({
    where: { workspaceId: command.workspaceId, targetType: command.targetType, targetId: command.targetId, status: { in: ["REQUESTED", "BLOCKED", "ELIGIBLE", "APPROVED"] } },
  });
  if (activeRequest) throw new PrivacyConflict("PRIVACY_DELETION_ALREADY_ACTIVE");
  const target = await deletionTarget(tx, command.workspaceId, command.targetType, command.targetId);
  const cutoff = new Date(referenceNow.getTime() - evidenceRule.retentionDays * 86_400_000);
  const reasons: string[] = [];
  if (target.held) reasons.push("LEGAL_OR_OPERATIONAL_HOLD");
  if (target.createdAt > cutoff) reasons.push("RETENTION_PERIOD_NOT_MET");
  if (evidenceRule.deletionMode === "RETAIN") reasons.push("DELETION_MODE_RETAIN");
  const status = reasons.length === 0 ? "ELIGIBLE" : "BLOCKED";
  const eligibilityFingerprint = sha256Canonical({
    schemaVersion: 1,
    workspaceId: command.workspaceId,
    policySetId: policy.id,
    policySetVersion: policy.version,
    targetType: target.type,
    targetFingerprint: target.fingerprint,
    status,
    reasons,
    evaluatedAt: referenceNow.toISOString(),
  });
  const request = await tx.constructionPrivacyDeletionRequest.create({
    data: {
      workspaceId: command.workspaceId,
      policySetId: policy.id,
      policySetVersion: policy.version,
      targetType: target.type,
      targetId: target.id,
      targetFingerprint: target.fingerprint,
      eligibilityFingerprint,
      status,
      reasonCodes: reasons,
      requestedByUserId: userId,
      requestedAt: referenceNow,
    },
  });
  return deletionResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, deletionRequestId: request.id, replayed: false });
}

async function approveDeletion(tx: Tx, userId: string, command: Extract<PrivacyCommand, { action: "APPROVE_DELETION" }>, referenceNow: Date) {
  const request = await tx.constructionPrivacyDeletionRequest.findFirst({ where: { id: command.deletionRequestId, workspaceId: command.workspaceId } });
  if (!request) throw new ConstructionAccessDenied();
  if (request.status !== "ELIGIBLE") throw new PrivacyConflict("PRIVACY_DELETION_NOT_ELIGIBLE");
  if (request.stateVersion !== command.expectedStateVersion || request.eligibilityFingerprint !== command.expectedEligibilityFingerprint) {
    throw new PrivacyConflict("PRIVACY_DELETION_APPROVAL_CONFLICT");
  }
  await activePolicy(tx, command.workspaceId, request.policySetId, request.policySetVersion);
  const target = await deletionTarget(tx, command.workspaceId, request.targetType as DeletionTarget["type"], request.targetId);
  if (target.fingerprint !== request.targetFingerprint) throw new PrivacyConflict("PRIVACY_DELETION_TARGET_CHANGED");
  const tombstone = await tx.constructionPrivacyTombstone.create({
    data: {
      workspaceId: command.workspaceId,
      deletionRequestId: request.id,
      targetType: request.targetType,
      targetId: request.targetId,
      targetFingerprint: request.targetFingerprint,
      externalDeletionState: "EXTERNAL_DELETION_PENDING",
      tombstonedAt: referenceNow,
    },
  });
  await tx.constructionPrivacyDeletionRequest.update({
    where: { id: request.id },
    data: { status: "TOMBSTONED", stateVersion: { increment: 1 }, approvedByUserId: userId, approvedAt: referenceNow },
  });
  if (!tombstone) throw new PrivacyConflict("PRIVACY_TOMBSTONE_FAILED");
  return deletionResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, deletionRequestId: request.id, replayed: false });
}

async function revokeDeletion(tx: Tx, command: Extract<PrivacyCommand, { action: "REVOKE_DELETION" }>, referenceNow: Date) {
  const request = await tx.constructionPrivacyDeletionRequest.findFirst({ where: { id: command.deletionRequestId, workspaceId: command.workspaceId } });
  if (!request) throw new ConstructionAccessDenied();
  if (!["REQUESTED", "BLOCKED", "ELIGIBLE"].includes(request.status)) throw new PrivacyConflict("PRIVACY_DELETION_REVOCATION_REFUSED");
  if (request.stateVersion !== command.expectedStateVersion) throw new PrivacyConflict("PRIVACY_DELETION_VERSION_CONFLICT");
  await tx.constructionPrivacyDeletionRequest.update({ where: { id: request.id }, data: { status: "REVOKED", stateVersion: { increment: 1 }, revokedAt: referenceNow } });
  return deletionResult(tx, { workspaceId: command.workspaceId, commandId: command.commandId, deletionRequestId: request.id, replayed: false });
}

export async function processPrivacyCommand(input: { userId: string; command: unknown; referenceNow?: Date }) {
  const command = privacyCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  const referenceNow = input.referenceNow ?? new Date();
  return withRefusal({ workspaceId: command.workspaceId, operationId: command.commandId, operationKind: command.action, inputHash: commandHash, actorId: input.userId }, () => prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:command:${command.commandId}`);
    await lock(tx, `${command.workspaceId}:privacy-lifecycle`);
    await requireOwner(tx, input.userId, command.workspaceId);
    const replay = await existingOperation(tx, command.workspaceId, command.commandId, commandHash);
    if (replay) return replay;
    let result;
    if (command.action === "CREATE_POLICY_DRAFT") result = await createPolicyDraft(tx, input.userId, command);
    else if (command.action === "SET_RETENTION_RULE") result = await setRetentionRule(tx, command);
    else if (command.action === "ACTIVATE_POLICY_SET") result = await activatePolicy(tx, input.userId, command);
    else if (command.action === "REVOKE_POLICY_SET") result = await revokePolicy(tx, command);
    else if (command.action === "PREPARE_EXPORT_MANIFEST") result = await prepareExport(tx, command, referenceNow);
    else if (command.action === "REQUEST_DELETION") result = await requestDeletion(tx, input.userId, command, referenceNow);
    else if (command.action === "APPROVE_DELETION") result = await approveDeletion(tx, input.userId, command, referenceNow);
    else result = await revokeDeletion(tx, command, referenceNow);
    await saveOperation(tx, { workspaceId: command.workspaceId, commandId: command.commandId, commandHash, operationKind: command.action, result, actorId: input.userId });
    return result;
  }, { maxWait: 5_000, timeout: 20_000 }));
}

async function secretLifecycle(workspaceId: string) {
  const [connectors, emails, accounting] = await Promise.all([
    prisma.constructionConnectorAccount.findMany({ where: { workspaceId }, select: { credentialRef: true, status: true, revokedAt: true } }),
    prisma.constructionEmailAccount.findMany({ where: { workspaceId }, select: { credentialStored: true, status: true, revokedAt: true } }),
    prisma.constructionAccountingAccount.findMany({ where: { workspaceId }, select: { credentialStored: true, status: true, revokedAt: true } }),
  ]);
  const states = [
    ...connectors.map((row) => ({ present: Boolean(row.credentialRef), revoked: Boolean(row.revokedAt) || row.status.toUpperCase().includes("REVOK") })),
    ...emails.map((row) => ({ present: row.credentialStored, revoked: Boolean(row.revokedAt) || row.status.toUpperCase().includes("REVOK") })),
    ...accounting.map((row) => ({ present: row.credentialStored, revoked: Boolean(row.revokedAt) || row.status.toUpperCase().includes("REVOK") })),
  ];
  return {
    absent: states.filter((row) => !row.present && !row.revoked).length,
    opaqueReference: states.filter((row) => row.present && !row.revoked).length,
    revoked: states.filter((row) => row.revoked).length,
    externallyRevokedVerified: 0 as const,
  };
}

async function evidenceLifecycle(workspaceId: string, rules: readonly PrivacyRule[], referenceNow: Date) {
  const rule = rules.find((item) => item.dataClass === "EVIDENCE");
  if (!rule) throw new PrivacyConflict("PRIVACY_POLICY_INCOMPLETE");
  const [evidence, tombstones] = await Promise.all([
    prisma.constructionOpenLoopEvidence.findMany({ where: { workspaceId }, select: { id: true, state: true, createdAt: true, loop: { select: { status: true } } } }),
    prisma.constructionPrivacyTombstone.findMany({ where: { workspaceId }, select: { targetType: true, targetId: true, externalDeletionState: true } }),
  ]);
  const tombstonedEvidence = new Set(tombstones.filter((row) => row.targetType === "OPEN_LOOP_EVIDENCE").map((row) => row.targetId));
  const cutoff = new Date(referenceNow.getTime() - rule.retentionDays * 86_400_000);
  const held = evidence.filter((row) => row.state === "verified" || ["ready_to_invoice", "closed"].includes(row.loop.status));
  return {
    active: evidence.filter((row) => !tombstonedEvidence.has(row.id)).length,
    held: held.length,
    retentionDue: evidence.filter((row) => !tombstonedEvidence.has(row.id) && !held.some((heldRow) => heldRow.id === row.id) && row.createdAt <= cutoff).length,
    tombstoned: tombstones.length,
    externalDeletionPending: tombstones.filter((row) => row.externalDeletionState === "EXTERNAL_DELETION_PENDING").length,
  };
}

async function deletionCandidates(workspaceId: string, rules: readonly PrivacyRule[], referenceNow: Date) {
  const rule = rules.find((item) => item.dataClass === "EVIDENCE");
  if (!rule) throw new PrivacyConflict("PRIVACY_POLICY_INCOMPLETE");
  const [openLoopEvidence, voiceNotes, media, emailLinks, tombstones, requests] = await Promise.all([
    prisma.constructionOpenLoopEvidence.findMany({ where: { workspaceId }, include: { loop: { select: { status: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.constructionVoiceNoteReference.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.constructionMessageMediaReference.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.constructionEmailEvidenceLink.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.constructionPrivacyTombstone.findMany({ where: { workspaceId }, select: { targetType: true, targetId: true } }),
    prisma.constructionPrivacyDeletionRequest.findMany({ where: { workspaceId }, select: { targetType: true, targetId: true, status: true }, orderBy: { requestedAt: "desc" } }),
  ]);
  const tombstoned = new Set(tombstones.map((row) => `${row.targetType}:${row.targetId}`));
  const activeRequest = new Map<string, string>();
  for (const request of requests) {
    const key = `${request.targetType}:${request.targetId}`;
    if (!activeRequest.has(key) && ["REQUESTED", "BLOCKED", "ELIGIBLE", "APPROVED"].includes(request.status)) activeRequest.set(key, request.status);
  }
  const cutoff = new Date(referenceNow.getTime() - rule.retentionDays * 86_400_000);
  const candidates: DeletionTarget[] = [
    ...openLoopEvidence.map((row) => ({
      type: "OPEN_LOOP_EVIDENCE" as const, id: row.id, createdAt: row.createdAt,
      held: row.state === "verified" || ["ready_to_invoice", "closed"].includes(row.loop.status),
      fingerprint: sha256Canonical({ type: "OPEN_LOOP_EVIDENCE", id: row.id, kind: row.kind, state: row.state, contentHash: row.contentHash }),
    })),
    ...voiceNotes.map((row) => ({ type: "VOICE_NOTE_REFERENCE" as const, id: row.id, createdAt: row.createdAt, held: false, fingerprint: sha256Canonical({ type: "VOICE_NOTE_REFERENCE", id: row.id, contentHash: row.contentHash }) })),
    ...media.map((row) => ({ type: "MESSAGE_MEDIA_REFERENCE" as const, id: row.id, createdAt: row.createdAt, held: false, fingerprint: sha256Canonical({ type: "MESSAGE_MEDIA_REFERENCE", id: row.id, contentHash: row.contentHash }) })),
    ...emailLinks.map((row) => ({ type: "EMAIL_EVIDENCE_LINK" as const, id: row.id, createdAt: row.createdAt, held: false, fingerprint: sha256Canonical({ type: "EMAIL_EVIDENCE_LINK", id: row.id, contentHash: row.contentHash }) })),
  ];
  return candidates
    .filter((target) => !tombstoned.has(`${target.type}:${target.id}`))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
    .slice(0, 100)
    .map((target) => ({
      targetType: target.type,
      targetId: target.id,
      targetFingerprint: target.fingerprint,
      createdAt: target.createdAt.toISOString(),
      held: target.held,
      retentionEligible: !target.held && target.createdAt <= cutoff && rule.deletionMode !== "RETAIN",
      activeRequestStatus: activeRequest.get(`${target.type}:${target.id}`) ?? null,
    }));
}

export async function privacyCockpitForUser(input: { userId: string; workspaceId: string; referenceNow?: Date }) {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const role = roleLabel(membership.role);
  const referenceNow = input.referenceNow ?? new Date();
  const workspace = await prisma.constructionWorkspace.findFirst({ where: { id: input.workspaceId, status: "active" }, select: { id: true, name: true } });
  if (!workspace) throw new ConstructionAccessDenied();
  if (role === "FIELD_WORKER") {
    const result = { schemaVersion: 1 as const, generatedAt: referenceNow.toISOString(), workspace, role, ownAccess: { membershipStatus: "ACTIVE" as const, accessClass: "PROJECT_ASSIGNED_ONLY" as const, canManagePrivacy: false as const }, externalEffectCount: 0 as const };
    rejectFieldPrivacyLeaks(result);
    return privacyCockpitSchema.parse(result);
  }
  const policyRows = await prisma.constructionPrivacyPolicySet.findMany({ where: { workspaceId: input.workspaceId }, include: { rules: { orderBy: { dataClass: "asc" } } }, orderBy: { version: "desc" } });
  const active = policyRows.find((row) => row.status === "ACTIVE") ?? null;
  const effectiveRules = active ? normalizeRules(active.rules) : baselinePrivacyRules();
  // Keep the projection connection-bounded. Each helper already performs a
  // small, deterministic batch; launching every batch at once can exhaust a
  // tenant's bounded PostgreSQL pool during recovery or local restore drills.
  const inventory = await prisma.$transaction((tx) => inventoryProjection(tx, input.workspaceId, effectiveRules));
  const secrets = await secretLifecycle(input.workspaceId);
  const evidence = await evidenceLifecycle(input.workspaceId, effectiveRules, referenceNow);
  const candidates = await deletionCandidates(input.workspaceId, effectiveRules, referenceNow);
  const operations = await prisma.constructionPrivacyOperation.findMany({ where: { workspaceId: input.workspaceId, operationKind: "PREPARE_EXPORT_MANIFEST" }, orderBy: { createdAt: "desc" }, take: 20, select: { commandId: true, result: true } });
  const deletions = await prisma.constructionPrivacyDeletionRequest.findMany({ where: { workspaceId: input.workspaceId }, include: { tombstone: true }, orderBy: { requestedAt: "desc" }, take: 100 });
  const refusalCount = await prisma.constructionPrivacyRefusal.count({ where: { workspaceId: input.workspaceId } });
  const exportManifests = operations.flatMap((operation) => {
    const parsed = privacyExportResultSchema.safeParse(operation.result);
    return parsed.success ? [{ commandId: operation.commandId, fingerprint: parsed.data.manifestFingerprint, generatedAt: parsed.data.generatedAt, totalRecordCount: parsed.data.totalRecordCount }] : [];
  });
  return privacyCockpitSchema.parse({
    schemaVersion: 1,
    generatedAt: referenceNow.toISOString(),
    workspace,
    role,
    activePolicy: active ? { id: active.id, version: active.version, stateVersion: active.stateVersion, status: "ACTIVE", policyHash: active.policyHash, rules: normalizeRules(active.rules) } : null,
    policyHistory: policyRows.map((row) => ({ id: row.id, version: row.version, stateVersion: row.stateVersion, status: row.status, policyHash: row.policyHash, ruleCount: row.rules.length })),
    inventory,
    secretLifecycle: secrets,
    evidenceLifecycle: evidence,
    exportManifests,
    deletionCandidates: candidates,
    deletionRequests: deletions.map((row) => ({ id: row.id, targetType: row.targetType, targetFingerprint: row.targetFingerprint, eligibilityFingerprint: row.eligibilityFingerprint, status: row.status, stateVersion: row.stateVersion, reasonCodes: row.reasonCodes, requestedAt: row.requestedAt.toISOString(), approvedAt: row.approvedAt?.toISOString() ?? null, externalDeletionState: row.tombstone?.externalDeletionState ?? null })),
    refusalCount,
    externalEffectCount: 0,
  });
}
