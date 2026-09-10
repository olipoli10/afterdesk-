import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { buildVoiceGatewayRequest, fingerprintVoiceGatewayProjection, voiceTranscriptOutputContractFingerprint } from "@/server/model-gateway/privacy";
import { isGatewayDataClass } from "@/server/model-gateway/types";
import { voiceOperationKey } from "@/server/model-gateway/voice/operations";
import { inspectProjectBrainSourceSegments } from "@/server/model-gateway/voice/source-segments";
import { voiceFixture } from "./fixtures/project-brain-voice";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/model-gateway/voice/project-brain-sessions", () => ({ inspectProjectBrainVoiceSessionInTransaction: mocks.inspect }));
import { readProjectBrainVoiceTranscriptReview } from "@/server/model-gateway/voice/project-brain-transcript-review";

const request = { actorUserId: "owner-a", workspaceId: "workspace-a", sessionId: "session-a" };
function fixture() {
  const f = voiceFixture();
  const prepared = inspectProjectBrainSourceSegments(f.manifest, { enabled: true });
  if (prepared.status === "DISABLED") throw new Error("fixture");
  const manifest = prepared.manifest;
  const projection = { sessionId: request.sessionId, workspaceId: request.workspaceId, projectId: f.subject.projectId,
    intakeId: f.subject.intakeId, sourceId: f.subject.sourceId, sessionStatus: "transcribing", sourceBindingHash: sha256Canonical(f.subject),
    segmentManifestHash: prepared.manifestHash, languageHint: "fr" as const, sessionCostBoundMicros: "1000000",
    expiresAt: "2026-09-10T13:00:00.000Z", segments: manifest.segments.map(s => ({ segmentId: `segment-${s.ordinal}`, status: "succeeded",
      ordinal: s.ordinal, durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: `sha256:${s.contentHash}` as const })) };
  const inspected = { projection, manifest, subject: f.subject, databaseNow: "2026-09-10T12:00:01.000Z" };
  const rows = projection.segments.map(s => {
    const metadata = manifest.segments[s.ordinal];
    const p = { operationType: "intake_voice_transcription" as const, sessionId: projection.sessionId, segmentId: s.segmentId,
      ordinal: s.ordinal, languageHint: projection.languageHint, mediaFormat: metadata.mediaFormat, mimeType: metadata.mimeType,
      durationMs: s.durationMs, byteCount: s.byteCount, audioFingerprint: s.audioFingerprint };
    const subject = { kind: "project_brain_voice_segment" as const, actorUserId: request.actorUserId, workspaceId: request.workspaceId,
      projectId: projection.projectId, intakeId: projection.intakeId, sourceId: projection.sourceId, sessionId: projection.sessionId,
      segmentId: s.segmentId, sourceBindingHash: projection.sourceBindingHash, segmentManifestHash: projection.segmentManifestHash };
    const text = `SYNTHETIC_LOCAL — no speech was transcribed. Segment ${s.ordinal}: ${s.audioFingerprint}.`;
    const requestFingerprint = fingerprintVoiceGatewayProjection(p, subject), routeHash = canonicalFingerprint("synthetic-route");
    const outputContractHash = voiceTranscriptOutputContractFingerprint();
    const responseEvidenceRef = canonicalFingerprint({ mode: "SYNTHETIC_LOCAL", audioFingerprint: s.audioFingerprint, text, costMicros: "0" });
    return { transcriptId: `transcript-${s.ordinal}`, segmentId: s.segmentId, sessionId: projection.sessionId, ordinal: s.ordinal,
      text, textFingerprint: canonicalFingerprint(text), characterCount: text.length, reportedAudioSeconds: s.durationMs / 1000,
      measuredCostMicros: 0n, expiresAt: new Date(projection.expiresAt), purgedAt: null, aiId: `ai-${s.ordinal}`,
      operationKey: voiceOperationKey(p), gatewayId: `gateway-${s.ordinal}`, tenantId: `construction-workspace:${request.workspaceId}`,
      requestFingerprint, outputContractHash, decisionId: `decision-${s.ordinal}`, routeHash, attemptId: `attempt-${s.ordinal}`,
      requestEvidenceRef: canonicalFingerprint({ operationType: p.operationType, requestFingerprint, outputContractHash, routeHash }),
      responseEvidenceRef, resultEvidenceRef: responseEvidenceRef, holdId: `hold-${s.ordinal}`, amountMicros: 100000n, settledMicros: 0n };
  });
  return { inspected, rows };
}
let data: ReturnType<typeof fixture>, now: Date;
const run = () => readProjectBrainVoiceTranscriptReview(request, { enabled: true });
beforeEach(() => {
  vi.resetAllMocks(); data = fixture(); now = new Date("2026-09-10T12:00:02.000Z");
  mocks.transaction.mockImplementation(async callback => callback({ $queryRawUnsafe: mocks.query }));
  mocks.inspect.mockImplementation(async () => data.inspected);
  mocks.query.mockImplementation(async (sql: string) => sql.includes('SELECT x.id "transcriptId"') ? data.rows
    : sql === "SELECT clock_timestamp() AS now" ? [{ now }] : []);
});

