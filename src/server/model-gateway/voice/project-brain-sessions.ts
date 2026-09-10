import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { inspectProjectBrainVoiceSourceInTransaction, projectBrainVoiceSourceSubjectSchema, resolveProjectBrainVoiceSource, type ProjectBrainVoiceSourceRequest } from "./project-brain-subject";
import { inspectProjectBrainSourceSegments, inspectStoredProjectBrainVoiceManifest } from "./source-segments";
import { VOICE_INTAKE_LANGUAGES, VOICE_LIMITS } from "./types";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
export const projectBrainVoiceLocalConsentSchema = z.object({
  schemaVersion: z.literal(1), purpose: z.literal("PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC"),
  accepted: z.literal(true), externalProcessingAllowed: z.literal(false),
  version: z.string().min(1).max(120), actorUserId: id, workspaceId: id, projectId: id, intakeId: id, sourceId: id,
  sourceContentHash: hash, acceptedAt: date, expiresAt: date, languageHint: z.enum(VOICE_INTAKE_LANGUAGES),
  // An explicit local session bound, not provider consent or a reserved/settled amount.
  maxTotalCostMicros: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => BigInt(value) <= 9_223_372_036_854_775_807n),
  retentionHours: z.literal(24),
}).strict();

type StoredSession = { id: string; sourceBindingHash: string; segmentManifestHash: string; status: string; expiresAt: Date; requestCommandId: string };

/** Local synthetic persistence only. The trusted caller supplies actor/context and an explicit
 * consent event; the source itself is never converted into consent. No gateway admission or hold. */
