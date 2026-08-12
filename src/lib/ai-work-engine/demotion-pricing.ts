/**
 * WHEN THE MACHINE STEPS ASIDE, SOMEBODY DOES THE WORK — AND SOMEBODY PAYS.
 *
 * NO IMPORTS, the discipline of primitive-vocabulary.ts and
 * automation-cost-policy.ts: the quote path, the admin preview and the tests
 * all read this, and none of them may drag a database or a provider SDK in to
 * ask a question this simple.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO END ──
 *
 * The economic preflight takes automation away from a step it cannot fund and
 * the step becomes human work. `reprice()` then re-prices the demoted plan —
 * but it changes exactly two fields per demoted step (executor to "human", AI
 * cost to zero) and leaves the MINUTES exactly as the planner wrote them. The
 * planner is instructed to write zero human minutes on a machine step, so the
 * demoted plan is strictly CHEAPER than the raw one, and taking the larger of
 * the two pins the price and the payout to their original figures.
 *
 * Measured on 29 real mandates (2026-08-12): 20 of 20 runs carrying a
 * demotion had their client price AND their internal cost unchanged to the
 * cent, and 115 of 115 demoted steps carried zero planned human minutes. On
 * one of them, five steps — extraction, normalisation, deduplication,
 * exception split and workbook build — moved from machine to person while the
 * quote stayed at $425 and the reported margin stayed at 63.4%.
 *
 * That is not a rounding error. It is the platform telling itself "this
 * automation is too expensive, a person will do it" and then not adding the
 * person's cost. The work reappears at execution through the residual engine,
 * which pays real minutes — out of margin, after the client has signed.
 *
 * ── WHY THIS REFUSES RATHER THAN ESTIMATES ──
 *
 * The obvious fix is a table: "extraction done by hand costs N seconds per
 * unit". We do not have that number. Nobody has run these steps manually
 * under measurement, and inventing a figure would put a fabricated cost
 * inside a client's contract — the same sin as backfilling economics onto
 * contracts that never had them.
 *
 * So the honest branch is the other one: when a demotion produces work whose
 * human cost is unknown, the engine STOPS SUGGESTING A PRICE. It keeps the
 * plan, keeps the reasoning, keeps every fact the operator needs — and hands
 * the number to the person whose job it is. A suggestion the engine knows is
 * wrong is worse than no suggestion, because it is the one an operator can
 * approve in one click.
 *
 * When the estimate DOES exist — a planner that wrote real minutes on a step,
 * or a future measured fallback table — nothing here fires. This is a
 * fail-closed gate on ignorance, not a ban on demotion.
 */

/** The shape both callers reduce to: the quote path from the plan it is about
 *  to write, the admin preview from the rows already stored. */
export type DemotedStepEffort = {
  order: number;
  /** True when the economic preflight took this step's automation away. */
  demotedForBudget: boolean;
  /** The planner's own human-effort figures for the step, as written. */
  estimatedMinutesLikely: number | null;
  estimatedMinutesConservative: number | null;
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
};

export type DemotionPricingVerdict = {
  /** Demoted steps whose human cost nothing in the plan accounts for. */
  unpricedOrders: number[];
  /**
   * True when at least one demotion carries no human cost at all. The quote
   * path must not suggest a price; the admin prices by hand.
   */
  humanCostUnknown: boolean;
};

/**
 * A step carries a human cost when ANY of its effort figures is above zero.
 * Null and zero are the same answer here — "nothing was written" and "nothing
 * was needed" are indistinguishable on a step that a machine was going to do,
 * and the safe reading of an indistinguishable pair is the conservative one.
 */
function carriesHumanCost(s: DemotedStepEffort): boolean {
  return (
    (s.estimatedMinutesLikely ?? 0) > 0 ||
    (s.estimatedMinutesConservative ?? 0) > 0 ||
    (s.fixedMinutes ?? 0) > 0 ||
    (s.secondsPerUnit ?? 0) > 0
  );
}

export function assessDemotionPricing(steps: DemotedStepEffort[]): DemotionPricingVerdict {
  const unpricedOrders = steps
    .filter((s) => s.demotedForBudget && !carriesHumanCost(s))
    .map((s) => s.order);
  return { unpricedOrders, humanCostUnknown: unpricedOrders.length > 0 };
}

/** The operator-facing sentence. One place, so the screen and the reasoning
 *  line cannot drift into describing the same condition differently. */
export const HUMAN_COST_UNKNOWN_NOTICE =
  "HUMAN COST UNKNOWN — MANUAL PRICING REQUIRED: the budget preflight moved work from machine to human on this plan, and the plan carries no human effort estimate for it. No price is suggested; price this mandate by hand.";
