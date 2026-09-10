import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCorrelatedCalendarApprovalLifecycle } from "../src/lib/personal-correlated-calendar-approval-lifecycle";
import type { CorrelatedCalendarAttemptMarker } from "../src/lib/personal-correlated-calendar-approval-attempts";
import type { PersonalCorrelatedCalendarApprovalCommand } from "../src/lib/personal-correlated-calendar-approval";
import { approvalOfferFixture, approvalResponseFixture, approvalHistoryFixture, approvalCommandFixture } from "./fixtures/correlated-calendar-approval";

const instances: ReturnType<typeof createCorrelatedCalendarApprovalLifecycle>[] = [];
function fixture() {
  const offer = approvalOfferFixture(), response = approvalResponseFixture(), history = approvalHistoryFixture();
  const clocks = { wall: Date.parse(offer.approvalOffer.inspectedAt), mono: 100 }, state = { current: true };
  const records: CorrelatedCalendarAttemptMarker[] = [], latched = new Set<string>();
  const attempts = {
    has: vi.fn((_workspace: string, review: string) => latched.has(review)),
    load: vi.fn(async () => records.slice()),
    reserve: vi.fn(async (command: PersonalCorrelatedCalendarApprovalCommand) => {
      latched.add(command.reviewId); const marker = { ...command, fingerprintVersion: "personal-correlated-calendar-approval-view-v1" as const, state: "ATTEMPT_RESERVED" as const };
      records.push(marker); return marker;
    }),
    dismissConfirmed: vi.fn(async (_result: unknown) => { void _result; records.length = 0; return records.slice(); }),
  };
  const readResult = vi.fn(async () => history as unknown), readOffer = vi.fn(async () => offer as unknown), approve = vi.fn(async () => response as unknown);
  const lifecycle = createCorrelatedCalendarApprovalLifecycle({ workspaceId: "workspace", attempts, isCurrentScope: () => state.current,
    readResult, readOffer, approve, wallNow: () => clocks.wall, monotoneNow: () => clocks.mono });
  instances.push(lifecycle);
  const ready = async () => { lifecycle.activate(); await vi.waitFor(() => expect(lifecycle.getSnapshot().phase).toBe("IDLE")); await lifecycle.select("review"); expect(lifecycle.getSnapshot().phase).toBe("OFFER"); };
  return { lifecycle, ready, attempts, records, latched, clocks, state, offer, response, readResult, readOffer, approve };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { instances.splice(0).forEach(instance => instance.pause()); vi.useRealTimers(); });

