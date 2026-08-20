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
import { appendGatewayAuditEvent, canonicalFingerprint } from "./evidence";
import { loadGatewayBreakerResolution } from "./breakers";
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
  ClassificationGatewayOperationRequest,
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
  const tenantRows = await tx.$queryRawUnsafe<Array<{
    taskId: string | null;
    taskClientId: string | null;
    purpose: string;
    voiceIntakeSegmentId: string | null;
    voiceClientId: string | null;
  }>>(
    `SELECT ai."taskId",task."clientId" "taskClientId",ai.purpose,ai."voiceIntakeSegmentId",voice."clientId" "voiceClientId" FROM "AiOperation" ai LEFT JOIN "Task" task ON task.id=ai."taskId" LEFT JOIN "VoiceIntakeSegment" segment ON segment.id=ai."voiceIntakeSegmentId" LEFT JOIN "VoiceIntakeSession" voice ON voice.id=segment."sessionId" WHERE ai.id=$1`,
    input.aiOperationId
  );
  const tenant = tenantRows[0];
  const classificationBinding = input.operationType === "classification" &&
    tenant?.taskId !== null && tenant?.taskClientId === input.tenantId &&
    tenant?.voiceIntakeSegmentId === null;
  const voiceBinding = input.operationType === "intake_voice_transcription" &&
    tenant?.purpose === "intake_voice_transcription" && tenant.voiceIntakeSegmentId !== null &&
    tenant.taskId === null && tenant.voiceClientId === input.tenantId;
  if (!tenant || (!classificationBinding && !voiceBinding)) {
    throw new Error("GATEWAY_OPERATION_TENANT_TASK_BINDING_MISMATCH");
  }
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
  await appendGatewayAuditEvent(tx, {
    eventType: "model_gateway.admission.accepted",
    correlationId: `gateway:${row.id}`,
    gatewayOperationId: row.id,
    tenantId: row.tenantId,
    evidenceRef: row.requestFingerprint,
  });
  return row;
}

export async function persistGatewayDecision(
  tx: Tx,
  input: PersistGatewayDecisionInput
): Promise<GatewayDecisionRow> {
  const policyRows = await tx.$queryRawUnsafe<Array<{
    policyHash: string;
    routeOrder: unknown;
    tenantId: string;
  }>>(
    `SELECT p."canonicalHash" AS "policyHash",p."routeOrder",o."tenantId" FROM "ModelGatewayOperation" o JOIN "ModelGatewayPolicyVersion" p ON p.id=o."policyVersionId" WHERE o.id=$1`,
    input.gatewayOperationId
  );
  const policy = policyRows[0];
  if (!policy || policy.policyHash !== input.policyHash) {
    throw new Error("GATEWAY_DECISION_POLICY_BINDING_MISMATCH");
  }
  if (input.disposition === "route_authorized") {
    if (!input.routeProfileId || !input.routeHash || !input.privacyEvidenceHash) {
      throw new Error("GATEWAY_DECISION_ROUTE_BINDING_MISMATCH");
    }
    const routeRows = await tx.$queryRawUnsafe<Array<{
      routeKey: string;
      version: number;
      routeHash: string;
    }>>(
      `SELECT "routeKey",version,"canonicalHash" AS "routeHash" FROM "ModelGatewayRouteProfile" WHERE id=$1`,
      input.routeProfileId
    );
    const route = routeRows[0];
    const authorized = route !== undefined &&
      route.routeHash === input.routeHash &&
      parseRouteOrder(policy.routeOrder).some((pin) => pin.routeKey === route.routeKey && pin.version === route.version);
    if (!authorized) throw new Error("GATEWAY_DECISION_ROUTE_BINDING_MISMATCH");
  } else if (input.routeProfileId !== null || input.routeHash !== null || input.privacyEvidenceHash !== null) {
    throw new Error("GATEWAY_DECISION_ROUTE_BINDING_MISMATCH");
  }
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
  await appendGatewayAuditEvent(tx, {
    eventType: row.disposition === "route_authorized"
      ? "model_gateway.decision.authorized"
      : "model_gateway.decision.refused",
    correlationId: `gateway:${row.gatewayOperationId}`,
    gatewayOperationId: row.gatewayOperationId,
    tenantId: policy.tenantId,
    attemptId: `attempt:${row.attempt}`,
    decisionId: row.id,
    policyHash: row.policyHash,
    routeHash: row.routeHash,
    errorClass: row.disposition === "refused" ? row.reasonClass : null,
  });
  return row;
}

