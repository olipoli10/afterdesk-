import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
import { maintainCalendarSmsConfirmations, maintainCalendarSmsConfirmationsInTransaction } from "@/server/personal-assistant/calendar-confirmation-maintenance";

const env = () => ({ ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED: "true" });
const input = () => ({ actor: { userId: "owner", workspaceId: "workspace" }, deadlineAt: 5000 });
const tx = { $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.execute } as unknown as Prisma.TransactionClient;
const candidate = (phase: string, id = phase) => ({ id, phase, calendarOperationId: `calendar-${id}`, calendarHash: "a".repeat(64) });
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(Date, "now").mockReturnValue(1000);
  mock.query.mockImplementation(async sql => sql.includes("transaction_isolation") ? [{ isolation: "serializable" }] : []);
  mock.execute.mockResolvedValue(1); mock.transaction.mockImplementation(work => work(tx));
});
afterEach(() => vi.restoreAllMocks());

describe("OFF bounded calendar confirmation maintenance", () => {
  it.each([{}, { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true" }, { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED: "TRUE" }])("is OFF before accessing input or database: %j", async flags => {
    expect(await maintainCalendarSmsConfirmations(undefined as never, flags)).toMatchObject({ status: "DISABLED", executionAuthorized: false });
    expect(await maintainCalendarSmsConfirmationsInTransaction(tx, undefined as never, flags)).toMatchObject({ status: "DISABLED" });
    expect(mock.query).not.toHaveBeenCalled(); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 26, 1.5, NaN, Infinity])("refuses invalid batch %s before database access", async batchSize => {
    await expect(maintainCalendarSmsConfirmations({ ...input(), batchSize }, env())).rejects.toThrow("BATCH_INVALID");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("requires a strict explicit actor scope", async () => {
    await expect(maintainCalendarSmsConfirmations({ ...input(), actor: { userId: "", workspaceId: "workspace" } }, env())).rejects.toThrow();
    await expect(maintainCalendarSmsConfirmations({ ...input(), actor: { userId: "owner", workspaceId: "workspace", other: "refused" } } as never, env())).rejects.toThrow();
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("requires a Serializable caller transaction without silently creating a nested transaction", async () => {
    mock.query.mockResolvedValue([{ isolation: "read committed" }]);
    await expect(maintainCalendarSmsConfirmationsInTransaction(tx, input(), env())).rejects.toThrow("SERIALIZABLE_REQUIRED");
    expect(mock.query).toHaveBeenCalledTimes(1); expect(mock.execute).not.toHaveBeenCalled(); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("bounds selection to exact actor, eligible phases, DB clock and twenty-five locked challenges", async () => {
    const result = await maintainCalendarSmsConfirmationsInTransaction(tx, { ...input(), batchSize: 25 }, env());
    const [sql, workspace, user, limit] = mock.query.mock.calls[1];
    expect([workspace, user, limit]).toEqual(["workspace", "owner", 25]);
    expect(sql).toContain('c."workspaceId"=$1 AND c."userId"=$2');
    expect(sql).toContain("c.phase IN ('PREPARED','WAITING') AND c.\"expiresAt\"<=clock_timestamp()");
    expect(sql).toContain("c.phase='CONSUMED' AND EXISTS");
    expect(sql).toContain("d.kind='calendar_write' AND d.attempts=1 AND d.status IN ('completed','uncertain')");
    expect(sql).toContain("ORDER BY c.\"updatedAt\",c.id LIMIT $3 FOR UPDATE OF c SKIP LOCKED");
    expect(result).toMatchObject({ status: "CONFIRMATION_MAINTENANCE_PREPARED_NOT_COMMITTED", expired: 0, completed: 0, uncertain: 0 });
    expect(mock.execute).not.toHaveBeenCalled(); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("expires only exact expired PREPARED/WAITING claims and counts actual CAS acknowledgements", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "serializable" }]).mockResolvedValueOnce([candidate("PREPARED"), candidate("WAITING")]);
    mock.execute.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await maintainCalendarSmsConfirmationsInTransaction(tx, input(), env())).toMatchObject({ expired: 1, completed: 0, uncertain: 0 });
    for (const call of mock.execute.mock.calls) {
      expect(call[0]).toContain("phase='EXPIRED'"); expect(call[0]).toContain('"workspaceId"=$2 AND "userId"=$3 AND phase=$4 AND "expiresAt"<=clock_timestamp()');
      expect(call.slice(2, 4)).toEqual(["workspace", "owner"]);
    }
  });
  it("reconciles only the exact locked calendar terminal state after locking its challenge", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "serializable" }]).mockResolvedValueOnce([candidate("CONSUMED", "one"), candidate("CONSUMED", "two")])
      .mockResolvedValueOnce([{ status: "completed" }]).mockResolvedValueOnce([{ status: "uncertain" }]);
    const result = await maintainCalendarSmsConfirmationsInTransaction(tx, input(), env());
    expect(result).toMatchObject({ expired: 0, completed: 1, uncertain: 1, executionAuthorized: false, automaticRetry: false, budgetReservationReleased: false });
    expect(mock.query.mock.calls[2][0]).toContain("FOR SHARE SKIP LOCKED");
    expect(mock.query.mock.calls[2].slice(1)).toEqual(["calendar-one", "workspace", "owner", "a".repeat(64)]);
    expect(mock.execute.mock.calls[0][0]).toContain("phase='CONSUMED' AND \"calendarOperationId\"=$4");
    expect(mock.execute.mock.calls[0].slice(1)).toEqual(["one", "workspace", "owner", "calendar-one", "COMPLETED", "a".repeat(64)]);
    expect(mock.execute.mock.calls[1][5]).toBe("UNCERTAIN");
  });
  it("skips locked, missing or no-longer-matching calendars without guessing terminal success", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "serializable" }]).mockResolvedValueOnce([candidate("CONSUMED")]).mockResolvedValueOnce([]);
    expect(await maintainCalendarSmsConfirmationsInTransaction(tx, input(), env())).toMatchObject({ expired: 0, completed: 0, uncertain: 0 });
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it("sets local SQL limits in the standalone transaction and acknowledges only after commit", async () => {
    const result = await maintainCalendarSmsConfirmations(input(), env());
    expect(mock.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 2000 });
    expect(mock.execute).toHaveBeenCalledExactlyOnceWith("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", "2000", "250");
    expect(result.status).toBe("CONFIRMATION_MAINTENANCE_COMMITTED"); expect(Object.isFrozen(result)).toBe(true);
    mock.transaction.mockRejectedValue(new Error("synthetic commit failure"));
    await expect(maintainCalendarSmsConfirmations(input(), env())).rejects.toThrow("synthetic commit failure");
  });
  it.each([NaN, Infinity, -Infinity])("refuses invalid controller deadline %s", async deadlineAt => {
    await expect(maintainCalendarSmsConfirmations({ ...input(), deadlineAt }, env())).rejects.toThrow("DEADLINE_INVALID");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("does not start after cancellation or deadline", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(maintainCalendarSmsConfirmations({ ...input(), signal: controller.signal }, env())).rejects.toThrow("ABORTED");
    await expect(maintainCalendarSmsConfirmations({ ...input(), deadlineAt: 1000 }, env())).rejects.toThrow("DEADLINE");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("refuses mutation if selection latency expires the deadline", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "serializable" }]).mockImplementationOnce(async () => { vi.mocked(Date.now).mockReturnValue(5000); return [candidate("WAITING")]; });
    await expect(maintainCalendarSmsConfirmationsInTransaction(tx, input(), env())).rejects.toThrow("DEADLINE");
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it("rejects a late mutation acknowledgement inside the caller transaction", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "serializable" }]).mockResolvedValueOnce([candidate("WAITING")]);
    mock.execute.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(5000); return 1; });
    await expect(maintainCalendarSmsConfirmationsInTransaction(tx, input(), env())).rejects.toThrow("DEADLINE");
  });
  it("honors the stop flag after a read rather than returning stale provisional counts", async () => {
    const flags = env(); mock.query.mockResolvedValueOnce([{ isolation: "serializable" }]).mockImplementationOnce(async () => {
      flags.ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED = "false"; return [candidate("WAITING")];
    });
    await expect(maintainCalendarSmsConfirmationsInTransaction(tx, input(), flags)).rejects.toThrow("MAINTENANCE_DISABLED");
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it("imports no effects, grants or secrets and mutates only challenge phase/timestamp", () => {
    const source = readFileSync("src/server/personal-assistant/calendar-confirmation-maintenance.ts", "utf8");
    expect(source).not.toMatch(/executeClaimed|sendPersonal|fetch\(|Nonce|PersonalAssistantBudget|ConstructionConnectorCredential|ConstructionConnectorGrant|DELETE\s|INSERT\s/);
    expect(source.match(/UPDATE "PersonalCalendarSmsConfirmation" SET/g)).toHaveLength(2);
    expect(source).not.toMatch(/UPDATE "PersonalAssistantOperation"/);
  });
});
