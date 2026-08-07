import type { PlanPrimitiveId } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * WHAT A MACHINE STEP COSTS, AND WHAT IT MAY COST AT WORST.
 *
 * NO IMPORTS BEYOND A TYPE, deliberately, same reason as
 * primitive-vocabulary.ts: pricing.ts must read this table without pulling the
 * provider SDK into its module graph, and the admin console is a client
 * component. registry.ts reads its per-attempt caps from here too, so there is
 * one place these numbers live and a test pins the two together.
 *
 * ── TWO NUMBERS, NOT ONE ──
 *
 * The registry used to carry a single `maxCostMicrosPerAttempt` and the quote
 * used the planner's guess. That conflated two different questions:
 *
 *   expectedMicros      what a normal attempt costs. Feeds the PRICE, so the
 *                       client pays for work that can actually be done.
 *   maxPerAttemptMicros the ceiling one attempt may reserve. Feeds the
 *                       RESERVATION, and never the price: charging every
 *                       mandate for the worst case would overprice all of them
 *                       to insure against the rare one.
 *
 * ── A POLICY IS NEVER EDITED IN PLACE ──
 *
 * Changing a number here means adding a NEW version, never mutating an old
 * one. Accepted contracts no longer read this table at all (their values are
 * materialised on the plan steps), so an in-place edit would not break them —
 * but it would destroy the provenance, which is the ability to answer "on what
 * basis was this quote built". A version whose numbers changed cannot answer
 * that question about anything quoted before the change.
 *
 * `test/automation-cost-policy.test.ts` pins the historical versions by value.
 * Editing one fails the build; adding `ac2` does not.
 */

export type PrimitiveCost = {
  /** A normal attempt, in microdollars. Floors the price. */
  expectedMicros: number;
  /** The most one attempt may reserve, in microdollars. Never prices. */
  maxPerAttemptMicros: number;
};

export type CeilingRule = {
  /**
   * The share of a mandate's internal cost the business will risk on
   * automation. Beyond it, the preflight demotes steps rather than accept the
   * exposure: an automated step is worth having only while the money it can
   * burn stays proportionate to the job.
   */
  maxShareOfInternalCostBps: number;
  /** A hard ceiling whatever the mandate's size. */
  absoluteCapMicros: number;
};

export type AutomationCostPolicy = {
  perPrimitive: Partial<Record<PlanPrimitiveId, PrimitiveCost>>;
  ceilingRule: CeilingRule;
};

/**
 * ac1 — the first policy, dated by its contents rather than by a comment.
 *
 * The research figure is arithmetic, not a feeling. A server-side search tool
 * loops INSIDE one request and re-sends each result set as input on the next
 * turn, so input grows with the square of the search count: at the dearest
 * model rate, 12 searches accumulate roughly 316k input tokens ($1.58), plus
 * 12k output tokens ($0.30), plus 12 billed queries ($0.12). That is the $2.00
 * worst case. The expected figure is what the real end-to-end run measured for
 * a full research pass, which was closer to $0.50.
 */
export const AUTOMATION_COST_POLICIES = {
  ac1: {
    perPrimitive: {
      "research.web_search": { expectedMicros: 500_000, maxPerAttemptMicros: 2_000_000 },
      "extract.structured_rows": { expectedMicros: 250_000, maxPerAttemptMicros: 600_000 },
      // The three pure primitives are absent on purpose: no provider, no
      // spend, nothing to price or reserve. Absence is the statement.
    },
    ceilingRule: {
      // 40% of the internal cost. A mandate whose automation could burn more
      // than that is one where the machine is not obviously worth running.
      maxShareOfInternalCostBps: 4_000,
      absoluteCapMicros: 20_000_000, // $20 on any single run.
    },
  },

  /**
   * ac2 — research raised to $3.00, and ac1 left exactly as it was.
   *
   * WHY A NEW VERSION RATHER THAN AN EDIT. ac1's $2.00 was the computed worst
   * case with NO room for the prompt itself, and the prompt was
   * client-controlled: a long brief pushed the runtime estimate past the
   * frozen cap, the call was refused before dispatch, the refusal retried as
   * `unknown`, and the run paused with nothing wrong except the length of a
   * description. The prompt is bounded now (research.ts), but the cap still
   * needs headroom above the bounded worst case rather than sitting on it.
   *
   * Editing ac1 in place would have been easier and wrong. Anything quoted
   * under ac1 was quoted against $2.00, and the record of that must survive
   * the correction: a version whose numbers changed can no longer answer
   * "on what basis was this quote built".
   */
  ac2: {
    perPrimitive: {
      "research.web_search": { expectedMicros: 500_000, maxPerAttemptMicros: 3_000_000 },
      "extract.structured_rows": { expectedMicros: 250_000, maxPerAttemptMicros: 600_000 },
    },
    ceilingRule: {
      maxShareOfInternalCostBps: 4_000,
      absoluteCapMicros: 20_000_000,
    },
  },
} as const satisfies Record<string, AutomationCostPolicy>;

