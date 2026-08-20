import "server-only";
import { canonicalFingerprint, createGatewayAuditEvent } from "../evidence";

const VOICE_AUDIT_KEYS = new Set([
  "eventType", "correlationId", "tenantId", "sessionId", "segmentId", "ordinal",
  "audioFingerprint", "transcriptFingerprint", "byteCount", "durationMs", "characterCount",
]);
const SAFE_ID = /^[A-Za-z0-9_.:@/-]{1,240}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

export type VoiceAuditInput = Readonly<{
  eventType:
    | "voice_intake.session.created" | "voice_intake.session.finishing"
    | "voice_intake.session.cancelled" | "voice_intake.session.ready"
    | "voice_intake.session.incomplete" | "voice_intake.session.uncertain"
    | "voice_intake.session.purged" | "voice_intake.segment.registered"
    | "voice_intake.segment.replayed" | "voice_intake.segment.refused"
    | "voice_intake.segment.succeeded" | "voice_intake.segment.failed"
    | "voice_intake.segment.uncertain" | "voice_intake.transcript.purged";
  correlationId: string;
  tenantId: string;
  sessionId: string;
  segmentId?: string;
  ordinal?: number;
  audioFingerprint?: `sha256:${string}`;
  transcriptFingerprint?: `sha256:${string}`;
  byteCount?: number;
  durationMs?: number;
  characterCount?: number;
}>;

export function createVoiceAuditEvent(input: VoiceAuditInput) {
  for (const key of Object.keys(input)) {
    if (!VOICE_AUDIT_KEYS.has(key)) throw new Error("VOICE_AUDIT_CONTENT_FORBIDDEN");
  }
  for (const value of [input.correlationId, input.tenantId, input.sessionId, input.segmentId]) {
    if (value !== undefined && !SAFE_ID.test(value)) throw new Error("INVALID_VOICE_AUDIT_ID");
  }
  for (const value of [input.audioFingerprint, input.transcriptFingerprint]) {
    if (value !== undefined && !HASH.test(value)) throw new Error("INVALID_VOICE_AUDIT_HASH");
  }
  for (const value of [input.ordinal, input.byteCount, input.durationMs, input.characterCount]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error("INVALID_VOICE_AUDIT_COUNT");
    }
  }
  const evidenceRef = canonicalFingerprint({
    sessionId: input.sessionId,
    segmentId: input.segmentId ?? null,
    ordinal: input.ordinal ?? null,
    audioFingerprint: input.audioFingerprint ?? null,
    transcriptFingerprint: input.transcriptFingerprint ?? null,
    byteCount: input.byteCount ?? null,
    durationMs: input.durationMs ?? null,
    characterCount: input.characterCount ?? null,
  });
  return createGatewayAuditEvent({
    eventType: input.eventType,
    correlationId: input.correlationId,
    tenantId: input.tenantId,
    attemptId: input.segmentId ?? null,
    evidenceRef,
  });
}
