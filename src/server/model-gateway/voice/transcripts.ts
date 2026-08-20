import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { canonicalFingerprint } from "../evidence";
import { VOICE_LIMITS, type VoiceTranscriptSuccess } from "./types";
import type { VoiceActor } from "./sessions";

type AuthorizedAttempt = {
  segmentId: string;
  ordinal: number;
  clientId: string;
  sessionExpiresAt: Date;
  segmentStatus: string;
  attemptStatus: string;
  resultContractStatus: string;
  finalAttemptId: string | null;
};

type ProtectedTranscriptRow = {
  segmentId: string;
  ordinal: number;
  text: string;
  textFingerprint: `sha256:${string}`;
  purgedAt: Date | null;
};

async function authorizeAcceptedAttempt(
  tx: Prisma.TransactionClient,
  input: { actor: VoiceActor; segmentId: string; gatewayAttemptId: string; now: Date }
): Promise<AuthorizedAttempt> {
  const [row] = await tx.$queryRawUnsafe<AuthorizedAttempt[]>(
    `SELECT s.id "segmentId",s.ordinal,s.status "segmentStatus",v."clientId",v."expiresAt" "sessionExpiresAt",a.status "attemptStatus",a."resultContractStatus",g."finalAttemptId" FROM "VoiceIntakeSegment" s JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" JOIN "AiOperation" o ON o."voiceIntakeSegmentId"=s.id AND o.purpose='intake_voice_transcription' JOIN "ModelGatewayOperation" g ON g."aiOperationId"=o.id JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=g.id JOIN "ModelGatewayAttempt" a ON a."decisionId"=d.id WHERE s.id=$1 AND a.id=$2`,
    input.segmentId,
    input.gatewayAttemptId
  );
  if (!row) throw new Error("voice_transcript_unavailable");
  if (input.actor.role !== "CLIENT" || input.actor.id !== row.clientId) {
    throw new Error("voice_session_not_owned");
  }
  if (row.sessionExpiresAt.getTime() <= input.now.getTime()) throw new Error("voice_session_expired");
  if (row.segmentStatus !== "succeeded" || row.attemptStatus !== "settled" ||
      row.resultContractStatus !== "valid" || row.finalAttemptId !== input.gatewayAttemptId) {
    throw new Error("voice_transcript_unavailable");
  }
  return row;
}

export async function persistVoiceTranscriptSegment(input: {
  actor: VoiceActor;
  segmentId: string;
  gatewayAttemptId: string;
  text: string;
  reportedAudioSeconds?: number | null;
  measuredCostMicros?: bigint | null;
  now?: Date;
}): Promise<VoiceTranscriptSuccess> {
  const now = input.now ?? new Date();
  if (input.text.length < 1 || input.text.length > VOICE_LIMITS.maxTranscriptCharsPerSegment) {
    throw new Error("voice_transcript_unavailable");
  }
  const textFingerprint = canonicalFingerprint(input.text);
  return prisma.$transaction(async (tx) => {
    const authority = await authorizeAcceptedAttempt(tx, {
      actor: input.actor,
      segmentId: input.segmentId,
      gatewayAttemptId: input.gatewayAttemptId,
      now,
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO "VoiceTranscriptSegment" (id,"segmentId","gatewayAttemptId",text,"textFingerprint","characterCount","reportedAudioSeconds","measuredCostMicros","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT ("segmentId") DO NOTHING`,
      `vts_${randomUUID().replaceAll("-", "")}`,
      input.segmentId,
      input.gatewayAttemptId,
      input.text,
      textFingerprint,
      input.text.length,
      input.reportedAudioSeconds ?? null,
      input.measuredCostMicros ?? null,
      authority.sessionExpiresAt,
      now
    );
    const [row] = await tx.$queryRawUnsafe<ProtectedTranscriptRow[]>(
      `SELECT t."segmentId",s.ordinal,t.text,t."textFingerprint",t."purgedAt" FROM "VoiceTranscriptSegment" t JOIN "VoiceIntakeSegment" s ON s.id=t."segmentId" WHERE t."segmentId"=$1`,
      input.segmentId
    );
    if (!row || row.purgedAt !== null || row.textFingerprint !== textFingerprint || row.text !== input.text) {
      throw new Error("voice_segment_conflict");
    }
    return Object.freeze({
      status: "succeeded" as const,
      segmentId: row.segmentId,
      ordinal: row.ordinal,
      text: row.text,
      textFingerprint: row.textFingerprint,
    });
  });
}

export async function loadVoiceTranscriptSegment(input: {
  actor: VoiceActor;
  segmentId: string;
  now?: Date;
}): Promise<VoiceTranscriptSuccess> {
  const now = input.now ?? new Date();
  const [row] = await prisma.$queryRawUnsafe<Array<ProtectedTranscriptRow & {
    clientId: string;
    expiresAt: Date;
  }>>(
    `SELECT t."segmentId",s.ordinal,t.text,t."textFingerprint",t."purgedAt",v."clientId",v."expiresAt" FROM "VoiceTranscriptSegment" t JOIN "VoiceIntakeSegment" s ON s.id=t."segmentId" JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" WHERE t."segmentId"=$1`,
    input.segmentId
  );
  if (!row || input.actor.role !== "CLIENT" || input.actor.id !== row.clientId) {
    throw new Error("voice_session_not_owned");
  }
  if (row.expiresAt.getTime() <= now.getTime()) throw new Error("voice_session_expired");
  if (row.purgedAt !== null || row.text.length === 0) throw new Error("voice_transcript_unavailable");
  return Object.freeze({
    status: "succeeded" as const,
    segmentId: row.segmentId,
    ordinal: row.ordinal,
    text: row.text,
    textFingerprint: row.textFingerprint,
  });
}

/** Maintenance-only, bounded and idempotent content-first purge. */
export async function purgeExpiredVoiceIntakeContent(input?: {
  now?: Date;
  batchSize?: number;
}): Promise<number> {
  const now = input?.now ?? new Date();
  const batchSize = input?.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("INVALID_VOICE_PURGE_BATCH");
  }
  return prisma.$transaction(async (tx) => {
    const purged = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `WITH due AS (SELECT t.id FROM "VoiceTranscriptSegment" t JOIN "VoiceIntakeSegment" s ON s.id=t."segmentId" JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" WHERE t."purgedAt" IS NULL AND (t."expiresAt" <= $1 OR v.status IN ('cancelled','purged')) ORDER BY t."expiresAt",t.id LIMIT $2 FOR UPDATE OF t SKIP LOCKED) UPDATE "VoiceTranscriptSegment" t SET text='',"purgedAt"=$1 FROM due WHERE t.id=due.id RETURNING t.id`,
      now,
      batchSize
    );
    return purged.length;
  });
}
