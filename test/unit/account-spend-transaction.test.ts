import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { reserveAccountProviderSpend, reserveAccountProviderSpendInTransaction, resolveAccountSpendCeilingMicros } from "@/server/account-spend";
const shared = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
const input = { provider: "openrouter", operationKey: "synthetic-operation", attempt: 1, worstCaseMicros: 300n, now: new Date("2026-09-10T02:00:00Z") };
function fixture() {
  const lock = vi.fn().mockResolvedValue(1);
  const find = vi.fn().mockResolvedValue(null);
  const aggregate = vi.fn().mockResolvedValue({ _sum: { amountMicros: 0n, settledMicros: 0n } });
  const create = vi.fn().mockResolvedValue({ id: "synthetic-hold" });
  const tx = { $executeRaw: lock, accountProviderSpendHold: { findUnique: find, aggregate, create } } as unknown as Prisma.TransactionClient;
  return { tx, lock, find, aggregate, create };
}
beforeEach(() => vi.clearAllMocks());
describe("composable account reservation", () => {
  it("uses only the passed transaction and holds the provider/day lock before reading spend", async () => {
    const f = fixture();
    expect(await reserveAccountProviderSpendInTransaction(f.tx, input, { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "500" })).toMatchObject({ ok: true, grantedMicros: 300n, created: true });
    expect(shared.transaction).not.toHaveBeenCalled();
    expect(f.lock.mock.invocationCallOrder[0]).toBeLessThan(f.find.mock.invocationCallOrder[0]);
    expect(f.find.mock.invocationCallOrder[0]).toBeLessThan(f.create.mock.invocationCallOrder[0]);
    expect(f.create.mock.calls[0][0].data).toMatchObject({ provider: "openrouter", amountMicros: 300n, periodKey: "2026-09-10" });
  });
  it("counts held and settled amounts and refuses before creating a hold", async () => {
    const f = fixture();
    f.aggregate.mockResolvedValue({ _sum: { amountMicros: 150n, settledMicros: 100n } });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, input, { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "500" })).toMatchObject({ ok: false, reason: "would_exceed_account_ceiling", committedMicros: 250n });
    expect(f.create).not.toHaveBeenCalled();
  });
  it("requires a dedicated OpenRouter ceiling even outside production", async () => {
    for (const env of [{}, { ACCOUNT_PROVIDER_SPEND_CEILING_MICROS: "9999999" }, { ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "invalid" }]) {
      const f = fixture();
      expect(await reserveAccountProviderSpendInTransaction(f.tx, input, { NODE_ENV: "test", ...env })).toMatchObject({ ok: false, reason: "ceiling_not_configured" });
      expect(f.create).not.toHaveBeenCalled();
    }
    expect(resolveAccountSpendCeilingMicros("openrouter", { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "500" })).toBe(500n);
  });
  it("keeps historical Anthropic fallback and unconfigured development behavior", async () => {
    expect(resolveAccountSpendCeilingMicros("anthropic", { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_MICROS: "500" })).toBe(500n);
    expect(resolveAccountSpendCeilingMicros("voyage", { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_MICROS: "500" })).toBeNull();
    expect(await reserveAccountProviderSpendInTransaction(fixture().tx, { ...input, provider: "anthropic" }, { NODE_ENV: "test" })).toMatchObject({ ok: true });
    expect(await reserveAccountProviderSpendInTransaction(fixture().tx, { ...input, provider: "anthropic" }, { NODE_ENV: "production" })).toMatchObject({ ok: false, reason: "ceiling_not_configured" });
  });
  it("preserves a same-day replay hold only under the current explicit ceiling", async () => {
    const f = fixture();
    f.find.mockResolvedValue({ id: "original", status: "held", amountMicros: 300n, periodKey: "2026-09-10" });
    f.aggregate.mockResolvedValue({ _sum: { amountMicros: 300n, settledMicros: 0n } });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, input, { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "500" })).toEqual({ ok: true, holdId: "original", grantedMicros: 300n, periodKey: "2026-09-10", created: false });
    expect(f.create).not.toHaveBeenCalled();
    await expect(reserveAccountProviderSpendInTransaction(f.tx, { ...input, worstCaseMicros: 301n }, { NODE_ENV: "test" })).rejects.toThrow("REPLAY_CONFLICT");
  });
  it("refuses held replay when the cap is removed, reduced, or the day changes", async () => {
    const f = fixture();
    f.find.mockResolvedValue({ id: "original", status: "held", amountMicros: 300n, periodKey: "2026-09-10" });
    f.aggregate.mockResolvedValue({ _sum: { amountMicros: 300n, settledMicros: 50n } });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, input, { NODE_ENV: "test" })).toMatchObject({ ok: false, reason: "ceiling_not_configured" });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, input, { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "320" })).toMatchObject({ ok: false, reason: "would_exceed_account_ceiling" });
    await expect(reserveAccountProviderSpendInTransaction(f.tx, { ...input, now: new Date("2026-09-11T02:00:00Z") }, { NODE_ENV: "test", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "500" })).rejects.toThrow("REPLAY_CONFLICT");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("rejects invalid OpenRouter reservation amounts before touching the transaction", async () => {
    for (const change of [{ worstCaseMicros: 0n }, { worstCaseMicros: -1n }, { attempt: 0 }, { operationKey: "" }]) {
      const f = fixture();
      await expect(reserveAccountProviderSpendInTransaction(f.tx, { ...input, ...change }, { NODE_ENV: "test" })).rejects.toThrow("RESERVATION_INVALID");
      expect(f.lock).not.toHaveBeenCalled();
    }
  });
  it("preserves the legacy standalone wrapper transaction", async () => {
    const f = fixture();
    shared.transaction.mockImplementation(callback => callback(f.tx));
    const held = { id: "prior", status: "held", amountMicros: 300n, periodKey: "2026-09-10" };
    f.find.mockResolvedValue(held);
    expect(await reserveAccountProviderSpend({ ...input, provider: "anthropic" })).toMatchObject({ ok: true, holdId: "prior" });
    expect(shared.transaction).toHaveBeenCalledTimes(1);
  });
});
