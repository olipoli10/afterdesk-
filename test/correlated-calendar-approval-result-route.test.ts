import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-result", async original => ({ ...await original<object>(), readCorrelatedCalendarApprovalResult: m.read }));
import * as route from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result/route";
const flag = "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED";
const url = "https://local.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result";
const query = "?workspaceId=workspace&reviewId=review";
const base = () => ({ version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review", observedAt: "2026-09-10T19:00:00.000Z",
  readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false, providerStateVerified: false });
const data = (outcome = "NOT_ATTEMPTED") => ({ ...base(), outcome, ...(outcome === "NOT_ATTEMPTED" ? {} : { approvedAt: "2026-09-10T14:00:00.000Z" }),
  ...(outcome === "UNKNOWN" ? { reason: "CLAIM_LEASE_EXPIRED" } : outcome === "CONFIRMED" ? {
    confirmationBasis: "DURABLE_RECORDED_RESULT", receipt: { confirmed: true, providerEventId: `e${"a".repeat(31)}` } } : {}) });
const get = (q = query, signal?: AbortSignal) => route.GET(new Request(url + q, { signal }));
async function check(response: Response, status: number) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization"); expect(response.headers.has("access-control-allow-origin")).toBe(false);
  if (status !== 200) expect(await response.clone().text()).not.toMatch(/secret|SELECT|stack|private-sms|approvalToken|credential/);
  return response;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv(flag, "true");
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true); m.read.mockResolvedValue(data());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("private historical C3 GET boundary", () => {
  it("exports only Node dynamic GET, no effect endpoint", () => { expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]); expect(route.runtime).toBe("nodejs"); expect(route.dynamic).toBe("force-dynamic"); });
  it.each([undefined, "false", "TRUE", "1", " true "])("OFF %s precedes auth", async value => {
    vi.stubEnv(flag, value); await check(await get(), 404); expect(m.auth).not.toHaveBeenCalled(); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["NOT_ATTEMPTED", "PENDING_RESULT", "UNKNOWN", "CONFIRMED"])("passes strict historical %s unchanged", async outcome => {
    const body = data(outcome); m.read.mockResolvedValue(body); expect(await (await check(await get(), 200)).json()).toEqual(body);
  });
  it("uses session identity and original deadline/signal, with a user-bound rate limit", async () => {
    const request = new Request(url + query, { headers: { "x-user-id": "intruder", "x-workspace-id": "foreign", authorization: "Bearer not-authority" } }), before = Date.now();
    await check(await route.GET(request), 200);
    expect(m.limit).toHaveBeenCalledExactlyOnceWith("personal-correlated-calendar-approval-result:owner", { window: 60, max: 30 });
    expect(m.read).toHaveBeenCalledOnce(); const [input, env, context] = m.read.mock.calls[0];
    expect(input).toEqual({ enabled: true, actor: { userId: "owner", workspaceId: "workspace" }, reviewId: "review" }); expect(env).toBe(process.env);
    expect(context.signal).toBe(request.signal); expect(context.deadlineAt).toBeGreaterThanOrEqual(before + 5000); expect(context.deadlineAt).toBeLessThanOrEqual(Date.now() + 5000);
  });
  it("does not reuse history after logout", async () => { await check(await get(), 200); m.auth.mockResolvedValue(null); await check(await get(), 401); expect(m.read).toHaveBeenCalledTimes(1); });
  it.each([{ role: "ADMIN" }, { role: "VA" }, { emailVerified: false }, { emailVerified: "true" }, { id: null }, { id: "" }, { id: " owner" }, { id: "o".repeat(192) }])("refuses invalid session %j", async delta => {
    m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true, ...delta }); await check(await get(), 404); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["", "?workspaceId=workspace", "?reviewId=review", "?workspaceId=&reviewId=review", "?workspaceId=workspace&reviewId=%20",
    `${query}&workspaceId=other`, `${query}&reviewId=other`, `${query}&review%49d=other`, `${query}&actorUserId=other`, `${query}&operationId=other`,
    `${query}&approvalToken=other`, `${query}&cursor=next`, `${query}&view=approval-v1`, `?workspaceId=${"w".repeat(192)}&reviewId=review`, `?workspaceId=workspace&reviewId=${"r".repeat(192)}`])("refuses ambiguous query %s without reader", async q => {
    await check(await get(q), 400); expect(m.limit).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
  });
  it("accepts exact191-character identifiers", async () => {
    const workspaceId = "w".repeat(191), reviewId = "r".repeat(191); m.read.mockResolvedValue({ ...data(), workspaceId, reviewId });
    await check(await get(`?workspaceId=${workspaceId}&reviewId=${reviewId}`), 200); expect(m.read.mock.calls[0][0]).toMatchObject({ actor: { workspaceId }, reviewId });
  });
  it.each([false, "true", 1, {}, undefined])("rate result %j is not true permission", async rate => { m.limit.mockResolvedValue(rate); await check(await get(), 429); expect(m.read).not.toHaveBeenCalled(); });
  it.each(["auth", "limit", "read"] as const)("%s error is opaque", async stage => { m[stage].mockRejectedValue(new Error("secret SELECT private-sms stack credential")); await check(await get(), 503); });
  it.each(["auth", "limit", "read"] as const)("flag withdrawal in %s hides output", async stage => {
    m[stage].mockImplementation(async () => { vi.stubEnv(flag, "false"); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : data(); }); await check(await get(), 404);
  });
  it.each(["auth", "limit", "read"] as const)("elapsed deadline during %s refuses output", async stage => {
    vi.spyOn(Date, "now").mockReturnValue(10000);
    m[stage].mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(15000); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : data(); }); await check(await get(), 503);
  });
  it.each(["auth", "limit", "read"] as const)("abort during %s refuses output", async stage => {
    const abort = new AbortController(); m[stage].mockImplementation(async () => { abort.abort(); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : data(); }); await check(await get(query, abort.signal), 503);
  });
  it("preabort refuses before auth", async () => { const abort = new AbortController(); abort.abort(); await check(await get(query, abort.signal), 503); expect(m.auth).not.toHaveBeenCalled(); });
  it("monotone elapsed budget survives backwards wall clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10000); vi.spyOn(performance, "now").mockReturnValue(1000);
    m.auth.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(0); vi.mocked(performance.now).mockReturnValue(6000); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    await check(await get(), 503); expect(m.read).not.toHaveBeenCalled();
  });
  it("auth and rate share one budget instead of resetting it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10000); m.auth.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(14900); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    m.limit.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(15000); return true; }); await check(await get(), 503); expect(m.read).not.toHaveBeenCalled();
  });
  it("snapshots URL and request signal before authentication latency", async () => {
    const request = new Request(url + query), originalSignal = request.signal;
    m.auth.mockImplementation(async () => { Object.defineProperty(request, "url", { value: url + "?workspaceId=foreign&reviewId=other" }); Object.defineProperty(request, "signal", { value: new AbortController().signal }); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    await check(await route.GET(request), 200); expect(m.read.mock.calls[0][0]).toMatchObject({ actor: { workspaceId: "workspace" }, reviewId: "review" }); expect(m.read.mock.calls[0][2].signal).toBe(originalSignal);
  });
  it("snapshots session identity before rate latency", async () => {
    const user = { id: "owner", role: "CLIENT", emailVerified: true }; m.auth.mockResolvedValue(user); m.limit.mockImplementation(async () => { user.id = "intruder"; return true; });
    await check(await get(), 200); expect(m.read.mock.calls[0][0].actor.userId).toBe("owner");
  });
  it.each([null, { status: "DISABLED", executionAuthorized: false }, { ...data(), workspaceId: "foreign" }, { ...data(), reviewId: "foreign" },
    { ...data(), executionAuthorized: true }, { ...data(), approvalAvailable: true }, { ...data(), providerStateVerified: true }, { ...data(), automaticRetry: true },
    { ...data(), operationId: "private-action" }, { ...data(), approvalToken: "secret" }, { ...data(), evidence: { text: "private-sms" } },
    { ...data("CONFIRMED"), receipt: { confirmed: true, providerEventId: `e${"a".repeat(31)}`, credential: "secret" } },
    { ...data("UNKNOWN"), reason: "SQL stack secret" }])("refuses malformed or foreign DTO %j", async body => { m.read.mockResolvedValue(body); await check(await get(), 503); });
  it("requires REVIEW only even when all execution switches are OFF", async () => {
    vi.stubEnv("ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "false"); vi.stubEnv("ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "false"); vi.stubEnv("ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "2000-01-01T00:00:00Z");
    await check(await get(), 200); expect(m.read).toHaveBeenCalledOnce();
  });
});