export async function createGatewayAttempt(
  tx: Tx,
  input: { decisionId: string; accountSpendHoldId: string; requestEvidenceRef?: string | null }
): Promise<GatewayAttemptRow> {
  const bindings = await tx.$queryRawUnsafe<Array<{
    aiOperationKey: string;
    holdOperationKey: string;
    billingProvider: string;
    holdProvider: string;
    holdAmountMicros: bigint;
    tenantId: string;
    taskClientId: string | null;
    voiceClientId: string | null;
    operationType: string;
    gatewayOperationId: string;
  }>>(
    `SELECT ai."operationKey" AS "aiOperationKey",h."operationKey" AS "holdOperationKey",r."billingProvider",h.provider AS "holdProvider",h."amountMicros" AS "holdAmountMicros",o."tenantId",o."operationType",o.id AS "gatewayOperationId",task."clientId" AS "taskClientId",voice."clientId" AS "voiceClientId"
       FROM "ModelGatewayDecision" d
       JOIN "ModelGatewayOperation" o ON o.id=d."gatewayOperationId"
       JOIN "AiOperation" ai ON ai.id=o."aiOperationId"
       LEFT JOIN "Task" task ON task.id=ai."taskId"
       LEFT JOIN "VoiceIntakeSegment" segment ON segment.id=ai."voiceIntakeSegmentId"
       LEFT JOIN "VoiceIntakeSession" voice ON voice.id=segment."sessionId"
       JOIN "ModelGatewayRouteProfile" r ON r.id=d."routeProfileId"
       JOIN "AccountProviderSpendHold" h ON h.id=$2
      WHERE d.id=$1 AND d.disposition='route_authorized'`,
    input.decisionId,
    input.accountSpendHoldId
  );
  const binding = bindings[0];
  if (
    !binding ||
    binding.aiOperationKey !== binding.holdOperationKey ||
    binding.billingProvider !== binding.holdProvider ||
    (binding.operationType === "classification"
      ? binding.tenantId !== binding.taskClientId
      : binding.operationType === "intake_voice_transcription"
        ? binding.tenantId !== binding.voiceClientId
        : true)
  ) {
    throw new Error("GATEWAY_ATTEMPT_SPEND_BINDING_MISMATCH");
  }
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
  await appendGatewayAuditEvent(tx, {
    eventType: "model_gateway.attempt.prepared",
    correlationId: `gateway:${binding.gatewayOperationId}`,
    gatewayOperationId: binding.gatewayOperationId,
    tenantId: binding.tenantId,
    attemptId: row.id,
    decisionId: row.decisionId,
    spendHoldId: row.accountSpendHoldId,
    billingProvider: binding.billingProvider,
    evidenceRef: row.requestEvidenceRef,
  });
  await appendGatewayAuditEvent(tx, {
    eventType: "model_gateway.spend.held",
    correlationId: `gateway:${binding.gatewayOperationId}`,
    gatewayOperationId: binding.gatewayOperationId,
    tenantId: binding.tenantId,
    attemptId: row.id,
    decisionId: row.decisionId,
    spendHoldId: row.accountSpendHoldId,
    billingProvider: binding.billingProvider,
    amountMicros: binding.holdAmountMicros,
  });
  return row;
}

type PolicyDbRow = Omit<GatewayPolicySnapshot, "routeOrder" | "fallbackRules"> & { routeOrder: unknown; fallbackRules: unknown };
type RouteDbRow = Omit<GatewayRouteSnapshot, "privacyEvidence" | "residency"> & {
  privacyEvidence: unknown;
  residency: unknown;
};

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
    `SELECT id,"routeKey",version,status,"pathKind","adapterKey","billingProvider",intermediary,"endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash" FROM "ModelGatewayRouteProfile"`
  );
  return rows.map((row) => {
    if (row.privacyEvidence === null || typeof row.privacyEvidence !== "object" || Array.isArray(row.privacyEvidence) ||
      !Array.isArray(row.residency) || row.residency.some((value) => typeof value !== "string")) {
      throw new Error("INVALID_GATEWAY_PRIVACY_EVIDENCE");
    }
    return Object.freeze({
      ...row,
      residency: Object.freeze([...row.residency] as string[]),
      privacyEvidence: Object.freeze({ ...(row.privacyEvidence as Record<string, unknown>) }),
    });
  });
}

