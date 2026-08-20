import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { claimAiOperation, type AiOperationClaim } from "@/server/ai-operations";
import {
  releaseAccountSpendHold,
  reserveAccountProviderSpend,
  settleAccountSpendHold,
} from "@/server/account-spend";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import { loadGatewayBreakerResolution } from "../breakers";
import {
  bindGatewayOperation,
  createGatewayAttempt,
  loadGatewayPolicySnapshot,
  loadGatewayRouteSnapshots,
  persistGatewayDecision,
  type GatewayAttemptRow,
  type GatewayDecisionRow,
  type GatewayOperationRow,
} from "../operations";
import { resolveGatewayPolicy, type GatewayPolicySnapshot, type GatewayRouteSnapshot } from "../policy";
import { buildVoiceGatewayRequest } from "../privacy";
import type { GatewayDataClass, GatewayPrivacyRequirement, VoiceGatewayOperationRequest } from "../types";
import { buildVoiceSegmentProjection, type VoiceSegmentProjection } from "./projection";
import { reserveVoiceAiOperation } from "./operations";
import type { VoiceActor } from "./sessions";
import type { VoiceModelGatewayAdapter } from "./adapters/contract";

export type VoiceRolloutGateInput = Readonly<{
  environment?: string;
  voiceEnabled?: boolean;
  classificationEnabled?: boolean;
}>;

export function resolveVoiceRolloutGate(input: VoiceRolloutGateInput) {
  if (input.environment === "local" && input.voiceEnabled === true) {
    return Object.freeze({ allowed: true as const });
  }
  return Object.freeze({ allowed: false as const, reasonClass: "voice_disabled" as const });
}

export function checkVoiceSessionSpendHeadroom(input: {
  sessionCeilingMicros: bigint;
  holds: readonly Readonly<{
    status: string;
    amountMicros: bigint;
    settledMicros: bigint | null;
  }>[];
  requestedMicros: bigint;
}) {
  if (input.sessionCeilingMicros <= 0n || input.requestedMicros < 0n) {
    throw new Error("INVALID_VOICE_SPEND_BOUND");
  }
  const committedMicros = input.holds.reduce((sum, hold) => {
    if (hold.status === "held") return sum + hold.amountMicros;
    if (hold.status === "settled") return sum + (hold.settledMicros ?? hold.amountMicros);
    return sum;
  }, 0n);
  const remainingMicros = input.sessionCeilingMicros > committedMicros
    ? input.sessionCeilingMicros - committedMicros
    : 0n;
  return Object.freeze({
    allowed: committedMicros + input.requestedMicros <= input.sessionCeilingMicros,
    committedMicros,
    remainingMicros,
  });
}

type VoiceAdmissionSubject = Readonly<{
  segmentId: string;
  sessionId: string;
  ordinal: number;
  mediaFormat: string;
  mimeType: string;
  durationMs: number;
  byteCount: number;
  audioFingerprint: string;
  languageHint: string;
  segmentStatus: string;
  clientId: string;
  sessionStatus: string;
  consentVersion: string;
  consentedAt: Date;
  expiresAt: Date;
  maxTotalCostMicros: bigint;
}>;

export type AuthorizedVoiceGatewayAdmission = Readonly<{
  status: "authorized";
  actorId: string;
  claim: AiOperationClaim;
  request: VoiceGatewayOperationRequest;
  projection: VoiceSegmentProjection;
  policy: GatewayPolicySnapshot;
  route: GatewayRouteSnapshot;
  operation: GatewayOperationRow;
  decision: GatewayDecisionRow;
  attempt: GatewayAttemptRow;
}>;

export type VoiceGatewayAdmission =
  | AuthorizedVoiceGatewayAdmission
  | Readonly<{ status: "refused"; reasonClass: string }>
  | Readonly<{ status: "busy" }>;

