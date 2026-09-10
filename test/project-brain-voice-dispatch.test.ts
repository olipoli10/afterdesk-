import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectBrainVoiceAdmissionFixture as fixture } from "./fixtures/project-brain-voice-admission";
import type { PreparedProjectBrainVoiceAdmission } from "@/server/model-gateway/voice/project-brain-admission";
type State = { session: string; segment: string; attempt: string; ai: string; nonce: string; hold: string; transcripts: string[]; audits: string[] };
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), execute: vi.fn(), inspect: vi.fn(), policy: vi.fn(), routes: vi.fn(), breaker: vi.fn(), hold: vi.fn(),
  claim: vi.fn(), bind: vi.fn(), decision: vi.fn(), attempt: vi.fn(), settle: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/model-gateway/voice/project-brain-sessions", () => ({ inspectProjectBrainVoiceSessionInTransaction: m.inspect }));
vi.mock("@/server/model-gateway/voice/operations", async original => ({ ...await original<typeof import("@/server/model-gateway/voice/operations")>(), reserveAndClaimProjectBrainVoiceOperationInTransaction: m.claim }));
vi.mock("@/server/account-spend", async original => ({ ...await original<typeof import("@/server/account-spend")>(), reserveAccountProviderSpendInTransaction: m.hold, settleAccountSpendHold: m.settle }));
vi.mock("@/server/model-gateway/operations", async original => ({ ...await original<typeof import("@/server/model-gateway/operations")>(), loadGatewayPolicySnapshot: m.policy,
  loadGatewayRouteSnapshots: m.routes, bindGatewayOperation: m.bind, persistGatewayDecision: m.decision, createGatewayAttempt: m.attempt }));
