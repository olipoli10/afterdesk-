import "server-only";
import { prisma } from "@/lib/db";

/** Bookkeeping only: process loss never proves whether an external effect occurred.
 * No dispatch, credential, permission, policy, retry or budget mutation belongs here. */
export async function recoverExpiredPersonalActionClaims(input: Readonly<{ enabled?: boolean; batchSize?: number; deadlineAt?: number }> = {}) {
  if (input.enabled !== true) return Object.freeze({ status: "DISABLED" as const, recovered: 0, executionAuthorized: false as const });
  const batchSize = input.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("PERSONAL_ACTION_RECOVERY_BATCH_INVALID");
  if (input.deadlineAt !== undefined && !Number.isFinite(input.deadlineAt)) throw new Error("PERSONAL_ACTION_RECOVERY_DEADLINE_INVALID");
  const deadlineAt = Math.min(input.deadlineAt ?? Infinity, Date.now() + 2500);
  const requireRemaining = () => {
    const remaining = Math.floor(deadlineAt - Date.now());
    if (remaining < 2) throw new Error("PERSONAL_ACTION_RECOVERY_DEADLINE_EXCEEDED");
    return remaining;
  };
  const remaining = requireRemaining(), maxWait = Math.min(500, Math.max(1, Math.floor(remaining / 4)));
  return prisma.$transaction(async tx => {
    const statementBudget = Math.min(2000, requireRemaining() - 1);
    // LOCAL settings expire with this transaction. They cap native lock/query waits too,
    // rather than relying on the client's interactive-transaction timeout alone.
    await tx.$executeRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",
      String(statementBudget), String(Math.min(250, statementBudget)));
    requireRemaining();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
      WITH expired AS (
        SELECT id,"workspaceId","createdByUserId","connectorAccountId",kind,"requestHash",attempts,"leaseUntil",
          "budgetId","reservedCadMicros",result
        FROM "PersonalAssistantOperation"
        WHERE kind IN ('calendar_write','sms_outbound','voice_outbound')
          AND status='processing' AND attempts=1 AND "leaseUntil" IS NOT NULL AND "leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC')
        ORDER BY "leaseUntil",id LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      UPDATE "PersonalAssistantOperation" o
      SET status='uncertain',"leaseUntil"=NULL,"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC'),
        result=(CASE WHEN jsonb_typeof(o.result)='object' THEN o.result ELSE '{}'::jsonb END) || jsonb_build_object(
          'schemaVersion',1,'reviewRequired',true,'automaticRetry',false,'executionAuthorized',false,
          'writeConfirmed',false,'deliveryConfirmed',false,'transportKnowledge','UNKNOWN_AFTER_PROCESS_LOSS',
          'reason','PROCESSING_LEASE_EXPIRED','priorClaimResult',o.result,
          'recovery',jsonb_build_object('kind','EXPIRED_PERSONAL_EFFECT_CLAIM','leaseUntil',e."leaseUntil",
            'attempt',e.attempts,'recordedAt',clock_timestamp(),'budgetReservationReleased',false))
      FROM expired e
      WHERE o.id=e.id AND o."workspaceId"=e."workspaceId" AND o."createdByUserId"=e."createdByUserId"
        AND o."connectorAccountId"=e."connectorAccountId" AND o.kind=e.kind AND o."requestHash"=e."requestHash"
        AND o.status='processing' AND o.attempts=e.attempts AND o."leaseUntil"=e."leaseUntil" AND o."leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC')
        AND o."budgetId" IS NOT DISTINCT FROM e."budgetId" AND o."reservedCadMicros" IS NOT DISTINCT FROM e."reservedCadMicros"
        AND o.result IS NOT DISTINCT FROM e.result
      RETURNING o.id`, batchSize);
    // Throw inside the transaction if its acknowledgement exceeded the caller's deadline: rollback, no success claim.
    requireRemaining();
    // Result rows are acknowledgements of this exact atomic update, not a snapshot of candidates.
    return Object.freeze({ status: "EXPIRED_ACTION_CLAIMS_RECORDED_UNCERTAIN" as const, recovered: rows.length,
      executionAuthorized: false as const, automaticRetry: false as const, budgetReservationReleased: false as const });
  }, { isolationLevel: "Serializable", maxWait, timeout: Math.min(2000, remaining - maxWait) });
}
