import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { fingerprintVoiceGatewayProjection } from "@/server/model-gateway/privacy";
import { voiceOperationKey } from "@/server/model-gateway/voice/operations";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), execute: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/model-gateway/evidence", async original => ({ ...await original<typeof import("@/server/model-gateway/evidence")>(), appendGatewayAuditEvent: m.audit }));
import { recoverExpiredProjectBrainVoiceAttempts as recover } from "@/server/model-gateway/voice/project-brain-recovery";

function fixture() {
  const subject = { kind: "project_brain_voice_segment" as const, actorUserId: "owner", workspaceId: "workspace", projectId: "project",
    intakeId: "intake", sourceId: "source", sessionId: "session", segmentId: "segment", sourceBindingHash: "a".repeat(64), segmentManifestHash: "b".repeat(64) };
  const projection = { operationType: "intake_voice_transcription" as const, sessionId: "session", segmentId: "segment", ordinal: 0,
    languageHint: "fr" as const, mediaFormat: "wav" as const, mimeType: "audio/wav", durationMs: 1000, byteCount: 4, audioFingerprint: `sha256:${"c".repeat(64)}` as const };
  const requestFingerprint = fingerprintVoiceGatewayProjection(projection, subject), routeHash = `sha256:${"d".repeat(64)}`, outputContractHash = `sha256:${"e".repeat(64)}`;
  return { ...subject, ...projection, aiId: "ai", operationKey: voiceOperationKey(projection), lockedBy: "original-nonce",
    lockedAt: new Date("2026-09-10T11:59:00Z"), leaseExpiresAt: new Date("2026-09-10T11:59:59Z"),
    gatewayId: "gateway", tenantId: "construction-workspace:workspace", requestFingerprint, outputContractHash,
    decisionId: "decision", policyHash: `sha256:${"f".repeat(64)}`, routeHash, attemptId: "attempt", holdId: "hold", amountMicros: 100000n,
    periodKey: "2026-09-09", sessionStatus: "transcribing", attemptStatus: "prepared", dispatchState: "not_dispatched", segmentStatus: "registered",
    requestEvidenceRef: canonicalFingerprint({ operationType: projection.operationType, requestFingerprint, outputContractHash, routeHash }) };
}
let row: ReturnType<typeof fixture>, eligible: boolean, busy: boolean, missingLineage: boolean, missingHold: boolean, casLostAt: number;
let state: { ai: string; session: string; attempt: string; segment: string; hold: string; audits: number; priorError: string };
let draft: typeof state;
const enabled = { enabled: true, environment: "local" as const };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-09-10T12:00:00Z");
  row = fixture(); eligible = true; busy = false; missingLineage = false; missingHold = false; casLostAt = 0;
  state = { ai: "running", session: "transcribing", attempt: "prepared", segment: "registered", hold: "held", audits: 0, priorError: "prior-diagnostic-preserved" };
  m.tx.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
    draft = structuredClone(state);
    const result = await work({ $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute });
    state = draft; return result;
  });
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config(")) return [];
    if (sql.includes("pg_try_advisory")) return [{ acquired: !busy }];
    if (sql.includes('FOR UPDATE OF ai,v,s,o,t')) return missingLineage ? [] : [structuredClone(row)];
    if (sql.includes('SELECT id FROM "AccountProviderSpendHold"')) return missingHold ? [] : [{ id: row.holdId }];
    if (sql.includes('ORDER BY ai."leaseExpiresAt",ai.id LIMIT')) return eligible && draft.ai === "running" ? [
      { aiId: row.aiId, sessionId: row.sessionId, lockedBy: row.lockedBy, leaseExpiresAt: row.leaseExpiresAt },
    ] : [];
    throw new Error(`UNEXPECTED_SQL:${sql}`);
  });
  m.execute.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (m.execute.mock.calls.length === casLostAt) return 0;
    if (sql.startsWith('UPDATE "AiOperation"')) draft.ai = "abandoned";
    else if (sql.startsWith('UPDATE "ModelGatewayAttempt"')) draft.attempt = String(args[1]);
    else if (sql.startsWith('UPDATE "VoiceIntakeSegment"')) draft.segment = String(args[1]);
    else if (sql.startsWith('UPDATE "VoiceIntakeSession"')) draft.session = String(args[1]);
    else if (!sql.startsWith('UPDATE "ModelGatewayOperation"')) throw new Error("UNEXPECTED_WRITE");
    return 1;
  });
  m.audit.mockImplementation(async () => { draft.audits++; return {}; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("PB voice crash bookkeeping, synthetic DB acknowledgements only", () => {
  it.each([{}, { enabled: false, environment: "local" }, { enabled: true }])("is OFF before DB for %o", async input => {
    expect(await recover(input as typeof enabled)).toMatchObject({ status: "DISABLED", recovered: 0, executionAuthorized: false });
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("refuses production even with explicit local enable", async () => {
    vi.stubEnv("NODE_ENV", "production"); expect((await recover(enabled)).status).toBe("DISABLED"); expect(m.tx).not.toHaveBeenCalled();
  });
  it.each([0, 26, -1, 1.5, NaN])("refuses invalid batch %s before DB", async batchSize => {
    await expect(recover({ ...enabled, batchSize })).rejects.toThrow("BATCH_INVALID"); expect(m.tx).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -Infinity])("refuses nonfinite deadline %s", async deadlineAt => {
    await expect(recover({ ...enabled, deadlineAt })).rejects.toThrow("DEADLINE_INVALID"); expect(m.tx).not.toHaveBeenCalled();
  });
  it("refuses expired or aborted callers without DB", async () => {
    await expect(recover({ ...enabled, deadlineAt: Date.now() })).rejects.toThrow("DEADLINE_EXCEEDED");
    await expect(recover({ ...enabled, abortSignal: AbortSignal.abort() })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("cancels a known prepared claim, retains hold/prior diagnostic, never retries", async () => {
    const original = structuredClone(row);
    expect(await recover(enabled)).toEqual({ status: "EXPIRED_PB_VOICE_CLAIMS_RECORDED", recovered: 1, cancelledBeforeDispatch: 1, uncertain: 0, skipped: 0,
      executionAuthorized: false, automaticRetry: false, budgetReservationReleased: false, transportPerformedByRecovery: false });
    expect(state).toEqual({ ai: "abandoned", session: "incomplete", attempt: "cancelled_before_dispatch", segment: "failed", hold: "held", audits: 1, priorError: "prior-diagnostic-preserved" });
    expect(row).toEqual(original);
    expect((await recover(enabled)).recovered).toBe(0);
    expect(m.audit).toHaveBeenCalledTimes(1);
  });
  it("does not mistake a dispatched marker for a proven invocation or settlement", async () => {
    row.attemptStatus = "dispatched"; row.dispatchState = "unaccounted"; row.segmentStatus = "running";
    expect(await recover(enabled)).toMatchObject({ recovered: 1, uncertain: 1, cancelledBeforeDispatch: 0 });
    expect(state).toMatchObject({ ai: "abandoned", session: "uncertain", attempt: "uncertain", segment: "uncertain", hold: "held" });
    expect(m.audit.mock.calls[0][1]).toMatchObject({ dispatchState: "unaccounted", errorClass: "unknown_dispatched_outcome", resultContractStatus: "not_evaluated" });
  });
  it.each(["cancelled", "failed", "uncertain", "incomplete", "purged"])("preserves already closed session %s", async sessionStatus => {
    row.sessionStatus = sessionStatus; state.session = sessionStatus;
    expect((await recover(enabled)).recovered).toBe(1); expect(state.session).toBe(sessionStatus);
    expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE "VoiceIntakeSession"'))).toBe(false);
  });
  it.each(["actorUserId", "workspaceId", "projectId", "intakeId", "sourceId", "sourceBindingHash", "segmentManifestHash", "requestFingerprint", "operationKey", "requestEvidenceRef"] as const)("refuses changed immutable %s", async field => {
    Object.assign(row, { [field]: "different" });
    expect(await recover(enabled)).toMatchObject({ recovered: 0, skipped: 1 }); expect(m.execute).not.toHaveBeenCalled();
  });
  it.each(["not_dispatched", "settled", "dispatched_then_cancelled"])("rejects incoherent dispatched state %s", async dispatchState => {
    row.attemptStatus = "dispatched"; row.segmentStatus = "running"; row.dispatchState = dispatchState;
    expect((await recover(enabled)).recovered).toBe(0); expect(m.execute).not.toHaveBeenCalled();
  });
  it.each(["open", "finishing", "ready"])("does not rewrite incoherent session %s", async status => {
    row.sessionStatus = status;
    expect((await recover(enabled)).recovered).toBe(0); expect(m.execute).not.toHaveBeenCalled();
  });
  it("skips a busy session before requesting mutable row locks", async () => {
    busy = true; expect(await recover(enabled)).toMatchObject({ recovered: 0, skipped: 1 });
    expect(m.query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE OF ai,v,s,o,t"))).toBe(false); expect(m.execute).not.toHaveBeenCalled();
  });
  it.each(["lineage", "hold"])("does not mutate missing or changed %s", async missing => {
    missingLineage = missing === "lineage"; missingHold = missing === "hold";
    expect((await recover(enabled)).recovered).toBe(0); expect(m.execute).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4, 5])("rolls back every partial update when exact CAS %s loses", async position => {
    const before = structuredClone(state); casLostAt = position;
    await expect(recover(enabled)).rejects.toThrow("FENCE_LOST"); expect(state).toEqual(before); expect(m.audit).not.toHaveBeenCalled();
  });
  it("rolls back a timeout after the terminal audit", async () => {
    const before = structuredClone(state); m.audit.mockImplementation(async () => { draft.audits++; vi.setSystemTime(Date.now() + 3000); });
    await expect(recover(enabled)).rejects.toThrow("DEADLINE_EXCEEDED"); expect(state).toEqual(before);
  });
  it("rolls back an abort after terminal writes", async () => {
    const before = structuredClone(state), controller = new AbortController(); m.audit.mockImplementation(async () => controller.abort());
    await expect(recover({ ...enabled, abortSignal: controller.signal })).rejects.toThrow("DEADLINE_EXCEEDED"); expect(state).toEqual(before);
  });
  it("uses the exact session advisory before row locks and a separate read-only hold lock", async () => {
    await recover(enabled);
    const calls = m.query.mock.calls;
    const advisory = calls.findIndex(([sql]) => sql.includes("pg_try_advisory")), lineage = calls.findIndex(([sql]) => sql.includes("FOR UPDATE OF ai,v,s,o,t"));
    expect(calls[advisory][1]).toBe("voice-session-spend:session"); expect(advisory).toBeLessThan(lineage);
    expect(calls.findIndex(([sql]) => sql.includes('SELECT id FROM "AccountProviderSpendHold"'))).toBeGreaterThan(lineage);
    expect(m.tx.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable", maxWait: 250, timeout: 2000 });
  });
});

describe("PB recovery SQL confinement contracts, not native SQL proof", () => {
  const source = readFileSync(resolve(process.cwd(), "src/server/model-gateway/voice/project-brain-recovery.ts"), "utf8");
  it("has explicit durable exclusions for any existing result/usage/transcript", () => {
    for (const guard of ['ai."resultKind" IS NULL', 'ai."resultId" IS NULL', 'o."finalAttemptId" IS NULL', 'o."resultEvidenceRef" IS NULL',
      't."responseEvidenceRef" IS NULL', 't."aiUsageId" IS NULL', 't."providerRequestRef" IS NULL', 't."resultContractStatus"=\'not_evaluated\'',
      'x."segmentId"=s.id OR x."gatewayAttemptId"=t.id', 'FROM "AiUsage" u WHERE u."operationId"=ai.id',
      'ai."finishedAt" IS NULL', 'o."finishedAt" IS NULL', 't."finishedAt" IS NULL']) expect(source).toContain(guard);
  });
  it("preserves old fencing token/lease/errors/results, holds and canonical authority inputs", () => {
    const aiUpdate = source.slice(source.indexOf('UPDATE "AiOperation" SET'), source.indexOf('UPDATE "ModelGatewayAttempt" SET'));
    expect(aiUpdate.split("WHERE")[0]).not.toMatch(/lockedBy|lockedAt|leaseExpiresAt|lastError|resultKind|resultId|attempts=/);
    expect(source).not.toMatch(/UPDATE "AccountProviderSpendHold"|INSERT INTO "AiUsage"|INSERT INTO "VoiceTranscriptSegment"|fetch\(|reserveAccount|settleAccount|releaseAccount|claimAiOperation\(/);
    expect(source).not.toContain("inspectProjectBrainVoiceSessionInTransaction");
    expect(source).toContain('v."subjectKind"=\'project_brain_voice\' AND v."clientId" IS NULL');
    expect(source).toContain('ai."taskId" IS NULL AND ai."personalAssistantOperationId" IS NULL');
    expect(source).toContain("(clock_timestamp() AT TIME ZONE 'UTC')");
    expect(source).toContain("($3::timestamptz AT TIME ZONE 'UTC')");
  });
  it("does not assert that an expired worker was observed crashing", () => {
    expect(source).toContain('"OUTCOME_NOT_OBSERVED_AFTER_LEASE_EXPIRY"');
    expect(source).not.toContain('"UNKNOWN_AFTER_PROCESS_LOSS"');
  });
  it("uses the actual physical AiUsage operationId column, not an invented relation name", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model AiUsage {"), schema.indexOf("\n}", schema.indexOf("model AiUsage {")));
    expect(model).toMatch(/operationId\s+String\?/);
    expect(model).not.toMatch(/aiOperationId|operationId[^\r\n]*@map/);
    expect(source).toContain('FROM "AiUsage" u WHERE u."operationId"=ai.id');
    expect(source).not.toContain('u."aiOperationId"');
  });
});
