import type { CalibrationLevelValue } from "@/lib/operational-intelligence/calibration";

/**
 * READ-ONLY RECOMMENDATIONS. Deterministic arithmetic over the profile's
 * strata — never applied anywhere: no import of this module exists in any
 * write path to pricing, payout, settings or QC, and a test pins that.
 *
 * Two hard rules from the mandate:
 *  - the ACTIVE policy's stratum only. When it is too thin, the answer is
 *    null with a named reason — never a silent fallback onto pooled or
 *    stale-policy numbers, which would be false precision wearing a number;
 *  - a payout decrease is never recommended below `calibrated`.
 */

export const RECOMMENDATION_MIN_SAMPLE = 10;

export type PriceRecommendation = {
  basedOnAllInCostP75Micros: string;
  basedOnAllInCostP90Micros: string | null;
  targetMarginBps: number;
  recommendedMinCents: number;
  recommendedMaxCents: number;
  sampleSize: number;
  calibrationLevel: CalibrationLevelValue;
  pricingPolicyVersion: string;
  warnings: string[];
};

export type RecommendationBundle = {
  generatedFor: { pricingPolicyVersion: string; qualityPolicyVersion: string };
  price: PriceRecommendation | null;
  priceUnavailableReason: string | null;
  payoutNote: string | null;
  missingData: string[];
};

const roundUpToCents = (cents: number, step: number) => Math.ceil(cents / step) * step;

/** micros → cents, ceil: a recommended price never rounds a cost down. */
const microsToCentsCeil = (micros: bigint) => Number((micros + 9_999n) / 10_000n);

export function buildRecommendation(input: {
  calibrationLevel: CalibrationLevelValue;
  pricingPolicyVersion: string;
  qualityPolicyVersion: string;
  activePricingPolicyVersion: string;
  /** All-in cost distribution (micros) for tasks under the ACTIVE pricing policy. */
  activePolicyAllInCostP75Micros: bigint | null;
  activePolicyAllInCostP90Micros: bigint | null;
  activePolicySampleSize: number;
  targetMarginBps: number;
  paymentFeePctBps: number;
  paymentFeeFixedCents: number;
  minimumPriceCents: number;
  minimumMarginBps: number;
  policyMixed: boolean;
  missingData: string[];
}): RecommendationBundle {
  const warnings: string[] = [];
  if (input.policyMixed) warnings.push("POLICY_MIXED");

  const base: Omit<RecommendationBundle, "price" | "priceUnavailableReason"> = {
    generatedFor: {
      pricingPolicyVersion: input.activePricingPolicyVersion,
      qualityPolicyVersion: input.qualityPolicyVersion,
    },
    payoutNote:
      input.calibrationLevel === "calibrated"
        ? null
        : "Payout changes are not recommended below the calibrated level; the quoted decomposition stands.",
    missingData: input.missingData,
  };

  if (input.pricingPolicyVersion !== input.activePricingPolicyVersion) {
    return {
      ...base,
      price: null,
      priceUnavailableReason: "STALE_POLICY_STRATUM",
    };
  }
  if (
    input.activePolicySampleSize < RECOMMENDATION_MIN_SAMPLE ||
    input.activePolicyAllInCostP75Micros === null
  ) {
    return {
      ...base,
      price: null,
      priceUnavailableReason: "INSUFFICIENT_SAMPLE_FOR_ACTIVE_POLICY",
    };
  }

  const priceFromCost = (costMicros: bigint): number => {
    const costCents = microsToCentsCeil(costMicros);
    // Same closed form as pricing.ts: (cost + fixedFee) / (1 − margin − feePct),
    // in bps arithmetic, then the same floors.
    const denominatorBps = 10_000 - input.targetMarginBps - input.paymentFeePctBps;
    let price = Math.ceil(((costCents + input.paymentFeeFixedCents) * 10_000) / denominatorBps);
    const minByMargin = Math.ceil((costCents * 10_000) / (10_000 - input.minimumMarginBps));
    price = Math.max(price, minByMargin, input.minimumPriceCents);
    return roundUpToCents(price, 500);
  };

  const minCents = priceFromCost(input.activePolicyAllInCostP75Micros);
  const maxCents =
    input.activePolicyAllInCostP90Micros !== null
      ? priceFromCost(input.activePolicyAllInCostP90Micros)
      : minCents;

  return {
    ...base,
    price: {
      basedOnAllInCostP75Micros: input.activePolicyAllInCostP75Micros.toString(),
      basedOnAllInCostP90Micros: input.activePolicyAllInCostP90Micros?.toString() ?? null,
      targetMarginBps: input.targetMarginBps,
      recommendedMinCents: minCents,
      recommendedMaxCents: Math.max(minCents, maxCents),
      sampleSize: input.activePolicySampleSize,
      calibrationLevel: input.calibrationLevel,
      pricingPolicyVersion: input.pricingPolicyVersion,
      warnings,
    },
    priceUnavailableReason: null,
  };
}
