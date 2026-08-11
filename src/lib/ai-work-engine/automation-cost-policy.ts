import type { PlanPrimitiveId } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * WHAT A MACHINE STEP COSTS, AND WHAT IT MAY COST AT WORST.
 *
 * NO IMPORTS BEYOND A TYPE, deliberately, same reason as
 * primitive-vocabulary.ts: pricing.ts must read this table without pulling the
 * provider SDK into its module graph, and the admin console is a client
 * component. registry.ts declares no amount at all — a number there would be a
 * third source, and it is the one the runner used to read at execution time.
 *
 * The registry does still declare `maxAttempts`, an operational judgement
 * about how often a primitive is worth replaying, and ac3 states an attempt
 * budget of its own. A test pins the two together so they cannot silently
 * disagree; the runner obeys the CONTRACT's figure, never the registry's.
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
  /**
   * HOW MANY ATTEMPTS THIS POLICY FUNDS.
   *
   * Absent on ac1 and ac2, and that absence is read as ONE — a policy that
   * never named a retry budget funded exactly one attempt, which is precisely
   * what those two versions did.
   *
   * The field exists because the ceiling and the runner used to disagree. The
   * ceiling funded a single worst-case attempt per step while the registry
   * declared `maxAttempts: 2` for research, so a transient provider error —
   * classified `provider_5xx`, therefore retryable — had its retry refused by
   * the budget. The taxonomy said retry, the money said no, and the run
   * paused six hours before the stall sweep handed the mandate to a person.
   *
   * A retry that the accepted contract does not fund is a retry that must not
   * be promised. So the number becomes contractual, frozen per step at quote
   * time exactly like the per-attempt cost, and the runner obeys the frozen
   * value rather than whatever the registry says today.
   */
  maxAttempts?: number;
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

  /**
   * ac3 — the first policy that funds the retries the runner is allowed to
   * make. Same per-attempt figures as ac2; what changes is that the number of
   * attempts is now stated rather than assumed.
   *
   * ac1 and ac2 stay untouched. Neither of them ever named a retry budget, so
   * both funded one attempt, and that is the honest reading of anything quoted
   * against them — not a number retro-fitted to match today's runner.
   *
   * The attempt counts mirror what the registry declares today (research 2,
   * extract 3). They are copied into the policy rather than read from the
   * registry at runtime, because the registry is deploy-time code and this
   * number has to survive on the contract.
   *
   * ── WHAT THE CEILING RULE NOW MEANS, WHICH IS NOT WHAT IT MEANT ──
   *
   * The rule below is byte-identical to ac2's, but the quantity it bounds is
   * not. It used to cap one worst-case PASS; it now caps the whole retry
   * budget. On the canonical research + extract plan that moves the point
   * where automation survives from a $9.00 internal cost to $19.50, so
   * mandates between those two figures are now quoted as fully human work.
   *
   * That is a real tightening, stated here rather than discovered later. It is
   * also the conservative direction and it happens BEFORE the quote, where a
   * refusal is still free: the alternative is selling automation whose retries
   * we cannot pay for, which is the defect ac3 exists to end. Loosening the
   * share is a separate risk decision and needs its own version.
   */
  ac3: {
    perPrimitive: {
      "research.web_search": {
        expectedMicros: 500_000,
        maxPerAttemptMicros: 3_000_000,
        maxAttempts: 2,
      },
      "extract.structured_rows": {
        expectedMicros: 250_000,
        maxPerAttemptMicros: 600_000,
        maxAttempts: 3,
      },
    },
    ceilingRule: {
      maxShareOfInternalCostBps: 4_000,
      absoluteCapMicros: 20_000_000,
    },
  },

  /**
   * ac4 — 1E-beta1 — prices web.fetch. The research and extract rows are
   * byte-identical to ac3's, so a research+extract-only mandate quotes to the
   * cent what it quoted yesterday; the only change a client can observe is
   * that a plan may now contain a fetch step, priced by the new row.
   *
   * ── THE FETCH FIGURES ARE PROBE ARITHMETIC, NOT ESTIMATES OF VIRTUE ──
   *
   * The empirical probe (2026-08-11, .scratch/probe-web-fetch-results*.json)
   * established two facts this row is built on:
   *
   *   1. `max_content_tokens` IS enforced on text/HTML — a long page came
   *      back truncated to ~1,400 tokens under a 2,000 bound;
   *   2. it is NOT enforced on binary content — a 444 KB PDF returned
   *      complete under the same bound and billed 53,754 input tokens
   *      (~117 tokens/KB of PDF).
   *
   * TEXT worst case at the schema maxima (maxFetches 3, maxContentTokens
   * 10,000, dearest model rate): each fetched page re-enters as input on
   * every later turn, so 10,000 × (3·4/2) = 60,000 accumulated tokens
   * ($0.30) + bounded prompt re-sent per turn (~$0.05) + 4,000 output tokens
   * ($0.10) + $0 per fetch ≈ $0.45.
   *
   * RESIDUAL: a binary served from an extensionless URL evades the candidate
   * filter, and its size is the page owner's choice. At the probe's measured
   * density three 1 MB disguised binaries cost ≈ $3.75 in one attempt. The
   * cap is set ABOVE that residual, the primitive funds exactly ONE attempt
   * (registry.ts carries the same probe reasoning), and the harvest refuses
   * binary content so the overrun can never recur on a retry it does not
   * have. Beyond ~1 MB × 3 the context window starts failing the turn before
   * the money is spent. The one invariant this residual can still break —
   * settled above held on a single attempt — is exactly what the
   * settle-over-hold telemetry watches.
   *
   * EXPECTED is derived, then doubled, then marked uncalibrated: a typical
   * 3-fetch pass over ~2,500-token pages accumulates ~15,000 tokens ($0.08)
   * + prompt + output ≈ $0.15, doubled for the honesty that no live run has
   * measured it yet. The beta2 measurement window recalibrates it against
   * real invocation rows.
   */
  ac4: {
    perPrimitive: {
      "research.web_search": {
        expectedMicros: 500_000,
        maxPerAttemptMicros: 3_000_000,
        maxAttempts: 2,
      },
      "extract.structured_rows": {
        expectedMicros: 250_000,
        maxPerAttemptMicros: 600_000,
        maxAttempts: 3,
      },
      "web.fetch": {
        expectedMicros: 300_000,
        maxPerAttemptMicros: 4_000_000,
        maxAttempts: 1,
      },
    },
    ceilingRule: {
      maxShareOfInternalCostBps: 4_000,
      absoluteCapMicros: 20_000_000,
    },
  },
} as const satisfies Record<string, AutomationCostPolicy>;

