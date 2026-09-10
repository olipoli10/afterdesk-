import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { createConstructionProject, initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { admitProjectBrainSource, processProjectBrainIntakeCommand } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { createProjectBrainVoiceSession } from "@/server/model-gateway/voice/project-brain-sessions";
import { admitGatewayVoiceSegment } from "@/server/model-gateway/voice/dispatch";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";
import type { PreparedProjectBrainVoiceAdmission } from "@/server/model-gateway/voice/project-brain-admission";

// Exact existing synthetic AAC/M4A asset from the independently owned gateway
// fixture. No user recording; storage alone is supplied by the test's byte map.
// No tests/hooks/mocks register on import. No database access until a helper call.
const audio = Buffer.from("AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAs5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAgAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACHXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAgAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAIAAAAQAAAEAAAAAAZVtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAB9AAAAIAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFAbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEEc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAB9AAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAD6AAAAA+gWAgIAFFYhW5QAGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAAAgAABAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAIAAAABAAAAFHN0c3oAAAAAAAAABAAAAAIAAAAUc3RjbwAAAAAAAAABAAAC+gAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAAACAAAAAQAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAAABBtZGF0ARggBwEYIAc=", "base64");

export async function projectBrainRecoveryFixture(storage: ReadonlyMap<string, Buffer>) {
  requirePersonalDisposableDatabase();
  const user = await prisma.user.create({ data: { email: `voice-recovery-${randomUUID()}@example.invalid`, name: "Synthetic PB recovery owner", emailVerified: true, role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic PB recovery" });
  const project = await createConstructionProject({ userId: user.id, workspaceId, code: `PB-${randomUUID()}`, name: "Synthetic chantier" });
  const intake = await processProjectBrainIntakeCommand({ userId: user.id, command: {
    schemaVersion: 1, action: "CREATE_PROJECT_BRAIN_INTAKE", commandId: randomUUID(), workspaceId, projectId: project.id,
  } });
  const admittedSource = await admitProjectBrainSource({ userId: user.id, bytes: audio, command: {
    schemaVersion: 1, action: "ADMIT_PROJECT_BRAIN_SOURCE", commandId: randomUUID(), workspaceId, projectId: project.id,
    intakeId: intake.intakeId, expectedStateVersion: intake.stateVersion, kind: "VOICE_NOTE", fileName: "synthetic.m4a", mimeType: "audio/m4a", sizeBytes: audio.length, durationMs: 256,
  } });
  const source = await prisma.constructionProjectBrainSource.findFirstOrThrow({ where: { intakeId: intake.intakeId }, include: { file: true } });
  const stored = storage.get(source.file.storageKey);
  if (!stored) throw new Error("SYNTHETIC_OBJECT_MISSING");
  const sourceBytes = Buffer.from(stored), now = Date.now();
  const sourceInput = {
    source: { actorUserId: user.id, workspaceId, projectId: project.id, intakeId: intake.intakeId, sourceId: source.id, expectedIntakeStateVersion: admittedSource.stateVersion },
    commandId: randomUUID(),
    consent: { schemaVersion: 1, purpose: "PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC", accepted: true, externalProcessingAllowed: false,
      version: "SYNTHETIC_CONSENT_NOT_PROVIDER_PERMISSION-v1", actorUserId: user.id, workspaceId, projectId: project.id, intakeId: intake.intakeId,
      sourceId: source.id, sourceContentHash: source.contentHash, acceptedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
      languageHint: "fr", maxTotalCostMicros: "1000000", retentionHours: 24 },
    segmentation: { transformer: { id: "synthetic-identity-fixture", version: "1", encodingProfile: "existing-small-fixture", mode: "SYNTHETIC_LOCAL" },
      segments: [{ ordinal: 0, startMs: 0, endMs: source.durationMs!, durationMs: source.durationMs!, mediaFormat: "m4a", mimeType: source.mimeType,
        bytes: sourceBytes, contentHash: source.contentHash }] },
  };
  const session = await createProjectBrainVoiceSession(sourceInput, { enabled: true });
  if (session.status !== "PREPARED_LOCAL_NOT_AUTHORIZED") throw new Error(`SESSION_${session.status}`);
  const segment = await prisma.voiceIntakeSegment.findFirstOrThrow({ where: { sessionId: session.sessionId } });
  const policyId = `recovery-policy-${randomUUID()}`, routeId = `recovery-route-${randomUUID()}`, routeKey = `recovery-route-${randomUUID()}`;
  const privacy = { adapterKey: "voice-synthetic-direct", allowedDataClasses: ["personal_data"], billingProvider: "synthetic",
    certificationOwner: "LOCAL_TEST_FIXTURE_NOT_CERTIFICATION", effectiveAt: new Date(Date.now() - 60_000).toISOString(),
    endpointKey: "audio/transcriptions", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), intermediary: null,
    modelKey: "synthetic-stt-v1", operationTypes: ["intake_voice_transcription"], pathKind: "direct_provider", privacyPosture: "zero_retention", residency: ["CA"], tenancyMode: "route_isolated" };
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('pb-gateway-fixture-policy-version'))");
    const [version] = await tx.$queryRawUnsafe<Array<{ next: number }>>(`SELECT coalesce(max(version),0)+1 AS next FROM "ModelGatewayPolicyVersion" WHERE "policyKey"='intake-voice-transcription-v1'`);
    await tx.$executeRawUnsafe(`INSERT INTO "ModelGatewayRouteProfile" (id,"routeKey",version,status,"pathKind","adapterKey","billingProvider","endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"pricingEvidence","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash","createdBy","createdAt","publishedAt")
      VALUES ($1,$2,1,'published','direct_provider','voice-synthetic-direct','synthetic','audio/transcriptions','synthetic-stt-v1',ARRAY['intake_voice_transcription'],ARRAY['personal_data'],'zero_retention',ARRAY['CA'],'{}'::jsonb,$3::jsonb,2000000,20000,$4,'LOCAL_SYNTHETIC_FIXTURE',(clock_timestamp() AT TIME ZONE 'UTC'),(clock_timestamp() AT TIME ZONE 'UTC'))`,
    routeId, routeKey, JSON.stringify(privacy), canonicalFingerprint({ routeId, privacy }));
    await tx.$executeRawUnsafe(`INSERT INTO "ModelGatewayPolicyVersion" (id,"policyKey",version,"operationType",status,"routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash","createdBy","createdAt","publishedAt")
      VALUES ($1,'intake-voice-transcription-v1',$2,'intake_voice_transcription','published',$3::jsonb,'[]'::jsonb,1,100000,'zero_retention',$4,'LOCAL_SYNTHETIC_FIXTURE',(clock_timestamp() AT TIME ZONE 'UTC'),(clock_timestamp() AT TIME ZONE 'UTC'))`,
    policyId, version.next, JSON.stringify([{ routeKey, version: 1 }]), canonicalFingerprint({ policyId, routeId }));
  });
  const input = { actor: { kind: "PROJECT_BRAIN_OWNER" as const, id: user.id, workspaceId }, sessionId: session.sessionId, segmentId: segment.id,
    audioBytes: sourceBytes, policyId, dataClass: "personal_data" as const, privacyRequirement: "zero_retention" as const,
    maxSegmentCostMicros: 100_000n, deadline: new Date(Date.now() + 55_000) };
  const options = { enabled: true, environment: "local", voiceEnabled: true,
    env: { NODE_ENV: "test" as const, ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "1000000000" } };
  const admission = await admitGatewayVoiceSegment(input, options);
  if (admission.status !== "prepared_synthetic_not_dispatched") throw new Error(`ADMISSION_${admission.status}`);
  return { user, workspaceId, project, intake, source, sourceInput, session, segment, input, options, admission };
}

