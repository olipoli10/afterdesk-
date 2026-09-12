import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { createOpenRouterPersonalIntentAdapter } from "@/server/model-gateway/personal-intent/openrouter-adapter";
import { dispatchPersonalIntent } from "@/server/model-gateway/personal-intent/dispatch";

const shared = vi.hoisted(() => ({ transaction: vi.fn(), reinspect: vi.fn(), audit: vi.fn(), finish: vi.fn(), uncertain: vi.fn(), hold: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
vi.mock("@/server/account-spend", () => ({ reserveAccountProviderSpendInTransaction: shared.hold }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ reinspectPersonalIntentAdmission: shared.reinspect }));
vi.mock("@/server/model-gateway/personal-intent/recovery", () => ({ retainPersonalIntentUncertain: shared.uncertain }));
vi.mock("@/server/model-gateway/personal-ai-operations", () => ({ finishPersonalAiOperation: shared.finish }));
vi.mock("@/server/model-gateway/evidence", async importOriginal => ({ ...await importOriginal<object>(), appendGatewayAuditEvent: shared.audit }));

const sourceInput = createPersonalIntentInput("syn-inbound", "Hey demain j’ai quoi?");
const proposal = { schemaVersion: 1, requestFingerprint: sourceInput.requestFingerprint,
  actions: [{ id: "a", kind: "READ_CALENDAR", dependsOn: [], period: { quote: "demain", start: 4, end: 10 } }] };
const admission = {
  status: "ADMITTED_NOT_DISPATCHED", source: { input: sourceInput, subject: { kind: "personal_assistant_operation", operationId: "syn-inbound", workspaceId: "syn-workspace" },
    actorUserId: "syn-owner", timezone: "America/Toronto", receivedAt: "2026-09-10T02:30:00Z" },
  budgetPolicy: { model: "synthetic/model", providerEndpoint: "synthetic/provider", maxOutputTokens: 2048, budgetId: "syn-budget", reservationCadMicros: 2n, reservationUsdMicros: 1n, ceilingCadMicros: 20n, expiresAt: "2026-10-10T01:18:26Z" },
  claim: { operationId: "syn-ai", operationKey: "syn-key", lockedBy: "syn-lock", attempt: 1 },
  operation: { id: "syn-gateway", requestFingerprint: sourceInput.requestFingerprint }, request: { tenantId: "construction-workspace:syn-workspace" },
  attempt: { id: "syn-attempt", accountSpendHoldId: "syn-usd-hold" }, decision: { id: "syn-decision" }, childOperationId: "syn-child",
} as unknown as PersonalIntentAdmission;
function fixture() {
  const query = vi.fn().mockResolvedValue([{ leaseExpiresAt: new Date("2026-09-10T03:00:00Z") }]);
  const execute = vi.fn().mockResolvedValue(1);
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
  shared.transaction.mockImplementation(work => work(tx));
  const transport = vi.fn(async () => ({ httpStatus: 200, body: JSON.stringify({ id: "syn-provider-1", model: "synthetic/model",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(proposal) } }] }) }));
  const adapter = createOpenRouterPersonalIntentAdapter({ enabled: true, modelKey: "synthetic/model", providerEndpointSlug: "synthetic/provider", timeoutMs: 1000, maxOutputTokens: 2048, transport });
  const input = { enabled: true, admission, adapter, abortSignal: new AbortController().signal,
    currentRateConfiguration: { synthetic: true }, currentPilotEnvelopeReview: { synthetic: true }, transportMode: "SYNTHETIC_LOCAL" as const };
  return { tx, query, execute, transport, adapter, input };
}
beforeEach(() => {
  vi.clearAllMocks(); shared.reinspect.mockResolvedValue({ source: admission.source, now: new Date("2026-09-10T02:50:00Z") });
  shared.uncertain.mockResolvedValue(true); shared.finish.mockResolvedValue({ executionAuthorized: false });
  shared.hold.mockResolvedValue({ ok: true, created: false, holdId: "syn-usd-hold", grantedMicros: 1n });
});

