import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { succeedAiOperation, SupersededOperationError } from "@/server/ai-operations";
import { settleAccountSpendHold } from "@/server/account-spend";
import type { ModelGatewayAdapter } from "./adapters/contract";
import { loadGatewayBreakerResolution } from "./breakers";
import { appendGatewayAuditEvent, canonicalFingerprint, validateClassificationResponse } from "./evidence";
import {
  loadGatewayPolicySnapshot,
  loadGatewayRouteSnapshots,
  type AuthorizedGatewayAdmission,
} from "./operations";
import { resolveGatewayPolicy } from "./policy";
import type { GatewayOperationResult } from "./types";
import type { ClassificationOutput } from "@/lib/ai-work-engine/schemas";

export const GATEWAY_CREDENTIAL_ENVIRONMENTS = ["local", "preview", "production"] as const;
export type GatewayCredentialEnvironment = (typeof GATEWAY_CREDENTIAL_ENVIRONMENTS)[number];

/**
 * Execution remains off unless a caller carries an explicit local-only test
 * authorization. An environment name alone is never an authorization and no
 * process environment variable can silently enable a provider path.
 */
export type GatewayRolloutGateInput = Readonly<{
  environment?: GatewayCredentialEnvironment;
  classificationEnabled?: boolean;
}>;

export type GatewayRolloutGateResolution =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reasonClass: "rollout_disabled" }>;

export function resolveGatewayRolloutGate(
  input: GatewayRolloutGateInput
): GatewayRolloutGateResolution {
  if (input.environment === "local" && input.classificationEnabled === true) {
    return Object.freeze({ allowed: true });
  }
  return Object.freeze({ allowed: false, reasonClass: "rollout_disabled" });
}

/**
 * Credentials are deliberately not part of AdapterAttemptEnvelope. A route- and
 * environment-bound resolver may retain them internally and returns only a
 * dispatch capability after every durable and point-of-use authorization gate
 * has passed. The synthetic route does not need a resolver.
 */
export type CertifiedRouteCredentialScope = Readonly<{
  routeProfileId: string;
  routeKey: string;
  routeVersion: number;
  adapterKey: string;
  endpointKey: string;
  modelKey: string;
  environment: GatewayCredentialEnvironment;
}>;

export type CertifiedRouteDispatcher = Readonly<Pick<ModelGatewayAdapter, "dispatch">>;
export type CertifiedRouteCredentialResolver = (
  scope: CertifiedRouteCredentialScope
) => Promise<CertifiedRouteDispatcher>;

function credentialScopeFor(
  admission: AuthorizedGatewayAdmission,
  environment: GatewayCredentialEnvironment
): CertifiedRouteCredentialScope {
  return Object.freeze({
    routeProfileId: admission.route.id,
    routeKey: admission.route.routeKey,
    routeVersion: admission.route.version,
    adapterKey: admission.route.adapterKey,
    endpointKey: admission.route.endpointKey,
    modelKey: admission.route.modelKey,
    environment,
  });
}

async function closeGatewayOperation(
  admission: AuthorizedGatewayAdmission,
  input: {
    operationStatus: "succeeded" | "failed" | "uncertain";
    attemptStatus: "settled" | "failed" | "uncertain";
    dispatchState: "settled" | "unaccounted";
    resultContractStatus: "valid" | "invalid" | "not_evaluated";
    providerRequestRef: string | null;
    responseEvidenceRef: string | null;
    errorClass: string | null;
    httpStatus: number | null;
    actualCostMicros: bigint;
  }
): Promise<void> {
  await succeedAiOperation({
    claim: admission.claim,
    taskId: admission.request.taskId,
    purpose: "classification",
    usage: null,
    writeResult: async (tx: Prisma.TransactionClient) => {
      await settleAccountSpendHold(tx, admission.attempt.accountSpendHoldId, input.actualCostMicros);
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayAttempt" SET status=$2,"dispatchState"=$3,"providerRequestRef"=$4,"responseEvidenceRef"=$5,"errorClass"=$6,"httpStatus"=$7,"resultContractStatus"=$8,"dispatchedAt"=COALESCE("dispatchedAt",now()),"finishedAt"=now() WHERE id=$1`,
        admission.attempt.id,
        input.attemptStatus,
        input.dispatchState,
        input.providerRequestRef,
        input.responseEvidenceRef,
        input.errorClass,
        input.httpStatus,
        input.resultContractStatus
      );
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayOperation" SET status=$2,"finalAttemptId"=$3,"resultEvidenceRef"=$4,"finishedAt"=now() WHERE id=$1`,
        admission.operation.id,
        input.operationStatus,
        admission.attempt.id,
        input.responseEvidenceRef
      );
      await appendGatewayAuditEvent(tx, {
        eventType: input.attemptStatus === "settled"
          ? "model_gateway.attempt.settled"
          : "model_gateway.attempt.failed",
        correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id,
        tenantId: admission.request.tenantId,
        attemptId: admission.attempt.id,
        decisionId: admission.decision.id,
        policyHash: admission.decision.policyHash,
        routeHash: admission.decision.routeHash,
        spendHoldId: admission.attempt.accountSpendHoldId,
        billingProvider: admission.route.billingProvider,
        amountMicros: input.actualCostMicros,
        errorClass: input.errorClass,
        dispatchState: input.dispatchState,
        resultContractStatus: input.resultContractStatus,
        evidenceRef: input.responseEvidenceRef,
      });
      await appendGatewayAuditEvent(tx, {
        eventType: "model_gateway.spend.settled",
        correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id,
        tenantId: admission.request.tenantId,
        attemptId: admission.attempt.id,
        decisionId: admission.decision.id,
        spendHoldId: admission.attempt.accountSpendHoldId,
        billingProvider: admission.route.billingProvider,
        amountMicros: input.actualCostMicros,
        evidenceRef: input.responseEvidenceRef,
      });
      return {
        resultKind: "modelGatewayOperation",
        resultId: admission.operation.id,
        value: undefined,
      };
    },
  });
}

