/**
 * COST TAXONOMY BY PROVENANCE. Every amount says in its NAME where it came
 * from, so no number derived from our own rate table can ever be read as a
 * reconciled provider invoice:
 *
 *  - booked   — a real obligation recorded in our own tables (payouts,
 *               recognized revenue via the ledger-backed payment records);
 *  - metered  — measured quantity × OUR tariff table (tokens, searches).
 *               Not a bill. Anthropic's invoice may differ;
 *  - modeledFromMeasured — measured quantity, ASSUMED rate (reviewer
 *               seconds are real, the $/h is a catalog guess);
 *  - modeled  — assumption end to end (payment fees: no real Stripe fee
 *               exists anywhere in this codebase — LedgerKind.fee has zero
 *               writers, verified);
 *  - reconciled — matched against a third-party invoice. NONE exist in
 *               1C-α, and no empty columns pretend otherwise (the dead
 *               inputSummary column is the cautionary precedent).
 *
 * Two margins come out, and NEITHER is called "real": the booked+metered
 * margin (hardest numbers only) and the all-in margin (including modeled
 * add-ons). A test greps the repo for forbidden "real cost/marge réelle"
 * vocabulary.
 *
 * ALL AGGREGATES ARE BIGINT. Prisma Int is 32-bit signed: 2 147 483 647
 * micros is $2,147.48, and a $500 payout converted to micros (5×10⁹)
 * already overflows it. Measured per-call costs fit in Int; sums never
 * touch Number again once converted.
 */

export type PayoutPartitionInput = {
  status: "owed" | "released" | "paid" | "void" | "failed";
  amountCents: number;
};

export type PayoutPartition = {
  /** owed + released + failed — still owed to the worker. */
  workerPayoutCurrentLiabilityCents: number;
  workerPayoutPaidCents: number;
  workerPayoutVoidedCents: number;
  /**
   * liability + paid — the cost profitability uses: the work was done, the
   * money is or was owed. NOT a historical cumulative: amountCents can be
   * re-armed in place (admin-qc.ts), so history is reconstructed from
   * payout_amount_rearmed events, never from this scalar.
   */
  workerPayoutNetIncurredCents: number;
  flags: string[];
};

export function partitionPayouts(payouts: PayoutPartitionInput[]): PayoutPartition {
  let liability = 0;
  let paid = 0;
  let voided = 0;
  const flags: string[] = [];
  for (const p of payouts) {
    if (p.status === "paid") paid += p.amountCents;
    else if (p.status === "void") voided += p.amountCents;
    else {
      liability += p.amountCents;
      if (p.status === "failed") flags.push("PAYOUT_FAILED");
    }
  }
  if (liability > 0 && paid === 0 && payouts.length > 0) flags.push("PAYOUT_INCURRED_NOT_PAID");
  if (voided > 0) flags.push("PAYOUT_VOIDED");
  return {
    workerPayoutCurrentLiabilityCents: liability,
    workerPayoutPaidCents: paid,
    workerPayoutVoidedCents: voided,
    workerPayoutNetIncurredCents: liability + paid,
    flags: [...new Set(flags)],
  };
}

export type RevenueInput = {
  /** Payment rows for the task, with their refunds already summed. */
  payments: {
    status: string;
    amountCents: number;
    capturedAmountCents: number | null;
    refundedCents: number;
  }[];
};

export type RecognizedRevenue = {
  /** Null until money was actually received/captured. Never an authorization. */
  recognizedRevenueMicros: bigint | null;
  flags: string[];
};

/**
 * Revenue recognition mirrors exactly the moments the ledger writes `sale`:
 * a Stripe capture or a manual wire marks the Payment `received` (or the
 * refund-derived statuses after it). LedgerEntry itself carries no taskId
 * (verified), so the per-task figure is derived from the same Payment and
 * Refund rows those ledger writes are keyed on — same facts, same instants.
 */
export function recognizeRevenue(input: RevenueInput): RecognizedRevenue {
  const flags: string[] = [];
  let cents = 0;
  let recognizedAny = false;
  for (const p of input.payments) {
    const everReceived = ["received", "refunded", "partially_refunded", "chargeback"].includes(
      p.status
    );
    if (!everReceived) {
      if (p.status === "authorized") flags.push("PAYMENT_NOT_CAPTURED");
      continue;
    }
    recognizedAny = true;
    const base = p.capturedAmountCents ?? p.amountCents;
    if (p.capturedAmountCents !== null && p.capturedAmountCents !== p.amountCents) {
      flags.push("CAPTURE_AMOUNT_MISMATCH");
    }
    if (p.status === "chargeback") {
      flags.push("CHARGEBACK");
      cents += 0; // funds pulled back pending the dispute; recognize nothing from this row
      continue;
    }
    cents += base - p.refundedCents;
  }
  if (!recognizedAny) {
    return { recognizedRevenueMicros: null, flags: [...new Set(flags)] };
  }
  return {
    recognizedRevenueMicros: BigInt(Math.max(0, cents)) * 10_000n,
    flags: [...new Set(flags)],
  };
}

