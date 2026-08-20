import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma-client";

/**
 * DURABLE AI OPERATIONS — the reservation layer in front of every logical
 * model call of the quote pipeline. Third copy of the repo's durable-work
 * motif (MoneyIntent, TaskWorkflowStepRun), kept deliberately identical:
 * reserve idempotently, claim by CAS with a lease, close FENCED on the
 * lockedBy token.
 *
 * WHAT THIS LAYER GUARANTEES, precisely:
 *
 *  1. Two concurrent triggers of the same logical pipeline create ONE
 *     logical operation per stage (the operationKey is deterministic from
 *     what exists BEFORE any result does — `engine:{taskId}:{runKey}:{stage}`,
 *     never a count+1, which a duplicated trigger would race past) and only
 *     one of them claims it.
 *  2. Every provider call ACTUALLY EMITTED gets its own append-only AiUsage
 *     attempt row. Never deduplicated: if two calls were really billed, two
 *     rows exist and both costs count. The partial unique index on
 *     (operationId, attempt) turns an accidental same-attempt double write
 *     into a hard P2002 — a BUG to surface, never a condition to swallow.
 *  3. A zombie whose lease expired cannot close the operation over its
 *     successor: every terminal write re-checks lockedBy in its WHERE.
 *
 * The one gap that cannot be closed without provider-side idempotency (the
 * Messages API offers none — documented at research.ts): a call emitted
 * whose process dies before the usage row is written is billed without a
 * trace. It is made VISIBLE instead of invisible: an operation with
 * attempts > its usage rows carries AI_ATTEMPT_UNACCOUNTED on the actual.
 */

const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 2;

/** Deterministic backoff, same shape as the step runner: 1, 4 minutes. */
const backoffMs = (attempts: number) => Math.min(attempts * attempts, 30) * 60 * 1000;

export type AiOperationClaim = {
  operationId: string;
  operationKey: string;
  /** The fencing token this invocation holds. */
  lockedBy: string;
  /** The attempt number THIS claim runs as. */
  attempt: number;
};

export function engineOperationKey(taskId: string, runKey: string, stage: string): string {
  return `engine:${taskId}:${runKey}:${stage}`;
}

/**
 * Idempotent reservation. A duplicated after() or a webhook replay lands on
 * the same row — that is the point.
 */
export async function reserveAiOperation(input: {
  taskId: string;
  purpose: string;
  operationKey: string;
}): Promise<{ id: string }> {
  return prisma.aiOperation.upsert({
    where: { operationKey: input.operationKey },
    create: { taskId: input.taskId, purpose: input.purpose, operationKey: input.operationKey },
    update: {},
    select: { id: true },
  });
}

/**
 * CAS claim. Covers exactly the three claimable shapes the mandate names:
 * reserved; failed whose backoff has elapsed; running whose lease expired.
 * Returns null when someone else holds it or the budget is exhausted —
 * the caller stops, it does not wait.
 */
export async function claimAiOperation(operationKey: string): Promise<AiOperationClaim | null> {
  const now = new Date();
  const lockedBy = randomUUID();
  const claimed = await prisma.aiOperation.updateMany({
    where: {
      operationKey,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "reserved" },
        {
          status: "failed",
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        { status: "running", leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: "running",
      attempts: { increment: 1 },
      lockedAt: now,
      lockedBy,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      lastError: null,
    },
  });
  if (claimed.count === 0) return null;

  const row = await prisma.aiOperation.findUniqueOrThrow({
    where: { operationKey },
    select: { id: true, attempts: true, lockedBy: true },
  });
  // If lockedBy is no longer ours, a racing claim on an expired lease beat
  // us between the two statements; treat as not claimed.
  if (row.lockedBy !== lockedBy) return null;
  return { operationId: row.id, operationKey, lockedBy, attempt: row.attempts };
}

export type ProviderUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  stopReason: string | null;
};

/**
 * The append-only attempt row for one provider call that was REALLY emitted.
 * userId is the engine's own identity string — AiUsage.userId is NOT NULL
 * and these calls have no human author.
 */
