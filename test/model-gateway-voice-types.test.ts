import { describe, expect, it } from "vitest";
import {
  GATEWAY_OPERATION_TYPES,
  isGatewayOperationType,
  type GatewayOperationSubject,
} from "@/server/model-gateway/types";
import {
  VOICE_INTAKE_LANGUAGES,
  VOICE_MEDIA_FORMATS,
  VOICE_REFUSAL_CLASSES,
  VOICE_LIMITS,
  isVoiceIntakeLanguage,
  isVoiceMediaFormat,
  isVoiceRefusalClass,
} from "@/server/model-gateway/voice/types";

describe("voice intake closed-world types", () => {
  it("registers voice separately without opening other gateway operations", () => {
    expect(GATEWAY_OPERATION_TYPES).toEqual([
      "classification",
      "intake_voice_transcription",
    ]);
    expect(isGatewayOperationType("intake_voice_transcription")).toBe(true);
    expect(isGatewayOperationType("planning")).toBe(false);
    expect(isGatewayOperationType("audio")).toBe(false);
  });

  it("uses a discriminated pre-Task subject", () => {
    const subject = {
      kind: "voice_intake_segment",
      sessionId: "session_1",
      segmentId: "segment_1",
    } satisfies GatewayOperationSubject;
    expect(subject).toEqual({
      kind: "voice_intake_segment",
      sessionId: "session_1",
      segmentId: "segment_1",
    });
  });

  it("closes languages, formats and refusal vocabulary", () => {
    expect(VOICE_INTAKE_LANGUAGES).toEqual(["en", "fr", "es", "tl"]);
    expect(VOICE_MEDIA_FORMATS).toEqual([
      "webm",
      "ogg",
      "mp3",
      "wav",
      "m4a",
      "aac",
      "flac",
    ]);
    for (const value of VOICE_INTAKE_LANGUAGES) expect(isVoiceIntakeLanguage(value)).toBe(true);
    for (const value of VOICE_MEDIA_FORMATS) expect(isVoiceMediaFormat(value)).toBe(true);
    for (const value of VOICE_REFUSAL_CLASSES) expect(isVoiceRefusalClass(value)).toBe(true);
    expect(isVoiceIntakeLanguage("auto")).toBe(false);
    expect(isVoiceMediaFormat("exe")).toBe(false);
    expect(isVoiceRefusalClass("provider-picked-this")).toBe(false);
  });

  it("pins hard ceilings rather than treating configuration as unlimited", () => {
    expect(VOICE_LIMITS).toEqual({
      maxSessionDurationMs: 600_000,
      maxSegmentDurationMs: 45_000,
      maxSegmentBytes: 2_000_000,
      maxSegments: 14,
      maxSessionBytes: 28_000_000,
      maxTranscriptCharsPerSegment: 20_000,
      maxTranscriptCharsPerSession: 120_000,
      transcriptTtlHours: 24,
    });
    expect(Object.isFrozen(VOICE_LIMITS)).toBe(true);
  });
});