export type CostBreakdownInput = {
  /** Metered: step invocations, split ai vs tool (searches) — Phase 1B facts. */
  aiInvocationMicros: bigint;
  toolInvocationMicros: bigint;
  /** Metered: pre-quote pipeline calls (AiUsage.costMicros). */
  pipelineAiMicros: bigint;
  payoutPartition: PayoutPartition;
  /** Measured reviewer seconds from work sessions; null when none exist. */
  reviewerMeasuredSeconds: number | null;
  /** The ASSUMED reviewer rate (catalog). */
  reviewerHourlyUsd: number;
  recognizedRevenueMicros: bigint | null;
  /** Modeled payment fee parameters (catalog — no real fees exist). */
  paymentFeePctBps: number;
  paymentFeeFixedCents: number;
};

export type CostBreakdown = {
  aiCostMeteredMicros: bigint;
  toolCostMeteredMicros: bigint;
  reviewerLaborModeledFromMeasuredTimeMicros: bigint | null;
  paymentFeeModeledMicros: bigint | null;
  bookedAndMeteredCostMicros: bigint;
  modeledCostAddonMicros: bigint;
  allInCostWithModeledMicros: bigint;
  flags: string[];
};

export function computeCostBreakdown(input: CostBreakdownInput): CostBreakdown {
  const flags: string[] = [];
  const aiCostMeteredMicros = input.aiInvocationMicros + input.pipelineAiMicros;
  const toolCostMeteredMicros = input.toolInvocationMicros;

  let reviewerModeled: bigint | null = null;
  if (input.reviewerMeasuredSeconds !== null) {
    // seconds × ($/h × 1e6) / 3600 — integer arithmetic, ceil in favor of
    // never understating a cost.
    const rateMicrosPerHour = BigInt(Math.round(input.reviewerHourlyUsd * 1_000_000));
    const numerator = BigInt(input.reviewerMeasuredSeconds) * rateMicrosPerHour;
    reviewerModeled = (numerator + 3599n) / 3600n;
    flags.push("REVIEWER_RATE_ASSUMED");
  }

  let feeModeled: bigint | null = null;
  if (input.recognizedRevenueMicros !== null) {
    feeModeled =
      (input.recognizedRevenueMicros * BigInt(input.paymentFeePctBps)) / 10_000n +
      BigInt(input.paymentFeeFixedCents) * 10_000n;
    flags.push("FEE_MODELED");
  }

  const bookedAndMetered =
    aiCostMeteredMicros +
    toolCostMeteredMicros +
    BigInt(input.payoutPartition.workerPayoutNetIncurredCents) * 10_000n;
  const modeledAddon = (reviewerModeled ?? 0n) + (feeModeled ?? 0n);

  return {
    aiCostMeteredMicros,
    toolCostMeteredMicros,
    reviewerLaborModeledFromMeasuredTimeMicros: reviewerModeled,
    paymentFeeModeledMicros: feeModeled,
    bookedAndMeteredCostMicros: bookedAndMetered,
    modeledCostAddonMicros: modeledAddon,
    allInCostWithModeledMicros: bookedAndMetered + modeledAddon,
    flags: [...new Set([...flags, ...input.payoutPartition.flags])],
  };
}

export type Margins = {
  grossMarginBookedMeteredMicros: bigint | null;
  grossMarginBookedMeteredBps: number | null;
  grossMarginAllInModeledMicros: bigint | null;
  grossMarginAllInModeledBps: number | null;
};

export function computeMargins(input: {
  recognizedRevenueMicros: bigint | null;
  bookedAndMeteredCostMicros: bigint;
  allInCostWithModeledMicros: bigint;
}): Margins {
  if (input.recognizedRevenueMicros === null) {
    // Unknown revenue means unknown margin — null, never zero.
    return {
      grossMarginBookedMeteredMicros: null,
      grossMarginBookedMeteredBps: null,
      grossMarginAllInModeledMicros: null,
      grossMarginAllInModeledBps: null,
    };
  }
  const booked = input.recognizedRevenueMicros - input.bookedAndMeteredCostMicros;
  const allIn = input.recognizedRevenueMicros - input.allInCostWithModeledMicros;
  const toBps = (m: bigint) =>
    input.recognizedRevenueMicros! > 0n
      ? Number((m * 10_000n) / input.recognizedRevenueMicros!)
      : null;
  return {
    grossMarginBookedMeteredMicros: booked,
    grossMarginBookedMeteredBps: toBps(booked),
    grossMarginAllInModeledMicros: allIn,
    grossMarginAllInModeledBps: toBps(allIn),
  };
}