export async function createProjectBrainVoiceSession(input: {
  source: ProjectBrainVoiceSourceRequest;
  commandId: string;
  consent: unknown;
  segmentation: { transformer: unknown; segments: unknown };
}, options: { enabled?: boolean } = {}) {
  if (options.enabled !== true) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const commandId = z.string().uuid().parse(input.commandId).toLowerCase();
  const consent = projectBrainVoiceLocalConsentSchema.parse(input.consent);
  for (const key of ["actorUserId", "workspaceId", "projectId", "intakeId", "sourceId"] as const) {
    if (consent[key] !== input.source[key]) throw new Error("VOICE_PB_CONSENT_SUBJECT_REFUSED");
  }
  const resolved = await resolveProjectBrainVoiceSource({ ...input.source, enabled: true });
  if (resolved.status !== "RESOLVED_LOCAL_NOT_AUTHORIZED" || consent.sourceContentHash !== resolved.subject.sourceContentHash) {
    throw new Error("VOICE_PB_CONSENT_SOURCE_CHANGED");
  }
  const inspected = inspectProjectBrainSourceSegments({
    subject: resolved.subject, subjectFingerprint: resolved.subjectFingerprint, sourceBytes: resolved.bytes,
    transformer: input.segmentation.transformer, segments: input.segmentation.segments,
  }, { enabled: true });
  if (inspected.status !== "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED") throw new Error("VOICE_PB_MANIFEST_REFUSED");
  const sourceBinding = Object.freeze({ schemaVersion: 1, commandId, subject: resolved.subject, subjectFingerprint: resolved.subjectFingerprint, consent });
  const sourceBindingHash = sha256Canonical(sourceBinding);

  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout','2000',true),set_config('lock_timeout','250',true)");
    // Canonical authority rows are locked before comparing the snapshot and creating any session.
    // There is no provider/network callback in this transaction and no automatic serialization retry.
    const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT s.id FROM "ConstructionProjectBrainSource" s
       JOIN "ConstructionProjectBrainIntake" i ON i.id=s."intakeId" AND i."workspaceId"=s."workspaceId" AND i."projectId"=s."projectId"
       JOIN "File" f ON f.id=s."fileId"
       JOIN "ConstructionWorkspace" w ON w.id=s."workspaceId" AND w.status='active' AND w."ownerUserId"=$1
       JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$1 AND m.status='active' AND m.role='owner'
       JOIN "ConstructionProject" p ON p.id=s."projectId" AND p."workspaceId"=w.id AND p.status='active'
       WHERE s.id=$2 AND s."workspaceId"=$3 AND s."projectId"=$4 AND s."intakeId"=$5 FOR SHARE OF s,i,f,w,m,p`,
      input.source.actorUserId, input.source.sourceId, input.source.workspaceId, input.source.projectId, input.source.intakeId,
    );
    if (locked.length !== 1) throw new Error("VOICE_PB_CURRENT_AUTHORITY_REFUSED");
    const current = await inspectProjectBrainVoiceSourceInTransaction(tx, input.source);
    if (sha256Canonical(current) !== resolved.subjectFingerprint) throw new Error("VOICE_PB_CURRENT_AUTHORITY_CHANGED");
    const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS now`);
    const now = clock?.now;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("VOICE_PB_DATABASE_CLOCK_REFUSED");
    const acceptedAt = new Date(consent.acceptedAt), expiresAt = new Date(consent.expiresAt);
    const existing = await tx.$queryRawUnsafe<StoredSession[]>(
      `SELECT id,"sourceBindingHash","segmentManifestHash",status::text status,"expiresAt","requestCommandId"::text FROM "VoiceIntakeSession"
       WHERE "subjectKind"='project_brain_voice' AND (("requestedByUserId"=$1 AND "workspaceId"=$2 AND "requestCommandId"=$3::uuid) OR "projectBrainSourceId"=$4) FOR UPDATE`,
      input.source.actorUserId, input.source.workspaceId, commandId, input.source.sourceId,
    );
    if (existing.length) {
      const row = existing[0];
      if (existing.length !== 1 || row.requestCommandId !== commandId || row.sourceBindingHash !== sourceBindingHash || row.segmentManifestHash !== inspected.manifestHash) {
        throw new Error("VOICE_PB_SESSION_IDEMPOTENCY_CONFLICT");
      }
      return Object.freeze({ status: "REPLAYED_LOCAL_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
        externalTransportPerformed: false as const, spendReserved: false as const, sessionId: row.id, sessionStatus: row.status,
        sourceBindingHash, segmentManifestHash: inspected.manifestHash });
    }
    // An exact replay returns recorded state without renewing consent, TTL, budget or attempts.
    if (acceptedAt.getTime() > now.getTime() || acceptedAt.getTime() < now.getTime() - 15 * 60_000
      || expiresAt.getTime() <= now.getTime() || expiresAt.getTime() > acceptedAt.getTime() + 24 * 60 * 60_000) {
      throw new Error("VOICE_PB_CONSENT_TIME_REFUSED");
    }
    const sessionId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO "VoiceIntakeSession" (id,"clientId","subjectKind","requestedByUserId","workspaceId","projectId","intakeId","projectBrainSourceId",
       "requestCommandId","sourceBinding","sourceBindingHash","segmentManifest","segmentManifestHash",status,"languageHint","consentVersion","consentedAt",
       "maxDurationMs","maxSegmentDurationMs","maxSegmentBytes","maxSegments","maxTotalBytes","maxTotalCostMicros","expectedSegmentCount","capturedDurationMs","capturedBytes",
       "expiresAt","finishedAt","createdAt","updatedAt")
       VALUES ($1,NULL,'project_brain_voice',$2,$3,$4,$5,$6,$7::uuid,$8::jsonb,$9,$10::jsonb,$11,'finishing',$12::"VoiceIntakeLanguage",$13,
       ($14::timestamptz AT TIME ZONE 'UTC'),$15,$16,$17,$18,$19,$20,$21,$22,$23,
       ($24::timestamptz AT TIME ZONE 'UTC'),($25::timestamptz AT TIME ZONE 'UTC'),($25::timestamptz AT TIME ZONE 'UTC'),($25::timestamptz AT TIME ZONE 'UTC'))`,
      sessionId, input.source.actorUserId, input.source.workspaceId, input.source.projectId, input.source.intakeId, input.source.sourceId,
      commandId, JSON.stringify(sourceBinding), sourceBindingHash, JSON.stringify(inspected.manifest), inspected.manifestHash,
      consent.languageHint, consent.version, acceptedAt, VOICE_LIMITS.maxSessionDurationMs, VOICE_LIMITS.maxSegmentDurationMs,
      VOICE_LIMITS.maxSegmentBytes, VOICE_LIMITS.maxSegments, VOICE_LIMITS.maxSessionBytes, BigInt(consent.maxTotalCostMicros),
      inspected.manifest.segments.length, inspected.manifest.totalDurationMs, inspected.manifest.totalBytes, expiresAt, now,
    );
    for (const segment of inspected.manifest.segments) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "VoiceIntakeSegment" (id,"sessionId",ordinal,status,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint","createdAt","updatedAt")
         VALUES ($1,$2,$3,'registered',$4::"VoiceMediaFormat",$5,$6,$7,$8,$9::"VoiceIntakeLanguage",($10::timestamptz AT TIME ZONE 'UTC'),($10::timestamptz AT TIME ZONE 'UTC'))`,
        randomUUID(), sessionId, segment.ordinal, segment.mediaFormat, segment.mimeType, segment.durationMs, segment.byteCount,
        `sha256:${segment.contentHash}`, consent.languageHint, now,
      );
    }
    return Object.freeze({ status: "PREPARED_LOCAL_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
      externalTransportPerformed: false as const, spendReserved: false as const, sessionId, sessionStatus: "finishing" as const,
      sourceBindingHash, segmentManifestHash: inspected.manifestHash });
  }, { isolationLevel: "Serializable", timeout: 5_000, maxWait: 2_000 });
}