vi.mock("@/server/model-gateway/breakers", async original => ({ ...await original<typeof import("@/server/model-gateway/breakers")>(), loadGatewayBreakerResolution: m.breaker }));
vi.mock("@/server/model-gateway/evidence", async original => ({ ...await original<typeof import("@/server/model-gateway/evidence")>(), appendGatewayAuditEvent: m.audit }));
import { admitGatewayVoiceSegment, dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";
let data: ReturnType<typeof fixture>, state: State, active: State, queue: Promise<unknown>, now: Date;
let inspectionCount: number, mutateAtInspection: ((count: number) => void) | undefined, commitNumber: number, failCommit: number;
let rollbackNumber: number, queries: string[];
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-09-10T12:00:00.000Z");
  data = fixture(); now = new Date(); state = { session: "finishing", segment: "registered", attempt: "prepared", ai: "reserved", nonce: "nonce-a", hold: "absent", transcripts: [], audits: [] };
  active = state; queue = Promise.resolve(); inspectionCount = 0; mutateAtInspection = undefined; commitNumber = 0; failCommit = 0; rollbackNumber = 0; queries = [];
  m.tx.mockImplementation((callback: (tx: unknown) => Promise<unknown>) => {
    const run = queue.then(async () => {
      const draft = structuredClone(state); active = draft;
      try {
        const result = await callback({ $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute });
        state = draft; commitNumber++;
        if (commitNumber === failCommit) throw new Error("SYNTHETIC_COMMIT_UNKNOWN");
        return result;
      } catch (error) { rollbackNumber++; throw error; }
    });
    queue = run.catch(() => undefined); return run;
  });
  m.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
    queries.push(sql);
    if (sql.includes("clock_timestamp() AS now")) return [{ now }];
    if (sql.includes('FROM "AiOperation" ai')) {
      const owner = active.ai === "running" && active.nonce === args[1] && args[0] === "ai-a";
      if (args.length === 26) return owner && active.attempt === args[22] ? [{ id: "ai-a" }] : [];
      return owner && active.attempt === "dispatched" && active.segment === "running" ? [{ id: "ai-a" }] : [];
    }
    if (sql.includes('FROM "AccountProviderSpendHold"') && sql.includes("status='settled'")) return active.hold === "settled" ? [{ id: "hold-a" }] : [];
    if (sql.includes('FROM "AccountProviderSpendHold"')) return active.hold === "absent" ? [] : [{ status: active.hold, amountMicros: 100_000n, settledMicros: active.hold === "settled" ? 0n : null }];
    if (sql.includes('FROM "ModelGatewayPolicyVersion"') || sql.includes('FROM "VoiceIntakeSession"')) return [{ id: "bound" }];
    return [];
  });
  m.execute.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith('UPDATE "VoiceIntakeSession"')) active.session = "transcribing";
    if (sql.startsWith('UPDATE "ModelGatewayAttempt"')) {
      if (sql.includes("SET status='dispatched'")) { if (active.attempt !== "prepared") return 0; active.attempt = "dispatched"; }
      else if (sql.includes("status='settled'")) active.attempt = "settled";
      else active.attempt = String(args[1]);
    }
    if (sql.startsWith('UPDATE "VoiceIntakeSegment"')) {
      if (sql.includes("status='running'")) { if (active.segment !== "registered") return 0; active.segment = "running"; }
      else active.segment = sql.includes("status='succeeded'") ? "succeeded" : String(args[1]);
    }
    if (sql.startsWith('UPDATE "AiOperation"')) { if (active.ai !== "running" || active.nonce !== args[1]) return 0; active.ai = sql.includes("status='succeeded'") ? "succeeded" : "abandoned"; }
    if (sql.startsWith('INSERT INTO "VoiceTranscriptSegment"')) active.transcripts.push(String(args[3]));
    return 1;
  });
  m.inspect.mockImplementation(async () => {
    inspectionCount++; mutateAtInspection?.(inspectionCount);
    return { ...data.inspected, databaseNow: now.toISOString(), projection: { ...data.inspected.projection, sessionStatus: active.session,
      segments: data.inspected.projection.segments.map(s => ({ ...s, status: active.segment })) } };
  });
  m.policy.mockImplementation(async () => data.policy); m.routes.mockImplementation(async () => [data.route]); m.breaker.mockResolvedValue({ status: "clear", generation: 0n });
  m.claim.mockImplementation(async (_tx, input) => { active.ai = "running"; return { status: "claimed", claim: { operationId: "ai-a", operationKey: `voice-intake:${input.sessionId}:${input.segmentId}:${input.audioFingerprint}`, lockedBy: active.nonce, attempt: 1 } }; });
  m.hold.mockImplementation(async (_tx, input, env) => {
    if (env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS !== "1000000") return { ok: false };
    if (input.now.toISOString().slice(0, 10) !== "2026-09-10" || active.hold === "settled") throw new Error("HOLD_REPLAY_REFUSED");
    const created = active.hold === "absent"; active.hold = "held"; return { ok: true, created, holdId: "hold-a", grantedMicros: 100_000n };
  });
  m.bind.mockImplementation(async (_tx, input) => ({ id: "gateway-a", ...input }));
  m.decision.mockImplementation(async (_tx, input) => ({ id: "decision-a", ...input }));
  m.attempt.mockImplementation(async (_tx, input) => ({ id: "attempt-a", ...input }));
  m.settle.mockImplementation(async () => { active.hold = "settled"; });
  m.audit.mockImplementation(async (_tx, event) => { active.audits.push(event.eventType); });
});
afterEach(() => vi.useRealTimers());
async function admission() {
  const result = await admitGatewayVoiceSegment(data.input, data.options);
  if (result.status !== "prepared_synthetic_not_dispatched") throw new Error(`fixture ${result.status}`);
  inspectionCount = 0; return result;
}
function run(a: PreparedProjectBrainVoiceAdmission, extra: { syntheticScenario?: "SUCCESS" | "DELAYED_SUCCESS" | "UNKNOWN"; abortSignal?: AbortSignal } = {}) {
  return dispatchVoiceGatewayAttempt({ admission: a, actor: data.input.actor, rollout: data.options,
    abortSignal: extra.abortSignal ?? new AbortController().signal, syntheticScenario: extra.syntheticScenario });
}
describe("PB deterministic synthetic dispatch (fake transactional ledger, NOT native PostgreSQL)", () => {
  it("uses the same canonical admission and dispatch entries and stores labeled synthetic text", async () => {
    const result = await run(await admission());
    expect(result).toMatchObject({ status: "synthetic_succeeded", executionAuthorized: false, externalTransportPerformed: false, transcriptionQualityVerified: false });
    expect(state).toMatchObject({ attempt: "settled", segment: "succeeded", ai: "succeeded", hold: "settled" });
    expect(state.transcripts).toHaveLength(1); expect(state.transcripts[0]).toContain("SYNTHETIC_LOCAL — no speech was transcribed");
    expect(m.settle.mock.calls[0][2]).toBe(0n); expect(inspectionCount).toBe(3);
    expect(queries.find(sql => sql.includes("ai.\"leaseExpiresAt\"="))).toContain("::timestamptz AT TIME ZONE 'UTC'");
  });
  it("OFF before parsing and no production dispatch", async () => {
    expect(await dispatchVoiceGatewayAttempt({ actor: { kind: "PROJECT_BRAIN_OWNER", id: "x", workspaceId: "x" }, admission: null as never, abortSignal: new AbortController().signal })).toMatchObject({ status: "refused" });
    expect(m.tx).not.toHaveBeenCalled();
    const a = await admission(); data.options.env.NODE_ENV = "production" as "test";
    expect(await run(a)).toMatchObject({ status: "refused" }); expect(state.attempt).toBe("prepared");
  });
  it("ignores an arbitrary callback property and accepts only closed scenarios", async () => {
    const a = await admission(), adapter = { dispatch: vi.fn() };
    expect(await dispatchVoiceGatewayAttempt({ admission: a, actor: data.input.actor, rollout: data.options,
      abortSignal: new AbortController().signal, adapter } as never)).toMatchObject({ status: "synthetic_succeeded" });
    expect(adapter.dispatch).not.toHaveBeenCalled();
    await expect(run(a, { syntheticScenario: "HTTP" as "SUCCESS" })).rejects.toThrow();
  });
  it("concurrent callers have one committed invocation and no retry", async () => {
    const a = await admission(); const timer = vi.spyOn(globalThis, "setTimeout");
    const results = await Promise.all([run(a, { syntheticScenario: "DELAYED_SUCCESS" }), run(a, { syntheticScenario: "DELAYED_SUCCESS" })]);
    expect(results.filter(r => r.status === "synthetic_succeeded")).toHaveLength(1);
    expect(timer.mock.calls.filter(call => call[1] === 25)).toHaveLength(1); timer.mockRestore();
    expect(state.transcripts).toHaveLength(1); expect(await run(a)).not.toMatchObject({ status: "synthetic_succeeded" });
  });
  it.each(["bytes", "source", "breaker", "policy", "cap", "nonce", "deadline"])("pre-claim %s refusal changes no durable row", async kind => {
    const a = structuredClone(await admission()), snapshot = structuredClone(state);
    if (kind === "bytes") a.projection.audioBytes[0]++;
    if (kind === "source") data.inspected.projection.sourceBindingHash = "e".repeat(64);
    if (kind === "breaker") m.breaker.mockResolvedValue({ status: "open", generation: 1n });
    if (kind === "policy") m.policy.mockResolvedValue(null);
    if (kind === "cap") data.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = "";
    if (kind === "nonce") state.nonce = "successor";
    if (kind === "deadline") vi.setSystemTime(data.input.deadline);
    if (kind === "bytes") await expect(run(a)).rejects.toThrow("voice_segment_conflict"); else await run(a);
    if (kind === "nonce") snapshot.nonce = "successor";
    expect(state).toEqual(snapshot); expect(m.settle).not.toHaveBeenCalled();
  });
  it("source revocation between committed claim and callback stores known no-dispatch, retains hold", async () => {
    const a = await admission(); mutateAtInspection = count => { if (count === 2) throw new Error("OWNER_REVOKED"); };
    expect(await run(a)).toMatchObject({ status: "cancelled_before_dispatch", syntheticInvocationAttempted: false, exposureRetained: true });
    expect(state).toMatchObject({ hold: "held", attempt: "cancelled_before_dispatch", ai: "abandoned", segment: "failed", transcripts: [] });
    expect(m.settle).not.toHaveBeenCalled();
  });
  it.each(["source", "breaker", "cap", "deadline", "abort"])("post-latency %s withdrawal retains uncertainty", async kind => {
    const a = await admission(), controller = new AbortController();
    mutateAtInspection = count => {
      if (count !== 3) return;
      if (kind === "source") data.inspected.projection.segmentManifestHash = "f".repeat(64);
      if (kind === "breaker") m.breaker.mockResolvedValue({ status: "open", generation: 1n });
      if (kind === "cap") data.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = "";
      if (kind === "deadline") now = new Date(a.deadline);
      if (kind === "abort") controller.abort();
    };
    expect(await run(a, { abortSignal: controller.signal })).toMatchObject({ status: "uncertain", syntheticInvocationAttempted: true, exposureRetained: true });
    expect(state).toMatchObject({ hold: "held", attempt: "uncertain", segment: "uncertain", ai: "abandoned", transcripts: [] });
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("unknown synthetic result retains full hold and has no second invocation", async () => {
    const a = await admission(); expect(await run(a, { syntheticScenario: "UNKNOWN" })).toMatchObject({ status: "uncertain" });
    expect(state.hold).toBe("held"); const snapshot = structuredClone(state); await run(a); expect(state).toEqual(snapshot);
  });
  it("commit unknown after claim invokes nothing and never cleans up an unconfirmed ownership", async () => {
    const a = await admission(); failCommit = 2;
    await expect(run(a)).rejects.toThrow("SYNTHETIC_COMMIT_UNKNOWN"); expect(state).toMatchObject({ attempt: "dispatched", ai: "running", hold: "held", transcripts: [] });
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("commit unknown after private callback is uncertain and never retries", async () => {
    const a = await admission(); failCommit = 3;
    expect(await run(a, { syntheticScenario: "DELAYED_SUCCESS" })).toMatchObject({ status: "uncertain", syntheticInvocationAttempted: true });
    expect(state).toMatchObject({ attempt: "uncertain", ai: "abandoned", hold: "held", transcripts: [] });
  });
  it("post-latency claim loss cannot overwrite a successor", async () => {
    const a = await admission(); mutateAtInspection = count => { if (count === 3) { active.nonce = "successor"; state.nonce = "successor"; } };
    expect(await run(a)).toMatchObject({ status: "superseded" }); expect(state).toMatchObject({ ai: "running", nonce: "successor", hold: "held", transcripts: [] });
  });
  it("last config withdrawal rolls back synthetic transcript and settlement together", async () => {
    const a = await admission(); m.audit.mockImplementation(async (_tx, event) => { active.audits.push(event.eventType); if (event.eventType === "model_gateway.attempt.settled") data.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = ""; });
    expect(await run(a)).toMatchObject({ status: "uncertain" }); expect(rollbackNumber).toBe(1);
    expect(state).toMatchObject({ hold: "held", transcripts: [] });
  });
  it("a cap changed inside the last held-replay lookup cannot become the new approved pin", async () => {
    const a = await admission(), original = m.hold.getMockImplementation()!; let calls = 0;
    m.hold.mockImplementation(async (...args) => { const result = await original(...args); if (++calls === 3) data.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = ""; return result; });
    expect(await run(a)).toMatchObject({ status: "uncertain" }); expect(state).toMatchObject({ hold: "held", transcripts: [] });
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("privacy expiry during final writes rolls back even though lease remains valid", async () => {
    data.route = { ...data.route, privacyEvidence: { ...data.route.privacyEvidence, expiresAt: "2026-09-10T12:00:01.000Z" } };
    const a = await admission();
    m.audit.mockImplementation(async (_tx, event) => { active.audits.push(event.eventType); if (event.eventType === "model_gateway.attempt.settled") vi.setSystemTime("2026-09-10T12:00:02.000Z"); });
    expect(await run(a)).toMatchObject({ status: "uncertain" }); expect(rollbackNumber).toBe(1);
    expect(state).toMatchObject({ hold: "held", transcripts: [] });
  });
  it("caller byte/metadata mutation after entry does not change the privately pinned operation", async () => {
    const a = structuredClone(await admission()); const result = run(a);
    a.projection.audioBytes.fill(255); Object.assign(a.actor, { id: "other" }); Object.assign(a.request, { requestFingerprint: "other" });
    expect(await result).toMatchObject({ status: "synthetic_succeeded" }); expect(state.transcripts).toHaveLength(1);
  });
  it("oversized bytes are refused before snapshot or transaction", async () => {
    const a = structuredClone(await admission()); Object.assign(a.projection, { audioBytes: new Uint8Array(2_000_001) }); m.tx.mockClear();
    expect(await run(a)).toMatchObject({ status: "refused", reasonClass: "voice_segment_conflict" }); expect(m.tx).not.toHaveBeenCalled();
  });
  it("a no-op settlement CAS cannot produce a settled attempt or accepted synthetic transcript", async () => {
    const a = await admission(); m.settle.mockResolvedValue(undefined);
    expect(await run(a)).toMatchObject({ status: "uncertain" });
    expect(state).toMatchObject({ hold: "held", transcripts: [], ai: "abandoned", attempt: "uncertain" });
  });
});
