import "server-only";

export const VOICE_INTAKE_LANGUAGES = ["en", "fr", "es", "tl"] as const;
export type VoiceIntakeLanguage = (typeof VOICE_INTAKE_LANGUAGES)[number];

export const VOICE_MEDIA_FORMATS = [
  "webm",
  "ogg",
  "mp3",
  "wav",
  "m4a",
  "aac",
  "flac",
] as const;
export type VoiceMediaFormat = (typeof VOICE_MEDIA_FORMATS)[number];

export const VOICE_REFUSAL_CLASSES = [
  "voice_disabled",
  "voice_not_configured",
  "voice_session_not_found",
  "voice_session_not_owned",
  "voice_consent_missing",
  "voice_session_expired",
  "voice_session_closed",
  "voice_language_unsupported",
  "voice_media_unsupported",
  "voice_segment_empty",
  "voice_segment_too_long",
  "voice_segment_too_large",
  "voice_session_limit_exceeded",
  "voice_segment_conflict",
  "voice_segment_missing",
  "voice_transcript_incomplete",
  "voice_transcript_unavailable",
] as const;
export type VoiceRefusalClass = (typeof VOICE_REFUSAL_CLASSES)[number];

export const VOICE_LIMITS = Object.freeze({
  maxSessionDurationMs: 600_000,
  maxSegmentDurationMs: 45_000,
  maxSegmentBytes: 2_000_000,
  maxSegments: 14,
  maxSessionBytes: 28_000_000,
  maxTranscriptCharsPerSegment: 20_000,
  maxTranscriptCharsPerSession: 120_000,
  transcriptTtlHours: 24,
} as const);

export type VoiceTranscriptSuccess = Readonly<{
  status: "succeeded";
  segmentId: string;
  ordinal: number;
  text: string;
  textFingerprint: `sha256:${string}`;
}>;

export type VoiceTranscriptResult =
  | VoiceTranscriptSuccess
  | Readonly<{ status: "replayed"; value: VoiceTranscriptSuccess }>
  | Readonly<{ status: "failed"; errorClass: string }>
  | Readonly<{ status: "uncertain"; errorClass: "unknown_dispatched_outcome" }>
  | Readonly<{ status: "refused"; refusalClass: VoiceRefusalClass }>;

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export const isVoiceIntakeLanguage = (value: unknown): value is VoiceIntakeLanguage =>
  includes(VOICE_INTAKE_LANGUAGES, value);
export const isVoiceMediaFormat = (value: unknown): value is VoiceMediaFormat =>
  includes(VOICE_MEDIA_FORMATS, value);
export const isVoiceRefusalClass = (value: unknown): value is VoiceRefusalClass =>
  includes(VOICE_REFUSAL_CLASSES, value);
