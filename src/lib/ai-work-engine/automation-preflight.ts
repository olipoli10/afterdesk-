import {
  effectiveConservativeMicros,
  effectiveExpectedMicros,
  policyFor,
  primitiveCostUnder,
  centsToMicros,
  type AutomationCostPolicy,
} from "@/lib/ai-work-engine/automation-cost-policy";

/**
 * THE ECONOMIC PREFLIGHT — decided BEFORE the quote, entirely in memory.
 *
 * Pure: no database, no network, no clock. The caller runs it, gets a final
 * plan back, and writes that plan ONCE. Nothing here persists anything, and
 * that is the point of section D: a plan version that exists is a plan version
 * other code can already read, so "write it then fix it until it is
 * affordable" opens a window where the stored price does not match the stored
 * plan.
 *
 * ── WHAT IT DECIDES ──
 *
 * Given the steps the compiler WOULD automate, it computes what one attempt of
 * each could cost at worst. If that exceeds what the economic rule is willing
 * to risk on this mandate, it demotes one step and recomputes, until the plan
 * either fits or has no automation left. A fully human plan is the correct
 * floor, not a failure: it is exactly how the platform worked before any of
 * this existed.
 *
 * Demoting BEFORE the quote is the whole design. Demoting after payment would
 * mean the client paid for automation that then did not run.
 */

export type PreflightStep = {
  order: number;
  /** Null for a human step, or one the compiler already refused. */
  primitiveId: string | null;
  primitiveVersion: number | null;
  /** Whether the topology/gate would let this step run on a machine at all. */
  automatable: boolean;
  /** The planner's own figure for this step, in cents. */
  estimatedAiCostCents: number;
};

export type PreflightStepResult = {
  order: number;
  primitiveId: string | null;
  primitiveVersion: number | null;
  /** True when this preflight took the automation away for economic reasons. */
  demotedForBudget: boolean;
  /** Frozen at quote time. Null for a step that will not bill. */
  expectedCostMicrosAtQuote: bigint | null;
  maxCostMicrosPerAttemptAtQuote: bigint | null;
};

export type PreflightResult = {
  steps: PreflightStepResult[];
  expectedAutomationCostMicros: bigint;
  conservativeAutomationCostMicros: bigint;
  automationSpendCeilingMicros: bigint;
  policyVersion: string;
  /** How many steps the economic rule took the automation away from. */
  demotedCount: number;
};

/**
 * The risk the business will carry on one mandate, as a pure function of the
 * mandate's own internal cost. Both bounds apply; the smaller wins.
 */
export function allowedCeilingMicros(
  internalCostCents: number,
  rule: AutomationCostPolicy["ceilingRule"]
): bigint {
  const internalMicros = centsToMicros(internalCostCents);
  const byShare = (internalMicros * BigInt(rule.maxShareOfInternalCostBps)) / 10_000n;
  const cap = BigInt(rule.absoluteCapMicros);
  return byShare < cap ? byShare : cap;
}

/**
 * Run the preflight to a fixed point.
 *
 * TERMINATION, argued rather than hoped: every iteration that does not return
 * demotes exactly one step that was automated, and a step once demoted is
 * never re-promoted. The number of automated steps is finite and strictly
 * decreasing, so the loop runs at most once per automatable step and then
 * exits through the "nothing left to demote" branch. The bound is asserted
 * explicitly below so a future edit that breaks the invariant fails loudly
 * instead of hanging a server action.
 *
 * DEMOTION ORDER, deterministic: the most expensive reservation first, and on
 * a tie the LATER step (higher `order`). Dropping the costliest step first
 * reaches an affordable plan in the fewest demotions, and preferring the later
 * one keeps the early pipeline stages, which are the ones every subsequent
 * step reads from.
 */
