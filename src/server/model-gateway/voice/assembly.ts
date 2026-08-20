import "server-only";
import { canonicalFingerprint } from "../evidence";
import { VOICE_LIMITS } from "./types";

type AssemblySegment = Readonly<{
  ordinal: number;
  status: string;
  audioFingerprint: string;
  text: string;
  textFingerprint: string;
  purgedAt: Date | null;
}>;

export type VoiceTranscriptDraft = Readonly<{
  sessionId: string;
  text: string;
  assemblyFingerprint: `sha256:${string}`;
  orderedEvidence: readonly Readonly<{
    ordinal: number;
    audioFingerprint: string;
    textFingerprint: string;
  }>[];
}>;

function joinTranscriptParts(parts: readonly string[]): string {
  let result = "";
  for (const part of parts) {
    if (result.length > 0 && !/\s$/u.test(result) && !/^\s/u.test(part)) result += " ";
    result += part;
  }
  return result;
}

export function assembleVoiceTranscriptDraft(input: {
  sessionId: string;
  sessionStatus?: string;
  expectedSegmentCount: number;
  segments: readonly AssemblySegment[];
}): VoiceTranscriptDraft {
  if (input.sessionStatus !== undefined && input.sessionStatus !== "transcribing") {
    throw new Error("voice_session_closed");
  }
  if (!input.sessionId || !Number.isInteger(input.expectedSegmentCount) ||
      input.expectedSegmentCount < 1 || input.expectedSegmentCount > VOICE_LIMITS.maxSegments ||
      input.segments.length !== input.expectedSegmentCount) {
    throw new Error("voice_transcript_incomplete");
  }
  const ordered = [...input.segments].sort((left, right) => left.ordinal - right.ordinal);
  for (let ordinal = 0; ordinal < ordered.length; ordinal += 1) {
    const segment = ordered[ordinal];
    if (!segment || segment.ordinal !== ordinal || segment.status !== "succeeded") {
      throw new Error("voice_transcript_incomplete");
    }
    if (segment.purgedAt !== null || segment.text.length === 0 ||
        segment.text.length > VOICE_LIMITS.maxTranscriptCharsPerSegment) {
      throw new Error("voice_transcript_unavailable");
    }
  }
  const text = joinTranscriptParts(ordered.map((segment) => segment.text));
  if (text.length > VOICE_LIMITS.maxTranscriptCharsPerSession) {
    throw new Error("voice_transcript_unavailable");
  }
  const orderedEvidence = Object.freeze(ordered.map((segment) => Object.freeze({
    ordinal: segment.ordinal,
    audioFingerprint: segment.audioFingerprint,
    textFingerprint: segment.textFingerprint,
  })));
  return Object.freeze({
    sessionId: input.sessionId,
    text,
    assemblyFingerprint: canonicalFingerprint({ sessionId: input.sessionId, orderedEvidence }),
    orderedEvidence,
  });
}
