import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, isAllowedTransition } from "@/lib/state";
import {
  CLIENT_STATUS_LABELS,
  TERMINAL_STATUSES,
  clientStatusOf,
} from "@/lib/status";

describe("task state machine", () => {
  it("keeps unpaid client tasks out of the worker pool", () => {
    expect(isAllowedTransition("quoted", "awaiting_payment")).toBe(true);
    expect(isAllowedTransition("awaiting_payment", "open")).toBe(true);
    expect(isAllowedTransition("quoted", "claimed")).toBe(false);
    expect(isAllowedTransition("awaiting_payment", "claimed")).toBe(false);
  });

  it("allows the post-delivery quality paths", () => {
    expect(isAllowedTransition("completed", "revision_requested")).toBe(true);
    expect(isAllowedTransition("completed", "disputed")).toBe(true);
    expect(isAllowedTransition("disputed", "completed")).toBe(true);
    expect(isAllowedTransition("disputed", "cancelled")).toBe(true);
  });

  it("derives terminal states and client labels from the canonical map", () => {
    const expected = Object.entries(ALLOWED_TRANSITIONS)
      .filter(([, targets]) => targets.length === 0)
      .map(([status]) => status)
      .sort();
    expect([...TERMINAL_STATUSES].sort()).toEqual(expected);
    expect(CLIENT_STATUS_LABELS[clientStatusOf("submitted_for_qc")]).toBe("In progress");
    expect(CLIENT_STATUS_LABELS[clientStatusOf("disputed")]).toBe("Under review");
  });
});
