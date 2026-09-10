import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalCommandFixture, approvalHistoryFixture } from "./fixtures/correlated-calendar-approval";
let source: typeof import("../src/lib/personal-correlated-calendar-approval-attempts");
beforeEach(async () => { vi.resetModules(); source = await import("../src/lib/personal-correlated-calendar-approval-attempts"); });
const store = () => { const rows = new Map<string, string>(); return { rows, getItemAsync: vi.fn(async (key: string) => rows.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), deleteItemAsync: vi.fn(async () => undefined) }; };
const scope = { ownerId: "owner", apiOrigin: "https://local.example" }, guard = () => ({ signal: new AbortController().signal, isCurrent: () => true });
describe("durable approval markers, synthetic store only", () => {
  it("stores exact metadata and verifies whole encoded blob before resolving", async () => {
    const storage = store(), registry = source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage });
    const marker = await registry.reserve(approvalCommandFixture(), guard()); expect(marker.state).toBe("ATTEMPT_RESERVED");
    const [key, raw] = [...storage.rows][0]; expect(raw).not.toMatch(/text|token|receipt|nonce|provider/i); expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(2000);
    expect(storage.getItemAsync.mock.calls).toEqual([[key], [key]]); expect(await registry.load()).toEqual([marker]); expect(storage.deleteItemAsync).not.toHaveBeenCalled();
  });
  it.each(["get", "set", "readback"])("failure at %s retains a closed local latch", async stage => {
    const storage = store(), registry = source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage });
    if (stage === "get") storage.getItemAsync.mockRejectedValueOnce(new Error("SYNTHETIC_FAILURE"));
    else if (stage === "set") storage.setItemAsync.mockRejectedValueOnce(new Error("SYNTHETIC_FAILURE"));
    else storage.getItemAsync.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("SYNTHETIC_FAILURE"));
    await expect(registry.reserve(approvalCommandFixture(), guard())).rejects.toThrow(); expect(registry.has("workspace", "review")).toBe(true);
    await expect(registry.reserve(approvalCommandFixture(), guard())).rejects.toThrow(); expect(storage.deleteItemAsync).not.toHaveBeenCalled();
  });
  it("same authenticated owner after process reset loads the marker but cannot reserve again", async () => {
    const storage = store(); await source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage }).reserve(approvalCommandFixture(), guard());
    vi.resetModules(); const fresh = await import("../src/lib/personal-correlated-calendar-approval-attempts"), registry = fresh.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage });
    expect(await registry.load()).toHaveLength(1); expect(registry.has("workspace", "review")).toBe(true); await expect(registry.reserve(approvalCommandFixture(), guard())).rejects.toThrow();
  });
  it("another owner or API origin cannot read stored identifiers", async () => {
    const storage = store(); await source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage }).reserve(approvalCommandFixture(), guard());
    expect(await source.createCorrelatedCalendarApprovalAttempts({ ...scope, ownerId: "other", store: storage }).load()).toEqual([]);
    expect(await source.createCorrelatedCalendarApprovalAttempts({ ...scope, apiOrigin: "https://other.example", store: storage }).load()).toEqual([]);
  });
  it.each(["owner", "origin", "extra", "bytes", "malformed"])("corrupt blob %s fails closed", async kind => {
    const storage = store(), registry = source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage }); await registry.reserve(approvalCommandFixture(), guard());
    const [key, raw] = [...storage.rows][0], value = JSON.parse(raw);
    if (kind === "owner") value.ownerId = "other"; else if (kind === "origin") value.apiOrigin = "https://other.example"; else value.extra = "invalid";
    storage.rows.set(key, kind === "bytes" ? " ".repeat(2001) : kind === "malformed" ? "{" : JSON.stringify(value));
    await expect(registry.load()).rejects.toThrow(); expect(storage.deleteItemAsync).not.toHaveBeenCalled();
  });
  it("concurrent final byte-capacity reservations serialize rather than overwrite", async () => {
    const storage = store(), registry = source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage }); let confirmed = 0;
    const jobs = Array.from({ length: 8 }, (_, i) => registry.reserve({ ...approvalCommandFixture(), reviewId: `review-${i}` }, guard()).then(() => confirmed++, () => undefined));
    await Promise.all(jobs); const entries = await registry.load(); expect(entries.length).toBe(confirmed); expect(confirmed).toBeGreaterThan(0); expect(confirmed).toBeLessThan(8);
    expect(new Set(entries.map(e => e.reviewId)).size).toBe(entries.length); expect(new TextEncoder().encode([...storage.rows.values()][0]).length).toBeLessThanOrEqual(2000);
  });
  it("does not dismiss unknown or pending markers", async () => {
    const storage = store(), registry = source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage }); await registry.reserve(approvalCommandFixture(), guard()); const before = [...storage.rows];
    await expect(registry.dismissConfirmed(approvalHistoryFixture(), guard())).rejects.toThrow("NOT_TERMINAL"); expect([...storage.rows]).toEqual(before);
  });
  it("bounds pending same-scope load calls while storage is hung", async () => {
    const storage = store(); let release!: (value: null) => void; const gate = new Promise<null>(yes => { release = yes; }); storage.getItemAsync.mockReturnValue(gate);
    const registry = source.createCorrelatedCalendarApprovalAttempts({ ...scope, store: storage }), jobs = Array.from({ length: 20 }, () => registry.load());
    await expect(registry.load()).rejects.toThrow("CAPACITY"); release(null); await Promise.all(jobs); expect(storage.getItemAsync).toHaveBeenCalledTimes(20);
  });
  it("bounds simultaneous unknown scope storage operations and permits load after completion", async () => {
    const storage = store(); let release!: (value: null) => void; const gate = new Promise<null>(yes => { release = yes; }); storage.getItemAsync.mockReturnValue(gate);
    const jobs = Array.from({ length: 20 }, (_, i) => source.createCorrelatedCalendarApprovalAttempts({ ...scope, ownerId: `owner-${i}`, store: storage }).load());
    const next = source.createCorrelatedCalendarApprovalAttempts({ ...scope, ownerId: "overflow", store: storage }); await expect(next.load()).rejects.toThrow("CAPACITY");
    release(null); await Promise.all(jobs); expect(await next.load()).toEqual([]); await expect(next.reserve(approvalCommandFixture(), guard())).rejects.toThrow("CAPACITY");
  });
});
