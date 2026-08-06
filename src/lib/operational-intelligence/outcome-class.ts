/**
 * FAILURE PROVENANCE — every finished task gets exactly one outcome class,
 * decided by a fixed precedence over signals the server layer extracts from
 * the task's real records. Pure function: the derivation is testable without
 * a database, and the precedence order is data, not scattered ifs.
 *
 * Why precedence exists: a disputed task also looks cancelled, a payment
 * failure also looks abandoned. One task, one class, most-specific first.
 *
 * The split this enum exists to serve: COMMERCIAL success counts all eight
 * classes in its denominator ("of the mandates we sold, how many were
 * delivered"), while TECHNICAL reliability excludes the purely external
 * interruptions (client_cancelled, admin_cancelled, payment_failure) —
 * a client changing their mind says nothing about whether the workflow
 * holds. disputed, worker_failure, provider_failure and workflow_failure
 * all STAY in technical reliability: a dispute the client won means the
 * output was wrong; work humans cannot finish is a workflow problem; and
 * picking an unstable provider was a design decision.
 */

export const TASK_OUTCOME_CLASSES = [
  "disputed",
  "payment_failure",
  "client_cancelled",
  "admin_cancelled",
  "worker_failure",
  "provider_failure",
  "workflow_failure",
  "workflow_success",
] as const;

export type TaskOutcomeClassValue = (typeof TASK_OUTCOME_CLASSES)[number];

export type OutcomeSignals = {
  /** Task.status at derivation time. */
  status: string;
  /** Task.firstCompletedAt — a delivery happened at least once. */
  everDelivered: boolean;
  /** Any Dispute with outcome "upheld". */
  disputeUpheld: boolean;
  /** Any Payment in cancelled | chargeback. */
  paymentCancelledOrChargeback: boolean;
  /** TaskEvent action payment_window_expired present. */
  paymentWindowExpired: boolean;
  /**
   * TaskEvent admin_cancelled present with a client actor is not a thing the
   * product has today (only admins cancel); the server layer passes what the
   * events actually say and this stays honest if a client-cancel ever ships.
   */
  cancelledByClient: boolean;
  cancelledByAdmin: boolean;
  /** admin_qc_rejected_exhausted event, or the worker released after claim. */
  workerExhaustedOrAbandoned: boolean;
  /** Workflow run paused/abandoned with provider-failed invocations on the blocking step. */
  runFailedWithProviderErrors: boolean;
  /** Workflow run paused/abandoned without a provider-attributable cause. */
  runFailedOtherwise: boolean;
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "expired", "declined"]);

/**
 * Null while the task is still in flight: an outcome class asserted before
 * the outcome exists would be survivorship bias with extra steps.
 */
export function deriveOutcomeClass(s: OutcomeSignals): TaskOutcomeClassValue | null {
  const finished = TERMINAL_STATUSES.has(s.status) || s.everDelivered;
  if (!finished) return null;

  if (s.disputeUpheld) return "disputed";
  if (s.paymentCancelledOrChargeback || s.paymentWindowExpired) return "payment_failure";
  if (s.cancelledByClient) return "client_cancelled";
  /**
   * Keyed on the terminal STATUS, not on delivery: an admin cancel that
   * ENDS the task in `cancelled` is a cancellation even when a delivery
   * happened first (delivered → revision → cancelled+refunded was scoring
   * as workflow_success, polluting both rates AND the margin set with a
   * refunded task). An admin_cancelled event on a task that still ends
   * `completed` remains a success — the delivery stood.
   */
  if (s.cancelledByAdmin && (s.status === "cancelled" || !s.everDelivered)) {
    return "admin_cancelled";
  }
  if (s.workerExhaustedOrAbandoned && !s.everDelivered) return "worker_failure";
  if (s.runFailedWithProviderErrors && !s.everDelivered) return "provider_failure";
  if (s.runFailedOtherwise && !s.everDelivered) return "workflow_failure";
  if (s.everDelivered) return "workflow_success";
  // Terminal without a delivery and without any specific signal: expired or
  // declined before work — an external interruption, not a workflow verdict.
  return s.status === "expired" || s.status === "declined"
    ? "payment_failure"
    : "workflow_failure";
}

/** The classes technical reliability excludes: purely external interruptions. */
export const EXTERNAL_OUTCOME_CLASSES: readonly TaskOutcomeClassValue[] = [
  "client_cancelled",
  "admin_cancelled",
  "payment_failure",
];
