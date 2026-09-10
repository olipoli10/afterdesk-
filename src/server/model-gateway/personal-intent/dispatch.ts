import "server-only";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { reserveAccountProviderSpendInTransaction } from "@/server/account-spend";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import { finishPersonalAiOperation } from "../personal-ai-operations";
import { reinspectPersonalIntentAdmission, type PersonalIntentAdmission } from "./admission";
import { inspectPersonalIntentCandidate } from "./contract";
import { type createOpenRouterPersonalIntentAdapter, type OpenRouterPersonalIntentResult } from "./openrouter-adapter";
import { retainPersonalIntentUncertain, type PersonalIntentUncertainReason } from "./recovery";
import { resolvePersonalCalendarTemporal } from "./temporal";

type Adapter = ReturnType<typeof createOpenRouterPersonalIntentAdapter>;
type Input = Readonly<{
  admission: PersonalIntentAdmission; adapter: Adapter; abortSignal: AbortSignal;
  currentRateConfiguration: unknown; enabled?: boolean;
  currentPilotEnvelopeReview: unknown;
  transportMode: "SYNTHETIC_LOCAL" | "EXTERNAL_PROVIDER";
}>;
const result = (status: "DISABLED" | "NOT_DISPATCHED" | "CLAIM_LOST" | "UNCERTAIN" | "PROPOSAL_STORED_NOT_AUTHORIZED",
  reason: string, recorded = false) => Object.freeze({ status, reason, recorded, executionAuthorized: false as const,
    accounting: "UNSETTLED" as const, automaticRetry: false as const });

async function recordUncertain(admission: PersonalIntentAdmission, reason: PersonalIntentUncertainReason) {
  // A DB outage is not a successful terminal write. The lease remains durable
  // and the bounded recovery worker can later record it; never repeat transport.
  let recorded = false;
  try { recorded = await retainPersonalIntentUncertain(admission, reason); } catch { /* Retain the running claim and both spend holds. */ }
  return result("UNCERTAIN", reason, recorded);
}

async function requireCurrentUsdHold(tx: Prisma.TransactionClient, admission: PersonalIntentAdmission, now: Date, env: NodeJS.ProcessEnv) {
  const hold = await reserveAccountProviderSpendInTransaction(tx, { operationKey: admission.claim.operationKey,
    attempt: 1, provider: "openrouter", worstCaseMicros: admission.budgetPolicy.reservationUsdMicros, now }, env);
  if (!hold.ok || hold.created || hold.holdId !== admission.attempt.accountSpendHoldId
    || hold.grantedMicros !== admission.budgetPolicy.reservationUsdMicros) throw new Error("PERSONAL_MODEL_CURRENT_USD_HOLD_REFUSED");
}

/** OFF by default. Full persisted gateway admission is reloaded, including
 * source identity, current OpenRouter grant, route/privacy/breaker and rates.
 * An adapter result is never business-action authority. No action preparer,
 * calendar writer, SMS sender, billing settlement or generic retry is imported.
 */
