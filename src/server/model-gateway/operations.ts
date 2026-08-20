import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  claimAiOperation,
  succeedAiOperation,
  type AiOperationClaim,
} from "@/server/ai-operations";
import {
  releaseAccountSpendHold,
  reserveAccountProviderSpend,
} from "@/server/account-spend";
import { canonicalFingerprint } from "./evidence";
import {
  buildClassificationGatewayRequest,
  type ClassificationProjection,
  type ClassificationSourceInput,
} from "./privacy";
import {
  parseGatewayFallbackRules,
  resolveGatewayFallback,
  resolveGatewayPolicy,
  type GatewayPolicySnapshot,
  type GatewayRouteSnapshot,
} from "./policy";
import type {
  GatewayOperationRequest,
  GatewayDataClass,
  GatewayOperationType,
  GatewayPrivacyRequirement,
  GatewayProviderErrorClass,
} from "./types";

type Tx = Prisma.TransactionClient;

const uid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const toMicros = (value: bigint | number | string | null | undefined): bigint =>
  typeof value === "bigint" ? value : value === null || value === undefined ? 0n : BigInt(value);

export type GatewayOperationRow = {
  id: string;
  aiOperationId: string;
  tenantId: string;
  operationType: GatewayOperationType;
  requestFingerprint: string;
  outputContractHash: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  policyVersionId: string;
  maxTotalCostMicros: bigint;
  status: string;
};

export type BindGatewayOperationInput = Omit<GatewayOperationRow, "id" | "status">;

export type GatewayDecisionRow = {
  id: string;
  gatewayOperationId: string;
  attempt: number;
  disposition: "route_authorized" | "refused";
  routeProfileId: string | null;
  reasonClass: string;
  policyHash: string;
  routeHash: string | null;
  privacyEvidenceHash: string | null;
  breakerGeneration: bigint;
  remainingCostMicros: bigint;
  decisionFingerprint: string;
};

export type PersistGatewayDecisionInput = Omit<GatewayDecisionRow, "id" | "decisionFingerprint">;

export type GatewayAttemptRow = {
  id: string;
  decisionId: string;
  accountSpendHoldId: string;
  status: string;
  dispatchState: string;
  resultContractStatus: string;
  requestEvidenceRef: string | null;
};

export async function withModelGatewayTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction((tx) => work(tx), { isolationLevel: "Serializable" });
}

export async function bindGatewayOperation(
  tx: Tx,
  input: BindGatewayOperationInput
): Promise<GatewayOperationRow> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayOperation" (id,"aiOperationId","tenantId","operationType","requestFingerprint","outputContractHash","dataClass","privacyRequirement","policyVersionId","maxTotalCostMicros",status,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'admitted',now()) ON CONFLICT ("aiOperationId") DO NOTHING`,
    uid("gwop"),
    input.aiOperationId,
    input.tenantId,
    input.operationType,
    input.requestFingerprint,
    input.outputContractHash,
    input.dataClass,
    input.privacyRequirement,
    input.policyVersionId,
    input.maxTotalCostMicros
  );
  const [row] = await tx.$queryRawUnsafe<GatewayOperationRow[]>(
    `SELECT id,"aiOperationId","tenantId","operationType","requestFingerprint","outputContractHash","dataClass","privacyRequirement","policyVersionId","maxTotalCostMicros",status FROM "ModelGatewayOperation" WHERE "aiOperationId"=$1`,
    input.aiOperationId
  );
  if (!row) throw new Error("GATEWAY_OPERATION_BINDING_MISSING");
  const same =
    row.tenantId === input.tenantId &&
    row.operationType === input.operationType &&
    row.requestFingerprint === input.requestFingerprint &&
    row.outputContractHash === input.outputContractHash &&
    row.dataClass === input.dataClass &&
    row.privacyRequirement === input.privacyRequirement &&
    row.policyVersionId === input.policyVersionId &&
    row.maxTotalCostMicros === input.maxTotalCostMicros;
  if (!same) throw new Error("GATEWAY_OPERATION_BINDING_CONFLICT");
  return row;
}

