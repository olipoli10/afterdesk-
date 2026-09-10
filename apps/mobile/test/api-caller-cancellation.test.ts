import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileApi } from "../src/lib/api";
import { correlatedListFixture } from "./fixtures/correlated-calendar-list";
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const response = () => Response.json(correlatedListFixture());
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function setup(fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockResolvedValue(response())) {
  const getCookie = vi.fn(() => "synthetic-cookie");
  return { fetchImpl, getCookie, api: new MobileApi({ baseUrl: "https://synthetic.invalid", getCookie, fetchImpl }) };
}
describe("caller-scoped MobileApi cancellation, fake transport only", () => {
  it("pre-abort makes no cookie/transport call and clears its timer", async () => {
    const { api, fetchImpl, getCookie } = setup(); const caller = new AbortController(); caller.abort();
    await expect(api.personalCorrelatedCalendarReviews("workspace", caller.signal)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(getCookie).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts during a stalled fetch even if injected transport ignores signal", async () => {
    const pending = deferred<Response>(); const { api, fetchImpl } = setup(vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockReturnValue(pending.promise));
    const caller = new AbortController(), remove = vi.spyOn(caller.signal, "removeEventListener");
    const result = api.personalCorrelatedCalendarReviews("workspace", caller.signal); const assertion = expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" }); caller.abort(); await assertion;
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true); expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    pending.resolve(response()); await Promise.resolve();
  });
  it("aborts while decoding an uncooperative response body and ignores its late value", async () => {
    const body = deferred<unknown>(), decode = vi.fn(() => body.promise);
    const raw = response(); raw.json = decode;
    const { api } = setup(vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockResolvedValue(raw)); const caller = new AbortController();
    const result = api.personalCorrelatedCalendarReviews("workspace", caller.signal); const assertion = expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await Promise.resolve(); expect(decode).toHaveBeenCalled(); caller.abort(); await assertion; body.resolve(correlatedListFixture()); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("own bounded 15s timeout survives an uncooperative fetch and removes caller listener", async () => {
    const { api, fetchImpl } = setup(vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockReturnValue(new Promise(() => undefined)));
    const caller = new AbortController(), remove = vi.spyOn(caller.signal, "removeEventListener");
    const result = api.personalCorrelatedCalendarReviews("workspace", caller.signal); const assertion = expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await vi.advanceTimersByTimeAsync(15_000); await assertion;
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true); expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([200, 404, 500])("cleans listeners on status %i without changing credentials/default GET behavior", async status => {
    const { api, fetchImpl } = setup(vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockResolvedValue(status === 200 ? response() : new Response(null, { status })));
    const caller = new AbortController(), remove = vi.spyOn(caller.signal, "removeEventListener");
    const result = api.personalCorrelatedCalendarReviews("workspace", caller.signal);
    if (status === 200) await expect(result).resolves.toMatchObject({ workspaceId: "workspace", readOnly: true });
    else await expect(result).rejects.toMatchObject({ status, code: status === 404 ? "REFUSED" : "SERVER_ERROR" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://synthetic.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews?workspaceId=workspace");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "omit", headers: { Cookie: "synthetic-cookie" } });
    expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cookie exception cleans listener and timer without later rejection", async () => {
    const fetchImpl = vi.fn(); const api = new MobileApi({ getCookie: () => { throw new Error("private"); }, fetchImpl });
    const caller = new AbortController(), remove = vi.spyOn(caller.signal, "removeEventListener");
    await expect(api.personalCorrelatedCalendarReviews("workspace", caller.signal)).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(remove).toHaveBeenCalledOnce(); expect(fetchImpl).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); caller.abort(); await vi.advanceTimersByTimeAsync(15_000);
  });
  it("forged workspace or extra list fields become opaque INVALID_RESPONSE", async () => {
    const raw = correlatedListFixture(); raw.workspaceId = "foreign";
    const { api } = setup(vi.fn<(url: string, init?: RequestInit) => Promise<Response>>().mockResolvedValue(Response.json(raw)));
    await expect(api.personalCorrelatedCalendarReviews("workspace")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
