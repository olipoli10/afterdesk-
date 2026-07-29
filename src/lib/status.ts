import type { TaskStatus } from "@prisma/client";
import { ALLOWED_TRANSITIONS } from "@/lib/state";

/**
 * Terminal = no outgoing edge. DERIVED from the transition map rather than
 * hand-maintained, so the two can never drift (they already had, on
 * `completed`, before the dispute window made it non-terminal).
 */
export const TERMINAL_STATUSES: TaskStatus[] = (
  Object.keys(ALLOWED_TRANSITIONS) as TaskStatus[]
).filter((s) => ALLOWED_TRANSITIONS[s].length === 0);

export const NON_TERMINAL_STATUSES: TaskStatus[] = (
  Object.keys(ALLOWED_TRANSITIONS) as TaskStatus[]
).filter((s) => ALLOWED_TRANSITIONS[s].length > 0);

/**
 * The window during which the assigned VA may read a task's input files (and
 * their own deliverables). Single source of truth — the download route derives
 * its rule from this, so the access window and the state machine cannot drift.
 * `revision_requested` and `disputed` are included: the task is still in that
 * worker's hands and they may be asked to fix it.
 */
export const VA_FILE_ACCESS_STATUSES: TaskStatus[] = [
  "claimed",
  "submitted_for_qc",
  "qc_rejected",
  "revision_requested",
  "disputed",
];

/** Admin-facing labels — the raw truth. */
export const ADMIN_STATUS_LABELS: Record<TaskStatus, string> = {
  submitted: "Submitted",
  pricing_review: "Pricing review",
  quoted: "Quoted",
  awaiting_payment: "Awaiting payment",
  declined: "Declined",
  open: "Open in pool",
  claimed: "Claimed",
  submitted_for_qc: "Awaiting QC",
  qc_rejected: "QC rejected",
  revision_requested: "Revision requested",
  completed: "Completed",
  disputed: "Disputed",
  cancelled: "Cancelled",
  expired: "Expired",
};

/**
 * Client-facing status. Internal mechanics (pool, claim, QC loop) are
 * collapsed into "In progress" — the client never sees who works or how QC
 * goes back and forth.
 */
export type ClientStatus =
  | "being_priced"
  | "quote_ready"
  | "awaiting_payment"
  | "in_progress"
  | "revision_in_progress"
  | "under_review"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export function clientStatusOf(status: TaskStatus): ClientStatus {
  switch (status) {
    case "submitted":
    case "pricing_review":
      return "being_priced";
    case "quoted":
      return "quote_ready";
    case "awaiting_payment":
      return "awaiting_payment";
    case "open":
    case "claimed":
    case "submitted_for_qc":
    case "qc_rejected":
      return "in_progress";
    case "revision_requested":
      return "revision_in_progress";
    case "disputed":
      return "under_review";
    case "completed":
      return "completed";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default: {
      // Exhaustiveness guard: a new status must be handled here explicitly.
      const unreachable: never = status;
      throw new Error(`Unhandled task status: ${unreachable}`);
    }
  }
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  being_priced: "Being priced",
  quote_ready: "Quote ready",
  awaiting_payment: "Awaiting your payment",
  in_progress: "In progress",
  revision_in_progress: "Revision in progress",
  under_review: "Under review",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

/* ─────────────────────────────────────────────────────────────────────────
   STAMP TONES — the palette law applied to statuses. Green means money
   moved or approval happened, NEVER "your move" (a quote is not money).
   Amber means work came back / needs attention, NEVER intake.
   Text hexes are the AA-derived inks from globals.css — don't "fix" them
   back to the raw brand hues; those fail contrast at stamp size.
   ───────────────────────────────────────────────────────────────────────── */
const T_ACT = "border-transparent bg-[#14161A] text-[#F7F6F3]"; // your move — someone must act NOW
const T_DUSK = "border-[#1B2740]/30 bg-[#1B2740]/[0.06] text-[#1B2740]"; // out in the night — in flight
const T_OPEN = "border-dashed border-[#14161A]/30 bg-transparent text-[#5B6069]"; // an unclaimed slot
const T_WAIT = "border-[#14161A]/15 bg-transparent text-[#5B6069]"; // waiting on the other side
const T_DEAD = "border-[#14161A]/10 bg-[#14161A]/[0.02] text-[#5B6069]"; // terminal, no money moved
const T_GREEN = "border-[#1E7F5C]/40 bg-[#1E7F5C]/10 text-[#166049]"; // money/approved ONLY
const T_AMBER = "border-[#D98324]/50 bg-[#D98324]/10 text-[#955710]"; // returned-work/attention ONLY

/** Admin truth: solid ink = in MY queue, dusk = in flight, amber = came back. */
export function statusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case "submitted":
    case "pricing_review":
    case "submitted_for_qc":
      return T_ACT;
    case "quoted":
    case "awaiting_payment":
      return T_WAIT;
    case "open":
      return T_OPEN;
    case "claimed":
      return T_DUSK;
    case "qc_rejected":
    case "revision_requested":
    case "disputed":
      return T_AMBER;
    case "completed":
      return T_GREEN;
    case "declined":
    case "cancelled":
    case "expired":
      return T_DEAD;
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled task status: ${unreachable}`);
    }
  }
}

export function clientBadgeClass(cs: ClientStatus): string {
  switch (cs) {
    case "being_priced":
      return T_WAIT;
    case "quote_ready":
    case "awaiting_payment":
      return T_ACT; // the two "your move" moments — strongest neutral, NOT green
    case "in_progress":
    case "revision_in_progress":
      return T_DUSK; // the client never sees the QC loop as alarm
    case "under_review":
      return T_AMBER;
    case "completed":
      return T_GREEN;
    case "declined":
    case "cancelled":
    case "expired":
      return T_DEAD;
    default: {
      const unreachable: never = cs;
      throw new Error(`Unhandled client status: ${unreachable}`);
    }
  }
}

/** Worker-profile stamps — replaces the hand-rolled tone maps in the admin
    workers page and the VA dashboard so the law can't drift per-page. */
export type VaProfileStatus =
  | "pending_test"
  | "pending_grading"
  | "approved"
  | "rejected"
  | "suspended";

export function vaBadgeClass(status: VaProfileStatus): string {
  switch (status) {
    case "pending_test":
      return T_OPEN; // ball with the applicant
    case "pending_grading":
      return T_ACT; // admin must grade
    case "approved":
      return T_GREEN; // an approval — the one non-money green
    case "rejected":
      return T_DEAD;
    case "suspended":
      return T_AMBER; // live restriction needing attention — not dead
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled VA profile status: ${unreachable}`);
    }
  }
}
