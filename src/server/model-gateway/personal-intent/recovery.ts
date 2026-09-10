import "server-only";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import type { PersonalIntentAdmission } from "./admission";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";

export type PersonalIntentUncertainReason = "PRE_DISPATCH_REVALIDATION_FAILED" | "PROVIDER_OUTCOME_UNKNOWN"
  | "POST_DISPATCH_REVALIDATION_FAILED" | "INVALID_PROPOSAL" | "TERMINAL_PERSISTENCE_FAILED" | "LEASE_EXPIRED";
type Tx = Prisma.TransactionClient;
type Recoverable = {
  aiId: string; operationKey: string; lockedBy: string; gatewayId: string; tenantId: string;
  childId: string; attemptId: string; decisionId: string; holdId: string; dispatchState: string;
  transportMode: string | null;
};
// The same linked operation/child/attempt lineage is locked for both an ordinary
// failed completion and expired-lease recovery. Never select unrelated workers.
const lineage = `SELECT ai.id "aiId",ai."operationKey",ai."lockedBy",o.id "gatewayId",o."tenantId",
  c.id "childId",a.id "attemptId",d.id "decisionId",a."accountSpendHoldId" "holdId",a."dispatchState",c.result->>'transportMode' "transportMode"
  FROM "AiOperation" ai JOIN "ModelGatewayOperation" o ON o."aiOperationId"=ai.id
  JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=o.id AND d.attempt=1 AND d.disposition='route_authorized'
  JOIN "ModelGatewayAttempt" a ON a."decisionId"=d.id
  JOIN "PersonalAssistantOperation" c ON c."modelGatewayOperationId"=o.id AND c."sourcePersonalOperationId"=ai."personalAssistantOperationId"
  JOIN "PersonalAssistantOperation" p ON p.id=c."sourcePersonalOperationId" AND p."workspaceId"=c."workspaceId" AND p."createdByUserId"=c."createdByUserId"
  WHERE ai.purpose='personal_intent_candidate_v1' AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
    AND ai.status='running' AND ai.attempts=1 AND ai."lockedBy" IS NOT NULL
    AND o."operationType"='personal_intent_candidate_v1' AND o.status IN ('admitted','running')
    AND c.kind='personal_model_candidate_v1' AND c.status IN ('received','processing')
    AND c."budgetId"='${PERSONAL_MODEL_AUTHORITY}:openrouter'
    AND p.kind='personal_sms_inbound' AND a.status IN ('prepared','dispatched')
    AND a."dispatchState" IN ('not_dispatched','unaccounted')`;

async function markUncertain(tx: Tx, row: Recoverable, reason: PersonalIntentUncertainReason) {
  const record = Object.freeze({ schemaVersion: 1, status: "UNCERTAIN", reason,
    executionAuthorized: false, accounting: "UNSETTLED", automaticRetry: false,
    transportMode: row.transportMode === "SYNTHETIC_LOCAL" || row.transportMode === "EXTERNAL_PROVIDER" ? row.transportMode
      : row.dispatchState === "not_dispatched" ? "NOT_DISPATCHED" : "UNKNOWN",
    dispatchAttempted: row.dispatchState !== "not_dispatched",
    transportKnowledge: row.dispatchState === "not_dispatched" ? "NOT_DISPATCHED_BY_THIS_ATTEMPT" : "OUTCOME_NOT_OBSERVED",
    proposal: null, reviewRequired: true });
  const evidence = canonicalFingerprint(record);
  const updates = [
    await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='abandoned',"resultKind"='personal_model_uncertain',"resultId"=$4,
      "lastError"=$5,"finishedAt"=now(),"updatedAt"=now(),"lockedAt"=NULL,"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=NULL
      WHERE id=$1 AND "operationKey"=$2 AND "lockedBy"=$3 AND status='running' AND attempts=1 AND purpose='personal_intent_candidate_v1'`,
    row.aiId, row.operationKey, row.lockedBy, row.childId, `PERSONAL_MODEL_${reason}`),
    await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='uncertain',result=$2::jsonb,"leaseUntil"=NULL,"updatedAt"=now()
      WHERE id=$1 AND "modelGatewayOperationId"=$3 AND kind='personal_model_candidate_v1' AND status IN ('received','processing')`, row.childId, JSON.stringify(record), row.gatewayId),
    await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='uncertain',"errorClass"='unknown_dispatched_outcome',"finishedAt"=now(),"responseEvidenceRef"=$2
      WHERE id=$1 AND status IN ('prepared','dispatched') AND "dispatchState" IN ('not_dispatched','unaccounted')`, row.attemptId, evidence),
    await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='uncertain',"finishedAt"=now(),"finalAttemptId"=$2,"resultEvidenceRef"=$3
      WHERE id=$1 AND status IN ('admitted','running') AND "operationType"='personal_intent_candidate_v1'`, row.gatewayId, row.attemptId, evidence),
  ];
  if (updates.some(count => count !== 1)) throw new Error("PERSONAL_MODEL_RECOVERY_FENCE_LOST");
  await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.uncertain", correlationId: `gateway:${row.gatewayId}`,
    gatewayOperationId: row.gatewayId, tenantId: row.tenantId, attemptId: row.attemptId, decisionId: row.decisionId,
    spendHoldId: row.holdId, billingProvider: "openrouter", dispatchState: row.dispatchState === "not_dispatched" ? "not_dispatched" : "unaccounted",
    errorClass: "unknown_dispatched_outcome", evidenceRef: evidence });
  // No updates to either USD holds or CAD budget reservations. No dispatch,
  // settlement, re-claim, automatic retry or source SMS completion is performed.
}