describe("PB synthetic protected transcript owner review", () => {
  it("OFF does not parse, access DB or inspector", async () => {
    expect(await readProjectBrainVoiceTranscriptReview(null as never)).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("returns exact producer text and immutable evidence, explicitly not real speech/facts", async () => {
    const value = await run();
    expect(value).toMatchObject({ status: "SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED", contentIntegrityVerified: true,
      semanticAccuracyVerified: false, transcriptionQualityVerified: false, executionAuthorized: false, projectFactConfirmed: false,
      externalTransportPerformed: false, syntheticReviewAvailable: true, realTranscriptionAvailable: false, mediaDecodingVerified: false });
    if (value.status === "DISABLED") throw new Error("fixture");
    expect(value.text).toBe(data.rows.map(r => r.text).join(" "));
    expect(value.textFingerprint).toBe(canonicalFingerprint(value.text));
    expect(value.expiresAt).toBe(data.inspected.projection.expiresAt);
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.orderedEvidence)).toBe(true);
    expect(Object.isFrozen(value.orderedEvidence[0])).toBe(true);
    expect(JSON.stringify(value)).not.toMatch(/storageKey|audioBytes|credential|ownerBrief|"fileId"/);
    expect(mocks.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(sql))).toBe(true);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", timeout: 5000, maxWait: 2000 });
  });
  it("repeated read is stable and does not renew TTL or write a receipt", async () => { expect(await run()).toEqual(await run()); });
  it("copies actor/context before the first await and uses exact bound SQL pins", async () => {
    const mutable = { ...request };
    const pending = readProjectBrainVoiceTranscriptReview(mutable, { enabled: true });
    mutable.actorUserId = "other"; mutable.workspaceId = "other"; mutable.sessionId = "other";
    await pending;
    expect(mocks.inspect.mock.calls[0][1]).toEqual(request);
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT x.id "transcriptId"'))?.slice(1))
      .toEqual([request.sessionId, request.actorUserId, request.workspaceId, data.inspected.projection.sourceBindingHash, data.inspected.projection.segmentManifestHash]);
    expect(mocks.query.mock.calls[1]).toEqual(["SELECT pg_advisory_xact_lock_shared(hashtext($1))::text", "voice-session-spend:session-a"]);
  });
  it("unknown fields/caller text fail strict parsing", async () => {
    await expect(readProjectBrainVoiceTranscriptReview({ ...request, text: "malicious" } as never, { enabled: true })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["owner revoked", "wrong workspace", "purged file", "intake state changed", "member epoch changed"])("propagates canonical access refusal: %s", async reason => {
    mocks.inspect.mockRejectedValue(new Error(reason)); await expect(run()).rejects.toThrow(reason);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('SELECT x.id "transcriptId"'))).toBe(false);
  });
  it.each(["finishing", "ready", "incomplete", "uncertain", "cancelled", "failed", "purged"])("refuses closed/incomplete session %s", async status => {
    data.inspected.projection.sessionStatus = status; await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("requires every manifest segment succeeded before looking at protected text", async () => {
    data.inspected.projection.segments[0].status = "running"; await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["missing", "extra", "duplicate", "reordered"])("rejects %s result rows", async change => {
    if (change === "missing") data.rows.pop();
    if (change === "extra") data.rows.push(data.rows[0]);
    if (change === "duplicate") data.rows[1] = { ...data.rows[0] };
    if (change === "reordered") data.rows.reverse();
    await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["transcriptId", "aiId", "gatewayId", "decisionId", "attemptId", "holdId"] as const)("refuses shared %s across otherwise distinct results", async field => {
    data.rows[1][field] = data.rows[0][field]; await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["sessionId", "segmentId", "tenantId", "operationKey"] as const)("refuses altered %s", async field => {
    data.rows[0][field] = "other"; await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["requestFingerprint", "outputContractHash", "routeHash", "requestEvidenceRef", "responseEvidenceRef", "resultEvidenceRef", "textFingerprint"] as const)("rehashes exact producer %s", async field => {
    data.rows[0][field] = canonicalFingerprint("tampered"); await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["text", "same-length", "emoji", "newline", "overlong", "rehash-forged-producer"])("rejects protected content %s", async kind => {
    const row = data.rows[0]; row.text = kind === "same-length" ? row.text.replace("SYNTHETIC", "FAKELOCAL")
      : kind === "overlong" ? "x".repeat(20001) : row.text + (kind === "emoji" ? "😀" : kind === "newline" ? "\n" : " changed");
    if (kind === "rehash-forged-producer") {
      row.characterCount = row.text.length; row.textFingerprint = canonicalFingerprint(row.text);
      row.responseEvidenceRef = canonicalFingerprint({ mode: "SYNTHETIC_LOCAL", audioFingerprint: data.inspected.projection.segments[0].audioFingerprint, text: row.text, costMicros: "0" });
      row.resultEvidenceRef = row.responseEvidenceRef;
    }
    await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["characterCount", "reportedAudioSeconds"] as const)("checks %s exactly", async field => { data.rows[0][field]++; await expect(run()).rejects.toThrow("REVIEW_REFUSED"); });
  it.each(["amountMicros", "settledMicros", "measuredCostMicros"] as const)("rejects invalid synthetic accounting %s", async field => {
    data.rows[0][field] = field === "amountMicros" ? 0n : 1n; await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("does not accept a transcript with a longer/shorter expiry than its producer session", async () => {
    data.rows[0].expiresAt = new Date("2026-09-10T14:00:00.000Z"); await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("refuses purged protected content", async () => {
    Object.assign(data.rows[0], { purgedAt: now }); await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it.each(["2026-09-10T13:00:00.000Z", "2026-09-10T12:00:00.000Z", "invalid"])("checks final DB clock %s", async value => {
    now = new Date(value); await expect(run()).rejects.toThrow("REVIEW_REFUSED");
  });
  it("commit loss returns no protected result and does not retry", async () => {
    mocks.transaction.mockImplementationOnce(async callback => { await callback({ $queryRawUnsafe: mocks.query }); throw new Error("commit lost"); });
    await expect(run()).rejects.toThrow("commit lost"); expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("producer contract and read-only SQL invariants (not native execution)", () => {
  it("public fingerprint equals the unchanged private contract and request builder", () => {
    const expected = canonicalFingerprint({ contract: "voice-transcript-v1", text: { type: "string", minLength: 1, maxLength: 20000 },
      usage: { audioSeconds: "non_negative_number_or_null", inputTokens: "non_negative_integer_or_null",
        outputTokens: "non_negative_integer_or_null", measuredCostMicros: "non_negative_integer_or_null" } });
    expect(voiceTranscriptOutputContractFingerprint()).toBe(expected);
    const f = voiceFixture(), s = f.manifest.segments[0];
    const projection = { operationType: "intake_voice_transcription" as const, sessionId: "legacy-session", segmentId: "legacy-segment",
      ordinal: 0, languageHint: "fr" as const, mediaFormat: "m4a" as const, mimeType: s.mimeType,
      durationMs: s.durationMs, byteCount: s.bytes.length, audioFingerprint: `sha256:${s.contentHash}` as const, audioBytes: s.bytes };
    // The initial fixture used the nonexistent customer_content value; the
    // boundary correctly refused it. Pin a real enum, not a permissive mock.
    const dataClass = "business_confidential" as const;
    expect(isGatewayDataClass(dataClass)).toBe(true); expect(isGatewayDataClass("customer_content")).toBe(false);
    expect(buildVoiceGatewayRequest({ logicalOperationKey: voiceOperationKey(projection), tenantId: "client:legacy", policyKey: "synthetic",
      dataClass, privacyRequirement: "standard", maxTotalCostMicros: 1n, projection }).outputContractHash).toBe(expected);
  });
  it("pins actual ledger field and exact subject/result joins, with no write/transport entry", () => {
    const source = readFileSync("src/server/model-gateway/voice/project-brain-transcript-review.ts", "utf8");
    for (const pin of ['u."operationId"=ai.id', 'x."gatewayAttemptId"=t.id AND x.id=ai."resultId"', 't.id=o."finalAttemptId"',
      "v.\"subjectKind\"='project_brain_voice'", 'v."clientId" IS NULL', 'ai."taskId" IS NULL', 'ai."personalAssistantOperationId" IS NULL',
      "t.\"dispatchState\"='settled'", "t.\"resultContractStatus\"='valid'", 'h."settledMicros"=0', 't."aiUsageId" IS NULL',
      't."providerRequestRef" IS NULL', 'r."canonicalHash"=d."routeHash"', 'p."canonicalHash"=d."policyHash"',
      'x."reportedAudioSeconds"::double precision AS "reportedAudioSeconds"',
      "(clock_timestamp() AT TIME ZONE 'UTC')", "FOR SHARE OF v,s,ai,o,d,p,r,t,x,h", "LIMIT 15"]) expect(source).toContain(pin);
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b|\bfetch\(|reserveAccountProviderSpend|dispatchVoiceGatewayAttempt/);
    const schema = readFileSync("prisma/schema.prisma", "utf8").split("model AiUsage {")[1].split("\n}")[0];
    expect(schema).toMatch(/operationId\s+String\?/); expect(schema).not.toMatch(/aiOperationId\s/);
  });
});
