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
  ai_processing: "Automated processing",
};

/**
 * Client-facing status. Internal mechanics (pool, claim, QC loop) are
 * collapsed into "In progress" — the client never sees who works or how QC
 * goes back and forth.
 */
export type ClientStatus =
  | "being_priced"
  /**
   * Standing capacity only. A standing task waits in `submitted` until an
   * operator routes it to the account's specialist; it is never quoted, and
   * approvePricing refuses to price one. Mapping it to "being_priced" — which
   * is what happened before this bucket existed — told the client a fixed
   * price was coming for work their weekly block had already paid for in
   * minutes.
   */
  | "awaiting_routing"
  | "quote_ready"
  | "awaiting_payment"
  | "in_progress"
  | "revision_in_progress"
  | "under_review"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export function clientStatusOf(
  status: TaskStatus,
  /** True when the task draws on a standing capacity block rather than a quote. */
  isStanding = false
): ClientStatus {
  switch (status) {
    case "submitted":
    case "pricing_review":
      return isStanding ? "awaiting_routing" : "being_priced";
    case "quoted":
      return "quote_ready";
    case "awaiting_payment":
      return "awaiting_payment";
    // ai_processing joins the same bucket as the pool and the QC loop, and
    // that is the whole point: the client paid and the work is under way.
    // Which parts a machine did is internal mechanics, exactly like who
    // claimed it and how many QC rounds it took. No new client-facing copy.
    case "ai_processing":
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
  awaiting_routing: "Waiting to be scheduled",
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

/* ── NIGHT VARIANTS — same seven tones, same meaning, re-tuned for the
   worker portal's dark ground (src/app/va). T_ACT inverts (a solid paper
   chip reads as "loudest" on dark the way solid ink did on paper); the
   others keep their light-mode SHAPE (dashed/solid/transparent) and swap
   only the alpha ramp and text color for contrast on #0A0B0D. Every color
   used here already exists elsewhere in the app — see the Card/badge notes
   in src/components/ui.tsx — nothing new was invented for this surface. */
const N_ACT = "border-transparent bg-[#F7F6F3] text-[#14161A]";
const N_DUSK = "border-[#1B2740] bg-[#1B2740]/60 text-[#C9CDD3]";
const N_OPEN = "border-dashed border-white/25 bg-transparent text-[#8A9099]";
const N_WAIT = "border-white/15 bg-transparent text-[#8A9099]";
const N_DEAD = "border-white/8 bg-white/[0.02] text-[#767C86]";
const N_GREEN = "border-[#1E7F5C]/50 bg-[#1E7F5C]/20 text-[#3DDCA0]";
const N_AMBER = "border-[#D98324]/40 bg-[#D98324]/[0.12] text-[#E8A854]";

/** Admin truth: solid ink = in MY queue, dusk = in flight, amber = came back.
 *  `night` selects the worker-portal dark variant above — same status, same
 *  meaning, different ground. */
export function statusBadgeClass(status: TaskStatus, night = false): string {
  switch (status) {
    case "submitted":
    case "pricing_review":
    case "submitted_for_qc":
      return night ? N_ACT : T_ACT;
    case "quoted":
    case "awaiting_payment":
      return night ? N_WAIT : T_WAIT;
    case "open":
      return night ? N_OPEN : T_OPEN;
    // In flight and nobody's move to make: the same dusk tone as `claimed`,
    // which is the other "work is happening, wait" state.
    case "ai_processing":
    case "claimed":
      return night ? N_DUSK : T_DUSK;
    case "qc_rejected":
    case "revision_requested":
    case "disputed":
      return night ? N_AMBER : T_AMBER;
    case "completed":
      return night ? N_GREEN : T_GREEN;
    case "declined":
    case "cancelled":
    case "expired":
      return night ? N_DEAD : T_DEAD;
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled task status: ${unreachable}`);
    }
  }
}

export function clientBadgeClass(cs: ClientStatus): string {
  switch (cs) {
    case "being_priced":
    case "awaiting_routing":
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

export function vaBadgeClass(status: VaProfileStatus, night = false): string {
  switch (status) {
    case "pending_test":
      return night ? N_OPEN : T_OPEN; // ball with the applicant
    case "pending_grading":
      return night ? N_ACT : T_ACT; // admin must grade
    case "approved":
      return night ? N_GREEN : T_GREEN; // an approval — the one non-money green
    case "rejected":
      return night ? N_DEAD : T_DEAD;
    case "suspended":
      return night ? N_AMBER : T_AMBER; // live restriction needing attention — not dead
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled VA profile status: ${unreachable}`);
    }
  }
}

/**
 * AI pricing confidence, for the pricing queue and detail screen. Not
 * green/amber/red: green means money moved (T_GREEN), amber means work
 * came back (T_AMBER) — a suggestion is neither, so borrowing either tone
 * would say something untrue by the same law that already keeps every
 * other stamp in this file honest. T_ACT/T_DUSK/T_DEAD instead reads as
 * "urgency" without claiming to be a money or QC signal: solid ink for
 * "act now", quiet dusk for "in between", and the calm terminal tone for
 * "safe to skim" — the same three-step visual weight this file already
 * uses everywhere else.
 */
export function aiConfidenceBadgeClass(confidence: "low" | "medium" | "high" | null): string {
  switch (confidence) {
    case "low":
    case null: // not yet computed reads exactly like "low" — see queries/tasks.ts
      return T_ACT;
    case "medium":
      return T_DUSK;
    case "high":
      return T_DEAD;
    default: {
      const unreachable: never = confidence;
      throw new Error(`Unhandled AI confidence: ${unreachable}`);
    }
  }
}

export function aiConfidenceLabel(confidence: "low" | "medium" | "high" | null): string {
  switch (confidence) {
    case "low":
      return "Low confidence";
    case null:
      return "Not computed";
    case "medium":
      return "Medium confidence";
    case "high":
      return "High confidence";
    default: {
      const unreachable: never = confidence;
      throw new Error(`Unhandled AI confidence: ${unreachable}`);
    }
  }
}
