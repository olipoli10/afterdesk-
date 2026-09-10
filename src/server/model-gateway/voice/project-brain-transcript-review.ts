import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "../evidence";
import { fingerprintVoiceGatewayProjection, voiceTranscriptOutputContractFingerprint } from "../privacy";
import { assembleVoiceTranscriptDraft } from "./assembly";
import { inspectProjectBrainVoiceSessionInTransaction } from "./project-brain-sessions";
import { voiceOperationKey } from "./operations";
import { VOICE_LIMITS } from "./types";

const id = z.string().min(1).max(200);
const fingerprint = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const requestSchema = z.object({ actorUserId: id, workspaceId: id, sessionId: id }).strict();
const resultRowSchema = z.object({
  transcriptId: id, segmentId: id, sessionId: id, ordinal: z.number().int().min(0).max(13),
  text: z.string().min(1).max(VOICE_LIMITS.maxTranscriptCharsPerSegment), textFingerprint: fingerprint,
  characterCount: z.number().int().positive(), reportedAudioSeconds: z.number().positive().finite(),
  measuredCostMicros: z.bigint(), expiresAt: z.date(), purgedAt: z.null(),
  aiId: id, operationKey: z.string().min(1).max(1000), gatewayId: id, tenantId: z.string().min(1).max(400),
  requestFingerprint: fingerprint, outputContractHash: fingerprint, decisionId: id, routeHash: fingerprint,
  attemptId: id, requestEvidenceRef: fingerprint, responseEvidenceRef: fingerprint, holdId: id,
  amountMicros: z.bigint(), settledMicros: z.bigint(), resultEvidenceRef: fingerprint,
}).strict();
const labels = Object.freeze({
  executionAuthorized: false as const, externalTransportPerformed: false as const, automaticConfirmationPerformed: false as const,
  contentIntegrityVerified: true as const, semanticAccuracyVerified: false as const, transcriptionQualityVerified: false as const,
  syntheticReviewAvailable: true as const, realTranscriptionAvailable: false as const, projectFactConfirmed: false as const,
  processingMode: "SYNTHETIC_LOCAL" as const, mediaDecodingVerified: false as const,
});
function refuse(): never { throw new Error("VOICE_PB_TRANSCRIPT_REVIEW_REFUSED"); }

/** OFF by default. The authenticated server caller supplies actor/context. This
 * is protected local synthetic content, not speech recognition or action authority.
 * No route, source mutation, storage read, budget reservation or retry is performed. */