export type AutomationCostPolicyVersion = keyof typeof AUTOMATION_COST_POLICIES;

/** The version NEW quotes are built with. Accepted contracts never read it. */
export const CURRENT_AUTOMATION_COST_POLICY: AutomationCostPolicyVersion = "ac2";

export function policyFor(version: string): AutomationCostPolicy | null {
  return Object.hasOwn(AUTOMATION_COST_POLICIES, version)
    ? AUTOMATION_COST_POLICIES[version as AutomationCostPolicyVersion]
    : null;
}

/**
 * The cost of one primitive under one policy, or null when the policy does not
 * price it (a pure primitive, or an id the policy predates).
 *
 * Callers pricing a NEW quote use this. Callers executing an ACCEPTED contract
 * must not: their numbers are on the plan step, frozen at quote time.
 */
export function primitiveCostUnder(
  version: string,
  primitiveId: string | null
): PrimitiveCost | null {
  if (primitiveId === null) return null;
  const policy = policyFor(version);
  if (policy === null) return null;
  const table = policy.perPrimitive as Record<string, PrimitiveCost | undefined>;
  return Object.hasOwn(table, primitiveId) ? (table[primitiveId] ?? null) : null;
}

/**
 * A POLICY COST IS A FLOOR, NEVER AN OVERRIDE.
 *
 * The planner's own estimate describes THIS mandate; the policy describes the
 * primitive in general. When the planner says more, it is because it read a
 * brief the policy never saw, and lowering its number to a generic average
 * would underprice exactly the jobs that are hardest.
 *
 * So the policy can only raise. `max`, in both directions of surprise.
 */
export function effectiveExpectedMicros(
  planEstimatedMicros: bigint,
  policyExpectedMicros: bigint | null
): bigint {
  if (policyExpectedMicros === null) return planEstimatedMicros;
  return planEstimatedMicros > policyExpectedMicros ? planEstimatedMicros : policyExpectedMicros;
}

/**
 * The conservative scenario follows the same rule against the per-attempt
 * ceiling: a step whose own plan estimate already exceeds the policy's worst
 * case is a step the plan thinks is unusually heavy, and that judgement stands.
 */
export function effectiveConservativeMicros(
  planEstimatedMicros: bigint,
  policyMaxPerAttemptMicros: bigint | null
): bigint {
  if (policyMaxPerAttemptMicros === null) return planEstimatedMicros;
  return planEstimatedMicros > policyMaxPerAttemptMicros
    ? planEstimatedMicros
    : policyMaxPerAttemptMicros;
}

/** Cents to microdollars, integer arithmetic only. */
export const MICROS_PER_CENT = 10_000n;

export function centsToMicros(cents: number): bigint {
  return BigInt(Math.max(0, Math.trunc(cents))) * MICROS_PER_CENT;
}

/** Microdollars to cents, rounded UP: an under-reported cost is the one that drifts. */
export function microsToCentsCeil(micros: bigint): number {
  const m = micros < 0n ? 0n : micros;
  return Number((m + MICROS_PER_CENT - 1n) / MICROS_PER_CENT);
}
