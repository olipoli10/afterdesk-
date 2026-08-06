import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  METRICS_SCHEMAS,
  METRIC_ENUM_LABELS,
  METRIC_FIELDS,
  METRIC_FIELD_ORDER,
  METRIC_LABELS,
  METRIC_SHAPES,
  formatMetricsForClient,
  isMetricsCategory,
  listBuildingMetricsSchema,
  metricsSchemaFor,
  qcChecks,
  researchMetricsSchema,
  type MetricsCategory,
} from "@/lib/delivery-metrics";
import { approvedSubmissionMetricsWhere, executionSummary } from "@/lib/queries/tasks";

/**
 * RULE 1 net for the CONTENT half of the execution report.
 *
 * The process half is guarded by test/client-timeline.test.ts, where the risk
 * was a ROW (an audit event nobody meant to publish). Here the risk is a
 * VALUE: this is the first field a worker writes that is deliberately shown to
 * the paying client, and the worker is the one party RULE 1 exists to keep
 * anonymous. Submission.note already demonstrates the failure mode, which is
 * why it is unprojected everywhere client-facing.
 *
 * The whole defence is that no field can hold a string a worker typed. These
 * tests exist to make that a property of the code rather than of the current
 * field list.
 */

const CATEGORIES: MetricsCategory[] = ["research", "list-building"];

const validResearch = {
  v: 1 as const,
  category: "research" as const,
  recordsInBrief: 300,
  recordsResearched: 300,
  recordsComplete: 268,
  recordsWithGap: 32,
  findingsWithSavedSource: 300,
  sourceEvidence: "link" as const,
};

const validListBuilding = {
  v: 1 as const,
  category: "list-building" as const,
  candidatesScreened: 340,
  recordsQualified: 200,
  recordsRejected: 140,
  recordsComplete: 171,
  recordsWithGap: 29,
};

