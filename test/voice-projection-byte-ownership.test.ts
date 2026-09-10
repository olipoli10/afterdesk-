import { describe, expect, it } from "vitest";
import { buildVoiceSegmentProjection, copyVerifiedVoiceSegmentProjection } from "@/server/model-gateway/voice/projection";

const input = (audioBytes: Uint8Array) => ({ sessionId: "synthetic-session", segmentId: "synthetic-segment", ordinal: 0,
  languageHint: "fr", mediaFormat: "m4a", mimeType: "audio/mp4", durationMs: 1000, audioBytes });

describe("private byte ownership of a validated voice projection", () => {
  it.each([new Uint8Array([1, 2, 3]), Buffer.from([1, 2, 3]), new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4)])(
    "caller mutation cannot change already-hashed projection bytes", source => {
      const projection = buildVoiceSegmentProjection(input(source));
      const fingerprint = projection.audioFingerprint;
      source.fill(9);
      expect([...projection.audioBytes]).toEqual([1, 2, 3]);
      expect(projection.audioBytes.buffer).not.toBe(source.buffer);
      expect(projection.audioFingerprint).toBe(fingerprint);
    },
  );
  it("copies the verified projection again at point of use, without sharing admission bytes", () => {
    const admission = buildVoiceSegmentProjection(input(new Uint8Array([1, 2, 3])));
    const use = copyVerifiedVoiceSegmentProjection(admission);
    admission.audioBytes.fill(7);
    expect([...use.audioBytes]).toEqual([1, 2, 3]);
    expect(use.audioBytes.buffer).not.toBe(admission.audioBytes.buffer);
  });
  it("refuses bytes mutated through the public projection before use", () => {
    const projection = buildVoiceSegmentProjection(input(new Uint8Array([1, 2, 3])));
    projection.audioBytes.fill(7);
    expect(() => copyVerifiedVoiceSegmentProjection(projection)).toThrow("voice_segment_conflict");
  });
  it.each([{ byteCount: 2 }, { audioFingerprint: "wrong" }, { operationType: "classification" }, { mimeType: "audio/mp4;ignored=true" }])(
    "refuses changed evidence or projection identity %j", changed => {
      const projection = buildVoiceSegmentProjection(input(new Uint8Array([1, 2, 3])));
      expect(() => copyVerifiedVoiceSegmentProjection({ ...projection, ...changed } as never)).toThrow("voice_segment_conflict");
    },
  );
});
