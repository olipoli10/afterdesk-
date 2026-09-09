import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma-client";
import { R36B_CANDIDATE_PACKETS, sealSandboxCase } from "@/lib/construction-operating-assistant-r36b/candidates";
import { createR37CampaignManifest } from "@/lib/construction-operating-assistant-r36b/campaign";
import { prepareOpenRouterControllerPlan } from "@/lib/construction-operating-assistant-r36b/openrouter";
import { sealSyntheticAttempt } from "@/server/construction-operating-assistant-r37a/sealed-executor";
import { executeControlledSyntheticAttempt } from "@/server/construction-operating-assistant-r37c/coordinator";
import { executeControlledSyntheticProviderDelivery } from "@/server/construction-operating-assistant-r37f/provider-delivery";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), reserve: vi.fn(), settle: vi.fn(), release: vi.fn(), member: vi.fn(), audit: vi.fn(), findRun: vi.fn(), findFirstRun: vi.fn(), updateRun: vi.fn(), updateRuns: vi.fn(), findSpend: vi.fn(), grant: vi.fn(), lane: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction, controlledProviderRun: { findUniqueOrThrow: mocks.findRun, findFirst: mocks.findFirstRun, update: mocks.updateRun, updateMany: mocks.updateRuns }, providerActivationGrant: { findFirst: mocks.grant }, providerLaneControl: { findUnique: mocks.lane }, providerSpendAttempt: { findUniqueOrThrow: mocks.findSpend } } }));
vi.mock("@/server/construction-assistant-v1/workspace", () => ({ requireActiveConstructionMember: mocks.member, ConstructionAccessDenied: class extends Error {} }));
vi.mock("@/server/construction-assistant-v1/audit", () => ({ appendConstructionAudit: mocks.audit }));
vi.mock("@/server/construction-operating-assistant-r37b/activation", async (importOriginal) => ({ ...await importOriginal<typeof import("@/server/construction-operating-assistant-r37b/activation")>(), reserveProviderSpend: mocks.reserve, settleProviderSpend: mocks.settle, releaseProviderSpend: mocks.release }));

const start = new Date("2026-09-02T12:00:00.000Z");
function fixture() {
  const sandboxCase = sealSandboxCase({ schemaVersion: 1, caseId: "R36B-R37CF-CURRENT-AUTHORITY", caseVersion: 1, intent: "CONTROLLER_REASONING", locale: "fr-CA", region: "CA", orderedFacts: [{ key: "site", value: "Synthetic Laval" }], dataClass: "business_confidential", outputContractKey: "authority-v1", ceilings: { maxLatencyMs: 10000, maxCostMicros: 10, maxOutputTokens: 100, maxSources: 1 }, syntheticOnly: true });
  const sealed = sealSyntheticAttempt({ campaign: createR37CampaignManifest({ packets: Object.values(R36B_CANDIDATE_PACKETS), cases: [sandboxCase] }), sandboxCase, requestPlan: prepareOpenRouterControllerPlan(crypto.randomUUID(), sandboxCase), authorization: { schemaVersion: 1, executionMode: "SYNTHETIC_TRANSPORT", authorizationId: crypto.randomUUID(), authorizedAt: start.toISOString(), expiresAt: new Date(start.getTime() + 3600000).toISOString(), candidateKey: "OPENROUTER_CONTROLLER", exactModelId: "example/fixture" }, now: start.toISOString() });
  return { actorId: "owner", workspaceId: "synthetic", grantId: "grant", idempotencyKey: crypto.randomUUID(), sealedExecutorFingerprint: `sha256:${"e".repeat(64)}`, reservedMicros: 10n, leaseDurationMs: 30000, sealed };
}

