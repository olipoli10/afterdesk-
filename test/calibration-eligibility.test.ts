import { describe, expect, it } from "vitest";
import {
  eligibleForCostAndPerformanceCalibration,
  eligibleForMarginStatistics,
  eligibleForReliabilityStatistics,
} from "@/lib/operational-intelligence/eligibility";
import {
  deriveOutcomeClass,
  EXTERNAL_OUTCOME_CLASSES,
  type OutcomeSignals,
} from "@/lib/operational-intelligence/outcome-class";

const signals = (over: Partial<OutcomeSignals> = {}): OutcomeSignals => ({
  status: "completed",
  everDelivered: true,
  disputeUpheld: false,
  paymentCancelledOrChargeback: false,
  paymentWindowExpired: false,
  cancelledByClient: false,
  cancelledByAdmin: false,
  workerExhaustedOrAbandoned: false,
  runFailedWithProviderErrors: false,
  runFailedOtherwise: false,
  ...over,
});

describe("outcome class precedence", () => {
  it("in-flight is null — no outcome before the outcome exists", () => {
    expect(deriveOutcomeClass(signals({ status: "claimed", everDelivered: false }))).toBeNull();
    expect(deriveOutcomeClass(signals({ status: "ai_processing", everDelivered: false }))).toBeNull();
  });

  it("disputed outranks everything, including a delivery", () => {
    expect(
      deriveOutcomeClass(signals({ disputeUpheld: true, paymentCancelledOrChargeback: true }))
    ).toBe("disputed");
  });

  it("payment failure outranks cancellation", () => {
    expect(
      deriveOutcomeClass(
        signals({
          status: "cancelled",
          everDelivered: false,
          paymentCancelledOrChargeback: true,
          cancelledByAdmin: true,
        })
      )
    ).toBe("payment_failure");
  });

  it("a delivery that stands is workflow_success even after an admin cancel of leftovers", () => {
    expect(deriveOutcomeClass(signals({ cancelledByAdmin: true }))).toBe("workflow_success");
  });

  it("delivered then cancelled+refunded is admin_cancelled — the terminal status decides", () => {
    // The adversarial finding: delivered → revision → admin cancels and
    // refunds used to score workflow_success because firstCompletedAt was
    // set, polluting the success rate AND the margin set with a refunded
    // task. The rule is keyed on the terminal STATUS, not on delivery.
    expect(
      deriveOutcomeClass(signals({ status: "cancelled", everDelivered: true, cancelledByAdmin: true }))
    ).toBe("admin_cancelled");
  });

  it("worker exhaustion without delivery is worker_failure", () => {
    expect(
      deriveOutcomeClass(
        signals({ status: "cancelled", everDelivered: false, cancelledByAdmin: true, workerExhaustedOrAbandoned: true })
      )
    ).toBe("admin_cancelled");
    expect(
      deriveOutcomeClass(signals({ status: "cancelled", everDelivered: false, workerExhaustedOrAbandoned: true }))
    ).toBe("worker_failure");
  });

  it("provider vs workflow failure are distinguished", () => {
    expect(
      deriveOutcomeClass(
        signals({ status: "cancelled", everDelivered: false, runFailedWithProviderErrors: true })
      )
    ).toBe("provider_failure");
    expect(
      deriveOutcomeClass(signals({ status: "cancelled", everDelivered: false, runFailedOtherwise: true }))
    ).toBe("workflow_failure");
  });

  it("external classes are exactly the three the mandate names", () => {
    expect([...EXTERNAL_OUTCOME_CLASSES].sort()).toEqual(
      ["admin_cancelled", "client_cancelled", "payment_failure"].sort()
    );
  });
});

describe("the three eligibility gates", () => {
  const reliable = {
    hasAcceptanceSnapshot: true,
    isInternal: false,
    isStandingCapacity: false,
    dataQualityFlags: [] as string[],
  };

  it("reliability includes real commercial failures", () => {
    expect(eligibleForReliabilityStatistics(reliable)).toBe(true);
    // A cancelled or disputed task is still reliability-eligible — the
    // failure IS the data point.
  });

  it("reliability excludes internal, standing, test and e2e data", () => {
    expect(eligibleForReliabilityStatistics({ ...reliable, isInternal: true })).toBe(false);
    expect(eligibleForReliabilityStatistics({ ...reliable, isStandingCapacity: true })).toBe(false);
    expect(eligibleForReliabilityStatistics({ ...reliable, hasAcceptanceSnapshot: false })).toBe(false);
    expect(
      eligibleForReliabilityStatistics({ ...reliable, dataQualityFlags: ["E2E_DATA"] })
    ).toBe(false);
  });

  it("cost/perf requires a delivered outcome and 70% completeness", () => {
    const base = {
      reliabilityEligible: true,
      outcomeClass: "workflow_success" as const,
      metricsCompletenessBps: 7000,
      dataQualityFlags: [] as string[],
    };
    expect(eligibleForCostAndPerformanceCalibration(base)).toBe(true);
    // The founder-approved floor is 7000, not 10000: a task with one modeled
    // component (fee, reviewer rate) still teaches cost and duration.
    expect(eligibleForCostAndPerformanceCalibration({ ...base, metricsCompletenessBps: 9999 })).toBe(true);
    expect(eligibleForCostAndPerformanceCalibration({ ...base, metricsCompletenessBps: 6999 })).toBe(false);
    expect(
      eligibleForCostAndPerformanceCalibration({ ...base, outcomeClass: "worker_failure" })
    ).toBe(false);
    expect(eligibleForCostAndPerformanceCalibration({ ...base, outcomeClass: null })).toBe(false);
    expect(
      eligibleForCostAndPerformanceCalibration({ ...base, dataQualityFlags: ["PARTIAL_TELEMETRY"] })
    ).toBe(false);
  });

  it("a commercial failure counts in reliability without contaminating cost", () => {
    // The exact scenario the split exists for.
    const rel = eligibleForReliabilityStatistics(reliable);
    const cost = eligibleForCostAndPerformanceCalibration({
      reliabilityEligible: rel,
      outcomeClass: "client_cancelled",
      metricsCompletenessBps: 9000,
      dataQualityFlags: [],
    });
    expect(rel).toBe(true);
    expect(cost).toBe(false);
  });

  it("margin needs recognized revenue AND an incurred payout", () => {
    const base = {
      costPerfEligible: true,
      recognizedRevenueMicros: 850_000_000n as bigint | null,
      workerPayoutNetIncurredCents: 1300 as number | null,
    };
    expect(eligibleForMarginStatistics(base)).toBe(true);
    expect(eligibleForMarginStatistics({ ...base, recognizedRevenueMicros: null })).toBe(false);
    // Zero is treated like null: a fully charged-back task recognizes 0n and
    // has no margin to measure — only a loss to count in reliability. A
    // negative recognition is the same statement, louder.
    expect(eligibleForMarginStatistics({ ...base, recognizedRevenueMicros: 0n })).toBe(false);
    expect(eligibleForMarginStatistics({ ...base, recognizedRevenueMicros: -5_000_000n })).toBe(false);
    expect(eligibleForMarginStatistics({ ...base, workerPayoutNetIncurredCents: null })).toBe(false);
    expect(eligibleForMarginStatistics({ ...base, costPerfEligible: false })).toBe(false);
  });
});