async function loadVoiceAdmissionSubject(sessionId: string, segmentId: string): Promise<VoiceAdmissionSubject | null> {
  const [row] = await prisma.$queryRawUnsafe<VoiceAdmissionSubject[]>(
    `SELECT segment.id "segmentId",segment."sessionId",segment.ordinal,segment."mediaFormat"::text "mediaFormat",segment."mimeType",segment."durationMs",segment."byteCount",segment."audioFingerprint",segment."languageHint"::text "languageHint",segment.status::text "segmentStatus",session."clientId",session.status::text "sessionStatus",session."consentVersion",session."consentedAt",session."expiresAt",session."maxTotalCostMicros" FROM "VoiceIntakeSegment" segment JOIN "VoiceIntakeSession" session ON session.id=segment."sessionId" WHERE segment.id=$1 AND segment."sessionId"=$2`,
    segmentId,
    sessionId
  );
  return row ?? null;
}

async function closeVoiceBeforeDispatch(
  admission: AuthorizedVoiceGatewayAdmission,
  reasonClass: string
) {
  await releaseAccountSpendHold(admission.attempt.accountSpendHoldId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayAttempt" SET status='cancelled_before_dispatch',"dispatchState"='not_dispatched',"errorClass"=$2,"finishedAt"=now() WHERE id=$1 AND status='prepared'`,
      admission.attempt.id,
      reasonClass
    );
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayOperation" SET status='refused',"finishedAt"=now() WHERE id=$1 AND status='admitted'`,
      admission.operation.id
    );
    await tx.$executeRawUnsafe(
      `UPDATE "AiOperation" SET status='failed',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=now(),"lastError"=$3,"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
      admission.claim.operationId,
      admission.claim.lockedBy,
      reasonClass
    );
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.admission.refused",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.actorId,
      attemptId: admission.attempt.id,
      decisionId: admission.decision.id,
      spendHoldId: admission.attempt.accountSpendHoldId,
      billingProvider: admission.route.billingProvider,
      errorClass: reasonClass,
      dispatchState: "not_dispatched",
    });
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.spend.released",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.actorId,
      attemptId: admission.attempt.id,
      spendHoldId: admission.attempt.accountSpendHoldId,
      billingProvider: admission.route.billingProvider,
      amountMicros: 0n,
    });
  });
}

export async function admitGatewayVoiceSegment(input: {
  actor: VoiceActor;
  sessionId: string;
  segmentId: string;
  audioBytes: Uint8Array;
  policyId: string;
  dataClass: GatewayDataClass;
  privacyRequirement: GatewayPrivacyRequirement;
  maxSegmentCostMicros: bigint;
  now?: Date;
}): Promise<VoiceGatewayAdmission> {
  const now = input.now ?? new Date();
  const subject = await loadVoiceAdmissionSubject(input.sessionId, input.segmentId);
  if (!subject) return Object.freeze({ status: "refused", reasonClass: "voice_segment_missing" });
  if (input.actor.role !== "CLIENT" || input.actor.id !== subject.clientId) {
    return Object.freeze({ status: "refused", reasonClass: "voice_session_not_owned" });
  }
  if (!subject.consentVersion || Number.isNaN(subject.consentedAt.getTime())) {
    return Object.freeze({ status: "refused", reasonClass: "voice_consent_missing" });
  }
  if (subject.expiresAt.getTime() <= now.getTime()) {
    return Object.freeze({ status: "refused", reasonClass: "voice_session_expired" });
  }
  if (subject.sessionStatus !== "transcribing" || !["registered", "failed"].includes(subject.segmentStatus)) {
    return Object.freeze({ status: "refused", reasonClass: "voice_session_closed" });
  }
  if (input.maxSegmentCostMicros <= 0n || input.maxSegmentCostMicros > subject.maxTotalCostMicros) {
    return Object.freeze({ status: "refused", reasonClass: "voice_not_configured" });
  }
  const projection = buildVoiceSegmentProjection({
    sessionId: input.sessionId,
    segmentId: input.segmentId,
    ordinal: subject.ordinal,
    languageHint: subject.languageHint,
    mediaFormat: subject.mediaFormat,
    mimeType: subject.mimeType,
    durationMs: subject.durationMs,
    audioBytes: input.audioBytes,
  });
  if (projection.audioFingerprint !== subject.audioFingerprint ||
      projection.byteCount !== subject.byteCount) {
    return Object.freeze({ status: "refused", reasonClass: "voice_segment_conflict" });
  }
  const reserved = await reserveVoiceAiOperation({
    actor: input.actor,
    sessionId: input.sessionId,
    segmentId: input.segmentId,
    audioFingerprint: projection.audioFingerprint,
    now,
  });
  const policy = await loadGatewayPolicySnapshot(input.policyId);
  if (!policy || policy.maxAttempts !== 1 || policy.fallbackRules.length !== 0) {
    return Object.freeze({ status: "refused", reasonClass: "unpublished_policy" });
  }
  const request = buildVoiceGatewayRequest({
    logicalOperationKey: reserved.operationKey,
    tenantId: input.actor.id,
    policyKey: policy.policyKey,
    dataClass: input.dataClass,
    privacyRequirement: input.privacyRequirement,
    maxTotalCostMicros: input.maxSegmentCostMicros,
    projection,
    createdAt: now,
  });
  const routes = await loadGatewayRouteSnapshots();
  const resolution = resolveGatewayPolicy({ request, policy, routes, now });
  const claim = await claimAiOperation(reserved.operationKey);
  if (!claim || claim.operationId !== reserved.id) return Object.freeze({ status: "busy" });

  if (resolution.disposition === "refused") {
    await prisma.$transaction(async (tx) => {
      const operation = await bindGatewayOperation(tx, {
        aiOperationId: reserved.id,
        tenantId: input.actor.id,
        operationType: request.operationType,
        requestFingerprint: request.requestFingerprint,
        outputContractHash: request.outputContractHash,
        dataClass: request.dataClass,
        privacyRequirement: request.privacyRequirement,
        policyVersionId: policy.id,
        maxTotalCostMicros: request.maxTotalCostMicros,
      });
      await persistGatewayDecision(tx, {
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
      await tx.$executeRawUnsafe(
        `UPDATE "AiOperation" SET status='abandoned',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"finishedAt"=now(),"lastError"=$3,"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
        claim.operationId,
        claim.lockedBy,
        resolution.reasonClass
      );
    });
    return Object.freeze({ status: "refused", reasonClass: resolution.reasonClass });
  }
  const breaker = await loadGatewayBreakerResolution({ policy: resolution.policy, route: resolution.route });
  if (breaker.status === "open") {
    await prisma.$executeRawUnsafe(
      `UPDATE "AiOperation" SET status='failed',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=now(),"lastError"='open_breaker',"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
      claim.operationId,
      claim.lockedBy
    );
    return Object.freeze({ status: "refused", reasonClass: "open_breaker" });
  }
  const grant = await reserveAccountProviderSpend({
    provider: resolution.route.billingProvider,
    operationKey: reserved.operationKey,
    attempt: claim.attempt,
    worstCaseMicros: input.maxSegmentCostMicros,
    now,
  });
  if (!grant.ok) {
    await prisma.$executeRawUnsafe(
      `UPDATE "AiOperation" SET status='failed',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=now(),"lastError"='insufficient_spend_headroom',"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
      claim.operationId,
      claim.lockedBy
    );
    return Object.freeze({ status: "refused", reasonClass: "insufficient_spend_headroom" });
  }
  const sessionHeadroom = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `voice-session-spend:${input.sessionId}`);
    const [session] = await tx.$queryRawUnsafe<Array<{ maxTotalCostMicros: bigint }>>(
      `SELECT "maxTotalCostMicros" FROM "VoiceIntakeSession" WHERE id=$1 FOR UPDATE`,
      input.sessionId
    );
    const holds = await tx.$queryRawUnsafe<Array<{ status: string; amountMicros: bigint; settledMicros: bigint | null }>>(
      `SELECT hold.status,hold."amountMicros",hold."settledMicros" FROM "AccountProviderSpendHold" hold JOIN "AiOperation" operation ON operation."operationKey"=hold."operationKey" JOIN "VoiceIntakeSegment" segment ON segment.id=operation."voiceIntakeSegmentId" WHERE segment."sessionId"=$1`,
      input.sessionId
    );
    return session ? checkVoiceSessionSpendHeadroom({
      sessionCeilingMicros: session.maxTotalCostMicros,
      holds,
      requestedMicros: 0n,
    }) : { allowed: false, committedMicros: 0n, remainingMicros: 0n };
  });
  if (!sessionHeadroom.allowed) {
    await releaseAccountSpendHold(grant.holdId);
    await prisma.$executeRawUnsafe(
      `UPDATE "AiOperation" SET status='failed',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=now(),"lastError"='insufficient_spend_headroom',"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
      claim.operationId,
      claim.lockedBy
    );
    return Object.freeze({ status: "refused", reasonClass: "insufficient_spend_headroom" });
  }
  try {
    const durable = await prisma.$transaction(async (tx) => {
      const operation = await bindGatewayOperation(tx, {
        aiOperationId: reserved.id,
        tenantId: input.actor.id,
        operationType: request.operationType,
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
        remainingCostMicros: sessionHeadroom.remainingMicros,
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
      actorId: input.actor.id,
      claim,
      request,
      projection,
      policy,
      route: resolution.route,
      ...durable,
    });
  } catch (error) {
    await releaseAccountSpendHold(grant.holdId).catch(() => {});
    throw error;
  }
}

export async function dispatchVoiceGatewayAttempt(input: {
  admission: AuthorizedVoiceGatewayAdmission;
  actor: VoiceActor;
  adapter: VoiceModelGatewayAdapter;
  rollout?: VoiceRolloutGateInput;
  abortSignal: AbortSignal;
}) {
  const { admission } = input;
  const rollout = resolveVoiceRolloutGate(input.rollout ?? {});
  if (!rollout.allowed) {
    await closeVoiceBeforeDispatch(admission, rollout.reasonClass);
    return Object.freeze({ status: "refused" as const, reasonClass: rollout.reasonClass });
  }
  if (input.actor.role !== "CLIENT" || input.actor.id !== admission.actorId) {
    await closeVoiceBeforeDispatch(admission, "voice_session_not_owned");
    return Object.freeze({ status: "refused" as const, reasonClass: "voice_session_not_owned" as const });
  }
  const subject = await loadVoiceAdmissionSubject(
    admission.request.subject.sessionId,
    admission.request.subject.segmentId
  );
  if (!subject || subject.clientId !== admission.actorId || subject.sessionStatus !== "transcribing" ||
      subject.expiresAt.getTime() <= Date.now() || !subject.consentVersion ||
      subject.audioFingerprint !== admission.projection.audioFingerprint) {
    await closeVoiceBeforeDispatch(admission, "voice_session_closed");
    return Object.freeze({ status: "refused" as const, reasonClass: "voice_session_closed" as const });
  }
  const [policy, routes] = await Promise.all([
    loadGatewayPolicySnapshot(admission.policy.id),
    loadGatewayRouteSnapshots(),
  ]);
  const resolution = resolveGatewayPolicy({ request: admission.request, policy, routes });
  if (resolution.disposition !== "route_authorized" ||
      resolution.route.id !== admission.route.id ||
      resolution.route.canonicalHash !== admission.route.canonicalHash ||
      input.adapter.key !== admission.route.adapterKey) {
    await closeVoiceBeforeDispatch(admission, "ineligible_route");
    return Object.freeze({ status: "refused" as const, reasonClass: "ineligible_route" as const });
  }
  const breaker = await loadGatewayBreakerResolution({ policy: resolution.policy, route: resolution.route });
  if (breaker.status === "open" || breaker.generation !== admission.decision.breakerGeneration) {
    await closeVoiceBeforeDispatch(admission, "open_breaker");
    return Object.freeze({ status: "refused" as const, reasonClass: "open_breaker" as const });
  }
  const envelope = Object.freeze({
    operationId: admission.operation.id,
    attemptId: admission.attempt.id,
    tenantId: admission.actorId,
    sessionId: admission.request.subject.sessionId,
    segmentId: admission.request.subject.segmentId,
    adapterKey: admission.route.adapterKey as "voice-synthetic-direct" | "openrouter-stt-candidate",
    billingProvider: admission.route.billingProvider,
    intermediary: admission.route.intermediary,
    endpointKey: admission.route.endpointKey,
    modelKey: admission.route.modelKey,
    projection: admission.projection,
    outputContractHash: admission.request.outputContractHash as `sha256:${string}`,
    requestEvidenceRef: admission.attempt.requestEvidenceRef as `sha256:${string}`,
    abortSignal: input.abortSignal,
  });
  await prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayAttempt" SET status='dispatched',"dispatchState"='unaccounted',"dispatchedAt"=now() WHERE id=$1 AND status='prepared'`,
      admission.attempt.id
    );
    if (changed !== 1) throw new Error("VOICE_GATEWAY_ATTEMPT_NOT_PREPARED");
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayOperation" SET status='running' WHERE id=$1 AND status='admitted'`,
      admission.operation.id
    );
    await tx.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSegment" SET status='running',"updatedAt"=now() WHERE id=$1 AND status IN ('registered','failed')`,
      admission.request.subject.segmentId
    );
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.attempt.dispatched",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.actorId,
      attemptId: admission.attempt.id,
      decisionId: admission.decision.id,
      routeHash: admission.route.canonicalHash,
      dispatchState: "unaccounted",
      evidenceRef: admission.attempt.requestEvidenceRef as `sha256:${string}`,
    });
  });

  const result = await input.adapter.dispatch(envelope);
  if (result.dispatchKnowledge === "not_dispatched") {
    await releaseAccountSpendHold(admission.attempt.accountSpendHoldId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayAttempt" SET status='cancelled_before_dispatch',"dispatchState"='not_dispatched',"errorClass"=$2,"finishedAt"=now() WHERE id=$1`,
        admission.attempt.id,
        result.errorClass ?? "malformed_request"
      );
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayOperation" SET status='failed',"finishedAt"=now() WHERE id=$1`,
        admission.operation.id
      );
      await tx.$executeRawUnsafe(
        `UPDATE "VoiceIntakeSegment" SET status='failed',"updatedAt"=now() WHERE id=$1`,
        admission.request.subject.segmentId
      );
      await tx.$executeRawUnsafe(
        `UPDATE "AiOperation" SET status='failed',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"nextAttemptAt"=now(),"lastError"=$3,"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
        admission.claim.operationId,
        admission.claim.lockedBy,
        result.errorClass ?? "malformed_request"
      );
    });
    return Object.freeze({ status: "failed" as const, errorClass: result.errorClass ?? "malformed_request" });
  }
  if (result.dispatchKnowledge === "dispatched_unknown") {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayAttempt" SET status='uncertain',"dispatchState"='unaccounted',"errorClass"='unknown_dispatched_outcome',"providerRequestRef"=$2,"finishedAt"=now() WHERE id=$1`,
        admission.attempt.id,
        result.providerRequestRef
      );
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayOperation" SET status='uncertain',"finalAttemptId"=$2,"finishedAt"=now() WHERE id=$1`,
        admission.operation.id,
        admission.attempt.id
      );
      await tx.$executeRawUnsafe(
        `UPDATE "VoiceIntakeSegment" SET status='uncertain',"updatedAt"=now() WHERE id=$1`,
        admission.request.subject.segmentId
      );
      await tx.$executeRawUnsafe(
        `UPDATE "AiOperation" SET status='abandoned',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"finishedAt"=now(),"lastError"='unknown_dispatched_outcome',"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
        admission.claim.operationId,
        admission.claim.lockedBy
      );
      await appendGatewayAuditEvent(tx, {
        eventType: "model_gateway.attempt.uncertain",
        correlationId: `gateway:${admission.operation.id}`,
        gatewayOperationId: admission.operation.id,
        tenantId: admission.actorId,
        attemptId: admission.attempt.id,
        decisionId: admission.decision.id,
        spendHoldId: admission.attempt.accountSpendHoldId,
        billingProvider: admission.route.billingProvider,
        errorClass: "unknown_dispatched_outcome",
        dispatchState: "unaccounted",
      });
    });
    return Object.freeze({ status: "uncertain" as const, errorClass: "unknown_dispatched_outcome" as const });
  }
  if (result.errorClass !== null || result.transcriptText === null || result.usage === null) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "ModelGatewayAttempt" SET status='failed',"dispatchState"='settled',"errorClass"=$2,"httpStatus"=$3,"providerRequestRef"=$4,"responseEvidenceRef"=$5,"finishedAt"=now() WHERE id=$1`,
        admission.attempt.id,
        result.errorClass ?? "malformed_request",
        result.httpStatus,
        result.providerRequestRef,
        result.responseEvidenceRef
      );
      await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='failed',"finishedAt"=now() WHERE id=$1`, admission.operation.id);
      await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSegment" SET status='failed',"updatedAt"=now() WHERE id=$1`, admission.request.subject.segmentId);
      await tx.$executeRawUnsafe(
        `UPDATE "AiOperation" SET status='abandoned',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"finishedAt"=now(),"lastError"=$3,"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
        admission.claim.operationId,
        admission.claim.lockedBy,
        result.errorClass ?? "malformed_request"
      );
    });
    return Object.freeze({ status: "failed" as const, errorClass: result.errorClass ?? "malformed_request" });
  }
  const transcriptText = result.transcriptText;
  const usage = result.usage;
  const textFingerprint = canonicalFingerprint(transcriptText);
  const transcriptId = `vts_${randomUUID().replaceAll("-", "")}`;
  await prisma.$transaction(async (tx) => {
    const fenced = await tx.$executeRawUnsafe(
      `UPDATE "AiOperation" SET status='succeeded',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"resultKind"='VoiceTranscriptSegment',"resultId"=$3,"finishedAt"=now(),"updatedAt"=now() WHERE id=$1 AND "lockedBy"=$2`,
      admission.claim.operationId,
      admission.claim.lockedBy,
      transcriptId
    );
    if (fenced !== 1) throw new Error("VOICE_AI_OPERATION_FENCE_LOST");
    if (usage.measuredCostMicros !== null) {
      await settleAccountSpendHold(tx, admission.attempt.accountSpendHoldId, usage.measuredCostMicros);
    }
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayAttempt" SET status='settled',"dispatchState"='settled',"errorClass"=NULL,"httpStatus"=$2,"providerRequestRef"=$3,"resultContractStatus"='valid',"responseEvidenceRef"=$4,"finishedAt"=now() WHERE id=$1`,
      admission.attempt.id,
      result.httpStatus,
      result.providerRequestRef,
      result.responseEvidenceRef
    );
    await tx.$executeRawUnsafe(
      `UPDATE "ModelGatewayOperation" SET status='succeeded',"finalAttemptId"=$2,"resultEvidenceRef"=$3,"finishedAt"=now() WHERE id=$1`,
      admission.operation.id,
      admission.attempt.id,
      result.responseEvidenceRef
    );
    await tx.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSegment" SET status='succeeded',"updatedAt"=now() WHERE id=$1`,
      admission.request.subject.segmentId
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "VoiceTranscriptSegment" (id,"segmentId","gatewayAttemptId",text,"textFingerprint","characterCount","reportedAudioSeconds","measuredCostMicros","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
      transcriptId,
      admission.request.subject.segmentId,
      admission.attempt.id,
      transcriptText,
      textFingerprint,
      transcriptText.length,
      usage.audioSeconds,
      usage.measuredCostMicros,
      subject.expiresAt
    );
    await appendGatewayAuditEvent(tx, {
      eventType: "model_gateway.attempt.settled",
      correlationId: `gateway:${admission.operation.id}`,
      gatewayOperationId: admission.operation.id,
      tenantId: admission.actorId,
      attemptId: admission.attempt.id,
      decisionId: admission.decision.id,
      spendHoldId: admission.attempt.accountSpendHoldId,
      billingProvider: admission.route.billingProvider,
      amountMicros: usage.measuredCostMicros,
      dispatchState: "settled",
      resultContractStatus: "valid",
      evidenceRef: result.responseEvidenceRef,
    });
  });
  return Object.freeze({
    status: "succeeded" as const,
    segmentId: admission.request.subject.segmentId,
    ordinal: admission.projection.ordinal,
    text: transcriptText,
    textFingerprint,
  });
}
