import { describe, expect, it } from "vitest";
import type { TaskStatus } from "@prisma-client";
import { ALLOWED_TRANSITIONS, isAllowedTransition } from "@/lib/state";
import {
  CLIENT_STATUS_LABELS,
  TERMINAL_STATUSES,
  VA_FILE_ACCESS_STATUSES,
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

describe("ai_processing — the automated block (Phase 1B)", () => {
  it("sits between payment and the pool, and only there", () => {
    expect(isAllowedTransition("awaiting_payment", "ai_processing")).toBe(true);
    expect(isAllowedTransition("ai_processing", "open")).toBe(true);
    // No other state may enter it: automation runs on a PAID, accepted
    // contract or it does not run.
    const enterers = (Object.keys(ALLOWED_TRANSITIONS) as TaskStatus[]).filter((s) =>
      isAllowedTransition(s, "ai_processing")
    );
    expect(enterers).toEqual(["awaiting_payment"]);
  });

  it("keeps the degraded path: a task with no executable plan still goes straight to the pool", () => {
    // The majority of tasks today. If this edge ever disappears, every
    // plan-less task stops reaching a worker at all.
    expect(isAllowedTransition("awaiting_payment", "open")).toBe(true);
  });

  it("cannot reach a worker, QC or completion without going through the pool", () => {
    // A machine run never produces a Submission: that row needs a vaId the
    // payout, the rating, the worker score and RULE 1 all depend on. The
    // absence of these edges is what makes "a person always delivers" true.
    expect(isAllowedTransition("ai_processing", "claimed")).toBe(false);
    expect(isAllowedTransition("ai_processing", "submitted_for_qc")).toBe(false);
    expect(isAllowedTransition("ai_processing", "completed")).toBe(false);
    expect(isAllowedTransition("ai_processing", "revision_requested")).toBe(false);
    expect(isAllowedTransition("ai_processing", "disputed")).toBe(false);
  });

  it("has the safety exits a long-running job needs", () => {
    // A run stuck long enough to threaten the Stripe authorisation window is
    // abandoned, not left in place.
    expect(isAllowedTransition("ai_processing", "cancelled")).toBe(true);
    expect(isAllowedTransition("ai_processing", "expired")).toBe(true);
  });

  it("is invisible to the client: same bucket as the pool and the QC loop", () => {
    expect(clientStatusOf("ai_processing")).toBe("in_progress");
    expect(CLIENT_STATUS_LABELS[clientStatusOf("ai_processing")]).toBe(
      CLIENT_STATUS_LABELS[clientStatusOf("open")]
    );
  });

  it("gives no worker access to client files: no VA is assigned yet", () => {
    expect(VA_FILE_ACCESS_STATUSES).not.toContain("ai_processing");
  });

  it("is not terminal", () => {
    expect(TERMINAL_STATUSES).not.toContain("ai_processing");
  });
});
