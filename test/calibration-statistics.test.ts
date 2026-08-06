import { describe, expect, it } from "vitest";
import {
  bps,
  bpsBig,
  median,
  medianBig,
  percentile,
  percentileBig,
  varianceCheck,
} from "@/lib/operational-intelligence/statistics";
import {
  CALIBRATION_THRESHOLDS,
  decideCalibrationLevel,
} from "@/lib/operational-intelligence/calibration";
import {
  computeCostBreakdown,
  computeMargins,
  partitionPayouts,
  recognizeRevenue,
} from "@/lib/operational-intelligence/cost-provenance";
import { repeatWindowEndsAt, resolveRepeatStatus } from "@/lib/operational-intelligence/repeat-window";
import { canonicalHash } from "@/lib/operational-intelligence/fingerprint";

describe("percentiles are deterministic rank statistics", () => {
  it("returns a member of the sample, never an interpolation", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 75)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });

  it("does not mutate its input", () => {
    const arr = [3, 1, 2];
    percentile(arr, 50);
    expect(arr).toEqual([3, 1, 2]);
  });

  it("bigint twin agrees with the number version", () => {
    expect(percentileBig([10n, 20n, 30n, 40n], 75)).toBe(30n);
    expect(medianBig([5n])).toBe(5n);
    expect(median([1, 2, 3])).toBe(2);
  });

  it("bigint percentile sorts numerically past 2^53", () => {
    const big = [9_007_199_254_740_993n, 2n, 9_007_199_254_740_992n];
    expect(percentileBig(big, 100)).toBe(9_007_199_254_740_993n);
  });
});

describe("basis points: null and zero are different answers", () => {
  it("null on empty denominator, 0 on measured zero", () => {
    expect(bps(5, 0)).toBeNull();
    expect(bps(0, 80)).toBe(0);
    expect(bps(62, 100)).toBe(6200);
    expect(bpsBig(0n, 100n)).toBe(0);
    expect(bpsBig(5n, 0n)).toBeNull();
  });
});

describe("the variance rule with p25 = 0 defined", () => {
  it("ratio path when p25 > 0", () => {
    expect(varianceCheck({ p25: 100, p75: 250, ratioCeiling: 3, absoluteCeiling: null }).passed).toBe(true);
    expect(varianceCheck({ p25: 100, p75: 400, ratioCeiling: 3, absoluteCeiling: null }).passed).toBe(false);
  });

  it("p25 = 0 with unconfigured ceilings FAILS CLOSED — founder decision", () => {
    const r = varianceCheck({ p25: 0, p75: 500, ratioCeiling: 3, absoluteCeiling: null });
    expect(r.passed).toBe(false);
    expect(r.flags).toContain("VARIANCE_CEILINGS_UNCONFIGURED");
  });

  it("p25 = 0 with a configured absolute ceiling tests the spread", () => {
    expect(varianceCheck({ p25: 0, p75: 40, ratioCeiling: 3, absoluteCeiling: 50 }).passed).toBe(true);
    expect(varianceCheck({ p25: 0, p75: 90, ratioCeiling: 3, absoluteCeiling: 50 }).passed).toBe(false);
  });

  it("degenerate all-zero passes with a flag", () => {
    const r = varianceCheck({ p25: 0, p75: 0, ratioCeiling: 3, absoluteCeiling: null });
    expect(r.passed).toBe(true);
    expect(r.flags).toContain("VARIANCE_DEGENERATE");
  });
});

