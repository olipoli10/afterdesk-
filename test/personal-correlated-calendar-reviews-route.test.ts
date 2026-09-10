import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-review-list", async importOriginal => ({
  ...await importOriginal<object>(), readCorrelatedPersonalCalendarReviewList: m.read,
}));
import * as route from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/route";
const flag = "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED";
const url = "https://local.example/api/endvera/v1/personal/model/correlated-calendar-reviews";
const valid = "?workspaceId=workspace";
const result = () => ({ version: "personal-correlated-calendar-review-list-v1", workspaceId: "workspace",
  readOnly: true, approvalAvailable: false, executionAuthorized: false, reviews: [], hasMore: false });
const get = (query = valid, signal?: AbortSignal) => route.GET(new Request(url + query, { signal }));
async function opaque(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(await response.text()).not.toMatch(/secret|SELECT|stack|requestHash|private-sms/);
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv(flag, "true");
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true });
  m.limit.mockResolvedValue(true); m.read.mockResolvedValue(result());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("private correlated calendar collection GET", () => {
  it("exports only a dynamic Node GET", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
    expect(route.runtime).toBe("nodejs"); expect(route.dynamic).toBe("force-dynamic");
  });
  it.each([undefined, "", "false", "1", "TRUE", " true "])("switch %s is OFF before authentication", async value => {
    vi.stubEnv(flag, value); await opaque(await get(), 404);
    expect(m.auth).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("uses the session actor, strict body and original signal/deadline", async () => {
    const request = new Request(url + valid), before = Date.now(), response = await route.GET(request);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(result());
    expect(m.limit).toHaveBeenCalledExactlyOnceWith("personal-correlated-calendar-reviews:owner", { window: 60, max: 30 });
    expect(m.read).toHaveBeenCalledOnce();
    const [input, env, context] = m.read.mock.calls[0];
    expect(input).toEqual({ enabled: true, actor: { userId: "owner", workspaceId: "workspace" } });
    expect(env).toBe(process.env); expect(context.signal).toBe(request.signal);
    expect(context.deadlineAt).toBeGreaterThanOrEqual(before + 5000); expect(context.deadlineAt).toBeLessThanOrEqual(Date.now() + 5000);
  });
  it("unauthenticated never reaches the owner reader", async () => {
    m.auth.mockResolvedValue(null); await opaque(await get(), 401); expect(m.read).not.toHaveBeenCalled();
  });
  it.each([{ role: "ADMIN" }, { role: "VA" }, { emailVerified: false }, { emailVerified: "true" },
    { id: "" }, { id: " owner" }, { id: "x".repeat(192) }])("invalid session %j refuses before the rate limiter", async delta => {
    m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true, ...delta });
    await opaque(await get(), 404); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["", "?workspaceId=", "?workspaceId=%20", "?workspaceId=workspace%20", `${valid}&workspaceId=other`,
    `${valid}&workspac%65Id=other`, `${valid}&actorUserId=other`, `${valid}&reviewId=other`, `${valid}&cursor=a`,
    `?workspaceId=${"w".repeat(192)}`])("invalid query %s has no protected read", async query => {
    await opaque(await get(query), 400); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("191-character workspace is retained exactly", async () => {
    const workspaceId = "w".repeat(191); m.read.mockResolvedValue({ ...result(), workspaceId });
    expect((await get(`?workspaceId=${workspaceId}`)).status).toBe(200);
    expect(m.read.mock.calls[0][0].actor.workspaceId).toBe(workspaceId);
  });
  it("rate refusal prevents protected reads", async () => {
    m.limit.mockResolvedValue(false); await opaque(await get(), 429); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["auth", "limit", "read"] as const)("%s exceptions remain opaque", async stage => {
    m[stage].mockRejectedValue(new Error("private-sms SELECT secret stack")); await opaque(await get(), 503);
  });
  it.each(["auth", "limit", "read"] as const)("flag withdrawal during %s hides all results", async stage => {
    m[stage].mockImplementation(async () => { vi.stubEnv(flag, "false");
      return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : result(); });
    await opaque(await get(), 404);
  });
  it.each(["auth", "limit", "read"] as const)("deadline expiring during %s never publishes a stale result", async stage => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T17:00:00Z"));
    m[stage].mockImplementation(async () => { vi.setSystemTime(Date.now() + 5000);
      return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : result(); });
    await opaque(await get(), 503);
  });
  it("pre-aborted request performs no authentication", async () => {
    const abort = new AbortController(); abort.abort(); await opaque(await get(valid, abort.signal), 503);
    expect(m.auth).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("abort during database read prevents disclosure", async () => {
    const abort = new AbortController(); m.read.mockImplementation(async () => { abort.abort(); return result(); });
    await opaque(await get(valid, abort.signal), 503);
  });
  it("session identity is copied before limiter latency", async () => {
    const user = { id: "owner", role: "CLIENT", emailVerified: true }; m.auth.mockResolvedValue(user);
    m.limit.mockImplementation(async () => { user.id = "other"; return true; });
    expect((await get()).status).toBe(200); expect(m.read.mock.calls[0][0].actor.userId).toBe("owner");
  });
  it.each([null, { status: "DISABLED", executionAuthorized: false }, { ...result(), workspaceId: "foreign" },
    { ...result(), committed: false }, { ...result(), readOnly: false }, { ...result(), approvalAvailable: true },
    { ...result(), executionAuthorized: true }, { ...result(), privateSms: "private-sms" },
    { ...result(), reviews: [{ version: "personal-correlated-calendar-review-v1" }] }, { ...result(), hasMore: "true" }])("invalid reader envelope is not leaked: %j", async raw => {
    m.read.mockResolvedValue(raw); await opaque(await get(), 503);
  });
});
