import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  VOICE_LIMITS,
  isVoiceIntakeLanguage,
  type VoiceIntakeLanguage,
} from "./types";
import { buildVoiceSegmentProjection } from "./projection";
import { sameVoiceSegmentRegistration } from "./operations";

export type VoiceActor = Readonly<{ id: string; role: string }>;

export type VoiceSessionAccessShape = Readonly<{
  id: string;
  clientId: string;
  status: string;
  consentVersion: string;
  consentedAt: Date;
  expiresAt: Date;
}>;

export type PreparedVoiceSession = Readonly<{
  clientId: string;
  status: "open";
  languageHint: VoiceIntakeLanguage;
  consentVersion: string;
  consentedAt: Date;
  maxDurationMs: number;
  maxSegmentDurationMs: number;
  maxSegmentBytes: number;
  maxSegments: number;
  maxTotalBytes: number;
  maxTotalCostMicros: bigint;
  expiresAt: Date;
  createdAt: Date;
}>;

export function checkVoiceRegistrationBounds(input: {
  limits: Readonly<{
    maxDurationMs: number;
    maxSegmentDurationMs: number;
    maxSegmentBytes: number;
    maxSegments: number;
    maxTotalBytes: number;
  }>;
  existingSegments: readonly Readonly<{ ordinal: number; durationMs: number; byteCount: number }>[];
  candidate: Readonly<{ ordinal: number; durationMs: number; byteCount: number }>;
}) {
  const { limits, candidate } = input;
  if (!Number.isInteger(candidate.ordinal) || candidate.ordinal < 0 || candidate.ordinal >= limits.maxSegments ||
      input.existingSegments.length >= limits.maxSegments) {
    throw new Error("voice_session_limit_exceeded");
  }
  if (!Number.isInteger(candidate.durationMs) || candidate.durationMs <= 0) {
    throw new Error("voice_segment_empty");
  }
  if (candidate.durationMs > limits.maxSegmentDurationMs) throw new Error("voice_segment_too_long");
  if (!Number.isInteger(candidate.byteCount) || candidate.byteCount <= 0) {
    throw new Error("voice_segment_empty");
  }
  if (candidate.byteCount > limits.maxSegmentBytes) throw new Error("voice_segment_too_large");
  if (input.existingSegments.some((segment) => segment.ordinal === candidate.ordinal)) {
    throw new Error("voice_segment_conflict");
  }
  const capturedDurationMs = input.existingSegments.reduce((sum, segment) => sum + segment.durationMs, 0) + candidate.durationMs;
  const capturedBytes = input.existingSegments.reduce((sum, segment) => sum + segment.byteCount, 0) + candidate.byteCount;
  if (capturedDurationMs > limits.maxDurationMs || capturedBytes > limits.maxTotalBytes) {
    throw new Error("voice_session_limit_exceeded");
  }
  return Object.freeze({
    segmentCount: input.existingSegments.length + 1,
    capturedDurationMs,
    capturedBytes,
  });
}

const VOICE_SESSION_TRANSITIONS = Object.freeze({
  open: Object.freeze({ finish: "finishing", cancel: "cancelled", fail: "failed" }),
  finishing: Object.freeze({ transcribe: "transcribing", cancel: "cancelled", fail: "failed" }),
  transcribing: Object.freeze({ ready: "ready", incomplete: "incomplete", uncertain: "uncertain", cancel: "cancelled", fail: "failed" }),
  ready: Object.freeze({ purge: "purged" }),
  incomplete: Object.freeze({ purge: "purged" }),
  uncertain: Object.freeze({ purge: "purged" }),
  cancelled: Object.freeze({ purge: "purged" }),
  failed: Object.freeze({ purge: "purged" }),
  purged: Object.freeze({}),
} as const);

export function nextVoiceSessionStatus(status: string, event: string): string | null {
  const transitions = VOICE_SESSION_TRANSITIONS[status as keyof typeof VOICE_SESSION_TRANSITIONS] as
    | Readonly<Record<string, string>>
    | undefined;
  return transitions?.[event] ?? null;
}

