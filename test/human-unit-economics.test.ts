import { describe, expect, it } from "vitest";
import {
  admitHumanCut,
  type AdmissionEconomics,
  type AdmissionStep,
} from "@/lib/ai-work-engine/human-unit-admission";

/**
 * ECONOMIC ADMISSION IS FOUR BOOLEANS OVER FROZEN COLUMNS (research R-05).
 *
 * The rule exists because of a measured failure, not a hypothesis. A step with
 * `fixedMinutes: null, secondsPerUnit: 60` once paid 20 minutes on a mandate
 * quoted at 240 — "five dollars for a sixty dollar mandate, and the arithmetic
 * looked correct the whole way down" (`residual.ts:88-116`). Every clause below
 * is a boolean over a stored accepted-contract column, so two reviewers reading
 * the same plan reach the same verdict, and a replay reaches it again.
 *
 * The clause that is NOT here is the point of the file: expected minutes and
 * the three PERT columns never enter the verdict. FR-035 forbids computing
 * adequacy from them; FR-058 makes them descriptive capacity context only.
 */

const machine = (
  order: number,
  deps: number[] = [],
  over: Partial<AdmissionStep> = {}
): AdmissionStep => ({
  order,
  executor: "ai",
  dependsOnOrder: deps,
  fixedMinutes: null,
  secondsPerUnit: null,
  estimatedMinutesOptimistic: 5,
  estimatedMinutesLikely: 10,
  estimatedMinutesConservative: 20,
  ...over,
});

const human = (
  order: number,
  deps: number[] = [],
  over: Partial<AdmissionStep> = {}
): AdmissionStep => ({
  ...machine(order, deps),
  executor: "human",
  fixedMinutes: 30,
  ...over,
});

/** Topology is admissible in every case here, so only economics can refuse. */
const plan = (cutOver: Partial<AdmissionStep> = {}): AdmissionStep[] => [
  machine(1),
  human(2, [1], cutOver),
  machine(3, [2]),
];

const payable: AdmissionEconomics = { vaPayoutCents: 4_000, estimatedMinutes: 60 };

const unmapped = { admitted: false, cause: "unmapped_economics" } as const;

describe("clause 2 — the cut's own frozen effort provenance", () => {
  it("admits when fixedMinutes is present and positive", () => {
    expect(admitHumanCut(plan({ fixedMinutes: 30 }), payable)).toEqual({
      admitted: true,
      cutOrder: 2,
    });
  });

  it("admits at the smallest positive value", () => {
    expect(admitHumanCut(plan({ fixedMinutes: 1 }), payable)).toEqual({
      admitted: true,
      cutOrder: 2,
    });
  });

  it("refuses a null fixedMinutes", () => {
    expect(admitHumanCut(plan({ fixedMinutes: null }), payable)).toEqual(unmapped);
  });

  it("refuses a zero fixedMinutes", () => {
    expect(admitHumanCut(plan({ fixedMinutes: 0 }), payable)).toEqual(unmapped);
  });

  it("refuses a negative fixedMinutes", () => {
    expect(admitHumanCut(plan({ fixedMinutes: -30 }), payable)).toEqual(unmapped);
  });

  /**
   * THE MEASURED FAILURE, PINNED.
   *
   * `secondsPerUnit` is exactly the field that produced the 20-minutes-for-240
   * underpayment. It is not a substitute for `fixedMinutes` and must never
   * become one: a per-unit rate without a unit count is not a provenance.
   */
  it("refuses a cut carrying only secondsPerUnit, however plausible", () => {
    expect(
      admitHumanCut(plan({ fixedMinutes: null, secondsPerUnit: 60 }), payable)
    ).toEqual(unmapped);
  });

  it("reads fixedMinutes from the cut, not from a neighbouring step", () => {
    // A machine step carries a healthy fixedMinutes; the cut does not. The
    // verdict must follow the cut.
    const steps = [
      machine(1, [], { fixedMinutes: 240 }),
      human(2, [1], { fixedMinutes: null }),
      machine(3, [2], { fixedMinutes: 240 }),
    ];
    expect(admitHumanCut(steps, payable)).toEqual(unmapped);
  });
});

describe("clause 3 — the accepted task economics", () => {
  it("refuses a null payout", () => {
    expect(
      admitHumanCut(plan(), { vaPayoutCents: null, estimatedMinutes: 60 })
    ).toEqual(unmapped);
  });

  it("refuses a zero payout", () => {
    expect(
      admitHumanCut(plan(), { vaPayoutCents: 0, estimatedMinutes: 60 })
    ).toEqual(unmapped);
  });

  it("refuses a negative payout", () => {
    expect(
      admitHumanCut(plan(), { vaPayoutCents: -1, estimatedMinutes: 60 })
    ).toEqual(unmapped);
  });

  it("refuses null estimated minutes", () => {
    expect(
      admitHumanCut(plan(), { vaPayoutCents: 4_000, estimatedMinutes: null })
    ).toEqual(unmapped);
  });

  it("refuses zero estimated minutes", () => {
    expect(
      admitHumanCut(plan(), { vaPayoutCents: 4_000, estimatedMinutes: 0 })
    ).toEqual(unmapped);
  });

  it("refuses negative estimated minutes", () => {
    expect(
      admitHumanCut(plan(), { vaPayoutCents: 4_000, estimatedMinutes: -60 })
    ).toEqual(unmapped);
  });

  /**
   * This is the identical predicate `handoverBlockedForUnknownPayout` applies
   * (`workflow-runs.ts:1481-1488`) and that `second_shift_pool_payable_guard`
   * enforces in Postgres. Admission must not be a softer gate than the two
   * that already exist, or a unit could be admitted into a state the database
   * would then refuse to publish.
   */
  it("admits only when all four booleans hold together", () => {
    expect(admitHumanCut(plan({ fixedMinutes: 30 }), payable)).toEqual({
      admitted: true,
      cutOrder: 2,
    });
  });
});

