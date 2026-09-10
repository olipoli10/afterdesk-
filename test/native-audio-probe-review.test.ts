import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitVoicePcmIntoWav } from "@/server/model-gateway/voice/pcm-segments";

// The native runner is read as text, never imported or executed by this suite.
const runner = readFileSync(new URL("../specs/210-personal-live-activation/probe-local-audio.ts", import.meta.url), "utf8");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("independent fixed synthetic native audio probe pre-execution review", () => {
  it("accepts exactly its fixed opt-in switch, not a caller audio path or URL", () => {
    expect(runner).toContain('process.argv.length !== 3 || process.argv[2] !== "--synthetic-local-probe"');
    expect(runner).toContain('process.platform !== "win32"');
    expect(runner).toContain('"sine=frequency=440:sample_rate=16000:duration=600"');
    expect(runner).not.toMatch(/process\.argv\[[3-9]\]/);
    expect(runner).not.toContain("process.env.INPUT");
  });
  it("pins both executable contents and does not route execution through a shell", () => {
    expect(runner).toContain("09948d4cdd0650da6ff5a87577469f2a218dc2615ae379f8f734d24c49de0f73");
    expect(runner).toContain("a6618e99bb58869ded3c6f37b53aa1a8d701c3591dbb7b5b317d47369c112be2");
    expect(runner).toContain("hash(readFileSync(pin.path)) !== pin.sha256");
    expect(runner).toContain("shell: false, windowsHide: true");
    expect(runner).not.toContain("...process.env");
    expect(runner).toContain("TEMP: scratch, TMP: scratch");
  });
  it("keeps explicit native process/output and decoder protocol bounds", () => {
    expect(runner).toContain("Date.now() + 90_000");
    expect(runner).toContain("Math.min(20_000, deadline - Date.now())");
    expect(runner).toContain("maxBuffer");
    expect(runner).toContain('"-protocol_whitelist", "file,pipe", "-enable_drefs", "0", "-use_absolute_path", "0"');
    expect(runner).toContain('"-max_alloc", "33554432"');
    expect(runner).toContain("result.error || result.signal || result.status !== 0");
  });
  it("retains exact coverage/readback failures and never adjusts the fixture to make it pass", () => {
    expect(runner).toContain("segmented.totalSamples !== 9_600_000 || segmented.segments.length !== 14");
    expect(runner).toContain("stream.duration_ts !== segment.sampleCount");
    expect(runner).toContain('throw new Error("AUDIO_REPEAT_CHANGED")');
    expect(runner).toContain('throw new Error("AUDIO_REASSEMBLY_REFUSED")');
    expect(runner).toContain('report.verdict = "REWORK"');
    expect(runner).toContain('flag: "wx"');
    expect(runner).not.toMatch(/rmSync|unlinkSync|rmdirSync/);
  });
  it("does not label locally hashed executables as publisher-authenticated or sandboxed", () => {
    expect(runner).toContain("personalAudio: false, osSandbox: false, publisherAuthenticated: false");
    expect(runner).toContain('"not ASR or source-subject authority"');
    expect(runner).toContain('"not production decoder isolation"');
  });
  it.each([1, 719999, 720000, 720001])("preserves exact little-endian sample data and sample positions for %i samples", count => {
    const samples = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++) samples.writeInt16LE((i * 137) % 65536 - 32768, i * 2);
    const immutableOriginal = Buffer.from(samples), result = splitVoicePcmIntoWav(samples);
    const reassembled = Buffer.concat(result.segments.map(segment => segment.bytes.subarray(44)));
    expect(reassembled.equals(immutableOriginal)).toBe(true);
    expect(result.decodedPcmHash).toBe(digest(samples));
    expect(result.totalSamples).toBe(count);
    let nextSample = 0;
    for (const segment of result.segments) {
      expect(segment.startSample).toBe(nextSample); nextSample = segment.endSample;
      expect(segment.bytes.readUInt32LE(28)).toBe(32000);
      expect(segment.bytes.readUInt16LE(32)).toBe(2);
      expect(segment.bytes.readUInt32LE(40)).toBe(segment.sampleCount * 2);
      expect(segment.contentHash).toBe(digest(segment.bytes));
      expect(segment.startMs * 16).toBe(segment.startSample);
      expect(segment.endMs * 16).toBe(segment.endSample);
    }
    expect(nextSample).toBe(count);
    samples.fill(0);
    expect(Buffer.concat(result.segments.map(segment => segment.bytes.subarray(44))).equals(immutableOriginal)).toBe(true);
    expect(result.sourceDerivationVerified).toBe(false); expect(result.executionAuthorized).toBe(false);
  });
  it("does not silently promote a fractional millisecond tail into the old integer-duration manifest", () => {
    const result = splitVoicePcmIntoWav(new Uint8Array((720000 + 1) * 2));
    expect(result.segments[1].sampleCount).toBe(1);
    expect(result.segments[1].durationMs).toBe(0.0625);
    expect(result.durationMs).toBe(45000.0625);
  });
  it.each([new Uint8Array(), new Uint8Array(3), new Uint8Array(19_200_002)])("refuses invalid or over-limit PCM without truncating", value => {
    expect(() => splitVoicePcmIntoWav(value)).toThrow("VOICE_PCM_SIZE_REFUSED");
  });
});