export async function persistGatewayDecision(
  tx: Tx,
  input: PersistGatewayDecisionInput
): Promise<GatewayDecisionRow> {
  const decisionFingerprint = canonicalFingerprint(input);
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayDecision" (id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint","decidedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) ON CONFLICT ("gatewayOperationId",attempt) DO NOTHING`,
    uid("decision"),
    input.gatewayOperationId,
    input.attempt,
    input.disposition,
    input.routeProfileId,
    input.reasonClass,
    input.policyHash,
    input.routeHash,
    input.privacyEvidenceHash,
    input.breakerGeneration,
    input.remainingCostMicros,
    decisionFingerprint
  );
  const [row] = await tx.$queryRawUnsafe<GatewayDecisionRow[]>(
    `SELECT id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint" FROM "ModelGatewayDecision" WHERE "gatewayOperationId"=$1 AND attempt=$2`,
    input.gatewayOperationId,
    input.attempt
  );
  if (!row) throw new Error("GATEWAY_DECISION_MISSING");
  if (row.decisionFingerprint !== decisionFingerprint) {
    throw new Error("GATEWAY_DECISION_CONFLICT");
  }
  return row;
}

export async function createGatewayAttempt(
  tx: Tx,
  input: { decisionId: string; accountSpendHoldId: string; requestEvidenceRef?: string | null }
): Promise<GatewayAttemptRow> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayAttempt" (id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","requestEvidenceRef","startedAt") VALUES ($1,$2,$3,'prepared','not_dispatched','not_evaluated',$4,now()) ON CONFLICT ("decisionId") DO NOTHING`,
    uid("attempt"),
    input.decisionId,
    input.accountSpendHoldId,
    input.requestEvidenceRef ?? null
  );
  const [row] = await tx.$queryRawUnsafe<GatewayAttemptRow[]>(
    `SELECT id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","requestEvidenceRef" FROM "ModelGatewayAttempt" WHERE "decisionId"=$1`,
    input.decisionId
  );
  if (!row) throw new Error("GATEWAY_ATTEMPT_MISSING");
  if (
    row.accountSpendHoldId !== input.accountSpendHoldId ||
    row.requestEvidenceRef !== (input.requestEvidenceRef ?? null)
  ) {
    throw new Error("GATEWAY_ATTEMPT_BINDING_CONFLICT");
  }
  return row;
}

type PolicyDbRow = Omit<GatewayPolicySnapshot, "routeOrder" | "fallbackRules"> & { routeOrder: unknown; fallbackRules: unknown };
type RouteDbRow = Omit<GatewayRouteSnapshot, "privacyEvidence"> & { privacyEvidence: unknown };

function parseRouteOrder(value: unknown): GatewayPolicySnapshot["routeOrder"] {
  if (!Array.isArray(value)) throw new Error("INVALID_GATEWAY_ROUTE_ORDER");
  return Object.freeze(
    value.map((pin) => {
      if (
        pin === null ||
        typeof pin !== "object" ||
        typeof (pin as { routeKey?: unknown }).routeKey !== "string" ||
        !Number.isInteger((pin as { version?: unknown }).version) ||
        Number((pin as { version: number }).version) < 1
      ) throw new Error("INVALID_GATEWAY_ROUTE_ORDER");
      return Object.freeze({
        routeKey: (pin as { routeKey: string }).routeKey,
        version: (pin as { version: number }).version,
      });
    })
  );
}

export async function loadGatewayPolicySnapshot(policyId: string): Promise<GatewayPolicySnapshot | null> {
  const rows = await prisma.$queryRawUnsafe<PolicyDbRow[]>(
    `SELECT id,"policyKey",status,"operationType","routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash" FROM "ModelGatewayPolicyVersion" WHERE id=$1`,
    policyId
  );
  const row = rows[0];
  return row ? Object.freeze({ ...row, routeOrder: parseRouteOrder(row.routeOrder), fallbackRules: parseGatewayFallbackRules(row.fallbackRules) }) : null;
}

