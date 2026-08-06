import "server-only";
import { COST_CATALOG, type CostCatalog } from "@/lib/ai-work-engine/cost-catalog";

/**
 * THE DETERMINISTIC HALF OF THE ENGINE. The model estimates RESOURCES
 * (minutes, tool units, ai cost per step); this file, and only this file,
 * turns resources into money. No AI SDK import — that absence is the
 * enforcement, and the test suite greps for it.
 *
 * RULE 2, exactly as the existing pricing prompt states it for the model
 * ("price the client side on value/market rate, price the payout on fair
 * compensation for the estimated work, independently"), enforced here in
 * code: computeClientPriceCents and computeVaPayoutCents never take each
 * other's output as an input. The client price is a function of internal
 * cost and margin policy; the payout is a function of human minutes and the
 * worker rate. Neither can see the other's number.
 *
 * NO FALSE PRECISION (founder adjustment 4): every plan is priced in two
 * scenarios, likely and conservative, prices are rounded UP to the nearest
 * $5, payouts to the nearest $1, and every result carries
 * calibration: "uncalibrated" until the estimation/actual loop exists.
 */

export type PricingStepInput = {
  executor: "ai" | "human" | "deterministic_code";
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
  estimatedAiCostCents: number;
  estimatedToolUnits: number;
  tool: string | null;
};

export type PricingRates = {
  /** max(catalog base, settings.minWorkerHourlyUsd) — resolved by the caller. */
  workerHourlyUsd: number;
};

export type PricedPlan = {
  internalCostLikelyCents: number;
  internalCostConservativeCents: number;
  /** The recommendation, derived from the conservative scenario. */
  suggestedPriceCents: number;
  /** Price at the likely scenario — becomes aiLowCents. */
  priceAtLikelyCents: number;
  /** Price at the conservative scenario — becomes aiHighCents (== suggested). */
  priceAtConservativeCents: number;
  suggestedVaPayoutCents: number;
  estimatedMinutesLikelyTotal: number;
  /**
   * PERT minutes of the HUMAN steps only, floored to a whole minute. This —
   * not the total — is what belongs in Task.estimatedMinutes: that field
   * feeds the worker-facing effort estimate and approvePricing's
   * $/hour floor, both of which are about the worker's time. Found live:
   * suggesting the total (worker + AI + script minutes) made the engine's
   * own default quote fail the hourly floor it was priced to satisfy.
   * Flooring (never rounding up) keeps payout ÷ minutes ≥ the worker rate
   * by construction, since the payout is the same PERT minutes rounded UP
   * to the next dollar.
   */
  estimatedHumanMinutesPertTotal: number;
  calibration: "uncalibrated";
};

const roundUpTo = (cents: number, step: number) => Math.ceil(cents / step) * step;

/**
 * PERT-weighted minutes for one step: (optimistic + 4·likely + conservative) / 6.
 * Used for the PAYOUT (fair compensation for the expected work), not for the
 * scenario costs, which deliberately use the raw likely/conservative numbers
 * so the two scenarios stay honest extremes rather than converging blends.
 */
export function pertMinutes(s: {
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
}): number {
  return (
    (s.estimatedMinutesOptimistic + 4 * s.estimatedMinutesLikely + s.estimatedMinutesConservative) / 6
  );
}

function toolCostCents(step: PricingStepInput, catalog: CostCatalog): number {
  if (!step.tool) return 0;
  // Object.hasOwn: same inherited-member defence as clientTimelineEntries —
  // a tool named "constructor" must cost zero, not a function object.
  const unit = Object.hasOwn(catalog.toolUnitCostCents, step.tool)
    ? catalog.toolUnitCostCents[step.tool]
    : 0;
  return unit * step.estimatedToolUnits;
}

/**
 * Internal cost of one scenario. Human minutes are costed at the worker rate,
 * AI and tool costs are the model's per-step resource estimates priced by the
 * catalog, the reviewer enters as a flat per-delivery constant, and the
 * rework reserve scales the whole thing. Stripe's fee is NOT here — it is a
 * function of the final price, so computeClientPriceCents folds it into the
 * margin denominator instead (the standard closed-form for a fee that
 * depends on its own output).
 */
export function computeInternalCostCents(
  steps: PricingStepInput[],
  rates: PricingRates,
  catalog: CostCatalog,
  scenario: "likely" | "conservative"
): number {
  const minutesOf = (s: PricingStepInput) =>
    scenario === "likely" ? s.estimatedMinutesLikely : s.estimatedMinutesConservative;

  let cents = 0;
  for (const step of steps) {
    if (step.executor === "human") {
      cents += (minutesOf(step) / 60) * rates.workerHourlyUsd * 100;
    }
    cents += step.estimatedAiCostCents;
    cents += toolCostCents(step, catalog);
  }
  cents += (catalog.reviewerMinutesPerDelivery / 60) * catalog.reviewerHourlyUsd * 100;
  cents *= 1 + catalog.reworkReservePct;
  return Math.round(cents);
}