const storedBindingSchema = z.object({
  schemaVersion: z.literal(1), commandId: z.string().uuid(), subject: projectBrainVoiceSourceSubjectSchema,
  subjectFingerprint: hash, consent: projectBrainVoiceLocalConsentSchema,
}).strict();
const sessionReadSchema = z.object({
  id, clientId: z.null(), subjectKind: z.literal("project_brain_voice"), requestedByUserId: id,
  workspaceId: id, projectId: id, intakeId: id, projectBrainSourceId: id, requestCommandId: z.string().uuid(),
  sourceBinding: z.unknown(), sourceBindingHash: hash, segmentManifest: z.unknown(), segmentManifestHash: hash,
  status: z.enum(["finishing", "transcribing", "ready", "incomplete", "uncertain", "cancelled", "failed", "purged"]),
  languageHint: z.enum(VOICE_INTAKE_LANGUAGES), consentVersion: z.string().min(1).max(120), consentedAt: z.date(), expiresAt: z.date(),
  maxDurationMs: z.literal(VOICE_LIMITS.maxSessionDurationMs), maxSegmentDurationMs: z.literal(VOICE_LIMITS.maxSegmentDurationMs),
  maxSegmentBytes: z.literal(VOICE_LIMITS.maxSegmentBytes), maxSegments: z.literal(VOICE_LIMITS.maxSegments), maxTotalBytes: z.literal(VOICE_LIMITS.maxSessionBytes),
  maxTotalCostMicros: z.bigint(), expectedSegmentCount: z.number().int().min(1).max(VOICE_LIMITS.maxSegments),
  capturedDurationMs: z.number().int().positive(), capturedBytes: z.number().int().positive(),
}).strict();
const segmentReadSchema = z.object({
  id, sessionId: id, ordinal: z.number().int().min(0).max(VOICE_LIMITS.maxSegments - 1),
  status: z.enum(["registered", "reserved", "running", "succeeded", "failed", "uncertain", "cancelled", "purged"]),
  mediaFormat: z.string(), mimeType: z.string(), durationMs: z.number().int(), byteCount: z.number().int(),
  audioFingerprint: z.string(), languageHint: z.enum(VOICE_INTAKE_LANGUAGES),
}).strict();

