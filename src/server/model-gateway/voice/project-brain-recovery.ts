import "server-only";
import { prisma } from "@/lib/db";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import { fingerprintVoiceGatewayProjection, projectBrainVoiceGatewaySubjectSchema } from "../privacy";
import { voiceOperationKey } from "./operations";
import type { VoiceSegmentProjection } from "./projection";

type Candidate = { aiId: string; sessionId: string; lockedBy: string; leaseExpiresAt: Date };
type Lineage = Candidate & Omit<VoiceSegmentProjection, "audioBytes" | "operationType"> & {
  actorUserId: string; workspaceId: string; projectId: string; intakeId: string; sourceId: string;
  sourceBindingHash: string; segmentManifestHash: string; operationKey: string;
  gatewayId: string; tenantId: string; requestFingerprint: string; outputContractHash: string;
  decisionId: string; policyHash: string; routeHash: string; attemptId: string;
  holdId: string; amountMicros: bigint; periodKey: string; sessionStatus: string;
  attemptStatus: "prepared" | "dispatched"; dispatchState: "not_dispatched" | "unaccounted";
  segmentStatus: string; requestEvidenceRef: string; lockedAt: Date | null;
};
const utc = "(clock_timestamp() AT TIME ZONE 'UTC')";
const labels = Object.freeze({ executionAuthorized: false as const, automaticRetry: false as const,
  budgetReservationReleased: false as const, transportPerformedByRecovery: false as const });

/** Metadata-only historical binding, NOT current consent or permission. A revoked
 * owner/source may still need bookkeeping, so no current-authority reader is used. */
function matches(row: Lineage) {
  const subject = projectBrainVoiceGatewaySubjectSchema.safeParse({ kind: "project_brain_voice_segment",
    actorUserId: row.actorUserId, workspaceId: row.workspaceId, projectId: row.projectId, intakeId: row.intakeId,
    sourceId: row.sourceId, sessionId: row.sessionId, segmentId: row.segmentId,
    sourceBindingHash: row.sourceBindingHash, segmentManifestHash: row.segmentManifestHash });
  if (!subject.success || row.tenantId !== `construction-workspace:${row.workspaceId}` || row.amountMicros <= 0n) return false;
  if (!["transcribing", "cancelled", "failed", "uncertain", "incomplete", "purged"].includes(row.sessionStatus)) return false;
  if (row.operationKey !== voiceOperationKey(row)
    || fingerprintVoiceGatewayProjection({ ...row, operationType: "intake_voice_transcription" }, subject.data) !== row.requestFingerprint) return false;
  if (row.requestEvidenceRef !== canonicalFingerprint({ operationType: "intake_voice_transcription",
    requestFingerprint: row.requestFingerprint, outputContractHash: row.outputContractHash, routeHash: row.routeHash })) return false;
  return row.attemptStatus === "prepared" && row.dispatchState === "not_dispatched" && row.segmentStatus === "registered"
    || row.attemptStatus === "dispatched" && row.dispatchState === "unaccounted" && row.segmentStatus === "running";
}

/** OFF local controller bookkeeping for the existing PB gateway, never dispatch.
 * Keeps expired nonce/lease as forensic provenance after status becomes abandoned.
 * A committed dispatch marker means MAY_HAVE_STARTED, not proof of invocation. */