export function runAutomationPreflight(input: {
  steps: PreflightStep[];
  /** The mandate's internal cost, which bounds the risk. */
  internalCostCents: number;
  policyVersion: string;
}): PreflightResult {
  const policy = policyFor(input.policyVersion);
  /**
   * An unknown policy version prices nothing and authorises nothing. Every
   * step loses its automation: the alternative would be to fall back to some
   * other version's numbers, which is precisely the silent economic drift this
   * whole correction exists to remove.
   */
  if (policy === null) {
    return {
      steps: input.steps.map((s) => ({
        order: s.order,
        primitiveId: null,
        primitiveVersion: null,
        demotedForBudget: true,
        expectedCostMicrosAtQuote: null,
        maxCostMicrosPerAttemptAtQuote: null,
      })),
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: 0n,
      policyVersion: input.policyVersion,
      demotedCount: input.steps.filter((s) => s.automatable && s.primitiveId !== null).length,
    };
  }

  const allowed = allowedCeilingMicros(input.internalCostCents, policy.ceilingRule);
  const demoted = new Set<number>();
  const maxIterations = input.steps.length + 1;

  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const billable = input.steps.filter(
      (s) => s.automatable && s.primitiveId !== null && !demoted.has(s.order)
    );

    let expected = 0n;
    let conservative = 0n;
    const perStep = new Map<number, { expected: bigint; max: bigint }>();

    for (const step of billable) {
      const cost = primitiveCostUnder(input.policyVersion, step.primitiveId);
      /**
       * A STEP THIS POLICY DOES NOT PRICE CANNOT BILL UNDER THIS CONTRACT.
       *
       * Two cases land here and both want the same answer. A pure primitive
       * (build.csv, split.exceptions) has no provider at all, and a planner
       * that attached an AI cost to one was simply wrong about its own step.
       * A primitive newer than the policy version is one this contract was
       * never priced for.
       *
       * Either way it contributes nothing to the ceiling and carries NO frozen
       * value, which makes the runtime hand it to a person: a step whose spend
       * cannot be bounded against the accepted contract does not run on a
       * machine. Counting it would reserve money for work that will be human.
       */
      if (cost === null) continue;

      const planMicros = centsToMicros(step.estimatedAiCostCents);
      // Floors, never overrides: a plan that says more knows something the
      // policy does not.
      const stepExpected = effectiveExpectedMicros(planMicros, BigInt(cost.expectedMicros));
      const stepMax = effectiveConservativeMicros(planMicros, BigInt(cost.maxPerAttemptMicros));
      expected += stepExpected;
      conservative += stepMax;
      perStep.set(step.order, { expected: stepExpected, max: stepMax });
    }

    /**
     * The ceiling must cover one worst-case attempt of every remaining step,
     * or the run would reserve, be refused and pause having done nothing. It
     * may exceed the expected cost — that is the risk the policy accepts — but
     * it is never below the conservative sum, which is the arithmetic minimum
     * for the plan to be executable at all.
     */
    const needed = conservative;
    const fits = needed <= allowed || billable.length === 0;

    if (fits) {
      const ceiling = billable.length === 0 ? 0n : needed;
      return {
        steps: input.steps.map((s) => {
          const frozen = perStep.get(s.order);
          const wasDemoted = demoted.has(s.order);
          return {
            order: s.order,
            primitiveId: wasDemoted ? null : s.primitiveId,
            primitiveVersion: wasDemoted ? null : s.primitiveVersion,
            demotedForBudget: wasDemoted,
            expectedCostMicrosAtQuote: frozen?.expected ?? null,
            maxCostMicrosPerAttemptAtQuote: frozen?.max ?? null,
          };
        }),
        expectedAutomationCostMicros: expected,
        conservativeAutomationCostMicros: conservative,
        automationSpendCeilingMicros: ceiling,
        policyVersion: input.policyVersion,
        demotedCount: demoted.size,
      };
    }

    // Costliest reservation first; on a tie, the LATER step, so the early
    // pipeline stages that everything downstream reads from survive longest.
    const victim = [...billable]
      .filter((s) => perStep.has(s.order))
      .sort((a, b) => {
      const am = perStep.get(a.order)?.max ?? 0n;
      const bm = perStep.get(b.order)?.max ?? 0n;
      if (am !== bm) return bm > am ? 1 : -1;
        return b.order - a.order;
      })[0];
    /**
     * No priced step left to demote, yet the plan still does not fit. Only
     * reachable if the allowance is below the cheapest single attempt, and the
     * honest answer is a fully human plan rather than a loop.
     */
    if (!victim) {
      for (const s of billable) demoted.add(s.order);
      continue;
    }
    demoted.add(victim.order);
  }

  /* c8 ignore next 3 */
  // Unreachable: each iteration demotes one step and there are finitely many.
  // Kept as a loud failure rather than an infinite loop if that ever changes.
  throw new Error("automation preflight did not converge");
}
