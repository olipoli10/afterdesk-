import { describe, expect, it } from "vitest";
import {
  addToTally,
  emailOnlyExceptionRateBps,
  emptyTally,
  EXCEPTION_CAUSE_IDS,
  secondSourceMissingRateBps,
} from "@/lib/ai-work-engine/exception-cause";
import { classifyRow, splitExceptions } from "@/lib/ai-work-engine/primitives/pure";
import type { WorkflowRow } from "@/lib/ai-work-engine/primitives/types";

const row = (over: Partial<WorkflowRow> = {}): WorkflowRow => ({
  unitKey: "Acme Dental",
  fields: {},
  sources: {},
  status: "needs_review",
  reviewReason: null,
  ...over,
});

describe("the cause vocabulary contains only observable facts", () => {
  /**
   * THE LOAD-BEARING TEST OF THIS SLICE.
   *
   * The temptation is to record WEB_FETCH_WOULD_HAVE_SOLVED on a field with
   * one source, because it feels obviously true. It is not observable: nobody
   * fetched the page. Writing it would turn a guess into a database row, and
   * the guess would later be quoted as a measurement in a decision to buy a
   * vendor. This test fails the build if such a label is ever added.
   */
  it("no cause is phrased as a counterfactual", () => {
    for (const id of EXCEPTION_CAUSE_IDS) {
      expect(id, `${id} names a hypothetical remedy, not an observation`).not.toMatch(
        /WOULD_HAVE|COULD_HAVE|WEB_FETCH|FETCH_WOULD|SOLVED_BY|FIXED_BY|VENDOR/i
      );
    }
  });

  it("names the fact for N2, not the remedy", () => {
    expect(EXCEPTION_CAUSE_IDS).toContain("SECOND_INDEPENDENT_SOURCE_MISSING");
  });
});

describe("classifyRow reports a structured cause per field and keeps the prose", () => {
  it("one source where two are required is SECOND_INDEPENDENT_SOURCE_MISSING", () => {
    const r = classifyRow(
      row({
        fields: { email: "a@b.example", phone: "(514) 555-0100" },
        sources: {
          email: ["https://directory.example/a"],
          phone: ["https://directory.example/a", "https://other.example/b"],
        },
      }),
      ["email", "phone"]
    );
    expect(r.status).toBe("needs_review");
    // The worker's sentence survives.
    expect(r.reviewReason).toContain("needs a second source");
    expect(r.causes).toEqual([
      { field: "email", cause: "SECOND_INDEPENDENT_SOURCE_MISSING", distinctSources: 1 },
    ]);
  });

  it("a missing value is NO_VALUE_FOUND with zero sources", () => {
    const r = classifyRow(row({ fields: { email: null }, sources: {} }), ["email"]);
    expect(r.causes).toEqual([{ field: "email", cause: "NO_VALUE_FOUND", distinctSources: 0 }]);
  });

  it("two distinct hosts clear the bar and produce no cause", () => {
    const r = classifyRow(
      row({
        fields: { email: "a@b.example" },
        sources: { email: ["https://one.example/x", "https://two.example/y"] },
      }),
      ["email"]
    );
    expect(r.status).toBe("verified");
    expect(r.causes).toEqual([]);
  });

  it("the same host twice is still one source", () => {
    const r = classifyRow(
      row({
        fields: { email: "a@b.example" },
        sources: { email: ["https://one.example/x", "https://www.one.example/y"] },
      }),
      ["email"]
    );
    expect(r.causes[0].cause).toBe("SECOND_INDEPENDENT_SOURCE_MISSING");
  });

  it("no requested fields is its own cause, not a silent pass", () => {
    const r = classifyRow(row(), []);
    expect(r.status).toBe("needs_review");
    expect(r.causes).toEqual([{ field: "*", cause: "NO_FIELDS_REQUESTED", distinctSources: 0 }]);
  });
});

