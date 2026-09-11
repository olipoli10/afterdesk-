import "server-only";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { reserveAccountProviderSpendInTransaction } from "@/server/account-spend";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import { inspectAnswerContext, type AnswerAdmission } from "./admission";
import { createOpenRouterAnswerAdapter, type AnswerTransport, type AnswerAdapterResult } from "./openrouter-adapter";

type Tx = Prisma.TransactionClient;
type Accepted = Extract<AnswerAdapterResult, { status: "ANSWER_INSPECTED" }>;
const state = (status: "NOT_DISPATCHED" | "UNCERTAIN", reason: string) => ({ status, reason, accounting: "UNSETTLED" as const, actionAuthority: false as const });
async function current(tx: Tx, admission: AnswerAdmission, env: NodeJS.ProcessEnv) {
  const inspected = await inspectAnswerContext(tx, { context: admission.context, configuration: admission.configuration, enabled: true }, env);
  if (inspected.bindingFingerprint !== admission.current.bindingFingerprint) throw new Error("ANSWER_AUTHORITY_CHANGED");
  return inspected;
}
async function requireLineage(tx: Tx, a: AnswerAdmission, expectedStatus: "prepared" | "dispatched") {
  const b = a.current.budget;
  const rows = await tx.$queryRawUnsafe<Array<{ request: unknown; requestHash: string }>>(`SELECT c.request,c."requestHash"
    FROM "AiOperation" ai JOIN "ModelGatewayOperation" g ON g."aiOperationId"=ai.id
    JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=g.id
    JOIN "ModelGatewayAttempt" t ON t."decisionId"=d.id
    JOIN "PersonalAssistantOperation" c ON c."modelGatewayOperationId"=g.id AND c."sourcePersonalOperationId"=ai."personalAssistantOperationId"
    JOIN "PersonalAssistantBudget" b ON b.id=c."budgetId"
    JOIN "AccountProviderSpendHold" h ON h.id=t."accountSpendHoldId"
    WHERE ai.id=$1 AND ai."lockedBy"=$2 AND ai."operationKey"=$3 AND ai.purpose=$4
      AND ai."personalAssistantOperationId"=$5 AND ai.status='running' AND ai.attempts=1
      AND ai."leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC')
      AND g.id=$6 AND g."operationType"=$4 AND g."tenantId"=$7 AND g."requestFingerprint"=$8
      AND d.id=$9 AND d.attempt=1 AND d.disposition='route_authorized'
      AND t.id=$10 AND t.status=$11 AND t."accountSpendHoldId"=$12
      AND c.id=$13 AND c.kind='personal_answer_v1' AND c."workspaceId"=$14 AND c."createdByUserId"=$15
      AND c."connectorAccountId"=$16 AND c."budgetId"=$17 AND c."reservedCadMicros"=$18
      AND b."ceilingCadMicros"=$19 AND b."reservedCadMicros">=$18 AND b."reservedCadMicros"<=b."ceilingCadMicros"
      AND b."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')
      AND h.provider='openrouter' AND h.status='held' AND h.attempt=1 AND h."operationKey"=$3 AND h."amountMicros"=$20
      AND (($11='prepared' AND c.status='received' AND c.attempts=0 AND g.status='admitted' AND t."dispatchState"='not_dispatched')
        OR ($11='dispatched' AND c.status='processing' AND c.attempts=1 AND g.status='running' AND t."dispatchState"='unaccounted'))
    FOR UPDATE OF ai,g,t,c,h,b`,
    a.aiId, a.lockedBy, a.current.request.logicalOperationKey, a.current.request.operationType, a.context.claim.operationId,
    a.operation.id, a.current.request.tenantId, a.current.candidateInput.requestFingerprint, a.decision.id, a.attempt.id, expectedStatus,
    a.attempt.accountSpendHoldId, a.childId, a.context.claim.workspaceId, a.context.claim.userId, a.current.authority.accountId,
    b.budgetId, b.reservationCadMicros, b.ceilingCadMicros, b.reservationUsdMicros);
  if (rows.length !== 1 || rows[0].requestHash !== canonicalFingerprint(a.childRequest)
    || canonicalFingerprint(rows[0].request) !== rows[0].requestHash) throw new Error("ANSWER_LINEAGE_CHANGED");
}
async function retainUncertain(a: AnswerAdmission) {
  try {
    await prisma.$transaction(async tx => {
      // Record only the exact owned lineage, including after expiry/revocation.
      // A failure never refunds either currency hold or retries a request.
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT ai.id FROM "AiOperation" ai
        JOIN "ModelGatewayOperation" g ON g."aiOperationId"=ai.id
        JOIN "PersonalAssistantOperation" c ON c."modelGatewayOperationId"=g.id AND c."sourcePersonalOperationId"=ai."personalAssistantOperationId"
        WHERE ai.id=$1 AND ai."lockedBy"=$2 AND ai.status='running' AND ai.attempts=1 AND ai.purpose=$3
          AND g.id=$4 AND c.id=$5 AND c.kind='personal_answer_v1' AND c.status IN ('received','processing')
        FOR UPDATE OF ai,g,c`, a.aiId, a.lockedBy, a.current.request.operationType, a.operation.id, a.childId);
      if (rows.length !== 1) return;
      const result = state("UNCERTAIN", "ANSWER_OUTCOME_REQUIRES_REVIEW");
      await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='uncertain',attempts=1,result=$2::jsonb,"leaseUntil"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1`, a.childId, JSON.stringify(result));
      await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='abandoned',"resultId"=$2,"resultKind"='personal_answer_uncertain',"finishedAt"=(now() AT TIME ZONE 'UTC'),"lockedBy"=NULL,"lockedAt"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1`, a.aiId, a.childId);
      await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='uncertain',"errorClass"='unknown_dispatched_outcome',"finishedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status IN ('prepared','dispatched')`, a.attempt.id);
      await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='uncertain',"finishedAt"=(now() AT TIME ZONE 'UTC'),"finalAttemptId"=$2 WHERE id=$1`, a.operation.id, a.attempt.id);
    }, { isolationLevel: "Serializable", timeout: 2000 });
  } catch { /* A failed DB acknowledgment does not prove cleanup; leave recoverable. */ }
  return state("UNCERTAIN", "ANSWER_OUTCOME_REQUIRES_REVIEW");
}

export async function dispatchPersonalAnswer(input: { admission: AnswerAdmission; enabled?: boolean;
  transport: AnswerTransport; transportMode: "SYNTHETIC_LOCAL" | "EXTERNAL_PROVIDER" }, env: NodeJS.ProcessEnv = process.env) {
  if (!input.enabled || !["SYNTHETIC_LOCAL", "EXTERNAL_PROVIDER"].includes(input.transportMode)) return state("NOT_DISPATCHED", "DISABLED");
  const a = input.admission;
  const external = input.transportMode === "EXTERNAL_PROVIDER";
  const transportActive = () => !external || (env.ENDVERA_PERSONAL_ANSWER_EXTERNAL_TRANSPORT_ENABLED === "true" && env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED === "ENABLED");
  if (!transportActive()) return state("NOT_DISPATCHED", "TRANSPORT_DISABLED");
  let won = false;
  try {
    won = await prisma.$transaction(async tx => {
      const inspected = await current(tx, a, env);
      await requireLineage(tx, a, "prepared");
      const hold = await reserveAccountProviderSpendInTransaction(tx, { operationKey: a.current.request.logicalOperationKey, attempt: 1,
        provider: "openrouter", worstCaseMicros: a.current.budget.reservationUsdMicros, now: inspected.now }, env);
      if (!hold.ok || hold.created || hold.holdId !== a.attempt.accountSpendHoldId || hold.grantedMicros !== a.current.budget.reservationUsdMicros) throw new Error("ANSWER_HOLD_CHANGED");
      if (!transportActive() || a.context.signal.aborted) throw new Error("ANSWER_DISPATCH_REVOKED");
      const result = { status: "DISPATCH_CLAIMED", actionAuthority: false, accounting: "UNSETTLED", automaticRetry: false, transportMode: input.transportMode };
      const changes = [
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='dispatched',"dispatchState"='unaccounted',"dispatchedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='prepared' AND "dispatchState"='not_dispatched'`, a.attempt.id),
        await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='processing',attempts=1,"leaseUntil"=($2::timestamptz AT TIME ZONE 'UTC'),result=$3::jsonb,"externalTransportPerformed"=$4,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='received' AND attempts=0`,
          a.childId, new Date(a.context.claim.leaseUntil), JSON.stringify(result), external),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='running' WHERE id=$1 AND status='admitted'`, a.operation.id),
      ];
      if (changes.some(c => c !== 1)) throw new Error("ANSWER_CLAIM_LOST");
      await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.dispatched", correlationId: `gateway:${a.operation.id}`,
        gatewayOperationId: a.operation.id, tenantId: a.current.request.tenantId, attemptId: a.attempt.id,
        decisionId: a.decision.id, spendHoldId: a.attempt.accountSpendHoldId, billingProvider: "openrouter", dispatchState: "unaccounted", evidenceRef: canonicalFingerprint(result) });
      return true;
    }, { isolationLevel: "Serializable", timeout: 5000 });
  } catch { return state("NOT_DISPATCHED", "ADMISSION_OR_CLAIM_UNAVAILABLE"); }
  if (!won) return state("NOT_DISPATCHED", "CLAIM_LOST");
  try {
    if (!transportActive() || a.context.signal.aborted || Date.now() >= a.context.deadlineAt) return retainUncertain(a);
    const adapter = createOpenRouterAnswerAdapter({ ...a.current.adapterConfiguration,
      timeoutMs: Math.max(1, Math.min(25_000, a.context.deadlineAt - Date.now() - 3000)) }, input.transport);
    const response = await adapter.dispatch(a.current.candidateInput, a.context.signal);
    if (response.status !== "ANSWER_INSPECTED") return retainUncertain(a);
    await storeAnswer(a, response, env, transportActive);
    return { status: "ANSWER_STORED" as const, childId: a.childId, answer: response.answer, actionAuthority: false as const, accounting: "UNSETTLED" as const };
  } catch { return retainUncertain(a); }
}