export type AutomationCostPolicyVersion = keyof typeof AUTOMATION_COST_POLICIES;

/** The version NEW quotes are built with. Accepted contracts never read it. */
export const CURRENT_AUTOMATION_COST_POLICY: AutomationCostPolicyVersion = "ac4";

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
 * How many attempts a policy funds for one primitive.
 *
 * A version that never named the number funded ONE. That is not a default
 * chosen for convenience: it is what ac1 and ac2 actually paid for, and
 * pretending otherwise would retro-fit a retry budget onto contracts that were
 * never quoted with one.
 */
export function attemptsUnder(version: string, primitiveId: string | null): number {
  const cost = primitiveCostUnder(version, primitiveId);
  if (cost === null) return 0;
  return cost.maxAttempts ?? 1;
}

/**
 * HOW MANY ATTEMPTS AN ACCEPTED STEP MAY ACTUALLY MAKE, AT RUNTIME.
 *
 * Lives here rather than in the runner for two reasons: it is a question about
 * contract economics, and this module has no imports, so it can be tested
 * without standing up a database.
 *
 * For a BILLABLE step the answer comes from the contract and from nowhere
 * else. The registry's `maxAttempts` is deploy-time code, and consulting it
 * here is what broke this: it declared two attempts for research while the
 * accepted ceiling funded one, so a transient provider error was classified
 * retryable and its retry was then refused for want of budget. The run paused
 * having done nothing wrong.
 *
 * Taking the smaller of the two would look like a tidy compromise and is the
 * same mistake wearing the other face: a deploy that lowered the registry
 * figure would silently WITHDRAW an attempt the client already paid for. The
 * point of freezing a number is that neither direction moves.
 *
 * A step that CANNOT bill reserves nothing, so no contractual figure exists
 * for it and none is needed. There the registry's operational judgement is the
 * only bound there ever was, and it still applies.
 */
export function attemptsAllowedForStep(
  primitive: { billable: boolean; maxAttempts: number },
  maxAttemptsAtQuote: number | null
): number {
  if (!primitive.billable) return primitive.maxAttempts;
  /**
   * Null is a contract quoted before attempts were funded explicitly. Every
   * policy of that era set money aside for one worst-case pass per step, so
   * ONE is the fact about what it paid for, not a convenience default.
   *
   * Older contracts still carry no frozen per-attempt cost either, and those
   * never reach this function: a billable step with no frozen ceiling is
   * handed to a person before any attempt is made.
   */
  return maxAttemptsAtQuote ?? 1;
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
