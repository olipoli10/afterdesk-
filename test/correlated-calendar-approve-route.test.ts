import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), approve: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: m.auth, consumeRateLimit: m.limit }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval", async original => ({ ...await original<object>(), approveCorrelatedCalendarReview: m.approve }));
import * as route from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approve/route";
const url = "https://app.example/api/endvera/v1/personal/model/correlated-calendar-reviews/approve";
const flags = ["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED", "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED"];
const command = () => ({ version: "personal-correlated-calendar-approval-command-v1", workspaceId: "workspace", reviewId: "review", expectedRequestHash: "a".repeat(64), expectedReviewFingerprint: "b".repeat(64) });
const confirmed = () => ({ ...command(), version: "personal-correlated-calendar-approval-response-v1", status: "CONFIRMED", automaticRetry: false,
  executionAuthorized: false, providerStateVerified: false, receipt: { confirmed: true, providerEventId: `e${"c".repeat(31)}` } });
const historical = (outcome = "PENDING_RESULT") => ({ version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review",
  observedAt: "2026-09-10T20:00:00.000Z", readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false, providerStateVerified: false,
  outcome, ...(outcome === "NOT_ATTEMPTED" ? {} : { approvedAt: "2026-09-10T19:59:00.000Z" }),
  ...(outcome === "UNKNOWN" ? { reason: "WRITE_OUTCOME_UNKNOWN" } : {}),
  ...(outcome === "CONFIRMED" ? { receipt: confirmed().receipt, confirmationBasis: "DURABLE_RECORDED_RESULT" } : {}) });