async function storeAnswer(a: AnswerAdmission, response: Accepted, env: NodeJS.ProcessEnv, transportActive: () => boolean) {
  await prisma.$transaction(async tx => {
    await current(tx, a, env); await requireLineage(tx, a, "dispatched");
    if (!transportActive() || a.context.signal.aborted) throw new Error("ANSWER_REVOKED_AFTER_RESPONSE");
    const result = { ...response, automaticRetry: false, requestedOperation: a.current.request.operationType };
    const hash = canonicalFingerprint(result);
    const changes = [
      await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',result=$2::jsonb,"leaseUntil"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='processing' AND attempts=1`, a.childId, JSON.stringify(result)),
      await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='succeeded',"resultKind"='personal_answer_inspected',"resultId"=$2,"finishedAt"=(now() AT TIME ZONE 'UTC'),"lockedBy"=NULL,"lockedAt"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='running' AND "lockedBy"=$3`, a.aiId, a.childId, a.lockedBy),
      await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='uncertain',"resultContractStatus"='valid',"providerRequestRef"=$2,"responseEvidenceRef"=$3,"finishedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='dispatched' AND "dispatchState"='unaccounted'`, a.attempt.id, response.providerRequestId, hash),
      await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='succeeded',"finishedAt"=(now() AT TIME ZONE 'UTC'),"finalAttemptId"=$2,"resultEvidenceRef"=$3 WHERE id=$1 AND status='running'`, a.operation.id, a.attempt.id, hash),
    ];
    if (changes.some(c => c !== 1)) throw new Error("ANSWER_RESULT_CLAIM_LOST");
    await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.uncertain", correlationId: `gateway:${a.operation.id}`, gatewayOperationId: a.operation.id,
      tenantId: a.current.request.tenantId, attemptId: a.attempt.id, decisionId: a.decision.id, spendHoldId: a.attempt.accountSpendHoldId,
      billingProvider: "openrouter", dispatchState: "unaccounted", evidenceRef: hash });
  }, { isolationLevel: "Serializable", timeout: Math.max(1, Math.min(3000, a.context.deadlineAt - Date.now())) });
}
