import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildVoiceSegmentProjection } from "@/server/model-gateway/voice/projection";

describe("minimum voice audio projection", () => {
  it("hashes actual bytes and keeps only the bounded adapter projection", () => {
    const audioBytes = new TextEncoder().encode("synthetic-audio");
    const projection = buildVoiceSegmentProjection({
      sessionId: "session-1",
      segmentId: "segment-1",
      ordinal: 0,
      languageHint: "en",
      mediaFormat: "webm",
      mimeType: "audio/webm;codecs=opus",
      durationMs: 1_000,
      audioBytes,
    });
    expect(projection.audioFingerprint).toBe(
      `sha256:${createHash("sha256").update(audioBytes).digest("hex")}`
    );
    expect(projection.mimeType).toBe("audio/webm");
    expect(projection.byteCount).toBe(audioBytes.byteLength);
    expect(projection.audioBytes).toBe(audioBytes);
    expect(Object.keys(projection).sort()).toEqual([
      "audioBytes", "audioFingerprint", "byteCount", "durationMs", "languageHint",
      "mediaFormat", "mimeType", "operationType", "ordinal", "segmentId", "sessionId",
    ].sort());
    expect(JSON.stringify({ ...projection, audioBytes: "[redacted]" })).not.toContain("provider");
    expect(JSON.stringify({ ...projection, audioBytes: "[redacted]" })).not.toContain("filename");
  });

  it("fails closed on empty, mismatched media and hard-bound overflow", () => {
    const base = {
      sessionId: "session-1", segmentId: "segment-1", ordinal: 0,
      languageHint: "en", mediaFormat: "webm", mimeType: "audio/webm",
      durationMs: 1_000, audioBytes: new Uint8Array([1]),
    } as const;
    expect(() => buildVoiceSegmentProjection({ ...base, audioBytes: new Uint8Array() }))
      .toThrow("voice_segment_empty");
    expect(() => buildVoiceSegmentProjection({ ...base, mimeType: "audio/mpeg" }))
      .toThrow("voice_media_unsupported");
    expect(() => buildVoiceSegmentProjection({ ...base, durationMs: 45_001 }))
      .toThrow("voice_segment_too_long");
    expect(() => buildVoiceSegmentProjection({ ...base, audioBytes: new Uint8Array(2_000_001) }))
      .toThrow("voice_segment_too_large");
  });
});
