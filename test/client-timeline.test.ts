import { describe, expect, it } from "vitest";
import {
  CLIENT_TIMELINE_LABELS,
  clientTimelineEntries,
  clientTimelineEventSelect,
  executionSummary,
} from "@/lib/queries/tasks";

/**
 * RULE 1 regression net for the client execution report.
 *
 * Every other role boundary in this codebase is a COLUMN problem, solved by a
 * role-shaped select and covered by price-wall.test.ts. This one is a ROW
 * problem, and it fails differently: TaskEvent is the audit log for the entire
 * platform, and a new `action` string lands in it every time a feature ships.
 * A blocklist would publish each of those to the paying client on the day it
 * was written, by nobody's decision.
 *
 * So the guard is a whitelist, and these tests exist to make widening it a
 * deliberate act. Adding a key to CLIENT_TIMELINE_LABELS fails the pinned-set
 * test below, which is the point: the person adding it has to come here and
 * say why.
 */

function keysDeep(select: unknown, seen = new Set<string>()): Set<string> {
  if (!select || typeof select !== "object") return seen;
  for (const [key, value] of Object.entries(select as Record<string, unknown>)) {
    seen.add(key);
    if (value && typeof value === "object") keysDeep(value, seen);
  }
  return seen;
}

/**
 * The exact whitelist, pinned. Sorted so a diff reads cleanly.
 */
const PINNED = [
  "admin_cancelled",
  "admin_ordered_dispute_rework",
  "admin_published_revision_instructions",
  "admin_qc_approved",
  "admin_qc_rejected",
  "admin_qc_rejected_exhausted",
  "admin_quoted",
  "admin_recorded_payment",
  "admin_reassigned",
  "admin_rejected_dispute",
  "admin_upheld_dispute",
  "client_accepted_quote",
  "client_declined_quote",
  "client_opened_dispute",
  "client_payment_received",
  "client_requested_revision",
  "client_submitted",
  "client_submitted_standing_task",
  "payment_window_expired",
  "quote_expired",
  "retention_files_purged",
  "standing_capacity_routed",
  "standing_minutes_returned",
  "va_claimed",
  "va_released",
  "va_submitted_deliverable",
].sort();

/**
 * Real action strings that must never be keyed, each for its own reason.
 * Several of these are not even TaskEvent actions (they belong to AdminEvent
 * or FileAccessLog); keying one would be dead code today and a live leak the
 * day someone reused the name.
 */
const MUST_NEVER_APPEAR: [string, string][] = [
  ["va_asked_question", "its reason column holds the worker's unreviewed verbatim text"],
  ["entered_pricing_queue", "fires in the same transaction as client_submitted, prints twice"],
  [
    "late_client_payment_recovered",
    "fulfillCheckout writes it and client_payment_received back to back",
  ],
  ["payout_marked_paid", "worker pay"],
  ["manual_refund_recorded", "internal money bookkeeping"],
  ["file_rechecked", "internal file-security operation"],
  ["file_recheck_failed", "internal file-security operation"],
  ["worker_assigned", "an AdminEvent action, never written to TaskEvent"],
  ["upload", "a FileAccessLog action"],
  ["download", "a FileAccessLog action, and it exposes operator access patterns"],
  ["approve", "an AdminEvent action about a worker's application"],
  ["reject", "an AdminEvent action about a worker's application"],
  ["suspend", "an AdminEvent action about a worker's standing"],
];

/**
 * HumanWorkUnit audit rows are operational evidence, not client progress
 * copy.  Keep this list explicit so adding a new transition needs an
 * intentional client-language decision instead of inheriting visibility.
 */