describe("expected minutes never enters the verdict (FR-035, FR-058)", () => {
  /**
   * THE LOAD-BEARING ECONOMICS TEST.
   *
   * If any PERT column could move the verdict, admission would be computing
   * adequacy from an estimate — which is the exact thing FR-035 forbids,
   * because an estimate is the planner's opinion and the payout is the
   * client's signed contract. The two must never be compared here.
   */
  const pertShapes: Array<Partial<AdmissionStep>> = [
    { estimatedMinutesOptimistic: 0, estimatedMinutesLikely: 0, estimatedMinutesConservative: 0 },
    { estimatedMinutesOptimistic: 1, estimatedMinutesLikely: 2, estimatedMinutesConservative: 3 },
    {
      estimatedMinutesOptimistic: 9_000,
      estimatedMinutesLikely: 9_000,
      estimatedMinutesConservative: 9_000,
    },
    {
      // Wildly inconsistent with the 30 frozen minutes, and with each other.
      estimatedMinutesOptimistic: 600,
      estimatedMinutesLikely: 5,
      estimatedMinutesConservative: 100_000,
    },
    {
      estimatedMinutesOptimistic: -5,
      estimatedMinutesLikely: -5,
      estimatedMinutesConservative: -5,
    },
  ];

  it.each(pertShapes.map((s, i) => [i, s] as const))(
    "admits identically under PERT shape #%i",
    (_i, pert) => {
      expect(admitHumanCut(plan({ fixedMinutes: 30, ...pert }), payable)).toEqual({
        admitted: true,
        cutOrder: 2,
      });
    }
  );

  it.each(pertShapes.map((s, i) => [i, s] as const))(
    "refuses identically under PERT shape #%i when the frozen provenance is absent",
    (_i, pert) => {
      expect(
        admitHumanCut(plan({ fixedMinutes: null, ...pert }), payable)
      ).toEqual(unmapped);
    }
  );

  it("never lets a generous estimate rescue an unmapped payout", () => {
    expect(
      admitHumanCut(
        plan({ fixedMinutes: 30, estimatedMinutesConservative: 100_000 }),
        { vaPayoutCents: null, estimatedMinutes: 60 }
      )
    ).toEqual(unmapped);
  });

  it("never lets a thin estimate defeat a mapped contract", () => {
    expect(
      admitHumanCut(plan({ fixedMinutes: 240, estimatedMinutesLikely: 1 }), {
        vaPayoutCents: 1,
        estimatedMinutes: 1,
      })
    ).toEqual({ admitted: true, cutOrder: 2 });
  });

  /**
   * Admission is not a pricing check. A payout that looks small against the
   * frozen minutes is still a signed contract, and this function has no
   * mandate to second-guess it — the hourly-floor question belongs to the
   * existing payout path, not here.
   */
  it("does not compare payout against minutes", () => {
    expect(
      admitHumanCut(plan({ fixedMinutes: 600 }), {
        vaPayoutCents: 1,
        estimatedMinutes: 600,
      })
    ).toEqual({ admitted: true, cutOrder: 2 });
  });

  it("varying secondsPerUnit on the cut never changes an admitted verdict", () => {
    for (const secondsPerUnit of [null, 0, 1, 60, 86_400]) {
      expect(
        admitHumanCut(plan({ fixedMinutes: 30, secondsPerUnit }), payable)
      ).toEqual({ admitted: true, cutOrder: 2 });
    }
  });
});

describe("topology refusals outrank economics refusals", () => {
  /**
   * When a plan fails both tests it is reported as a topology refusal. The
   * cut is what economics is computed ABOUT: with zero or two human steps
   * there is no cut, so "unmapped economics" would name a measurement that
   * was never taken. Admin surfaces render these causes in their own terms
   * (contracts/projections.md §4), so the distinction has to stay honest.
   */
  it("reports unsupported_topology when there is no cut to price", () => {
    const steps = [machine(1), machine(2, [1])];
    expect(
      admitHumanCut(steps, { vaPayoutCents: null, estimatedMinutes: null })
    ).toEqual({ admitted: false, cause: "unsupported_topology" });
  });

  it("reports unsupported_topology when two cuts each lack provenance", () => {
    const steps = [
      human(1, [], { fixedMinutes: null }),
      human(2, [1], { fixedMinutes: null }),
    ];
    expect(
      admitHumanCut(steps, { vaPayoutCents: null, estimatedMinutes: null })
    ).toEqual({ admitted: false, cause: "unsupported_topology" });
  });

  it("reports malformed_topology ahead of both", () => {
    const steps = [machine(1, [2]), machine(2, [1]), human(3, [1], { fixedMinutes: null })];
    expect(
      admitHumanCut(steps, { vaPayoutCents: null, estimatedMinutes: null })
    ).toEqual({ admitted: false, cause: "malformed_topology" });
  });
});