const request = (body: unknown = command(), options: RequestInit = {}, query = "") => new Request(url + query,
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...options });
const post = (body: unknown = command(), options: RequestInit = {}, query = "") => route.POST(request(body, options, query));
async function check(response: Response, status: number) {
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  if (status !== 200) expect(await response.clone().text()).not.toMatch(/secret|SELECT|stack|approvalToken|claimnonce|credential/);
  if (status === 503) expect(await response.clone().json()).toMatchObject({ status: "UNKNOWN", automaticRetry: false });
  return response;
}
beforeEach(() => {
  vi.resetAllMocks(); flags.forEach(flag => vi.stubEnv(flag, "true")); vi.stubEnv("BETTER_AUTH_URL", "https://app.example/base");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-10T20:00:00.000Z")); vi.spyOn(performance, "now").mockReturnValue(1000);
  m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true }); m.limit.mockResolvedValue(true); m.approve.mockImplementation(async () => confirmed());
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("explicit correlated approval POST boundary", () => {
  it("exports only POST and route config, never GET effects", () => { expect(Object.keys(route).sort()).toEqual(["POST", "dynamic", "runtime"]); expect(route.runtime).toBe("nodejs"); expect(route.dynamic).toBe("force-dynamic"); });
  it.each(flags)("%s OFF before auth/body/command", async flag => { vi.stubEnv(flag, "false"); await check(await post(), 404); expect(m.auth).not.toHaveBeenCalled(); expect(m.approve).not.toHaveBeenCalled(); });
  it("calls exactly the typed wrapper once with the original entry budgets", async () => {
    const req = request(); expect(await (await check(await route.POST(req), 200)).json()).toEqual(confirmed());
    expect(m.approve).toHaveBeenCalledExactlyOnceWith(command(), { userId: "owner", workspaceId: "workspace" }, process.env,
      { deadlineAt: Date.now() + 25000, monotoneDeadlineAt: 26000, signal: req.signal });
    expect(m.limit).toHaveBeenCalledExactlyOnceWith("personal-correlated-calendar-approve:owner", { window: 60, max: 20 });
  });
  it.each([undefined, "", "endvera://", "https://app.example"])("preserves existing accepted origin %s", async origin => {
    const headers: Record<string, string> = { "content-type": "application/json" }; if (origin !== undefined) headers.origin = origin;
    await check(await post(command(), { headers }), 200); expect(m.approve).toHaveBeenCalledOnce();
  });
  it.each(["null", "https://evil.example", "http://app.example", "https://app.example.evil", "endvera://evil", "https://app.example/path"])("rejects foreign origin %s before effect", async origin => {
    await check(await post(command(), { headers: { "content-type": "application/json", origin } }), 403); expect(m.limit).not.toHaveBeenCalled(); expect(m.approve).not.toHaveBeenCalled();
  });
  it("does not trust Host or forwarded-host to select an allowed origin", async () => {
    await check(await post(command(), { headers: { "content-type": "application/json", origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "evil.example" } }), 403); expect(m.approve).not.toHaveBeenCalled();
  });
  it("missing auth config still allows native/no-origin but not web origin", async () => {
    vi.stubEnv("BETTER_AUTH_URL", undefined); await check(await post(), 200); await check(await post(command(), { headers: { "content-type": "application/json", origin: "https://app.example" } }), 403);
  });
  it("invalid configured URL is opaque and sends nothing", async () => { vi.stubEnv("BETTER_AUTH_URL", "not-url-secret"); await check(await post(), 503); expect(m.approve).not.toHaveBeenCalled(); });
  it("requires real session, ignoring actor headers", async () => {
    await check(await post(command(), { headers: { "content-type": "application/json", "x-user-id": "intruder" } }), 200);
    expect(m.approve.mock.calls[0][1].userId).toBe("owner"); m.auth.mockResolvedValue(null); await check(await post(), 401); expect(m.approve).toHaveBeenCalledTimes(1);
  });
  it.each([{ role: "ADMIN" }, { role: "VA" }, { emailVerified: "true" }, { emailVerified: false }, { id: "" }, { id: " owner" }, { id: null }, { id: "x".repeat(192) }])("invalid verified session %j", async delta => {
    m.auth.mockResolvedValue({ id: "owner", role: "CLIENT", emailVerified: true, ...delta }); await check(await post(), 404); expect(m.approve).not.toHaveBeenCalled();
  });
  it.each([false, 1, "true", null])("rate must be exactly true: %j", async allowed => { m.limit.mockResolvedValue(allowed); await check(await post(), 429); expect(m.approve).not.toHaveBeenCalled(); });
  it.each(["auth", "limit", "approve"] as const)("opaque %s rejection never retries", async stage => { m[stage].mockRejectedValue(new Error("SELECT secret credential stack")); await check(await post(), 503); expect(m.approve).toHaveBeenCalledTimes(stage === "approve" ? 1 : 0); });
  it.each(["?reviewId=other", "?workspaceId=workspace", "?view=approval-v1"])("refuses query routing %s", async query => { await check(await post(command(), {}, query), 400); expect(m.approve).not.toHaveBeenCalled(); });
  it.each([undefined, "text/plain", "application/x-www-form-urlencoded", "application/json; charset=latin1"])("refuses content-type %s", async contentType => {
    await check(await post(command(), { headers: contentType ? { "content-type": contentType } : {} }), 415); expect(m.approve).not.toHaveBeenCalled();
  });
  it("accepts UTF-8 JSON charset", async () => { await check(await post(command(), { headers: { "content-type": "application/json; charset=utf-8" } }), 200); });
  it.each(["-1", "1.5", "abc", "9007199254740992"])("invalid content-length %s", async length => { await check(await post(command(), { headers: { "content-type": "application/json", "content-length": length } }), 400); expect(m.approve).not.toHaveBeenCalled(); });
  it("rejects announced or actual >4096 bytes, including dishonest length", async () => {
    await check(await post(command(), { headers: { "content-type": "application/json", "content-length": "4097" } }), 413);
    await check(await post({ ...command(), junk: "x".repeat(4096) }, { headers: { "content-type": "application/json", "content-length": "1" } }), 413); expect(m.approve).not.toHaveBeenCalled();
  });
  it.each([{}, null, [], { ...command(), userId: "intruder" }, { ...command(), operationId: "operation" }, { ...command(), approved: true },
    { ...command(), proof: {} }, { ...command(), version: "future" }, { ...command(), expectedRequestHash: "BAD" }, { ...command(), expectedReviewFingerprint: "0" },
    { ...command(), workspaceId: " workspace" }, { ...command(), reviewId: "r".repeat(192) }].map(body => [body]))("rejects noncanonical command %j", async body => {
    await check(await post(body), 400); expect(m.approve).not.toHaveBeenCalled();
  });
  it("rejects JSON proto extra property before wrapper", async () => { await check(await post(JSON.parse(JSON.stringify(command()).slice(0, -1) + ',"__proto__":{}}')), 400); expect(m.approve).not.toHaveBeenCalled(); });
  it.each(["{bad", "", "{\"version\":"])("malformed bytes %s", async body => { await check(await post(command(), { body }), 400); expect(m.approve).not.toHaveBeenCalled(); });
  it("rejects invalid UTF-8 and missing stream", async () => { await check(await post(command(), { body: new Uint8Array([0xff]) }), 400); await check(await post(command(), { body: null }), 400); expect(m.approve).not.toHaveBeenCalled(); });
  it("preabort never authenticates", async () => { const ac = new AbortController(); ac.abort(); await check(await post(command(), { signal: ac.signal }), 503); expect(m.auth).not.toHaveBeenCalled(); });
  it.each(["auth", "limit", "approve"] as const)("abort during %s gives unknown and no retry", async stage => {
    const ac = new AbortController(); m[stage].mockImplementation(async () => { ac.abort(); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : confirmed(); });
    await check(await post(command(), { signal: ac.signal }), 503); expect(m.approve).toHaveBeenCalledTimes(stage === "approve" ? 1 : 0);
  });
  it.each(["auth", "limit", "approve"] as const)("auth configuration changed during %s closes continuation", async stage => {
    m[stage].mockImplementation(async () => { vi.stubEnv("BETTER_AUTH_URL", "https://other.example"); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : confirmed(); });
    await check(await post(), 503); expect(m.approve).toHaveBeenCalledTimes(stage === "approve" ? 1 : 0);
  });
  it.each(["auth", "limit", "approve"] as const)("switch withdrawal during %s sends no new work/disclosure", async stage => {
    m[stage].mockImplementation(async () => { vi.stubEnv(flags[1], "false"); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : confirmed(); });
    await check(await post(), stage === "approve" ? 503 : 404); expect(m.approve).toHaveBeenCalledTimes(stage === "approve" ? 1 : 0);
  });
  it("snapshots body/origin/signal/url and copies actor before limiter await", async () => {
    const req = request(), signal = req.signal, user = { id: "owner", role: "CLIENT", emailVerified: true };
    m.auth.mockImplementation(async () => { req.headers.set("origin", "https://evil.example"); Object.defineProperty(req, "url", { value: url + "?reviewId=other" });
      Object.defineProperty(req, "signal", { value: new AbortController().signal }); Object.defineProperty(req, "body", { value: request({ ...command(), reviewId: "other" }).body }); return user; });
    m.limit.mockImplementation(async () => { user.id = "intruder"; return true; }); await check(await route.POST(req), 200);
    expect(m.approve.mock.calls[0][0]).toEqual(command()); expect(m.approve.mock.calls[0][1].userId).toBe("owner"); expect(m.approve.mock.calls[0][3].signal).toBe(signal);
  });
  it("auth and limiter latency never resets the original 25s monotone budget", async () => {
    m.auth.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(2000); return { id: "owner", role: "CLIENT", emailVerified: true }; });
    m.limit.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(9000); return true; }); await check(await post(), 200);
    expect(m.approve.mock.calls[0][3].monotoneDeadlineAt).toBe(26000);
  });
  it.each(["auth", "limit", "approve"] as const)("monotone expiry during %s refuses, even when wall clock has not moved", async stage => {
    m[stage].mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(26000); return stage === "auth" ? { id: "owner", role: "CLIENT", emailVerified: true } : stage === "limit" ? true : confirmed(); });
    await check(await post(), 503); expect(m.approve).toHaveBeenCalledTimes(stage === "approve" ? 1 : 0);
  });
  it("wall rollback closes rather than increasing available time", async () => { m.limit.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(0); return true; }); await check(await post(), 503); expect(m.approve).not.toHaveBeenCalled(); });
  it.each(["NOT_ATTEMPTED", "PENDING_RESULT", "UNKNOWN", "CONFIRMED"])("returns exact read-only ALREADY_ATTEMPTED history %s without another wrapper call", async outcome => {
    const response = { ...confirmed(), status: "ALREADY_ATTEMPTED", result: historical(outcome) }; delete (response as Partial<typeof response>).receipt;
    m.approve.mockResolvedValue(response); expect(await (await check(await post(), 200)).json()).toEqual(response); expect(m.approve).toHaveBeenCalledOnce();
  });
  it.each(["version", "workspaceId", "reviewId", "expectedRequestHash", "expectedReviewFingerprint", "claim", "receipt", "disabled"])("rejects foreign/malformed wrapper result %s", async field => {
    const result: Record<string, unknown> = confirmed();
    if (field === "claim") result.claim = { approvalToken: "secret" }; else if (field === "receipt") result.receipt = { confirmed: false, providerEventId: "wrong" };
    else if (field === "disabled") { m.approve.mockResolvedValue({ status: "DISABLED", executionAuthorized: false }); await check(await post(), 503); return; }
    else result[field] = field.startsWith("expected") ? "f".repeat(64) : "other";
    m.approve.mockResolvedValue(result); await check(await post(), 503); expect(m.approve).toHaveBeenCalledOnce();
  });
  it("rejects nested historical result from another review", async () => { const result = { ...confirmed(), status: "ALREADY_ATTEMPTED", result: { ...historical(), reviewId: "other" } };
    delete (result as Partial<typeof result>).receipt; m.approve.mockResolvedValue(result); await check(await post(), 503); });
  it("parsing side effects cannot disclose after abort", async () => { const ac = new AbortController(), result = confirmed();
    Object.defineProperty(result, "receipt", { enumerable: true, get: () => { ac.abort(); return confirmed().receipt; } }); m.approve.mockResolvedValue(result);
    await check(await post(command(), { signal: ac.signal }), 503); });
});

