import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma-client";
import type { AiOperationClaim } from "@/server/ai-operations";
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

export function checkVoiceSessionSpendHeadroom(input: {
  sessionCeilingMicros: bigint;
  holds: readonly Readonly<{ status: string; amountMicros: bigint; settledMicros: bigint | null }>[];
  requestedMicros: bigint;
}) {
  if (input.sessionCeilingMicros <= 0n || input.requestedMicros < 0n) throw new Error("INVALID_VOICE_SPEND_BOUND");
  const committedMicros = input.holds.reduce((sum, hold) => {
    if (hold.status === "held") return sum + hold.amountMicros;
    if (hold.status === "settled") return sum + (hold.settledMicros ?? hold.amountMicros);
    return sum;
  }, 0n);
  const remainingMicros = input.sessionCeilingMicros > committedMicros ? input.sessionCeilingMicros - committedMicros : 0n;
  return Object.freeze({ allowed: committedMicros + input.requestedMicros <= input.sessionCeilingMicros, committedMicros, remainingMicros });
}

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

/** Internal PB ledger primitive. Caller must first validate/lock current source,
 * policy/route/breakers/budget in this SAME Serializable transaction. No dispatch. */
export async function reserveAndClaimProjectBrainVoiceOperationInTransaction(tx: Prisma.TransactionClient, provided: {
  actorUserId: string; workspaceId: string; sessionId: string; segmentId: string;
  audioFingerprint: string; now: Date; leaseUntil: Date;
}): Promise<Readonly<{ status: "claimed"; claim: AiOperationClaim }> | Readonly<{ status: "existing"; operationId: string; operationStatus: string }>> {
  const input = { ...provided };
  const operationKey = voiceOperationKey(input);
  const now = new Date(input.now.getTime()), leaseUntil = new Date(input.leaseUntil.getTime());
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(leaseUntil.getTime()) || leaseUntil.getTime() <= now.getTime()
    || leaseUntil.getTime() > now.getTime() + 60_000) throw new Error("VOICE_PB_CLAIM_DEADLINE_REFUSED");
  const existing = await tx.$queryRawUnsafe<Array<{ id: string; operationKey: string; status: string }>>(
    `SELECT ai.id,ai."operationKey",ai.status::text FROM "AiOperation" ai
     JOIN "VoiceIntakeSegment" s ON s.id=ai."voiceIntakeSegmentId" JOIN "VoiceIntakeSession" v ON v.id=s."sessionId"
     WHERE ai."voiceIntakeSegmentId"=$1 AND v."requestedByUserId"=$2 AND v."workspaceId"=$3 AND v.id=$4
       AND v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL FOR UPDATE OF ai`,
    input.segmentId, input.actorUserId, input.workspaceId, input.sessionId,
  );
  if (existing.length) {
    if (existing.length !== 1 || existing[0].operationKey !== operationKey) throw new Error("voice_segment_conflict");
    return Object.freeze({ status: "existing", operationId: existing[0].id, operationStatus: existing[0].status });
  }
  const id = `aiov_${randomUUID().replaceAll("-", "")}`, lockedBy = randomUUID();
  const inserted = await tx.$executeRawUnsafe(
    `INSERT INTO "AiOperation" (id,"voiceIntakeSegmentId",purpose,"operationKey",status,attempts,"createdAt","updatedAt")
     SELECT $1,s.id,'intake_voice_transcription',$3,'reserved',0,($4::timestamptz AT TIME ZONE 'UTC'),($4::timestamptz AT TIME ZONE 'UTC')
     FROM "VoiceIntakeSegment" s JOIN "VoiceIntakeSession" v ON v.id=s."sessionId"
     WHERE s.id=$2 AND v.id=$5 AND v."requestedByUserId"=$6 AND v."workspaceId"=$7
       AND v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL AND v.status IN ('finishing','transcribing')
       AND v."expiresAt">=($8::timestamptz AT TIME ZONE 'UTC') AND s.status='registered' AND s."audioFingerprint"=$9
     ON CONFLICT ("voiceIntakeSegmentId") DO NOTHING`, id, input.segmentId, operationKey, now, input.sessionId,
    input.actorUserId, input.workspaceId, leaseUntil, input.audioFingerprint,
  );
  if (inserted !== 1) throw new Error("VOICE_PB_CLAIM_REFUSED");
  const claimed = await tx.$executeRawUnsafe(
    `UPDATE "AiOperation" SET status='running',attempts=1,"lockedBy"=$2,"lockedAt"=($3::timestamptz AT TIME ZONE 'UTC'),
     "leaseExpiresAt"=($4::timestamptz AT TIME ZONE 'UTC'),"lastError"=NULL,"updatedAt"=($3::timestamptz AT TIME ZONE 'UTC')
     WHERE id=$1 AND "voiceIntakeSegmentId"=$5 AND "taskId" IS NULL AND "personalAssistantOperationId" IS NULL
       AND purpose='intake_voice_transcription' AND status='reserved' AND attempts=0`, id, lockedBy, now, leaseUntil, input.segmentId,
  );
  if (claimed !== 1) throw new Error("VOICE_PB_CLAIM_REFUSED");
  return Object.freeze({ status: "claimed", claim: Object.freeze({ operationId: id, operationKey, lockedBy, attempt: 1 }) });
}
