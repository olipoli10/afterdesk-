import { describe, expect, it } from "vitest";
import { assembleVoiceTranscriptDraft } from "@/server/model-gateway/voice/assembly";

const segment = (ordinal: number, text: string) => ({
  ordinal,
  status: "succeeded" as const,
  audioFingerprint: `sha256:${String(ordinal).padStart(64, "a")}`,
  text,
  textFingerprint: `sha256:${String(ordinal).padStart(64, "b")}`,
  purgedAt: null,
});

describe("voice transcript assembly", () => {
  it("assembles by ordinal, independent of arrival order, without A2 or Task side effects", () => {
    const result = assembleVoiceTranscriptDraft({
      sessionId: "session-1",
      expectedSegmentCount: 3,
      segments: [segment(2, "done."), segment(0, "First"), segment(1, "part")],
    });
    expect(result.text).toBe("First part done.");
    expect(result.orderedEvidence.map((item) => item.ordinal)).toEqual([0, 1, 2]);
    expect(result.assemblyFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty("taskId");
    expect(result).not.toHaveProperty("a2Message");
  });

  it("rejects missing, duplicate, purged and oversized transcript segments", () => {
    expect(() => assembleVoiceTranscriptDraft({
      sessionId: "session-1", expectedSegmentCount: 2, segments: [segment(0, "only")],
    })).toThrow("voice_transcript_incomplete");
    expect(() => assembleVoiceTranscriptDraft({
      sessionId: "session-1", expectedSegmentCount: 2, segments: [segment(0, "a"), segment(0, "b")],
    })).toThrow("voice_transcript_incomplete");
    expect(() => assembleVoiceTranscriptDraft({
      sessionId: "session-1", expectedSegmentCount: 1,
      segments: [{ ...segment(0, "gone"), purgedAt: new Date() }],
    })).toThrow("voice_transcript_unavailable");
    expect(() => assembleVoiceTranscriptDraft({
      sessionId: "session-1", expectedSegmentCount: 7,
      segments: Array.from({ length: 7 }, (_, ordinal) => segment(ordinal, "x".repeat(20_000))),
    })).toThrow("voice_transcript_unavailable");
  });
});
