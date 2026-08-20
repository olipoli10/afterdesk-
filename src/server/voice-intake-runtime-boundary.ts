import "server-only";

import { prisma } from "@/lib/db";
import type {
  VoiceCommandResult,
  VoiceCreateResult,
  VoiceMimeType,
  VoiceReadinessFacts,
  VoiceTranscriptResult,
} from "@/lib/voice-intake-contract";
import type { ClientPortalLang } from "@/lib/i18n/client-portal";
import { assembleVoiceTranscriptDraft } from "@/server/model-gateway/voice/assembly";
import {
  cancelVoiceIntakeSession,
  createVoiceIntakeSession,
  finishVoiceIntakeSession,
  markVoiceIntakeSessionOutcome,
  registerVoiceIntakeSegment,
  type VoiceActor,
} from "@/server/model-gateway/voice/sessions";
import type { VoiceMediaFormat } from "@/server/model-gateway/voice/types";

export type PortalVoiceRuntimeConfig = Readonly<{
  rolloutEnabled: boolean;
  operationEnabled: boolean;
  publishedPolicyAvailable: boolean;
  eligibleRouteAvailable: boolean;
  configuredSpendCeiling: boolean;
  providerAdopted: boolean;
  realProviderCertified: boolean;
  consentVersion: string;
  allowedLanguages: readonly ClientPortalLang[];
  allowedFormats: readonly VoiceMimeType[];
  maxTotalCostMicros: bigint;
}>;

const DISABLED_READINESS: VoiceReadinessFacts = Object.freeze({
  operationEnabled: false,
  publishedPolicyAvailable: false,
  eligibleRouteAvailable: false,
  configuredSpendCeiling: false,
  consentVersion: "",
  allowedLanguages: Object.freeze([]),
  allowedFormats: Object.freeze([]),
});

/**
 * Deliberately closed local integration checkpoint.
 *
 * No environment variable can silently enable this boundary. A later provider
 * certification lane must replace these exact facts in a reviewed commit and
 * must separately change the global microphone Permissions-Policy. Until then
 * every action authenticates, returns `disabled`, and performs no database or
 * adapter work.
 */
const PORTAL_VOICE_RUNTIME_CONFIG: PortalVoiceRuntimeConfig = Object.freeze({
  rolloutEnabled: false,
  operationEnabled: false,
  publishedPolicyAvailable: false,
  eligibleRouteAvailable: false,
  configuredSpendCeiling: false,
  providerAdopted: false,
  realProviderCertified: false,
  consentVersion: "",
  allowedLanguages: Object.freeze([]),
  allowedFormats: Object.freeze([]),
  maxTotalCostMicros: 0n,
});

function hasExactRuntimeAuthorization(config: PortalVoiceRuntimeConfig): boolean {
  return (
    config.rolloutEnabled === true &&
    config.operationEnabled === true &&
    config.publishedPolicyAvailable === true &&
    config.eligibleRouteAvailable === true &&
    config.configuredSpendCeiling === true &&
    config.providerAdopted === true &&
    config.realProviderCertified === true &&
    config.consentVersion.trim().length > 0 &&
    config.allowedLanguages.length > 0 &&
    config.allowedFormats.length > 0 &&
    config.maxTotalCostMicros > 0n
  );
}

export function resolveVoiceRuntimeReadiness(
  config: PortalVoiceRuntimeConfig,
): VoiceReadinessFacts {
  if (!hasExactRuntimeAuthorization(config)) return DISABLED_READINESS;
  return Object.freeze({
    operationEnabled: true,
    publishedPolicyAvailable: true,
    eligibleRouteAvailable: true,
    configuredSpendCeiling: true,
    consentVersion: config.consentVersion,
    allowedLanguages: Object.freeze([...config.allowedLanguages]),
    allowedFormats: Object.freeze([...config.allowedFormats]),
  });
}

function runtimeEnabled(): boolean {
  return hasExactRuntimeAuthorization(PORTAL_VOICE_RUNTIME_CONFIG);
}

export function getVoiceRuntimeReadiness(): VoiceReadinessFacts {
  return resolveVoiceRuntimeReadiness(PORTAL_VOICE_RUNTIME_CONFIG);
}

function mediaFormatForMime(mimeType: VoiceMimeType): VoiceMediaFormat {
  if (mimeType.startsWith("audio/webm")) return "webm";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  throw new Error("voice_media_unsupported");
}

export function validatePortalVoiceSegmentEnvelope(input: {
  format: VoiceMimeType;
  mimeType: VoiceMimeType;
  bytes: number;
  audio: ArrayBuffer;
}): boolean {
  return (
    input.format === input.mimeType &&
    Number.isInteger(input.bytes) &&
    input.bytes > 0 &&
    input.bytes === input.audio.byteLength
  );
}

export function mapVoiceRuntimeError(error: unknown): Exclude<VoiceCommandResult, { kind: "ok" }> {
  const code = error instanceof Error ? error.message : "voice_transcript_unavailable";
  if (code === "voice_disabled" || code === "voice_not_configured") return { kind: "disabled" };
  if (
    code === "voice_segment_empty" ||
    code === "voice_segment_too_long" ||
    code === "voice_segment_too_large" ||
    code === "voice_session_limit_exceeded"
  ) {
    return { kind: "limit" };
  }
  if (code === "voice_segment_conflict" || code === "voice_session_closed") {
    return { kind: "conflict" };
  }
  if (code === "voice_transcript_incomplete") return { kind: "incomplete" };
  if (code === "unknown_dispatched_outcome") {
    return { kind: "uncertain", dispatchState: "dispatched_unknown" };
  }
  if (code === "voice_language_unsupported" || code === "voice_media_unsupported") {
    return { kind: "unsupported" };
  }
  return { kind: "unavailable" };
}