/**
 * Client price from an internal cost. Reads cost and margin policy ONLY —
 * never the payout. price = (cost + stripeFixed) / (1 − margin − stripePct),
 * then the floors: never below minimumPriceCents, never below a realized
 * minimumMargin over cost. Rounded up to the nearest $5 (false-precision
 * guard: a $237 quote pretends to know something a $240 quote doesn't).
 */
export function computeClientPriceCents(internalCostCents: number, catalog: CostCatalog): number {
  const denominator = 1 - catalog.targetGrossMargin - catalog.stripeFeePct;
  let price = (internalCostCents + catalog.stripeFeeFixedCents) / denominator;

  const minByMargin = internalCostCents / (1 - catalog.minimumMargin);
  price = Math.max(price, minByMargin, catalog.minimumPriceCents);

  return roundUpTo(Math.round(price), 500);
}

/**
 * Worker payout: PERT minutes of the HUMAN steps only, at the worker rate,
 * rounded up to the nearest $1. Never reads the client price or the margin —
 * mutating either must not move this number by one cent (pinned by test).
 */
export function computeVaPayoutCents(steps: PricingStepInput[], rates: PricingRates): number {
  const humanMinutes = steps
    .filter((s) => s.executor === "human")
    .reduce((sum, s) => sum + pertMinutes(s), 0);
  // ceil, not round: at fractional rates (e.g. $15.25/h) rounding the exact
  // cents DOWN produced a payout strictly below minutes × rate, and the
  // engine's own suggestion failed approvePricing's hourly floor
  // (adversarial review). Payouts only ever round in the worker's favor.
  return roundUpTo(Math.ceil((humanMinutes / 60) * rates.workerHourlyUsd * 100), 100);
}

/**
 * The ONE mapping from a priced plan to the Task.aiXxx suggestion columns —
 * used by runWorkEngine and editPlanVersion alike (two hand-written copies
 * of this mapping is exactly how the minutes-semantics bug recurred). When
 * the plan has no human minutes there is no honest payout or effort
 * suggestion: both go null so the admin form pre-fills nothing instead of a
 * $0-over-0-minutes combo approvePricing can never accept.
 */
export function aiSuggestionColumns(priced: PricedPlan): {
  aiSuggestedPriceCents: number;
  aiLowCents: number;
  aiHighCents: number;
  aiSuggestedVaPayoutCents: number | null;
  aiEstimatedMinutes: number | null;
} {
  const hasHumanWork = priced.estimatedHumanMinutesPertTotal > 0;
  return {
    aiSuggestedPriceCents: priced.suggestedPriceCents,
    aiLowCents: priced.priceAtLikelyCents,
    aiHighCents: priced.priceAtConservativeCents,
    aiSuggestedVaPayoutCents: hasHumanWork ? priced.suggestedVaPayoutCents : null,
    aiEstimatedMinutes: hasHumanWork ? priced.estimatedHumanMinutesPertTotal : null,
  };
}

/** The whole priced plan, assembled. Pure; same inputs, same outputs. */
export function pricePlan(
  steps: PricingStepInput[],
  rates: PricingRates,
  catalog: CostCatalog = COST_CATALOG
): PricedPlan {
  const internalCostLikelyCents = computeInternalCostCents(steps, rates, catalog, "likely");
  const internalCostConservativeCents = computeInternalCostCents(
    steps,
    rates,
    catalog,
    "conservative"
  );
  const priceAtLikelyCents = computeClientPriceCents(internalCostLikelyCents, catalog);
  const priceAtConservativeCents = computeClientPriceCents(internalCostConservativeCents, catalog);

  return {
    internalCostLikelyCents,
    internalCostConservativeCents,
    suggestedPriceCents: priceAtConservativeCents,
    priceAtLikelyCents,
    priceAtConservativeCents,
    suggestedVaPayoutCents: computeVaPayoutCents(steps, rates),
    estimatedMinutesLikelyTotal: steps.reduce((sum, s) => sum + s.estimatedMinutesLikely, 0),
    estimatedHumanMinutesPertTotal: Math.floor(
      steps.filter((s) => s.executor === "human").reduce((sum, s) => sum + pertMinutes(s), 0)
    ),
    calibration: "uncalibrated",
  };
}