export async function loadGatewayRouteSnapshots(): Promise<GatewayRouteSnapshot[]> {
  const rows = await prisma.$queryRawUnsafe<RouteDbRow[]>(
    `SELECT id,"routeKey",version,status,"adapterKey","billingProvider",intermediary,"endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash" FROM "ModelGatewayRouteProfile"`
  );
  return rows.map((row) => {
    if (row.privacyEvidence === null || typeof row.privacyEvidence !== "object" || Array.isArray(row.privacyEvidence)) {
      throw new Error("INVALID_GATEWAY_PRIVACY_EVIDENCE");
    }
    return Object.freeze({
      ...row,
      privacyEvidence: Object.freeze({ ...(row.privacyEvidence as Record<string, unknown>) }),
    });
  });
}

export type AuthorizedGatewayAdmission = Readonly<{
  status: "authorized";
  claim: AiOperationClaim;
  request: GatewayOperationRequest;
  projection: ClassificationProjection;
  policy: GatewayPolicySnapshot;
  route: GatewayRouteSnapshot;
  operation: GatewayOperationRow;
  decision: GatewayDecisionRow;
  attempt: GatewayAttemptRow;
}>;

export type GatewayAdmission =
  | AuthorizedGatewayAdmission
  | Readonly<{ status: "refused"; reasonClass: string; decisionId?: string }>
  | Readonly<{ status: "replay"; finalAttemptId: string; resultEvidenceRef: string }>
  | Readonly<{ status: "busy" }>;

async function existingAdmission(aiOperationId: string): Promise<GatewayAdmission | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    status: string;
    finalAttemptId: string | null;
    resultEvidenceRef: string | null;
  }>>(
    `SELECT id,status,"finalAttemptId","resultEvidenceRef" FROM "ModelGatewayOperation" WHERE "aiOperationId"=$1`,
    aiOperationId
  );
  const row = rows[0];
  if (!row) return null;
  if (row.status === "succeeded" && row.finalAttemptId && row.resultEvidenceRef) {
    return Object.freeze({
      status: "replay" as const,
      finalAttemptId: row.finalAttemptId,
      resultEvidenceRef: row.resultEvidenceRef,
    });
  }
  if (row.status === "refused") {
    const decisions = await prisma.$queryRawUnsafe<Array<{ id: string; reasonClass: string }>>(
      `SELECT id,"reasonClass" FROM "ModelGatewayDecision" WHERE "gatewayOperationId"=$1 ORDER BY attempt DESC LIMIT 1`,
      row.id
    );
    return Object.freeze({
      status: "refused" as const,
      reasonClass: decisions[0]?.reasonClass ?? "invalid_request",
      decisionId: decisions[0]?.id,
    });
  }
  return Object.freeze({ status: "busy" as const });
}