describe("calibration levels", () => {
  const base = {
    metricsCompletenessBps: 9500,
    varianceP25: 100,
    varianceP75: 200,
    criticalErrorRateBps: 0,
    sampleSizeRecent: 20,
  };

  it("boundaries land exactly where documented (9/10, 29/30, 99/100)", () => {
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 9 }).level).toBe("uncalibrated");
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 10 }).level).toBe("early_signal");
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 29 }).level).toBe("early_signal");
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 30 }).level).toBe("partially_calibrated");
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 99 }).level).toBe("partially_calibrated");
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 100 }).level).toBe("calibrated");
  });

  it("a large sample with poor data never reaches calibrated", () => {
    expect(
      decideCalibrationLevel({ ...base, sampleSizeCostPerf: 500, metricsCompletenessBps: 8000 }).level
    ).toBe("early_signal");
  });

  it("p25 = 0 with unconfigured ceilings caps at partially_calibrated", () => {
    const r = decideCalibrationLevel({ ...base, sampleSizeCostPerf: 200, varianceP25: 0, varianceP75: 300 });
    expect(r.level).toBe("partially_calibrated");
    expect(r.flags).toContain("VARIANCE_CEILINGS_UNCONFIGURED");
    expect(CALIBRATION_THRESHOLDS.varianceAbsoluteCeilings).toBeNull();
  });

  it("staleness blocks calibrated", () => {
    expect(decideCalibrationLevel({ ...base, sampleSizeCostPerf: 150, sampleSizeRecent: 9 }).level).toBe(
      "partially_calibrated"
    );
  });

  it("critical errors block calibrated", () => {
    expect(
      decideCalibrationLevel({ ...base, sampleSizeCostPerf: 150, criticalErrorRateBps: 600 }).level
    ).toBe("partially_calibrated");
  });
});

describe("payout partition — profitability vs treasury vs audit", () => {
  it("partitions by current status and derives net incurred", () => {
    const p = partitionPayouts([
      { status: "paid", amountCents: 1300 },
      { status: "owed", amountCents: 900 },
      { status: "void", amountCents: 500 },
    ]);
    expect(p.workerPayoutPaidCents).toBe(1300);
    expect(p.workerPayoutCurrentLiabilityCents).toBe(900);
    expect(p.workerPayoutVoidedCents).toBe(500);
    expect(p.workerPayoutNetIncurredCents).toBe(2200);
    expect(p.flags).toContain("PAYOUT_VOIDED");
  });

  it("failed stays a liability, flagged", () => {
    const p = partitionPayouts([{ status: "failed", amountCents: 1000 }]);
    expect(p.workerPayoutCurrentLiabilityCents).toBe(1000);
    expect(p.flags).toContain("PAYOUT_FAILED");
  });
});

describe("revenue recognition — an authorization is not revenue", () => {
  it("authorized only → null with flag, never zero", () => {
    const r = recognizeRevenue({
      payments: [{ status: "authorized", amountCents: 87000, capturedAmountCents: null, refundedCents: 0 }],
    });
    expect(r.recognizedRevenueMicros).toBeNull();
    expect(r.flags).toContain("PAYMENT_NOT_CAPTURED");
  });

  it("received uses the captured amount and flags a mismatch", () => {
    const r = recognizeRevenue({
      payments: [{ status: "received", amountCents: 87000, capturedAmountCents: 85000, refundedCents: 0 }],
    });
    expect(r.recognizedRevenueMicros).toBe(850_000_000n);
    expect(r.flags).toContain("CAPTURE_AMOUNT_MISMATCH");
  });

  it("refunds subtract; chargeback recognizes nothing from that row", () => {
    const r = recognizeRevenue({
      payments: [
        { status: "partially_refunded", amountCents: 10000, capturedAmountCents: null, refundedCents: 4000 },
        { status: "chargeback", amountCents: 5000, capturedAmountCents: null, refundedCents: 0 },
      ],
    });
    expect(r.recognizedRevenueMicros).toBe(60_000_000n);
    expect(r.flags).toContain("CHARGEBACK");
  });
});