/** Trusted authenticated caller supplies actor/context. Read-only metadata, never dispatch authority,
 * protected storage coordinates, raw media, or a claim that a usable transcript exists. */
export async function readProjectBrainVoiceSession(input: { actorUserId: string; workspaceId: string; sessionId: string }, options: { enabled?: boolean } = {}) {
  if (options.enabled !== true) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const request = z.object({ actorUserId: id, workspaceId: id, sessionId: id }).strict().parse(input);
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout','2000',true),set_config('lock_timeout','250',true)");
    const rows = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT v.id,v."clientId",v."subjectKind",v."requestedByUserId",v."workspaceId",v."projectId",v."intakeId",v."projectBrainSourceId",
       v."requestCommandId"::text,v."sourceBinding",v."sourceBindingHash",v."segmentManifest",v."segmentManifestHash",v.status::text,
       v."languageHint"::text,v."consentVersion",v."consentedAt",v."expiresAt",v."maxDurationMs",v."maxSegmentDurationMs",v."maxSegmentBytes",
       v."maxSegments",v."maxTotalBytes",v."maxTotalCostMicros",v."expectedSegmentCount",v."capturedDurationMs",v."capturedBytes"
       FROM "VoiceIntakeSession" v
       JOIN "ConstructionProjectBrainSource" s ON s.id=v."projectBrainSourceId" AND s."workspaceId"=v."workspaceId" AND s."projectId"=v."projectId" AND s."intakeId"=v."intakeId"
       JOIN "ConstructionProjectBrainIntake" i ON i.id=s."intakeId" AND i."workspaceId"=s."workspaceId" AND i."projectId"=s."projectId"
       JOIN "File" f ON f.id=s."fileId"
       JOIN "ConstructionWorkspace" w ON w.id=s."workspaceId" AND w.status='active' AND w."ownerUserId"=$1
       JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$1 AND m.status='active' AND m.role='owner'
       JOIN "ConstructionProject" p ON p.id=s."projectId" AND p."workspaceId"=w.id AND p.status='active'
       WHERE v.id=$2 AND v."requestedByUserId"=$1 AND v."workspaceId"=$3 AND v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL
       FOR SHARE OF v,s,i,f,w,m,p`, request.actorUserId, request.sessionId, request.workspaceId,
    );
    if (rows.length !== 1) throw new Error("VOICE_PB_READ_REFUSED");
    const row = sessionReadSchema.parse(rows[0]);
    const binding = storedBindingSchema.parse(row.sourceBinding);
    const manifest = inspectStoredProjectBrainVoiceManifest(row.segmentManifest, row.segmentManifestHash);
    if (row.id !== request.sessionId || row.requestedByUserId !== request.actorUserId || row.workspaceId !== request.workspaceId
      || sha256Canonical(binding) !== row.sourceBindingHash || sha256Canonical(binding.subject) !== binding.subjectFingerprint
      || manifest.subjectFingerprint !== binding.subjectFingerprint || sha256Canonical(manifest.subject) !== binding.subjectFingerprint
      || binding.commandId !== row.requestCommandId) throw new Error("VOICE_PB_READ_BINDING_CHANGED");
    const subject = binding.subject, consent = binding.consent;
    for (const [key, value] of Object.entries({ actorUserId: row.requestedByUserId, workspaceId: row.workspaceId,
      projectId: row.projectId, intakeId: row.intakeId, sourceId: row.projectBrainSourceId })) {
      if (subject[key as keyof typeof subject] !== value || consent[key as keyof typeof consent] !== value) throw new Error("VOICE_PB_READ_BINDING_CHANGED");
    }
    if (consent.sourceContentHash !== subject.sourceContentHash || consent.version !== row.consentVersion || consent.languageHint !== row.languageHint
      || new Date(consent.acceptedAt).getTime() !== row.consentedAt.getTime() || new Date(consent.expiresAt).getTime() !== row.expiresAt.getTime()
      || BigInt(consent.maxTotalCostMicros) !== row.maxTotalCostMicros || row.expectedSegmentCount !== manifest.segments.length
      || row.capturedDurationMs !== manifest.totalDurationMs || row.capturedBytes !== manifest.totalBytes
      || row.expiresAt.getTime() <= row.consentedAt.getTime() || row.expiresAt.getTime() > row.consentedAt.getTime() + 86_400_000) {
      throw new Error("VOICE_PB_READ_BINDING_CHANGED");
    }
    const current = await inspectProjectBrainVoiceSourceInTransaction(tx, { actorUserId: request.actorUserId, workspaceId: request.workspaceId,
      projectId: row.projectId, intakeId: row.intakeId, sourceId: row.projectBrainSourceId, expectedIntakeStateVersion: subject.intakeStateVersion });
    if (sha256Canonical(current) !== binding.subjectFingerprint) throw new Error("VOICE_PB_CURRENT_AUTHORITY_CHANGED");
    const segmentRows = await tx.$queryRawUnsafe<unknown[]>(
      `SELECT id,"sessionId",ordinal,status::text,"mediaFormat"::text,"mimeType","durationMs","byteCount","audioFingerprint","languageHint"::text
       FROM "VoiceIntakeSegment" WHERE "sessionId"=$1 ORDER BY ordinal LIMIT 15 FOR SHARE`, row.id,
    );
    if (segmentRows.length !== manifest.segments.length) throw new Error("VOICE_PB_READ_SEGMENTS_CHANGED");
    const segments = segmentRows.map((value, ordinal) => {
      const segment = segmentReadSchema.parse(value), expected = manifest.segments[ordinal];
      if (segment.sessionId !== row.id || segment.ordinal !== ordinal || segment.durationMs !== expected.durationMs
        || segment.byteCount !== expected.byteCount || segment.audioFingerprint !== `sha256:${expected.contentHash}`
        || segment.mediaFormat !== expected.mediaFormat || segment.mimeType !== expected.mimeType || segment.languageHint !== consent.languageHint) {
        throw new Error("VOICE_PB_READ_SEGMENTS_CHANGED");
      }
      return Object.freeze({ segmentId: segment.id, ordinal, status: segment.status, startMs: expected.startMs,
        endMs: expected.endMs, durationMs: expected.durationMs, byteCount: expected.byteCount, audioFingerprint: segment.audioFingerprint });
    });
    const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS now`);
    if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime())) throw new Error("VOICE_PB_DATABASE_CLOCK_REFUSED");
    if (clock.now.getTime() >= row.expiresAt.getTime() || clock.now.getTime() < row.consentedAt.getTime()) throw new Error("VOICE_PB_READ_EXPIRED");
    return Object.freeze({ status: "READ_ONLY_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
      transcriptionAvailable: false as const, processingMode: "LOCAL_SYNTHETIC" as const, mediaDecodingVerified: false as const,
      sessionId: row.id, sessionStatus: row.status, workspaceId: row.workspaceId, projectId: row.projectId, intakeId: row.intakeId,
      sourceId: row.projectBrainSourceId, sourceBindingHash: row.sourceBindingHash, segmentManifestHash: row.segmentManifestHash,
      languageHint: row.languageHint, durationMs: manifest.totalDurationMs, byteCount: manifest.totalBytes,
      expiresAt: row.expiresAt.toISOString(), segments: Object.freeze(segments),
      sessionCostBoundMicros: consent.maxTotalCostMicros, costBoundIsProviderAuthorization: false as const });
  }, { isolationLevel: "Serializable", timeout: 5_000, maxWait: 2_000 });
}
