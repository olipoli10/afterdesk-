import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { reserveAccountProviderSpendInTransaction, resolveAccountSpendCeilingMicros } from "@/server/account-spend";
const request = { provider: "synthetic", operationKey: "synthetic-voice-operation", attempt: 1, worstCaseMicros: 300n, now: new Date("2026-09-10T12:00:00Z") };
const env = { NODE_ENV: "test" as const, ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "500" };
function fixture() {
  const lock = vi.fn().mockResolvedValue(1), find = vi.fn().mockResolvedValue(null), create = vi.fn().mockResolvedValue({ id: "hold-a" });
  const aggregate = vi.fn().mockResolvedValue({ _sum: { amountMicros: 0n, settledMicros: 0n } });
  const tx = { $executeRaw: lock, accountProviderSpendHold: { findUnique: find, create, aggregate } } as unknown as Prisma.TransactionClient;
  return { lock, find, create, aggregate, tx };
}
describe("dedicated synthetic budget is always strict in the existing ledger", () => {
  it("uses only a dedicated explicitly configured cap; no real-provider inheritance", async () => {
    for (const config of [{}, { ACCOUNT_PROVIDER_SPEND_CEILING_MICROS: "99999", ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "99999" },
      { ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "0" }, { ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "bad" }]) {
      const f = fixture();
      expect(await reserveAccountProviderSpendInTransaction(f.tx, request, { NODE_ENV: "test", ...config })).toMatchObject({ ok: false, reason: "ceiling_not_configured" });
      expect(f.create).not.toHaveBeenCalled();
    }
    expect(resolveAccountSpendCeilingMicros("synthetic", env)).toBe(500n);
  });
  it.each([{ worstCaseMicros: 0n }, { worstCaseMicros: -1n }, { worstCaseMicros: 1 }, { attempt: 0 }, { attempt: 1.5 }, { operationKey: "" }, { operationKey: 12 }])(
    "refuses malformed input before transaction calls (case %#)", async change => {
      const f = fixture();
      await expect(reserveAccountProviderSpendInTransaction(f.tx, { ...request, ...change } as never, env)).rejects.toThrow("RESERVATION_INVALID");
      expect(f.lock).not.toHaveBeenCalled(); expect(f.find).not.toHaveBeenCalled();
    },
  );
  it("reserves under the canonical provider/day lock and counts both held and settled", async () => {
    const f = fixture(); f.aggregate.mockResolvedValue({ _sum: { amountMicros: 50n, settledMicros: 100n } });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, request, env)).toMatchObject({ ok: true, grantedMicros: 300n, created: true });
    expect(f.lock.mock.invocationCallOrder[0]).toBeLessThan(f.find.mock.invocationCallOrder[0]);
    expect(f.create.mock.calls[0][0].data).toMatchObject({ provider: "synthetic", periodKey: "2026-09-10", amountMicros: 300n });
    f.aggregate.mockResolvedValue({ _sum: { amountMicros: 150n, settledMicros: 100n } });
    f.create.mockClear();
    expect(await reserveAccountProviderSpendInTransaction(f.tx, request, env)).toMatchObject({ ok: false, committedMicros: 250n });
    expect(f.create).not.toHaveBeenCalled();
  });
  it("held replay preserves the exact hold but rechecks current cap and aggregate", async () => {
    const f = fixture(); f.find.mockResolvedValue({ id: "held-a", amountMicros: 300n, periodKey: "2026-09-10", status: "held" });
    f.aggregate.mockResolvedValue({ _sum: { amountMicros: 300n, settledMicros: 0n } });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, request, env)).toMatchObject({ ok: true, created: false, holdId: "held-a" });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, request, { NODE_ENV: "test" })).toMatchObject({ ok: false, reason: "ceiling_not_configured" });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, request, { ...env, ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "299" })).toMatchObject({ ok: false });
    f.aggregate.mockResolvedValue({ _sum: { amountMicros: 300n, settledMicros: 201n } });
    expect(await reserveAccountProviderSpendInTransaction(f.tx, request, env)).toMatchObject({ ok: false, committedMicros: 501n });
    expect(f.create).not.toHaveBeenCalled();
  });
  it.each([{ worstCaseMicros: 301n }, { now: new Date("2026-09-11T00:00:00Z") }])("held replay cannot change amount or UTC day (case %#)", async change => {
    const f = fixture(); f.find.mockResolvedValue({ id: "held-a", amountMicros: 300n, periodKey: "2026-09-10", status: "held" });
    await expect(reserveAccountProviderSpendInTransaction(f.tx, { ...request, ...change }, env)).rejects.toThrow("REPLAY_CONFLICT");
    expect(f.create).not.toHaveBeenCalled();
  });
});
