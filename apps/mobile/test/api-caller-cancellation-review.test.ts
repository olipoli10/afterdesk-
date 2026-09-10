import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileApi } from "../src/lib/api";
import { correlatedListFixture } from "./fixtures/correlated-calendar-list";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("independent caller abort settlement boundaries — injected HTTP only", () => {
  it("abort queued at request cleanup must still refuse before public DTO return", async () => {
    const caller = new AbortController(), originalRemove = caller.signal.removeEventListener.bind(caller.signal);
    vi.spyOn(caller.signal, "removeEventListener").mockImplementation((...args) => {
      originalRemove(...args);
      // Observation point: private request has checked its signal, but its outer
      // caller has not yet resumed after await to parse/return the DTO.
      queueMicrotask(() => caller.abort());
    });
    const fetchImpl = vi.fn(async () => Response.json(correlatedListFixture()));
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => "", fetchImpl });
    const pending = api.personalCorrelatedCalendarReviews("workspace", caller.signal);
    await expect(pending).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(caller.signal.aborted).toBe(true); expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("abort during synchronous cookie lookup performs no HTTP and leaves no timer", async () => {
    vi.useFakeTimers(); const caller = new AbortController(), fetchImpl = vi.fn();
    const api = new MobileApi({ getCookie: () => { caller.abort(); return ""; }, fetchImpl });
    await expect(api.personalCorrelatedCalendarReviews("workspace", caller.signal)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("synchronous transport failure removes exactly the registered listener", async () => {
    vi.useFakeTimers(); const caller = new AbortController();
    const add = vi.spyOn(caller.signal, "addEventListener"), remove = vi.spyOn(caller.signal, "removeEventListener");
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie: () => "", fetchImpl: () => { throw new Error("synthetic failure"); } });
    await expect(api.personalCorrelatedCalendarReviews("workspace", caller.signal)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(remove).toHaveBeenCalledTimes(1); expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0); caller.abort(); await Promise.resolve();
  });
});
