import { performance } from "node:perf_hooks";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFingerprint as fp } from "@/server/model-gateway/evidence";
import { fingerprintVoiceGatewayProjection, voiceTranscriptOutputContractFingerprint } from "@/server/model-gateway/privacy";
import { voiceOperationKey } from "@/server/model-gateway/voice/operations";
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { voiceFixture } from "./fixtures/project-brain-voice";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), inspect: vi.fn(), auth: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/model-gateway/voice/project-brain-sessions", () => ({ inspectProjectBrainVoiceSessionInTransaction: m.inspect }));
// Real route, reader, assembly, fingerprints and private publication guard.
import { GET } from "@/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route";

const dbStart = Date.parse("2026-09-10T12:00:00.000Z"), flag = "ENDVERA_PROJECT_BRAIN_VOICE_REVIEW_ENABLED";
const input = { actorUserId: "owner-a", workspaceId: "workspace-a", sessionId: "session-a" };
const url = "https://local.example/api/endvera/v1/mobile/project-brain-intake/voice-review?workspaceId=workspace-a&sessionId=session-a";
function fixture() {
  const f = voiceFixture(), prepared = inspectProjectBrainSourceSegments(f.manifest, { enabled: true });
  if (prepared.status === "DISABLED") throw new Error("fixture");
  const manifest = prepared.manifest;
  const projection = { ...input, projectId: f.subject.projectId, intakeId: f.subject.intakeId, sourceId: f.subject.sourceId,
    sessionStatus: "transcribing", sourceBindingHash: sha256Canonical(f.subject), segmentManifestHash: prepared.manifestHash,
    languageHint: "fr" as const, sessionCostBoundMicros: "1000000", expiresAt: new Date(dbStart + 1000).toISOString(),
    segments: manifest.segments.map(s => ({ segmentId: `segment-${s.ordinal}`, ordinal: s.ordinal, status: "succeeded",
      durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: `sha256:${s.contentHash}` as const })) };
  const rows = projection.segments.map(s => {
    const metadata = manifest.segments[s.ordinal];
    const p = { operationType: "intake_voice_transcription" as const, sessionId: input.sessionId, segmentId: s.segmentId,
      ordinal: s.ordinal, languageHint: projection.languageHint, mediaFormat: metadata.mediaFormat, mimeType: metadata.mimeType,
      durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: s.audioFingerprint };
    const subject = { kind: "project_brain_voice_segment" as const, actorUserId: input.actorUserId, workspaceId: input.workspaceId,
      projectId: projection.projectId, intakeId: projection.intakeId, sourceId: projection.sourceId, sessionId: input.sessionId,
      segmentId: s.segmentId, sourceBindingHash: projection.sourceBindingHash, segmentManifestHash: projection.segmentManifestHash };
    const text = `SYNTHETIC_LOCAL — no speech was transcribed. Segment ${s.ordinal}: ${s.audioFingerprint}.`;
    const requestFingerprint = fingerprintVoiceGatewayProjection(p, subject), outputContractHash = voiceTranscriptOutputContractFingerprint(), routeHash = fp("route");
    const responseEvidenceRef = fp({ mode: "SYNTHETIC_LOCAL", audioFingerprint: s.audioFingerprint, text, costMicros: "0" });
    return { transcriptId: `text-${s.ordinal}`, segmentId: s.segmentId, sessionId: input.sessionId, ordinal: s.ordinal,
      text, textFingerprint: fp(text), characterCount: text.length, reportedAudioSeconds: s.durationMs / 1000, measuredCostMicros: 0n,
      expiresAt: new Date(projection.expiresAt), purgedAt: null, aiId: `ai-${s.ordinal}`, operationKey: voiceOperationKey(p),
      gatewayId: `gateway-${s.ordinal}`, tenantId: `construction-workspace:${input.workspaceId}`, requestFingerprint,
      outputContractHash, decisionId: `decision-${s.ordinal}`, routeHash, attemptId: `attempt-${s.ordinal}`,
      requestEvidenceRef: fp({ operationType: p.operationType, requestFingerprint, outputContractHash, routeHash }),
      responseEvidenceRef, resultEvidenceRef: responseEvidenceRef, holdId: `hold-${s.ordinal}`, amountMicros: 100000n, settledMicros: 0n };
  });
  return { rows, inspected: { projection, manifest, subject: f.subject, databaseNow: new Date(dbStart).toISOString() } };
}
let f: ReturnType<typeof fixture>, wall: number, mono: number;
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv(flag, "true"); f = fixture(); wall = dbStart; mono = 100;
  vi.spyOn(Date, "now").mockImplementation(() => wall); vi.spyOn(performance, "now").mockImplementation(() => mono);
  m.auth.mockResolvedValue({ id: input.actorUserId, role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true);
  m.inspect.mockResolvedValue(f.inspected); m.tx.mockImplementation(async work => work({ $queryRawUnsafe: m.query }));
  m.query.mockImplementation(async (sql: string) => sql.includes('SELECT x.id "transcriptId"') ? f.rows
    : sql === "SELECT clock_timestamp() AS now" ? [{ now: new Date(dbStart) }] : []);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function opaque(response: Response, status = 503) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.json()).toEqual({ error: status === 404 ? "Not found." : "Voice review is unavailable." });
}
function duringSerialization(effect: () => void) {
  const original = NextResponse.json.bind(NextResponse); let reached = 0;
  vi.spyOn(NextResponse, "json").mockImplementation((body, init) => {
    const response = original(body, init);
    if (init?.status === 200) { reached++; effect(); }
    return response;
  });
  return () => reached;
}
describe("real PB reader to GET publication — synthetic SQL/authority only", () => {
  it.each([-86400000, 86400000])("DB-relative expiry survives app wall offset %sms after JSON", async offset => {
    wall += offset; const reached = duringSerialization(() => { mono += 1000; wall += 1000; });
    const response = await GET(new Request(url)); expect(reached()).toBe(1); await opaque(response);
    expect(m.tx).toHaveBeenCalledOnce(); expect(m.inspect).toHaveBeenCalledOnce();
    expect(m.query.mock.calls.filter(([sql]) => sql === "SELECT clock_timestamp() AS now")).toHaveLength(1);
  });
  it.each([-86400000, 86400000])("valid content remains available just before DB-relative expiry with offset %sms", async offset => {
    wall += offset; const reached = duringSerialization(() => { mono += 999; wall += 999; });
    const response = await GET(new Request(url)); expect(reached()).toBe(1); expect(response.status).toBe(200);
    const body = await response.json(); expect(body.text).toBe(f.rows.map(r => r.text).join(" "));
    expect(body.expiresAt).toBe(f.inspected.projection.expiresAt); expect(body.executionAuthorized).toBe(false);
    expect(body).not.toHaveProperty("databaseNowMs"); expect(body).not.toHaveProperty("publicationDeadlineMono");
  });
  it("original request abort after real reader settlement suppresses the serialized text", async () => {
    const controller = new AbortController(), reached = duringSerialization(() => controller.abort());
    const response = await GET(new Request(url, { signal: controller.signal })); expect(reached()).toBe(1); await opaque(response);
    expect(m.tx).toHaveBeenCalledOnce();
  });
  it("switch OFF after real reader settlement suppresses text without querying a replacement result", async () => {
    const reached = duringSerialization(() => vi.stubEnv(flag, "false")); const response = await GET(new Request(url));
    expect(reached()).toBe(1); await opaque(response, 404); expect(m.tx).toHaveBeenCalledOnce();
  });
});
