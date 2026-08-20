import { describe, expect, it } from "vitest";
import { checkVoiceRegistrationBounds } from "@/server/model-gateway/voice/sessions";

const limits = {
  maxDurationMs: 600_000, maxSegmentDurationMs: 45_000, maxSegmentBytes: 2_000_000,
  maxSegments: 14, maxTotalBytes: 28_000_000,
};

describe("voice long-recording hard limits", () => {
  it("accepts exactly fourteen bounded segments totaling ten minutes", () => {
    const existing = Array.from({ length: 13 }, (_, ordinal) => ({
      ordinal, durationMs: ordinal === 0 ? 45_000 : 42_692, byteCount: 2_000_000,
    }));
    expect(checkVoiceRegistrationBounds({
      limits,
      existingSegments: existing,
      candidate: { ordinal: 13, durationMs: 42_696, byteCount: 2_000_000 },
    })).toEqual({ segmentCount: 14, capturedDurationMs: 600_000, capturedBytes: 28_000_000 });
  });

  it.each([
    ["segment duration", { ordinal: 0, durationMs: 45_001, byteCount: 1 }, "voice_segment_too_long"],
    ["segment bytes", { ordinal: 0, durationMs: 1, byteCount: 2_000_001 }, "voice_segment_too_large"],
    ["ordinal", { ordinal: 14, durationMs: 1, byteCount: 1 }, "voice_session_limit_exceeded"],
  ])("rejects %s overflow", (_name, candidate, error) => {
    expect(() => checkVoiceRegistrationBounds({ limits, existingSegments: [], candidate }))
      .toThrow(error);
  });
});
