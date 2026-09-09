import type { Prisma } from "@prisma-client";
import {
  activateProviderActivationGrantSchema,
  prepareProviderActivationGrantSchema,
  releaseProviderSpendSchema,
  reserveProviderSpendSchema,
  revokeProviderActivationGrantSchema,
  setProviderLaneControlSchema,
  settleProviderSpendSchema,
} from "@/lib/construction-operating-assistant-r37b/contracts";
import { r37aFingerprint } from "@/lib/construction-operating-assistant-r37a/contracts";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

const LANE_CONTROL_ID = "provider-lane-global";

export type ProviderTrustedClock = Readonly<{
  now: () => Date;
}>;

export function readProviderTrustedNow(clock?: ProviderTrustedClock) {
  let value: unknown;
  try {
    value = clock?.now() ?? new Date();
  } catch {
    throw new Error("R37_TRUSTED_CLOCK_INVALID");
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("R37_TRUSTED_CLOCK_INVALID");
  }
  return new Date(value.getTime());
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function replaySnapshot<T>(value: Prisma.JsonValue): T {
  return value as T;
}

function commandFingerprint(kind: string, value: Record<string, unknown>) {
  return r37aFingerprint({
    kind,
    ...value,
    maxTotalSpendMicros:
      typeof value.maxTotalSpendMicros === "bigint"
        ? value.maxTotalSpendMicros.toString()
        : value.maxTotalSpendMicros,
    requestedMicros:
      typeof value.requestedMicros === "bigint"
        ? value.requestedMicros.toString()
        : value.requestedMicros,
    settledMicros:
      typeof value.settledMicros === "bigint"
        ? value.settledMicros.toString()
        : value.settledMicros,
    expiresAt:
      value.expiresAt instanceof Date ? value.expiresAt.toISOString() : value.expiresAt,
    now: undefined,
  });
}

function grantProjection(grant: {
  id: string;
  workspaceId: string;
  candidateKey: string;
  exactModelId: string;
  sealedExecutorFingerprint: string;
  allowedCaseFingerprints: string[];
  status: string;
  expiresAt: Date;
  maxCallCount: number;
  maxTotalSpendMicros: bigint;
  attemptCount: number;
  reservedCallCount: number;
  reservedSpendMicros: bigint;
  settledCallCount: number;
  settledSpendMicros: bigint;
  releasedCallCount: number;
  version: number;
}) {
  return {
    ...grant,
    expiresAt: grant.expiresAt.toISOString(),
    maxTotalSpendMicros: grant.maxTotalSpendMicros.toString(),
    reservedSpendMicros: grant.reservedSpendMicros.toString(),
    settledSpendMicros: grant.settledSpendMicros.toString(),
    externalTransportPerformed: false as const,
  };
}

function attemptProjection(attempt: {
  id: string;
  grantId: string;
  workspaceId: string;
  idempotencyKey: string;
  caseFingerprint: string;
  exactModelId: string;
  requestFingerprint: string;
  state: string;
  reservedMicros: bigint;
  settledMicros: bigint | null;
  releasedMicros: bigint | null;
  version: number;
}) {
  return {
    ...attempt,
    reservedMicros: attempt.reservedMicros.toString(),
    settledMicros: attempt.settledMicros?.toString() ?? null,
    releasedMicros: attempt.releasedMicros?.toString() ?? null,
    externalTransportPerformed: false as const,
  };
}

async function lockKey(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`construction-r37b:${key}`}, 0))::text AS acquired
  `;
}

async function requireOwnerOrAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
  workspaceId: string,
) {
  const membership = await requireActiveConstructionMember(tx, actorId, workspaceId);
  if (membership.role === "member") throw new ConstructionAccessDenied();
}

async function requireSystemAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new ConstructionAccessDenied();
}

async function existingDecision(
  tx: Prisma.TransactionClient,
  commandId: string,
  fingerprint: string,
) {
  const decision = await tx.providerActivationDecision.findUnique({ where: { commandId } });
  if (!decision) return null;
  if (decision.commandFingerprint !== fingerprint) {
    throw new Error("R37B_ALTERED_REPLAY_REFUSED");
  }
  return decision;
}

async function requireLaneEnabled(tx: Prisma.TransactionClient) {
  const lane = await tx.providerLaneControl.findUnique({ where: { id: LANE_CONTROL_ID } });
  if (lane?.state !== "ENABLED") throw new Error("R37B_PROVIDER_LANE_DISABLED");
  return lane;
}

export async function prepareProviderActivationGrant(rawInput: unknown, clock?: ProviderTrustedClock) {
  const input = prepareProviderActivationGrantSchema.parse(rawInput);
  const now = readProviderTrustedNow(clock);
  if (input.expiresAt <= now) throw new Error("R37B_GRANT_EXPIRY_REQUIRED");
  const fingerprint = commandFingerprint("PREPARE_GRANT", input);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `command:${input.commandId}`);
    await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
    const replay = await existingDecision(tx, input.commandId, fingerprint);
    if (replay?.grantId) {
      return { grant: replaySnapshot<ReturnType<typeof grantProjection>>(replay.resultSnapshot), replayed: true };
    }
    const grant = await tx.providerActivationGrant.create({
      data: {
        workspaceId: input.workspaceId,
        candidateKey: input.candidateKey,
        exactModelId: input.exactModelId,
        sealedExecutorFingerprint: input.sealedExecutorFingerprint,
        allowedCaseFingerprints: [...new Set(input.allowedCaseFingerprints)].sort(),
        expiresAt: input.expiresAt,
        maxCallCount: input.maxCallCount,
        maxTotalSpendMicros: input.maxTotalSpendMicros,
        createdById: input.actorId,
      },
    });
    const projection = grantProjection(grant);
    await tx.providerActivationDecision.create({
      data: { commandId: input.commandId, workspaceId: input.workspaceId, grantId: grant.id, kind: "PREPARE_GRANT", commandFingerprint: fingerprint, resultSnapshot: json(projection), actorId: input.actorId },
    });
    await appendConstructionAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.actorId, entityType: "provider_activation_grant", entityId: grant.id, action: "provider_activation_grant_prepared", reasonCode: "LOCAL_SYNTHETIC_ONLY", metadata: json({ candidateKey: input.candidateKey, exactModelId: input.exactModelId, maxCallCount: input.maxCallCount, maxTotalSpendMicros: input.maxTotalSpendMicros.toString(), externalTransportPerformed: false }) });
    return { grant: projection, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function activateProviderActivationGrant(rawInput: unknown, clock?: ProviderTrustedClock) {
  const input = activateProviderActivationGrantSchema.parse(rawInput);
  const now = readProviderTrustedNow(clock);
  const fingerprint = commandFingerprint("ACTIVATE_GRANT", input);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, LANE_CONTROL_ID);
    await lockKey(tx, `grant:${input.grantId}`);
    await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
    const replay = await existingDecision(tx, input.commandId, fingerprint);
    if (replay?.grantId) {
      return { grant: replaySnapshot<ReturnType<typeof grantProjection>>(replay.resultSnapshot), replayed: true };
    }
    await requireLaneEnabled(tx);
    const grant = await tx.providerActivationGrant.findFirst({ where: { id: input.grantId, workspaceId: input.workspaceId } });
    if (!grant) throw new ConstructionAccessDenied();
    if (grant.status !== "PREPARED") throw new Error("R37B_GRANT_NOT_PREPARED");
    if (grant.version !== input.expectedVersion) throw new Error("R37B_STALE_GRANT_VERSION");
    if (grant.expiresAt <= now) throw new Error("R37B_GRANT_EXPIRED");
    if (grant.sealedExecutorFingerprint !== input.sealedExecutorFingerprint) throw new Error("R37B_SEALED_EXECUTOR_DRIFT");
    const updated = await tx.providerActivationGrant.update({ where: { id: grant.id }, data: { status: "ACTIVE", activatedAt: now, version: { increment: 1 } } });
    const projection = grantProjection(updated);
    await tx.providerActivationDecision.create({ data: { commandId: input.commandId, workspaceId: input.workspaceId, grantId: grant.id, kind: "ACTIVATE_GRANT", commandFingerprint: fingerprint, resultSnapshot: json(projection), actorId: input.actorId } });
    await appendConstructionAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.actorId, entityType: "provider_activation_grant", entityId: grant.id, action: "provider_activation_grant_activated", reasonCode: "BOUNDED_LOCAL_AUTHORITY", metadata: json({ version: updated.version, externalTransportPerformed: false }) });
    return { grant: projection, replayed: false };
  });
}

export async function reserveProviderSpend(rawInput: unknown, clock?: ProviderTrustedClock) {
  const input = reserveProviderSpendSchema.parse(rawInput);
  const now = readProviderTrustedNow(clock);
  const fingerprint = commandFingerprint("RESERVE_SPEND", input);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, LANE_CONTROL_ID);
    await lockKey(tx, `grant:${input.grantId}`);
    await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
    const grant = await tx.providerActivationGrant.findFirst({ where: { id: input.grantId, workspaceId: input.workspaceId } });
    if (!grant) throw new ConstructionAccessDenied();
    // Candidate identity participates in the reservation fingerprint and must
    // match even when the idempotency key already has a durable reservation.
    if (grant.candidateKey !== input.candidateKey) throw new Error("R37B_CANDIDATE_MISMATCH");
    const existing = await tx.providerSpendAttempt.findUnique({ where: { grantId_idempotencyKey: { grantId: input.grantId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw new Error("R37B_RESERVATION_IDEMPOTENCY_CONFLICT");
      return { attempt: attemptProjection(existing), replayed: true };
    }
    await requireLaneEnabled(tx);
    if (grant.status !== "ACTIVE") throw new Error("R37B_GRANT_INACTIVE");
    if (grant.expiresAt <= now) throw new Error("R37B_GRANT_EXPIRED");
    if (grant.sealedExecutorFingerprint !== input.sealedExecutorFingerprint) throw new Error("R37B_SEALED_EXECUTOR_DRIFT");
    if (grant.exactModelId !== input.exactModelId) throw new Error("R37B_EXACT_MODEL_MISMATCH");
    if (!grant.allowedCaseFingerprints.includes(input.caseFingerprint)) throw new Error("R37B_CASE_NOT_ALLOWED");
    if (grant.attemptCount >= grant.maxCallCount) throw new Error("R37B_CALL_CEILING_EXCEEDED");
    if (grant.reservedSpendMicros + grant.settledSpendMicros + input.requestedMicros > grant.maxTotalSpendMicros) throw new Error("R37B_SPEND_CEILING_EXCEEDED");
    const attempt = await tx.providerSpendAttempt.create({ data: { grantId: grant.id, workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey, caseFingerprint: input.caseFingerprint, exactModelId: input.exactModelId, requestFingerprint: fingerprint, reservedMicros: input.requestedMicros, reservedAt: now } });
    await tx.providerActivationGrant.update({ where: { id: grant.id }, data: { attemptCount: { increment: 1 }, reservedCallCount: { increment: 1 }, reservedSpendMicros: { increment: input.requestedMicros }, version: { increment: 1 } } });
    await appendConstructionAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.actorId, entityType: "provider_spend_attempt", entityId: attempt.id, action: "provider_spend_reserved", reasonCode: "INTEGER_MICRODOLLAR_RESERVATION", metadata: json({ grantId: grant.id, reservedMicros: input.requestedMicros.toString(), externalTransportPerformed: false }) });
    return { attempt: attemptProjection(attempt), replayed: false };
  });
}

async function terminalAttempt(
  rawInput: unknown,
  kind: "SETTLE_SPEND" | "RELEASE_SPEND",
  clock?: ProviderTrustedClock,
) {
  const input = kind === "SETTLE_SPEND" ? settleProviderSpendSchema.parse(rawInput) : releaseProviderSpendSchema.parse(rawInput);
  const now = readProviderTrustedNow(clock);
  const fingerprint = commandFingerprint(kind, input);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `grant:${input.grantId}`);
    await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
    const replay = await existingDecision(tx, input.commandId, fingerprint);
    if (replay?.attemptId) {
      return { attempt: replaySnapshot<ReturnType<typeof attemptProjection>>(replay.resultSnapshot), replayed: true };
    }
    const grant = await tx.providerActivationGrant.findFirst({ where: { id: input.grantId, workspaceId: input.workspaceId } });
    const attempt = await tx.providerSpendAttempt.findFirst({ where: { id: input.attemptId, grantId: input.grantId, workspaceId: input.workspaceId } });
    if (!grant || !attempt) throw new ConstructionAccessDenied();
    if (attempt.version !== input.expectedVersion) throw new Error("R37B_STALE_ATTEMPT_VERSION");
    if (attempt.state !== "RESERVED") throw new Error("R37B_ATTEMPT_ALREADY_TERMINAL");
    const settledMicros = kind === "SETTLE_SPEND" ? (input as unknown as { settledMicros: bigint }).settledMicros : 0n;
    if (settledMicros > attempt.reservedMicros) throw new Error("R37B_SETTLEMENT_EXCEEDS_RESERVATION");
    const releasedMicros = attempt.reservedMicros - settledMicros;
    const updated = await tx.providerSpendAttempt.update({ where: { id: attempt.id }, data: kind === "SETTLE_SPEND" ? { state: "SETTLED", settledMicros, releasedMicros, settledAt: now, version: { increment: 1 } } : { state: "RELEASED", releasedMicros: attempt.reservedMicros, releasedAt: now, version: { increment: 1 } } });
    await tx.providerActivationGrant.update({ where: { id: grant.id }, data: kind === "SETTLE_SPEND" ? { reservedCallCount: { decrement: 1 }, reservedSpendMicros: { decrement: attempt.reservedMicros }, settledCallCount: { increment: 1 }, settledSpendMicros: { increment: settledMicros }, version: { increment: 1 } } : { reservedCallCount: { decrement: 1 }, reservedSpendMicros: { decrement: attempt.reservedMicros }, releasedCallCount: { increment: 1 }, version: { increment: 1 } } });
    const projection = attemptProjection(updated);
    await tx.providerActivationDecision.create({ data: { commandId: input.commandId, workspaceId: input.workspaceId, grantId: grant.id, attemptId: attempt.id, kind, commandFingerprint: fingerprint, resultSnapshot: json(projection), actorId: input.actorId } });
    await appendConstructionAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.actorId, entityType: "provider_spend_attempt", entityId: attempt.id, action: kind === "SETTLE_SPEND" ? "provider_spend_settled" : "provider_spend_released", reasonCode: "SINGLE_TERMINAL_TRANSITION", metadata: json({ settledMicros: settledMicros.toString(), releasedMicros: releasedMicros.toString(), externalTransportPerformed: false }) });
    return { attempt: projection, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export function settleProviderSpend(rawInput: unknown, clock?: ProviderTrustedClock) {
  return terminalAttempt(rawInput, "SETTLE_SPEND", clock);
}

export function releaseProviderSpend(rawInput: unknown, clock?: ProviderTrustedClock) {
  return terminalAttempt(rawInput, "RELEASE_SPEND", clock);
}

export async function revokeProviderActivationGrant(rawInput: unknown, clock?: ProviderTrustedClock) {
  const input = revokeProviderActivationGrantSchema.parse(rawInput);
  const now = readProviderTrustedNow(clock);
  const fingerprint = commandFingerprint("REVOKE_GRANT", input);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `grant:${input.grantId}`);
    await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
    const replay = await existingDecision(tx, input.commandId, fingerprint);
    if (replay?.grantId) {
      return { grant: replaySnapshot<ReturnType<typeof grantProjection>>(replay.resultSnapshot), replayed: true };
    }
    const grant = await tx.providerActivationGrant.findFirst({ where: { id: input.grantId, workspaceId: input.workspaceId } });
    if (!grant) throw new ConstructionAccessDenied();
    if (grant.version !== input.expectedVersion) throw new Error("R37B_STALE_GRANT_VERSION");
    if (grant.status === "REVOKED") throw new Error("R37B_GRANT_ALREADY_REVOKED");
    const updated = await tx.providerActivationGrant.update({ where: { id: grant.id }, data: { status: "REVOKED", revokedAt: now, version: { increment: 1 } } });
    const projection = grantProjection(updated);
    await tx.providerActivationDecision.create({ data: { commandId: input.commandId, workspaceId: input.workspaceId, grantId: grant.id, kind: "REVOKE_GRANT", commandFingerprint: fingerprint, resultSnapshot: json(projection), actorId: input.actorId } });
    await appendConstructionAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.actorId, entityType: "provider_activation_grant", entityId: grant.id, action: "provider_activation_grant_revoked", reasonCode: input.reason, metadata: json({ version: updated.version, externalTransportPerformed: false }) });
    return { grant: projection, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function setProviderLaneControl(rawInput: unknown, clock?: ProviderTrustedClock) {
  const input = setProviderLaneControlSchema.parse(rawInput);
  const now = readProviderTrustedNow(clock);
  const fingerprint = commandFingerprint("SET_LANE_CONTROL", input);
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, LANE_CONTROL_ID);
    await requireSystemAdmin(tx, input.actorId);
    const replay = await existingDecision(tx, input.commandId, fingerprint);
    if (replay) {
      return { control: replaySnapshot<{ id: string; state: string; reason: string; version: number; externalTransportPerformed: false }>(replay.resultSnapshot), replayed: true, externalTransportPerformed: false as const };
    }
    const current = await tx.providerLaneControl.findUnique({ where: { id: LANE_CONTROL_ID } });
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== input.expectedVersion) throw new Error("R37B_STALE_LANE_VERSION");
    const control = current
      ? await tx.providerLaneControl.update({ where: { id: LANE_CONTROL_ID }, data: { state: input.state, reason: input.reason, lastChangedById: input.actorId, changedAt: now, version: { increment: 1 } } })
      : await tx.providerLaneControl.create({ data: { id: LANE_CONTROL_ID, state: input.state, reason: input.reason, lastChangedById: input.actorId, changedAt: now } });
    await tx.providerActivationDecision.create({ data: { commandId: input.commandId, kind: "SET_LANE_CONTROL", commandFingerprint: fingerprint, resultSnapshot: json({ id: control.id, state: control.state, reason: control.reason, version: control.version, externalTransportPerformed: false }), actorId: input.actorId } });
    return { control, replayed: false, externalTransportPerformed: false as const };
  }, { isolationLevel: "Serializable" });
}
