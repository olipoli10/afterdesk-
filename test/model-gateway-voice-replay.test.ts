import { describe, expect, it } from "vitest";
import {
  sameVoiceSegmentRegistration,
  voiceOperationKey,
} from "@/server/model-gateway/voice/operations";

const fingerprint = `sha256:${"a".repeat(64)}`;
const registered = {
  sessionId: "session-1", ordinal: 0, mediaFormat: "webm", mimeType: "audio/webm",
  durationMs: 1_000, byteCount: 100, audioFingerprint: fingerprint, languageHint: "en",
} as const;

describe("voice replay identity", () => {
  it("uses session, segment and exact bytes, never route/provider", () => {
    expect(voiceOperationKey({ sessionId: "session-1", segmentId: "segment-1", audioFingerprint: fingerprint }))
      .toBe(`voice-intake:session-1:segment-1:${fingerprint}`);
  });

  it("converges identical registration and rejects one changed fact", () => {
    expect(sameVoiceSegmentRegistration(registered, { ...registered })).toBe(true);
    expect(sameVoiceSegmentRegistration(registered, { ...registered, durationMs: 1_001 })).toBe(false);
    expect(sameVoiceSegmentRegistration(registered, { ...registered, audioFingerprint: `sha256:${"b".repeat(64)}` })).toBe(false);
  });
});
