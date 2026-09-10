import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-offer", async original => ({ ...await original<object>(), readCorrelatedCalendarApprovalOffer: m.read }));
import * as route from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer/route";
import { correlatedCalendarOfferFixture } from "./fixtures/correlated-calendar-offer.fixture";
const url = "https://local.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer", valid = "?workspaceId=workspace&reviewId=review";
let f: ReturnType<typeof correlatedCalendarOfferFixture>;
const get = (query = valid, signal?: AbortSignal) => route.GET(new Request(url + query, { signal }));
async function check(response: Response, status: number) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  if (status !== 200) expect(await response.clone().text()).not.toMatch(/secret|SELECT|stack|inspection|credential|approvalToken/);
  return response;
}
beforeEach(() => {
  vi.resetAllMocks(); f = correlatedCalendarOfferFixture(); for (const [key, value] of Object.entries(f.env)) vi.stubEnv(key, value);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.now)); vi.spyOn(performance, "now").mockReturnValue(1000);
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true); m.read.mockImplementation(async () => f.dto);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("individual offer GET from an existing selected card", () => {
  it("has no POST or replacement collection", () => { expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]); expect(route.dynamic).toBe("force-dynamic"); expect(route.runtime).toBe("nodejs"); });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED"])("OFF %s precedes auth", async key => { vi.stubEnv(key, "false"); await check(await get(), 404); expect(m.auth).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled(); });
  it("returns the exact gate-shaped review/offer, with source IDs but no calendar operation handle", async () => {
    const response = await check(await get(), 200); expect(await response.json()).toEqual(f.dto);
    expect(m.limit).toHaveBeenCalledExactlyOnceWith("personal-correlated-calendar-approval-offer:owner", { window: 60, max: 30 });
    expect(m.read).toHaveBeenCalledOnce(); expect(m.read.mock.calls[0][0]).toEqual(f.input);
  });
  it("requires authenticated session, not caller headers", async () => {
    const request = new Request(url + valid, { headers: { "x-user-id": "intruder", "x-workspace-id": "other" } }); await check(await route.GET(request), 200);
    expect(m.read.mock.calls[0][0].actor).toEqual(f.input.actor); m.auth.mockResolvedValue(null); await check(await get(), 401); expect(m.read).toHaveBeenCalledTimes(1);
  });
  it.each([{ role: "ADMIN" }, { role: "VA" }, { emailVerified: "true" }, { emailVerified: false }, { id: null }, { id: "" }, { id: " owner" }, { id: "x".repeat(192) }])("refuses invalid session %j", async delta => {
    m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true, ...delta }); await check(await get(), 404); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["", "?workspaceId=workspace", "?reviewId=review", "?workspaceId=%20&reviewId=review", "?workspaceId=workspace&reviewId=", `${valid}&reviewId=other`, `${valid}&review%49d=other`,
    `${valid}&workspaceId=other`, `${valid}&view=approval-v1`, `${valid}&actorUserId=other`, `${valid}&operationId=other`, `${valid}&approvalToken=other`,
    `?workspaceId=${"w".repeat(192)}&reviewId=review`, `?workspaceId=workspace&reviewId=${"r".repeat(192)}`])("rejects query %s instead of choosing another card", async query => {
    await check(await get(query), 400); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each([false, 1, "true", null])("only true rate result allows gate %j", async allowed => { m.limit.mockResolvedValue(allowed); await check(await get(), 429); expect(m.read).not.toHaveBeenCalled(); });
  it.each(["auth", "limit", "read"] as const)("%s failure remains opaque", async stage => { m[stage].mockRejectedValue(new Error("SELECT secret inspection credential")); await check(await get(), 503); });
  it.each(["auth", "limit", "read"] as const)("abort during %s prevents disclosure", async stage => {
    const ac = new AbortController(); m[stage].mockImplementation(async () => { ac.abort(); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : f.dto; });
    await check(await get(valid, ac.signal), 503);
  });
  it.each(["auth", "limit", "read"] as const)("approval gate withdrawn during %s gives404", async stage => {
    m[stage].mockImplementation(async () => { vi.stubEnv("ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "false"); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : f.dto; }); await check(await get(), 404);
  });
  it("auth/limiter share total5s with monotone protection", async () => {
    m.auth.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(5900); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    m.limit.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(6000); vi.mocked(Date.now).mockReturnValue(0); return true; }); await check(await get(), 503); expect(m.read).not.toHaveBeenCalled();
  });
  it("pre-aborted request never authenticates", async () => { const ac = new AbortController(); ac.abort(); await check(await get(valid, ac.signal), 503); expect(m.auth).not.toHaveBeenCalled(); });
  it("snapshots selected card URL/signal and copies actor before limiter await", async () => {
    const request = new Request(url + valid), signal = request.signal, user = { id: "owner", role: "CLIENT", emailVerified: true };
    m.auth.mockImplementation(async () => { Object.defineProperty(request, "url", { value: url + "?workspaceId=other&reviewId=other" }); Object.defineProperty(request, "signal", { value: new AbortController().signal }); return user; });
    m.limit.mockImplementation(async () => { user.id = "other"; return true; }); await check(await route.GET(request), 200);
    expect(m.read.mock.calls[0][0]).toEqual(f.input); expect(m.read.mock.calls[0][2].signal).toBe(signal); expect(m.read.mock.calls[0][2].deadlineAt).toBe(Date.parse(f.now) + 5000);
  });
  it("reader latency consumes offered TTL without changing the frozen inspection time", async () => {
    f.dto.approvalOffer.approvalExpiresAt = f.dto.review.preparationExpiresAt = new Date(Date.parse(f.now) + 100).toISOString();
    m.read.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(1100); return f.dto; }); await check(await get(), 503);
  });
  it("a remaining offer is returned without extending expiry or inspection", async () => {
    m.read.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(1100); return f.dto; }); expect(await (await check(await get(), 200)).json()).toEqual(f.dto);
  });
  it.each(["workspaceId", "reviewId", "offerReviewId", "calendarHandle", "claim", "authority", "expired", "notPending"])("refuses malformed or foreign output %s", async kind => {
    if (kind === "workspaceId") f.dto.workspaceId = "other";
    else if (kind === "reviewId") f.dto.review.reviewId = "other";
    else if (kind === "offerReviewId") f.dto.approvalOffer.reviewId = "other";
    else if (kind === "calendarHandle") Object.assign(f.dto.review, { calendarOperationId: "private" });
    else if (kind === "claim") Object.assign(f.dto, { claim: { approvalToken: "secret" } });
    else if (kind === "authority") f.dto.approvalOffer.executionAuthorized = true;
    else if (kind === "expired") f.dto.approvalOffer.approvalExpiresAt = f.dto.approvalOffer.inspectedAt;
    else f.dto.review.currentStatus = "completed";
    await check(await get(), 503);
  });
  it("DISABLED reader is unavailable, never an empty successful collection", async () => { m.read.mockResolvedValue({ status: "DISABLED" }); await check(await get(), 503); });
});