export async function createPortalVoiceSession(input: {
  actor: VoiceActor;
  languageHint: ClientPortalLang;
  consentVersion: string;
  consentAccepted: true;
}): Promise<VoiceCreateResult> {
  if (!runtimeEnabled()) return { kind: "disabled" };
  if (input.consentVersion !== PORTAL_VOICE_RUNTIME_CONFIG.consentVersion) {
    return { kind: "unsupported" };
  }
  try {
    const session = await createVoiceIntakeSession({
      actor: input.actor,
      languageHint: input.languageHint,
      consentVersion: input.consentVersion,
      consentAccepted: input.consentAccepted,
      maxTotalCostMicros: PORTAL_VOICE_RUNTIME_CONFIG.maxTotalCostMicros,
    });
    return { kind: "ok", sessionId: session.id };
  } catch (error) {
    return mapVoiceRuntimeError(error);
  }
}

export async function registerPortalVoiceSegment(input: {
  actor: VoiceActor;
  sessionId: string;
  ordinal: number;
  format: VoiceMimeType;
  mimeType: VoiceMimeType;
  durationMs: number;
  bytes: number;
  audio: ArrayBuffer;
}): Promise<VoiceCommandResult> {
  if (!runtimeEnabled()) return { kind: "disabled" };
  if (!validatePortalVoiceSegmentEnvelope(input)) {
    return { kind: "conflict" };
  }
  try {
    await registerVoiceIntakeSegment({
      actor: input.actor,
      sessionId: input.sessionId,
      ordinal: input.ordinal,
      mediaFormat: mediaFormatForMime(input.mimeType),
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      audioBytes: new Uint8Array(input.audio),
    });
    return { kind: "ok" };
  } catch (error) {
    return mapVoiceRuntimeError(error);
  }
}

export async function finishPortalVoiceSession(input: {
  actor: VoiceActor;
  sessionId: string;
  expectedSegmentCount: number;
}): Promise<VoiceCommandResult> {
  if (!runtimeEnabled()) return { kind: "disabled" };
  try {
    await finishVoiceIntakeSession(input);
    return { kind: "ok" };
  } catch (error) {
    return mapVoiceRuntimeError(error);
  }
}

type TranscriptAssemblyRow = Readonly<{
  ordinal: number;
  status: string;
  audioFingerprint: string;
  text: string | null;
  textFingerprint: string | null;
  purgedAt: Date | null;
}>;

export async function assemblePortalVoiceTranscript(input: {
  actor: VoiceActor;
  sessionId: string;
}): Promise<VoiceTranscriptResult> {
  if (!runtimeEnabled()) return { kind: "disabled" };
  try {
    const [session] = await prisma.$queryRawUnsafe<
      Array<{
        clientId: string;
        status: string;
        expiresAt: Date;
        expectedSegmentCount: number | null;
      }>
    >(
      `SELECT "clientId",status::text status,"expiresAt","expectedSegmentCount" FROM "VoiceIntakeSession" WHERE id=$1`,
      input.sessionId,
    );
    if (!session || session.clientId !== input.actor.id || input.actor.role !== "CLIENT") {
      throw new Error("voice_session_not_owned");
    }
    if (session.expiresAt.getTime() <= Date.now()) throw new Error("voice_session_expired");
    if (session.status !== "transcribing" || session.expectedSegmentCount === null) {
      throw new Error("voice_transcript_incomplete");
    }
    const rows = await prisma.$queryRawUnsafe<TranscriptAssemblyRow[]>(
      `SELECT segment.ordinal,segment.status::text status,segment."audioFingerprint",transcript.text,transcript."textFingerprint",transcript."purgedAt" FROM "VoiceIntakeSegment" segment LEFT JOIN "VoiceTranscriptSegment" transcript ON transcript."segmentId"=segment.id WHERE segment."sessionId"=$1 ORDER BY segment.ordinal`,
      input.sessionId,
    );
    const draft = assembleVoiceTranscriptDraft({
      sessionId: input.sessionId,
      sessionStatus: session.status,
      expectedSegmentCount: session.expectedSegmentCount,
      segments: rows.map((row) => ({
        ordinal: row.ordinal,
        status: row.status,
        audioFingerprint: row.audioFingerprint,
        text: row.text ?? "",
        textFingerprint: row.textFingerprint ?? "",
        purgedAt: row.purgedAt,
      })),
    });
    await markVoiceIntakeSessionOutcome({
      actor: input.actor,
      sessionId: input.sessionId,
      outcome: "ready",
      assemblyFingerprint: draft.assemblyFingerprint,
    });
    return { kind: "ok", transcript: draft.text };
  } catch (error) {
    return mapVoiceRuntimeError(error);
  }
}

export async function cancelPortalVoiceSession(input: {
  actor: VoiceActor;
  sessionId: string;
}): Promise<VoiceCommandResult> {
  if (!runtimeEnabled()) return { kind: "disabled" };
  try {
    await cancelVoiceIntakeSession(input);
    return { kind: "ok" };
  } catch (error) {
    return mapVoiceRuntimeError(error);
  }
}
