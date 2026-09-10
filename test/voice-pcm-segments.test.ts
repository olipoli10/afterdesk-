import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { splitVoicePcmIntoWav } from "@/server/model-gateway/voice/pcm-segments";

describe("pure sample-preserving voice PCM segmentation", () => {
  it.each([1, 16, 719_999, 720_000, 720_001, 9_600_000])("keeps all %s samples in valid PCM WAV containers", samples => {
    const pcm = Buffer.alloc(samples * 2, 0x4a), before = Buffer.from(pcm);
    const result = splitVoicePcmIntoWav(pcm);
    expect(result.totalSamples).toBe(samples);
    expect(result.sourceDerivationVerified).toBe(false);
    expect(result.executionAuthorized).toBe(false);
    expect(result.segments).toHaveLength(Math.ceil(samples / 720_000));
    expect(Buffer.concat(result.segments.map(segment => segment.bytes.subarray(44))).equals(before)).toBe(true);
    let last = 0;
    for (const segment of result.segments) {
      expect(segment.startSample).toBe(last); last = segment.endSample;
      expect(segment.bytes.subarray(0, 4).toString()).toBe("RIFF");
      expect(segment.bytes.subarray(8, 16).toString()).toBe("WAVEfmt ");
      expect(segment.bytes.readUInt32LE(4)).toBe(segment.bytes.length - 8);
      expect(segment.bytes.readUInt16LE(20)).toBe(1);
      expect(segment.bytes.readUInt16LE(22)).toBe(1);
      expect(segment.bytes.readUInt32LE(24)).toBe(16_000);
      expect(segment.bytes.readUInt16LE(34)).toBe(16);
      expect(segment.bytes.readUInt32LE(40)).toBe(segment.sampleCount * 2);
      expect(segment.bytes.byteLength).toBeLessThanOrEqual(2_000_000);
      expect(createHash("sha256").update(segment.bytes).digest("hex")).toBe(segment.contentHash);
      expect(segment.durationMs).toBeLessThanOrEqual(45_000);
    }
    expect(last).toBe(samples);
    pcm.fill(0); expect(result.segments[0].bytes[44]).toBe(0x4a);
  });
  it("preserves fractional sample timing rather than trimming or padding", () => {
    const result = splitVoicePcmIntoWav(new Uint8Array(2));
    expect(result.durationMs).toBe(0.0625);
    expect(result.segments[0].sampleCount).toBe(1);
  });
  it.each([0, 1, 3, 19_200_002])("refuses unsupported PCM byte count %s", bytes => {
    expect(() => splitVoicePcmIntoWav(new Uint8Array(bytes))).toThrow("VOICE_PCM_SIZE_REFUSED");
  });
  it("does not treat a string as decoded bytes", () => {
    expect(() => splitVoicePcmIntoWav("http://untrusted" as unknown as Uint8Array)).toThrow("VOICE_PCM_SIZE_REFUSED");
  });
});
