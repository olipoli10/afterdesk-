import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvalOfferFixture, approvalResponseFixture, approvalHistoryFixture } from "./fixtures/correlated-calendar-approval";
import { listNow } from "./fixtures/correlated-calendar-list";
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const storage = () => { const rows = new Map<string, string>(); return { rows, getItemAsync: vi.fn(async (key: string) => rows.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), deleteItemAsync: vi.fn(async () => undefined) }; };
beforeEach(() => { vi.resetModules(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function setup(store = storage()) {
  const { createCorrelatedCalendarApprovalAttempts } = await import("../src/lib/personal-correlated-calendar-approval-attempts");
  const { createCorrelatedCalendarApprovalLifecycle } = await import("../src/lib/personal-correlated-calendar-approval-lifecycle");
  let wall = listNow, mono = 1000, current = true;
  const attempts = createCorrelatedCalendarApprovalAttempts({ ownerId: "owner", apiOrigin: "https://local.example", store });
  const readOffer = vi.fn(async () => approvalOfferFixture()), readResult = vi.fn(async () => approvalHistoryFixture()), approve = vi.fn(async () => approvalResponseFixture());
  const lifecycle = createCorrelatedCalendarApprovalLifecycle({ workspaceId: "workspace", attempts, isCurrentScope: () => current,
    readOffer, readResult, approve, wallNow: () => wall, monotoneNow: () => mono });
  lifecycle.activate(); await settle();
  return { lifecycle, attempts, readOffer, readResult, approve, store, setWall: (n: number) => { wall = n; }, setMono: (n: number) => { mono = n; }, setScope: (n: boolean) => { current = n; } };
}
describe("explicit approval lifecycle with real synthetic durable registry", () => {
  it("hydrates without GET offer or POST then requires separate select and send gestures", async () => {
    const f = await setup(); expect(f.lifecycle.getSnapshot().phase).toBe("IDLE"); expect(f.readOffer).not.toHaveBeenCalled(); expect(f.approve).not.toHaveBeenCalled();
    await f.lifecycle.select("review"); expect(f.readResult).toHaveBeenCalledOnce(); expect(f.readOffer).toHaveBeenCalledOnce(); expect(f.approve).not.toHaveBeenCalled();
    await f.lifecycle.send(); expect(f.approve).toHaveBeenCalledOnce(); expect(f.store.setItemAsync).toHaveBeenCalledOnce(); expect(f.lifecycle.getSnapshot().phase).toBe("RESULT");
  });
  it("double tap synchronously reserves and sends once", async () => {
    const f = await setup(); await f.lifecycle.select("review"); await Promise.all([f.lifecycle.send(), f.lifecycle.send()]); expect(f.approve).toHaveBeenCalledOnce(); expect(f.store.setItemAsync).toHaveBeenCalledOnce();
  });
  it("never posts until exact persistent read-back has resolved", async () => {
    const f = await setup(); await f.lifecycle.select("review"); const gate = deferred<string | null>();
    f.store.getItemAsync.mockImplementationOnce(async () => null).mockImplementationOnce(() => gate.promise);
    const pending = f.lifecycle.send(); await settle(); expect(f.store.setItemAsync).toHaveBeenCalledOnce(); expect(f.approve).not.toHaveBeenCalled();
    gate.resolve([...f.store.rows.values()][0]); await pending; expect(f.approve).toHaveBeenCalledOnce();
  });
  it("persist failure blocks POST and refresh cannot rearm same review", async () => {
    const f = await setup(); f.store.setItemAsync.mockRejectedValue(new Error("STORAGE_FAILED")); await f.lifecycle.select("review"); await f.lifecycle.send();
    expect(f.approve).not.toHaveBeenCalled(); expect(f.lifecycle.getSnapshot().phase).toBe("UNKNOWN"); await f.lifecycle.select("review"); await f.lifecycle.send(); expect(f.readOffer).toHaveBeenCalledOnce(); expect(f.approve).not.toHaveBeenCalled();
  });
  it("module reset reloads same durable marker and permits C3 GET only", async () => {
    const f = await setup(); await f.lifecycle.select("review"); f.approve.mockRejectedValue(new Error("LOST_REPLY")); await f.lifecycle.send(); expect(f.approve).toHaveBeenCalledOnce(); f.lifecycle.pause();
    vi.resetModules(); const restarted = await setup(f.store); expect(restarted.lifecycle.getSnapshot().markers).toHaveLength(1);
    await restarted.lifecycle.select("review"); await restarted.lifecycle.send(); await restarted.lifecycle.history("review");
    expect(restarted.readResult).toHaveBeenCalledTimes(2); expect(restarted.readOffer).not.toHaveBeenCalled(); expect(restarted.approve).not.toHaveBeenCalled();
  });
  it("expired stored marker remains listed without reading expired texts", async () => {
    const f = await setup(); await f.lifecycle.select("review"); f.approve.mockRejectedValue(new Error("LOST_REPLY")); await f.lifecycle.send(); f.lifecycle.pause();
    f.setWall(listNow + 900000); f.lifecycle.activate(); await settle(); expect(f.lifecycle.getSnapshot().markers).toHaveLength(1); await f.lifecycle.history("review"); expect(f.readOffer).toHaveBeenCalledOnce(); expect(f.approve).toHaveBeenCalledOnce();
  });
  it("an existing server attempt without local marker prevents offer/POST", async () => {
    const f = await setup(); f.readResult.mockResolvedValue({ ...approvalHistoryFixture(), outcome: "PENDING_RESULT", approvedAt: "2026-09-11T04:01:00.000Z" } as ReturnType<typeof approvalHistoryFixture>);
    await f.lifecycle.select("review"); await f.lifecycle.send(); expect(f.lifecycle.getSnapshot().phase).toBe("RESULT"); expect(f.readOffer).not.toHaveBeenCalled(); expect(f.approve).not.toHaveBeenCalled();
  });
  it("offer transport latency consumes remaining server window on slow phone", async () => {
    const f = await setup(); f.setWall(listNow - 60000); f.readOffer.mockImplementation(async () => { f.setMono(362000); return approvalOfferFixture(); });
    await f.lifecycle.select("review"); await f.lifecycle.send(); expect(f.lifecycle.getSnapshot().phase).toBe("EXPIRED"); expect(f.approve).not.toHaveBeenCalled();
  });
  it("backward clock invalidates permanently until a new selection", async () => {
    const f = await setup(); await f.lifecycle.select("review"); f.setWall(listNow - 1); expect(f.lifecycle.getSnapshot().phase).toBe("EXPIRED"); f.setWall(listNow); expect(f.lifecycle.getSnapshot().offer).toBeNull(); await f.lifecycle.send(); expect(f.approve).not.toHaveBeenCalled();
  });
  it("offer expiry at tap sends nothing and leaves no spurious durable attempt", async () => {
    const f = await setup(); await f.lifecycle.select("review"); f.setMono(361000); await f.lifecycle.send(); expect(f.lifecycle.getSnapshot().phase).toBe("EXPIRED"); expect(f.store.setItemAsync).not.toHaveBeenCalled(); expect(f.approve).not.toHaveBeenCalled();
  });
  it("pause during POST retains marker but hides late confirmed reply", async () => {
    const f = await setup(); await f.lifecycle.select("review"); const gate = deferred<ReturnType<typeof approvalResponseFixture>>(); f.approve.mockReturnValue(gate.promise);
    const pending = f.lifecycle.send(); await settle(); expect(f.approve).toHaveBeenCalledOnce(); f.lifecycle.pause(); gate.resolve(approvalResponseFixture()); await pending;
    expect(f.lifecycle.getSnapshot().result).toBeNull(); f.lifecycle.activate(); await settle(); expect(f.lifecycle.getSnapshot().markers).toHaveLength(1); expect(f.approve).toHaveBeenCalledOnce();
  });
  it("selecting another card while an offer reads never combines old evidence with new hashes", async () => {
    const f = await setup(); const gate = deferred<ReturnType<typeof approvalOfferFixture>>(); f.readOffer.mockReturnValueOnce(gate.promise);
    const first = f.lifecycle.select("review"); await settle(); f.readResult.mockResolvedValue({ ...approvalHistoryFixture(), reviewId: "other" });
    f.readOffer.mockResolvedValue({ ...approvalOfferFixture(), review: { ...approvalOfferFixture().review, reviewId: "other" }, approvalOffer: { ...approvalOfferFixture().approvalOffer, reviewId: "other" } });
    await f.lifecycle.select("other"); gate.resolve(approvalOfferFixture()); await first; expect(f.lifecycle.getSnapshot().offer?.review.reviewId).toBe("other"); expect(f.approve).not.toHaveBeenCalled();
  });
});
