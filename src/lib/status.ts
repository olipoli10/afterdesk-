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

/** Subtle badge styling (neutral base, semantic tints — no decorative badges). */
export function statusBadgeClass(status: TaskStatus): string {
  switch (status) {
    case "submitted":
    case "pricing_review":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "quoted":
    case "awaiting_payment":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "open":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "claimed":
    case "submitted_for_qc":
    case "qc_rejected":
    case "revision_requested":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "disputed":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "declined":
    case "cancelled":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "expired":
      return "bg-red-50 text-red-800 border-red-200";
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled task status: ${unreachable}`);
    }
  }
}

export function clientBadgeClass(cs: ClientStatus): string {
  switch (cs) {
    case "being_priced":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "quote_ready":
    case "awaiting_payment":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "in_progress":
    case "revision_in_progress":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "under_review":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "declined":
    case "cancelled":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "expired":
      return "bg-red-50 text-red-800 border-red-200";
    default: {
      const unreachable: never = cs;
      throw new Error(`Unhandled client status: ${unreachable}`);
    }
  }
}