describe("splitExceptions aggregates the causes without touching its verdicts", () => {
  it("tallies per field and per cause, and attaches causes to the rows", () => {
    const split = splitExceptions({
      unitsTotal: 2,
      requestedFields: ["email", "website"],
      rows: [
        row({
          unitKey: "A",
          fields: { email: "a@x.example", website: "https://x.example" },
          sources: {
            email: ["https://one.example"],
            website: ["https://one.example", "https://two.example"],
          },
        }),
        row({
          unitKey: "B",
          fields: { email: null, website: null },
          sources: {},
        }),
      ],
    });

    expect(split.causeTally.byCause.SECOND_INDEPENDENT_SOURCE_MISSING).toBe(1);
    expect(split.causeTally.byCause.NO_VALUE_FOUND).toBe(2);
    expect(split.causeTally.byFieldAndCause["email::SECOND_INDEPENDENT_SOURCE_MISSING"]).toBe(1);
    expect(split.causeTally.rowsWithCause).toBe(2);
    // Rows carry their own causes AND their prose.
    expect(split.payload.rows[0].exceptionCauses).toHaveLength(1);
    expect(split.payload.rows[0].reviewReason).toBeTruthy();
    // Verdicts unchanged from v1.
    expect(split.verified).toBe(0);
    expect(split.notFound).toBe(1);
  });

  it("persists the PER-FIELD tally, without which N1 is structurally zero", () => {
    /**
     * The adversarial review's sharpest catch. The first version wrote only
     * `byCause` into the step summary, so the metrics query rebuilt a tally
     * with an EMPTY field dimension. N1 divides email-field causes by
     * rows-with-a-cause: with an empty numerator it returns 0 for every task,
     * forever, and 0% would have been read as "email is not the bottleneck"
     * in a decision to buy or not buy a vendor. A rate that can only be zero
     * is a fabricated number.
     */
    const split = splitExceptions({
      unitsTotal: 1,
      requestedFields: ["owner email"],
      rows: [row({ fields: { "owner email": null }, sources: {} })],
    });
    const summary = {
      exceptionCauses: JSON.stringify(split.causeTally.byCause),
      exceptionCausesByField: JSON.stringify(split.causeTally.byFieldAndCause),
    };
    const rebuilt = JSON.parse(summary.exceptionCausesByField) as Record<string, number>;
    expect(rebuilt["owner email::NO_VALUE_FOUND"]).toBe(1);
    // And the rate computed from it is 100%, not 0%.
    expect(
      emailOnlyExceptionRateBps([
        { byCause: split.causeTally.byCause, byFieldAndCause: rebuilt, rowsWithCause: 1 },
      ])
    ).toBe(10_000);
  });

  it("a fully verified row carries no causes at all", () => {
    const split = splitExceptions({
      unitsTotal: 1,
      requestedFields: ["email"],
      rows: [
        row({
          fields: { email: "a@x.example" },
          sources: { email: ["https://one.example", "https://two.example"] },
        }),
      ],
    });
    expect(split.verified).toBe(1);
    expect(split.causeTally.rowsWithCause).toBe(0);
    expect(split.payload.rows[0].exceptionCauses).toBeUndefined();
  });
});

describe("N1 and N2", () => {
  it("return null on an empty denominator, never zero", () => {
    // A rate over nothing is unknown, and the difference decides a purchase.
    expect(emailOnlyExceptionRateBps([])).toBeNull();
    expect(secondSourceMissingRateBps([])).toBeNull();
    expect(emailOnlyExceptionRateBps([emptyTally()])).toBeNull();
  });

  it("N1 counts email-field causes against rows that carried a cause", () => {
    let t = emptyTally();
    t = addToTally(t, [{ field: "email", cause: "NO_VALUE_FOUND", distinctSources: 0 }]);
    t = addToTally(t, [{ field: "phone", cause: "NO_VALUE_FOUND", distinctSources: 0 }]);
    expect(emailOnlyExceptionRateBps([t])).toBe(5000);
  });

  it("N1 recognises a French field name too", () => {
    let t = emptyTally();
    t = addToTally(t, [{ field: "courriel du proprietaire", cause: "NO_VALUE_FOUND", distinctSources: 0 }]);
    expect(emailOnlyExceptionRateBps([t])).toBe(10000);
  });

  it("N2 is the share of causes that are exactly one-source-short", () => {
    let t = emptyTally();
    t = addToTally(t, [
      { field: "email", cause: "SECOND_INDEPENDENT_SOURCE_MISSING", distinctSources: 1 },
      { field: "phone", cause: "NO_VALUE_FOUND", distinctSources: 0 },
    ]);
    t = addToTally(t, [
      { field: "website", cause: "SECOND_INDEPENDENT_SOURCE_MISSING", distinctSources: 1 },
    ]);
    // 2 of 3 causes.
    expect(secondSourceMissingRateBps([t])).toBe(6667);
  });
});
