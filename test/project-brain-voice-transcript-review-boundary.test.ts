import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFingerprint as fp } from "@/server/model-gateway/evidence";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { fingerprintVoiceGatewayProjection, voiceTranscriptOutputContractFingerprint } from "@/server/model-gateway/privacy";
import { voiceOperationKey } from "@/server/model-gateway/voice/operations";
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";
import { voiceFixture } from "./fixtures/project-brain-voice";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/model-gateway/voice/project-brain-sessions", () => ({ inspectProjectBrainVoiceSessionInTransaction: m.inspect }));
import { readProjectBrainVoiceTranscriptReview as read } from "@/server/model-gateway/voice/project-brain-transcript-review";
const input = { actorUserId: "owner-a", workspaceId: "workspace-a", sessionId: "session-a" };
function fixture() {
  const f = voiceFixture(), parsed = inspectProjectBrainSourceSegments(f.manifest, { enabled: true });
  if (parsed.status === "DISABLED") throw new Error("fixture");
  const manifest = parsed.manifest;
  const projection = { sessionId: input.sessionId, workspaceId: input.workspaceId, projectId: f.subject.projectId, intakeId: f.subject.intakeId,
    sourceId: f.subject.sourceId, sessionStatus: "transcribing", sourceBindingHash: sha256Canonical(f.subject), segmentManifestHash: parsed.manifestHash,
    languageHint: "fr" as const, sessionCostBoundMicros: "1000000", expiresAt: "2026-09-10T13:00:00.000Z",
    segments: manifest.segments.map(s => ({ segmentId: `segment-${s.ordinal}`, status: "succeeded", ordinal: s.ordinal, durationMs: s.durationMs,
      byteCount: s.byteCount, audioFingerprint: `sha256:${s.contentHash}` as const })) };
  const rows = projection.segments.map(s => {
    const metadata = manifest.segments[s.ordinal], p = { operationType: "intake_voice_transcription" as const, sessionId: projection.sessionId,
      segmentId: s.segmentId, ordinal: s.ordinal, languageHint: projection.languageHint, mediaFormat: metadata.mediaFormat, mimeType: metadata.mimeType,
      durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: s.audioFingerprint };
    const subject = { kind: "project_brain_voice_segment" as const, actorUserId: input.actorUserId, workspaceId: input.workspaceId,
      projectId: projection.projectId, intakeId: projection.intakeId, sourceId: projection.sourceId, sessionId: projection.sessionId,
      segmentId: s.segmentId, sourceBindingHash: projection.sourceBindingHash, segmentManifestHash: projection.segmentManifestHash };
    const text = `SYNTHETIC_LOCAL — no speech was transcribed. Segment ${s.ordinal}: ${s.audioFingerprint}.`, routeHash = fp("review-route");
    const requestFingerprint = fingerprintVoiceGatewayProjection(p, subject), outputContractHash = voiceTranscriptOutputContractFingerprint();
    const responseEvidenceRef = fp({ mode: "SYNTHETIC_LOCAL", audioFingerprint: s.audioFingerprint, text, costMicros: "0" });
    return { transcriptId: `transcript-${s.ordinal}`, segmentId: s.segmentId, sessionId: input.sessionId, ordinal: s.ordinal, text,
      textFingerprint: fp(text), characterCount: text.length, reportedAudioSeconds: s.durationMs / 1000, measuredCostMicros: 0n,
      expiresAt: new Date(projection.expiresAt), purgedAt: null, aiId: `ai-${s.ordinal}`, operationKey: voiceOperationKey(p), gatewayId: `gateway-${s.ordinal}`,
      tenantId: `construction-workspace:${input.workspaceId}`, requestFingerprint, outputContractHash, decisionId: `decision-${s.ordinal}`,
      routeHash, attemptId: `attempt-${s.ordinal}`, requestEvidenceRef: fp({ operationType: p.operationType, requestFingerprint, outputContractHash, routeHash }),
      responseEvidenceRef, resultEvidenceRef: responseEvidenceRef, holdId: `hold-${s.ordinal}`, amountMicros: 100000n, settledMicros: 0n };
  });
  return { inspected: { projection, manifest, subject: f.subject, databaseNow: "2026-09-10T12:00:00.000Z" }, rows };
}
let f: ReturnType<typeof fixture>;
const run = () => read(input, { enabled: true });
beforeEach(() => { vi.resetAllMocks(); f = fixture(); m.inspect.mockImplementation(async () => f.inspected);
  m.tx.mockImplementation(async work => work({ $queryRawUnsafe: m.query }));
  m.query.mockImplementation(async (sql: string) => sql.includes('SELECT x.id "transcriptId"') ? f.rows
    : sql === "SELECT clock_timestamp() AS now" ? [{ now: new Date("2026-09-10T12:00:01.000Z") }] : []);
});
describe("independent protected synthetic transcript boundaries; no native DB", () => {
  it("queryRaw must not expose PostgreSQL void from the shared advisory lock to Prisma", async () => {
    await run();
    const call = m.query.mock.calls.find(([sql]) => sql.includes("pg_advisory_xact_lock_shared"));
    expect(call?.[0]).toContain("pg_advisory_xact_lock_shared(hashtext($1))::text");
  });
  it("SQL quoted references name actual scalar columns, not virtual Prisma relations", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8"), source = readFileSync("src/server/model-gateway/voice/project-brain-transcript-review.ts", "utf8");
    const scalar = new Set(["String", "Int", "Float", "Decimal", "Boolean", "BigInt", "DateTime", "Json", "Bytes", ...[...schema.matchAll(/^enum (\w+)\s*\{/gm)].map(x => x[1])]);
    const aliases = { v: "VoiceIntakeSession", s: "VoiceIntakeSegment", ai: "AiOperation", o: "ModelGatewayOperation", d: "ModelGatewayDecision",
      p: "ModelGatewayPolicyVersion", r: "ModelGatewayRouteProfile", t: "ModelGatewayAttempt", x: "VoiceTranscriptSegment", h: "AccountProviderSpendHold", u: "AiUsage" };
    const missing: string[] = [];
    for (const [alias, model] of Object.entries(aliases)) {
      const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(schema)?.[1]; expect(block, model).toBeDefined();
      const columns = new Set([...block!.matchAll(/^\s{2}(\w+)\s+(\w+)(?:\[\])?\??([^\r\n]*)/gm)].filter(x => scalar.has(x[2]))
        .map(x => /@map\("([^"\n]+)"\)/.exec(x[3])?.[1] ?? x[1]));
      for (const match of source.matchAll(new RegExp(`\\b${alias}\\."([^"]+)"`, "g"))) if (!columns.has(match[1])) missing.push(`${model}.${match[1]}`);
    }
    expect([...new Set(missing)]).toEqual([]);
  });
  it("private output snapshots cannot be changed through prior row references during final awaited clock", async () => {
    const expectedText = f.rows.map(row => row.text).join(" "), expectedId = f.rows[0].transcriptId;
    const original = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string) => { if (sql === "SELECT clock_timestamp() AS now") {
      f.rows[0].text = "changed after assembly"; f.rows[0].transcriptId = "other"; f.rows[0].expiresAt.setUTCFullYear(2099);
    } return original(sql); });
    const result = await run(); if (result.status === "DISABLED") throw new Error("fixture");
    expect(result.text).toBe(expectedText); expect(result.orderedEvidence[0].transcriptId).toBe(expectedId);
    expect(result.expiresAt).toBe("2026-09-10T13:00:00.000Z"); expect(result.textFingerprint).toBe(fp(expectedText));
  });
  it.each(["120", null, NaN, Infinity])("does not coerce unknown SQL duration %s into accepted usage", async value => {
    Object.assign(f.rows[0], { reportedAudioSeconds: value }); await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("refuses unknown raw result fields instead of returning an accidental storage coordinate", async () => {
    Object.assign(f.rows[0], { storageKey: "synthetic-private-coordinate" }); await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("a hold larger than the original session ceiling cannot certify a local result", async () => {
    f.rows[0].amountMicros = BigInt(f.inspected.projection.sessionCostBoundMicros) + 1n; await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("a final clock failure discloses no provisional text and makes no second transaction", async () => {
    const original = m.query.getMockImplementation()!; m.query.mockImplementation(async (sql: string) => {
      if (sql === "SELECT clock_timestamp() AS now") throw new Error("synthetic clock unavailable"); return original(sql);
    });
    await expect(run()).rejects.toThrow("synthetic clock unavailable"); expect(m.tx).toHaveBeenCalledOnce();
  });
  it("nonliteral truthy enabled stays OFF without parsing actor or reading database", async () => {
    expect(await read(null as never, { enabled: 1 as never })).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(m.tx).not.toHaveBeenCalled();
  });
});