export function prepareVoiceSessionCreation(input: {
  actor: VoiceActor;
  languageHint: unknown;
  consentAccepted: boolean;
  consentVersion: string;
  maxTotalCostMicros: bigint;
  now?: Date;
}): PreparedVoiceSession {
  const now = new Date((input.now ?? new Date()).getTime());
  if (input.actor.role !== "CLIENT" || !input.actor.id) {
    throw new Error("voice_session_not_owned");
  }
  if (!input.consentAccepted || input.consentVersion.trim().length === 0) {
    throw new Error("voice_consent_missing");
  }
  if (!isVoiceIntakeLanguage(input.languageHint)) {
    throw new Error("voice_language_unsupported");
  }
  if (input.maxTotalCostMicros <= 0n) throw new Error("voice_not_configured");
  if (Number.isNaN(now.getTime())) throw new Error("voice_session_closed");

  return Object.freeze({
    clientId: input.actor.id,
    status: "open" as const,
    languageHint: input.languageHint,
    consentVersion: input.consentVersion.trim(),
    consentedAt: now,
    maxDurationMs: VOICE_LIMITS.maxSessionDurationMs,
    maxSegmentDurationMs: VOICE_LIMITS.maxSegmentDurationMs,
    maxSegmentBytes: VOICE_LIMITS.maxSegmentBytes,
    maxSegments: VOICE_LIMITS.maxSegments,
    maxTotalBytes: VOICE_LIMITS.maxSessionBytes,
    maxTotalCostMicros: input.maxTotalCostMicros,
    expiresAt: new Date(now.getTime() + VOICE_LIMITS.transcriptTtlHours * 60 * 60 * 1_000),
    createdAt: now,
  });
}

export function assertVoiceSessionAccess<T extends VoiceSessionAccessShape>(
  session: T,
  actor: VoiceActor,
  now = new Date(),
  allowedStatuses: readonly string[] = ["open"]
): T {
  if (actor.role !== "CLIENT" || actor.id !== session.clientId) {
    throw new Error("voice_session_not_owned");
  }
  if (!session.consentVersion || Number.isNaN(session.consentedAt.getTime())) {
    throw new Error("voice_consent_missing");
  }
  if (session.expiresAt.getTime() <= now.getTime()) throw new Error("voice_session_expired");
  if (!allowedStatuses.includes(session.status)) throw new Error("voice_session_closed");
  return session;
}

