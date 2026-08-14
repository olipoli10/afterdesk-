import { describe, expect, it } from "vitest";
import {
  ACTIVE_CLAIM_STATUSES,
  activeClaimCapRefusal,
  categoryCertificationRefusal,
  highValueRefusal,
  priorRejectionRefusal,
  vaStatusRefusal,
} from "@/lib/worker-eligibility";

/**
 * ONE ELIGIBILITY DEFINITION, NOT TWO.
 *
 * The human work unit needs to ask the same question `claimTask` already asks —
 * may this worker hold this task — at three separate moments: at claim, at
 * submission, and again when a residual package is published to the same
 * claimant after a downstream failure. Asking it by re-implementing the rules
 * would create a second definition of eligibility that drifts from the first,
 * and the drift would be discovered by a worker being let into work they should
 * not have, or shut out of work they had already started.
 *
 * So the predicates are extracted out of `claimTask` VERBATIM and the claim path
 * is changed to call them (T014). This spec is the contract that extraction has
 * to satisfy: same rules, same order, same messages. The messages are part of
 * the contract because a worker reads them — a reworded refusal is a behaviour
 * change even when the decision is identical.
 *
 * These are pure predicates over facts already read inside the claim
 * transaction. They are deliberately NOT fact-gatherers: every check in
 * `claimTask` runs inside the compare-and-swap, and several of its reads are
 * conditional, so moving the reads would change both the query pattern and the
 * order in which a worker meets a refusal.
 */

describe("approved-VA status", () => {
  it("permits an approved profile", () => {
    expect(vaStatusRefusal("approved")).toBeNull();
  });

  it.each(["pending", "rejected", "suspended", "", "APPROVED", null, undefined])(
    "refuses status %s",
    (status) => {
      expect(vaStatusRefusal(status as string | null)).toBe(
        "Your account is not currently able to claim tasks."
      );
    }
  );

  /**
   * `claimTask` reads `profile?.status !== "approved"`, so a missing profile row
   * refuses through the same branch as a non-approved one. Absence is not
   * permission.
   */
  it("refuses an absent profile through the same branch", () => {
    expect(vaStatusRefusal(null)).toBe(vaStatusRefusal("pending"));
  });
});

describe("category certification, when the operator has switched it on", () => {
  const category = { slug: "data-cleanup", name: "Data cleanup" };

  it("permits when the setting is off, however uncertified the worker", () => {
    expect(
      categoryCertificationRefusal({
        requireCategoryCertification: false,
        category,
        certifiedCount: 0,
      })
    ).toBeNull();
  });

  it("permits a certified worker when the setting is on", () => {
    expect(
      categoryCertificationRefusal({
        requireCategoryCertification: true,
        category,
        certifiedCount: 1,
      })
    ).toBeNull();
  });

  it("permits when the task has no category at all", () => {
    expect(
      categoryCertificationRefusal({
        requireCategoryCertification: true,
        category: null,
        certifiedCount: 0,
      })
    ).toBeNull();
  });

  /**
   * The refusal names the exam and says it is free. A worker who passes it in
   * another tab can claim immediately — which is why this is checked inside the
   * claim transaction rather than by filtering the pool.
   */
  it("refuses an uncertified worker and names the course", () => {
    expect(
      categoryCertificationRefusal({
        requireCategoryCertification: true,
        category,
        certifiedCount: 0,
      })
    ).toBe(
      "Data cleanup work opens up once you pass its Academy exam. The course is free and you can take it now."
    );
  });

  it("builds the message from the category's display name", () => {
    expect(
      categoryCertificationRefusal({
        requireCategoryCertification: true,
        category: { slug: "research", name: "Research" },
        certifiedCount: 0,
      })
    ).toBe(
      "Research work opens up once you pass its Academy exam. The course is free and you can take it now."
    );
  });
});

describe("prior-rejection exclusion", () => {
  it("permits a worker who never failed this task out of QC", () => {
    expect(priorRejectionRefusal(0)).toBeNull();
  });

  /**
   * The reassignment exists to put fresh eyes on the work. One prior rejection
   * is enough; there is no second chance on the same task.
   */
  it.each([1, 2, 7])("refuses after %i prior rejection(s)", (count) => {
    expect(priorRejectionRefusal(count)).toBe(
      "This task was reassigned after your earlier delivery. It is open to other workers now."
    );
  });
});

