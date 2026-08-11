import {
  attemptsUnder,
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
  /**
   * 1E-beta1: the plan's own dependency edges, REQUIRED so a caller cannot
   * silently opt out of the cascade below. The compiler already demotes a
   * step whose producer is not automatable (topology rule 3) — at EXECUTION
   * time. Without the same rule here, the QUOTE would price a consumer as
   * machine work after this preflight demoted its producer for budget, and
   * the client would pay for automation the compiler was always going to
   * hand to a person. The two layers must agree, and the quote is the one
   * the client signs.
   */
  dependsOnOrder: number[];
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
  /**
   * How many attempts THIS CONTRACT funds for this step. Frozen exactly like
   * the per-attempt cost: the runner obeys it and never the registry's
   * current `maxAttempts`, so a deploy cannot promise a retry the accepted
   * contract never paid for, nor withdraw one it did.
   */
  maxAttemptsAtQuote: number | null;
};

export type PreflightResult = {
  steps: PreflightStepResult[];
  expectedAutomationCostMicros: bigint;
  /** One worst-case attempt of each remaining billable step. */
  conservativeAutomationCostMicros: bigint;
  /**
   * EVERY attempt the contract funds: Σ(perAttempt × attempts). Deliberately
   * NOT the same number as `conservative`, and larger than it whenever any
   * step funds more than one try. Conflating the two is what left the runner
   * promising a retry the budget refused.
   */
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
        maxAttemptsAtQuote: null,
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

  /**
   * ── THE DEPENDENCY GRAPH, READ ONCE ──
   *
   * Two derived structures, both cycle-safe because the edges are planner
   * output and a model can write a loop:
   *
   * `depthOf` — the longest dependency chain UNDER a step, so the victim
   * ranking can prefer the leaf-most step. Demoting a consumer before its
   * producer is strictly cheaper: the producer's output still shortens the
   * human's job, while a consumer without its producer is a machine step
   * waiting for input that will never exist. The canonical case is exactly
   * research → fetch: ranked on spend alone, research at $3.00 × 2 dies
   * before fetch at $4.00 × 1 and leaves a fetch step whose candidate URLs
   * nothing will ever produce.
   *
   * `dependentsOf` — the reverse edges, for the cascade: WHENEVER a step is
   * demoted, every automatable step that transitively consumes its output is
   * demoted with it, in the same iteration. Fail-closed and deliberately
   * blunt: a false dependency written by the planner costs automation, never
   * money, and the planner prompt already fights false edges for its own
   * reasons.
   */
  const byOrder = new Map(input.steps.map((s) => [s.order, s]));
  const depthMemo = new Map<number, number>();
  /**
   * Inside a planner-written CYCLE, memoized depths are truncated,
   * call-order artifacts rather than a well-defined property — deterministic
   * for a given input (the sort's evaluation order is fixed) but not
   * meaningful. Safe here because cycle members are mutually dependent, so
   * the cascade below demotes the whole cycle the moment any member goes:
   * their relative ranking never decides anything on its own.
   */
  const depthOf = (order: number, trail: Set<number>): number => {
    const cached = depthMemo.get(order);
    if (cached !== undefined) return cached;
    if (trail.has(order)) return 0; // a cycle proves nothing about depth
    const step = byOrder.get(order);
    if (!step || step.dependsOnOrder.length === 0) {
      depthMemo.set(order, 0);
      return 0;
    }
    trail.add(order);
    const depth = 1 + Math.max(...step.dependsOnOrder.map((d) => depthOf(d, trail)));
    trail.delete(order);
    depthMemo.set(order, depth);
    return depth;
  };
  const dependentsOf = new Map<number, number[]>();
  for (const s of input.steps) {
    for (const dep of s.dependsOnOrder) {
      dependentsOf.set(dep, [...(dependentsOf.get(dep) ?? []), s.order]);
    }
  }
  /**
   * Demote one order AND everything that transitively consumes its output.
   * Traversal walks through EVERY dependent (a human step can sit mid-chain),
   * but only machine steps are MARKED: `demotedForBudget` on a step that was
   * always a person's would misreport what this preflight did.
   */
  const demoteWithDependents = (order: number) => {
    const queue = [order];
    const visited = new Set<number>();
    while (queue.length > 0) {
      const current = queue.pop() as number;
      if (visited.has(current)) continue;
      visited.add(current);
      const step = byOrder.get(current);
      if (step && step.automatable && step.primitiveId !== null) demoted.add(current);
      queue.push(...(dependentsOf.get(current) ?? []));
    }
  };

  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const billable = input.steps.filter(
      (s) => s.automatable && s.primitiveId !== null && !demoted.has(s.order)
    );

    let expected = 0n;
    let conservative = 0n;
    let fundedAllAttempts = 0n;
    const perStep = new Map<number, { expected: bigint; max: bigint; attempts: number }>();

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
      const stepAttempts = attemptsUnder(input.policyVersion, step.primitiveId);
      expected += stepExpected;
      conservative += stepMax;
      // The ceiling funds every attempt the contract allows, not just the
      // first. BigInt throughout: a many-step plan at several dollars an
      // attempt passes the Int range faster than it looks.
      fundedAllAttempts += stepMax * BigInt(stepAttempts);
      perStep.set(step.order, { expected: stepExpected, max: stepMax, attempts: stepAttempts });
    }

    /**
     * THE CEILING FUNDS EVERY ATTEMPT THE CONTRACT AUTHORISES, not just the
     * first one of each step.
     *
     * Funding only the first left the runner in an impossible position: a
     * transient provider error is classified retryable, the contract allows a
     * second try, and the reservation refused it because the money for that
     * try was never set aside. The run paused and the stall sweep handed the
     * mandate to a person six hours later, over an error the system was
     * designed to absorb.
     *
     * So this is deliberately NOT `conservative`. That figure answers "what
     * does one pass cost at worst"; this one answers "what may this contract
     * spend before we stop", and the second is the number the reservation has
     * to respect. The ordering expected <= conservative <= ceiling holds by
     * construction: every attempt count is at least one.
     */
    const needed = fundedAllAttempts;
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
            maxAttemptsAtQuote: frozen?.attempts ?? null,
          };
        }),
        expectedAutomationCostMicros: expected,
        conservativeAutomationCostMicros: conservative,
        automationSpendCeilingMicros: ceiling,
        policyVersion: input.policyVersion,
        demotedCount: demoted.size,
      };
    }

    /**
     * VICTIM RANKING, three keys, all deterministic:
     *
     *   1. DEEPEST DEPENDENCY CHAIN FIRST. The leaf-most consumer goes before
     *      anything that feeds it, so the pipeline loses its ends before its
     *      sources and the cascade below stays a belt rather than the usual
     *      path. Demoting fetch keeps research's evidence shortening the
     *      human's job; demoting research would take both.
     *   2. Then the costliest contract spend (per-attempt worst case times
     *      funded attempts — the same quantity the ceiling is built from).
     *      Ranking on one attempt would sometimes drop a cheap-but-thrice-
     *      funded step and leave the plan still over budget.
     *   3. Then the LATER step, so the early pipeline stages that everything
     *      downstream reads from survive longest.
     */
    const victim = [...billable]
      .filter((s) => perStep.has(s.order))
      .sort((a, b) => {
        const ad = depthOf(a.order, new Set());
        const bd = depthOf(b.order, new Set());
        if (ad !== bd) return bd - ad;
        const am = (perStep.get(a.order)?.max ?? 0n) * BigInt(perStep.get(a.order)?.attempts ?? 0);
        const bm = (perStep.get(b.order)?.max ?? 0n) * BigInt(perStep.get(b.order)?.attempts ?? 0);
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
    /**
     * The victim goes, and so does every machine step that transitively
     * consumes its output — in the SAME iteration, so no intermediate state
     * ever exists in which a quoted machine step waits on a producer this
     * preflight already took away. The compiler applies the identical rule at
     * execution (topology rule 3, `depends_on_human`); doing it here is what
     * keeps the QUOTE's economics describing the plan that will actually run.
     */
    demoteWithDependents(victim.order);
  }

  /* c8 ignore next 3 */
  // Unreachable: each iteration demotes one step and there are finitely many.
  // Kept as a loud failure rather than an infinite loop if that ever changes.
  throw new Error("automation preflight did not converge");
}