export async function dispatchPersonalIntent(input: Input, env: NodeJS.ProcessEnv = process.env) {
  if (input.enabled !== true) return result("DISABLED", "PERSONAL_MODEL_DISPATCH_DISABLED");
  if (input.abortSignal.aborted) return result("NOT_DISPATCHED", "ABORTED_BEFORE_CLAIM");
  const { admission, adapter } = input;
  if (!admission || admission.status !== "ADMITTED_NOT_DISPATCHED") return result("NOT_DISPATCHED", "FULL_ADMISSION_REQUIRED");
  const mode = input.transportMode;
  if (!["SYNTHETIC_LOCAL", "EXTERNAL_PROVIDER"].includes(mode) || adapter.transportMode !== mode
    || (mode === "EXTERNAL_PROVIDER" && (env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "true" || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED"))
    || adapter.key !== "openrouter-personal-intent-candidate" || adapter.modelKey !== admission.budgetPolicy.model
    || adapter.providerEndpointSlug !== admission.budgetPolicy.providerEndpoint
    || adapter.maxOutputTokens !== admission.budgetPolicy.maxOutputTokens) return result("NOT_DISPATCHED", "ADAPTER_BINDING_REFUSED");
  let claimed = false;
  try {
    claimed = await prisma.$transaction(async tx => {
      const current = await reinspectPersonalIntentAdmission(tx, admission, input.currentRateConfiguration, env, input.currentPilotEnvelopeReview);
      const owned = await tx.$queryRawUnsafe<Array<{ leaseExpiresAt: Date }>>(
        `SELECT ai."leaseExpiresAt" FROM "ModelGatewayAttempt" a
        JOIN "ModelGatewayDecision" d ON d.id=a."decisionId"
        JOIN "ModelGatewayOperation" o ON o.id=d."gatewayOperationId"
        JOIN "AiOperation" ai ON ai.id=o."aiOperationId"
        JOIN "PersonalAssistantOperation" c ON c."modelGatewayOperationId"=o.id AND c."sourcePersonalOperationId"=ai."personalAssistantOperationId"
        JOIN "AccountProviderSpendHold" h ON h.id=a."accountSpendHoldId"
        JOIN "PersonalAssistantBudget" b ON b.id=c."budgetId"
        WHERE a.id=$1 AND d.id=$2 AND o.id=$3 AND ai.id=$4 AND ai."operationKey"=$5 AND ai."lockedBy"=$6
          AND ai."personalAssistantOperationId"=$7 AND c.id=$8 AND c."budgetId"=$9 AND c."reservedCadMicros"=$10
          AND h.id=$11 AND h."amountMicros"=$12 AND b."ceilingCadMicros"=$13 AND o."requestFingerprint"=$14
          AND c."workspaceId"=$15 AND c."createdByUserId"=$16 AND h."operationKey"=ai."operationKey" AND h.attempt=1
          AND ai.purpose='personal_intent_candidate_v1' AND ai.status='running' AND ai.attempts=1 AND ai."leaseExpiresAt">(now() AT TIME ZONE 'UTC')
          AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
          AND o."operationType"='personal_intent_candidate_v1' AND o.status='admitted'
          AND d.disposition='route_authorized' AND d.attempt=1
          AND a.status='prepared' AND a."dispatchState"='not_dispatched'
          AND c.kind='personal_model_candidate_v1' AND c.status='received' AND c.attempts=0
          AND h.provider='openrouter' AND h.status='held' AND b."expiresAt">(now() AT TIME ZONE 'UTC') AND b."reservedCadMicros">=c."reservedCadMicros"
        FOR UPDATE OF ai,a,o,c,h,b`,
        admission.attempt.id, admission.decision.id, admission.operation.id, admission.claim.operationId, admission.claim.operationKey,
        admission.claim.lockedBy, admission.source.subject.operationId, admission.childOperationId, admission.budgetPolicy.budgetId,
        admission.budgetPolicy.reservationCadMicros, admission.attempt.accountSpendHoldId, admission.budgetPolicy.reservationUsdMicros,
        admission.budgetPolicy.ceilingCadMicros, admission.operation.requestFingerprint,
        admission.source.subject.workspaceId, admission.source.actorUserId);
      if (owned.length !== 1 || input.abortSignal.aborted) return false;
      // The already-held USD amount is exposure, not current dispatch authority.
      // Reusing the canonical helper rechecks today's period, the current explicit
      // provider cap and all other held/settled exposure under its advisory lock.
      // A fresh hold here would be a broken lineage, never a reason to proceed.
      await requireCurrentUsdHold(tx, admission, current.now, env);
      const intentRecord = { schemaVersion: 1, status: "DISPATCH_CLAIMED", executionAuthorized: false,
        accounting: "UNSETTLED", transportMode: mode, dispatchAttempted: true, outcomeKnowledge: "NOT_YET_OBSERVED", automaticRetry: false };
      const updates = [
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='dispatched',"dispatchState"='unaccounted',"dispatchedAt"=(now() AT TIME ZONE 'UTC')
          WHERE id=$1 AND status='prepared' AND "dispatchState"='not_dispatched'`, admission.attempt.id),
        await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='processing',attempts=1,"leaseUntil"=($2::timestamptz AT TIME ZONE 'UTC'),
          result=$3::jsonb,"externalTransportPerformed"=$4,"updatedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='received' AND attempts=0 AND kind='personal_model_candidate_v1'`,
          admission.childOperationId, owned[0].leaseExpiresAt, JSON.stringify(intentRecord), mode === "EXTERNAL_PROVIDER"),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='running' WHERE id=$1 AND status='admitted' AND "operationType"='personal_intent_candidate_v1'`, admission.operation.id),
      ];
      if (updates.some(count => count !== 1)) throw new Error("PERSONAL_MODEL_CLAIM_FENCE_LOST");
      await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.dispatched", correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id, tenantId: admission.request.tenantId, attemptId: admission.attempt.id,
        decisionId: admission.decision.id, spendHoldId: admission.attempt.accountSpendHoldId, billingProvider: "openrouter",
        dispatchState: "unaccounted", evidenceRef: canonicalFingerprint(intentRecord) });
      return true;
    }, { isolationLevel: "Serializable" });
  } catch {
    // This caller has not won the dispatch CAS. A serialization loser must not
    // terminate the winner's running attempt through a shared admission token.
    // If commit acknowledgement was lost, expiry recovery handles the DB claim;
    // this caller still never invokes transport.
    return result("NOT_DISPATCHED", "PRE_DISPATCH_REVALIDATION_FAILED");
  }
  if (!claimed) return result("CLAIM_LOST", "ATTEMPT_NOT_CLAIMED");

  // The claim is committed before obtaining a result. Cancellation or a thrown
  // callback from here onward cannot re-enter an undispatched/release/retry path.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => undefined;
  let providerResult: OpenRouterPersonalIntentResult | null = null;
  try {
    const interrupted = new Promise<null>(resolve => {
      abort = () => { controller.abort(); resolve(null); };
      input.abortSignal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(abort, 120_000);
    });
    if (input.abortSignal.aborted) return await recordUncertain(admission, "PROVIDER_OUTCOME_UNKNOWN");
    const pending = adapter.dispatch(admission.source.input, controller.signal).then(value => value, () => null);
    providerResult = await Promise.race([pending, interrupted]);
  } catch { providerResult = null; }
  finally { if (timer !== undefined) clearTimeout(timer); input.abortSignal.removeEventListener("abort", abort); }
  if (!providerResult || input.abortSignal.aborted || providerResult.status !== "PROPOSAL_INSPECTED_NOT_AUTHORIZED") {
    return recordUncertain(admission, "PROVIDER_OUTCOME_UNKNOWN");
  }
  let inspected: ReturnType<typeof inspectPersonalIntentCandidate>;
  let providerRequestId: string;
  try {
    // Even an injected adapter's claimed validation/authorization flags do not
    // replace source-bound deterministic inspection at the persistence boundary.
    inspected = inspectPersonalIntentCandidate(JSON.stringify(providerResult.inspected.proposal), admission.source.input);
    providerRequestId = providerResult.providerRequestId;
    if (typeof providerRequestId !== "string" || !/^[A-Za-z0-9_.:/-]{1,191}$/.test(providerRequestId)) throw new Error();
  } catch { return recordUncertain(admission, "INVALID_PROPOSAL"); }
  try {
    return await prisma.$transaction(async tx => {
      if (mode === "EXTERNAL_PROVIDER" && (env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED !== "true" || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED")) throw new Error("PERSONAL_MODEL_EXTERNAL_TRANSPORT_DISABLED");
      const current = await reinspectPersonalIntentAdmission(tx, admission, input.currentRateConfiguration, env, input.currentPilotEnvelopeReview);
      // A response is not allowed to outlive either current budget authority.
      // Recheck the original USD hold (never allocate a replacement), and lock
      // the CAD binding/aggregate before publishing even a review-only proposal.
      await requireCurrentUsdHold(tx, admission, current.now, env);
      const cad = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT b.id FROM "PersonalAssistantBudget" b JOIN "PersonalAssistantOperation" c ON c."budgetId"=b.id
        WHERE c.id=$1 AND c."modelGatewayOperationId"=$2 AND c."sourcePersonalOperationId"=$3
          AND c."workspaceId"=$4 AND c."createdByUserId"=$5 AND c.kind='personal_model_candidate_v1'
          AND c.status='processing' AND c.attempts=1 AND c."reservedCadMicros"=$6
          AND b.id=$7 AND b."ceilingCadMicros"=$8 AND b."expiresAt"=($9::timestamptz AT TIME ZONE 'UTC') AND b."expiresAt">(now() AT TIME ZONE 'UTC')
          AND b."reservedCadMicros">=c."reservedCadMicros" AND b."reservedCadMicros"<=b."ceilingCadMicros"
        FOR UPDATE OF b,c`, admission.childOperationId, admission.operation.id, admission.source.subject.operationId,
        admission.source.subject.workspaceId, admission.source.actorUserId, admission.budgetPolicy.reservationCadMicros,
        admission.budgetPolicy.budgetId, admission.budgetPolicy.ceilingCadMicros, new Date(admission.budgetPolicy.expiresAt));
      if (cad.length !== 1) throw new Error("PERSONAL_MODEL_CURRENT_CAD_HOLD_REFUSED");
      const temporal = inspected.proposal.actions.filter(action => ["READ_CALENDAR", "PREPARE_CALENDAR_EVENT", "CLARIFY"].includes(action.kind))
        .map(action => ({ actionId: action.id, result: resolvePersonalCalendarTemporal(current.source.input, JSON.stringify(inspected.proposal), action.id,
          { receivedAt: current.source.receivedAt, timezone: current.source.timezone }) }));
      const stored = { schemaVersion: 1, status: "PROPOSAL_STORED_NOT_AUTHORIZED", executionAuthorized: false,
        readyForActionPreparation: false, accounting: "UNSETTLED", automaticRetry: false, transportMode: mode, dispatchAttempted: true,
        outcomeKnowledge: "RESPONSE_RECEIVED_COST_UNSETTLED", proposal: inspected.proposal, temporal };
      const evidence = canonicalFingerprint(stored);
      await finishPersonalAiOperation(tx, { claim: admission.claim, outcome: "PROPOSAL_INSPECTED", resultId: admission.childOperationId });
      const updates = [
        await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',result=$2::jsonb,"leaseUntil"=NULL,"updatedAt"=(now() AT TIME ZONE 'UTC')
          WHERE id=$1 AND "modelGatewayOperationId"=$3 AND status='processing' AND attempts=1 AND kind='personal_model_candidate_v1'`,
          admission.childOperationId, JSON.stringify(stored), admission.operation.id),
        // Result validity and money settlement are deliberately separate. Valid
        // proposals never cause a fake USD settlement or a CAD hold release.
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='uncertain',"dispatchState"='unaccounted',"resultContractStatus"='valid',
          "providerRequestRef"=$2,"responseEvidenceRef"=$3,"finishedAt"=(now() AT TIME ZONE 'UTC') WHERE id=$1 AND status='dispatched' AND "dispatchState"='unaccounted'`,
          admission.attempt.id, providerRequestId, evidence),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='uncertain',"finishedAt"=(now() AT TIME ZONE 'UTC'),"finalAttemptId"=$2,"resultEvidenceRef"=$3
          WHERE id=$1 AND status='running' AND "operationType"='personal_intent_candidate_v1'`, admission.operation.id, admission.attempt.id, evidence),
      ];
      if (updates.some(count => count !== 1)) throw new Error("PERSONAL_MODEL_TERMINAL_FENCE_LOST");
      await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.uncertain", correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id, tenantId: admission.request.tenantId, attemptId: admission.attempt.id,
        decisionId: admission.decision.id, spendHoldId: admission.attempt.accountSpendHoldId, billingProvider: "openrouter",
        dispatchState: "unaccounted", resultContractStatus: "valid", evidenceRef: evidence });
      return result("PROPOSAL_STORED_NOT_AUTHORIZED", "PROPOSAL_VALID_BILLING_UNSETTLED", true);
    }, { isolationLevel: "Serializable" });
  } catch { return recordUncertain(admission, "POST_DISPATCH_REVALIDATION_FAILED"); }
}
