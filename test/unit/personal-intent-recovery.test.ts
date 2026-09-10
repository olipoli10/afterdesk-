import { beforeEach, describe, expect, it, vi } from "vitest";
import { recoverExpiredPersonalIntentAttempts, retainPersonalIntentUncertain } from "@/server/model-gateway/personal-intent/recovery";
import type { PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
const shared = vi.hoisted(() => ({ transaction: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
vi.mock("@/server/model-gateway/evidence", async importOriginal => ({ ...await importOriginal<object>(), appendGatewayAuditEvent: shared.audit }));
const row = { aiId: "syn-ai", operationKey: "syn-key", lockedBy: "syn-lock", gatewayId: "syn-gateway", tenantId: "syn-tenant",
  childId: "syn-child", attemptId: "syn-attempt", decisionId: "syn-decision", holdId: "syn-hold", dispatchState: "unaccounted", transportMode: "SYNTHETIC_LOCAL" };
function fixture() {
  const query = vi.fn().mockResolvedValue([row]); const execute = vi.fn().mockResolvedValue(1);
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute }; shared.transaction.mockImplementation(work => work(tx));
  return { query, execute, tx };
}
beforeEach(() => vi.clearAllMocks());
describe("personal gateway expired attempt bookkeeping (no dispatch)", () => {
  it("is OFF by default without querying", async () => {
    expect(await recoverExpiredPersonalIntentAttempts()).toMatchObject({ status: "DISABLED", recovered: 0 });
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 26, 1.5, NaN])("refuses invalid recovery batch %s", async batchSize => {
    await expect(recoverExpiredPersonalIntentAttempts({ enabled: true, batchSize })).rejects.toThrow("BATCH_INVALID");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("locks only linked personal expired claims and keeps all holds untouched", async () => {
    const f = fixture();
    expect(await recoverExpiredPersonalIntentAttempts({ enabled: true, batchSize: 3 })).toMatchObject({ recovered: 1, executionAuthorized: false });
    const sql = f.query.mock.calls[0][0];
    for (const part of ["personal_intent_candidate_v1", "personal_model_candidate_v1", 'ai."leaseExpiresAt"<=now()', '"sourcePersonalOperationId"', "LIMIT $1", "FOR UPDATE OF ai,o,c,a SKIP LOCKED"]) expect(sql).toContain(part);
    expect(sql).toContain(`c."budgetId"='ENDVERA-PERSONAL-20260910-100CAD:openrouter'`);
    expect(f.query.mock.calls[0][1]).toBe(3);
    expect(f.execute).toHaveBeenCalledTimes(4);
    expect(f.execute.mock.calls.some(call => /UPDATE "(?:AccountProviderSpendHold|PersonalAssistantBudget)"/.test(call[0]))).toBe(false);
    const record = JSON.parse(f.execute.mock.calls[1][2]);
    expect(record).toMatchObject({ reason: "LEASE_EXPIRED", status: "UNCERTAIN", automaticRetry: false, executionAuthorized: false, accounting: "UNSETTLED", transportMode: "SYNTHETIC_LOCAL", dispatchAttempted: true });
    expect(record.proposal).toBeNull();
  });
  it("keeps undispatched expiry distinct from dispatched unknown outcome", async () => {
    const f = fixture(); f.query.mockResolvedValue([{ ...row, dispatchState: "not_dispatched", transportMode: null }]);
    await recoverExpiredPersonalIntentAttempts({ enabled: true });
    expect(JSON.parse(f.execute.mock.calls[1][2])).toMatchObject({ transportKnowledge: "NOT_DISPATCHED_BY_THIS_ATTEMPT", dispatchAttempted: false });
    expect(shared.audit.mock.calls[0][1].dispatchState).toBe("not_dispatched");
  });
  it("rolls back rather than reporting completion after a lost terminal fence", async () => {
    const f = fixture(); f.execute.mockResolvedValueOnce(0);
    await expect(recoverExpiredPersonalIntentAttempts({ enabled: true })).rejects.toThrow("FENCE_LOST");
    expect(shared.audit).not.toHaveBeenCalled();
  });
  it("does not overwrite a completed or superseded attempt", async () => {
    const f = fixture(); f.query.mockResolvedValue([]);
    const admission = { claim: { operationId: "syn-ai", operationKey: "syn-key", lockedBy: "stale-lock" }, operation: { id: "syn-gateway" }, childOperationId: "syn-child",
      attempt: { id: "syn-attempt", accountSpendHoldId: "syn-hold" }, decision: { id: "syn-decision" }, source: { subject: { operationId: "syn-parent" } } } as unknown as PersonalIntentAdmission;
    expect(await retainPersonalIntentUncertain(admission, "PROVIDER_OUTCOME_UNKNOWN")).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.query.mock.calls[0][0]).toContain('ai."lockedBy"=$3');
    expect(f.query.mock.calls[0].slice(1)).toEqual(["syn-ai", "syn-key", "stale-lock", "syn-gateway", "syn-child", "syn-attempt", "syn-decision", "syn-hold", "syn-parent"]);
  });
});
