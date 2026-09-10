import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), configure: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
import { recoverExpiredPersonalActionClaims } from "@/server/personal-assistant/claim-recovery";

beforeEach(() => {
  vi.clearAllMocks(); shared.query.mockResolvedValue([]); shared.configure.mockResolvedValue(1);
  shared.transaction.mockImplementation(work => work({ $queryRawUnsafe: shared.query, $executeRawUnsafe: shared.configure }));
});
afterEach(() => vi.restoreAllMocks());
describe("expired personal effect claims are retained as uncertain, never retried", () => {
  it.each([undefined, {}, { enabled: false }, { enabled: "true" }])("does nothing without exact explicit enable: %j", async input => {
    const result = await recoverExpiredPersonalActionClaims(input as Parameters<typeof recoverExpiredPersonalActionClaims>[0]);
    expect(result).toEqual({ status: "DISABLED", recovered: 0, executionAuthorized: false });
    expect(Object.isFrozen(result)).toBe(true); expect(shared.transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 26, 1.5, NaN, Infinity])("rejects unsafe batch %s before DB access", async batchSize => {
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, batchSize })).rejects.toThrow("PERSONAL_ACTION_RECOVERY_BATCH_INVALID");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("uses only three exact kinds, expired nonnull DB leases and one bounded locked batch", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    await recoverExpiredPersonalActionClaims({ enabled: true, batchSize: 25 });
    const [sql, bound] = shared.query.mock.calls[0];
    expect(bound).toBe(25);
    expect(sql).toContain("kind IN ('calendar_write','sms_outbound','voice_outbound')");
    expect(sql).toContain("p.status='processing' AND p.attempts=1");
    expect(sql).toContain('p."leaseUntil" IS NOT NULL AND p."leaseUntil"<=(clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(sql).toContain('ORDER BY p."leaseUntil",p.id LIMIT $1 FOR UPDATE OF p SKIP LOCKED');
    expect(sql).not.toMatch(/'pending'|'approved'|'received'|'personal_sms_inbound'|'personal_model_candidate_v1'/);
    expect(shared.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 2000 });
  });
  it("defaults to ten and counts returned updates, not assumed selected candidates", async () => {
    shared.query.mockResolvedValue([{ id: "synthetic-calendar" }, { id: "synthetic-sms" }]);
    const result = await recoverExpiredPersonalActionClaims({ enabled: true });
    expect(shared.query.mock.calls[0][1]).toBe(10);
    expect(result).toEqual({ status: "EXPIRED_ACTION_CLAIMS_RECORDED_UNCERTAIN", recovered: 2,
      executionAuthorized: false, automaticRetry: false, budgetReservationReleased: false });
    expect(Object.isFrozen(result)).toBe(true);
    shared.query.mockResolvedValue([]); expect((await recoverExpiredPersonalActionClaims({ enabled: true })).recovered).toBe(0);
  });
  it("fences exact identity, request, attempt, lease, budget and claim JSON", async () => {
    await recoverExpiredPersonalActionClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    for (const part of ['o.id=e.id', 'o."workspaceId"=e."workspaceId"', 'o."createdByUserId"=e."createdByUserId"',
      'o."connectorAccountId"=e."connectorAccountId"', 'o.kind=e.kind', 'o."requestHash"=e."requestHash"', 'o.attempts=e.attempts',
      'o."leaseUntil"=e."leaseUntil"', 'o."budgetId" IS NOT DISTINCT FROM e."budgetId"',
      'o."reservedCadMicros" IS NOT DISTINCT FROM e."reservedCadMicros"', 'o.result IS NOT DISTINCT FROM e.result']) expect(sql).toContain(part);
  });
  it("retains all previous claim/provider receipt material and never rewrites reserved budget or observed transport", async () => {
    await recoverExpiredPersonalActionClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    expect(sql).toContain("CASE WHEN jsonb_typeof(o.result)='object' THEN o.result ELSE '{}'::jsonb END");
    expect(sql).toContain("'priorClaimResult',o.result");
    expect(sql).toContain("'transportKnowledge','UNKNOWN_AFTER_PROCESS_LOSS'");
    expect(sql).toContain("'automaticRetry',false"); expect(sql).toContain("'budgetReservationReleased',false");
    const assignments = sql.split('SET ')[1].split('FROM expired')[0];
    expect(assignments).not.toMatch(/"(?:budgetId|reservedCadMicros|externalTransportPerformed|requestHash)"\s*=|attempts\s*=/);
    expect(sql).not.toMatch(/UPDATE "PersonalAssistantBudget"|DELETE|INSERT|ConstructionConnectorGrant|ConstructionConnectorCredential/);
  });
  it("never reports recovery after transaction failure", async () => {
    shared.query.mockRejectedValue(new Error("synthetic transaction failure"));
    await expect(recoverExpiredPersonalActionClaims({ enabled: true })).rejects.toThrow("synthetic transaction failure");
  });
  it("filters all three global correlated origins before LIMIT, never disguising orphan history as legacy", async () => {
    await recoverExpiredPersonalActionClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    const eligibility = sql.slice(sql.indexOf('AND CASE WHEN'), sql.indexOf('ORDER BY'));
    expect(eligibility).toContain('p."correlatedTemporalReceiptId" IS NOT NULL OR v.id IS NOT NULL OR a.id IS NOT NULL');
    expect(eligibility).toContain("CASE WHEN p.kind='calendar_write' AND a.id IS NOT NULL AND v.id IS NOT NULL");
    expect(eligibility).toContain('a."reviewId"=v.id');
    expect(eligibility).toContain("ELSE false END\n          ELSE true END");
    expect(sql).toContain('v."calendarOperationId"=p.id');
    expect(sql).toContain('a."calendarOperationId"=p.id');
    // No actor-scoped discovery could hide an existing foreign relation.
    expect(sql.slice(sql.indexOf('LEFT JOIN'), sql.indexOf('WHERE p.kind'))).not.toMatch(/workspaceId|createdByUserId/);
  });
  it("requires an exact committed historical live claim without requiring currently active grants", async () => {
    await recoverExpiredPersonalActionClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    const eligibility = sql.slice(sql.indexOf('AND CASE WHEN'), sql.indexOf('ORDER BY'));
    for (const fragment of ["p.result->>'phase' IN ('CLAIMED','DISPATCH_CLAIMED')", 'p."leaseUntil"=a."leaseUntil"',
      'sms_correlated_approval_pre_snapshot(a.xmin) IS TRUE', 'THEN sms_correlated_approval_binding(a,v,p) IS TRUE',
      'sms_correlated_approval_state_valid(p.result,a,v) IS TRUE']) expect(eligibility).toContain(fragment);
    expect(sql).not.toMatch(/authority_current|pg_advisory|FOR SHARE|FOR UPDATE OF [av]|ConstructionWorkspace|ConstructionConnector/);
  });
  it("writes only the closed79 uncertain envelope from immutable approval scalars", async () => {
    await recoverExpiredPersonalActionClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    const terminal = sql.split('result=CASE WHEN e."approvalId" IS NOT NULL THEN ')[1].split('ELSE (CASE')[0];
    expect(terminal).toContain("'version','personal-correlated-calendar-write-state-v1'");
    expect(terminal).toContain("'kind','personal_sms_temporal_receipt','approvalId',e.\"approvalId\"");
    expect(terminal).toContain("'reviewId',e.\"reviewId\",'reviewFingerprint',e.\"reviewFingerprint\"");
    expect(terminal).toContain("'phase','UNCERTAIN','writeConfirmed',false,'reviewRequired',true,'automaticRetry',false,'reason','CLAIM_LEASE_EXPIRED'");
    expect(terminal).not.toMatch(/priorClaimResult|PROCESS_LOSS|executionAuthorized|jsonb_typeof|o\.result/);
    expect(sql).toContain('o."correlatedTemporalReceiptId" IS NOT DISTINCT FROM e."correlatedTemporalReceiptId"');
    expect(sql).toContain('o."externalTransportPerformed" IS NOT DISTINCT FROM e."externalTransportPerformed"');
  });
  it.each([NaN, Infinity, -Infinity])("refuses nonfinite deadline %s before DB access", async deadlineAt => {
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt })).rejects.toThrow("DEADLINE_INVALID");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("does not start after the original controller deadline", async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt: 1000 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("bounds transaction wait plus execution to the caller remaining lifetime", async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt: 1100 });
    const options = shared.transaction.mock.calls[0][1];
    expect(options).toEqual({ isolationLevel: 'Serializable', maxWait: 25, timeout: 75 });
    expect(shared.configure).toHaveBeenCalledWith("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", '99', '99');
  });
  it("refuses SQL if transaction acquisition consumed the deadline", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    shared.transaction.mockImplementation(work => { now.mockReturnValue(1200); return work({ $queryRawUnsafe: shared.query, $executeRawUnsafe: shared.configure }); });
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(shared.query).not.toHaveBeenCalled();
    expect(shared.configure).not.toHaveBeenCalled();
  });
  it("does not start the recovery query if native timeout configuration used the remaining lifetime", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    shared.configure.mockImplementation(async () => { now.mockReturnValue(1200); return 1; });
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(shared.query).not.toHaveBeenCalled();
  });
  it("throws inside the transaction rather than acknowledging a late update", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    shared.query.mockImplementation(async () => { now.mockReturnValue(1200); return [{ id: 'synthetic-late-row' }]; });
    await expect(recoverExpiredPersonalActionClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
  });
  it("has no effect/provider imports, environment enablement, or transport access", () => {
    const source = readFileSync('src/server/personal-assistant/claim-recovery.ts', 'utf8');
    expect(source).not.toMatch(/process\.env|fetch\(|google-client|twilio|claimPersonalCalendarWrite|dispatchPersonalOutbound|ConstructionConnectorCredential/);
    expect(source.match(/^import /gm)).toHaveLength(2);
  });
});
