import "server-only";
import { PLAN_TOOLS } from "@/lib/ai-work-engine/schemas";

/**
 * THE COST CATALOG. Every number the deterministic pricing engine uses that
 * the model is never allowed to invent.
 *
 * TWO RULES GOVERN THIS FILE:
 *
 * 1. NO AI SDK IMPORT, ever. This file and pricing.ts are the deterministic
 *    half of the engine; the absence of an Anthropic/OpenAI import is the
 *    enforcement mechanism, and test/ai-work-engine.test.ts greps the source
 *    to keep it true.
 *
 * 2. EVERY CONSTANT BELOW IS AN UNCALIBRATED STARTING POINT — the same
 *    honesty discipline as pricingSimilarityMaxDistance in settings.ts: no
 *    real mandate has ever been measured against these numbers, so they
 *    produce prices that are CONSISTENT and AUDITABLE, not prices that are
 *    known to be right. That is exactly why Phase 1A hardcodes
 *    calibration: "uncalibrated" on every priced plan version, why the admin
 *    sees it as a banner, and why the Level-1 auto quote does not exist.
 *    Revisit each number once the estimation/actual loop has real data.
 *
 * Rates that ALREADY exist in Settings are read from Settings at call time
 * (settings.minWorkerHourlyUsd), never duplicated here — one source of truth
 * per number. This catalog only holds what has no other home.
 */
export type CostCatalog = {
  workerHourlyUsdBase: number;
  reviewerHourlyUsd: number;
  reviewerMinutesPerDelivery: number;
  reworkReservePct: number;
  stripeFeePct: number;
  stripeFeeFixedCents: number;
  targetGrossMargin: number;
  minimumPriceCents: number;
  minimumMargin: number;
  critiqueCostThresholdCents: number;
  minimumResidualMinutes: number;
  toolUnitCostCents: Record<string, number>;
};

export const COST_CATALOG: CostCatalog = {
  /**
   * Loaded hourly cost of a worker, USD. Starting point: aligned with the
   * $15/h the standing-capacity tiers already pay (settings.ts
   * standingCapacityTiers). At pricing time the effective rate is
   * max(this, settings.minWorkerHourlyUsd) so the floor the admin form
   * already enforces can never be undercut by the engine.
   */
  workerHourlyUsdBase: 15,

  /** Loaded hourly cost of the reviewer (today: the operator). Uncalibrated. */
  reviewerHourlyUsd: 25,

  /**
   * Review minutes per delivery, flat. The plan's steps do not carry reviewer
   * minutes (deliberately — the reviewer is not plannable per step yet), so
   * QC cost enters as a per-mandate constant. Uncalibrated; qc-capacity.ts
   * will eventually measure the real number.
   */
  reviewerMinutesPerDelivery: 20,

  /** Share of internal cost reserved for rework/revisions. Uncalibrated. */
  reworkReservePct: 0.15,

  /** Stripe's published card pricing — the one calibrated pair in this file. */
  stripeFeePct: 0.029,
  stripeFeeFixedCents: 30,

  /** Target gross margin on the conservative internal cost. Uncalibrated. */
  targetGrossMargin: 0.6,

  /** Hard floors: no quote below this price or below this realized margin. */
  minimumPriceCents: 5000,
  minimumMargin: 0.35,

  /**
   * Conservative internal cost at or above which the adversarial critique is
   * triggered (one of several triggers — see shouldCritique). Uncalibrated.
   */
  critiqueCostThresholdCents: 15_000,

  /**
   * THE DIGNITY FLOOR. No residual mandate is ever costed below this, even at
   * zero remaining units. Someone still opens the file, reads the brief,
   * checks what the machine produced and signs their name to the delivery —
   * and the platform's own promise is that a person reviews every delivery.
   * A near-empty residual is the case where an automatic calculation is most
   * tempted to pay nothing, which is exactly when it must not. Uncalibrated.
   */
  minimumResidualMinutes: 20,

  /**
   * Per-unit cost of each tool the plan vocabulary allows. An unknown tool
   * string resolves to zero AND raises a critique flag — pricing never
   * crashes on vocabulary drift, it surfaces it.
   */
  toolUnitCostCents: {
    web_search: 1,
    internal_script: 0,
    spreadsheet: 0,
    manual: 0,
  } satisfies Record<(typeof PLAN_TOOLS)[number], number>,
};
