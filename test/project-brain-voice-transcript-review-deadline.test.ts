import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFingerprint as fp } from "@/server/model-gateway/evidence";
import { fingerprintVoiceGatewayProjection, voiceTranscriptOutputContractFingerprint } from "@/server/model-gateway/privacy";
import { voiceOperationKey } from "@/server/model-gateway/voice/operations";
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { voiceFixture } from "./fixtures/project-brain-voice";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/model-gateway/voice/project-brain-sessions", () => ({ inspectProjectBrainVoiceSessionInTransaction: m.inspect }));
import { assertProjectBrainVoiceTranscriptReviewPublication as assertPublication, readProjectBrainVoiceTranscriptReview } from "@/server/model-gateway/voice/project-brain-transcript-review";
type OriginalContext = { deadlineAt: number; monotoneDeadlineAt: number; signal?: AbortSignal };
// This signature was used to execute the original reader's new-context REDs;
// the actual reader is never mocked.
const read = readProjectBrainVoiceTranscriptReview as (input: { actorUserId: string; workspaceId: string; sessionId: string }, options: { enabled?: boolean }, context?: OriginalContext) => ReturnType<typeof readProjectBrainVoiceTranscriptReview>;
const input = { actorUserId: "owner-a", workspaceId: "workspace-a", sessionId: "session-a" }, start = Date.parse("2026-09-10T12:00:00.000Z");
function fixture() {
  const f = voiceFixture(), manifest = inspectProjectBrainSourceSegments(f.manifest, { enabled: true }); if (manifest.status === "DISABLED") throw new Error("fixture");
  const projection = { ...input, projectId: f.subject.projectId, intakeId: f.subject.intakeId, sourceId: f.subject.sourceId, sessionStatus: "transcribing",
    sourceBindingHash: sha256Canonical(f.subject), segmentManifestHash: manifest.manifestHash, languageHint: "fr" as const, sessionCostBoundMicros: "1000000", expiresAt: new Date(start + 60000).toISOString(),
    segments: manifest.manifest.segments.map(s => ({ segmentId: `segment-${s.ordinal}`, ordinal: s.ordinal, status: "succeeded", durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: `sha256:${s.contentHash}` as const })) };
  const rows = projection.segments.map(s => {
    const metadata = manifest.manifest.segments[s.ordinal], p = { operationType: "intake_voice_transcription" as const, sessionId: input.sessionId, segmentId: s.segmentId,
      ordinal: s.ordinal, languageHint: projection.languageHint, mediaFormat: metadata.mediaFormat, mimeType: metadata.mimeType, durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: s.audioFingerprint };
    const subject = { kind: "project_brain_voice_segment" as const, actorUserId: input.actorUserId, workspaceId: input.workspaceId, projectId: projection.projectId, intakeId: projection.intakeId,
      sourceId: projection.sourceId, sessionId: input.sessionId, segmentId: s.segmentId, sourceBindingHash: projection.sourceBindingHash, segmentManifestHash: projection.segmentManifestHash };
    const text = `SYNTHETIC_LOCAL — no speech was transcribed. Segment ${s.ordinal}: ${s.audioFingerprint}.`, requestFingerprint = fingerprintVoiceGatewayProjection(p, subject), outputContractHash = voiceTranscriptOutputContractFingerprint(), routeHash = fp("route");
    const responseEvidenceRef = fp({ mode: "SYNTHETIC_LOCAL", audioFingerprint: s.audioFingerprint, text, costMicros: "0" });
    return { transcriptId: `text-${s.ordinal}`, segmentId: s.segmentId, sessionId: input.sessionId, ordinal: s.ordinal, text, textFingerprint: fp(text), characterCount: text.length,
      reportedAudioSeconds: s.durationMs / 1000, measuredCostMicros: 0n, expiresAt: new Date(projection.expiresAt), purgedAt: null, aiId: `ai-${s.ordinal}`, operationKey: voiceOperationKey(p),
      gatewayId: `gateway-${s.ordinal}`, tenantId: `construction-workspace:${input.workspaceId}`, requestFingerprint, outputContractHash, decisionId: `decision-${s.ordinal}`, routeHash,
      attemptId: `attempt-${s.ordinal}`, requestEvidenceRef: fp({ operationType: p.operationType, requestFingerprint, outputContractHash, routeHash }), responseEvidenceRef,
      resultEvidenceRef: responseEvidenceRef, holdId: `hold-${s.ordinal}`, amountMicros: 100000n, settledMicros: 0n };
  });
  return { rows, inspected: { projection, manifest: manifest.manifest, subject: f.subject, databaseNow: new Date(start).toISOString() } };
}
let f: ReturnType<typeof fixture>, dbNow: Date;
const context = (signal?: AbortSignal) => ({ deadlineAt: start + 10000, monotoneDeadlineAt: 11000, signal });
beforeEach(() => { vi.resetAllMocks(); f = fixture(); dbNow = new Date(start + 1000); vi.spyOn(Date, "now").mockReturnValue(start); vi.spyOn(performance, "now").mockReturnValue(1000);
  m.inspect.mockImplementation(async () => f.inspected); m.tx.mockImplementation(async work => work({ $queryRawUnsafe: m.query }));
  m.query.mockImplementation(async (sql: string) => sql.includes('SELECT x.id "transcriptId"') ? f.rows : sql === "SELECT clock_timestamp() AS now" ? [{ now: dbNow }] : []);
});
afterEach(() => vi.restoreAllMocks());
describe("protected transcript original deadline and post-commit expiry", () => {
  it("positive unchanged producer result remains available", async () => { const value = await read(input, { enabled: true }, context()); expect(value.status).toBe("SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED"); expect(m.tx).toHaveBeenCalledOnce(); });
  it("refuses transcript expiry during successful transaction settlement", async () => {
    f.inspected.projection.expiresAt = new Date(start + 1500).toISOString(); f.rows.forEach(row => { row.expiresAt = new Date(start + 1500); });
    m.tx.mockImplementation(async work => { const value = await work({ $queryRawUnsafe: m.query }); vi.mocked(performance.now).mockReturnValue(1500); return value; });
    await expect(read(input, { enabled: true }, context())).rejects.toThrow("REVIEW_REFUSED");
  });
  it("refuses abort while commit settles", async () => { const ac = new AbortController(); m.tx.mockImplementation(async work => { const value = await work({ $queryRawUnsafe: m.query }); ac.abort(); return value; });
    await expect(read(input, { enabled: true }, context(ac.signal))).rejects.toThrow("REVIEW_REFUSED"); });
  it("refuses expired original caller budget before DB work", async () => { await expect(read(input, { enabled: true }, { deadlineAt: start, monotoneDeadlineAt: 1000 })).rejects.toThrow("REVIEW_REFUSED"); expect(m.tx).not.toHaveBeenCalled(); });
  it("does not let mutable original context replace the signal or extend the budget", async () => {
    const ac = new AbortController(), original = context(ac.signal);
    m.tx.mockImplementation(async work => { original.signal = new AbortController().signal; original.deadlineAt += 60000; original.monotoneDeadlineAt += 60000;
      const value = await work({ $queryRawUnsafe: m.query }); ac.abort(); return value; });
    await expect(read(input, { enabled: true }, original)).rejects.toThrow("REVIEW_REFUSED");
  });
  it("default local budget includes commit and never exceeds7s", async () => { m.tx.mockImplementation(async work => { const value = await work({ $queryRawUnsafe: m.query }); vi.mocked(performance.now).mockReturnValue(8000); return value; });
    await expect(read(input, { enabled: true })).rejects.toThrow("REVIEW_REFUSED"); });
  it("wall clock rollback refuses protected text", async () => { m.tx.mockImplementation(async work => { const value = await work({ $queryRawUnsafe: m.query }); vi.mocked(Date.now).mockReturnValue(start - 1); return value; });
    await expect(read(input, { enabled: true }, context())).rejects.toThrow("REVIEW_REFUSED"); });
  it("commit failure is still not retried or converted into content", async () => { m.tx.mockImplementation(async work => { await work({ $queryRawUnsafe: m.query }); throw new Error("COMMIT_UNKNOWN"); });
    await expect(read(input, { enabled: true }, context())).rejects.toThrow("COMMIT_UNKNOWN"); expect(m.tx).toHaveBeenCalledOnce(); });
  it("OFF does not inspect malformed context or query DB", async () => {
    const bad = Object.defineProperty({}, "deadlineAt", { get() { throw new Error("must not read"); } });
    expect(await read(input, {}, bad as OriginalContext)).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(m.tx).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -Infinity])("invalid caller wall deadline %s refuses before DB", async deadlineAt => {
    await expect(read(input, { enabled: true }, { ...context(), deadlineAt })).rejects.toThrow("REVIEW_REFUSED"); expect(m.tx).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, 1000])("invalid/expired caller monotone deadline %s refuses before DB", async monotoneDeadlineAt => {
    await expect(read(input, { enabled: true }, { ...context(), monotoneDeadlineAt })).rejects.toThrow("REVIEW_REFUSED"); expect(m.tx).not.toHaveBeenCalled();
  });
  it("an already aborted original signal prevents transaction admission", async () => {
    const ac = new AbortController(); ac.abort(); await expect(read(input, { enabled: true }, context(ac.signal))).rejects.toThrow("REVIEW_REFUSED"); expect(m.tx).not.toHaveBeenCalled();
  });
  it("does not renew a caller budget with only100ms remaining", async () => {
    await read(input, { enabled: true }, { deadlineAt: start + 100, monotoneDeadlineAt: 1100 });
    const options = m.tx.mock.calls[0][1]; expect(options.timeout + options.maxWait).toBeLessThanOrEqual(100);
    expect(options.timeout).toBeGreaterThan(0); expect(options.maxWait).toBeGreaterThan(0);
    expect(m.query.mock.calls[0]).toEqual(["SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", "100", "100"]);
  });
  it("default unconsumed local budget retains existing maximum transaction options", async () => {
    await read(input, { enabled: true }); expect(m.tx.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", timeout: 5000, maxWait: 2000 });
  });
  it("queue latency consumes the original budget before any SQL", async () => {
    m.tx.mockImplementation(async work => { vi.mocked(performance.now).mockReturnValue(1100); return work({ $queryRawUnsafe: m.query }); });
    await expect(read(input, { enabled: true }, { deadlineAt: start + 100, monotoneDeadlineAt: 1100 })).rejects.toThrow("REVIEW_REFUSED"); expect(m.query).not.toHaveBeenCalled();
  });
  it.each(["config", "lock", "inspector", "rows", "clock"])("abort during %s await stops disclosure", async stage => {
    const ac = new AbortController();
    m.inspect.mockImplementation(async () => { if (stage === "inspector") ac.abort(); return f.inspected; });
    m.query.mockImplementation(async (sql: string) => {
      if ((stage === "config" && sql.includes("set_config")) || (stage === "lock" && sql.includes("advisory"))
        || (stage === "rows" && sql.includes("SELECT x.id")) || (stage === "clock" && sql === "SELECT clock_timestamp() AS now")) ac.abort();
      return sql.includes("SELECT x.id") ? f.rows : sql === "SELECT clock_timestamp() AS now" ? [{ now: dbNow }] : [];
    });
    await expect(read(input, { enabled: true }, context(ac.signal))).rejects.toThrow("REVIEW_REFUSED");
  });
  it("final clock query latency is charged conservatively before commit", async () => {
    f.inspected.projection.expiresAt = new Date(start + 1500).toISOString(); f.rows.forEach(row => { row.expiresAt = new Date(start + 1500); });
    m.query.mockImplementation(async (sql: string) => {
      if (sql === "SELECT clock_timestamp() AS now") { vi.mocked(performance.now).mockReturnValue(1500); return [{ now: dbNow }]; }
      return sql.includes("SELECT x.id") ? f.rows : [];
    });
    await expect(read(input, { enabled: true }, context())).rejects.toThrow("REVIEW_REFUSED");
  });
  it("short settlement below both budgets preserves identical public fingerprint and fields", async () => {
    const baseline = await read(input, { enabled: true }, context());
    m.tx.mockImplementation(async work => { const value = await work({ $queryRawUnsafe: m.query }); vi.mocked(performance.now).mockReturnValue(1100); return value; });
    expect(await read(input, { enabled: true }, context())).toEqual(baseline);
    expect(Object.keys(baseline)).not.toContain("databaseNowMs"); expect(Object.keys(baseline)).not.toContain("clockStartedMono");
  });
  it("mutable context cannot extend an original short deadline without signal", async () => {
    const original = { deadlineAt: start + 100, monotoneDeadlineAt: 1100 };
    m.tx.mockImplementation(async work => { original.deadlineAt += 60000; original.monotoneDeadlineAt += 60000; const value = await work({ $queryRawUnsafe: m.query }); vi.mocked(performance.now).mockReturnValue(1100); return value; });
    await expect(read(input, { enabled: true }, original)).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["wall", "mono"])("refuses %s rollback from last observed clock, not just entry", async clock => {
    m.inspect.mockImplementation(async () => { if (clock === "wall") vi.mocked(Date.now).mockReturnValue(start + 200); else vi.mocked(performance.now).mockReturnValue(1200); return f.inspected; });
    m.tx.mockImplementation(async work => { const value = await work({ $queryRawUnsafe: m.query }); if (clock === "wall") vi.mocked(Date.now).mockReturnValue(start + 100); else vi.mocked(performance.now).mockReturnValue(1100); return value; });
    await expect(read(input, { enabled: true }, context())).rejects.toThrow("REVIEW_REFUSED");
  });
  it("publication guard accepts only the actual committed immutable identity without changing JSON", async () => {
    const value = await read(input, { enabled: true }, context()), json = JSON.stringify(value);
    expect(() => assertPublication(value)).not.toThrow(); expect(JSON.stringify(value)).toBe(json); expect(Object.isFrozen(value)).toBe(true);
    expect(() => assertPublication({ ...value })).toThrow("REVIEW_REFUSED"); expect(() => assertPublication(JSON.parse(json))).toThrow("REVIEW_REFUSED");
    expect(m.tx).toHaveBeenCalledOnce();
  });
  it.each([null, undefined, 1, "text", {}, { status: "DISABLED", executionAuthorized: false }])("unregistered publication refuses %s", value => {
    expect(() => assertPublication(value)).toThrow("REVIEW_REFUSED"); expect(m.tx).not.toHaveBeenCalled();
  });
  it("publication continues enforcing DB-relative expiry after reader return without app/DB wall alignment", async () => {
    vi.mocked(Date.now).mockReturnValue(start - 86400000);
    f.inspected.projection.expiresAt = new Date(start + 1500).toISOString(); f.rows.forEach(row => { row.expiresAt = new Date(start + 1500); });
    const value = await read(input, { enabled: true }); expect(() => assertPublication(value)).not.toThrow();
    vi.mocked(performance.now).mockReturnValue(1500); expect(() => assertPublication(value)).toThrow("REVIEW_REFUSED");
  });
  it("publication keeps original signal after result leaves reader", async () => {
    const ac = new AbortController(), original = context(ac.signal), value = await read(input, { enabled: true }, original);
    original.signal = new AbortController().signal; ac.abort(); expect(() => assertPublication(value)).toThrow("REVIEW_REFUSED");
  });
  it("publication keeps original caller budget and cannot renew it on repeated assertions", async () => {
    const value = await read(input, { enabled: true }, { deadlineAt: start + 200, monotoneDeadlineAt: 1200 });
    vi.mocked(performance.now).mockReturnValue(1199); expect(() => assertPublication(value)).not.toThrow();
    vi.mocked(performance.now).mockReturnValue(1200); expect(() => assertPublication(value)).toThrow("REVIEW_REFUSED");
  });
  it("a provisional callback result from failed commit is never registered for publication", async () => {
    let provisional: unknown;
    m.tx.mockImplementation(async work => { provisional = (await work({ $queryRawUnsafe: m.query })).result; throw new Error("COMMIT_UNKNOWN"); });
    await expect(read(input, { enabled: true }, context())).rejects.toThrow("COMMIT_UNKNOWN");
    expect(() => assertPublication(provisional)).toThrow("REVIEW_REFUSED");
  });
});
