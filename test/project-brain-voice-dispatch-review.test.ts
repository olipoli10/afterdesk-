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

/** Reviewer-authored race oracles reuse the author's fake transaction scaffold.
 * They exercise real C/policy logic, not native SQL or external transport. */
describe("independent PB synthetic dispatch final fences", () => {
  it.each(["", "1"])("rejects a cap changed during the final held lookup (%s)", async cap => {
    const a = await admission(), hold = m.hold.getMockImplementation()!;
    let crossed = false;
    m.hold.mockImplementation(async (...args: unknown[]) => {
      const result = await hold(...args);
      if (inspectionCount === 3) { crossed = true; data.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = cap; }
      return result;
    });
    expect(await run(a)).toMatchObject({ status: "uncertain", exposureRetained: true });
    expect(crossed).toBe(true);
    expect(state).toMatchObject({ hold: "held", transcripts: [], ai: "abandoned", attempt: "uncertain" });
    expect(m.settle).not.toHaveBeenCalled();
  });
  it("privacy expiration during awaited terminal audit rolls all success writes back", async () => {
    (data.route.privacyEvidence as { expiresAt: string }).expiresAt = new Date(now.getTime() + 1_000).toISOString();
    const a = await admission(); let reached = false;
    m.audit.mockImplementation(async (_tx, event) => {
      active.audits.push(event.eventType);
      if (event.eventType === "model_gateway.attempt.settled") { reached = true; vi.setSystemTime(new Date(now.getTime() + 1_001)); }
    });
    expect(await run(a)).toMatchObject({ status: "uncertain", exposureRetained: true });
    expect(reached).toBe(true); expect(rollbackNumber).toBe(1);
    expect(state).toMatchObject({ hold: "held", transcripts: [], ai: "abandoned", attempt: "uncertain" });
  });
  it("mutation of caller-owned actor, claim and audio after the first await cannot redirect completion", async () => {
    const a = structuredClone(await admission()), originalHash = a.projection.audioFingerprint;
    mutateAtInspection = count => {
      if (count !== 1) return;
      (a.actor as { id: string }).id = "other-owner"; a.claim.operationId = "other-ai"; a.projection.audioBytes.fill(255);
    };
    expect(await run(a)).toMatchObject({ status: "synthetic_succeeded", segmentId: "segment-a" });
    expect(state.transcripts).toHaveLength(1);
    expect(state.transcripts[0]).toContain(originalHash);
    expect(m.settle).toHaveBeenCalledWith(expect.anything(), "hold-a", 0n);
  });
});