describe("delivery metrics — no worker-typed string can reach the client", () => {
  it("every field in every schema is a number, a fixed enum or a literal", () => {
    // The load-bearing assertion. The day someone adds z.string() to either
    // shape, this fails and they have to come here and argue for it.
    for (const category of CATEGORIES) {
      for (const [key, schema] of Object.entries(METRIC_SHAPES[category])) {
        const ok =
          schema instanceof z.ZodNumber ||
          schema instanceof z.ZodEnum ||
          schema instanceof z.ZodLiteral;
        expect(ok, `${category}.${key} must not be free text`).toBe(true);
        expect(
          schema instanceof z.ZodString,
          `${category}.${key} is a raw string field`
        ).toBe(false);
      }
    }
  });

  it("the field set of each category is exactly the reviewed one", () => {
    expect(Object.keys(METRIC_SHAPES.research).sort()).toEqual([
      "category",
      "findingsWithSavedSource",
      "recordsComplete",
      "recordsInBrief",
      "recordsResearched",
      "recordsWithGap",
      "sourceEvidence",
      "v",
    ]);
    expect(Object.keys(METRIC_SHAPES["list-building"]).sort()).toEqual([
      "candidatesScreened",
      "category",
      "recordsComplete",
      "recordsQualified",
      "recordsRejected",
      "recordsWithGap",
      "v",
    ]);
  });

  it("the formatter is an allowlist, so an extra property never renders", () => {
    for (const valid of [validResearch, validListBuilding]) {
      const rows = formatMetricsForClient({
        ...valid,
        leaked: "Marie D., marie@example.com, 555 0100",
      });
      expect(rows).not.toBeNull();
      const printed = JSON.stringify(rows);
      expect(printed).not.toContain("Marie");
      expect(printed).not.toContain("example.com");
      expect(printed).not.toContain("555");
      expect(printed).not.toContain("leaked");
    }
  });

  it("a string smuggled into a numeric slot is rejected outright", () => {
    expect(formatMetricsForClient({ ...validResearch, recordsComplete: "Marie D." })).toBeNull();
    expect(
      formatMetricsForClient({ ...validListBuilding, candidatesScreened: "call me" })
    ).toBeNull();
  });

  it("a string smuggled into the enum slot is rejected outright", () => {
    expect(
      formatMetricsForClient({ ...validResearch, sourceEvidence: "call me at 555 0100" })
    ).toBeNull();
  });

  it("is not fooled by inherited object members", () => {
    for (const hostile of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(metricsSchemaFor(hostile)).toBeNull();
      expect(formatMetricsForClient({ ...validResearch, category: hostile })).toBeNull();
      expect(
        formatMetricsForClient({ ...validResearch, sourceEvidence: hostile })
      ).toBeNull();
    }
  });

  it("never renders a row with an undefined label or value", () => {
    for (const valid of [validResearch, validListBuilding]) {
      for (const row of formatMetricsForClient(valid) ?? []) {
        expect(row.label).toBeTruthy();
        expect(row.value).toBeTruthy();
        expect(row.label).not.toBe("undefined");
        expect(row.value).not.toBe("undefined");
      }
    }
  });

  describe("every label a client reads is authored here, and is safe", () => {
    const allStrings: [string, string][] = [];
    for (const category of CATEGORIES) {
      for (const [key, label] of Object.entries(METRIC_LABELS[category])) {
        allStrings.push([`${category}.${key}`, label]);
      }
      for (const [key, map] of Object.entries(METRIC_ENUM_LABELS[category])) {
        for (const [member, label] of Object.entries(map)) {
          allStrings.push([`${category}.${key}.${member}`, label]);
        }
      }
    }

    it("contains no em-dash", () => {
      for (const [where, s] of allStrings) {
        expect(s.includes("—"), `${where} contains an em-dash`).toBe(false);
      }
    });

    it("contains no digits, no at-sign and no underscore", () => {
      for (const [where, s] of allStrings) {
        expect(/\d/.test(s), `${where} contains a digit`).toBe(false);
        expect(s.includes("@"), `${where} contains an at-sign`).toBe(false);
        expect(s.includes("_"), `${where} leaks a raw key`).toBe(false);
      }
    });

    it("never implies the client can reach the specialist", () => {
      const banned = /\b(contact them|email them|call them|their name|reach out|message them)\b/i;
      for (const [where, s] of allStrings) {
        expect(banned.test(s), `${where} implies a contact channel`).toBe(false);
      }
    });

    it("is sentence case", () => {
      for (const [where, s] of allStrings) {
        expect(s[0], `${where} is not capitalised`).toBe(s[0].toUpperCase());
      }
    });

    it("covers every field the formatter will try to render", () => {
      // A missing label would silently drop a row the worker filled in.
      for (const category of CATEGORIES) {
        for (const key of METRIC_FIELD_ORDER[category]) {
          expect(METRIC_LABELS[category][key], `${category}.${key} has no label`).toBeTruthy();
        }
        for (const f of METRIC_FIELDS[category]) {
          if (f.kind !== "enum") continue;
          for (const option of f.options) {
            expect(
              METRIC_ENUM_LABELS[category][f.key]?.[option],
              `${category}.${f.key}.${option} has no label`
            ).toBeTruthy();
          }
        }
      }
    });
  });
});

describe("delivery metrics — every other category is untouched", () => {
  it("only research and list-building have a schema", () => {
    expect(Object.keys(METRICS_SCHEMAS).sort()).toEqual(["list-building", "research"]);
    for (const slug of [
      "data-cleanup",
      "data-entry",
      "document-production",
      "writing",
      "analysis",
      "admin-coordination",
    ]) {
      expect(metricsSchemaFor(slug), `${slug} must have no schema`).toBeNull();
      expect(isMetricsCategory(slug)).toBe(false);
    }
  });

  it("handles a missing, empty or wrongly-cased slug", () => {
    for (const slug of [null, undefined, "", "Research", "RESEARCH", " research"]) {
      expect(metricsSchemaFor(slug)).toBeNull();
    }
  });

  it("returns null rather than throwing on anything unparseable", () => {
    for (const raw of [null, undefined, {}, [], 42, "research", { v: 1 }, { category: "writing" }]) {
      expect(formatMetricsForClient(raw)).toBeNull();
      expect(qcChecks(raw)).toEqual([]);
    }
  });

  it("a recategorised task cannot render under the other category's labels", () => {
    expect(listBuildingMetricsSchema.safeParse(validResearch).success).toBe(false);
    expect(researchMetricsSchema.safeParse(validListBuilding).success).toBe(false);
  });
});