export async function createVoiceIntakeSession(input: Parameters<typeof prepareVoiceSessionCreation>[0]) {
  const prepared = prepareVoiceSessionCreation(input);
  const id = `vis_${randomUUID().replaceAll("-", "")}`;
  const rows = await prisma.$queryRawUnsafe<Array<VoiceSessionAccessShape & PreparedVoiceSession>>(
    `INSERT INTO "VoiceIntakeSession" (id,"clientId",status,"languageHint","consentVersion","consentedAt","maxDurationMs","maxSegmentDurationMs","maxSegmentBytes","maxSegments","maxTotalBytes","maxTotalCostMicros","expiresAt","createdAt","updatedAt") VALUES ($1,$2,'open',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
    id,
    prepared.clientId,
    prepared.languageHint,
    prepared.consentVersion,
    prepared.consentedAt,
    prepared.maxDurationMs,
    prepared.maxSegmentDurationMs,
    prepared.maxSegmentBytes,
    prepared.maxSegments,
    prepared.maxTotalBytes,
    prepared.maxTotalCostMicros,
    prepared.expiresAt,
    prepared.createdAt
  );
  if (!rows[0]) throw new Error("voice_session_not_found");
  return Object.freeze(rows[0]);
}

type VoiceSessionDbRow = VoiceSessionAccessShape & Readonly<{
  languageHint: VoiceIntakeLanguage;
  maxDurationMs: number;
  maxSegmentDurationMs: number;
  maxSegmentBytes: number;
  maxSegments: number;
  maxTotalBytes: number;
  maxTotalCostMicros: bigint;
  expectedSegmentCount: number | null;
}>;

type VoiceSegmentDbRow = Readonly<{
  id: string;
  sessionId: string;
  ordinal: number;
  status: string;
  mediaFormat: string;
  mimeType: string;
  durationMs: number;
  byteCount: number;
  audioFingerprint: string;
  languageHint: string;
}>;

async function lockVoiceSession(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionId: string
): Promise<VoiceSessionDbRow> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `voice-session:${sessionId}`);
  const [session] = await tx.$queryRawUnsafe<VoiceSessionDbRow[]>(
    `SELECT id,"clientId",status,"languageHint","consentVersion","consentedAt","expiresAt","maxDurationMs","maxSegmentDurationMs","maxSegmentBytes","maxSegments","maxTotalBytes","maxTotalCostMicros","expectedSegmentCount" FROM "VoiceIntakeSession" WHERE id=$1 FOR UPDATE`,
    sessionId
  );
  if (!session) throw new Error("voice_session_not_found");
  return session;
}

export async function registerVoiceIntakeSegment(input: {
  actor: VoiceActor;
  sessionId: string;
  ordinal: number;
  mediaFormat: unknown;
  mimeType: string;
  durationMs: number;
  audioBytes: Uint8Array;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const session = await lockVoiceSession(tx, input.sessionId);
    assertVoiceSessionAccess(session, input.actor, now, ["open"]);
    const existing = await tx.$queryRawUnsafe<VoiceSegmentDbRow[]>(
      `SELECT id,"sessionId",ordinal,status,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint" FROM "VoiceIntakeSegment" WHERE "sessionId"=$1 ORDER BY ordinal`,
      input.sessionId
    );
    const prior = existing.find((segment) => segment.ordinal === input.ordinal);
    const segmentId = prior?.id ?? `vig_${randomUUID().replaceAll("-", "")}`;
    const projection = buildVoiceSegmentProjection({
      sessionId: input.sessionId,
      segmentId,
      ordinal: input.ordinal,
      languageHint: session.languageHint,
      mediaFormat: input.mediaFormat,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      audioBytes: input.audioBytes,
    });
    if (prior) {
      if (!sameVoiceSegmentRegistration(prior, projection)) throw new Error("voice_segment_conflict");
      return Object.freeze({
        status: "replayed" as const,
        segmentId: prior.id,
        ordinal: prior.ordinal,
        audioFingerprint: prior.audioFingerprint,
      });
    }
    const aggregate = checkVoiceRegistrationBounds({
      limits: session,
      existingSegments: existing,
      candidate: projection,
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO "VoiceIntakeSegment" (id,"sessionId",ordinal,status,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint","createdAt","updatedAt") VALUES ($1,$2,$3,'registered',$4::"VoiceMediaFormat",$5,$6,$7,$8,$9::"VoiceIntakeLanguage",$10,$10)`,
      segmentId,
      input.sessionId,
      projection.ordinal,
      projection.mediaFormat,
      projection.mimeType,
      projection.durationMs,
      projection.byteCount,
      projection.audioFingerprint,
      projection.languageHint,
      now
    );
    await tx.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET "capturedDurationMs"=$2,"capturedBytes"=$3,"updatedAt"=$4 WHERE id=$1 AND status='open'`,
      input.sessionId,
      aggregate.capturedDurationMs,
      aggregate.capturedBytes,
      now
    );
    return Object.freeze({
      status: "registered" as const,
      segmentId,
      ordinal: projection.ordinal,
      audioFingerprint: projection.audioFingerprint,
    });
  });
}

export async function finishVoiceIntakeSession(input: {
  actor: VoiceActor;
  sessionId: string;
  expectedSegmentCount: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!Number.isInteger(input.expectedSegmentCount) || input.expectedSegmentCount < 1 ||
      input.expectedSegmentCount > VOICE_LIMITS.maxSegments) {
    throw new Error("voice_transcript_incomplete");
  }
  return prisma.$transaction(async (tx) => {
    const session = await lockVoiceSession(tx, input.sessionId);
    assertVoiceSessionAccess(session, input.actor, now, ["open", "finishing", "transcribing"]);
    if (session.expectedSegmentCount !== null && session.expectedSegmentCount !== input.expectedSegmentCount) {
      throw new Error("voice_segment_conflict");
    }
    const ordinals = await tx.$queryRawUnsafe<Array<{ ordinal: number }>>(
      `SELECT ordinal FROM "VoiceIntakeSegment" WHERE "sessionId"=$1 ORDER BY ordinal`,
      input.sessionId
    );
    if (ordinals.length !== input.expectedSegmentCount ||
        ordinals.some((item, index) => item.ordinal !== index)) {
      throw new Error("voice_transcript_incomplete");
    }
    if (session.status !== "transcribing") {
      await tx.$executeRawUnsafe(
        `UPDATE "VoiceIntakeSession" SET status='finishing',"expectedSegmentCount"=$2,"updatedAt"=$3 WHERE id=$1 AND status='open'`,
        input.sessionId,
        input.expectedSegmentCount,
        now
      );
      await tx.$executeRawUnsafe(
        `UPDATE "VoiceIntakeSession" SET status='transcribing',"expectedSegmentCount"=$2,"updatedAt"=$3 WHERE id=$1 AND status='finishing'`,
        input.sessionId,
        input.expectedSegmentCount,
        now
      );
    }
    return Object.freeze({ status: "transcribing" as const, expectedSegmentCount: input.expectedSegmentCount });
  });
}

export async function cancelVoiceIntakeSession(input: {
  actor: VoiceActor;
  sessionId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const session = await lockVoiceSession(tx, input.sessionId);
    if (input.actor.role !== "CLIENT" || input.actor.id !== session.clientId) {
      throw new Error("voice_session_not_owned");
    }
    if (session.status === "cancelled") return Object.freeze({ status: "cancelled" as const });
    if (!["open", "finishing", "transcribing"].includes(session.status)) {
      throw new Error("voice_session_closed");
    }
    const changed = await tx.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET status='cancelled',"cancelledAt"=$2,"updatedAt"=$2 WHERE id=$1 AND status IN ('open','finishing','transcribing')`,
      input.sessionId,
      now
    );
    if (changed !== 1) throw new Error("voice_session_closed");
    await tx.$executeRawUnsafe(
      `UPDATE "VoiceTranscriptSegment" transcript SET text='',"purgedAt"=$2 FROM "VoiceIntakeSegment" segment WHERE transcript."segmentId"=segment.id AND segment."sessionId"=$1 AND transcript."purgedAt" IS NULL`,
      input.sessionId,
      now
    );
    return Object.freeze({ status: "cancelled" as const });
  });
}

