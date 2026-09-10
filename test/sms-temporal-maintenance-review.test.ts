import type { Prisma } from "@prisma-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
import { maintainSmsTemporalClarifications as maintain } from "@/server/personal-assistant/sms-temporal-maintenance";

const flags = () => ({ ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED: "true" });
const input = () => ({ actor: { userId: "owner", workspaceId: "workspace" }, deadlineAt: 3000 });
const candidate = (id: string) => ({ id, namespace: "a".repeat(64), phase: "WAITING", preparedHash: "b".repeat(64) });
let rows: ReturnType<typeof candidate>[], staged: string[], committed: string[];
const tx = { $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.execute } as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(Date, "now").mockReturnValue(1000);
  rows = [candidate("a"), candidate("b")]; staged = []; committed = [];
  mock.query.mockImplementation(async (sql: string, ...args: unknown[]) => {
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes("SELECT id,namespace")) return rows;
    if (sql.includes("pg_try_advisory")) return [{ locked: true }];
    if (sql.includes("FOR UPDATE SKIP LOCKED")) return [{ id: args[0] }];
    return [];
  });
  mock.execute.mockImplementation(async (_sql: string, id: string) => { staged.push(id); return 1; });
  mock.transaction.mockImplementation(async work => {
    try { const result = await work(tx); committed = [...staged]; return result; }
    catch (error) { staged = []; throw error; }
  });
});
afterEach(() => vi.restoreAllMocks());

describe("independent temporal expiry transaction review (synthetic SQL boundary)", () => {
  it("a second-row failure rolls back the first tentative expiry instead of publishing a partial count", async () => {
    mock.execute.mockImplementation(async (_sql: string, id: string) => {
      if (id === "b") throw new Error("synthetic deferred refusal");
      staged.push(id); return 1;
    });
    await expect(maintain(input(), flags())).rejects.toThrow("synthetic deferred refusal");
    expect(mock.execute).toHaveBeenCalledTimes(2);
    expect(staged).toEqual([]); expect(committed).toEqual([]);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });

  it("deadline expiry after the final tentative CAS still aborts inside the transaction callback", async () => {
    mock.execute.mockImplementation(async (_sql: string, id: string) => {
      staged.push(id); if (id === "b") vi.mocked(Date.now).mockReturnValue(3000); return 1;
    });
    await expect(maintain(input(), flags())).rejects.toThrow("DEADLINE");
    expect(committed).toEqual([]); expect(staged).toEqual([]);
  });

  it("a DB discovery object mutated during lock await cannot replace the captured hash or phase", async () => {
    const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql, ...args) => {
      const result = await original(sql, ...args);
      if (sql.includes("pg_try_advisory")) { rows[0].preparedHash = "c".repeat(64); rows[0].phase = "CONSUMED"; }
      return result;
    });
    expect(await maintain(input(), flags())).toMatchObject({ expired: 2, committed: true });
    expect(mock.execute.mock.calls[0].slice(5)).toEqual(["WAITING", "b".repeat(64)]);
  });

  it("a mismatched locked-row id is refused after namespace acquisition and before any CAS", async () => {
    const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql, ...args) => sql.includes("FOR UPDATE SKIP LOCKED") ? [{ id: "other" }] : original(sql, ...args));
    await expect(maintain(input(), flags())).rejects.toThrow("LOCKED_ROW_INVALID");
    expect(mock.execute).not.toHaveBeenCalled(); expect(committed).toEqual([]);
  });

  it("known commit is reported honestly even if the switch changes only after callback commit", async () => {
    const env = flags();
    mock.transaction.mockImplementation(async work => {
      const result = await work(tx); committed = [...staged];
      env.ENDVERA_SMS_TEMPORAL_MAINTENANCE_ENABLED = "false";
      return result;
    });
    expect(await maintain(input(), env)).toMatchObject({ status: "TEMPORAL_MAINTENANCE_COMMITTED", expired: 2, committed: true, executionAuthorized: false });
    expect(committed).toEqual(["a", "b"]);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
});