export type AuthorizedGatewayAdmission = Readonly<{
  status: "authorized";
  claim: AiOperationClaim;
  request: ClassificationGatewayOperationRequest;
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
    tenantId: string;
    status: string;
    finalAttemptId: string | null;
    resultEvidenceRef: string | null;
  }>>(
    `SELECT id,"tenantId",status,"finalAttemptId","resultEvidenceRef" FROM "ModelGatewayOperation" WHERE "aiOperationId"=$1`,
    aiOperationId
  );
  const row = rows[0];
  if (!row) return null;
  if (row.status === "succeeded" && row.finalAttemptId && row.resultEvidenceRef) {
    await prisma.$transaction((tx) => appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.replay.converged",
      correlationId: `gateway:${row.id}`,
      gatewayOperationId: row.id,
      tenantId: row.tenantId,
      attemptId: row.finalAttemptId,
      evidenceRef: row.resultEvidenceRef,
    }));
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
    await prisma.$transaction((tx) => appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.replay.converged",
      correlationId: `gateway:${row.id}`,
      gatewayOperationId: row.id,
      tenantId: row.tenantId,
      decisionId: decisions[0]?.id ?? null,
      errorClass: decisions[0]?.reasonClass ?? "invalid_request",
    }));
    return Object.freeze({
      status: "refused" as const,
      reasonClass: decisions[0]?.reasonClass ?? "invalid_request",
      decisionId: decisions[0]?.id,
    });
  }
  return Object.freeze({ status: "busy" as const });
}

/**
 * The caller never gets to supply a tenant label that merely looks plausible.
 * Admission binds the existing operation to its task's actual client before
 * it reads policy, reserves spend or builds an external attempt.
 */
async function admissionTenantBindingMatches(input: {
  aiOperationId: string;
  taskId: string;
  tenantId: string;
}): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ taskId: string | null; clientId: string | null }>>(
    `SELECT ai."taskId",task."clientId" FROM "AiOperation" ai LEFT JOIN "Task" task ON task.id=ai."taskId" WHERE ai.id=$1`,
    input.aiOperationId
  );
  const row = rows[0];
  return row?.taskId === input.taskId && row.clientId === input.tenantId;
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
  if (!await admissionTenantBindingMatches(input)) {
    return Object.freeze({ status: "refused" as const, reasonClass: "invalid_request" as const });
  }
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
  if (
    request.contentRef.kind !== "classification_input" ||
    request.contentRef.id !== input.taskId ||
    request.contentRef.fingerprint !== request.requestFingerprint
  ) {
    return Object.freeze({ status: "refused" as const, reasonClass: "invalid_request" as const });
  }
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
        await appendGatewayAuditEvent(tx, {
          eventType: "model_gateway.admission.refused",
          correlationId: `gateway:${operation.id}`,
          gatewayOperationId: operation.id,
          tenantId: input.tenantId,
          decisionId: decision.id,
          policyHash: policy.canonicalHash,
          errorClass: resolution.reasonClass,
          evidenceRef: request.requestFingerprint,
        });
        const value = Object.freeze({
          status: "refused" as const,
          reasonClass: resolution.reasonClass,
          decisionId: decision.id,
        });
        return { resultKind: "modelGatewayOperation", resultId: operation.id, value };
      },
    });
  }

  const breaker = await loadGatewayBreakerResolution({
    policy: resolution.policy,
    route: resolution.route,
  });
  if (breaker.status === "open") {
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
          reasonClass: "open_breaker",
          policyHash: policy.canonicalHash,
          routeHash: null,
          privacyEvidenceHash: null,
          breakerGeneration: breaker.generation,
          remainingCostMicros: request.maxTotalCostMicros,
        });
        await tx.$executeRawUnsafe(
          `UPDATE "ModelGatewayOperation" SET status='refused',"finishedAt"=now() WHERE id=$1`,
          operation.id
        );
        await appendGatewayAuditEvent(tx, {
          eventType: "model_gateway.admission.refused",
          correlationId: `gateway:${operation.id}`,
          gatewayOperationId: operation.id,
          tenantId: input.tenantId,
          decisionId: decision.id,
          policyHash: policy.canonicalHash,
          errorClass: "open_breaker",
          evidenceRef: request.requestFingerprint,
        });
        const value = Object.freeze({
          status: "refused" as const,
          reasonClass: "open_breaker" as const,
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
        breakerGeneration: breaker.generation,
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