const HUMAN_UNIT_ACTIONS = [
  "human_unit_accepted",
  "human_unit_claimed",
  "human_unit_deadline_lapsed",
  "human_unit_exhausted",
  "human_unit_not_admitted",
  "human_unit_paused",
  "human_unit_published",
  "human_unit_refused",
  "human_unit_rejected",
  "human_unit_released",
  "human_unit_residual_scope_published",
  "human_unit_resumed",
  "human_unit_revision_requested",
  "human_unit_run_finished",
  "human_unit_submitted",
  "human_unit_withdrawn",
] as const;

describe("RULE 1 — the client execution report", () => {
  it("projects no actor, no reason and no meta", () => {
    const keys = keysDeep(clientTimelineEventSelect);
    for (const forbidden of ["actorId", "reason", "meta"]) {
      expect(
        keys.has(forbidden),
        `clientTimelineEventSelect must not select ${forbidden}`
      ).toBe(false);
    }
  });

  it("still projects enough to be a timeline at all", () => {
    // Guards the opposite regression: satisfying the rule by selecting
    // nothing would leave a card that proves nothing.
    const keys = keysDeep(clientTimelineEventSelect);
    expect(keys.has("action")).toBe(true);
    expect(keys.has("createdAt")).toBe(true);
  });

  it("the whitelist is exactly the reviewed set", () => {
    expect(Object.keys(CLIENT_TIMELINE_LABELS).sort()).toEqual(PINNED);
  });

  for (const [action, why] of MUST_NEVER_APPEAR) {
    it(`never shows ${action} (${why})`, () => {
      expect(Object.hasOwn(CLIENT_TIMELINE_LABELS, action)).toBe(false);
      expect(clientTimelineEntries([{ action, createdAt: new Date(0) }])).toEqual([]);
    });
  }

  it("never publishes a HumanWorkUnit audit action", () => {
    for (const action of HUMAN_UNIT_ACTIONS) {
      expect(action.startsWith("human_unit_")).toBe(true);
      expect(Object.hasOwn(CLIENT_TIMELINE_LABELS, action)).toBe(false);
      expect(clientTimelineEntries([{ action, createdAt: new Date(0) }])).toEqual([]);
    }
  });

  it("keeps the client timeline and execution report identical when unit rows exist", () => {
    const clientRows = [
      { action: "client_submitted", createdAt: new Date("2026-01-01T10:00:00Z") },
      { action: "va_claimed", createdAt: new Date("2026-01-01T10:01:00Z") },
      { action: "va_submitted_deliverable", createdAt: new Date("2026-01-01T10:02:00Z") },
      { action: "admin_qc_approved", createdAt: new Date("2026-01-01T10:03:00Z") },
    ];
    const withUnitRows = [
      ...clientRows,
      ...HUMAN_UNIT_ACTIONS.map((action, index) => ({
        action,
        createdAt: new Date(`2026-01-02T00:${String(index).padStart(2, "0")}:00Z`),
      })),
    ];
    expect(clientTimelineEntries(withUnitRows)).toEqual(clientTimelineEntries(clientRows));
    expect(executionSummary(withUnitRows)).toEqual(executionSummary(clientRows));
  });

  it("drops an unrecognised action instead of showing it", () => {
    // The whole point: a feature that adds an audit action next year is
    // invisible here until someone chooses otherwise.
    const entries = clientTimelineEntries([
      { action: "some_future_internal_action", createdAt: new Date(0) },
      { action: "admin_qc_approved", createdAt: new Date(1) },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe(CLIENT_TIMELINE_LABELS.admin_qc_approved.label);
  });

  it("is not fooled by inherited object members", () => {
    // `action` is an unconstrained String column. A bare index lookup returns
    // a truthy inherited member for these, which would render an entry whose
    // label is undefined.
    for (const action of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(clientTimelineEntries([{ action, createdAt: new Date(0) }])).toEqual([]);
    }
  });

  it("preserves order and timestamps", () => {
    const a = new Date("2026-01-01T10:00:00Z");
    const b = new Date("2026-01-02T10:00:00Z");
    const entries = clientTimelineEntries([
      { action: "va_submitted_deliverable", createdAt: a },
      { action: "admin_qc_approved", createdAt: b },
    ]);
    expect(entries.map((e) => e.at)).toEqual([a, b]);
  });

  /**
   * These four cases are the ones an adversarial review actually caught in the
   * first cut of this feature, where the counts came from Submission.qcStatus
   * and the headline had no way to know whether anything had passed.
   */
  describe("the headline arithmetic never claims a review that did not happen", () => {
    const a = (...actions: string[]) => actions.map((action) => ({ action }));

    it("a task sent back and not yet re-delivered has NOT passed", () => {
      // The bug: sentBack=1 with zero approvals used to print "before it
      // passed our review" while the page above said "Work is underway".
      const s = executionSummary(a("va_submitted_deliverable", "admin_qc_rejected"));
      expect(s).toEqual({ sentBack: 1, passed: false, approvals: 0 });
    });

    it("does not count a reassignment as a reviewer sending work back", () => {
      // reassignTask flips pending submissions to qcStatus "rejected" with a
      // comment that says it is "a reassignment, not a quality strike", so the
      // Submission table cannot tell the two apart. The audit log can.
      const s = executionSummary(
        a("va_claimed", "va_submitted_deliverable", "admin_reassigned", "va_claimed",
          "va_submitted_deliverable", "admin_qc_approved")
      );
      expect(s).toEqual({ sentBack: 0, passed: true, approvals: 1 });
    });

    it("counts only send-backs that happened BEFORE the work first passed", () => {
      // A revision after delivery can be sent back again. Folding those in
      // would make "before it passed our review" false about events that
      // happened after it passed.
      const s = executionSummary(
        a("admin_qc_rejected", "admin_qc_approved", "client_requested_revision",
          "va_submitted_deliverable", "admin_qc_rejected", "admin_qc_approved")
      );
      expect(s).toEqual({ sentBack: 1, passed: true, approvals: 2 });
    });

    it("counts an exhausted-rounds send-back, which is still a reviewer saying no", () => {
      const s = executionSummary(
        a("admin_qc_rejected", "admin_qc_rejected_exhausted", "admin_qc_approved")
      );
      expect(s).toEqual({ sentBack: 2, passed: true, approvals: 1 });
    });

    it("a task that never reached review has nothing to report", () => {
      expect(executionSummary(a("client_submitted", "admin_quoted"))).toEqual({
        sentBack: 0,
        passed: false,
        approvals: 0,
      });
      expect(executionSummary([])).toEqual({ sentBack: 0, passed: false, approvals: 0 });
    });
  });

  describe("every label is safe to print to a paying client", () => {
    const labels = Object.entries(CLIENT_TIMELINE_LABELS);

    it("contains no em-dash", () => {
      // A standing rule for this product's user-facing copy.
      for (const [action, { label }] of labels) {
        expect(label.includes("—"), `${action} label contains an em-dash`).toBe(false);
      }
    });

    it("contains no digits, which could only be a count of people or money", () => {
      for (const [action, { label }] of labels) {
        expect(/\d/.test(label), `${action} label contains a digit`).toBe(false);
      }
    });

    it("never implies the client can reach the worker directly", () => {
      const banned = /\b(contact|email|e-mail|message|reach out|call them|their name)\b/i;
      for (const [action, { label }] of labels) {
        expect(banned.test(label), `${action} label implies a contact channel`).toBe(false);
      }
    });

    it("reads as a sentence, not as a status enum", () => {
      for (const [action, { label }] of labels) {
        expect(label.includes("_"), `${action} label leaks a raw status name`).toBe(false);
        expect(label[0], `${action} label is not capitalised`).toBe(label[0].toUpperCase());
      }
    });

    it("uses only the three tones the card knows how to render", () => {
      for (const [action, { tone }] of labels) {
        expect(["normal", "review", "flag"], `${action} has an unknown tone`).toContain(tone);
      }
    });
  });
});