async function refuseBeforeDispatch(
  admission: AuthorizedGatewayAdmission,
  reasonClass: string
): Promise<void> {
  const evidence = canonicalFingerprint({
    attemptId: admission.attempt.id,
    policyHash: admission.decision.policyHash,
    routeHash: admission.decision.routeHash,
    requestFingerprint: admission.request.requestFingerprint,
    disposition: "refused_before_dispatch",
    reasonClass,
  });
  await succeedAiOperation({
    claim: admission.claim,
    taskId: admission.request.taskId,
    purpose: "classification",
    usage: null,
    writeResult: async (tx) => {
      await tx.accountProviderSpendHold.updateMany({
        where: { id: admission.attempt.accountSpendHoldId, status: "held" },
        data: { status: "released", settledMicros: 0n },
      });
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayAttempt" SET status='cancelled_before_dispatch',"dispatchState"='not_dispatched',"errorClass"=$2,"resultContractStatus"='not_evaluated',"responseEvidenceRef"=$3,"finishedAt"=now() WHERE id=$1`,
        admission.attempt.id,
        reasonClass,
        evidence
      );
      await appendGatewayAuditEvent(tx, {
        eventType: "model_gateway.attempt.failed",
        correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id,
        tenantId: admission.request.tenantId,
        attemptId: admission.attempt.id,
        decisionId: admission.decision.id,
        policyHash: admission.decision.policyHash,
        routeHash: admission.decision.routeHash,
        spendHoldId: admission.attempt.accountSpendHoldId,
        billingProvider: admission.route.billingProvider,
        errorClass: reasonClass,
        dispatchState: "not_dispatched",
        evidenceRef: evidence,
      });
      await appendGatewayAuditEvent(tx, {
        eventType: "model_gateway.spend.released",
        correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id,
        tenantId: admission.request.tenantId,
        attemptId: admission.attempt.id,
        decisionId: admission.decision.id,
        spendHoldId: admission.attempt.accountSpendHoldId,
        billingProvider: admission.route.billingProvider,
        amountMicros: 0n,
        errorClass: reasonClass,
        evidenceRef: evidence,
      });
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayOperation" SET status='refused',"finalAttemptId"=$2,"resultEvidenceRef"=$3,"finishedAt"=now() WHERE id=$1`,
        admission.operation.id,
        admission.attempt.id,
        evidence
      );
      return {
        resultKind: "modelGatewayOperation",
        resultId: admission.operation.id,
        value: undefined,
      };
    },
  });
}

/** A dispatched request with no trustworthy cost/result never releases its hold. */
async function retainAmbiguousDispatch(
  admission: AuthorizedGatewayAdmission,
  input: { errorClass: string | null; httpStatus: number | null; providerRequestRef: string | null }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayAttempt" SET status='uncertain',"dispatchState"='unaccounted',"providerRequestRef"=$2,"errorClass"=$3,"httpStatus"=$4,"resultContractStatus"='not_evaluated',"finishedAt"=now() WHERE id=$1 AND status='dispatched'`,
      admission.attempt.id,
      input.providerRequestRef,
      input.errorClass,
      input.httpStatus
    );
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayOperation" SET status='uncertain' WHERE id=$1 AND status='admitted'`,
      admission.operation.id
    );
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.attempt.uncertain",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.request.tenantId,
      attemptId: admission.attempt.id,
      decisionId: admission.decision.id,
      policyHash: admission.decision.policyHash,
      routeHash: admission.decision.routeHash,
      spendHoldId: admission.attempt.accountSpendHoldId,
      billingProvider: admission.route.billingProvider,
      errorClass: input.errorClass,
      dispatchState: "unaccounted",
    });
  });
}