export async function readProjectBrainVoiceTranscriptReview(
  input: { actorUserId: string; workspaceId: string; sessionId: string }, options: { enabled?: boolean } = {},
) {
  if (options.enabled !== true) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const request = Object.freeze(requestSchema.parse(input));
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout','2000',true),set_config('lock_timeout','250',true)");
    // Shared form of the existing session namespace, acquired before session/row
    // locks. Writers use its exclusive form. No provider/day locks or upgrades.
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock_shared(hashtext($1))::text", `voice-session-spend:${request.sessionId}`);
    const inspected = await inspectProjectBrainVoiceSessionInTransaction(tx, request);
    const session = inspected.projection;
    if (session.sessionStatus !== "transcribing" || session.segments.some(segment => segment.status !== "succeeded")) refuse();
    const rows = await tx.$queryRawUnsafe<unknown[]>(`
      SELECT x.id "transcriptId",s.id "segmentId",v.id "sessionId",s.ordinal,x.text,x."textFingerprint",
        x."characterCount",x."reportedAudioSeconds"::double precision AS "reportedAudioSeconds",x."measuredCostMicros",x."expiresAt",x."purgedAt",
        ai.id "aiId",ai."operationKey",o.id "gatewayId",o."tenantId",o."requestFingerprint",o."outputContractHash",
        d.id "decisionId",d."routeHash",t.id "attemptId",t."requestEvidenceRef",t."responseEvidenceRef",
        h.id "holdId",h."amountMicros",h."settledMicros",o."resultEvidenceRef"
      FROM "VoiceIntakeSession" v JOIN "VoiceIntakeSegment" s ON s."sessionId"=v.id
      JOIN "AiOperation" ai ON ai."voiceIntakeSegmentId"=s.id
      JOIN "ModelGatewayOperation" o ON o."aiOperationId"=ai.id
      JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=o.id AND d.attempt=1 AND d.disposition='route_authorized'
      JOIN "ModelGatewayPolicyVersion" p ON p.id=o."policyVersionId" AND p."canonicalHash"=d."policyHash"
      JOIN "ModelGatewayRouteProfile" r ON r.id=d."routeProfileId" AND r."canonicalHash"=d."routeHash"
      JOIN "ModelGatewayAttempt" t ON t."decisionId"=d.id AND t.id=o."finalAttemptId"
      JOIN "VoiceTranscriptSegment" x ON x."segmentId"=s.id AND x."gatewayAttemptId"=t.id AND x.id=ai."resultId"
      JOIN "AccountProviderSpendHold" h ON h.id=t."accountSpendHoldId" AND h."operationKey"=ai."operationKey" AND h.attempt=1
      WHERE v.id=$1 AND v."requestedByUserId"=$2 AND v."workspaceId"=$3
        AND v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL AND v.status='transcribing'
        AND v."sourceBindingHash"=$4 AND v."segmentManifestHash"=$5 AND s.status='succeeded'
        AND ai.purpose='intake_voice_transcription' AND ai."taskId" IS NULL AND ai."personalAssistantOperationId" IS NULL
        AND ai.status='succeeded' AND ai.attempts=1 AND ai."resultKind"='VoiceTranscriptSegment'
        AND ai."lockedBy" IS NULL AND ai."leaseExpiresAt" IS NULL AND ai."finishedAt" IS NOT NULL
        AND o."operationType"='intake_voice_transcription' AND o.status='succeeded' AND o."finishedAt" IS NOT NULL
        AND t.status='settled' AND t."dispatchState"='settled' AND t."resultContractStatus"='valid'
        AND t."finishedAt" IS NOT NULL AND t."dispatchedAt" IS NOT NULL AND t."errorClass" IS NULL
        AND t."aiUsageId" IS NULL AND t."providerRequestRef" IS NULL
        AND r."adapterKey"='voice-synthetic-direct' AND r."billingProvider"='synthetic' AND r.intermediary IS NULL
        AND h.provider='synthetic' AND h.status='settled' AND h."settledMicros"=0 AND h."amountMicros"=o."maxTotalCostMicros"
        AND x."purgedAt" IS NULL AND x."measuredCostMicros"=0
        AND x."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')
        AND NOT EXISTS (SELECT 1 FROM "AiUsage" u WHERE u."operationId"=ai.id)
      ORDER BY s.ordinal LIMIT 15 FOR SHARE OF v,s,ai,o,d,p,r,t,x,h`,
    request.sessionId, request.actorUserId, request.workspaceId, session.sourceBindingHash, session.segmentManifestHash);
    if (rows.length !== session.segments.length) refuse();
    const accepted = rows.map((raw, ordinal) => {
      const parsed = resultRowSchema.safeParse(raw);
      if (!parsed.success) refuse();
      const row = parsed.data, segment = session.segments[ordinal], metadata = inspected.manifest.segments[ordinal];
      if (!segment || !metadata || row.sessionId !== session.sessionId || row.segmentId !== segment.segmentId || row.ordinal !== ordinal
        || row.tenantId !== `construction-workspace:${request.workspaceId}` || row.amountMicros <= 0n
        || row.amountMicros > BigInt(session.sessionCostBoundMicros) || row.settledMicros !== 0n || row.measuredCostMicros !== 0n
        || row.characterCount !== row.text.length || row.reportedAudioSeconds !== segment.durationMs / 1000
        || row.expiresAt.getTime() !== new Date(session.expiresAt).getTime()
        || row.outputContractHash !== voiceTranscriptOutputContractFingerprint()) refuse();
      const projection = { operationType: "intake_voice_transcription" as const, sessionId: session.sessionId, segmentId: segment.segmentId,
        ordinal, languageHint: session.languageHint, mediaFormat: metadata.mediaFormat, mimeType: metadata.mimeType,
        durationMs: segment.durationMs, byteCount: segment.byteCount, audioFingerprint: segment.audioFingerprint as `sha256:${string}` };
      const subject = { kind: "project_brain_voice_segment" as const, actorUserId: request.actorUserId, workspaceId: request.workspaceId,
        projectId: session.projectId, intakeId: session.intakeId, sourceId: session.sourceId, sessionId: session.sessionId,
        segmentId: segment.segmentId, sourceBindingHash: session.sourceBindingHash, segmentManifestHash: session.segmentManifestHash };
      // Reconstruct producer fingerprints, not a newly invented result contract.
      if (row.operationKey !== voiceOperationKey(projection) || row.requestFingerprint !== fingerprintVoiceGatewayProjection(projection, subject)
        || row.requestEvidenceRef !== canonicalFingerprint({ operationType: projection.operationType, requestFingerprint: row.requestFingerprint,
          outputContractHash: row.outputContractHash, routeHash: row.routeHash })
        || row.textFingerprint !== canonicalFingerprint(row.text)
        || row.responseEvidenceRef !== canonicalFingerprint({ mode: "SYNTHETIC_LOCAL", audioFingerprint: segment.audioFingerprint, text: row.text, costMicros: "0" })
        || row.resultEvidenceRef !== row.responseEvidenceRef
        || row.text !== `SYNTHETIC_LOCAL — no speech was transcribed. Segment ${ordinal}: ${segment.audioFingerprint}.`) refuse();
      return Object.freeze({ row, segment });
    });
    for (const key of ["transcriptId", "aiId", "gatewayId", "decisionId", "attemptId", "holdId"] as const) {
      if (new Set(accepted.map(value => value.row[key])).size !== accepted.length) refuse();
    }
    const draft = assembleVoiceTranscriptDraft({ sessionId: session.sessionId, sessionStatus: session.sessionStatus,
      expectedSegmentCount: session.segments.length, segments: accepted.map(({ row, segment }) => ({ ordinal: segment.ordinal,
        status: segment.status, audioFingerprint: segment.audioFingerprint, text: row.text, textFingerprint: row.textFingerprint, purgedAt: null })) });
    const orderedEvidence = Object.freeze(accepted.map(({ row, segment }) => Object.freeze({
      ordinal: segment.ordinal, segmentId: row.segmentId, transcriptId: row.transcriptId, gatewayOperationId: row.gatewayId,
      gatewayAttemptId: row.attemptId, audioFingerprint: segment.audioFingerprint, textFingerprint: row.textFingerprint,
      responseEvidenceRef: row.responseEvidenceRef,
    })));
    const core = Object.freeze({ schemaVersion: 1 as const, assemblyVersion: "VOICE_TRANSCRIPT_JOIN_V1" as const,
      sessionId: session.sessionId, workspaceId: session.workspaceId, projectId: session.projectId, intakeId: session.intakeId,
      intakeStateVersion: inspected.subject.intakeStateVersion, sourceId: session.sourceId, sourceContentHash: inspected.subject.sourceContentHash,
      sourceBindingHash: session.sourceBindingHash, segmentManifestHash: session.segmentManifestHash,
      expiresAt: session.expiresAt, orderedEvidence, assemblyFingerprint: draft.assemblyFingerprint,
      textFingerprint: canonicalFingerprint(draft.text), ...labels });
    const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
    if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime())
      || clock.now.getTime() < new Date(inspected.databaseNow).getTime()
      || clock.now.getTime() >= new Date(core.expiresAt).getTime()) refuse();
    return Object.freeze({ status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED" as const, ...core,
      text: draft.text, reviewFingerprint: canonicalFingerprint(core) });
  }, { isolationLevel: "Serializable", timeout: 5000, maxWait: 2000 });
}
