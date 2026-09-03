import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import {
  assertSealedSyntheticAttempt,
  controlledProviderRunResultSchema,
  controlledRunCommandFingerprint,
  executeControlledSyntheticAttemptSchema,
  type ControlledProviderRunResult,
  type ExecuteControlledSyntheticAttemptInput,
} from "@/lib/construction-operating-assistant-r37c/contracts";
import { r37aSyntheticEvidenceSchema } from "@/lib/construction-operating-assistant-r37a/contracts";
import {
  runSyntheticAttempt,
  type SealedSyntheticAttempt,
  type SyntheticProviderTransport,
} from "@/server/construction-operating-assistant-r37a/sealed-executor";
import {
  releaseProviderSpend,
  readProviderTrustedNow,
  reserveProviderSpend,
  settleProviderSpend,
  type ProviderTrustedClock,
} from "@/server/construction-operating-assistant-r37b/activation";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

const LANE_CONTROL_ID = "provider-lane-global";
const inFlightRuns = new Map<string, Readonly<{
  commandFingerprint: string;
  promise: Promise<ControlledProviderRunResult>;
}>>();

export type ControlledProviderExecutionOptions = Readonly<{
  clock?: ProviderTrustedClock;
}>;

function fixedClock(now: Date): ProviderTrustedClock {
  return { now: () => new Date(now.getTime()) };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function lockRun(tx: Prisma.TransactionClient, grantId: string, idempotencyKey: string) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`construction-r37c:${grantId}:${idempotencyKey}`}, 0)
    )::text AS acquired
  `;
}

function reserveIdempotencyKey(input: ExecuteControlledSyntheticAttemptInput) {
  return `r37c:${input.idempotencyKey}`;
}

function result(input: Readonly<{
  disposition: ControlledProviderRunResult["disposition"];
  run: {
    id: string;
    version: number;
    spendAttemptId: string | null;
    evidenceSnapshot: Prisma.JsonValue | null;
    failureCode: string | null;
  };
  adapterInvoked: boolean;
}>): ControlledProviderRunResult {
  return controlledProviderRunResultSchema.parse({
    disposition: input.disposition,
    runId: input.run.id,
    runVersion: input.run.version,
    spendAttemptId: input.run.spendAttemptId,
    evidence: input.run.evidenceSnapshot
      ? r37aSyntheticEvidenceSchema.parse(input.run.evidenceSnapshot)
      : null,
    failureCode: input.run.failureCode,
    adapterInvoked: input.adapterInvoked,
    externalTransportPerformed: false,
  });
}

function boundedFailureCode(error: unknown) {
  if (error instanceof Error && /^R37[AC]_[A-Z0-9_]+$/u.test(error.message)) {
    return error.message;
  }
  return "R37C_SYNTHETIC_ADAPTER_FAILED";
}

async function ensureRun(
  input: ExecuteControlledSyntheticAttemptInput,
  commandFingerprint: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockRun(tx, input.grantId, input.idempotencyKey);
    const membership = await requireActiveConstructionMember(tx, input.actorId, input.workspaceId);
    if (membership.role === "member") throw new ConstructionAccessDenied();
    const grant = await tx.providerActivationGrant.findFirst({
      where: { id: input.grantId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!grant) throw new ConstructionAccessDenied();
    const existing = await tx.controlledProviderRun.findUnique({
      where: {
        grantId_idempotencyKey: {
          grantId: input.grantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.workspaceId !== input.workspaceId) throw new ConstructionAccessDenied();
      if (existing.commandFingerprint !== commandFingerprint) {
        throw new Error("R37C_ALTERED_REPLAY_REFUSED");
      }
      return existing;
    }
    const run = await tx.controlledProviderRun.create({
      data: {
        workspaceId: input.workspaceId,
        grantId: input.grantId,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint,
        sealedAttemptFingerprint: input.sealed.sealedAttemptFingerprint,
        caseFingerprint: input.sealed.sandboxCase.caseFingerprint,
        exactModelId: input.sealed.authorization.exactModelId ?? "",
        sealedExecutorFingerprint: input.sealedExecutorFingerprint,
        reservedMicros: input.reservedMicros,
        sealedSnapshot: json(input.sealed),
        settlementCommandId: randomUUID(),
        releaseCommandId: randomUUID(),
        createdById: input.actorId,
      },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorId,
      entityType: "controlled_provider_run",
      entityId: run.id,
      action: "controlled_provider_run_prepared",
      reasonCode: "LOCAL_SYNTHETIC_ONLY",
      metadata: json({
        grantId: input.grantId,
        sealedAttemptFingerprint: input.sealed.sealedAttemptFingerprint,
        reservedMicros: input.reservedMicros.toString(),
        externalTransportPerformed: false,
      }),
    });
    return run;
  });
}

async function settleRecordedEvidence(
  input: ExecuteControlledSyntheticAttemptInput,
  runId: string,
  adapterInvoked: boolean,
  now: Date,
) {
  const run = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.state === "SUCCEEDED") {
    return result({ disposition: adapterInvoked ? "SUCCEEDED" : "SUCCEEDED_REPLAY", run, adapterInvoked });
  }
  if (run.state !== "EVIDENCE_RECORDED" || !run.spendAttemptId || !run.evidenceSnapshot) {
    throw new Error("R37C_SETTLEMENT_STATE_INVALID");
  }
  const evidence = r37aSyntheticEvidenceSchema.parse(run.evidenceSnapshot);
  const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: run.spendAttemptId } });
  await settleProviderSpend({
    commandId: run.settlementCommandId,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    grantId: input.grantId,
    attemptId: attempt.id,
    expectedVersion: attempt.version,
    settledMicros: BigInt(evidence.costMicros),
  }, fixedClock(now));
  const completed = await prisma.controlledProviderRun.update({
    where: { id: run.id },
    data: {
      state: "SUCCEEDED",
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: now,
      version: { increment: 1 },
    },
  });
  return result({ disposition: adapterInvoked ? "SUCCEEDED" : "SUCCEEDED_REPLAY", run: completed, adapterInvoked });
}

async function releaseFailedAttempt(
  input: ExecuteControlledSyntheticAttemptInput,
  runId: string,
  adapterInvoked: boolean,
  dispositionOnComplete: "FAILED" | "FAILED_REPLAY",
  now: Date,
) {
  const run = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.state === "FAILED") {
    return result({ disposition: adapterInvoked ? "FAILED" : "FAILED_REPLAY", run, adapterInvoked });
  }
  if (run.state !== "RELEASE_PENDING" || !run.spendAttemptId || !run.failureCode) {
    throw new Error("R37C_RELEASE_STATE_INVALID");
  }
  const attempt = await prisma.providerSpendAttempt.findUniqueOrThrow({ where: { id: run.spendAttemptId } });
  await releaseProviderSpend({
    commandId: run.releaseCommandId,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    grantId: input.grantId,
    attemptId: attempt.id,
    expectedVersion: attempt.version,
  }, fixedClock(now));
  const completed = await prisma.controlledProviderRun.update({
    where: { id: run.id },
    data: {
      state: "FAILED",
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: now,
      version: { increment: 1 },
    },
  });
  return result({ disposition: dispositionOnComplete, run: completed, adapterInvoked });
}

async function markReleasePending(
  runId: string,
  spendAttemptId: string,
  failureCode: string,
  now: Date,
) {
  return prisma.controlledProviderRun.updateMany({
    where: {
      id: runId,
      OR: [
        { state: "PREPARED" },
        { state: "RUNNING", leaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      state: "RELEASE_PENDING",
      spendAttemptId,
      failureCode,
      leaseToken: null,
      leaseExpiresAt: null,
      version: { increment: 1 },
    },
  });
}

async function executeParsedControlledSyntheticAttempt(
  input: ExecuteControlledSyntheticAttemptInput,
  adapter: SyntheticProviderTransport,
  now: Date,
  clock?: ProviderTrustedClock,
): Promise<ControlledProviderRunResult> {
  const commandFingerprint = controlledRunCommandFingerprint(input);
  let run = await ensureRun(input, commandFingerprint);

  if (run.state === "SUCCEEDED") {
    return result({ disposition: "SUCCEEDED_REPLAY", run, adapterInvoked: false });
  }
  if (run.state === "FAILED") {
    return result({ disposition: "FAILED_REPLAY", run, adapterInvoked: false });
  }
  if (run.state === "EVIDENCE_RECORDED") {
    return settleRecordedEvidence(input, run.id, false, now);
  }
  if (run.state === "RELEASE_PENDING") {
    return releaseFailedAttempt(input, run.id, false, "FAILED_REPLAY", now);
  }

  if (run.state === "RUNNING" && run.leaseExpiresAt && run.leaseExpiresAt > now) {
    return result({ disposition: "IN_PROGRESS", run, adapterInvoked: false });
  }

  const reservation = await reserveProviderSpend({
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    grantId: input.grantId,
    idempotencyKey: reserveIdempotencyKey(input),
    caseFingerprint: input.sealed.sandboxCase.caseFingerprint,
    exactModelId: input.sealed.authorization.exactModelId,
    sealedExecutorFingerprint: input.sealedExecutorFingerprint,
    requestedMicros: input.reservedMicros,
  }, fixedClock(now));

  const leaseToken = randomUUID();
  try {
    const claim = await prisma.$transaction(async (tx) => {
      await lockRun(tx, input.grantId, input.idempotencyKey);
      await requireActiveConstructionMember(tx, input.actorId, input.workspaceId);
      const current = await tx.controlledProviderRun.findUniqueOrThrow({ where: { id: run.id } });
      if (current.state === "SUCCEEDED" || current.state === "FAILED" || current.state === "EVIDENCE_RECORDED" || current.state === "RELEASE_PENDING") {
        return { claimed: false as const, run: current };
      }
      if (current.state === "RUNNING" && current.leaseExpiresAt && current.leaseExpiresAt > now) {
        return { claimed: false as const, run: current };
      }
      const lane = await tx.providerLaneControl.findUnique({ where: { id: LANE_CONTROL_ID } });
      const grant = await tx.providerActivationGrant.findFirst({
        where: { id: input.grantId, workspaceId: input.workspaceId },
      });
      if (!grant) throw new ConstructionAccessDenied();
      if (lane?.state !== "ENABLED") throw new Error("R37C_PROVIDER_LANE_DISABLED_AT_USE");
      if (grant.status !== "ACTIVE" || grant.expiresAt <= now) throw new Error("R37C_GRANT_INACTIVE_AT_USE");
      if (
        grant.sealedExecutorFingerprint !== input.sealedExecutorFingerprint ||
        grant.exactModelId !== input.sealed.authorization.exactModelId ||
        !grant.allowedCaseFingerprints.includes(input.sealed.sandboxCase.caseFingerprint)
      ) {
        throw new Error("R37C_GRANT_BINDING_DRIFT_AT_USE");
      }
      const claimed = await tx.controlledProviderRun.update({
        where: { id: current.id },
        data: {
          state: "RUNNING",
          spendAttemptId: reservation.attempt.id,
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + input.leaseDurationMs),
          startedAt: current.startedAt ?? now,
          version: { increment: 1 },
        },
      });
      return { claimed: true as const, run: claimed };
    });

    if (!claim.claimed) {
      run = claim.run;
      if (run.state === "SUCCEEDED") return result({ disposition: "SUCCEEDED_REPLAY", run, adapterInvoked: false });
      if (run.state === "FAILED") return result({ disposition: "FAILED_REPLAY", run, adapterInvoked: false });
      if (run.state === "EVIDENCE_RECORDED") return settleRecordedEvidence(input, run.id, false, now);
      if (run.state === "RELEASE_PENDING") return releaseFailedAttempt(input, run.id, false, "FAILED_REPLAY", now);
      return result({ disposition: "IN_PROGRESS", run, adapterInvoked: false });
    }
  } catch (error) {
    const marked = await markReleasePending(
      run.id,
      reservation.attempt.id,
      boundedFailureCode(error),
      now,
    );
    if (marked.count === 1) return releaseFailedAttempt(input, run.id, false, "FAILED", now);
    const current = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: run.id } });
    if (current.state === "SUCCEEDED") return result({ disposition: "SUCCEEDED_REPLAY", run: current, adapterInvoked: false });
    if (current.state === "FAILED") return result({ disposition: "FAILED_REPLAY", run: current, adapterInvoked: false });
    if (current.state === "EVIDENCE_RECORDED") return settleRecordedEvidence(input, current.id, false, now);
    if (current.state === "RELEASE_PENDING") return releaseFailedAttempt(input, current.id, false, "FAILED_REPLAY", now);
    return result({ disposition: "IN_PROGRESS", run: current, adapterInvoked: false });
  }

  try {
    const evidence = await runSyntheticAttempt({
      sealed: input.sealed as SealedSyntheticAttempt,
      adapter,
      adapterContext: { runId: run.id, leaseToken },
      now: now.toISOString(),
    });
    const terminalNow = readProviderTrustedNow(clock);
    const stored = await prisma.controlledProviderRun.updateMany({
      where: {
        id: run.id,
        state: "RUNNING",
        leaseToken,
        leaseExpiresAt: { gt: terminalNow },
      },
      data: {
        state: "EVIDENCE_RECORDED",
        evidenceSnapshot: json(evidence),
        evidenceFingerprint: evidence.evidenceFingerprint,
        leaseToken: null,
        leaseExpiresAt: null,
        version: { increment: 1 },
      },
    });
    if (stored.count !== 1) {
      const expired = await prisma.controlledProviderRun.updateMany({
        where: {
          id: run.id,
          state: "RUNNING",
          leaseToken,
          leaseExpiresAt: { lte: terminalNow },
        },
        data: {
          state: "RELEASE_PENDING",
          failureCode: "R37C_LEASE_EXPIRED_BEFORE_EVIDENCE",
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (expired.count === 1) {
        return releaseFailedAttempt(input, run.id, true, "FAILED", terminalNow);
      }
      const current = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: run.id } });
      return result({ disposition: "IN_PROGRESS", run: current, adapterInvoked: true });
    }
    return settleRecordedEvidence(input, run.id, true, terminalNow);
  } catch (error) {
    const failureNow = readProviderTrustedNow(clock);
    const failureCode = boundedFailureCode(error);
    const marked = await prisma.controlledProviderRun.updateMany({
      where: { id: run.id, state: "RUNNING", leaseToken },
      data: {
        state: "RELEASE_PENDING",
        failureCode,
        leaseToken: null,
        leaseExpiresAt: null,
        version: { increment: 1 },
      },
    });
    if (marked.count !== 1) {
      const current = await prisma.controlledProviderRun.findUniqueOrThrow({ where: { id: run.id } });
      return result({ disposition: "IN_PROGRESS", run: current, adapterInvoked: true });
    }
    return releaseFailedAttempt(input, run.id, true, "FAILED", failureNow);
  }
}

export async function executeControlledSyntheticAttempt(
  rawInput: unknown,
  adapter: SyntheticProviderTransport,
  options: ControlledProviderExecutionOptions = {},
): Promise<ControlledProviderRunResult> {
  const input = executeControlledSyntheticAttemptSchema.parse(rawInput);
  const now = readProviderTrustedNow(options.clock);
  assertSealedSyntheticAttempt(input.sealed);
  if (!input.sealed.authorization.exactModelId) {
    throw new Error("R37C_EXACT_MODEL_REQUIRED");
  }
  if (input.reservedMicros < BigInt(input.sealed.sandboxCase.ceilings.maxCostMicros)) {
    throw new Error("R37C_RESERVATION_BELOW_CASE_CEILING");
  }
  const commandFingerprint = controlledRunCommandFingerprint(input);
  const inFlightKey = `${input.grantId}:${input.idempotencyKey}`;
  const existing = inFlightRuns.get(inFlightKey);
  if (existing) {
    if (existing.commandFingerprint !== commandFingerprint) {
      throw new Error("R37C_ALTERED_REPLAY_REFUSED");
    }
    const completed = await existing.promise;
    return controlledProviderRunResultSchema.parse({
      ...completed,
      disposition:
        completed.disposition === "SUCCEEDED"
          ? "SUCCEEDED_REPLAY"
          : completed.disposition === "FAILED"
            ? "FAILED_REPLAY"
            : completed.disposition,
      adapterInvoked: false,
    });
  }
  const promise = executeParsedControlledSyntheticAttempt(input, adapter, now, options.clock);
  inFlightRuns.set(inFlightKey, { commandFingerprint, promise });
  try {
    return await promise;
  } finally {
    if (inFlightRuns.get(inFlightKey)?.promise === promise) {
      inFlightRuns.delete(inFlightKey);
    }
  }
}