/** Can record an expired claim as uncertain without needing revoked action
 * permissions. Exact live DB ownership is still required; caller snapshots never
 * suffice. A false return means no record was changed, NOT that cleanup succeeded. */
export async function retainPersonalIntentUncertain(admission: PersonalIntentAdmission, reason: PersonalIntentUncertainReason): Promise<boolean> {
  if (!["PRE_DISPATCH_REVALIDATION_FAILED", "PROVIDER_OUTCOME_UNKNOWN", "POST_DISPATCH_REVALIDATION_FAILED", "INVALID_PROPOSAL", "TERMINAL_PERSISTENCE_FAILED", "LEASE_EXPIRED"].includes(reason)) {
    throw new Error("PERSONAL_MODEL_RECOVERY_REASON_INVALID");
  }
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<Recoverable[]>(`${lineage}
      AND ai.id=$1 AND ai."operationKey"=$2 AND ai."lockedBy"=$3 AND o.id=$4 AND c.id=$5 AND a.id=$6
      AND d.id=$7 AND a."accountSpendHoldId"=$8 AND ai."personalAssistantOperationId"=$9
      FOR UPDATE OF ai,o,c,a`, admission.claim.operationId, admission.claim.operationKey, admission.claim.lockedBy,
    admission.operation.id, admission.childOperationId, admission.attempt.id, admission.decision.id,
    admission.attempt.accountSpendHoldId, admission.source.subject.operationId);
    if (rows.length !== 1) return false;
    await markUncertain(tx, rows[0], reason); return true;
  }, { isolationLevel: "Serializable" });
}

/** Bounded bookkeeping only. Run from an authorized local/job controller;
 * enabling recovery never enables a provider. SKIP LOCKED avoids racing an
 * in-flight terminal writer. No retry is attempted after an expired lease. */
export async function recoverExpiredPersonalIntentAttempts(input: Readonly<{ enabled?: boolean; batchSize?: number }> = {}) {
  if (input.enabled !== true) return Object.freeze({ status: "DISABLED" as const, recovered: 0, executionAuthorized: false });
  const batchSize = input.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("PERSONAL_MODEL_RECOVERY_BATCH_INVALID");
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<Recoverable[]>(`${lineage}
      AND (ai."leaseExpiresAt"<=now() OR c."leaseUntil"<=now())
      ORDER BY ai."leaseExpiresAt",ai.id LIMIT $1 FOR UPDATE OF ai,o,c,a SKIP LOCKED`, batchSize);
    for (const row of rows) await markUncertain(tx, row, "LEASE_EXPIRED");
    return Object.freeze({ status: "EXPIRED_ATTEMPTS_RECORDED_UNCERTAIN" as const, recovered: rows.length, executionAuthorized: false });
  }, { isolationLevel: "Serializable" });
}