// In-memory database fixture, not PostgreSQL or provider execution.
function setup() {
  const input = fixture();
  let now = new Date(start);
  const grant = { id: input.grantId, workspaceId: input.workspaceId, candidateKey: "OPENROUTER_CONTROLLER", status: "ACTIVE", expiresAt: new Date(start.getTime() + 60000), sealedExecutorFingerprint: input.sealedExecutorFingerprint, exactModelId: input.sealed.authorization.exactModelId, allowedCaseFingerprints: [input.sealed.sandboxCase.caseFingerprint] };
  const lane = { state: "ENABLED" };
  const row: Record<string, unknown> = { id: "run", state: "PREPARED", version: 1, spendAttemptId: "attempt", evidenceSnapshot: null, evidenceFingerprint: null, canonicalEvidenceSnapshot: null, canonicalEvidenceFingerprint: null, failureCode: null, settlementCommandId: crypto.randomUUID(), releaseCommandId: crypto.randomUUID(), workspaceId: input.workspaceId, grantId: input.grantId, idempotencyKey: input.idempotencyKey, sealedAttemptFingerprint: input.sealed.sealedAttemptFingerprint, sealedExecutorFingerprint: input.sealedExecutorFingerprint, exactModelId: input.sealed.authorization.exactModelId, caseFingerprint: input.sealed.sandboxCase.caseFingerprint };
  let prepared = false;
  const update = async ({ data }: { data: Record<string, unknown> }) => { Object.assign(row, Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === Prisma.DbNull ? null : value])), { version: 1 }); return { ...row }; };
  mocks.member.mockResolvedValue({ role: "owner" });
  mocks.reserve.mockResolvedValue({ attempt: { id: "attempt" } });
  mocks.grant.mockImplementation(async () => ({ ...grant }));
  mocks.lane.mockImplementation(async () => ({ ...lane }));
  mocks.findRun.mockImplementation(async () => ({ ...row }));
  mocks.findFirstRun.mockImplementation(async () => ({ ...row }));
  mocks.updateRun.mockImplementation(update);
  mocks.updateRuns.mockImplementation(async (args: { where?: { state?: string }; data: Record<string, unknown> }) => { if (args.where?.state && args.where.state !== row.state) return { count: 0 }; await update(args); return { count: 1 }; });
  mocks.findSpend.mockResolvedValue({ id: "attempt", version: 1, state: "RESERVED" });
  const tx = { $queryRaw: vi.fn(), providerActivationGrant: { findFirst: mocks.grant }, providerLaneControl: { findUnique: mocks.lane }, controlledProviderRun: { findUnique: vi.fn(async () => prepared ? { ...row } : null), findUniqueOrThrow: mocks.findRun, create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { prepared = true; Object.assign(row, data); return { ...row }; }), update: vi.fn(update), updateMany: mocks.updateRuns } };
  mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => {
    const snapshot = { ...row };
    try { return await callback(tx); }
    catch (error) { for (const key of Object.keys(row)) delete row[key]; Object.assign(row, snapshot); throw error; }
  });
  const adapter = vi.fn(async () => ({ body: { fixture: true }, latencyMs: 1, costMicros: 1, externalTransportPerformed: false }));
  return { input, grant, lane, row, tx, adapter, clock: { now: () => new Date(now) }, advance: (milliseconds: number) => { now = new Date(start.getTime() + milliseconds); } };
}

