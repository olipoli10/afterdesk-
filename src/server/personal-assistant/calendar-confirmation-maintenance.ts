import "server-only";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { ConnectorEnvironment } from "./google-client";

type Input = Readonly<{ actor: Readonly<{ userId: string; workspaceId: string }>; batchSize?: number; deadlineAt?: number; signal?: AbortSignal }>;
const actorSchema = z.object({ userId: z.string().min(1).max(191), workspaceId: z.string().min(1).max(191) }).strict();
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true"
  && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, expired: 0, completed: 0, uncertain: 0, executionAuthorized: false as const });
function controls(input: Input, env: ConnectorEnvironment) {
  const actor = actorSchema.parse(input.actor), batchSize = input.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("CONFIRMATION_MAINTENANCE_BATCH_INVALID");
  if (input.deadlineAt !== undefined && !Number.isFinite(input.deadlineAt)) throw new Error("CONFIRMATION_MAINTENANCE_DEADLINE_INVALID");
  const deadlineAt = Math.min(input.deadlineAt ?? Infinity, Date.now() + 2500), signal = input.signal;
  const remaining = () => {
    if (!enabled(env)) throw new Error("CONFIRMATION_MAINTENANCE_DISABLED");
    if (signal?.aborted) throw new Error("CONFIRMATION_MAINTENANCE_ABORTED");
    const ms = Math.floor(deadlineAt - Date.now());
    if (ms < 2) throw new Error("CONFIRMATION_MAINTENANCE_DEADLINE");
    return ms;
  };
  return { actor, batchSize, deadlineAt, signal, remaining };
}

/** Bookkeeping only. Caller owns a bounded SERIALIZABLE transaction (including
 * SQL statement/lock timeouts). No nested transaction and no provider/nonce/budget
 * mutation. This receipt is provisional until the CALLER successfully commits. */
export async function maintainCalendarSmsConfirmationsInTransaction(tx: Prisma.TransactionClient, input: Input, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const c = controls(input, env); c.remaining();
  const isolation = await tx.$queryRawUnsafe<Array<{ isolation: string }>>("SELECT current_setting('transaction_isolation') AS isolation");
  c.remaining();
  if (isolation.length !== 1 || isolation[0].isolation !== "serializable") throw new Error("CONFIRMATION_MAINTENANCE_SERIALIZABLE_REQUIRED");
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; phase: "PREPARED" | "WAITING" | "CONSUMED"; calendarOperationId: string; calendarHash: string }>>(`
    SELECT c.id,c.phase,c."calendarOperationId",c.prepared#>>'{binding,calendar,requestHash}' AS "calendarHash"
    FROM "PersonalCalendarSmsConfirmation" c
    WHERE c."workspaceId"=$1 AND c."userId"=$2 AND (
      (c.phase IN ('PREPARED','WAITING') AND c."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC')) OR
      (c.phase='CONSUMED' AND EXISTS (SELECT 1 FROM "PersonalAssistantOperation" d
        WHERE d.id=c."calendarOperationId" AND d."workspaceId"=c."workspaceId" AND d."createdByUserId"=c."userId"
          AND d.kind='calendar_write' AND d.attempts=1 AND d.status IN ('completed','uncertain')
          AND d."requestHash"=c.prepared#>>'{binding,calendar,requestHash}')))
    ORDER BY c."updatedAt",c.id LIMIT $3 FOR UPDATE OF c SKIP LOCKED`, c.actor.workspaceId, c.actor.userId, c.batchSize);
  c.remaining();
  if (rows.length > c.batchSize) throw new Error("CONFIRMATION_MAINTENANCE_BATCH_INVALID");
  let expired = 0, completed = 0, uncertain = 0;
  for (const row of rows) {
    c.remaining();
    if (row.phase === "PREPARED" || row.phase === "WAITING") {
      const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalCalendarSmsConfirmation" SET phase='EXPIRED',"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
        WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 AND phase=$4 AND "expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC')`,
      row.id, c.actor.workspaceId, c.actor.userId, row.phase);
      c.remaining(); expired += changed;
    } else if (row.phase === "CONSUMED") {
      // Lock calendar only AFTER its challenge. A locked or nonterminal calendar
      // is skipped, never treated as absence or as permission to retry it.
      const calendar = await tx.$queryRawUnsafe<Array<{ status: "completed" | "uncertain" }>>(`SELECT status FROM "PersonalAssistantOperation"
        WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='calendar_write' AND attempts=1
          AND "requestHash"=$4 AND status IN ('completed','uncertain') FOR SHARE SKIP LOCKED`,
      row.calendarOperationId, c.actor.workspaceId, c.actor.userId, row.calendarHash);
      c.remaining();
      if (calendar.length === 0) continue;
      if (calendar.length !== 1 || !["completed", "uncertain"].includes(calendar[0].status)) throw new Error("CONFIRMATION_MAINTENANCE_CALENDAR_INVALID");
      const phase = calendar[0].status === "completed" ? "COMPLETED" : "UNCERTAIN";
      const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalCalendarSmsConfirmation" SET phase=$5,"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
        WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 AND phase='CONSUMED' AND "calendarOperationId"=$4
          AND prepared#>>'{binding,calendar,requestHash}'=$6`,
      row.id, c.actor.workspaceId, c.actor.userId, row.calendarOperationId, phase, row.calendarHash);
      c.remaining(); if (phase === "COMPLETED") completed += changed; else uncertain += changed;
    } else throw new Error("CONFIRMATION_MAINTENANCE_PHASE_INVALID");
  }
  c.remaining();
  return Object.freeze({ status: "CONFIRMATION_MAINTENANCE_PREPARED_NOT_COMMITTED" as const, expired, completed, uncertain,
    executionAuthorized: false as const, automaticRetry: false as const, budgetReservationReleased: false as const });
}

/** Standalone bounded wrapper. Counts become acknowledged only after commit. */
export async function maintainCalendarSmsConfirmations(input: Input, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const c = controls(input, env), remaining = c.remaining(), maxWait = Math.min(500, Math.max(1, Math.floor(remaining / 4)));
  const result = await prisma.$transaction(async tx => {
    const statementBudget = Math.min(2000, c.remaining() - 1);
    await tx.$executeRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", String(statementBudget), String(Math.min(250, statementBudget)));
    c.remaining();
    const provisional = await maintainCalendarSmsConfirmationsInTransaction(tx, { actor: c.actor, batchSize: c.batchSize, deadlineAt: c.deadlineAt, signal: c.signal }, env);
    c.remaining(); return provisional;
  }, { isolationLevel: "Serializable", maxWait, timeout: Math.min(2000, remaining - maxWait) });
  if (result.status === "DISABLED") throw new Error("CONFIRMATION_MAINTENANCE_DISABLED");
  return Object.freeze({ ...result, status: "CONFIRMATION_MAINTENANCE_COMMITTED" as const });
}