export function aiUsageRowFor(
  claim: AiOperationClaim,
  taskId: string,
  purpose: string,
  usage: ProviderUsage
): Prisma.AiUsageCreateInput {
  return {
    userId: "work-engine",
    taskId,
    purpose,
    provider: "anthropic",
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costMicros: usage.costMicros,
    stopReason: usage.stopReason,
    operation: { connect: { id: claim.operationId } },
    attempt: claim.attempt,
  };
}

export class SupersededOperationError extends Error {
  constructor(operationKey: string) {
    super(`AI operation ${operationKey} was reclaimed by another invocation`);
  }
}

/**
 * FENCED SUCCESS, one transaction when possible: the usage attempt, the
 * business result, and the succeeded transition commit together — after the
 * fence has proven this invocation still owns the operation. The fence goes
 * FIRST inside the transaction: if it fails, the business writes roll back
 * (the successor owns the truth now)… but the BILLED usage must survive, so
 * the caller catches SupersededOperationError and records the attempt alone.
 */
export async function succeedAiOperation<T>(input: {
  claim: AiOperationClaim;
  taskId: string;
  purpose: string;
  usage: ProviderUsage | null;
  /** Business writes; returns {resultKind, resultId} to attach. */
  writeResult: (tx: Prisma.TransactionClient) => Promise<{ resultKind: string; resultId: string; value: T }>;
}): Promise<T> {
  const { claim } = input;
  return prisma.$transaction(async (tx) => {
    const fenced = await tx.aiOperation.updateMany({
      where: { id: claim.operationId, lockedBy: claim.lockedBy },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    });
    if (fenced.count === 0) throw new SupersededOperationError(claim.operationKey);

    if (input.usage) {
      // P2002 here means the attempt counter logic is broken. It propagates.
      await tx.aiUsage.create({
        data: aiUsageRowFor(claim, input.taskId, input.purpose, input.usage),
      });
    }

    const { resultKind, resultId, value } = await input.writeResult(tx);
    await tx.aiOperation.update({
      where: { id: claim.operationId },
      data: { resultKind, resultId },
    });
    return value;
  });
}

/**
 * FENCED FAILURE. Also one transaction: the failed transition and the billed
 * usage row (a refusal or a parse failure was still a paid call) commit
 * together. A superseded invocation records its usage alone.
 */
export async function failAiOperation(input: {
  claim: AiOperationClaim;
  taskId: string;
  purpose: string;
  usage: ProviderUsage | null;
  error: string;
}): Promise<void> {
  const { claim } = input;
  try {
    await prisma.$transaction(async (tx) => {
      const fenced = await tx.aiOperation.updateMany({
        where: { id: claim.operationId, lockedBy: claim.lockedBy },
        data: {
          status: "failed",
          lastError: input.error.slice(0, 1000),
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + backoffMs(claim.attempt)),
        },
      });
      if (fenced.count === 0) throw new SupersededOperationError(claim.operationKey);
      if (input.usage) {
        await tx.aiUsage.create({
          data: aiUsageRowFor(claim, input.taskId, input.purpose, input.usage),
        });
      }
    });
  } catch (error) {
    if (error instanceof SupersededOperationError) {
      await recordSupersededUsage(input.claim, input.taskId, input.purpose, input.usage);
      return;
    }
    throw error;
  }
}

/**
 * A superseded invocation's provider call was still emitted and billed: the
 * attempt row is written ALONE, outside any fence — losing the lease loses
 * the right to write results, never the duty to account for money spent.
 */
export async function recordSupersededUsage(
  claim: AiOperationClaim,
  taskId: string,
  purpose: string,
  usage: ProviderUsage | null
): Promise<void> {
  if (!usage) return;
  console.warn("[ai-operations] superseded invocation recording its billed attempt", {
    operationKey: claim.operationKey,
    attempt: claim.attempt,
  });
  await prisma.aiUsage.create({ data: aiUsageRowFor(claim, taskId, purpose, usage) });
}
