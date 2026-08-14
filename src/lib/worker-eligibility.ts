/**
 * MAY THIS WORKER HOLD THIS TASK?
 *
 * One definition, not two. The human work unit has to ask this question at
 * three separate moments — at claim, at submission, and again if a residual
 * package is published to the same claimant after a downstream failure — and
 * re-implementing the rules at each would create a second definition of
 * eligibility that drifts from the first. The drift would be discovered by a
 * worker being let into work they should not have, or shut out of work they had
 * already started.
 *
 * So these predicates are lifted VERBATIM out of `claimTask`
 * (`src/server/actions/va-tasks.ts`) and the claim path calls them. The
 * messages are part of the contract, not decoration: a worker reads them, so a
 * reworded refusal is a behaviour change even when the decision is identical.
 *
 * These are pure predicates over facts, NOT fact-gatherers. Every check in
 * `claimTask` runs inside the compare-and-swap that performs the claim, and
 * several of its reads are conditional — read them outside and they are
 * advisory: N parallel requests all read "2 active tasks", all pass the cap,
 * and all claim. Gathering the facts here would move those reads out of the
 * transaction and change both the query pattern and the order in which a worker
 * meets a refusal. Each function therefore takes what the caller has already
 * read, and returns the refusal message or null.
 */

/** The statuses that count as work in progress against the cap. */
export const ACTIVE_CLAIM_STATUSES = [
  "claimed",
  "submitted_for_qc",
  "qc_rejected",
  "revision_requested",
] as const;

export function vaStatusRefusal(status: string | null | undefined): string | null {
  // `claimTask` reads `profile?.status !== "approved"`, so an absent profile
  // refuses through this same branch. Absence is not permission.
  if (status !== "approved") {
    return "Your account is not currently able to claim tasks.";
  }
  return null;
}

/**
 * Category certification, when the operator has switched it on. A course slug
 * IS the category slug (data-cleanup, research, writing...), so the certificate
 * for a kind of work is evidence for that kind of work specifically.
 *
 * Checked inside the claim transaction rather than by filtering the pool: a
 * worker who passes the exam in another tab can claim immediately, and one who
 * sees a task they cannot take is told which exam opens it instead of watching
 * it silently disappear.
 */
export function categoryCertificationRefusal(facts: {
  requireCategoryCertification: boolean;
  category: { slug: string; name: string } | null;
  certifiedCount: number;
}): string | null {
  if (facts.requireCategoryCertification && facts.category) {
    if (facts.certifiedCount === 0) {
      return `${facts.category.name} work opens up once you pass its Academy exam. The course is free and you can take it now.`;
    }
  }
  return null;
}

/**
 * A worker who already failed this task out of QC cannot pick it up again — the
 * reassignment exists to put fresh eyes on it.
 */
export function priorRejectionRefusal(previouslyFailedCount: number): string | null {
  if (previouslyFailedCount > 0) {
    return "This task was reassigned after your earlier delivery. It is open to other workers now.";
  }
  return null;
}

export function highValueRefusal(facts: {
  tier: string;
  scoreCache: number | null;
  ratedCount: number;
  highValueThreshold: number;
  minRatedDeliveries: number;
}): string | null {
  if (facts.tier === "high_value") {
    const eligible =
      facts.scoreCache !== null &&
      facts.scoreCache >= facts.highValueThreshold &&
      facts.ratedCount >= facts.minRatedDeliveries;
    if (!eligible) {
      return `High-value tasks open up at a ${facts.highValueThreshold.toFixed(1)} score across ${facts.minRatedDeliveries} rated deliveries.`;
    }
  }
  return null;
}

/**
 * Work-in-progress cap: without it one fast worker can hoard the pool. The
 * caller takes an advisory lock before reading `activeCount`, which serializes
 * the read per worker so two concurrent claims on two different tasks cannot
 * both read the same count and both pass it.
 */
export function activeClaimCapRefusal(facts: {
  activeCount: number;
  maxActiveClaims: number;
}): string | null {
  if (facts.activeCount >= facts.maxActiveClaims) {
    return `You already have ${facts.activeCount} tasks in progress. Finish one before claiming another.`;
  }
  return null;
}