describe("bounded streamed command read", () => {
  const streamRequest = (stream: ReadableStream<Uint8Array>, signal?: AbortSignal) => request(command(), { body: stream, signal, duplex: "half" } as RequestInit);
  it("accepts a split exact body and takes one snapshot before invoking", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(command())); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 7)); c.enqueue(bytes.slice(7)); c.close(); } });
    await check(await route.POST(streamRequest(stream)), 200); expect(m.approve).toHaveBeenCalledOnce();
  });
  it("stream larger than cap is cancelled without waiting for malicious cancel", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined)); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4097)); }, cancel });
    await check(await route.POST(streamRequest(stream)), 413); expect(cancel).toHaveBeenCalledOnce(); expect(m.approve).not.toHaveBeenCalled();
  });
  it("bounds a microtask stream of zero-byte chunks before time or memory exhaustion", async () => {
    let pulls = 0; const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({ pull(c) { pulls += 1; c.enqueue(new Uint8Array(0)); }, cancel });
    await check(await route.POST(streamRequest(stream)), 400); expect(pulls).toBeLessThanOrEqual(4098); expect(cancel).toHaveBeenCalledOnce(); expect(m.approve).not.toHaveBeenCalled();
  });
  it("abort while reading cancels without a second attempt", async () => {
    const ac = new AbortController(), cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ pull() { ac.abort(); }, cancel }, { highWaterMark: 0 });
    await check(await route.POST(streamRequest(stream, ac.signal)), 503); expect(cancel).toHaveBeenCalledOnce(); expect(m.approve).not.toHaveBeenCalled();
  });
  it("hung stream is bounded by entry timer and cancellation itself may hang", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({ cancel }); const pending = route.POST(streamRequest(stream));
    await vi.advanceTimersByTimeAsync(25000); await check(await pending, 503); expect(cancel).toHaveBeenCalledOnce(); expect(m.approve).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("timer and signal listener are removed on successful response", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); const req = request(), remove = vi.spyOn(req.signal, "removeEventListener");
    await check(await route.POST(req), 200); expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
