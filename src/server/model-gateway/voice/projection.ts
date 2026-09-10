import "server-only";
import { createHash } from "node:crypto";
import {
  VOICE_LIMITS,
  isVoiceIntakeLanguage,
  isVoiceMediaFormat,
  type VoiceIntakeLanguage,
  type VoiceMediaFormat,
} from "./types";

const MIME_BY_FORMAT = Object.freeze({
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
} satisfies Record<VoiceMediaFormat, string>);

export type VoiceSegmentProjection = Readonly<{
  operationType: "intake_voice_transcription";
  sessionId: string;
  segmentId: string;
  ordinal: number;
  languageHint: VoiceIntakeLanguage;
  mediaFormat: VoiceMediaFormat;
  mimeType: string;
  durationMs: number;
  byteCount: number;
  audioFingerprint: `sha256:${string}`;
  audioBytes: Uint8Array;
}>;

export function buildVoiceSegmentProjection(input: {
  sessionId: string;
  segmentId: string;
  ordinal: number;
  languageHint: unknown;
  mediaFormat: unknown;
  mimeType: string;
  durationMs: number;
  audioBytes: Uint8Array;
}): VoiceSegmentProjection {
  if (!input.sessionId || !input.segmentId || !Number.isInteger(input.ordinal) ||
      input.ordinal < 0 || input.ordinal >= VOICE_LIMITS.maxSegments) {
    throw new Error("voice_segment_conflict");
  }
  if (!isVoiceIntakeLanguage(input.languageHint)) throw new Error("voice_language_unsupported");
  if (!isVoiceMediaFormat(input.mediaFormat)) throw new Error("voice_media_unsupported");
  const normalizedMime = input.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalizedMime !== MIME_BY_FORMAT[input.mediaFormat]) {
    throw new Error("voice_media_unsupported");
  }
  if (!(input.audioBytes instanceof Uint8Array) || input.audioBytes.byteLength === 0) {
    throw new Error("voice_segment_empty");
  }
  if (!Number.isInteger(input.durationMs) || input.durationMs <= 0) {
    throw new Error("voice_segment_empty");
  }
  if (input.durationMs > VOICE_LIMITS.maxSegmentDurationMs) {
    throw new Error("voice_segment_too_long");
  }
  if (input.audioBytes.byteLength > VOICE_LIMITS.maxSegmentBytes) {
    throw new Error("voice_segment_too_large");
  }
  // Own the exact bounded bytes being hashed. Uint8Array/Buffer/subarray inputs
  // otherwise retain a caller-writable alias even though the outer object is frozen.
  const audioBytes = new Uint8Array(input.audioBytes);

  return Object.freeze({
    operationType: "intake_voice_transcription" as const,
    sessionId: input.sessionId,
    segmentId: input.segmentId,
    ordinal: input.ordinal,
    languageHint: input.languageHint,
    mediaFormat: input.mediaFormat,
    mimeType: normalizedMime,
    durationMs: input.durationMs,
    byteCount: audioBytes.byteLength,
    audioFingerprint: `sha256:${createHash("sha256").update(audioBytes).digest("hex")}`,
    audioBytes,
  });
}

/** Copy and rehash at point of use. The returned private byte array is still mutable,
 * so call immediately before passing it to a trusted adapter, with no intervening await. */
export function copyVerifiedVoiceSegmentProjection(input: VoiceSegmentProjection): VoiceSegmentProjection {
  const copied = buildVoiceSegmentProjection(input);
  if (input.operationType !== "intake_voice_transcription" || copied.audioFingerprint !== input.audioFingerprint
    || copied.byteCount !== input.byteCount || copied.mimeType !== input.mimeType) throw new Error("voice_segment_conflict");
  return copied;
}