describe("cost breakdown keeps provenance separate and survives BigInt scale", () => {
  it("a $500 payout does not overflow (the Int ceiling is $2,147.48)", () => {
    const b = computeCostBreakdown({
      aiInvocationMicros: 520_108n,
      toolInvocationMicros: 90_000n,
      pipelineAiMicros: 45_000n,
      payoutPartition: partitionPayouts([{ status: "paid", amountCents: 50_000 }]),
      reviewerMeasuredSeconds: 600,
      reviewerHourlyUsd: 25,
      recognizedRevenueMicros: 3_000_000_000n, // $3,000 — already past Int
      paymentFeePctBps: 290,
      paymentFeeFixedCents: 30,
    });
    expect(b.bookedAndMeteredCostMicros).toBe(520_108n + 90_000n + 45_000n + 500_000_000n);
    // 600 s at $25/h = $4.166..7 → ceil to 4_166_667 micros
    expect(b.reviewerLaborModeledFromMeasuredTimeMicros).toBe(4_166_667n);
    // fee: 2.9% of $3,000 + 30¢ = 87_000_000 + 300_000
    expect(b.paymentFeeModeledMicros).toBe(87_300_000n);
    expect(b.flags).toContain("FEE_MODELED");
    expect(b.flags).toContain("REVIEWER_RATE_ASSUMED");
  });

  it("no reviewer session → null, not a modeled default", () => {
    const b = computeCostBreakdown({
      aiInvocationMicros: 0n,
      toolInvocationMicros: 0n,
      pipelineAiMicros: 0n,
      payoutPartition: partitionPayouts([]),
      reviewerMeasuredSeconds: null,
      reviewerHourlyUsd: 25,
      recognizedRevenueMicros: null,
      paymentFeePctBps: 290,
      paymentFeeFixedCents: 30,
    });
    expect(b.reviewerLaborModeledFromMeasuredTimeMicros).toBeNull();
    expect(b.paymentFeeModeledMicros).toBeNull();
    expect(b.modeledCostAddonMicros).toBe(0n);
  });

  it("margins are null without revenue — unknown, never zero", () => {
    const m = computeMargins({
      recognizedRevenueMicros: null,
      bookedAndMeteredCostMicros: 1_000_000n,
      allInCostWithModeledMicros: 2_000_000n,
    });
    expect(m.grossMarginBookedMeteredMicros).toBeNull();
    expect(m.grossMarginAllInModeledBps).toBeNull();
  });

  it("both margins compute in bps against recognized revenue", () => {
    const m = computeMargins({
      recognizedRevenueMicros: 850_000_000n,
      bookedAndMeteredCostMicros: 200_000_000n,
      allInCostWithModeledMicros: 300_000_000n,
    });
    expect(m.grossMarginBookedMeteredMicros).toBe(650_000_000n);
    expect(m.grossMarginBookedMeteredBps).toBe(7647);
    expect(m.grossMarginAllInModeledBps).toBe(6470);
  });
});

describe("repeat window censoring", () => {
  const accepted = new Date("2026-08-06T12:00:00Z");
  const ends = repeatWindowEndsAt(accepted);

  it("open window with no repeat is null — censored, not false", () => {
    expect(
      resolveRepeatStatus({ acceptedAt: accepted, windowEndsAt: ends, nextAcceptedAt: null, now: new Date("2026-09-01T00:00:00Z") })
    ).toBeNull();
  });

  it("false only once the window has closed", () => {
    expect(
      resolveRepeatStatus({ acceptedAt: accepted, windowEndsAt: ends, nextAcceptedAt: null, now: new Date("2026-11-05T00:00:00Z") })
    ).toBe(false);
  });

  it("true when a new task was accepted inside the window", () => {
    expect(
      resolveRepeatStatus({
        acceptedAt: accepted,
        windowEndsAt: ends,
        nextAcceptedAt: new Date("2026-08-20T00:00:00Z"),
        now: new Date("2026-08-21T00:00:00Z"),
      })
    ).toBe(true);
  });

  it("a repeat outside the window does not count, and the window closes false", () => {
    expect(
      resolveRepeatStatus({
        acceptedAt: accepted,
        windowEndsAt: ends,
        nextAcceptedAt: new Date("2026-12-01T00:00:00Z"),
        now: new Date("2026-12-02T00:00:00Z"),
      })
    ).toBe(false);
  });
});

describe("canonical hashing", () => {
  it("is order-insensitive on keys and exact on bigints and dates", () => {
    const a = canonicalHash({ b: 2n, a: new Date("2026-08-06T00:00:00Z"), c: null });
    const b = canonicalHash({ c: null, a: new Date("2026-08-06T00:00:00Z"), b: 2n });
    expect(a).toBe(b);
    expect(canonicalHash({ x: 2n })).not.toBe(canonicalHash({ x: 3n }));
    // bigint 2n and number 2 must NOT collide
    expect(canonicalHash({ x: 2n })).not.toBe(canonicalHash({ x: 2 }));
  });

  it("drops undefined but keeps null — null is an answer", () => {
    expect(canonicalHash({ a: undefined as unknown as string, b: 1 })).toBe(canonicalHash({ b: 1 }));
    expect(canonicalHash({ a: null, b: 1 })).not.toBe(canonicalHash({ b: 1 }));
  });
});