describe("R37C/F point-of-use authority, synthetic in-memory DB", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.useRealTimers());

  it.each(["expiry", "revocation", "lane", "lease"])("refuses %s changed while claim completes, before adapter", async (change) => {
    const f = setup();
    if (change === "expiry") f.grant.expiresAt = new Date(start.getTime() + 1);
    mocks.transaction.mockImplementation(async (callback: (value: typeof f.tx) => Promise<unknown>) => {
      const value = await callback(f.tx);
      if (f.row.state === "RUNNING") {
        if (change === "expiry") f.advance(2);
        if (change === "revocation") f.grant.status = "REVOKED";
        if (change === "lane") f.lane.state = "DISABLED";
        if (change === "lease") f.advance(30001);
      }
      return value;
    });
    const outcome = await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock });
    expect(f.adapter).toHaveBeenCalledTimes(0);
    expect(outcome).toMatchObject({ disposition: "FAILED", adapterInvoked: false, evidence: null });
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.settle).not.toHaveBeenCalled();
    const replay = await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock });
    expect(replay.disposition).toBe("FAILED_REPLAY");
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(f.adapter).not.toHaveBeenCalled();
  });

  it.each(["revocation", "lane", "expiry"])("rejects evidence after callback %s", async (change) => {
    const f = setup();
    f.adapter.mockImplementation(async () => {
      if (change === "revocation") f.grant.status = "REVOKED";
      if (change === "lane") f.lane.state = "DISABLED";
      if (change === "expiry") f.grant.expiresAt = new Date(start);
      return { body: { fixture: true }, latencyMs: 1, costMicros: 1, externalTransportPerformed: false };
    });
    const outcome = await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock });
    expect(outcome).toMatchObject({ disposition: "FAILED", adapterInvoked: true, evidence: null });
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(f.row.canonicalEvidenceFingerprint).toBeNull();
  });

  it("refuses a different provider candidate with equal model, executor and case", async () => {
    const f = setup(); f.grant.candidateKey = "PERPLEXITY_SEARCH";
    const outcome = await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock });
    expect(outcome).toMatchObject({ disposition: "FAILED", adapterInvoked: false, failureCode: "R37C_GRANT_BINDING_DRIFT_AT_USE" });
    expect(f.adapter).not.toHaveBeenCalled();
    expect(mocks.reserve.mock.calls[0][0].candidateKey).toBe("OPENROUTER_CONTROLLER");
  });

  it("keeps legitimate success and replay single-invocation/single-settlement", async () => {
    const f = setup();
    expect(await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock })).toMatchObject({ disposition: "SUCCEEDED", adapterInvoked: true });
    expect(await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock })).toMatchObject({ disposition: "SUCCEEDED_REPLAY", adapterInvoked: false });
    expect(f.adapter).toHaveBeenCalledTimes(1); expect(mocks.settle).toHaveBeenCalledTimes(1); expect(mocks.release).not.toHaveBeenCalled();
  });

  it("refuses delivery lease expiry during awaited lookup before fixture callback", async () => {
    const f = setup();
    mocks.findFirstRun.mockImplementation(async () => { const snapshot = { ...f.row }; f.advance(30001); return snapshot; });
    const fixtureAdapter = vi.fn(async () => ({ fixture: {}, latencyMs: 1, costMicros: 1, externalTransportPerformed: false as const }));
    const outcome = await executeControlledSyntheticProviderDelivery(f.input, fixtureAdapter, { clock: f.clock });
    expect(fixtureAdapter).not.toHaveBeenCalled();
    expect(outcome.fixtureAdapterInvoked).toBe(false);
    expect(outcome.canonicalEvidence).toBeNull();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("reads time after the awaited current-authority lookup", async () => {
    const f = setup(); f.grant.expiresAt = new Date(start.getTime() + 1);
    const grantReader = mocks.grant.getMockImplementation()!;
    mocks.grant.mockImplementation(async () => { const snapshot = await grantReader(); if (f.row.state === "RUNNING") f.advance(2); return snapshot; });
    expect(await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock })).toMatchObject({ disposition: "FAILED", adapterInvoked: false });
    expect(f.adapter).not.toHaveBeenCalled();
  });

  it.each(["revocation", "lane"])("delivery revalidates %s after its additional lookup", async (change) => {
    const f = setup();
    mocks.findFirstRun.mockImplementation(async () => { if (change === "revocation") f.grant.status = "REVOKED"; else f.lane.state = "DISABLED"; return { ...f.row }; });
    const fixtureAdapter = vi.fn(async () => ({ fixture: {}, latencyMs: 1, costMicros: 1, externalTransportPerformed: false as const }));
    const outcome = await executeControlledSyntheticProviderDelivery(f.input, fixtureAdapter, { clock: f.clock });
    expect(fixtureAdapter).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ fixtureAdapterInvoked: false, canonicalEvidence: null, controlledRun: { disposition: "FAILED" } });
  });

  it("keeps legitimate delivery and durable canonical-evidence replay", async () => {
    const f = setup();
    const fixtureAdapter = vi.fn(async () => ({ fixture: { responseId: "synthetic", model: "example/fixture", providerRoute: "OPENROUTER_CONTROLLER", choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "Synthetic answer" } }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, externalTransportPerformed: false }, latencyMs: 1, costMicros: 1, externalTransportPerformed: false as const }));
    const outcome = await executeControlledSyntheticProviderDelivery(f.input, fixtureAdapter, { clock: f.clock });
    expect(outcome).toMatchObject({ fixtureAdapterInvoked: true, controlledRun: { disposition: "SUCCEEDED" }, canonicalEvidence: { evidenceLabel: "SYNTHETIC", certified: false } });
    const replay = await executeControlledSyntheticProviderDelivery(f.input, fixtureAdapter, { clock: f.clock });
    expect(replay).toMatchObject({ fixtureAdapterInvoked: false, controlledRun: { disposition: "SUCCEEDED_REPLAY" } });
    expect(replay.canonicalEvidence).toEqual(outcome.canonicalEvidence);
    expect(fixtureAdapter).toHaveBeenCalledTimes(1); expect(mocks.settle).toHaveBeenCalledTimes(1);
  });

  it("caps lease and cooperative timeout at grant expiry and discards late callback completion", async () => {
    vi.useFakeTimers();
    const f = setup(); f.grant.expiresAt = new Date(start.getTime() + 50);
    let finish!: (value: { body: object; latencyMs: number; costMicros: number; externalTransportPerformed: false }) => void;
    const late = vi.fn(() => new Promise<{ body: object; latencyMs: number; costMicros: number; externalTransportPerformed: false }>((resolve) => { finish = resolve; }));
    const pending = executeControlledSyntheticAttempt(f.input, late, { clock: f.clock });
    await vi.advanceTimersByTimeAsync(1);
    expect(late).toHaveBeenCalledTimes(1);
    expect(f.row.leaseExpiresAt).toEqual(f.grant.expiresAt);
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ disposition: "FAILED", adapterInvoked: true, evidence: null });
    finish({ body: {}, latencyMs: 1, costMicros: 1, externalTransportPerformed: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.settle).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(f.row.state).toBe("FAILED");
  });

  it.each(["expiry", "revocation", "lane"])("rolls back evidence when awaited write crosses %s", async (change) => {
    const f = setup();
    const update = mocks.updateRuns.getMockImplementation()!;
    mocks.updateRuns.mockImplementation(async (args) => {
      const outcome = await update(args);
      if (args.data.state === "EVIDENCE_RECORDED") {
        if (change === "expiry") f.advance(60001);
        if (change === "revocation") f.grant.status = "REVOKED";
        if (change === "lane") f.lane.state = "DISABLED";
      }
      return outcome;
    });
    const outcome = await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock });
    expect(outcome).toMatchObject({ disposition: "FAILED", evidence: null });
    expect(f.row.evidenceSnapshot).toBeNull();
    expect(mocks.settle).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back delayed canonical delivery evidence before settlement", async () => {
    const f = setup();
    const update = mocks.updateRuns.getMockImplementation()!;
    mocks.updateRuns.mockImplementation(async (args) => { const outcome = await update(args); if (args.data.canonicalEvidenceFingerprint) f.advance(60001); return outcome; });
    const fixtureAdapter = vi.fn(async () => ({ fixture: { responseId: "synthetic", model: "example/fixture", providerRoute: "OPENROUTER_CONTROLLER", choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content: "Synthetic answer" } }], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, externalTransportPerformed: false }, latencyMs: 1, costMicros: 1, externalTransportPerformed: false as const }));
    expect(await executeControlledSyntheticProviderDelivery(f.input, fixtureAdapter, { clock: f.clock })).toMatchObject({ canonicalEvidence: null, controlledRun: { disposition: "FAILED" } });
    expect(f.row.canonicalEvidenceSnapshot).toBeNull(); expect(mocks.settle).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it.each(["SETTLED", "RELEASED"])("replays immutable terminal command after %s commits but run update crashes", async (terminalState) => {
    const f = setup();
    let version = 1; let state = "RESERVED";
    mocks.findSpend.mockImplementation(async () => ({ id: "attempt", version, state }));
    const terminal = terminalState === "SETTLED" ? mocks.settle : mocks.release;
    terminal.mockImplementation(async (command: { expectedVersion: number }) => {
      if (command.expectedVersion !== 1) throw new Error("R37B_ALTERED_REPLAY_REFUSED");
      version = 2; state = terminalState;
    });
    if (terminalState === "RELEASED") f.adapter.mockRejectedValue(new Error("R37C_SYNTHETIC_ADAPTER_FAILED"));
    const update = mocks.updateRun.getMockImplementation()!;
    mocks.updateRun.mockImplementationOnce(async () => { throw new Error("SYNTHETIC_PROCESS_STOP_AFTER_TERMINAL_SPEND"); }).mockImplementation(update);
    // A lost process or write response can leave the terminal spend committed
    // without its coordinating run state. Neither retry may invoke the adapter.
    await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock }).catch(() => undefined);
    expect(f.row.state).toBe(terminalState === "SETTLED" ? "EVIDENCE_RECORDED" : "RELEASE_PENDING");
    const outcome = await executeControlledSyntheticAttempt(f.input, f.adapter, { clock: f.clock });
    expect(outcome).toMatchObject({ disposition: terminalState === "SETTLED" ? "SUCCEEDED_REPLAY" : "FAILED_REPLAY", adapterInvoked: false });
    expect(f.adapter).toHaveBeenCalledTimes(1); expect(terminal).toHaveBeenCalledTimes(2);
    expect(terminal.mock.calls[0][0]).toEqual(terminal.mock.calls[1][0]);
  });
});