export async function markVoiceIntakeSessionOutcome(input: {
  actor: VoiceActor;
  sessionId: string;
  outcome: "ready" | "incomplete" | "uncertain" | "failed";
  assemblyFingerprint?: `sha256:${string}`;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.outcome === "ready" &&
      !/^sha256:[a-f0-9]{64}$/.test(input.assemblyFingerprint ?? "")) {
    throw new Error("voice_transcript_incomplete");
  }
  return prisma.$transaction(async (tx) => {
    const session = await lockVoiceSession(tx, input.sessionId);
    assertVoiceSessionAccess(session, input.actor, now, ["transcribing"]);
    const changed = await tx.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET status=$2::"VoiceIntakeSessionStatus","assemblyFingerprint"=$3,"finishedAt"=CASE WHEN $2 IN ('ready','failed') THEN $4 ELSE "finishedAt" END,"updatedAt"=$4 WHERE id=$1 AND status='transcribing'`,
      input.sessionId,
      input.outcome,
      input.outcome === "ready" ? input.assemblyFingerprint : null,
      now
    );
    if (changed !== 1) throw new Error("voice_session_closed");
    return Object.freeze({
      status: input.outcome,
      assemblyFingerprint: input.outcome === "ready" ? input.assemblyFingerprint : null,
    });
  });
}
