import { afterEach, describe, expect, it, vi } from "vitest";
import { createCorrelatedCalendarListLifecycle } from "../src/lib/personal-correlated-calendar-list-lifecycle";
import { correlatedListFixture } from "./fixtures/correlated-calendar-list";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("independent display lifecycle time bounds — no device/provider", () => {
  it("a slow device clock cannot extend the server-reported remaining lifetime", async () => {
    vi.useFakeTimers(); const dto = correlatedListFixture();
    const inspected = Date.parse(dto.reviews[0].inspectedAt), expires = Date.parse(dto.reviews[0].preparationExpiresAt);
    vi.setSystemTime(inspected - 86_400_000);
    const read = vi.fn(async () => dto);
    const lifecycle = createCorrelatedCalendarListLifecycle({ workspaceId: "workspace", read, isDisabled: () => false });
    try {
      lifecycle.activate(); await Promise.resolve(); await Promise.resolve();
      expect(lifecycle.getSnapshot().phase).toBe("READY");
      await vi.advanceTimersByTimeAsync(expires - inspected);
      expect(lifecycle.getSnapshot()).toMatchObject({ phase: "EXPIRED", data: null });
      expect(read).toHaveBeenCalledTimes(1);
    } finally { lifecycle.pause(); }
    expect(vi.getTimerCount()).toBe(0);
  });
  it("unsubscribe prevents future notification and pause invalidates a delayed read", async () => {
    let resolve!: (value: unknown) => void;
    const read = vi.fn(() => new Promise(yes => { resolve = yes; }));
    const lifecycle = createCorrelatedCalendarListLifecycle({ workspaceId: "workspace", read, isDisabled: () => false });
    const listener = vi.fn(), unsubscribe = lifecycle.subscribe(listener);
    lifecycle.activate(); expect(listener).toHaveBeenCalledTimes(1); unsubscribe(); lifecycle.pause();
    resolve(correlatedListFixture()); await Promise.resolve(); await Promise.resolve();
    expect(lifecycle.getSnapshot().phase).toBe("PAUSED"); expect(listener).toHaveBeenCalledTimes(1);
  });
});
