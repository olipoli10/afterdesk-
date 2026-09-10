import "server-only";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { temporalActorSchema, temporalRegistryEnabled } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";

type Input = Readonly<{ actor: z.infer<typeof temporalActorSchema>; batchSize?: number; deadlineAt?: number; signal?: AbortSignal }>;
const enabled = (env: ConnectorEnvironment) => temporalRegistryEnabled(env) && env.ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, expired: 0, executionAuthorized: false as const });
const candidateSchema = z.object({ id: z.string().min(1).max(191), namespace: z.string().regex(/^[a-f0-9]{64}$/),
  phase: z.enum(["PREPARED", "WAITING"]), preparedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
function controls(input: Input, env: ConnectorEnvironment) {
  const actor = temporalActorSchema.parse(input.actor), batchSize = input.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("TEMPORAL_MAINTENANCE_BATCH_INVALID");
  if (input.deadlineAt !== undefined && !Number.isFinite(input.deadlineAt)) throw new Error("TEMPORAL_MAINTENANCE_DEADLINE_INVALID");
  const deadlineAt = Math.min(input.deadlineAt ?? Infinity, Date.now() + 2500), signal = input.signal;
  const remaining = () => {
    if (!enabled(env)) throw new Error("TEMPORAL_MAINTENANCE_DISABLED");
    if (signal?.aborted) throw new Error("TEMPORAL_MAINTENANCE_ABORTED");
    const ms = Math.floor(deadlineAt - Date.now());
    if (ms < 2) throw new Error("TEMPORAL_MAINTENANCE_DEADLINE");
    return ms;
  };
  return { actor, batchSize, deadlineAt, signal, remaining };
}

/** Bookkeeping only, even after consent revocation. Caller owns SERIALIZABLE
 * and the final commit, and must invoke this before taking source/question row
 * locks (or use the standalone wrapper). No source claim or budget is touched. */
export async function maintainSmsTemporalClarificationsInTransaction(tx: Prisma.TransactionClient, input: Input, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const c = controls(input, env); c.remaining();
  const isolation = await tx.$queryRawUnsafe<Array<{ isolation: string }>>("SELECT current_setting('transaction_isolation') AS isolation");
  c.remaining();
  if (isolation.length !== 1 || isolation[0].isolation !== "serializable") throw new Error("TEMPORAL_MAINTENANCE_SERIALIZABLE_REQUIRED");
  const statementBudget = Math.min(2000, c.remaining() - 1);
  await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", String(statementBudget), String(Math.min(250, statementBudget)));
  c.remaining();
  // Discovery takes no question lock. Shared namespace always comes first.
  const discovered = await tx.$queryRawUnsafe<unknown[]>(`SELECT id,namespace,phase,"preparedHash" FROM "PersonalSmsTemporalClarification"
    WHERE "workspaceId"=$1 AND "userId"=$2 AND phase IN ('PREPARED','WAITING') AND "expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
    ORDER BY "expiresAt",id LIMIT $3`, c.actor.workspaceId, c.actor.userId, c.batchSize);
  c.remaining();
  if (discovered.length > c.batchSize) throw new Error("TEMPORAL_MAINTENANCE_BATCH_INVALID");
  const rows = discovered.map(row => candidateSchema.parse(row));
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("TEMPORAL_MAINTENANCE_DUPLICATE_CANDIDATE");
  rows.sort((a, b) => a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let expired = 0;
  for (const row of rows) {
    c.remaining();
    const locked = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked", row.namespace);
    c.remaining();
    if (locked.length !== 1 || typeof locked[0].locked !== "boolean") throw new Error("TEMPORAL_MAINTENANCE_NAMESPACE_LOCK_INVALID");
    if (!locked[0].locked) continue;
    const current = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalSmsTemporalClarification"
      WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 AND namespace=$4 AND phase=$5 AND "preparedHash"=$6
        AND phase IN ('PREPARED','WAITING') AND "expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') FOR UPDATE SKIP LOCKED`,
    row.id, c.actor.workspaceId, c.actor.userId, row.namespace, row.phase, row.preparedHash);
    c.remaining();
    if (current.length === 0) continue;
    if (current.length !== 1 || current[0].id !== row.id) throw new Error("TEMPORAL_MAINTENANCE_LOCKED_ROW_INVALID");
    const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalSmsTemporalClarification" SET phase='EXPIRED',"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
      WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 AND namespace=$4 AND phase=$5 AND "preparedHash"=$6
        AND phase IN ('PREPARED','WAITING') AND "expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC')`,
    row.id, c.actor.workspaceId, c.actor.userId, row.namespace, row.phase, row.preparedHash);
    c.remaining();
    if (changed !== 0 && changed !== 1) throw new Error("TEMPORAL_MAINTENANCE_CAS_INVALID");
    expired += changed;
  }
  c.remaining();
  return Object.freeze({ status: "TEMPORAL_MAINTENANCE_PREPARED_NOT_COMMITTED" as const, expired, executionAuthorized: false as const,
    automaticRetry: false as const, providerExecutionPerformed: false as const, budgetReservationReleased: false as const, committed: false as const });
}

/** Standalone bounded transaction; only a known successful commit is counted. */
export async function maintainSmsTemporalClarifications(input: Input, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const c = controls(input, env), remaining = c.remaining(), maxWait = Math.min(500, Math.max(1, Math.floor(remaining / 4)));
  const result = await prisma.$transaction(async tx => {
    c.remaining();
    const provisional = await maintainSmsTemporalClarificationsInTransaction(tx,
      { actor: c.actor, batchSize: c.batchSize, deadlineAt: c.deadlineAt, signal: c.signal }, env);
    c.remaining(); return provisional;
  }, { isolationLevel: "Serializable", maxWait, timeout: Math.min(2000, remaining - maxWait) });
  if (result.status === "DISABLED") throw new Error("TEMPORAL_MAINTENANCE_DISABLED");
  return Object.freeze({ ...result, status: "TEMPORAL_MAINTENANCE_COMMITTED" as const, committed: true as const });
}
