import type { TaskStatus } from "@prisma/client";

/** Terminal states — no exit. `expired` is NOT terminal (admin can re-pool). */
export const TERMINAL_STATUSES: TaskStatus[] = ["declined", "completed", "cancelled"];

export const NON_TERMINAL_STATUSES: TaskStatus[] = [
  "submitted",
  "pricing_review",
  "quoted",
  "open",
  "claimed",
  "submitted_for_qc",
  "qc_rejected",
  "revision_requested",
  "expired",
];

/** Admin-facing labels — the raw truth. */
export const ADMIN_STATUS_LABELS: Record<TaskStatus, string> = {
  submitted: "Submitted",
  pricing_review: "Pricing review",
  quoted: "Quoted",
  declined: "Declined",
  open: "Open in pool",
  claimed: "Claimed",
  submitted_for_qc: "Awaiting QC",
  qc_rejected: "QC rejected",
  revision_requested: "Revision requested",
  completed: "Completed",
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
  | "in_progress"
  | "revision_in_progress"
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
    case "open":
    case "claimed":
    case "submitted_for_qc":
    case "qc_rejected":
      return "in_progress";
    case "revision_requested":
      return "revision_in_progress";
    case "completed":
      return "completed";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
  }
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  being_priced: "Being priced",
  quote_ready: "Quote ready",
  in_progress: "In progress",
  revision_in_progress: "Revision in progress",
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
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "open":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "claimed":
    case "submitted_for_qc":
    case "qc_rejected":
    case "revision_requested":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "declined":
    case "cancelled":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "expired":
      return "bg-red-50 text-red-800 border-red-200";
  }
}

export function clientBadgeClass(cs: ClientStatus): string {
  switch (cs) {
    case "being_priced":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "quote_ready":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "in_progress":
    case "revision_in_progress":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "declined":
    case "cancelled":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "expired":
      return "bg-red-50 text-red-800 border-red-200";
  }
}
