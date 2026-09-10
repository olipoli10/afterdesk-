import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ gate: vi.fn(), transaction: vi.fn(), clock: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ inspectCorrelatedCalendarApprovalOfferInTransaction: m.gate }));
import { readCorrelatedCalendarApprovalOffer as read } from "@/server/personal-assistant/correlated-calendar-approval-offer";
import { correlatedCalendarOfferFixture } from "./fixtures/correlated-calendar-offer.fixture";

let f: ReturnType<typeof correlatedCalendarOfferFixture>, tick: number;
const run = () => read(f.input, f.env, { deadlineAt: Date.parse(f.now) + 5000 });
beforeEach(() => {
  vi.resetAllMocks(); f = correlatedCalendarOfferFixture(); tick = 100;
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.now)); vi.spyOn(performance, "now").mockImplementation(() => tick);
  m.gate.mockImplementation(async () => f.gate); m.clock.mockImplementation(async () => [{ now: new Date(f.now) }]);
  m.transaction.mockImplementation(work => work({ $queryRawUnsafe: m.clock }));
});
afterEach(() => vi.restoreAllMocks());

describe("offer peer: real wrapper, synthetic gate/transaction only", () => {
  it("keeps the full producer-derived texts and fingerprint immutable through commit", async () => {
    const expected = structuredClone(f.dto);
    m.transaction.mockImplementation(async work => {
      const result = await work({ $queryRawUnsafe: m.clock });
      f.gate.review.evidence.sources[1].text = "replacement";
      f.gate.view.review.packetHash = "f".repeat(64); f.gate.fingerprint = "e".repeat(64);
      return result;
    });
    const result = await run(); expect(result).toEqual(expected);
    if (!("review" in result)) throw new Error("offer expected");
    expect(Object.isFrozen(result.review.evidence.sources[1])).toBe(true);
    expect(Object.isFrozen(result.approvalOffer)).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["approvalOffer", "executionAuthorized", "explicitApprovalRequired", "readOnly", "review", "version", "workspaceId"]);
  });
  it.each(["ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT"])("refuses changed exact %s after commit", async key => {
    m.transaction.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: m.clock }); f.env[key] = key.endsWith("EXPIRES_AT") ? "2026-10-11T01:18:26Z" : "different-authority"; return result; });
    await expect(run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_OFFER_UNAVAILABLE");
  });
  it("counts callback queue time against the original phase even with wall-clock rollback", async () => {
    m.transaction.mockImplementation(async work => { tick += 5000; vi.mocked(Date.now).mockReturnValue(Date.parse(f.now) - 3600000); return work({ $queryRawUnsafe: m.clock }); });
    await expect(run()).rejects.toThrow("OFFER_UNAVAILABLE"); expect(m.gate).not.toHaveBeenCalled();
  });
  it.each([NaN, -1])("rejects nonfinite/backward monotone time %s after commit", async delta => {
    m.transaction.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: m.clock }); tick = delta; return result; });
    await expect(run()).rejects.toThrow("OFFER_UNAVAILABLE");
  });
  it("does not replace the initial cancellation channel with a caller's new signal", async () => {
    const original = new AbortController(), replacement = new AbortController();
    const context = { deadlineAt: Date.parse(f.now) + 5000, signal: original.signal };
    m.transaction.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: m.clock }); context.signal = replacement.signal; original.abort(); return result; });
    await expect(read(f.input, f.env, context)).rejects.toThrow("OFFER_UNAVAILABLE"); expect(replacement.signal.aborted).toBe(false);
  });
  it("expires exactly at the DB TTL after combined clock and commit latency", async () => {
    f.gate.approvalExpiresAt = f.gate.review.preparationExpiresAt = new Date(Date.parse(f.now) + 1000).toISOString();
    m.clock.mockImplementation(async () => { tick += 400; return [{ now: new Date(f.now) }]; });
    m.transaction.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: m.clock }); tick += 600; return result; });
    await expect(run()).rejects.toThrow("OFFER_UNAVAILABLE");
  });
});
