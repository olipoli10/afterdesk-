/**
 * THE HUMAN WORK UNIT STATE TABLE.
 *
 * Pure: no database, no clock, no identity. This module says which transitions
 * are SHAPED correctly. It does not say whether one may happen — that needs the
 * claimant's identity, the claim generation, the revision counter and the run's
 * lifecycle, and those are enforced by compare-and-swap and by database
 * constraints where a concurrent writer cannot argue with them.
 *
 * A pair being legal here is a necessary condition and never a sufficient one.
 *
 * Every non-terminal state has a named owner and exactly one safe next action
 * (FR-046, FR-052, SC-011), because the operator question this feature has to
 * answer without interpretation is "a person is waiting — on what, and what do
 * I do about it?"
 */

export const HUMAN_UNIT_STATES = [
  "admitted",
  "published",
  "claimed",
  "submitted",
  "in_review",
  "revision_requested",
  "accepted",
  "resumed",
  "paused",
  "exhausted",
  "withdrawn",
] as const;

export type HumanUnitState = (typeof HUMAN_UNIT_STATES)[number];

/**
 * `resumed` is terminal even though it is the success case: the machine carries
 * on from there, but the unit is finished and must never reopen. Reopening it
 * is how a second resume, a second claim or a second payout would become
 * reachable. `paused` is deliberately NOT terminal — it is admin-owned and has
 * a way forward.
 */
export const TERMINAL_HUMAN_UNIT_STATES = [
  "resumed",
  "exhausted",
  "withdrawn",
] as const satisfies readonly HumanUnitState[];

export function isTerminalHumanUnitState(state: HumanUnitState): boolean {
  return (TERMINAL_HUMAN_UNIT_STATES as readonly string[]).includes(state);
}

/**
 * The closed transition table. `null` is the absent row — `not_admitted`.
 *
 * Release from `submitted` and `in_review` is present because the fencing
 * trigger fires on a change to `Task.claimedById` and knows nothing about the
 * unit's state: an admin reassignment or a lease lapse can land while a
 * candidate is under review. Refusing the pair would not prevent that, it would
 * only let the task and the unit disagree about who holds the work. The audit
 * vocabulary (contracts/audit-events.md §1) already lists all four source
 * states for `released`.
 */
const ALLOWED: Record<HumanUnitState, readonly HumanUnitState[]> = {
  admitted: ["published", "paused", "withdrawn"],
  published: ["claimed", "paused", "withdrawn"],
  claimed: ["submitted", "published", "paused", "withdrawn"],
  submitted: [
    "in_review",
    "accepted",
    "revision_requested",
    "exhausted",
    "published",
    "withdrawn",
  ],
  in_review: ["accepted", "revision_requested", "exhausted", "published", "withdrawn"],
  revision_requested: ["submitted", "published", "paused", "withdrawn"],
  accepted: ["resumed", "paused", "withdrawn"],
  // Admin-owned. Continue explicitly within the unchanged frozen ceiling, or
  // fail closed. Never straight back into the work.
  paused: ["accepted", "exhausted", "withdrawn"],
  resumed: [],
  exhausted: [],
  withdrawn: [],
};

export function canTransition(
  from: HumanUnitState | null,
  to: HumanUnitState
): boolean {
  if (!(HUMAN_UNIT_STATES as readonly string[]).includes(to)) return false;
  // Admission is the only way in, and it only happens once: a unit that
  // already has a row can never be re-admitted.
  if (from === null) return to === "admitted";
  if (!(HUMAN_UNIT_STATES as readonly string[]).includes(from)) return false;
  return ALLOWED[from].includes(to);
}

/**
 * The closed cause vocabulary (contracts/audit-events.md §1). A cause not on
 * this list may not be written. The same discipline `exception-cause.ts`
 * applies to its own vocabulary: an audit row is the record of what happened to
 * someone's paid mandate, and a cause invented at a call site is a claim nobody
 * checked.
 */
export const HUMAN_UNIT_CAUSES = [
  "admitted",
  "published",
  "claimed",
  "released",
  "reclaimed",
  "submitted",
  "review_opened",
  "accepted",
  "revision_requested",
  "exhausted:revisions",
  "exhausted:unsafe",
  "resumed",
  "paused:publication_deadline",
  "paused:submission_deadline",
  "paused:input_unavailable",
  "paused:classification_conflict",
  "paused:economics",
  "admin_continued",
  "admin_failed_closed",
  "withdrawn:lifecycle_exit",
  "refused:self_review",
  "refused:stale_generation",
  "refused:duplicate",
] as const;

export type HumanUnitCause = (typeof HUMAN_UNIT_CAUSES)[number];

/**
 * Not-admitted verdicts produce no unit row, so they are recorded on the run
 * instead. The vocabulary is kept DISJOINT from both the transition causes
 * above and from any capability or budget vocabulary: FR-053 exists because a
 * refusal rendered as a missing capability sends an operator to fix the wrong
 * thing, which is the defect `compile-preview.ts:154-176` already guards.
 */
export const HUMAN_UNIT_REFUSAL_CAUSES = [
  "unsupported_topology",
  "malformed_topology",
  "unmapped_economics",
] as const;

export type HumanUnitRefusalCause = (typeof HUMAN_UNIT_REFUSAL_CAUSES)[number];

export type SafeNextAction =
  | "await_precut_drain"
  | "claim_or_wait"
  | "submit_or_release"
  | "accept_or_reject"
  | "revise_or_release"
  | "await_resume"
  | "continue_within_ceiling_or_fail_closed"
  | "open_manual_residual_path";

/**
 * Exactly one safe next action per state (contracts/projections.md §4).
 *
 * `admitted` and `accepted` are the two system-owned waits. projections.md
 * tabulates the operator-facing states; leaving these two unnamed would show an
 * operator a unit with no move, which reads as "nothing to do" on a mandate
 * where a person is in fact waiting.
 */
export function safeNextAction(
  state: HumanUnitState,
  cause: HumanUnitCause | null
): SafeNextAction | null {
  switch (state) {
    case "admitted":
      return "await_precut_drain";
    case "published":
      return "claim_or_wait";
    case "claimed":
      return "submit_or_release";
    case "submitted":
    case "in_review":
      return "accept_or_reject";
    case "revision_requested":
      return "revise_or_release";
    case "accepted":
      return "await_resume";
    case "paused":
      // The economics pause is the only one with a way forward inside the
      // feature, and it is bounded: continue within the UNCHANGED frozen
      // ceiling, or fail closed. Never a licence to raise the ceiling. Any
      // other cause — including one we cannot read — falls closed.
      return cause === "paused:economics"
        ? "continue_within_ceiling_or_fail_closed"
        : "open_manual_residual_path";
    case "exhausted":
      // Terminal for the unit, but the mandate still needs finishing by hand.
      return "open_manual_residual_path";
    case "resumed":
    case "withdrawn":
      return null;
  }
}

/**
 * Every not-admitted verdict ends the same way: the mandate is finished by
 * hand. The cause still matters — it is rendered in its own terms on the admin
 * surface (FR-053) — it just does not change what happens next.
 *
 * Written as an exhaustive switch rather than a constant so that adding a
 * fourth refusal cause fails to compile here, forcing whoever adds it to decide
 * whether it really routes to the same place.
 */
export function safeNextActionForRefusal(
  cause: HumanUnitRefusalCause
): SafeNextAction {
  switch (cause) {
    case "unsupported_topology":
    case "malformed_topology":
    case "unmapped_economics":
      return "open_manual_residual_path";
  }
}