describe("high-value tier gate", () => {
  const settings = { highValueThreshold: 4.5, minRatedDeliveries: 10 };

  it("permits any worker on a standard-tier task", () => {
    expect(
      highValueRefusal({ tier: "standard", scoreCache: null, ratedCount: 0, ...settings })
    ).toBeNull();
  });

  it("permits a worker who clears both bars", () => {
    expect(
      highValueRefusal({ tier: "high_value", scoreCache: 4.5, ratedCount: 10, ...settings })
    ).toBeNull();
  });

  it("permits exactly at both thresholds", () => {
    // Both comparisons are `>=`, and the boundary is where a reimplementation
    // would most plausibly drift to `>`.
    expect(
      highValueRefusal({ tier: "high_value", scoreCache: 4.5, ratedCount: 10, ...settings })
    ).toBeNull();
  });

  const refusal = "High-value tasks open up at a 4.5 score across 10 rated deliveries.";

  it("refuses a null score", () => {
    expect(
      highValueRefusal({ tier: "high_value", scoreCache: null, ratedCount: 50, ...settings })
    ).toBe(refusal);
  });

  it("refuses a score below the threshold", () => {
    expect(
      highValueRefusal({ tier: "high_value", scoreCache: 4.4, ratedCount: 50, ...settings })
    ).toBe(refusal);
  });

  it("refuses too few rated deliveries", () => {
    expect(
      highValueRefusal({ tier: "high_value", scoreCache: 5, ratedCount: 9, ...settings })
    ).toBe(refusal);
  });

  /**
   * The threshold is rendered with `toFixed(1)`: an operator who sets 4 sees
   * "4.0", not "4". The worker-facing number has to keep matching the number
   * the operator configured.
   */
  it("renders the threshold to one decimal place", () => {
    expect(
      highValueRefusal({
        tier: "high_value",
        scoreCache: 1,
        ratedCount: 0,
        highValueThreshold: 4,
        minRatedDeliveries: 10,
      })
    ).toBe("High-value tasks open up at a 4.0 score across 10 rated deliveries.");
  });

  it("renders the rated-delivery count as a plain integer", () => {
    expect(
      highValueRefusal({
        tier: "high_value",
        scoreCache: 1,
        ratedCount: 0,
        highValueThreshold: 4.75,
        minRatedDeliveries: 3,
      })
    ).toBe("High-value tasks open up at a 4.8 score across 3 rated deliveries.");
  });
});

describe("work-in-progress cap", () => {
  it("permits a worker below the cap", () => {
    expect(activeClaimCapRefusal({ activeCount: 2, maxActiveClaims: 3 })).toBeNull();
  });

  /**
   * `>=`, not `>`: at the cap the worker is already holding the maximum. Without
   * this one fast worker can hoard the pool.
   */
  it("refuses at the cap", () => {
    expect(activeClaimCapRefusal({ activeCount: 3, maxActiveClaims: 3 })).toBe(
      "You already have 3 tasks in progress. Finish one before claiming another."
    );
  });

  it("refuses above the cap", () => {
    expect(activeClaimCapRefusal({ activeCount: 9, maxActiveClaims: 3 })).toBe(
      "You already have 9 tasks in progress. Finish one before claiming another."
    );
  });

  it("reports the worker's actual count, not the cap", () => {
    expect(activeClaimCapRefusal({ activeCount: 5, maxActiveClaims: 3 })).toContain(
      "have 5 tasks"
    );
  });

  /**
   * The statuses that count as "in progress". A status added to the task
   * lifecycle without being considered here would silently raise every
   * worker's real cap.
   */
  it("counts exactly the four in-progress statuses", () => {
    expect([...ACTIVE_CLAIM_STATUSES].sort()).toEqual([
      "claimed",
      "qc_rejected",
      "revision_requested",
      "submitted_for_qc",
    ]);
  });

  it("does not count terminal or pre-claim statuses", () => {
    for (const status of ["open", "completed", "cancelled", "expired", "ai_processing"]) {
      expect(ACTIVE_CLAIM_STATUSES).not.toContain(status);
    }
  });
});

describe("the predicates are pure", () => {
  it("returns the same answer every time", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(vaStatusRefusal("approved")).toBeNull();
      expect(activeClaimCapRefusal({ activeCount: 3, maxActiveClaims: 3 })).toBe(
        "You already have 3 tasks in progress. Finish one before claiming another."
      );
    }
  });

  it("does not mutate its input", () => {
    const facts = {
      tier: "high_value",
      scoreCache: 4.4,
      ratedCount: 50,
      highValueThreshold: 4.5,
      minRatedDeliveries: 10,
    };
    const before = JSON.stringify(facts);
    highValueRefusal(facts);
    expect(JSON.stringify(facts)).toBe(before);
  });
});