describe("delivery metrics — the arithmetic has to hold", () => {
  it("accepts a consistent set", () => {
    expect(researchMetricsSchema.safeParse(validResearch).success).toBe(true);
    expect(listBuildingMetricsSchema.safeParse(validListBuilding).success).toBe(true);
  });

  it("rejects a partition that does not add up", () => {
    expect(
      researchMetricsSchema.safeParse({ ...validResearch, recordsComplete: 1 }).success
    ).toBe(false);
    expect(
      listBuildingMetricsSchema.safeParse({ ...validListBuilding, recordsQualified: 1 }).success
    ).toBe(false);
  });

  it("rejects researching more records than the brief contained", () => {
    expect(
      researchMetricsSchema.safeParse({
        ...validResearch,
        recordsInBrief: 10,
        recordsResearched: 300,
      }).success
    ).toBe(false);
  });

  it("rejects saved sources when the brief did not ask for any", () => {
    expect(
      researchMetricsSchema.safeParse({
        ...validResearch,
        sourceEvidence: "not_requested",
      }).success
    ).toBe(false);
  });

  it("rejects negatives, fractions and absurd magnitudes", () => {
    for (const bad of [-1, 1.5, 1_000_001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        researchMetricsSchema.safeParse({ ...validResearch, recordsWithGap: bad }).success,
        `recordsWithGap ${bad} must be rejected`
      ).toBe(false);
    }
  });
});

describe("delivery metrics — the reviewer is warned about the patterns that matter", () => {
  it("flags a perfect fill rate, which is the fabrication signature both standards target", () => {
    const checks = qcChecks({
      ...validResearch,
      recordsComplete: 300,
      recordsWithGap: 0,
    });
    expect(checks.some((c) => c.label.includes("Nothing was marked unavailable"))).toBe(true);
  });

  it("flags records left unresearched", () => {
    const checks = qcChecks({
      ...validResearch,
      recordsInBrief: 300,
      recordsResearched: 250,
      recordsComplete: 220,
      recordsWithGap: 30,
      findingsWithSavedSource: 250,
    });
    expect(checks.some((c) => c.label.includes("were not researched"))).toBe(true);
  });

  it("flags a list-building delivery where nothing was screened out", () => {
    const checks = qcChecks({
      ...validListBuilding,
      candidatesScreened: 200,
      recordsQualified: 200,
      recordsRejected: 0,
    });
    expect(checks.some((c) => c.label.includes("No candidate was rejected"))).toBe(true);
  });

  it("says nothing when the numbers are unremarkable", () => {
    expect(qcChecks(validResearch)).toEqual([]);
    expect(qcChecks(validListBuilding)).toEqual([]);
  });
});

describe("delivery metrics — never visible before the delivery passed review", () => {
  const a = (...actions: string[]) => actions.map((action) => ({ action }));

  it("the metrics read is filtered on an APPROVED submission", () => {
    // Pinned by shape: flipping this to "pending" would publish an unreviewed
    // worker's own claims, and no fixture test would necessarily notice.
    expect(approvedSubmissionMetricsWhere("task_1")).toEqual({
      taskId: "task_1",
      qcStatus: "approved",
    });
  });

  it("a delivery that was sent back and never approved has not passed", () => {
    expect(executionSummary(a("va_submitted_deliverable", "admin_qc_rejected")).passed).toBe(
      false
    );
  });

  it("the passed gate and the submission filter are independent", () => {
    // Both must hold. The table is the four combinations; only one shows.
    const cases: [boolean, boolean, boolean][] = [
      [false, false, false],
      [false, true, false],
      [true, false, false],
      [true, true, true],
    ];
    for (const [passed, rowPresent, expected] of cases) {
      const shown = passed && rowPresent && formatMetricsForClient(validResearch) !== null;
      expect(shown, `passed=${passed} rowPresent=${rowPresent}`).toBe(expected);
    }
  });
});
