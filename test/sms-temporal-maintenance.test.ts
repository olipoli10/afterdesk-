import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
import { maintainSmsTemporalClarifications as maintain, maintainSmsTemporalClarificationsInTransaction as inside } from "@/server/personal-assistant/sms-temporal-maintenance";
const env = () => ({ ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "true" });
const input = () => ({ actor: { userId: "owner", workspaceId: "workspace" }, deadlineAt: 5000 });
const tx = { $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.execute } as unknown as Prisma.TransactionClient;
const candidate = (phase = "PREPARED", id = phase, namespace = "a".repeat(64)) => ({ id, phase, namespace, preparedHash: "b".repeat(64) });
let candidates: ReturnType<typeof candidate>[];
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(Date, "now").mockReturnValue(1000); candidates = [];
  mock.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes("SELECT id,namespace")) return candidates;
    if (sql.includes("pg_try_advisory")) return [{ locked: true }];
    if (sql.includes("FOR UPDATE SKIP LOCKED")) return [{ id: args[0] }];
    return [];
  });
  mock.execute.mockResolvedValue(1); mock.transaction.mockImplementation(work => work(tx));
});
afterEach(() => vi.restoreAllMocks());

describe("OFF bounded temporal expiry maintenance, no effect recovery or authority", () => {
  it.each([{}, { ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }, { ...env(), ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "TRUE" }])("OFF before parse/DB %j", async flags => {
    expect(await maintain(undefined as never, flags)).toMatchObject({ status: "DISABLED", expired: 0, executionAuthorized: false });
    expect(await inside(tx, undefined as never, flags)).toMatchObject({ status: "DISABLED" });
    expect(mock.query).not.toHaveBeenCalled(); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 26, 1.5, NaN, Infinity])("refuses invalid batch %s before DB", async batchSize => {
    await expect(maintain({ ...input(), batchSize }, env())).rejects.toThrow("BATCH_INVALID"); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("requires exact actor and finite original deadline", async () => {
    await expect(maintain({ ...input(), actor: { userId: "", workspaceId: "workspace" } }, env())).rejects.toThrow();
    await expect(maintain({ ...input(), actor: { ...input().actor, other: "bad" } } as never, env())).rejects.toThrow();
    await expect(maintain({ ...input(), deadlineAt: Infinity }, env())).rejects.toThrow("DEADLINE_INVALID");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("requires actual SERIALIZABLE without nested transaction", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "read committed" }]);
    await expect(inside(tx, input(), env())).rejects.toThrow("SERIALIZABLE_REQUIRED");
    expect(mock.query).toHaveBeenCalledTimes(1); expect(mock.transaction).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("bounds DB statement/lock timeout and discovers at most25 using DB UTC clock, without row locks", async () => {
    expect(await inside(tx, { ...input(), batchSize: 25 }, env())).toMatchObject({ status: "TEMPORAL_MAINTENANCE_PREPARED_NOT_COMMITTED", expired: 0, committed: false });
    const [timeouts, statementMs, lockMs] = mock.query.mock.calls[1];
    expect(timeouts).toContain("statement_timeout"); expect([statementMs, lockMs]).toEqual(["2000", "250"]);
    const [sql, workspace, owner, limit] = mock.query.mock.calls[2];
    expect([workspace, owner, limit]).toEqual(["workspace", "owner", 25]);
    expect(sql).toContain("phase IN ('PREPARED','WAITING')"); expect(sql).toContain('"expiresAt"<=(clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(sql).toContain('ORDER BY "expiresAt",id LIMIT $3'); expect(sql).not.toContain("FOR UPDATE");
  });
  it("locks permanent namespace before question and CAS changes only phase plus DB updatedAt", async () => {
    candidates = [candidate("PREPARED")];
    expect(await inside(tx, input(), env())).toMatchObject({ expired: 1, executionAuthorized: false, automaticRetry: false, providerExecutionPerformed: false, budgetReservationReleased: false });
    const [, ns] = mock.query.mock.calls[3]; expect(ns).toBe(candidates[0].namespace);
    expect(mock.query.mock.calls[3][0]).toContain("pg_try_advisory_xact_lock");
    const [lockedSql, ...pins] = mock.query.mock.calls[4]; expect(lockedSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(pins).toEqual(["PREPARED", "workspace", "owner", candidates[0].namespace, "PREPARED", candidates[0].preparedHash]);
    const [cas, ...casPins] = mock.execute.mock.calls[0]; expect(casPins).toEqual(pins);
    expect(cas).toContain('SET phase=\'EXPIRED\',"updatedAt"=(clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(cas).toContain('AND "preparedHash"=$6'); expect(cas).toContain('"expiresAt"<=(clock_timestamp() AT TIME ZONE \'UTC\')');
  });
  it("orders namespaces deterministically, expires WAITING too and does not require current grants or source leases", async () => {
    candidates = [candidate("WAITING", "z", "f".repeat(64)), candidate("PREPARED", "a", "a".repeat(64))];
    expect(await inside(tx, input(), env())).toMatchObject({ expired: 2 });
    expect(mock.query.mock.calls.filter(([sql]) => sql.includes("pg_try_advisory")).map(([, ns]) => ns)).toEqual(["a".repeat(64), "f".repeat(64)]);
    const sql = [...mock.query.mock.calls, ...mock.execute.mock.calls].map(([s]) => s).join("\n");
    expect(sql).not.toMatch(/ConstructionConnector|Credential|PersonalAssistantOperation|leaseUntil|PersonalAssistantBudget|DELETE|TRUNCATE/);
  });
  it("busy namespace is skipped with no row lock, write or retry", async () => {
    candidates = [candidate()]; const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation((sql, ...args) => sql.includes("pg_try_advisory") ? [{ locked: false }] : original(sql, ...args));
    expect(await inside(tx, input(), env())).toMatchObject({ expired: 0 });
    expect(mock.query.mock.calls.filter(([sql]) => sql.includes("FOR UPDATE"))).toHaveLength(0); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("stale discovery or row busy skips without authority inference", async () => {
    candidates = [candidate()]; const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation((sql, ...args) => sql.includes("FOR UPDATE SKIP LOCKED") ? [] : original(sql, ...args));
    expect(await inside(tx, input(), env())).toMatchObject({ expired: 0 }); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("CAS0 acknowledges no update and never retries", async () => {
    candidates = [candidate()]; mock.execute.mockResolvedValueOnce(0);
    expect(await inside(tx, input(), env())).toMatchObject({ expired: 0 }); expect(mock.execute).toHaveBeenCalledTimes(1);
  });
  it.each([-1, 2, NaN])("rejects impossible CAS count %s instead of claiming success", async changed => {
    candidates = [candidate()]; mock.execute.mockResolvedValueOnce(changed);
    await expect(inside(tx, input(), env())).rejects.toThrow("CAS_INVALID"); expect(mock.execute).toHaveBeenCalledTimes(1);
  });
  it("caller actor mutation during await cannot change the captured scope", async () => {
    candidates = [candidate()]; const mutable = input(), original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql, ...args) => {
      const result = await original(sql, ...args);
      if (sql.includes("transaction_isolation")) { mutable.actor.userId = "other-owner"; mutable.actor.workspaceId = "other-workspace"; }
      return result;
    });
    expect(await inside(tx, mutable, env())).toMatchObject({ expired: 1 });
    expect(mock.execute.mock.calls[0].slice(2, 4)).toEqual(["workspace", "owner"]);
  });
  it.each(["CONSUMED", "EXPIRED", "REFUSED", "processing"])("rejects invalid discovered phase %s without mutation", async phase => {
    candidates = [candidate(phase)]; await expect(inside(tx, input(), env())).rejects.toThrow(); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("refuses overlarge or duplicate discovery without proceeding", async () => {
    candidates = Array.from({ length: 26 }, (_, n) => candidate("PREPARED", String(n)));
    await expect(inside(tx, { ...input(), batchSize: 25 }, env())).rejects.toThrow("BATCH_INVALID");
    candidates = [candidate(), candidate()]; await expect(inside(tx, input(), env())).rejects.toThrow("DUPLICATE_CANDIDATE");
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3, 4])("abort after query boundary %i fails closed", async boundary => {
    candidates = [candidate()]; const controller = new AbortController(), original = mock.query.getMockImplementation()!; let n = 0;
    mock.query.mockImplementation(async (sql, ...args) => { const result = await original(sql, ...args); if (n++ === boundary) controller.abort(); return result; });
    await expect(inside(tx, { ...input(), signal: controller.signal }, env())).rejects.toThrow("ABORTED"); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("abort or OFF after tentative CAS throws for caller rollback", async () => {
    candidates = [candidate()]; const controller = new AbortController();
    mock.execute.mockImplementationOnce(async () => { controller.abort(); return 1; });
    await expect(inside(tx, { ...input(), signal: controller.signal }, env())).rejects.toThrow("ABORTED");
    const flags = env(); mock.execute.mockImplementationOnce(async () => { flags.ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED = "false"; return 1; });
    await expect(inside(tx, input(), flags)).rejects.toThrow("DISABLED");
  });
  it("original expired deadline and initial abort prevent DB work", async () => {
    await expect(maintain({ ...input(), deadlineAt: 1000 }, env())).rejects.toThrow("DEADLINE");
    await expect(maintain({ ...input(), signal: AbortSignal.abort() }, env())).rejects.toThrow("ABORTED");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("deadline expiry after namespace acquisition prevents row selection", async () => {
    candidates = [candidate()]; const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql, ...args) => { const result = await original(sql, ...args); if (sql.includes("pg_try_advisory")) vi.mocked(Date.now).mockReturnValue(4000); return result; });
    await expect(inside(tx, input(), env())).rejects.toThrow("DEADLINE");
    expect(mock.query.mock.calls.filter(([sql]) => sql.includes("FOR UPDATE"))).toHaveLength(0);
  });
  it("only acknowledges committed count after standalone commit, bounded original deadline", async () => {
    candidates = [candidate()];
    expect(await maintain({ ...input(), deadlineAt: 1800 }, env())).toMatchObject({ status: "TEMPORAL_MAINTENANCE_COMMITTED", expired: 1, committed: true });
    expect(mock.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 200, timeout: 600 });
    const timeoutCall = mock.query.mock.calls.find(([sql]) => sql.includes("set_config")); expect(timeoutCall?.[1]).toBe("799");
  });
  it("commit failure is not reported successful and no retry is attempted", async () => {
    candidates = [candidate()]; mock.transaction.mockImplementationOnce(async work => { await work(tx); throw new Error("synthetic commit refused"); });
    await expect(maintain(input(), env())).rejects.toThrow("synthetic commit refused"); expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
  it("unchanged migration permits terminal EXPIRED and maintains the permanent shared ledger", () => {
    const sql = readFileSync("prisma/migrations/20260910130000_sms_temporal_clarification_registry/migration.sql", "utf8");
    expect(sql).toContain("OLD.phase='PREPARED' AND NEW.phase IN ('WAITING','EXPIRED','REFUSED')");
    expect(sql).toContain("OLD.phase='WAITING' AND NEW.phase IN ('CONSUMED','EXPIRED','REFUSED')");
    expect(sql).toContain("IF NEW.phase='EXPIRED' AND NEW.\"expiresAt\">clock_now");
    expect(sql).toContain("CREATE TRIGGER sms_temporal_conversation_sync AFTER INSERT OR UPDATE OF phase");
  });
});
