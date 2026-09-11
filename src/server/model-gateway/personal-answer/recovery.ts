import "server-only";
import { prisma } from "@/lib/db";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import { PERSONAL_MODEL_AUTHORITY } from "../personal-intent/budget-policy";

/** Bookkeeping only, OFF by default. No provider, retry, refund or source-SMS
 * completion. The live lease and complete answer lineage are locked together. */
export async function recoverExpiredPersonalAnswerAttempts(input: { enabled?: boolean; batchSize?: number } = {}) {
  if (input.enabled !== true) return { status: "DISABLED", recovered: 0, actionAuthority: false } as const;
  const size = input.batchSize ?? 10;
  if (!Number.isInteger(size) || size < 1 || size > 25) throw new Error("ANSWER_RECOVERY_BATCH_INVALID");
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<Array<{ aiId: string; childId: string; gatewayId: string; tenantId: string;
      attemptId: string; decisionId: string; holdId: string; dispatchState: "not_dispatched" | "unaccounted" }>>(`
      SELECT ai.id "aiId",c.id "childId",g.id "gatewayId",g."tenantId",a.id "attemptId",d.id "decisionId",
        a."accountSpendHoldId" "holdId",a."dispatchState"
      FROM "AiOperation" ai JOIN "ModelGatewayOperation" g ON g."aiOperationId"=ai.id AND g."operationType"=ai.purpose
      JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=g.id AND d.attempt=1 AND d.disposition='route_authorized'
      JOIN "ModelGatewayAttempt" a ON a."decisionId"=d.id
      JOIN "PersonalAssistantOperation" c ON c."modelGatewayOperationId"=g.id AND c."sourcePersonalOperationId"=ai."personalAssistantOperationId"
      JOIN "PersonalAssistantOperation" p ON p.id=c."sourcePersonalOperationId" AND p."workspaceId"=c."workspaceId" AND p."createdByUserId"=c."createdByUserId"
      JOIN "AccountProviderSpendHold" h ON h.id=a."accountSpendHoldId" AND h."operationKey"=ai."operationKey" AND h.provider='openrouter' AND h.attempt=1
      WHERE ai.purpose IN ('personal_answer_candidate_v1','personal_public_research_v1') AND ai.status='running'
        AND ai.attempts=1 AND ai."lockedBy" IS NOT NULL AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
        AND ai."leaseExpiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
        AND g.status IN ('admitted','running') AND g."tenantId"='construction-workspace:'||c."workspaceId"
        AND c.kind='personal_answer_v1' AND c.status IN ('received','processing') AND c."budgetId"=$1
        AND p.kind='personal_sms_inbound' AND a.status IN ('prepared','dispatched')
        AND a."dispatchState" IN ('not_dispatched','unaccounted')
      ORDER BY ai."leaseExpiresAt",ai.id LIMIT $2 FOR UPDATE OF ai,g,c,a SKIP LOCKED`, `${PERSONAL_MODEL_AUTHORITY}:openrouter`, size);
    for (const row of rows) {
      const result = { status: "UNCERTAIN", reason: "LEASE_EXPIRED", accounting: "UNSETTLED", actionAuthority: false,
        automaticRetry: false, dispatchAttempted: row.dispatchState === "unaccounted", reviewRequired: true };
      const hash = canonicalFingerprint(result);
      const changes = [
        await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='uncertain',attempts=1,result=$2::jsonb,"leaseUntil"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status IN ('received','processing')`, row.childId, JSON.stringify(result)),
        await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='abandoned',"resultKind"='personal_answer_uncertain',"resultId"=$2,"finishedAt"=(now() AT TIME ZONE 'UTC'),"updatedAt"=(now() AT TIME ZONE 'UTC'),"lockedBy"=NULL,"lockedAt"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=NULL WHERE id=$1 AND status='running'`, row.aiId, row.childId),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='uncertain',"errorClass"='unknown_dispatched_outcome',"responseEvidenceRef"=$2,"finishedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status IN ('prepared','dispatched')`, row.attemptId, hash),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='uncertain',"resultEvidenceRef"=$3,"finalAttemptId"=$2,"finishedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status IN ('admitted','running')`, row.gatewayId, row.attemptId, hash),
      ];
      if (changes.some(count => count !== 1)) throw new Error("ANSWER_RECOVERY_FENCE_LOST");
      await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.uncertain", correlationId: `gateway:${row.gatewayId}`,
        gatewayOperationId: row.gatewayId, tenantId: row.tenantId, attemptId: row.attemptId, decisionId: row.decisionId,
        spendHoldId: row.holdId, billingProvider: "openrouter", dispatchState: row.dispatchState,
        errorClass: "unknown_dispatched_outcome", evidenceRef: hash });
    }
    return { status: "EXPIRED_ATTEMPTS_RECORDED_UNCERTAIN", recovered: rows.length, actionAuthority: false } as const;
  }, { isolationLevel: "Serializable", timeout: 5000 });
}
