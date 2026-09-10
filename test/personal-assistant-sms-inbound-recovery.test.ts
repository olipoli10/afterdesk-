import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), configure: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
import { recoverExpiredPersonalSmsClaims } from "@/server/personal-assistant/sms-inbound-recovery";

beforeEach(() => {
  vi.clearAllMocks(); shared.query.mockResolvedValue([]); shared.configure.mockResolvedValue(1);
  shared.transaction.mockImplementation(work => work({ $queryRawUnsafe: shared.query, $executeRawUnsafe: shared.configure }));
});
afterEach(() => vi.restoreAllMocks());
describe("expired inbound SMS claims are retained as uncertain, never retried", () => {
  it.each([undefined, {}, { enabled: false }, { enabled: "true" }])("does nothing without exact explicit enable: %j", async input => {
    const result = await recoverExpiredPersonalSmsClaims(input as Parameters<typeof recoverExpiredPersonalSmsClaims>[0]);
    expect(result).toEqual({ status: "DISABLED", recovered: 0, executionAuthorized: false });
    expect(Object.isFrozen(result)).toBe(true); expect(shared.transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 26, 1.5, NaN, Infinity])("rejects unsafe batch %s before DB access", async batchSize => {
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, batchSize })).rejects.toThrow("PERSONAL_SMS_RECOVERY_BATCH_INVALID");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("uses only exact inbound kind, expired nonnull DB leases and one bounded locked batch", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    await recoverExpiredPersonalSmsClaims({ enabled: true, batchSize: 25 });
    const [sql, bound] = shared.query.mock.calls[0];
    expect(bound).toBe(25);
    expect(sql).toContain("kind='personal_sms_inbound'");
    expect(sql).toContain("status='processing' AND attempts=1");
    expect(sql).toContain('"leaseUntil" IS NOT NULL AND "leaseUntil"<=(clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(sql).toContain('ORDER BY "leaseUntil",id LIMIT $1 FOR UPDATE SKIP LOCKED');
    expect(sql).not.toMatch(/'pending'|'approved'|'received'|'calendar_write'|'sms_outbound'|'voice_outbound'|'personal_model_candidate_v1'/);
    expect(shared.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 2000 });
  });
  it("defaults to ten and counts returned updates, not assumed selected candidates", async () => {
    shared.query.mockResolvedValue([{ id: "synthetic-calendar" }, { id: "synthetic-sms" }]);
    const result = await recoverExpiredPersonalSmsClaims({ enabled: true });
    expect(shared.query.mock.calls[0][1]).toBe(10);
    expect(result).toEqual({ status: "EXPIRED_SMS_CLAIMS_RECORDED_UNCERTAIN", recovered: 2,
      executionAuthorized: false, automaticRetry: false, budgetReservationReleased: false });
    expect(Object.isFrozen(result)).toBe(true);
    shared.query.mockResolvedValue([]); expect((await recoverExpiredPersonalSmsClaims({ enabled: true })).recovered).toBe(0);
  });
  it("fences exact identity, request, attempt, lease, budget and claim JSON", async () => {
    await recoverExpiredPersonalSmsClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    for (const part of ['o.id=e.id', 'o."workspaceId"=e."workspaceId"', 'o."createdByUserId"=e."createdByUserId"',
      'o."connectorAccountId"=e."connectorAccountId"', 'o.kind=e.kind', 'o."requestHash"=e."requestHash"', 'o.attempts=e.attempts',
      'o."leaseUntil"=e."leaseUntil"', 'o."budgetId" IS NOT DISTINCT FROM e."budgetId"',
      'o."reservedCadMicros" IS NOT DISTINCT FROM e."reservedCadMicros"', 'o.request IS NOT DISTINCT FROM e.request', 'o.result IS NOT DISTINCT FROM e.result']) expect(sql).toContain(part);
  });
  it("retains all previous claim/prior processing evidence and never rewrites reserved budget or observed transport", async () => {
    await recoverExpiredPersonalSmsClaims({ enabled: true });
    const sql = shared.query.mock.calls[0][0] as string;
    expect(sql).toContain("CASE WHEN jsonb_typeof(o.result)='object' THEN o.result ELSE '{}'::jsonb END");
    expect(sql).toContain("'priorClaimResult',o.result");
    expect(sql).toContain("'processingOutcome','UNKNOWN_AFTER_WORKER_LOSS'");
    expect(sql).toContain("'automaticRetry',false"); expect(sql).toContain("'budgetReservationReleased',false");
    const assignments = sql.split('SET ')[1].split('FROM expired')[0];
    expect(assignments).not.toMatch(/"(?:budgetId|reservedCadMicros|externalTransportPerformed|requestHash)"\s*=|attempts\s*=/);
    expect(sql).not.toMatch(/UPDATE "PersonalAssistantBudget"|DELETE|INSERT|ConstructionConnectorGrant|ConstructionConnectorCredential/);
  });
  it("never reports recovery after transaction failure", async () => {
    shared.query.mockRejectedValue(new Error("synthetic transaction failure"));
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true })).rejects.toThrow("synthetic transaction failure");
  });
  it.each([NaN, Infinity, -Infinity])("refuses nonfinite deadline %s before DB access", async deadlineAt => {
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, deadlineAt })).rejects.toThrow("DEADLINE_INVALID");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("does not start after the original controller deadline", async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, deadlineAt: 1000 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("bounds transaction wait plus execution to the caller remaining lifetime", async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await recoverExpiredPersonalSmsClaims({ enabled: true, deadlineAt: 1100 });
    const options = shared.transaction.mock.calls[0][1];
    expect(options).toEqual({ isolationLevel: 'Serializable', maxWait: 25, timeout: 75 });
    expect(shared.configure).toHaveBeenCalledWith("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", '99', '99');
  });
  it("refuses SQL if transaction acquisition consumed the deadline", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    shared.transaction.mockImplementation(work => { now.mockReturnValue(1200); return work({ $queryRawUnsafe: shared.query, $executeRawUnsafe: shared.configure }); });
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(shared.query).not.toHaveBeenCalled();
    expect(shared.configure).not.toHaveBeenCalled();
  });
  it("does not start the recovery query if native timeout configuration used the remaining lifetime", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    shared.configure.mockImplementation(async () => { now.mockReturnValue(1200); return 1; });
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
    expect(shared.query).not.toHaveBeenCalled();
  });
  it("throws inside the transaction rather than acknowledging a late update", async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    shared.query.mockImplementation(async () => { now.mockReturnValue(1200); return [{ id: 'synthetic-late-row' }]; });
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, deadlineAt: 1100 })).rejects.toThrow("DEADLINE_EXCEEDED");
  });
  it("has no effect/provider imports, environment enablement, or transport access", () => {
    const source = readFileSync('src/server/personal-assistant/sms-inbound-recovery.ts', 'utf8');
    expect(source).not.toMatch(/process\.env|fetch\(|google-client|twilio|claimPersonalCalendarWrite|dispatchPersonalOutbound|ConstructionConnectorCredential/);
    expect(source.match(/^import /gm)).toHaveLength(2);
  });
  it("honors an already-aborted drain signal without database access", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, signal: controller.signal })).rejects.toThrow("ABORTED");
    expect(shared.transaction).not.toHaveBeenCalled();
  });
  it("refuses recovery SQL after cancellation during transaction-local configuration", async () => {
    const controller = new AbortController(); shared.configure.mockImplementation(async () => { controller.abort(); return 1; });
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, signal: controller.signal })).rejects.toThrow("ABORTED");
    expect(shared.query).not.toHaveBeenCalled();
  });
  it("throws inside transaction on cancellation while update was pending, never acknowledges recovery", async () => {
    const controller = new AbortController(); shared.query.mockImplementation(async () => { controller.abort(); return [{ id: "synthetic-row" }]; });
    await expect(recoverExpiredPersonalSmsClaims({ enabled: true, signal: controller.signal })).rejects.toThrow("ABORTED");
  });
});