describe("approval lifecycle peer — real lifecycle, fake API/registry and delayed timers", () => {
  it("late approval response does not become a fresh RESULT when the expiry timer has not fired", async () => {
    const h = fixture(); await h.ready();
    h.approve.mockImplementation(async () => { h.clocks.wall = Date.parse(h.offer.approvalOffer.approvalExpiresAt); h.clocks.mono += 360000; return h.response; });
    await h.lifecycle.send();
    expect(h.approve).toHaveBeenCalledOnce(); expect(h.latched.has("review")).toBe(true);
    expect(h.lifecycle.getSnapshot()).toMatchObject({ phase: "UNKNOWN", offer: null, result: null });
  });
  it("scope loss synchronously hides result and metadata even before the component calls pause", async () => {
    const h = fixture(); h.records.push({ ...approvalCommandFixture(), fingerprintVersion: "personal-correlated-calendar-approval-view-v1", state: "ATTEMPT_RESERVED" });
    h.lifecycle.activate(); await vi.waitFor(() => expect(h.lifecycle.getSnapshot().markers).toHaveLength(1));
    await h.lifecycle.history("review"); expect(h.lifecycle.getSnapshot().phase).toBe("RESULT");
    h.state.current = false;
    expect(h.lifecycle.getSnapshot()).toMatchObject({ phase: "PAUSED", selectedReviewId: null, offer: null, result: null, markers: [] });
  });
  it("dismissal always obtains a fresh C3 and cannot use a previous POST confirmation", async () => {
    const h = fixture(); await h.ready(); await h.lifecycle.send(); expect(h.lifecycle.getSnapshot().phase).toBe("RESULT");
    h.readResult.mockResolvedValue({ ...approvalHistoryFixture(), outcome: "PENDING_RESULT", approvedAt: "2026-09-11T04:01:00.000Z" });
    const reads = h.readResult.mock.calls.length; await h.lifecycle.dismiss("review");
    expect(h.readResult).toHaveBeenCalledTimes(reads + 1); expect(h.attempts.dismissConfirmed).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(1); expect(h.approve).toHaveBeenCalledOnce();
  });
  it("a reentrant pause listener prevents reservation and POST", async () => {
    const h = fixture(); await h.ready();
    h.lifecycle.subscribe(() => { if (h.lifecycle.getSnapshot().phase === "SENDING") h.lifecycle.pause(); });
    await h.lifecycle.send(); expect(h.attempts.reserve).not.toHaveBeenCalled(); expect(h.approve).not.toHaveBeenCalled();
  });
  it("a pause/reactivate listener at marker publication is not cancelled by the old send", async () => {
    const h = fixture(); await h.ready(); let changed = false;
    h.lifecycle.subscribe(() => {
      const state = h.lifecycle.getSnapshot();
      if (!changed && state.phase === "SENDING" && state.markers.length === 1) {
        changed = true; h.lifecycle.pause(); h.lifecycle.activate();
      }
    });
    await h.lifecycle.send();
    expect(changed).toBe(true); expect(h.attempts.reserve).toHaveBeenCalledOnce(); expect(h.approve).not.toHaveBeenCalled();
    expect(h.lifecycle.getSnapshot()).toMatchObject({ phase: "IDLE", selectedReviewId: null, offer: null, result: null });
    expect(h.lifecycle.getSnapshot().markers).toHaveLength(1);
  });
  it("a marker persisted after expiry remains discoverable for history without remount or POST", async () => {
    const h = fixture(); await h.ready(); let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    h.attempts.reserve.mockImplementation(async command => {
      h.latched.add(command.reviewId); await pending;
      h.records.push({ ...command, fingerprintVersion: "personal-correlated-calendar-approval-view-v1", state: "ATTEMPT_RESERVED" });
      throw new Error("CORRELATED_ATTEMPT_SCOPE_CHANGED");
    });
    const sending = h.lifecycle.send(); await vi.waitFor(() => expect(h.attempts.reserve).toHaveBeenCalledOnce());
    h.clocks.wall = Date.parse(h.offer.approvalOffer.approvalExpiresAt); h.clocks.mono += 360000;
    await vi.advanceTimersByTimeAsync(360000); expect(h.lifecycle.getSnapshot().phase).toBe("UNKNOWN");
    finish(); await sending;
    expect(h.approve).not.toHaveBeenCalled(); expect(h.lifecycle.getSnapshot().markers).toHaveLength(1);
    const reviewId = h.lifecycle.getSnapshot().markers[0].reviewId;
    await h.lifecycle.history(reviewId); expect(h.readResult).toHaveBeenCalledTimes(2); expect(h.approve).not.toHaveBeenCalled();
  });
  it("same-scope pause/reactivate discards a late response without losing the persisted marker", async () => {
    const h = fixture(); await h.ready(); let finish!: (value: unknown) => void;
    h.approve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const sending = h.lifecycle.send(); await vi.waitFor(() => expect(h.approve).toHaveBeenCalledOnce());
    h.lifecycle.pause(); h.lifecycle.activate(); await vi.waitFor(() => expect(h.lifecycle.getSnapshot().phase).toBe("IDLE"));
    finish(h.response); await sending;
    expect(h.lifecycle.getSnapshot()).toMatchObject({ phase: "IDLE", result: null, offer: null });
    expect(h.lifecycle.getSnapshot().markers).toHaveLength(1); expect(h.approve).toHaveBeenCalledOnce();
  });
  it("scope change while a response is pending hides every field and rejects its late publication", async () => {
    const h = fixture(); await h.ready(); let finish!: (value: unknown) => void;
    h.approve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const sending = h.lifecycle.send(); await vi.waitFor(() => expect(h.approve).toHaveBeenCalledOnce()); h.state.current = false;
    expect(h.lifecycle.getSnapshot()).toMatchObject({ phase: "PAUSED", markers: [], selectedReviewId: null, result: null, offer: null });
    finish(h.response); await sending;
    expect(h.lifecycle.getSnapshot()).toMatchObject({ phase: "PAUSED", markers: [], selectedReviewId: null, result: null, offer: null });
    expect(h.approve).toHaveBeenCalledOnce();
  });
  it.each(["new selection", "lost scope"])("late metadata hydration cannot overwrite %s", async change => {
    const h = fixture(); await h.ready(); let finish!: () => void, releaseLoad!: (value: CorrelatedCalendarAttemptMarker[]) => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    h.attempts.reserve.mockImplementation(async command => {
      await pending;
      h.records.push({ ...command, fingerprintVersion: "personal-correlated-calendar-approval-view-v1", state: "ATTEMPT_RESERVED" });
      throw new Error("CORRELATED_ATTEMPT_SCOPE_CHANGED");
    });
    const sending = h.lifecycle.send(); await vi.waitFor(() => expect(h.attempts.reserve).toHaveBeenCalledOnce());
    h.clocks.wall = Date.parse(h.offer.approvalOffer.approvalExpiresAt); h.clocks.mono += 360000;
    await vi.advanceTimersByTimeAsync(360000);
    h.attempts.load.mockImplementationOnce(() => new Promise(resolve => { releaseLoad = resolve; }));
    finish(); await vi.waitFor(() => expect(h.attempts.load).toHaveBeenCalledTimes(2));
    if (change === "new selection") await h.lifecycle.history("review");
    else h.state.current = false;
    const before = h.lifecycle.getSnapshot(); releaseLoad(h.records.slice()); await sending;
    expect(h.lifecycle.getSnapshot()).toBe(before); expect(h.lifecycle.getSnapshot().markers).toEqual([]);
    expect(h.approve).not.toHaveBeenCalled();
    expect(before.phase).toBe(change === "new selection" ? "RESULT" : "PAUSED");
  });
});