describe("full personal gateway dispatch (synthetic transaction and wire only)", () => {
  it.each([false, true])("retains uncertain state even when rejected-result logging throws=%s", async loggerThrows => {
    const f = fixture();
    const logger = vi.spyOn(console, "warn").mockImplementation(() => { if (loggerThrows) throw new Error("log unavailable"); });
    try {
      f.transport.mockResolvedValueOnce({ httpStatus: 200, body: JSON.stringify({ id: "syn", model: "synthetic/model",
        choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "private unfinished content" } }] }) });
      expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "UNCERTAIN", recorded: true, reason: "PROVIDER_OUTCOME_UNKNOWN" });
      expect(JSON.parse(logger.mock.calls[0][0])).toEqual({ event: "personal.intent.rejected", attemptId: "syn-attempt", diagnosticCode: "OUTPUT_NOT_FINISHED" });
      expect(JSON.stringify(logger.mock.calls)).not.toContain("private unfinished content");
      expect(f.transport).toHaveBeenCalledOnce();
      expect(shared.finish).not.toHaveBeenCalled();
    } finally { logger.mockRestore(); }
  });
  it("does not log arbitrary diagnostic values from an injected candidate", async () => {
    const f = fixture(); const logger = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const adapter = { ...f.adapter, dispatch: vi.fn().mockResolvedValue({ status: "DISPATCH_OUTCOME_UNCERTAIN", reason: "HTTP_ERROR",
        diagnosticCode: "not-for-logs", dispatched: true, executionAuthorized: false, accounting: "UNSETTLED" }) };
      expect(await dispatchPersonalIntent({ ...f.input, adapter })).toMatchObject({ status: "UNCERTAIN", recorded: true });
      expect(JSON.parse(logger.mock.calls[0][0]).diagnosticCode).toBe("UNAVAILABLE");
      expect(JSON.stringify(logger.mock.calls)).not.toContain("not-for-logs");
    } finally { logger.mockRestore(); }
  });
  it("stays OFF before any database or transport call", async () => {
    const f = fixture(); expect(await dispatchPersonalIntent({ ...f.input, enabled: undefined })).toMatchObject({ status: "DISABLED" });
    expect(shared.transaction).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("refuses an already-aborted request without touching the persisted attempt", async () => {
    const f = fixture(); const controller = new AbortController(); controller.abort();
    expect(await dispatchPersonalIntent({ ...f.input, abortSignal: controller.signal })).toMatchObject({ status: "NOT_DISPATCHED" });
    expect(shared.transaction).not.toHaveBeenCalled(); expect(shared.uncertain).not.toHaveBeenCalled();
  });
  it.each(["model", "provider", "output", "mode"])("refuses mismatched adapter %s before claiming", async key => {
    const f = fixture(); const adapter = { ...f.adapter,
      ...(key === "model" ? { modelKey: "other/model" } : key === "provider" ? { providerEndpointSlug: "other/provider" }
        : key === "output" ? { maxOutputTokens: 4096 } : { transportMode: "EXTERNAL_PROVIDER" as const }) };
    expect(await dispatchPersonalIntent({ ...f.input, adapter })).toMatchObject({ reason: "ADAPTER_BINDING_REFUSED" });
    expect(f.transport).not.toHaveBeenCalled(); expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("refuses real transport mode unless explicitly enabled by trusted server wiring", async () => {
    const f = fixture(); const adapter = { ...f.adapter, transportMode: "EXTERNAL_PROVIDER" as const };
    expect(await dispatchPersonalIntent({ ...f.input, adapter, transportMode: "EXTERNAL_PROVIDER" }, { NODE_ENV: "test" })).toMatchObject({ status: "NOT_DISPATCHED" });
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("refuses external mode before CAS when only the model switch, not the global switch, is enabled", async () => {
    const f = fixture(); const adapter = { ...f.adapter, transportMode: "EXTERNAL_PROVIDER" as const };
    expect(await dispatchPersonalIntent({ ...f.input, adapter, transportMode: "EXTERNAL_PROVIDER" }, {
      NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "DISABLED",
    })).toMatchObject({ status: "NOT_DISPATCHED", reason: "ADAPTER_BINDING_REFUSED" });
    expect(shared.transaction).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("global revocation after an external-policy callback preserves uncertainty and no result authority", async () => {
    // The EXTERNAL policy branch is exercised with a local fake callback only.
    const f = fixture(); const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED" };
    const adapter = { ...f.adapter, transportMode: "EXTERNAL_PROVIDER" as const, dispatch: vi.fn(async () => {
      const response = await f.adapter.dispatch(sourceInput, new AbortController().signal);
      delete env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED; return response;
    }) };
    expect(await dispatchPersonalIntent({ ...f.input, adapter, transportMode: "EXTERNAL_PROVIDER" }, env)).toMatchObject({ status: "UNCERTAIN", recorded: true, reason: "POST_DISPATCH_REVALIDATION_FAILED" });
    expect(adapter.dispatch).toHaveBeenCalledTimes(1); expect(shared.finish).not.toHaveBeenCalled();
    expect(shared.uncertain).toHaveBeenCalledWith(admission, "POST_DISPATCH_REVALIDATION_FAILED");
  });
  it("checks persisted lineage plus both held currencies then calls once and stores no action authority", async () => {
    const f = fixture();
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "PROPOSAL_STORED_NOT_AUTHORIZED", recorded: true, executionAuthorized: false, accounting: "UNSETTLED" });
    expect(f.transport).toHaveBeenCalledTimes(1); expect(shared.reinspect).toHaveBeenCalledTimes(2);
    expect(shared.hold).toHaveBeenCalledTimes(2);
    expect(f.query.mock.calls[1][0]).toContain('b."reservedCadMicros"<=b."ceilingCadMicros"');
    // Budget policy uses ISO text; Prisma must bind a timestamp, not TEXT, to
    // the PostgreSQL expiresAt comparison.
    expect(f.query.mock.calls[1][9]).toBeInstanceOf(Date);
    expect(f.query.mock.calls[1][9]).toEqual(new Date("2026-10-10T01:18:26Z"));
    const sql = f.query.mock.calls[0][0];
    for (const required of ['ai."lockedBy"=$6', 'c."reservedCadMicros"=$10', 'h."amountMicros"=$12', "h.status='held'", "a.status='prepared'", "c.attempts=0", 'FOR UPDATE OF ai,a,o,c,h,b']) expect(sql).toContain(required);
    expect(shared.transaction.mock.calls.every(call => call[1].isolationLevel === "Serializable")).toBe(true);
    const storing = f.execute.mock.calls.find(call => call[0].includes("SET status='completed',result="));
    const record = JSON.parse(storing![2]);
    expect(record).toMatchObject({ executionAuthorized: false, readyForActionPreparation: false, accounting: "UNSETTLED", transportMode: "SYNTHETIC_LOCAL", dispatchAttempted: true,
      temporal: [{ actionId: "a", result: { status: "RESOLVED_NOT_AUTHORIZED", startsAtUtc: "2026-09-10T04:00:00.000Z" } }] });
    expect(f.execute.mock.calls.some(call => /UPDATE "(?:AccountProviderSpendHold|PersonalAssistantBudget)"/.test(call[0]))).toBe(false);
    expect(f.execute.mock.calls.find(call => call[0].includes('"externalTransportPerformed"=$4'))?.[4]).toBe(false);
    expect(shared.finish.mock.calls[0][1]).toMatchObject({ outcome: "PROPOSAL_INSPECTED", resultId: "syn-child" });
  });
  it("a CAS loser never dispatches or closes the winner's claim", async () => {
    const f = fixture(); f.query.mockResolvedValue([]);
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "CLAIM_LOST" });
    expect(f.transport).not.toHaveBeenCalled(); expect(shared.uncertain).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["removed", "reduced", "midnight", "recreated", "different"])("refuses changed current USD authority: %s", async change => {
    const f = fixture();
    if (change === "midnight") shared.hold.mockRejectedValue(new Error("ACCOUNT_SPEND_REPLAY_CONFLICT"));
    else shared.hold.mockResolvedValue(change === "recreated" ? { ok: true, created: true, holdId: "syn-usd-hold", grantedMicros: 1n }
      : change === "different" ? { ok: true, created: false, holdId: "other-hold", grantedMicros: 1n } : { ok: false, reason: change });
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "NOT_DISPATCHED" });
    expect(shared.hold).toHaveBeenCalledWith(f.tx, { operationKey: "syn-key", attempt: 1, provider: "openrouter", worstCaseMicros: 1n, now: new Date("2026-09-10T02:50:00Z") }, expect.any(Object));
    expect(f.transport).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled(); expect(shared.uncertain).not.toHaveBeenCalled();
  });
  it("a serialization/reinspection failure before winning does not mutate the winner", async () => {
    const f = fixture(); shared.reinspect.mockRejectedValue(new Error("grant revoked or serialization conflict"));
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "NOT_DISPATCHED", recorded: false });
    expect(f.transport).not.toHaveBeenCalled(); expect(shared.uncertain).not.toHaveBeenCalled();
  });
  it.each(["removed", "reduced", "midnight", "recreated", "different"])("retains uncertainty when USD authority changes during latency: %s", async change => {
    const f = fixture();
    f.transport.mockImplementationOnce(async () => {
      if (change === "midnight") shared.hold.mockRejectedValue(new Error("ACCOUNT_SPEND_REPLAY_CONFLICT"));
      else shared.hold.mockResolvedValue(change === "recreated" ? { ok: true, created: true, holdId: "syn-usd-hold", grantedMicros: 1n }
        : change === "different" ? { ok: true, created: false, holdId: "other-hold", grantedMicros: 1n } : { ok: false, reason: change });
      return { httpStatus: 200, body: JSON.stringify({ id: "syn-provider-1", model: "synthetic/model",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(proposal) } }] }) };
    });
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "UNCERTAIN", recorded: true, reason: "POST_DISPATCH_REVALIDATION_FAILED" });
    expect(f.transport).toHaveBeenCalledTimes(1); expect(shared.finish).not.toHaveBeenCalled();
    expect(shared.hold).toHaveBeenCalledTimes(2);
  });
  it("retains uncertainty when the CAD hold binding/ceiling/expiry fails after latency", async () => {
    const f = fixture(); f.query.mockResolvedValueOnce([{ leaseExpiresAt: new Date("2026-09-10T03:00:00Z") }]).mockResolvedValueOnce([]);
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "UNCERTAIN", recorded: true });
    expect(shared.finish).not.toHaveBeenCalled(); expect(f.transport).toHaveBeenCalledTimes(1);
    const sql = f.query.mock.calls[1][0];
    for (const check of ['b."expiresAt"=($9::timestamptz AT TIME ZONE \'UTC\')', 'b."expiresAt">(now() AT TIME ZONE \'UTC\')', 'b."reservedCadMicros"<=b."ceilingCadMicros"', 'c."modelGatewayOperationId"=$2', 'c."reservedCadMicros"=$6', 'FOR UPDATE OF b,c']) expect(sql).toContain(check);
  });
  it("refuses a failed multirow dispatch fence before obtaining the adapter", async () => {
    const f = fixture(); f.execute.mockResolvedValueOnce(0);
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "NOT_DISPATCHED" });
    expect(f.transport).not.toHaveBeenCalled(); expect(shared.uncertain).not.toHaveBeenCalled();
  });
  it("retains uncertainty on revoked authority after model latency", async () => {
    const f = fixture(); shared.reinspect.mockResolvedValueOnce({ source: admission.source }).mockRejectedValueOnce(new Error("revoked"));
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "UNCERTAIN", recorded: true });
    expect(shared.uncertain).toHaveBeenCalledWith(admission, "POST_DISPATCH_REVALIDATION_FAILED");
    expect(shared.finish).not.toHaveBeenCalled(); expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("does not trust injected adapter success claims with an invalid proposal", async () => {
    const f = fixture(); const adapter = { ...f.adapter, dispatch: vi.fn().mockResolvedValue({ status: "PROPOSAL_INSPECTED_NOT_AUTHORIZED", providerRequestId: "syn", inspected: { proposal: { ...proposal, execute: true } } }) };
    expect(await dispatchPersonalIntent({ ...f.input, adapter })).toMatchObject({ reason: "INVALID_PROPOSAL", status: "UNCERTAIN" });
    expect(shared.finish).not.toHaveBeenCalled(); expect(adapter.dispatch).toHaveBeenCalledTimes(1);
  });
  it("an adapter no-dispatch declaration after invocation never releases or retries", async () => {
    const f = fixture(); const adapter = { ...f.adapter, dispatch: vi.fn().mockResolvedValue({ status: "NOT_DISPATCHED", reason: "DISABLED" }) };
    expect(await dispatchPersonalIntent({ ...f.input, adapter })).toMatchObject({ status: "UNCERTAIN", reason: "PROVIDER_OUTCOME_UNKNOWN" });
    expect(adapter.dispatch).toHaveBeenCalledTimes(1); expect(shared.finish).not.toHaveBeenCalled();
  });
  it("the orchestration itself times out an uncooperative injected adapter", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); const adapter = { ...f.adapter, dispatch: vi.fn<typeof f.adapter.dispatch>(() => new Promise<never>(() => undefined)) };
      const pending = dispatchPersonalIntent({ ...f.input, adapter }); await vi.advanceTimersByTimeAsync(120_001);
      expect(await pending).toMatchObject({ status: "UNCERTAIN", reason: "PROVIDER_OUTCOME_UNKNOWN" });
      expect(adapter.dispatch).toHaveBeenCalledTimes(1); expect(adapter.dispatch.mock.calls[0][1].aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("reports a DB terminal outage as unrecorded uncertainty, never fake success", async () => {
    const f = fixture(); shared.finish.mockRejectedValue(new Error("database unavailable")); shared.uncertain.mockRejectedValue(new Error("database unavailable"));
    expect(await dispatchPersonalIntent(f.input)).toMatchObject({ status: "UNCERTAIN", recorded: false });
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
});