export async function admitGatewayClassification(input: {
  aiOperationId: string;
  logicalOperationKey: string;
  tenantId: string;
  taskId: string;
  policyId: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  input: ClassificationSourceInput;
  maxTotalCostMicros: bigint;
}): Promise<GatewayAdmission> {
  const prior = await existingAdmission(input.aiOperationId);
  if (prior) return prior;
  const policy = await loadGatewayPolicySnapshot(input.policyId);
  if (!policy) return Object.freeze({ status: "refused", reasonClass: "unpublished_policy" });
  const { request, projection } = buildClassificationGatewayRequest({
    logicalOperationKey: input.logicalOperationKey,
    tenantId: input.tenantId,
    taskId: input.taskId,
    policyKey: policy.policyKey,
    dataClass: input.dataClass,
    privacyRequirement: input.privacyRequirement,
    maxTotalCostMicros: input.maxTotalCostMicros,
    source: input.input,
  });
  const routes = await loadGatewayRouteSnapshots();
  const resolution = resolveGatewayPolicy({ request, policy, routes });
  const claim = await claimAiOperation(input.logicalOperationKey);
  if (!claim || claim.operationId !== input.aiOperationId) return Object.freeze({ status: "busy" });

  if (resolution.disposition === "refused") {
    return succeedAiOperation({
      claim,
      taskId: input.taskId,
      purpose: "classification",
      usage: null,
      writeResult: async (tx) => {
        const operation = await bindGatewayOperation(tx, {
          aiOperationId: input.aiOperationId,
          tenantId: input.tenantId,
          operationType: "classification",
          requestFingerprint: request.requestFingerprint,
          outputContractHash: request.outputContractHash,
          dataClass: request.dataClass,
          privacyRequirement: request.privacyRequirement,
          policyVersionId: policy.id,
          maxTotalCostMicros: request.maxTotalCostMicros,
        });
        const decision = await persistGatewayDecision(tx, {
          gatewayOperationId: operation.id,
          attempt: claim.attempt,
          disposition: "refused",
          routeProfileId: null,
          reasonClass: resolution.reasonClass,
          policyHash: policy.canonicalHash,
          routeHash: null,
          privacyEvidenceHash: null,
          breakerGeneration: 0n,
          remainingCostMicros: request.maxTotalCostMicros,
        });
        await tx.$executeRawUnsafe(
          `UPDATE "ModelGatewayOperation" SET status='refused',"finishedAt"=now() WHERE id=$1`,
          operation.id
        );
        const value = Object.freeze({
          status: "refused" as const,
          reasonClass: resolution.reasonClass,
          decisionId: decision.id,
        });
        return { resultKind: "modelGatewayOperation", resultId: operation.id, value };
      },
    });
  }

  const grant = await reserveAccountProviderSpend({
    provider: resolution.route.billingProvider,
    operationKey: input.logicalOperationKey,
    attempt: claim.attempt,
    worstCaseMicros: request.maxTotalCostMicros,
  });
  if (!grant.ok) {
    return Object.freeze({ status: "refused", reasonClass: "insufficient_spend_headroom" });
  }
  try {
    // Reservation is the concurrency authority for this exact attempt; use a
    // plain transaction here so Prisma does not try to alter isolation after
    // the account-spend transaction has returned its pooled connection.
    const durable = await prisma.$transaction(async (tx) => {
      const operation = await bindGatewayOperation(tx, {
        aiOperationId: input.aiOperationId,
        tenantId: input.tenantId,
        operationType: "classification",
        requestFingerprint: request.requestFingerprint,
        outputContractHash: request.outputContractHash,
        dataClass: request.dataClass,
        privacyRequirement: request.privacyRequirement,
        policyVersionId: policy.id,
        maxTotalCostMicros: request.maxTotalCostMicros,
      });
      const decision = await persistGatewayDecision(tx, {
        gatewayOperationId: operation.id,
        attempt: claim.attempt,
        disposition: "route_authorized",
        routeProfileId: resolution.route.id,
        reasonClass: resolution.reasonClass,
        policyHash: policy.canonicalHash,
        routeHash: resolution.route.canonicalHash,
        privacyEvidenceHash: resolution.privacyEvidenceHash,
        breakerGeneration: 0n,
        remainingCostMicros: request.maxTotalCostMicros,
      });
      const attempt = await createGatewayAttempt(tx, {
        decisionId: decision.id,
        accountSpendHoldId: grant.holdId,
        requestEvidenceRef: canonicalFingerprint({
          operationType: request.operationType,
          requestFingerprint: request.requestFingerprint,
          outputContractHash: request.outputContractHash,
          routeHash: resolution.route.canonicalHash,
        }),
      });
      return { operation, decision, attempt };
    });
    return Object.freeze({
      status: "authorized" as const,
      claim,
      request,
      projection,
      policy,
      route: resolution.route,
      ...durable,
    });
  } catch (error) {
    try { await releaseAccountSpendHold(grant.holdId); } catch { /* preserve original durable failure */ }
    throw error;
  }
}

/**
 * A fallback is a separate, immutable authorization and a separate account
 * reservation.  It never reuses a first-attempt decision or hold.
 */