/** A known provider refusal without measured usage is also not zero-cost. */
async function retainUnsettledProviderFailure(
  admission: AuthorizedGatewayAdmission,
  input: { errorClass: string; httpStatus: number | null; providerRequestRef: string | null; responseEvidenceRef: string | null }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayAttempt" SET status='failed',"dispatchState"='unaccounted',"providerRequestRef"=$2,"responseEvidenceRef"=$3,"errorClass"=$4,"httpStatus"=$5,"resultContractStatus"='not_evaluated',"finishedAt"=now() WHERE id=$1 AND status='dispatched'`,
      admission.attempt.id,
      input.providerRequestRef,
      input.responseEvidenceRef,
      input.errorClass,
      input.httpStatus
    );
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.attempt.failed",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.request.tenantId,
      attemptId: admission.attempt.id,
      decisionId: admission.decision.id,
      policyHash: admission.decision.policyHash,
      routeHash: admission.decision.routeHash,
      spendHoldId: admission.attempt.accountSpendHoldId,
      billingProvider: admission.route.billingProvider,
      errorClass: input.errorClass,
      dispatchState: "unaccounted",
      evidenceRef: input.responseEvidenceRef,
    });
  });
}

export async function dispatchGatewayAttempt(input: {
  admission: AuthorizedGatewayAdmission;
  adapter: ModelGatewayAdapter;
  abortSignal: AbortSignal;
  rollout?: GatewayRolloutGateInput;
  credentialEnvironment?: GatewayCredentialEnvironment;
  credentialResolver?: CertifiedRouteCredentialResolver;
}): Promise<GatewayOperationResult<ClassificationOutput>> {
  const { admission } = input;
  const rollout = resolveGatewayRolloutGate(input.rollout ?? {});
  if (!rollout.allowed) {
    await refuseBeforeDispatch(admission, rollout.reasonClass);
    return Object.freeze({ status: "refused" as const, reasonClass: rollout.reasonClass });
  }
  const [policy, routes, lineage] = await Promise.all([
    loadGatewayPolicySnapshot(admission.policy.id),
    loadGatewayRouteSnapshots(),
    prisma.$queryRawUnsafe<Array<{
      disposition: string;
      routeProfileId: string | null;
      attemptStatus: string;
      dispatchState: string;
      holdStatus: string;
      aiStatus: string;
      lockedBy: string | null;
    }>>(
      `SELECT d.disposition,d."routeProfileId",a.status "attemptStatus",a."dispatchState",h.status "holdStatus",ai.status "aiStatus",ai."lockedBy" FROM "ModelGatewayDecision" d JOIN "ModelGatewayOperation" o ON o.id=d."gatewayOperationId" JOIN "AiOperation" ai ON ai.id=o."aiOperationId" JOIN "ModelGatewayAttempt" a ON a."decisionId"=d.id JOIN "AccountProviderSpendHold" h ON h.id=a."accountSpendHoldId" WHERE d.id=$1 AND a.id=$2`,
      admission.decision.id,
      admission.attempt.id
    ),
  ]);
  const current = resolveGatewayPolicy({ request: admission.request, policy, routes });
  const breaker = current.disposition === "route_authorized"
    ? await loadGatewayBreakerResolution({ policy: current.policy, route: current.route })
    : null;
  const row = lineage[0];
  if (!row || row.aiStatus !== "running" || row.lockedBy !== admission.claim.lockedBy) {
    throw new SupersededOperationError(admission.claim.operationKey);
  }
  if (
    current.disposition !== "route_authorized" ||
    current.route.id !== admission.route.id ||
    current.route.canonicalHash !== admission.decision.routeHash ||
    row.disposition !== "route_authorized" ||
    row.routeProfileId !== admission.route.id ||
    row.attemptStatus !== "prepared" ||
    row.dispatchState !== "not_dispatched" ||
    row.holdStatus !== "held" ||
    input.adapter.key !== admission.route.adapterKey ||
    breaker?.status === "open" ||
    (breaker !== null && breaker.generation !== admission.decision.breakerGeneration)
  ) {
    const reasonClass = breaker?.status === "open" ||
      (breaker !== null && breaker.generation !== admission.decision.breakerGeneration)
      ? "open_breaker"
      : "ineligible_route";
    await refuseBeforeDispatch(admission, reasonClass);
    return Object.freeze({ status: "refused" as const, reasonClass });
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayAttempt" SET status='dispatched',"dispatchedAt"=now() WHERE id=$1 AND status='prepared' AND "dispatchState"='not_dispatched'`,
      admission.attempt.id
    );
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.attempt.dispatched",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.request.tenantId,
      attemptId: admission.attempt.id,
      decisionId: admission.decision.id,
      policyHash: admission.decision.policyHash,
      routeHash: admission.decision.routeHash,
      spendHoldId: admission.attempt.accountSpendHoldId,
      billingProvider: admission.route.billingProvider,
      dispatchState: "settled",
      evidenceRef: admission.attempt.requestEvidenceRef,
    });
  });
  const dispatcher = input.credentialResolver
    ? await input.credentialResolver(credentialScopeFor(admission, input.credentialEnvironment ?? "local"))
    : input.adapter;
  const result = await dispatcher.dispatch({
    operationId: admission.operation.id,
    attemptId: admission.attempt.id,
    tenantId: admission.request.tenantId,
    adapterKey: admission.route.adapterKey,
    billingProvider: admission.route.billingProvider,
    intermediary: admission.route.intermediary,
    endpointKey: admission.route.endpointKey,
    modelKey: admission.route.modelKey,
    boundedInput: admission.projection,
    outputContractHash: admission.request.outputContractHash,
    requestEvidenceRef: admission.attempt.requestEvidenceRef!,
    abortSignal: input.abortSignal,
  });

  if (result.dispatchKnowledge === "dispatched_unknown") {
    await retainAmbiguousDispatch(admission, {
      providerRequestRef: result.providerRequestRef,
      errorClass: result.errorClass,
      httpStatus: result.httpStatus,
    });
    return Object.freeze({ status: "uncertain", reasonClass: "unknown_dispatched_outcome" });
  }
  if (result.dispatchKnowledge === "not_dispatched") {
    await refuseBeforeDispatch(admission, result.errorClass ?? "invalid_request");
    return Object.freeze({ status: "refused", reasonClass: "invalid_request" });
  }
  if (result.dispatchKnowledge !== "response_received") {
    await refuseBeforeDispatch(admission, "invalid_request");
    return Object.freeze({ status: "refused", reasonClass: "invalid_request" });
  }
  if (result.usage === null) {
    const failureClass = result.errorClass === "unknown_dispatched_outcome"
      ? "unknown_failure"
      : result.errorClass ?? "unknown_failure";
    await retainUnsettledProviderFailure(admission, {
      providerRequestRef: result.providerRequestRef,
      responseEvidenceRef: result.responseEvidenceRef,
      errorClass: failureClass,
      httpStatus: result.httpStatus,
    });
    return Object.freeze({ status: "failed", failureClass });
  }

  const validation = validateClassificationResponse(result.response);
  const terminalEvidence = canonicalFingerprint({
    attemptId: admission.attempt.id,
    policyHash: admission.decision.policyHash,
    routeHash: admission.decision.routeHash,
    requestFingerprint: admission.request.requestFingerprint,
    providerEvidenceRef: result.responseEvidenceRef,
    contractEvidenceRef: validation.responseEvidenceRef,
    usage: result.usage,
  });
  if (validation.status === "invalid") {
    await closeGatewayOperation(admission, {
      operationStatus: "failed",
      attemptStatus: "failed",
      dispatchState: "settled",
      resultContractStatus: "invalid",
      providerRequestRef: result.providerRequestRef,
      responseEvidenceRef: terminalEvidence,
      errorClass: validation.failureClass,
      httpStatus: result.httpStatus,
      actualCostMicros: result.usage.measuredCostMicros,
    });
    return Object.freeze({ status: "failed", failureClass: "malformed_provider_response" });
  }
  await closeGatewayOperation(admission, {
    operationStatus: "succeeded",
    attemptStatus: "settled",
    dispatchState: "settled",
    resultContractStatus: "valid",
    providerRequestRef: result.providerRequestRef,
    responseEvidenceRef: terminalEvidence,
    errorClass: null,
    httpStatus: result.httpStatus,
    actualCostMicros: result.usage.measuredCostMicros,
  });
  return Object.freeze({ status: "succeeded", value: validation.value, finalAttemptId: admission.attempt.id });
}