export async function recoverExpiredProjectBrainVoiceAttempts(input: Readonly<{
  enabled?: boolean; environment?: "local"; batchSize?: number; deadlineAt?: number; abortSignal?: AbortSignal;
}> = {}) {
  if (input.enabled !== true || input.environment !== "local" || process.env.NODE_ENV === "production") {
    return Object.freeze({ ...labels, status: "DISABLED" as const, recovered: 0, cancelledBeforeDispatch: 0, uncertain: 0, skipped: 0 });
  }
  const batchSize = input.batchSize ?? 10, signal = input.abortSignal;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error("VOICE_PB_RECOVERY_BATCH_INVALID");
  if (input.deadlineAt !== undefined && !Number.isFinite(input.deadlineAt)) throw new Error("VOICE_PB_RECOVERY_DEADLINE_INVALID");
  const deadlineAt = Math.min(input.deadlineAt ?? Infinity, Date.now() + 2500);
  function remaining() {
    const value = Math.floor(deadlineAt - Date.now());
    if (value < 2 || signal?.aborted) throw new Error("VOICE_PB_RECOVERY_DEADLINE_EXCEEDED");
    return value;
  }
  const budget = remaining(), maxWait = Math.min(250, Math.max(1, Math.floor(budget / 4)));
  return prisma.$transaction(async tx => {
    const statementBudget = Math.min(2000, remaining() - 1);
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",
      String(statementBudget), String(Math.min(250, statementBudget)));
    remaining();
    // Candidates are not ownership. Never lock AI first then wait on the session
    // advisory: admission/dispatch take that advisory before mutable row locks.
    const candidates = await tx.$queryRawUnsafe<Candidate[]>(`
      SELECT ai.id "aiId",v.id "sessionId",ai."lockedBy",ai."leaseExpiresAt"
      FROM "AiOperation" ai JOIN "VoiceIntakeSegment" s ON s.id=ai."voiceIntakeSegmentId"
      JOIN "VoiceIntakeSession" v ON v.id=s."sessionId"
      WHERE v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL
        AND ai.purpose='intake_voice_transcription' AND ai."taskId" IS NULL AND ai."personalAssistantOperationId" IS NULL
        AND ai.status='running' AND ai.attempts=1 AND ai."lockedBy" IS NOT NULL
        AND ai."leaseExpiresAt" IS NOT NULL AND ai."leaseExpiresAt"<=${utc}
      ORDER BY ai."leaseExpiresAt",ai.id LIMIT $1`, batchSize);
    let cancelledBeforeDispatch = 0, uncertain = 0, skipped = 0;
    for (const candidate of candidates) {
      remaining();
      const [lock] = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
        "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired", `voice-session-spend:${candidate.sessionId}`);
      remaining();
      if (lock?.acquired !== true) { skipped++; continue; }
      const rows = await tx.$queryRawUnsafe<Lineage[]>(`
        SELECT ai.id "aiId",ai."lockedBy",ai."lockedAt",ai."leaseExpiresAt",ai."operationKey",
          v.id "sessionId",v.status::text "sessionStatus",v."requestedByUserId" "actorUserId",v."workspaceId",v."projectId",v."intakeId",
          v."projectBrainSourceId" "sourceId",v."sourceBindingHash",v."segmentManifestHash",
          s.id "segmentId",s.status::text "segmentStatus",s.ordinal,s."languageHint"::text,s."mediaFormat"::text,s."mimeType",s."durationMs",s."byteCount",s."audioFingerprint",
          o.id "gatewayId",o."tenantId",o."requestFingerprint",o."outputContractHash",o."maxTotalCostMicros" "amountMicros",
          d.id "decisionId",d."policyHash",d."routeHash",t.id "attemptId",t.status "attemptStatus",t."dispatchState",t."requestEvidenceRef",
          h.id "holdId",h."periodKey"
        FROM "AiOperation" ai JOIN "VoiceIntakeSegment" s ON s.id=ai."voiceIntakeSegmentId"
        JOIN "VoiceIntakeSession" v ON v.id=s."sessionId"
        JOIN "ConstructionProjectBrainSource" src ON src.id=v."projectBrainSourceId" AND src."workspaceId"=v."workspaceId"
          AND src."projectId"=v."projectId" AND src."intakeId"=v."intakeId" AND src."createdByUserId"=v."requestedByUserId" AND src.kind='VOICE_NOTE'
        JOIN "ModelGatewayOperation" o ON o."aiOperationId"=ai.id
        JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=o.id AND d.attempt=1 AND d.disposition='route_authorized'
        JOIN "ModelGatewayRouteProfile" r ON r.id=d."routeProfileId" AND r."canonicalHash"=d."routeHash"
        JOIN "ModelGatewayPolicyVersion" p ON p.id=o."policyVersionId" AND p."canonicalHash"=d."policyHash"
        JOIN "ModelGatewayAttempt" t ON t."decisionId"=d.id
        JOIN "AccountProviderSpendHold" h ON h.id=t."accountSpendHoldId" AND h."operationKey"=ai."operationKey" AND h.attempt=1
        WHERE ai.id=$1 AND ai."lockedBy"=$2 AND ai."leaseExpiresAt"=($3::timestamptz AT TIME ZONE 'UTC') AND v.id=$4
          AND ai.status='running' AND ai.attempts=1 AND ai."leaseExpiresAt"<=${utc}
          AND ai.purpose='intake_voice_transcription' AND ai."taskId" IS NULL AND ai."personalAssistantOperationId" IS NULL
          AND ai."resultKind" IS NULL AND ai."resultId" IS NULL AND ai."finishedAt" IS NULL
          AND v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL
          AND v.status IN ('transcribing','cancelled','failed','uncertain','incomplete','purged')
          AND v."sourceBindingHash"=encode(sha256(convert_to(voice_pb_canonical_json(v."sourceBinding"),'UTF8')),'hex')
          AND v."segmentManifestHash"=encode(sha256(convert_to(voice_pb_canonical_json(v."segmentManifest"),'UTF8')),'hex')
          AND v."sourceBinding"#>>'{subject,actorUserId}'=v."requestedByUserId"
          AND v."sourceBinding"#>>'{subject,sourceId}'=src.id
          AND v."sourceBinding"#>>'{subject,sourceContentHash}'=src."contentHash"
          AND v."segmentManifest"#>>'{transformer,mode}'='SYNTHETIC_LOCAL'
          AND o."operationType"='intake_voice_transcription' AND o.status='admitted'
          AND o."finalAttemptId" IS NULL AND o."resultEvidenceRef" IS NULL AND o."finishedAt" IS NULL
          AND r."adapterKey"='voice-synthetic-direct' AND r."billingProvider"='synthetic' AND r.intermediary IS NULL
          AND h.provider='synthetic' AND h.status='held' AND h."settledMicros" IS NULL AND h."amountMicros"=o."maxTotalCostMicros"
          AND t."responseEvidenceRef" IS NULL AND t."aiUsageId" IS NULL AND t."providerRequestRef" IS NULL
          AND t."resultContractStatus"='not_evaluated' AND t."errorClass" IS NULL AND t."finishedAt" IS NULL
          AND ((t.status='prepared' AND t."dispatchState"='not_dispatched' AND t."dispatchedAt" IS NULL AND s.status='registered')
            OR (t.status='dispatched' AND t."dispatchState"='unaccounted' AND t."dispatchedAt" IS NOT NULL AND s.status='running'))
          AND NOT EXISTS (SELECT 1 FROM "VoiceTranscriptSegment" x WHERE x."segmentId"=s.id OR x."gatewayAttemptId"=t.id)
          AND NOT EXISTS (SELECT 1 FROM "AiUsage" u WHERE u."operationId"=ai.id)
        FOR UPDATE OF ai,v,s,o,t SKIP LOCKED FOR SHARE OF src,d,r,p`,
      candidate.aiId, candidate.lockedBy, candidate.leaseExpiresAt, candidate.sessionId);
      remaining();
      if (rows.length !== 1 || !matches(rows[0])) { skipped++; continue; }
      const row = rows[0];
      // No provider/day advisory follows this read lock, and no hold mutation is
      // performed. Keep the full held amount stable through bookkeeping commit.
      const held = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "AccountProviderSpendHold"
        WHERE id=$1 AND provider='synthetic' AND "operationKey"=$2 AND attempt=1 AND status='held'
          AND "settledMicros" IS NULL AND "amountMicros"=$3 AND "periodKey"=$4 FOR SHARE`,
      row.holdId, row.operationKey, row.amountMicros, row.periodKey);
      remaining();
      if (held.length !== 1) { skipped++; continue; }
      const knownNotDispatched = row.attemptStatus === "prepared";
      const reason = knownNotDispatched ? "voice_session_expired" : "unknown_dispatched_outcome";
      const evidence = canonicalFingerprint({ schemaVersion: 1, kind: "PB_EXPIRED_VOICE_CLAIM", aiId: row.aiId,
        lockedBy: row.lockedBy, lockedAt: row.lockedAt, leaseExpiresAt: row.leaseExpiresAt,
        gatewayId: row.gatewayId, attemptId: row.attemptId, requestFingerprint: row.requestFingerprint,
        sourceBindingHash: row.sourceBindingHash, segmentManifestHash: row.segmentManifestHash,
        holdId: row.holdId, amountMicros: row.amountMicros, priorDispatchState: row.dispatchState,
        invocationKnowledge: knownNotDispatched ? "NOT_STARTED" : "OUTCOME_NOT_OBSERVED_AFTER_LEASE_EXPIRY", ...labels });
      const updates = [
        await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='abandoned',"finishedAt"=${utc},"updatedAt"=${utc}
          WHERE id=$1 AND "lockedBy"=$2 AND "leaseExpiresAt"=($3::timestamptz AT TIME ZONE 'UTC') AND "leaseExpiresAt"<=${utc}
            AND status='running' AND attempts=1 AND "voiceIntakeSegmentId"=$4 AND "operationKey"=$5
            AND "resultKind" IS NULL AND "resultId" IS NULL`, row.aiId, row.lockedBy, row.leaseExpiresAt, row.segmentId, row.operationKey),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status=$2,"errorClass"=$3,"responseEvidenceRef"=$4,"finishedAt"=${utc}
          WHERE id=$1 AND "decisionId"=$5 AND "accountSpendHoldId"=$6 AND status=$7 AND "dispatchState"=$8
            AND "responseEvidenceRef" IS NULL AND "resultContractStatus"='not_evaluated'`, row.attemptId,
        knownNotDispatched ? "cancelled_before_dispatch" : "uncertain", reason, evidence, row.decisionId, row.holdId, row.attemptStatus, row.dispatchState),
        await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status=$2,"finalAttemptId"=$3,"resultEvidenceRef"=$4,"finishedAt"=${utc}
          WHERE id=$1 AND "aiOperationId"=$5 AND status='admitted' AND "requestFingerprint"=$6 AND "finalAttemptId" IS NULL AND "resultEvidenceRef" IS NULL`,
        row.gatewayId, knownNotDispatched ? "refused" : "uncertain", row.attemptId, evidence, row.aiId, row.requestFingerprint),
        await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSegment" SET status=$2::"VoiceIntakeSegmentStatus","updatedAt"=${utc}
          WHERE id=$1 AND "sessionId"=$3 AND status=$4::"VoiceIntakeSegmentStatus" AND "audioFingerprint"=$5`,
        row.segmentId, knownNotDispatched ? "failed" : "uncertain", row.sessionId, row.segmentStatus, row.audioFingerprint),
      ];
      if (updates.some(count => count !== 1)) throw new Error("VOICE_PB_RECOVERY_FENCE_LOST");
      if (row.sessionStatus === "transcribing") {
        const changed = await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSession" SET status=$2::"VoiceIntakeSessionStatus","updatedAt"=${utc}
          WHERE id=$1 AND status='transcribing' AND "subjectKind"='project_brain_voice' AND "requestedByUserId"=$3
            AND "workspaceId"=$4 AND "sourceBindingHash"=$5 AND "segmentManifestHash"=$6`,
        row.sessionId, knownNotDispatched ? "incomplete" : "uncertain", row.actorUserId, row.workspaceId, row.sourceBindingHash, row.segmentManifestHash);
        if (changed !== 1) throw new Error("VOICE_PB_RECOVERY_FENCE_LOST");
      }
      await appendGatewayAuditEvent(tx, { eventType: knownNotDispatched ? "model_gateway.admission.refused" : "model_gateway.attempt.uncertain",
        correlationId: `gateway:${row.gatewayId}`, gatewayOperationId: row.gatewayId, tenantId: row.tenantId,
        attemptId: row.attemptId, decisionId: row.decisionId, policyHash: row.policyHash, routeHash: row.routeHash,
        spendHoldId: row.holdId, billingProvider: "synthetic", errorClass: reason,
        dispatchState: row.dispatchState, resultContractStatus: "not_evaluated", evidenceRef: evidence });
      remaining();
      if (knownNotDispatched) cancelledBeforeDispatch++; else uncertain++;
    }
    remaining();
    return Object.freeze({ ...labels, status: "EXPIRED_PB_VOICE_CLAIMS_RECORDED" as const,
      recovered: cancelledBeforeDispatch + uncertain, cancelledBeforeDispatch, uncertain, skipped });
  }, { isolationLevel: "Serializable", maxWait, timeout: Math.min(2000, budget - maxWait) });
}
