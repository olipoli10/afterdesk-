import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectBrainVoiceAdmissionFixture as fixture } from "./fixtures/project-brain-voice-admission";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), execute: vi.fn(), inspect: vi.fn(), policy: vi.fn(), routes: vi.fn(), breaker: vi.fn(),
  claim: vi.fn(), hold: vi.fn(), bind: vi.fn(), decision: vi.fn(), attempt: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/model-gateway/voice/project-brain-sessions", () => ({ inspectProjectBrainVoiceSessionInTransaction: m.inspect }));
vi.mock("@/server/model-gateway/voice/operations", async original => ({
  ...await original<typeof import("@/server/model-gateway/voice/operations")>(), reserveAndClaimProjectBrainVoiceOperationInTransaction: m.claim,
}));
vi.mock("@/server/account-spend", async original => ({
  ...await original<typeof import("@/server/account-spend")>(), reserveAccountProviderSpendInTransaction: m.hold,
}));
vi.mock("@/server/model-gateway/operations", async original => ({
  ...await original<typeof import("@/server/model-gateway/operations")>(), loadGatewayPolicySnapshot: m.policy, loadGatewayRouteSnapshots: m.routes,
  bindGatewayOperation: m.bind, persistGatewayDecision: m.decision, createGatewayAttempt: m.attempt,
}));
vi.mock("@/server/model-gateway/breakers", async original => ({ ...await original<typeof import("@/server/model-gateway/breakers")>(), loadGatewayBreakerResolution: m.breaker }));
import { prepareProjectBrainVoiceAdmission } from "@/server/model-gateway/voice/project-brain-admission";
import { admitGatewayVoiceSegment, dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";
const now = new Date("2026-09-10T12:00:00.000Z");
let data: ReturnType<typeof fixture>;
let dbNow: Date;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); data = fixture(); dbNow = now;
  m.tx.mockImplementation(async callback => callback({ $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute }));
  m.query.mockImplementation(async (sql: string) => sql.includes("clock_timestamp()") ? [{ now: dbNow }]
    : sql.includes('FROM "ModelGatewayPolicyVersion"') || sql.includes('FROM "VoiceIntakeSession"') ? [{ id: "bound" }] : []);
  m.execute.mockResolvedValue(1); m.inspect.mockImplementation(async () => data.inspected);
  m.policy.mockImplementation(async () => data.policy); m.routes.mockImplementation(async () => [data.route]); m.breaker.mockResolvedValue({ status: "clear", generation: 0n });
  m.claim.mockImplementation(async (_tx, input) => ({ status: "claimed", claim: { operationId: "ai-a", operationKey: `voice-intake:${input.sessionId}:${input.segmentId}:${input.audioFingerprint}`, lockedBy: "nonce-a", attempt: 1 } }));
  m.hold.mockResolvedValueOnce({ ok: true, created: true, holdId: "hold-a", grantedMicros: 100_000n })
    .mockResolvedValue({ ok: true, created: false, holdId: "hold-a", grantedMicros: 100_000n });
  m.bind.mockResolvedValue({ id: "gateway-a" }); m.decision.mockResolvedValue({ id: "decision-a", breakerGeneration: 0n }); m.attempt.mockResolvedValue({ id: "attempt-a", accountSpendHoldId: "hold-a" });
});
afterEach(() => vi.useRealTimers());
const run = () => prepareProjectBrainVoiceAdmission(data.input, data.options);
describe("Project Brain synthetic admission through existing gateway", () => {
  it("OFF before parsing/DB and production is refused", async () => {
    expect(await prepareProjectBrainVoiceAdmission(null as never)).toMatchObject({ status: "refused", reasonClass: "voice_disabled" });
    data.options.env.NODE_ENV = "production" as "test";
    expect(await run()).toMatchObject({ status: "refused" }); expect(m.tx).not.toHaveBeenCalled();
  });
  it("same public admission entry composes one transaction, canonical request and retained strict hold", async () => {
    const result = await admitGatewayVoiceSegment(data.input, data.options);
    expect(result).toMatchObject({ status: "prepared_synthetic_not_dispatched", executionAuthorized: false, transportMode: "SYNTHETIC_LOCAL",
      request: { tenantId: "construction-workspace:workspace-a", subject: { kind: "project_brain_voice_segment", actorUserId: "owner-a", sourceId: "source-a" } }, claim: { attempt: 1 } });
    expect(m.tx).toHaveBeenCalledTimes(1); expect(m.tx.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable", maxWait: 250 });
    expect(m.policy.mock.invocationCallOrder[0]).toBeLessThan(m.claim.mock.invocationCallOrder[0]);
    expect(m.breaker.mock.invocationCallOrder[0]).toBeLessThan(m.claim.mock.invocationCallOrder[0]);
    expect(m.hold).toHaveBeenCalledTimes(2); expect(m.hold.mock.calls[0][0]).toBe(m.hold.mock.calls[1][0]);
    expect(m.hold.mock.calls[1][1]).toMatchObject({ provider: "synthetic", attempt: 1, now });
    const firstLock = m.execute.mock.calls[0]; expect(firstLock[1]).toBe("voice-session-spend:session-a");
    if (result.status !== "prepared_synthetic_not_dispatched") throw new Error("fixture");
    expect(Object.isFrozen(result)).toBe(true); expect(result.projection.audioBytes).not.toBe(data.bytes);
  });
  it.each(["policy", "route", "breaker", "cap", "bytes", "owner"])("refuses %s before AI creation", async kind => {
    if (kind === "policy") m.policy.mockResolvedValue(null);
    if (kind === "route") data.route = { ...data.route, adapterKey: "openrouter-stt-candidate" };
    if (kind === "breaker") m.breaker.mockResolvedValue({ status: "open", generation: 1n });
    if (kind === "cap") data.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = "";
    if (kind === "bytes") data.bytes[0]++;
    if (kind === "owner") m.inspect.mockRejectedValue(new Error("SOURCE_OWNER_REFUSED"));
    if (kind === "owner") await expect(run()).rejects.toThrow("SOURCE_OWNER_REFUSED");
    else expect(await run()).toMatchObject({ status: "refused" });
    expect(m.claim).not.toHaveBeenCalled(); expect(m.hold).not.toHaveBeenCalled();
  });
  it.each([0n, -1n])( "rejects nonpositive reservation %s", async value => {
    data.input.maxSegmentCostMicros = value; expect(await run()).toMatchObject({ status: "refused" }); expect(m.tx).not.toHaveBeenCalled();
  });
  it.each(["missing", "failed", "closed", "prior", "later"])("enforces segment/session order %s", async kind => {
    if (kind === "missing") data.input.segmentId = "absent";
    if (kind === "failed") data.inspected.projection.segments[0].status = "failed";
    if (kind === "closed") data.inspected.projection.sessionStatus = "ready";
    if (kind === "prior") data.inspected.projection.segments.push({ ...data.inspected.projection.segments[0], segmentId: "prior", ordinal: -1, status: "registered" });
    if (kind === "later") data.inspected.projection.segments.push({ ...data.inspected.projection.segments[0], segmentId: "later", ordinal: 1, status: "succeeded" });
    expect(await run()).toMatchObject({ status: kind === "failed" ? "busy" : "refused" }); expect(m.claim).not.toHaveBeenCalled();
  });
  it("busy existing operation does not create another hold or attempt", async () => {
    m.claim.mockResolvedValue({ status: "existing", operationId: "ai-a", operationStatus: "abandoned" });
    expect(await run()).toEqual({ status: "busy" }); expect(m.hold).not.toHaveBeenCalled(); expect(m.bind).not.toHaveBeenCalled();
  });
  it("session cumulative held bound is evaluated before creation", async () => {
    const query = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql, ...args) => sql.includes('FROM "AccountProviderSpendHold"') ? [{ status: "held", amountMicros: 450_000n, settledMicros: null }] : query(sql, ...args));
    expect(await run()).toMatchObject({ status: "refused", reasonClass: "insufficient_spend_headroom" }); expect(m.claim).not.toHaveBeenCalled();
  });
  it("copies caller actor/bytes/deadline before its first await", async () => {
    const resultPromise = run(); data.bytes.fill(255); data.input.actor.id = "other"; data.input.deadline.setTime(0);
    const result = await resultPromise; expect(result).toMatchObject({ status: "prepared_synthetic_not_dispatched", actorId: "owner-a" });
    expect(m.inspect.mock.calls[0][1]).toMatchObject({ actorUserId: "owner-a" });
  });
  it("fresh DB clock before claim refuses elapsed source deadline", async () => {
    dbNow = new Date(now.getTime() + 55_000); expect(await run()).toMatchObject({ status: "refused", reasonClass: "voice_session_expired" }); expect(m.claim).not.toHaveBeenCalled();
  });
  it("privacy expiry during awaited policy locking refuses before claim", async () => {
    data.route = { ...data.route, privacyEvidence: { ...data.route.privacyEvidence, expiresAt: new Date(now.getTime() + 1_000).toISOString() } };
    dbNow = new Date(now.getTime() + 2_000); expect(await run()).toMatchObject({ status: "refused", reasonClass: "ineligible_route" }); expect(m.claim).not.toHaveBeenCalled();
  });
  it("final hold replay receives fresh DB day, not admission day", async () => {
    vi.setSystemTime("2026-09-10T23:59:50.000Z"); data.input.deadline = new Date("2026-09-11T00:00:30.000Z");
    data.inspected.projection.expiresAt = "2026-09-11T01:00:00.000Z";
    data.route = { ...data.route, privacyEvidence: { ...data.route.privacyEvidence, expiresAt: "2026-09-12T00:00:00.000Z" } };
    dbNow = new Date("2026-09-10T23:59:50.000Z"); m.attempt.mockImplementation(async () => { dbNow = new Date("2026-09-11T00:00:01.000Z"); return { id: "attempt-a" }; });
    await run(); expect(m.hold.mock.calls[0][1].now.toISOString()).toBe("2026-09-10T23:59:50.000Z");
    expect(m.hold.mock.calls[1][1].now.toISOString()).toBe("2026-09-11T00:00:01.000Z");
  });
  it("final strict hold or privacy withdrawal rolls back transaction rather than releasing outside", async () => {
    m.hold.mockReset().mockResolvedValueOnce({ ok: true, created: true, holdId: "hold-a", grantedMicros: 100_000n }).mockResolvedValue({ ok: false });
    expect(await run()).toMatchObject({ status: "refused", reasonClass: "insufficient_spend_headroom" });
    expect(m.tx).toHaveBeenCalledTimes(1); expect(m.execute.mock.calls.every(([sql]) => !sql.includes("released"))).toBe(true);
  });
  it("unknown commit propagates, no retry or cleanup mutation", async () => {
    m.tx.mockImplementation(async callback => { await callback({ $queryRawUnsafe: m.query, $executeRawUnsafe: m.execute }); throw new Error("COMMIT_UNKNOWN"); });
    await expect(run()).rejects.toThrow("COMMIT_UNKNOWN"); expect(m.tx).toHaveBeenCalledTimes(1);
  });
  it("legacy dispatch cannot release or retry PB even with a forged CLIENT cast", async () => {
    const result = await run(); m.tx.mockClear(); const adapter = { key: "voice-synthetic-direct", dispatch: vi.fn() };
    expect(await dispatchVoiceGatewayAttempt({ admission: result as never, actor: { role: "CLIENT", id: "owner-a" }, adapter: adapter as never,
      abortSignal: new AbortController().signal })).toEqual({ status: "refused", reasonClass: "voice_subject_not_supported" });
    expect(m.tx).not.toHaveBeenCalled(); expect(adapter.dispatch).not.toHaveBeenCalled();
  });
});
