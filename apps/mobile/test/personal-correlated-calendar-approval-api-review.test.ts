import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileApi } from "../src/lib/api";
import { approvalOfferFixture, approvalCommandFixture, approvalResponseFixture, approvalHistoryFixture } from "./fixtures/correlated-calendar-approval";
type Kind = "offer" | "result" | "approve";
const rawFor = (kind: Kind) => kind === "offer" ? approvalOfferFixture() : kind === "result" ? approvalHistoryFixture() : approvalResponseFixture();
const call = (api: MobileApi, kind: Kind, signal?: AbortSignal) => kind === "offer" ? api.personalCorrelatedCalendarApprovalOffer("workspace", "review", signal)
  : kind === "result" ? api.personalCorrelatedCalendarApprovalResult("workspace", "review", signal) : api.approvePersonalCorrelatedCalendar(approvalCommandFixture(), signal);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const setup = (raw: unknown) => { const getCookie = vi.fn(() => "synthetic-cookie"), fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => raw });
  return { api: new MobileApi({ baseUrl: "https://synthetic.invalid", fetchImpl, getCookie, timeoutMs: 1 }), getCookie, fetchImpl }; };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("peer correlated API boundaries — injected fetch/body, no real network", () => {
  it.each(["offer", "result", "approve"] as const)("original abort cancels %s while response.json ignores cancellation", async kind => {
    const h = setup(null), body = deferred<unknown>(), c = new AbortController(), remove = vi.spyOn(c.signal, "removeEventListener"); let reading = false;
    h.fetchImpl.mockResolvedValue({ ok: true, json: () => { reading = true; return body.promise; } });
    const pending = call(h.api, kind, c.signal), rejected = expect(pending).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await vi.waitFor(() => expect(reading).toBe(true)); c.abort(); await rejected; body.resolve(rawFor(kind)); await Promise.resolve(); await Promise.resolve();
    expect(h.fetchImpl).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce(); expect(h.fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it.each(["offer", "result", "approve"] as const)("%s treats opaque200 UNKNOWN as invalid, never another request", async kind => {
    const h = setup({ status: "UNKNOWN", automaticRetry: false }); await expect(call(h.api, kind)).rejects.toMatchObject({ code: "INVALID_RESPONSE" }); expect(h.fetchImpl).toHaveBeenCalledOnce();
  });
  it.each(["offer", "result", "approve"] as const)("%s response accessor is refused without execution", async kind => {
    const raw = rawFor(kind); let getterCalls = 0; Object.defineProperty(raw, "workspaceId", { enumerable: true, get() { getterCalls++; return "workspace"; } });
    const h = setup(raw); await expect(call(h.api, kind)).rejects.toMatchObject({ code: "INVALID_RESPONSE" }); expect(getterCalls).toBe(0); expect(h.fetchImpl).toHaveBeenCalledOnce();
  });
  it.each(["offer", "result"] as const)("GET %s uses15s body deadline even when caller default is1ms", async kind => {
    vi.useFakeTimers(); const h = setup(null), body = deferred<unknown>(); h.fetchImpl.mockResolvedValue({ ok: true, json: () => body.promise }); let done = false;
    const pending = call(h.api, kind).finally(() => { done = true; }), assertion = expect(pending).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    await vi.advanceTimersByTimeAsync(14999); expect(done).toBe(false); await vi.advanceTimersByTimeAsync(1); await assertion;
    expect(done).toBe(true); expect(h.fetchImpl).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); body.resolve(rawFor(kind));
  });
  it("POST snapshots the command before credential callback can mutate the caller object", async () => {
    const raw = approvalCommandFixture(), original = { ...raw }, fetchImpl = vi.fn().mockResolvedValue(Response.json(approvalResponseFixture()));
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", fetchImpl, getCookie: () => { raw.reviewId = "mutated"; raw.expectedRequestHash = "f".repeat(64); return "synthetic-cookie"; } });
    await api.approvePersonalCorrelatedCalendar(raw); expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(original); expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("cookie exception cleans30s timer and cannot begin POST", async () => {
    vi.useFakeTimers(); const fetchImpl = vi.fn(), getCookie = vi.fn(() => { throw new Error("synthetic cookie failure"); });
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", fetchImpl, getCookie });
    await expect(api.approvePersonalCorrelatedCalendar(approvalCommandFixture())).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" }); expect(fetchImpl).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("browser-managed credentials never read native cookies or attach a Cookie header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(approvalResponseFixture())), getCookie = vi.fn(() => "not-read");
    const api = new MobileApi({ baseUrl: "https://synthetic.invalid", fetchImpl, getCookie, browserManagedCredentials: true }); await api.approvePersonalCorrelatedCalendar(approvalCommandFixture());
    expect(getCookie).not.toHaveBeenCalled(); expect(fetchImpl.mock.calls[0][1].credentials).toBe("include"); expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty("Cookie");
  });
  it("GET identifiers are encoded independently, never converted into query routing", async () => {
    const workspaceId = "workspace/?é", reviewId = "review#&next", raw = approvalOfferFixture(); raw.workspaceId = workspaceId; raw.review.reviewId = raw.approvalOffer.reviewId = reviewId;
    const h = setup(raw); await h.api.personalCorrelatedCalendarApprovalOffer(workspaceId, reviewId);
    expect(h.fetchImpl.mock.calls[0][0]).toBe(`https://synthetic.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer?workspaceId=${encodeURIComponent(workspaceId)}&reviewId=${encodeURIComponent(reviewId)}`);
    expect(h.fetchImpl.mock.calls[0][1]).toMatchObject({ method: "GET" }); expect(h.fetchImpl.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("offer API returns a frozen detached source snapshot", async () => {
    const raw = approvalOfferFixture(), h = setup(raw), offer = await h.api.personalCorrelatedCalendarApprovalOffer("workspace", "review"); const text = offer.review.evidence.sources[0].text;
    raw.review.evidence.sources[0].text = "replaced"; expect(offer.review.evidence.sources[0].text).toBe(text); expect(Object.isFrozen(offer.review.evidence.sources[0])).toBe(true);
  });
});
