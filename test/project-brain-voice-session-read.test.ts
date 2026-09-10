import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { voiceFixture } from "./fixtures/project-brain-voice";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/construction-operating-assistant-r36v/project-brain-intake", () => ({ readProjectBrainSourceBytesInternally: vi.fn() }));
vi.mock("@/server/model-gateway/voice/project-brain-subject", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/model-gateway/voice/project-brain-subject")>();
  return { ...original, inspectProjectBrainVoiceSourceInTransaction: mocks.inspect };
});
import { readProjectBrainVoiceSession } from "@/server/model-gateway/voice/project-brain-sessions";
import { inspectProjectBrainSourceSegments, inspectStoredProjectBrainVoiceManifest } from "@/server/model-gateway/voice/source-segments";
import { VOICE_LIMITS } from "@/server/model-gateway/voice/types";
const request = { actorUserId: "owner-a", workspaceId: "workspace-a", sessionId: "session-a" };
function fixture() {
  const f = voiceFixture();
  const inspected = inspectProjectBrainSourceSegments(f.manifest, { enabled: true });
  if (inspected.status === "DISABLED") throw new Error("fixture");
  const manifest = structuredClone(inspected.manifest);
  const consent = { schemaVersion: 1, purpose: "PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC", accepted: true, externalProcessingAllowed: false,
    version: "v1", ...f.request, sourceContentHash: f.subject.sourceContentHash, acceptedAt: "2026-09-10T12:00:00.000Z",
    expiresAt: "2026-09-10T13:00:00.000Z", languageHint: "fr", maxTotalCostMicros: "1000000", retentionHours: 24 };
  const { expectedIntakeStateVersion: _unused, ...canonicalConsent } = consent;
  void _unused;
  const binding = { schemaVersion: 1, commandId: "bfb340bf-5048-49ed-a1ce-e08d3ff7b7c5", subject: f.subject,
    subjectFingerprint: sha256Canonical(f.subject), consent: canonicalConsent };
  const row = { id: "session-a", clientId: null, subjectKind: "project_brain_voice", requestedByUserId: "owner-a", workspaceId: "workspace-a",
    projectId: "project-a", intakeId: "intake-a", projectBrainSourceId: "source-a", requestCommandId: binding.commandId,
    sourceBinding: binding, sourceBindingHash: sha256Canonical(binding), segmentManifest: manifest, segmentManifestHash: sha256Canonical(manifest),
    status: "finishing", languageHint: "fr", consentVersion: "v1", consentedAt: new Date(canonicalConsent.acceptedAt), expiresAt: new Date(canonicalConsent.expiresAt),
    maxDurationMs: VOICE_LIMITS.maxSessionDurationMs, maxSegmentDurationMs: VOICE_LIMITS.maxSegmentDurationMs, maxSegmentBytes: VOICE_LIMITS.maxSegmentBytes,
    maxSegments: VOICE_LIMITS.maxSegments, maxTotalBytes: VOICE_LIMITS.maxSessionBytes, maxTotalCostMicros: 1000000n,
    expectedSegmentCount: manifest.segments.length, capturedDurationMs: manifest.totalDurationMs, capturedBytes: manifest.totalBytes };
  const segments = manifest.segments.map(segment => ({ id: `segment-${segment.ordinal}`, sessionId: row.id, ordinal: segment.ordinal, status: "registered",
    mediaFormat: segment.mediaFormat, mimeType: segment.mimeType, durationMs: segment.durationMs, byteCount: segment.byteCount,
    audioFingerprint: `sha256:${segment.contentHash}`, languageHint: "fr" }));
  return { row, segments, subject: f.subject };
}
let data: ReturnType<typeof fixture>;
let now: Date;
beforeEach(() => {
  vi.resetAllMocks(); data = fixture(); now = new Date("2026-09-10T12:00:01.000Z");
  mocks.transaction.mockImplementation(async callback => callback({ $queryRawUnsafe: mocks.query }));
  mocks.inspect.mockImplementation(async () => data.subject);
  mocks.query.mockImplementation(async (sql: string) => sql.includes('FROM "VoiceIntakeSession"') ? [data.row]
    : sql.includes('FROM "VoiceIntakeSegment"') ? data.segments : sql.includes("clock_timestamp()") ? [{ now }] : []);
});
const run = () => readProjectBrainVoiceSession(request, { enabled: true });
describe("owner Project Brain voice read-only projection", () => {
  it("OFF does not parse or read", async () => {
    expect(await readProjectBrainVoiceSession(null as never)).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("returns only frozen metadata, not media/coordinates/transcript or action authority", async () => {
    const result = await run();
    expect(result).toMatchObject({ status: "READ_ONLY_NOT_AUTHORIZED", executionAuthorized: false, transcriptionAvailable: false, mediaDecodingVerified: false,
      processingMode: "LOCAL_SYNTHETIC", costBoundIsProviderAuthorization: false, sessionStatus: "finishing" });
    expect(JSON.stringify(result)).not.toMatch(/storageKey|fileId|"text"|"bytes"|externalProcessingAllowed/);
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== "DISABLED") expect(Object.isFrozen(result.segments[0])).toBe(true);
    expect(mocks.query.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE|TRUNCATE/.test(sql))).toBe(true);
    expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('FROM "VoiceIntakeSession"'))?.slice(1)).toEqual(["owner-a", "session-a", "workspace-a"]);
  });
  it("refuses absence under the current owner/workspace joined query", async () => {
    mocks.query.mockResolvedValue([]); await expect(run()).rejects.toThrow("VOICE_PB_READ_REFUSED");
  });
  it.each(["requestedByUserId", "workspaceId", "projectId", "intakeId", "projectBrainSourceId", "id"] as const)("refuses scalar %s crossing", async key => {
    data.row[key] = "wrong"; await expect(run()).rejects.toThrow("VOICE_PB_READ_BINDING_CHANGED");
  });
  it("legacy client session cannot enter through a nullability cast", async () => {
    Object.assign(data.row, { subjectKind: "voice_intake", clientId: "owner-a" }); await expect(run()).rejects.toThrow();
  });
  it("reloads current owner/source epochs, no cached consent can replace them", async () => {
    mocks.inspect.mockResolvedValue({ ...data.subject, memberRevision: "2026-09-10T12:00:01.000Z" });
    await expect(run()).rejects.toThrow("VOICE_PB_CURRENT_AUTHORITY_CHANGED");
  });
  it("propagates source purge/revocation refusal", async () => {
    mocks.inspect.mockRejectedValue(new Error("PROJECT_BRAIN_VOICE_SOURCE_REFUSED")); await expect(run()).rejects.toThrow("SOURCE_REFUSED");
  });
  it.each(["sourceBindingHash", "segmentManifestHash"] as const)("rejects %s mutation", async key => {
    data.row[key] = "0".repeat(64); await expect(run()).rejects.toThrow();
  });
  it.each(["durationMs", "byteCount", "ordinal"] as const)("checks persisted segment %s", async key => {
    data.segments[0][key]++; await expect(run()).rejects.toThrow("VOICE_PB_READ_SEGMENTS_CHANGED");
  });
  it.each(["sessionId", "mediaFormat", "mimeType", "audioFingerprint", "languageHint"] as const)("checks persisted segment %s", async key => {
    Object.assign(data.segments[0], { [key]: "wrong" }); await expect(run()).rejects.toThrow();
  });
  it("refuses missing and additional persisted segments", async () => {
    data.segments.pop(); await expect(run()).rejects.toThrow("VOICE_PB_READ_SEGMENTS_CHANGED");
    data = fixture(); data.segments.push(data.segments[0]); await expect(run()).rejects.toThrow("VOICE_PB_READ_SEGMENTS_CHANGED");
  });
  it.each(["2026-09-10T13:00:00.000Z", "2026-09-10T11:59:59.000Z"])("uses final DB clock %s without renewing TTL", async value => {
    now = new Date(value); await expect(run()).rejects.toThrow("VOICE_PB_READ_EXPIRED");
  });
  it("does not invent transcript availability from succeeded state", async () => {
    data.row.status = "ready"; data.segments.forEach(segment => { segment.status = "succeeded"; });
    expect(await run()).toMatchObject({ sessionStatus: "ready", transcriptionAvailable: false });
  });
  it("unknown DB clock and transaction failure return no projection and do not retry", async () => {
    now = new Date(NaN); await expect(run()).rejects.toThrow("VOICE_PB_DATABASE_CLOCK_REFUSED");
    mocks.transaction.mockRejectedValueOnce(new Error("serialization")); await expect(run()).rejects.toThrow("serialization");
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("recorded metadata inspection does not fake media decoding", () => {
  it("validates the original byte-derived manifest without needing or returning bytes", () => {
    const result = inspectStoredProjectBrainVoiceManifest(data.row.segmentManifest, data.row.segmentManifestHash);
    expect(result.mediaDecodingVerified).toBe(false); expect(Object.isFrozen(result.segments)).toBe(true);
  });
  it.each(["gap", "total", "mime", "subject", "decoder", "unknown", "count"])("rejects rehashed malformed metadata %s", kind => {
    const manifest = structuredClone(data.row.segmentManifest);
    if (kind === "gap") Object.assign(manifest.segments[1], { startMs: manifest.segments[1].startMs + 1 });
    if (kind === "total") Object.assign(manifest, { totalBytes: manifest.totalBytes + 1 });
    if (kind === "mime") Object.assign(manifest.segments[0], { mimeType: "image/png" });
    if (kind === "subject") Object.assign(manifest.subject, { sourceDurationMs: manifest.subject.sourceDurationMs + 1 });
    if (kind === "decoder") Object.assign(manifest, { mediaDecodingVerified: true });
    if (kind === "unknown") Object.assign(manifest, { bytes: new Uint8Array(1) });
    if (kind === "count") Object.assign(manifest, { segments: [] });
    expect(() => inspectStoredProjectBrainVoiceManifest(manifest, sha256Canonical(manifest))).toThrow();
  });
});
