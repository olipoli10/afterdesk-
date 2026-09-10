import { describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { digest, voiceFixture } from "./fixtures/project-brain-voice";
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/server/construction-operating-assistant-r36v/project-brain-intake", () => ({ readProjectBrainSourceBytesInternally: vi.fn() }));
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";

describe("Project Brain injected segment manifest, no decoder/provider authority", () => {
  it("OFF ignores even malformed input", () => expect(inspectProjectBrainSourceSegments(null)).toEqual({ status: "DISABLED", executionAuthorized: false }));
  it.each([1, 44_999, 45_000, 45_001, 599_999, 600_000])("covers exact %i ms with existing zero-based ordinals", duration => {
    const fixture = voiceFixture(duration);
    const result = inspectProjectBrainSourceSegments(fixture.manifest, { enabled: true });
    expect(result.status).toBe("MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED");
    if (result.status !== "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED") throw new Error("unexpected");
    expect(result.manifest.totalDurationMs).toBe(duration);
    expect(result.manifest.segments).toHaveLength(Math.ceil(duration / 45_000));
    expect(result.manifest.mediaDecodingVerified).toBe(false); expect(result.executionAuthorized).toBe(false);
    expect(result.externalTransportPerformed).toBe(false);
    expect(Object.isFrozen(result.manifest.segments[0])).toBe(true); expect(Object.isFrozen(result.manifest.segments)).toBe(true);
    expect(Object.isFrozen(result.manifest.transformer)).toBe(true); expect(Object.isFrozen(result.manifest.subject)).toBe(true);
    expect(result.manifestHash).toBe(sha256Canonical(result.manifest));
    expect(result.manifest.segments[0]).not.toHaveProperty("bytes");
    fixture.manifest.segments[0].bytes.fill(0);
    expect(result.manifestHash).toBe(sha256Canonical(result.manifest));
  });
  it.each([
    ["empty", (f: ReturnType<typeof voiceFixture>) => { f.manifest.segments = []; }],
    ["missing tail", f => { f.manifest.segments.pop(); }],
    ["gap", f => { f.manifest.segments[1].startMs++; }],
    ["overlap", f => { f.manifest.segments[1].startMs--; }],
    ["wrong duration", f => { f.manifest.segments[0].durationMs--; }],
    ["fraction", f => { f.manifest.segments[0].startMs = 0.5; }],
    ["duplicate ordinal", f => { f.manifest.segments[1].ordinal = 0; }],
    ["reorder", f => { f.manifest.segments.reverse(); }],
    ["wrong mime", f => { f.manifest.segments[0].mimeType = "image/png"; }],
    ["wrong segment hash", f => { f.manifest.segments[0].contentHash = "0".repeat(64); }],
    ["wrong source bytes", f => { f.manifest.sourceBytes = Buffer.alloc(f.bytes.length); }],
    ["wrong subject fingerprint", f => { f.manifest.subjectFingerprint = "0".repeat(64); }],
    ["empty segment", f => { f.manifest.segments[0].bytes = Buffer.alloc(0); }],
    ["oversized segment", f => { f.manifest.segments[0].bytes = Buffer.alloc(2_000_001); }],
    ["real decoder claim", f => { f.manifest.transformer.mode = "EXTERNAL_PROVIDER"; }],
  ] satisfies Array<[string, (f: ReturnType<typeof voiceFixture>) => void]>)("refuses %s", (_name, mutate) => {
    const f = voiceFixture(); mutate(f); expect(() => inspectProjectBrainSourceSegments(f.manifest, { enabled: true })).toThrow();
  });
  it("refuses fifteen segments and an over-limit source", () => {
    for (const duration of [600_001, 675_000]) expect(() => inspectProjectBrainSourceSegments(voiceFixture(duration).manifest, { enabled: true })).toThrow();
  });
  it("bounds traversal before inspecting an oversized segment array", () => {
    const f = voiceFixture(); const segments = Array(15).fill(null);
    Object.defineProperty(segments, 0, { get() { throw new Error("unbounded traversal"); } });
    expect(() => inspectProjectBrainSourceSegments({ ...f.manifest, segments }, { enabled: true })).toThrow("PROJECT_BRAIN_VOICE_SEGMENT_COUNT_REFUSED");
  });
  it("enforces the source 10MiB bound even with a matching caller hash", () => {
    const f = voiceFixture(); f.manifest.sourceBytes = Buffer.alloc(10 * 1024 * 1024 + 1);
    f.manifest.subject.sourceSizeBytes = f.manifest.sourceBytes.length;
    f.manifest.subject.sourceContentHash = digest(f.manifest.sourceBytes);
    f.manifest.subjectFingerprint = sha256Canonical(f.manifest.subject);
    expect(() => inspectProjectBrainSourceSegments(f.manifest, { enabled: true })).toThrow();
  });
  it("accepts exact 2MB per segment and binds changed encoder metadata", () => {
    const f = voiceFixture(); f.manifest.segments[0].bytes = Buffer.alloc(2_000_000);
    f.manifest.segments[0].contentHash = digest(f.manifest.segments[0].bytes);
    const first = inspectProjectBrainSourceSegments(f.manifest, { enabled: true });
    f.manifest.transformer.version = "2";
    const second = inspectProjectBrainSourceSegments(f.manifest, { enabled: true });
    expect(first.status).toBe("MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED");
    if (first.status === "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED" && second.status === first.status) expect(second.manifestHash).not.toBe(first.manifestHash);
  });
  it("rejects unknown keys instead of pretending metadata is media proof", () => {
    const f = voiceFixture(); expect(() => inspectProjectBrainSourceSegments({ ...f.manifest, mediaDecodingVerified: true }, { enabled: true })).toThrow();
  });
});
