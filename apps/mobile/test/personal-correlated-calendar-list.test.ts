import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { correlatedCalendarListFresh, correlatedCalendarSessionKey, parsePersonalCorrelatedCalendarList } from "../src/lib/personal-correlated-calendar-list";
import { createCorrelatedCalendarListLifecycle } from "../src/lib/personal-correlated-calendar-list-lifecycle";
import { correlatedListFixture, listNow } from "./fixtures/correlated-calendar-list";
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(listNow); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("correlated list strict parser", () => {
  it("accepts bounded list and deeply detaches/freezes it", () => {
    const raw = correlatedListFixture(), list = parsePersonalCorrelatedCalendarList(raw, "workspace");
    raw.reviews[0].evidence.sources[0].text = "mutated";
    expect(list.reviews[0].evidence.sources[0].text).not.toBe("mutated");
    expect(Object.isFrozen(list.reviews)).toBe(true); expect(Object.isFrozen(list)).toBe(true);
  });
  it("allows real empty success and independent hasMore boolean", () => {
    const raw = correlatedListFixture(); raw.reviews = []; raw.hasMore = true;
    expect(parsePersonalCorrelatedCalendarList(raw, "workspace").reviews).toEqual([]);
  });
  it.each(["version", "workspace", "extra", "approval", "execution", "readOnly", "six", "duplicate", "malformed item", "wrapper", "hasMore"])("refuses %s all-or-nothing", kind => {
    const raw = correlatedListFixture(); let value: unknown = raw;
    if (kind === "version") raw.version = "legacy";
    if (kind === "workspace") raw.workspaceId = "foreign";
    if (kind === "extra") value = { ...raw, nextCursor: "x" };
    if (kind === "approval") raw.approvalAvailable = true;
    if (kind === "execution") raw.executionAuthorized = true;
    if (kind === "readOnly") raw.readOnly = false;
    if (kind === "six") raw.reviews = Array.from({ length: 6 }, (_, index) => ({ ...raw.reviews[0], reviewId: String(index) }));
    if (kind === "duplicate") raw.reviews.push(structuredClone(raw.reviews[0]));
    if (kind === "malformed item") raw.reviews[0].evidence.citations.answer.quote = "wrong";
    if (kind === "wrapper") value = { ...raw, committed: true };
    if (kind === "hasMore") value = { ...raw, hasMore: "yes" };
    expect(() => parsePersonalCorrelatedCalendarList(value, "workspace")).toThrow();
  });
  it("uses local expiry only and refuses backward/nonfinite clock", () => {
    const list = parsePersonalCorrelatedCalendarList(correlatedListFixture(), "workspace");
    expect(correlatedCalendarListFresh(list, listNow, listNow)).toBe(true);
    for (const now of [listNow - 1, NaN, Infinity, listNow + 360_000]) expect(correlatedCalendarListFresh(list, now, listNow)).toBe(false);
  });
});
describe("verified local owner/session display key", () => {
  const scope = () => ({ identity: { user: { id: "owner" }, session: { id: "session" } }, pending: false, signedIn: true, bootstrapUserId: "owner", workspaceId: "workspace", activeWorkspaceId: "workspace", role: "OWNER" });
  it("changes key for different user, session or workspace", () => {
    const base = correlatedCalendarSessionKey(scope()); expect(base).not.toBeNull();
    expect(correlatedCalendarSessionKey({ ...scope(), identity: { user: { id: "owner" }, session: { id: "new" } } })).not.toBe(base);
    expect(correlatedCalendarSessionKey({ ...scope(), identity: { user: { id: "new" }, session: { id: "session" } }, bootstrapUserId: "new" })).not.toBe(base);
    expect(correlatedCalendarSessionKey({ ...scope(), workspaceId: "new", activeWorkspaceId: "new" })).not.toBe(base);
  });
  it.each([{ pending: true }, { signedIn: false }, { bootstrapUserId: "foreign" }, { role: "OFFICE_MANAGER" }, { activeWorkspaceId: "foreign" }, { identity: null }, { identity: { user: { id: "owner" } } }])("hides unavailable or changed scope %j", delta => {
    expect(correlatedCalendarSessionKey({ ...scope(), ...delta })).toBeNull();
  });
});
describe("correlated list foreground lifecycle", () => {
  function setup(read = vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockResolvedValue(correlatedListFixture())) {
    return { read, controller: createCorrelatedCalendarListLifecycle({ workspaceId: "workspace", read, isDisabled: error => error === "404" }) };
  }
  it("does not read until active; one-shot expiration clears data without polling", async () => {
    const { read, controller } = setup(); expect(read).not.toHaveBeenCalled();
    controller.activate(); expect(controller.getSnapshot().phase).toBe("LOADING"); await flush();
    expect(controller.getSnapshot().phase).toBe("READY"); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(360_000); expect(controller.getSnapshot()).toMatchObject({ phase: "EXPIRED", data: null });
    await vi.advanceTimersByTimeAsync(3_600_000); expect(read).toHaveBeenCalledTimes(1);
    controller.pause();
  });
  it("clears synchronously on reload and ignores an old request finishing after a new one", async () => {
    const old = deferred<unknown>(), fresh = deferred<unknown>();
    const { read, controller } = setup(vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise));
    controller.activate(); const oldSignal = read.mock.calls[0][0]; const reload = controller.reload();
    expect(oldSignal.aborted).toBe(true); expect(controller.getSnapshot().data).toBeNull();
    fresh.resolve(correlatedListFixture()); await reload;
    old.resolve({ invalid: true }); await flush(); expect(controller.getSnapshot().phase).toBe("READY"); controller.pause();
  });
  it("clears prior ready data before the next network await", async () => {
    const { controller, read } = setup(); controller.activate(); await flush();
    read.mockReturnValueOnce(new Promise(() => undefined)); void controller.reload();
    expect(controller.getSnapshot()).toMatchObject({ phase: "LOADING", data: null }); expect(vi.getTimerCount()).toBe(0); controller.pause();
  });
  it.each(["background", "unmount", "scope change", "navigation blur"])("discards pending result after %s and refuses manual refresh while paused", async () => {
    const pending = deferred<unknown>(); const { read, controller } = setup(vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockReturnValue(pending.promise));
    controller.activate(); controller.pause(); expect(read.mock.calls[0][0].aborted).toBe(true);
    pending.resolve(correlatedListFixture()); await flush(); await controller.reload();
    expect(controller.getSnapshot()).toMatchObject({ phase: "PAUSED", data: null }); expect(read).toHaveBeenCalledTimes(1);
  });
  it("resumes with a fresh generation; old scope cannot fill new instance", async () => {
    const pending = deferred<unknown>(); const old = setup(vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockReturnValue(pending.promise));
    old.controller.activate(); old.controller.pause(); const next = setup(); next.controller.activate(); await flush();
    pending.reject(new Error("late")); await flush(); expect(next.controller.getSnapshot().phase).toBe("READY"); next.controller.pause();
  });
  it.each([["404", "DISABLED"], [new Error("private backend detail"), "UNAVAILABLE"]])("keeps failure %s distinct from empty success", async (error, phase) => {
    const { controller } = setup(vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockRejectedValue(error)); controller.activate(); await flush();
    expect(controller.getSnapshot()).toMatchObject({ phase, data: null }); controller.pause();
  });
  it("rejects malformed list and expired response, without keeping good partial entries", async () => {
    const raw = correlatedListFixture(); raw.reviews.push({ ...raw.reviews[0], reviewId: "other", currentStatus: "bad" });
    const invalid = setup(vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockResolvedValue(raw)); invalid.controller.activate(); await flush();
    expect(invalid.controller.getSnapshot().phase).toBe("UNAVAILABLE"); invalid.controller.pause();
    vi.setSystemTime(listNow + 360_000); const expired = setup(); expired.controller.activate(); await flush();
    expect(expired.controller.getSnapshot()).toMatchObject({ phase: "EXPIRED", data: null }); expired.controller.pause();
  });
  it("subscriber pause during READY leaves no timer or retained source", async () => {
    const { controller } = setup(); const unsubscribe = controller.subscribe(() => { if (controller.getSnapshot().phase === "READY") controller.pause(); });
    controller.activate(); await flush(); expect(controller.getSnapshot().data).toBeNull(); expect(vi.getTimerCount()).toBe(0); unsubscribe();
  });
  it("snapshot read invalidates expiry before timer and remains cached after clock rollback", async () => {
    const { controller } = setup(); controller.activate(); await flush();
    vi.setSystemTime(listNow + 360_000); const expired = controller.getSnapshot();
    expect(expired).toMatchObject({ phase: "EXPIRED", data: null });
    vi.setSystemTime(listNow); expect(controller.getSnapshot()).toBe(expired);
    await controller.reload(); expect(controller.getSnapshot().phase).toBe("READY"); controller.pause();
  });
  it("a synchronous pause during LOADING starts no read", () => {
    const { controller, read } = setup();
    controller.subscribe(() => { if (controller.getSnapshot().phase === "LOADING") controller.pause(); });
    controller.activate(); expect(read).not.toHaveBeenCalled(); expect(controller.getSnapshot().phase).toBe("PAUSED");
  });
  it("a synchronous newer reload during LOADING alone owns its controller/read", async () => {
    const { controller, read } = setup(); let nested = false;
    controller.subscribe(() => { if (!nested && controller.getSnapshot().phase === "LOADING") { nested = true; void controller.reload(); } });
    controller.activate(); await flush(); expect(read).toHaveBeenCalledOnce();
    controller.pause(); expect(read.mock.calls[0][0].aborted).toBe(true);
  });
  it("slow-clock relative deadline also invalidates getSnapshot before timer and stays sticky", async () => {
    const slow = listNow - 86_400_000; vi.setSystemTime(slow);
    const { controller, read } = setup(); controller.activate(); await flush();
    expect(controller.getSnapshot().phase).toBe("READY");
    vi.setSystemTime(slow + 360_000); const expired = controller.getSnapshot(); expect(expired.phase).toBe("EXPIRED");
    vi.setSystemTime(slow); expect(controller.getSnapshot()).toBe(expired);
    expect(read).toHaveBeenCalledOnce(); controller.pause();
  });
  it("slow-clock transport latency consumes rather than extends the relative window", async () => {
    const slow = listNow - 86_400_000; vi.setSystemTime(slow);
    const pending = deferred<unknown>(); const { controller } = setup(vi.fn<(signal: AbortSignal) => Promise<unknown>>().mockReturnValue(pending.promise));
    controller.activate(); vi.setSystemTime(slow + 360_000); pending.resolve(correlatedListFixture()); await flush();
    expect(controller.getSnapshot()).toMatchObject({ phase: "EXPIRED", data: null }); expect(vi.getTimerCount()).toBe(0); controller.pause();
  });
});
