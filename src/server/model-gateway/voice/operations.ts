import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { VoiceActor } from "./sessions";

type VoiceRegistrationIdentity = Readonly<{
  sessionId: string;
  ordinal: number;
  mediaFormat: string;
  mimeType: string;
  durationMs: number;
  byteCount: number;
  audioFingerprint: string;
  languageHint: string;
}>;

export function voiceOperationKey(input: {
  sessionId: string;
  segmentId: string;
  audioFingerprint: string;
}): string {
  if (!input.sessionId || !input.segmentId || !/^sha256:[a-f0-9]{64}$/.test(input.audioFingerprint)) {
    throw new Error("voice_segment_conflict");
  }
  return `voice-intake:${input.sessionId}:${input.segmentId}:${input.audioFingerprint}`;
}

export function sameVoiceSegmentRegistration(
  left: VoiceRegistrationIdentity,
  right: VoiceRegistrationIdentity
): boolean {
  return left.sessionId === right.sessionId && left.ordinal === right.ordinal &&
    left.mediaFormat === right.mediaFormat && left.mimeType === right.mimeType &&
    left.durationMs === right.durationMs && left.byteCount === right.byteCount &&
    left.audioFingerprint === right.audioFingerprint && left.languageHint === right.languageHint;
}

export async function reserveVoiceAiOperation(input: {
  actor: VoiceActor;
  sessionId: string;
  segmentId: string;
  audioFingerprint: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const operationKey = voiceOperationKey(input);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{
      sessionId: string;
      clientId: string;
      sessionStatus: string;
      expiresAt: Date;
      audioFingerprint: string;
    }>>(
      `SELECT segment."sessionId",session."clientId",session.status "sessionStatus",session."expiresAt",segment."audioFingerprint" FROM "VoiceIntakeSegment" segment JOIN "VoiceIntakeSession" session ON session.id=segment."sessionId" WHERE segment.id=$1`,
      input.segmentId
    );
    const subject = rows[0];
    if (!subject || subject.sessionId !== input.sessionId) throw new Error("voice_segment_missing");
    if (input.actor.role !== "CLIENT" || input.actor.id !== subject.clientId) {
      throw new Error("voice_session_not_owned");
    }
    if (subject.expiresAt.getTime() <= now.getTime()) throw new Error("voice_session_expired");
    if (subject.sessionStatus !== "transcribing") throw new Error("voice_session_closed");
    if (subject.audioFingerprint !== input.audioFingerprint) throw new Error("voice_segment_conflict");
    await tx.$executeRawUnsafe(
      `INSERT INTO "AiOperation" (id,"voiceIntakeSegmentId",purpose,"operationKey",status,attempts,"createdAt","updatedAt") VALUES ($1,$2,'intake_voice_transcription',$3,'reserved',0,$4,$4) ON CONFLICT ("operationKey") DO NOTHING`,
      `aiov_${randomUUID().replaceAll("-", "")}`,
      input.segmentId,
      operationKey,
      now
    );
    const [operation] = await tx.$queryRawUnsafe<Array<{
      id: string;
      voiceIntakeSegmentId: string | null;
      operationKey: string;
      status: string;
    }>>(
      `SELECT id,"voiceIntakeSegmentId","operationKey",status FROM "AiOperation" WHERE "voiceIntakeSegmentId"=$1`,
      input.segmentId
    );
    if (!operation || operation.operationKey !== operationKey || operation.voiceIntakeSegmentId !== input.segmentId) {
      throw new Error("voice_segment_conflict");
    }
    return Object.freeze(operation);
  });
}