export async function authorizeGatewayFallback(input: {
  admission: AuthorizedGatewayAdmission;
  errorClass: GatewayProviderErrorClass;
}): Promise<GatewayAdmission> {
  const { admission } = input;
  const [policy, routes, lineage] = await Promise.all([
    loadGatewayPolicySnapshot(admission.policy.id),
    loadGatewayRouteSnapshots(),
    prisma.$queryRawUnsafe<Array<{
      status: string;
      dispatchState: string;
      errorClass: string | null;
      holdStatus: string;
      aiStatus: string;
      lockedBy: string | null;
      operationStatus: string;
      maxTotalCostMicros: bigint | number | string;
      settledMicros: bigint | number | string | null;
      heldMicros: bigint | number | string | null;
    }>>(
      `SELECT a.status,a."dispatchState",a."errorClass",h.status "holdStatus",ai.status "aiStatus",ai."lockedBy",o.status "operationStatus",o."maxTotalCostMicros",
        COALESCE((SELECT SUM("settledMicros") FROM "AccountProviderSpendHold" WHERE "operationKey"=ai."operationKey" AND status='settled'),0) "settledMicros",
        COALESCE((SELECT SUM("amountMicros") FROM "AccountProviderSpendHold" WHERE "operationKey"=ai."operationKey" AND status='held'),0) "heldMicros"
       FROM "ModelGatewayOperation" o
       JOIN "AiOperation" ai ON ai.id=o."aiOperationId"
       JOIN "ModelGatewayAttempt" a ON a.id=$2
       JOIN "AccountProviderSpendHold" h ON h.id=a."accountSpendHoldId"
       WHERE o.id=$1`,
      admission.operation.id,
      admission.attempt.id
    ),
  ]);
  const prior = lineage[0];
  if (
    !prior || prior.aiStatus !== "running" || prior.lockedBy !== admission.claim.lockedBy ||
    prior.operationStatus !== "admitted" || prior.status !== "failed" ||
    prior.dispatchState !== "settled" || prior.holdStatus !== "settled" ||
    prior.errorClass !== input.errorClass
  ) return Object.freeze({ status: "busy" as const });

  const remaining = toMicros(prior.maxTotalCostMicros) - toMicros(prior.settledMicros) - toMicros(prior.heldMicros);
  const resolution = resolveGatewayFallback({
    request: admission.request,
    policy,
    routes,
    priorRoute: admission.route,
    errorClass: input.errorClass,
    priorAttempt: admission.decision.attempt,
    remainingCostMicros: remaining,
  });
  if (resolution.disposition === "refused") {
    return Object.freeze({ status: "refused" as const, reasonClass: resolution.reasonClass });
  }
  const grant = await reserveAccountProviderSpend({
    provider: resolution.route.billingProvider,
    operationKey: admission.claim.operationKey,
    attempt: resolution.attempt,
    worstCaseMicros: remaining,
  });
  if (!grant.ok) return Object.freeze({ status: "refused" as const, reasonClass: "insufficient_spend_headroom" });
  if (!grant.created) return Object.freeze({ status: "busy" as const });
  try {
    const durable = await prisma.$transaction(async (tx) => {
      const decision = await persistGatewayDecision(tx, {
        gatewayOperationId: admission.operation.id,
        attempt: resolution.attempt,
        disposition: "route_authorized",
        routeProfileId: resolution.route.id,
        reasonClass: resolution.reasonClass,
        policyHash: resolution.policy.canonicalHash,
        routeHash: resolution.route.canonicalHash,
        privacyEvidenceHash: resolution.privacyEvidenceHash,
        breakerGeneration: 0n,
        remainingCostMicros: remaining,
      });
      const attempt = await createGatewayAttempt(tx, {
        decisionId: decision.id,
        accountSpendHoldId: grant.holdId,
        requestEvidenceRef: canonicalFingerprint({
          operationType: admission.request.operationType,
          requestFingerprint: admission.request.requestFingerprint,
          outputContractHash: admission.request.outputContractHash,
          routeHash: resolution.route.canonicalHash,
        }),
      });
      return { decision, attempt };
    });
    return Object.freeze({
      status: "authorized" as const,
      claim: admission.claim,
      request: admission.request,
      projection: admission.projection,
      policy: resolution.policy,
      route: resolution.route,
      operation: admission.operation,
      ...durable,
    });
  } catch (error) {
    try { await releaseAccountSpendHold(grant.holdId); } catch { /* preserve original durable failure */ }
    throw error;
  }
}