export type RecoveryFixture = Awaited<ReturnType<typeof projectBrainRecoveryFixture>>;

/** Create a short future test lease then wait for actual DB-clock expiry. This
 * models an expired durable claim, never proves an OS crash or invocation. The
 * admitted rows/nonce remain real; no model/provider callback exists here. */
export async function expireProjectBrainRecoveryClaim(a: PreparedProjectBrainVoiceAdmission, dispatched = false) {
  requirePersonalDisposableDatabase();
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `voice-session-spend:${a.request.subject.sessionId}`);
    if (dispatched) {
      const marked = await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='dispatched',"dispatchState"='unaccounted',"dispatchedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
        WHERE id=$1 AND status='prepared' AND "dispatchState"='not_dispatched'`, a.attempt.id);
      const segment = await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSegment" SET status='running',"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE id=$1 AND status='registered'`, a.request.subject.segmentId);
      if (marked !== 1 || segment !== 1) throw new Error("SYNTHETIC_DISPATCH_MARKER_REFUSED");
    }
    const changed = await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')+interval '200 milliseconds',"lastError"='SYNTHETIC_PRIOR_DIAGNOSTIC'
      WHERE id=$1 AND "lockedBy"=$2 AND status='running' AND attempts=1 AND "voiceIntakeSegmentId"=$3`, a.claim.operationId, a.claim.lockedBy, a.request.subject.segmentId);
    if (changed !== 1) throw new Error("SYNTHETIC_EXPIRY_REFUSED");
  }, { isolationLevel: "Serializable" });
  const [remaining] = await prisma.$queryRawUnsafe<Array<{ ms: number }>>(`SELECT GREATEST(0,EXTRACT(EPOCH FROM ("leaseExpiresAt"-(clock_timestamp() AT TIME ZONE 'UTC')))*1000)::float8 AS ms
    FROM "AiOperation" WHERE id=$1 AND "lockedBy"=$2 AND status='running' AND attempts=1`, a.claim.operationId, a.claim.lockedBy);
  if (!remaining || !Number.isFinite(remaining.ms) || remaining.ms > 1500) throw new Error("SYNTHETIC_SHORT_EXPIRY_REQUIRED");
  await prisma.$queryRawUnsafe("SELECT pg_sleep($1::double precision)::text", (remaining.ms + 50) / 1000);
}

export async function projectBrainRecoveryRows(f: RecoveryFixture) {
  requirePersonalDisposableDatabase();
  const ai = await prisma.aiOperation.findUniqueOrThrow({ where: { id: f.admission.claim.operationId } });
  const operation = await prisma.modelGatewayOperation.findUniqueOrThrow({ where: { aiOperationId: ai.id } });
  const attempt = await prisma.modelGatewayAttempt.findUniqueOrThrow({ where: { id: f.admission.attempt.id }, include: { accountSpendHold: true } });
  const transcripts = await prisma.voiceTranscriptSegment.findMany({ where: { OR: [{ segmentId: f.segment.id }, { gatewayAttemptId: attempt.id }] } });
  const usages = await prisma.aiUsage.findMany({ where: { operationId: ai.id } });
  const segment = await prisma.voiceIntakeSegment.findUniqueOrThrow({ where: { id: f.segment.id } });
  const session = await prisma.voiceIntakeSession.findUniqueOrThrow({ where: { id: f.session.sessionId } });
  const source = await prisma.constructionProjectBrainSource.findUniqueOrThrow({ where: { id: f.source.id } });
  const audits = await prisma.modelGatewayAuditEvent.findMany({ where: { gatewayOperationId: operation.id }, orderBy: { id: "asc" } });
  return { ai, operation, attempt, transcripts, usages, segment, session, source, audits };
}