describe("reproduction of the former global inbound sweep, isolated fake ORM only", () => {
  // Captured from sms-worker.ts before replacement. Execute that former operation
  // against a fake ORM to demonstrate its effects; never point it at a database.
  const oldSweep = async (rows: Array<{ kind: string; status: string; attempts: number; leaseUntil: Date; result: Record<string, unknown> }>, applicationTime: Date) => {
    const updateMany = ({ where, data }: { where: { kind: string; status: string; leaseUntil: { lt: Date } }; data: { status: string; result: Record<string, unknown> } }) => {
      let count = 0;
      for (const row of rows) if (row.kind === where.kind && row.status === where.status && row.leaseUntil < where.leaseUntil.lt) {
        Object.assign(row, structuredClone(data)); count++;
      }
      return { count };
    };
    return updateMany({ where: { kind: "personal_sms_inbound", status: "processing", leaseUntil: { lt: applicationTime } },
      data: { status: "uncertain", result: { reviewRequired: true, reason: "WORKER_LEASE_EXPIRED", automaticRetry: false } } });
  };
  const oldRow = (attempts = 1, expiry = 1000) => ({ kind: "personal_sms_inbound", status: "processing", attempts,
    leaseUntil: new Date(expiry), result: { durableTraceId: "synthetic-evidence", priorReview: { notAuthority: true } } });
  it("reproduces loss of previously recorded evidence", async () => {
    const row = oldRow(); await oldSweep([row], new Date(2000));
    expect(row.result.durableTraceId).toBeUndefined(); expect(row.result.priorReview).toBeUndefined();
  });
  it("reproduces an unbounded sweep and inclusion of unexpected attempts", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => oldRow(index % 3));
    expect(await oldSweep(rows, new Date(2000))).toEqual({ count: 100 });
    expect(rows.filter(row => row.attempts !== 1).every(row => row.status === "uncertain")).toBe(true);
  });
  it("reproduces early expiry when application time runs ahead of the database", async () => {
    const dbTime = 1000, row = oldRow(1, 10000);
    expect(row.leaseUntil.getTime()).toBeGreaterThan(dbTime);
    await oldSweep([row], new Date(20000)); expect(row.status).toBe("uncertain");
  });
});
