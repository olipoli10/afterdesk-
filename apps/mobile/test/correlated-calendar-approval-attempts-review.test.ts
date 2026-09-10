import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalCorrelatedCalendarApprovalCommand } from "../src/lib/personal-correlated-calendar-approval";
let module: typeof import("../src/lib/personal-correlated-calendar-approval-attempts");
beforeEach(async () => { vi.resetModules(); module = await import("../src/lib/personal-correlated-calendar-approval-attempts"); });
function storage() {
  const rows = new Map<string, string>();
  return { rows, getItemAsync: vi.fn(async (key: string) => rows.get(key) ?? null), setItemAsync: vi.fn(async (key: string, value: string) => { rows.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { rows.delete(key); }) };
}
const command = (reviewId = "review"): PersonalCorrelatedCalendarApprovalCommand => ({ version: "personal-correlated-calendar-approval-command-v1", workspaceId: "workspace", reviewId,
  expectedRequestHash: "a".repeat(64), expectedReviewFingerprint: "b".repeat(64) });
const guard = () => ({ signal: new AbortController().signal, isCurrent: () => true });
const input = { ownerId: "owner", apiOrigin: "https://endvera.example" };

describe("attempt registry peer: bounded single runtime, synthetic SecureStore only", () => {
  it("bounds failed reservation growth at20 identities and refuses21 before storage", async () => {
    const store = storage(), registry = module.createCorrelatedCalendarApprovalAttempts({ ...input, store });
    store.getItemAsync.mockRejectedValue(new Error("SYNTHETIC_STORE_UNAVAILABLE"));
    for (let i = 0; i < 20; i++) await expect(registry.reserve(command(`r${i}`), guard())).rejects.toThrow("SYNTHETIC_STORE_UNAVAILABLE");
    const calls = store.getItemAsync.mock.calls.length;
    await expect(registry.reserve(command("r20"), guard())).rejects.toThrow("CORRELATED_ATTEMPT_CAPACITY");
    expect(store.getItemAsync).toHaveBeenCalledTimes(calls);
  });
  it("bounds distinct failed owner scopes without silently forgetting old attempts", async () => {
    const store = storage(); store.getItemAsync.mockRejectedValue(new Error("SYNTHETIC_STORE_UNAVAILABLE"));
    for (let i = 0; i < 20; i++) {
      const registry = module.createCorrelatedCalendarApprovalAttempts({ ...input, ownerId: `owner${i}`, store });
      await expect(registry.reserve(command(), guard())).rejects.toThrow("SYNTHETIC_STORE_UNAVAILABLE");
    }
    const calls = store.getItemAsync.mock.calls.length;
    const last = module.createCorrelatedCalendarApprovalAttempts({ ...input, ownerId: "owner20", store });
    await expect(last.reserve(command(), guard())).rejects.toThrow("CORRELATED_ATTEMPT_CAPACITY");
    expect(store.getItemAsync).toHaveBeenCalledTimes(calls);
    const first = module.createCorrelatedCalendarApprovalAttempts({ ...input, ownerId: "owner0", store });
    expect(first.has("workspace", "review")).toBe(true);
  });
  it("rejects malformed Unicode keys and keeps exact normalization/origin domains distinct", () => {
    for (const owner of ["\ud800", "\ud801", "\udc00", "a\0b"]) expect(() => module.correlatedCalendarAttemptStorageKey(owner, input.apiOrigin)).toThrow();
    const keys = ["é", "e\u0301", "\ufffd", "👩🏽"].map(owner => module.correlatedCalendarAttemptStorageKey(owner, input.apiOrigin));
    expect(new Set(keys).size).toBe(4); keys.forEach(key => expect(key).toMatch(/^[\w.-]+$/));
    expect(module.correlatedCalendarAttemptStorageKey("owner", "https://other.example")).not.toBe(module.correlatedCalendarAttemptStorageKey("owner", input.apiOrigin));
  });
  it("reserves synchronously across remounted instances before storage settles", async () => {
    const store = storage(), first = module.createCorrelatedCalendarApprovalAttempts({ ...input, store });
    const pending = first.reserve(command(), guard());
    const second = module.createCorrelatedCalendarApprovalAttempts({ ...input, store });
    expect(second.has("workspace", "review")).toBe(true);
    await expect(second.reserve({ ...command(), expectedReviewFingerprint: "c".repeat(64) }, guard())).rejects.toThrow("ALREADY_RESERVED");
    await pending; expect(store.setItemAsync).toHaveBeenCalledOnce();
  });
  it("readback of an older blob refuses while keeping the local latch", async () => {
    const store = storage(), registry = module.createCorrelatedCalendarApprovalAttempts({ ...input, store });
    store.setItemAsync.mockImplementation(async () => undefined);
    await expect(registry.reserve(command(), guard())).rejects.toThrow("READBACK_CHANGED");
    expect(registry.has("workspace", "review")).toBe(true); expect(await registry.load()).toEqual([]);
    await expect(registry.reserve(command(), guard())).rejects.toThrow("ALREADY_RESERVED");
  });
  it("scope disappearing after write retains the marker and refuses continuation", async () => {
    const store = storage(), registry = module.createCorrelatedCalendarApprovalAttempts({ ...input, store }); let current = true;
    store.setItemAsync.mockImplementation(async (key, value) => { store.rows.set(key, value); current = false; });
    await expect(registry.reserve(command(), { ...guard(), isCurrent: () => current })).rejects.toThrow("SCOPE_CHANGED");
    expect(await registry.load()).toHaveLength(1); expect(store.deleteItemAsync).not.toHaveBeenCalled();
  });
  it("checks UTF8 byte capacity before writing rather than string length", async () => {
    const store = storage(), registry = module.createCorrelatedCalendarApprovalAttempts({ ...input, ownerId: "界".repeat(191), store });
    await expect(registry.reserve({ ...command("界".repeat(191)), workspaceId: "界".repeat(191) }, guard())).rejects.toThrow("CAPACITY");
    expect(store.setItemAsync).not.toHaveBeenCalled();
  });
  it("a structurally confirmed dismissal never removes the same-runtime latch", async () => {
    const store = storage(), registry = module.createCorrelatedCalendarApprovalAttempts({ ...input, store }); await registry.reserve(command(), guard());
    // This DTO is deliberately local and is NOT provider or server authority.
    // Lifecycle must supply only fresh, scoped C3; this helper merely edits metadata.
    await registry.dismissConfirmed({ version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review", observedAt: "2026-09-11T04:02:00.000Z",
      approvedAt: "2026-09-11T04:01:00.000Z", outcome: "CONFIRMED", readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false,
      providerStateVerified: false, confirmationBasis: "DURABLE_RECORDED_RESULT", receipt: { confirmed: true, providerEventId: "e" + "a".repeat(31) } }, guard());
    expect(await registry.load()).toEqual([]); expect(registry.has("workspace", "review")).toBe(true);
    await expect(registry.reserve(command(), guard())).rejects.toThrow("ALREADY_RESERVED");
  });
});
