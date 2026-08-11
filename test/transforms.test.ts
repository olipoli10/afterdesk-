import { describe, expect, it } from "vitest";
import {
  aggregate,
  compare,
  dedupe,
  filter,
  join,
  normalize,
  schemaMap,
  type TransformOutcome,
} from "@/lib/ai-work-engine/transforms";
import type {
  DataAggregateParams,
  DataCompareParams,
  DataDedupeParams,
  DataFilterParams,
  DataJoinParams,
  DataNormalizeParams,
  DataSchemaMapParams,
} from "@/lib/ai-work-engine/primitive-params";
import type { RowException, WorkflowRow } from "@/lib/ai-work-engine/primitives/types";

/**
 * These tests are written against the BEHAVIOUR THE CLIENT PAYS FOR, not
 * against the implementation: the whole value of a deterministic transform is
 * that it did exactly what it was told and said so when it could not. So most
 * of what follows asserts on refusals and on exceptions rather than on happy
 * paths, because the happy paths are the part nobody gets wrong.
 *
 * ── THE ONE SHAPE ASSERTION THAT RUNS THROUGH THE WHOLE FILE ──
 *
 * `rows` holds exactly one entry per surviving logical row, and `exceptions`
 * holds references to those rows and never rows themselves. That is not a
 * detail of taste: the previous contract let a transform return the same
 * record in both lists, the wiring concatenated them, and the client received
 * every flagged record twice. So every exception assertion below reads a
 * `rowId`, and `expectOk` checks on every single call that nothing in
 * `exceptions` points at a row that is not in `rows`. A dangling reference is
 * a finding nobody can act on, which is the failure mode this shape can still
 * have.
 */

/**
 * `rowId` is deliberately NOT the unitKey. Prefixing it keeps every assertion
 * honest about which of the two it is reading: a test that passed on either
 * one would not notice the day a transform started keying on the client's own
 * values again, which is the mistake that cost three rows in a deduplication
 * mandate.
 */
const row = (unitKey: string, fields: Record<string, string | null>): WorkflowRow => ({
  rowId: `id:${unitKey}`,
  unitKey,
  fields,
  sources: {},
  status: "needs_review",
  reviewReason: null,
});

/** The same row as a payload written before lineage existed. */
const legacyRow = (unitKey: string, fields: Record<string, string | null>): WorkflowRow => {
  const built = row(unitKey, fields);
  delete built.rowId;
  return built;
};

/**
 * Narrowing helper: an unexpected refusal should fail loudly, not silently.
 *
 * It also enforces the two structural invariants on every outcome this file
 * produces, so no individual test has to remember to: an exception is never a
 * row object, and it never references a row that is not in the output.
 */
function expectOk(outcome: TransformOutcome) {
  if (!outcome.ok) throw new Error(`expected ok, got refusal: ${outcome.reason}`);
  const present = new Set(outcome.rows.map((r) => r.rowId).filter((id) => id !== undefined));
  for (const exception of outcome.exceptions) {
    expect(Object.keys(exception).sort()).toEqual(["code", "detail", "field", "rowId"]);
    expect(present.has(exception.rowId), `dangling exception on ${exception.rowId}`).toBe(true);
  }
  return outcome;
}

/** Every distinct rowId an exception list points at, in first-seen order. */
const referenced = (exceptions: RowException[]): string[] => [...new Set(exceptions.map((e) => e.rowId))];

/** The rows a transform marked for a person, by unitKey. */
const flaggedKeys = (rows: WorkflowRow[]): string[] =>
  rows.filter((r) => r.reviewReason !== null).map((r) => r.unitKey);

const dedupeParams = (over: Partial<DataDedupeParams> = {}): DataDedupeParams => ({
  dataset: "main",
  keyFields: ["email"],
  strategy: "normalized",
  keep: "first",
  reportNearDuplicates: null,
  ...over,
});

const normalizeParams = (rules: DataNormalizeParams["rules"]): DataNormalizeParams => ({
  dataset: "main",
  rules,
});

const joinParams = (over: Partial<DataJoinParams> = {}): DataJoinParams => ({
  left: "left",
  right: "right",
  leftKey: "id",
  rightKey: "id",
  type: "left",
  onConflict: "exception",
  into: "main",
  ...over,
});

const filterParams = (over: Partial<DataFilterParams> = {}): DataFilterParams => ({
  dataset: "main",
  conditions: [{ field: "revenue", op: "gt", value: "100" }],
  match: "all",
  action: "keep",
  into: "main",
  ...over,
});

const aggregateParams = (over: Partial<DataAggregateParams> = {}): DataAggregateParams => ({
  dataset: "main",
  groupBy: ["region"],
  metrics: [{ fn: "sum", field: "revenue", as: "total" }],
  into: "main",
  ...over,
});

const compareParams = (over: Partial<DataCompareParams> = {}): DataCompareParams => ({
  left: "before",
  right: "after",
  key: "id",
  compareFields: [],
  into: "main",
  ...over,
});

const schemaMapParams = (over: Partial<DataSchemaMapParams> = {}): DataSchemaMapParams => ({
  dataset: "main",
  mapping: [{ from: "Company Name", to: "company" }],
  unmapped: "exception",
  into: "main",
  ...over,
});

/* ────────────────────────────────── dedupe ──────────────────────────────── */

describe("dedupe merges on a key and never on a resemblance", () => {
  it("merges byte-identical keys under `exact`", () => {
    const out = expectOk(
      dedupe(
        [
          row("a", { email: "owner@clinic.ca" }),
          row("b", { email: "owner@clinic.ca" }),
          row("c", { email: "other@clinic.ca" }),
        ],
        dedupeParams({ strategy: "exact" })
      )
    );
    expect(out.rows.map((r) => r.unitKey)).toEqual(["a", "c"]);
    expect(out.summary).toMatchObject({ rowsIn: 3, rowsOut: 2, exactMerged: 1 });
  });

  it("does NOT merge a case difference under `exact`, and DOES under `normalized`", () => {
    const rows = [row("a", { email: "Owner@Clinic.CA" }), row("b", { email: "owner@clinic.ca" })];
    expect(expectOk(dedupe(rows, dedupeParams({ strategy: "exact" }))).rows).toHaveLength(2);
    expect(expectOk(dedupe(rows, dedupeParams({ strategy: "normalized" }))).rows).toHaveLength(1);
  });

  it("normalises phone keys through the same formatter the delivery uses", () => {
    // Reusing pure.ts's normalizePhone rather than writing a second one is
    // what makes this pass: two parsers that disagree by one edge case
    // produce a key that does not match the value in the delivered file.
    const out = expectOk(
      dedupe(
        [row("a", { phone: "1-416-555-1234" }), row("b", { phone: "(416) 555-1234" })],
        dedupeParams({ keyFields: ["phone"] })
      )
    );
    expect(out.rows).toHaveLength(1);
  });

  it("keeps the first or the last survivor as instructed, always at the first position", () => {
    const rows = [
      row("a", { email: "x@y.ca", note: "oldest" }),
      row("b", { email: "z@y.ca", note: "other" }),
      row("c", { email: "x@y.ca", note: "newest" }),
    ];
    expect(expectOk(dedupe(rows, dedupeParams({ keep: "first" }))).rows.map((r) => r.unitKey)).toEqual([
      "a",
      "b",
    ]);
    const last = expectOk(dedupe(rows, dedupeParams({ keep: "last" })));
    expect(last.rows.map((r) => r.unitKey)).toEqual(["c", "b"]);
    // The survivor is kept WHOLE. No back-filling from the row that lost:
    // assembling a record out of two is a judgement nobody authorised.
    expect(last.rows[0].fields.note).toBe("newest");
    // And it is the same logical record it was, so its lineage does not move.
    expect(last.rows[0].rowId).toBe("id:c");
  });

  it("never merges two rows whose key fields are all empty", () => {
    const out = expectOk(
      dedupe([row("a", { email: null }), row("b", { email: "" })], dedupeParams())
    );
    expect(out.rows).toHaveLength(2);
  });

  it("reports near duplicates as references and leaves ONE entry per row in the output", () => {
    const rows = [
      row("a", { email: "a@x.ca", company: "Clinique Dentaire Belanger" }),
      row("b", { email: "b@x.ca", company: "Clinique Dentaire Belangier" }),
      row("c", { email: "c@x.ca", company: "Garage Central" }),
    ];
    const out = expectOk(
      dedupe(
        rows,
        dedupeParams({
          reportNearDuplicates: { fields: ["company"], threshold: 0.85, maxPairs: 500 },
        })
      )
    );
    // THE POINT OF THE WHOLE FEATURE: nothing was merged, and nothing was
    // duplicated either. Three rows in, three rows out, one entry each.
    expect(out.rows.map((r) => r.unitKey)).toEqual(["a", "b", "c"]);
    expect(out.summary.candidatePairs).toBe(1);
    expect(out.summary.exactMerged).toBe(0);

    // BOTH members of the pair are referenced, and each names the other.
    expect(referenced(out.exceptions)).toEqual(["id:a", "id:b"]);
    expect(out.exceptions.every((e) => e.code === "AMBIGUOUS_DUPLICATE")).toBe(true);
    expect(out.exceptions[0].detail).toContain("id:b");
    expect(out.exceptions[0].detail).toContain("similarity 0.9");
    expect(out.exceptions[1].detail).toContain("id:a");
    // An exception references a row; it never carries the row's data. The
    // detail may name another row's lineage, never a cell's contents.
    expect(out.exceptions[0].detail).not.toContain("Belanger");
    expect(out.exceptions[0].field).toBeNull();

    // The row itself still says so in the client's own terms, which is what
    // the human package and build.csv read.
    expect(flaggedKeys(out.rows)).toEqual(["a", "b"]);
    expect(out.rows[0].status).toBe("needs_review");
    expect(out.rows[0].reviewReason).toContain("b");
    expect(out.rows[1].reviewReason).toContain("a");
    // The unrelated row is not dragged into anybody's queue.
    expect(out.rows[2].reviewReason).toBeNull();
  });

  it("flags a lineage-free row in place rather than inventing an id for it", () => {
    /**
     * A payload written before this phase has no rowId, and the contract says
     * such a row must never be given an invented one. The finding still has to
     * reach a person, so it lands on the row itself; only the machine-readable
     * reference is skipped.
     */
    const out = expectOk(
      dedupe(
        [
          legacyRow("a", { email: "a@x.ca", company: "Clinique Dentaire Belanger" }),
          legacyRow("b", { email: "b@x.ca", company: "Clinique Dentaire Belangier" }),
        ],
        dedupeParams({
          reportNearDuplicates: { fields: ["company"], threshold: 0.85, maxPairs: 500 },
        })
      )
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows.every((r) => r.rowId === undefined)).toBe(true);
    expect(flaggedKeys(out.rows)).toEqual(["a", "b"]);
    expect(out.exceptions).toHaveLength(0);
  });

  it("refuses when the candidate list would be longer than maxPairs", () => {
    // Twelve rows that are all mutually similar: 66 pairs against a cap of 5.
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(`u${i}`, { email: `u${i}@x.ca`, company: `Groupe Financier Laurentien ${i}` })
    );
    const out = dedupe(
      rows,
      dedupeParams({
        reportNearDuplicates: { fields: ["company"], threshold: 0.9, maxPairs: 5 },
      })
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("more than 5");
    // No client data in a refusal reason.
    expect(out.reason).not.toContain("Laurentien");
  });

  it("refuses a quadratic scan above the row ceiling instead of sampling it", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(`u${i}`, { email: `u${i}@x.ca` }));
    const out = dedupe(
      rows,
      dedupeParams({
        reportNearDuplicates: { fields: ["email"], threshold: 0.9, maxPairs: 500 },
      })
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("1000 row ceiling");
  });
});

/* ───────────────────────────────── normalize ────────────────────────────── */

describe("normalize reformats, and leaves what it cannot parse exactly as written", () => {
  it("applies the total transforms without ever flagging", () => {
    const out = expectOk(
      normalize(
        [row("a", { city: "  montreal   nord ", code: "ab-12" })],
        normalizeParams([
          { field: "city", as: "collapse_space" },
          { field: "city", as: "title_case" },
          { field: "code", as: "upper" },
        ])
      )
    );
    expect(out.rows[0].fields.city).toBe("Montreal Nord");
    expect(out.rows[0].fields.code).toBe("AB-12");
    expect(out.exceptions).toHaveLength(0);
  });

  it("leaves an unparseable value byte-for-byte and references the row, naming the field", () => {
    const out = expectOk(
      normalize(
        [
          row("a", { email: "owner@clinic.ca", phone: "ext. 12 ask for Marie" }),
          row("b", { email: "not an email", phone: "1-416-555-1234" }),
        ],
        normalizeParams([
          { field: "email", as: "email" },
          { field: "phone", as: "phone_na" },
        ])
      )
    );
    // Never blanked, never collapsed, never coerced to a default.
    expect(out.rows[0].fields.phone).toBe("ext. 12 ask for Marie");
    expect(out.rows[1].fields.email).toBe("not an email");
    expect(out.rows[0].fields.email).toBe("owner@clinic.ca");
    expect(out.rows[1].fields.phone).toBe("(416) 555-1234");

    // ONE row per input row. The flag is on the row, not beside it.
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((r) => r.rowId)).toEqual(["id:a", "id:b"]);
    expect(out.rows[0].reviewReason).toContain("phone");
    expect(out.rows[1].reviewReason).toContain("email");

    expect(out.exceptions).toEqual([
      {
        rowId: "id:a",
        code: "UNPARSEABLE_VALUE",
        field: "phone",
        detail: expect.stringContaining("phone_na"),
      },
      {
        rowId: "id:b",
        code: "UNPARSEABLE_VALUE",
        field: "email",
        detail: expect.stringContaining("email"),
      },
    ]);
    // The value the client wrote is not in an operator-facing message.
    expect(out.exceptions[0].detail).not.toContain("Marie");
  });

  it("raises one reference per unparseable COLUMN of the same row", () => {
    const out = expectOk(
      normalize(
        [row("a", { email: "not an email", n: "5s" })],
        normalizeParams([
          { field: "email", as: "email" },
          { field: "n", as: "number" },
        ])
      )
    );
    expect(out.rows).toHaveLength(1);
    // Each column failed for its own declared type, and an operator counting
    // by column is counting the rule that needs rewriting.
    expect(out.exceptions.map((e) => e.field)).toEqual(["email", "n"]);
    expect(referenced(out.exceptions)).toEqual(["id:a"]);
  });

  it("refuses an ambiguous date rather than picking a month", () => {
    const out = expectOk(
      normalize(
        [row("a", { d: "2024-2-29" }), row("b", { d: "03/04/2024" }), row("c", { d: "2023-02-29" })],
        normalizeParams([{ field: "d", as: "date_iso" }])
      )
    );
    expect(out.rows[0].fields.d).toBe("2024-02-29");
    // Both of the remaining two are left verbatim: one is ambiguous, the other
    // is not a real day.
    expect(out.rows[1].fields.d).toBe("03/04/2024");
    expect(out.rows[2].fields.d).toBe("2023-02-29");
    expect(referenced(out.exceptions)).toEqual(["id:b", "id:c"]);
  });

  it("does not reformat the digits of a number it accepts", () => {
    const out = expectOk(
      normalize(
        [row("a", { n: "1,234.50" }), row("b", { n: "$1,200" }), row("c", { n: "007" })],
        normalizeParams([{ field: "n", as: "number" }])
      )
    );
    // "1.10" must not become "1.1" and "007" must not become "7": a Number
    // round trip is a reformat the client never asked for.
    expect(out.rows[0].fields.n).toBe("1234.50");
    expect(out.rows[1].fields.n).toBe("$1,200");
    expect(out.rows[2].fields.n).toBe("007");
    expect(referenced(out.exceptions)).toEqual(["id:b"]);
  });

  it("strips only whitespace from a number, never a letter", () => {
    const out = expectOk(
      normalize(
        // NBSP built from its code point rather than typed, so nobody has to
        // trust an invisible character in a test fixture. This is the separator
        // a French locale actually emits in "1 234".
        [
          row("a", { n: `1${String.fromCharCode(0xa0)}234` }),
          row("b", { n: "5s" }),
          row("c", { n: "12 sacs" }),
        ],
        normalizeParams([{ field: "n", as: "number" }])
      )
    );
    expect(out.rows[0].fields.n).toBe("1234");
    // A whitespace class that also ate letters would turn "5s" into the
    // perfectly valid number 5 and deliver it as if the client had written it.
    expect(out.rows[1].fields.n).toBe("5s");
    expect(out.rows[2].fields.n).toBe("12 sacs");
    expect(referenced(out.exceptions)).toEqual(["id:b", "id:c"]);
  });

  it("leaves a null alone without calling it an exception", () => {
    const out = expectOk(
      normalize([row("a", { email: null })], normalizeParams([{ field: "email", as: "email" }]))
    );
    expect(out.rows[0].fields.email).toBeNull();
    expect(out.exceptions).toHaveLength(0);
  });

  it("refuses a rule written for a column that is in no row", () => {
    const out = normalize(
      [row("a", { email: "x@y.ca" })],
      normalizeParams([{ field: "courriel", as: "email" }])
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("courriel");
  });
});

/* ────────────────────────────────── join ────────────────────────────────── */

describe("join refuses to guess which of two matches was meant", () => {
  it("joins one to one and merges the right side's columns in", () => {
    const out = expectOk(
      join(
        {
          left: [row("a", { id: "1", company: "Clinique" })],
          right: [row("r1", { id: "1", phone: "4165551234" })],
        },
        joinParams()
      )
    );
    expect(out.rows[0].fields).toMatchObject({ id: "1", company: "Clinique", phone: "4165551234" });
    // A matched row is a NEW record made of two parents, so it carries a
    // lineage derived from both and never one parent's alone.
    expect(out.rows[0].rowId).toBe("join(id:a,id:r1)");
    expect(out.summary).toMatchObject({ matched: 1, unmatched: 0, ambiguous: 0 });
  });

  it("emits an ambiguously matched left row UNMERGED and references it", () => {
    const out = expectOk(
      join(
        {
          left: [row("a", { id: "1", company: "Clinique" }), row("b", { id: "2", company: "Garage" })],
          right: [
            row("r1", { id: "1", phone: "4165551234" }),
            row("r2", { id: "1", phone: "5145559999" }),
            row("r3", { id: "2", phone: "8195550000" }),
          ],
        },
        joinParams()
      )
    );
    // Never a silent first-wins: nothing from the right side was taken.
    const ambiguous = out.rows.find((r) => r.unitKey === "a");
    expect(ambiguous?.fields.phone).toBeNull();
    expect(ambiguous?.reviewReason).toContain("Ambiguous");
    expect(ambiguous?.reviewReason).toContain("2 rows");
    // And never a silent drop either: the row is the client's, so it is in the
    // output, once, keeping its own lineage because it was not paired.
    expect(out.rows.map((r) => r.unitKey)).toEqual(["a", "b"]);
    expect(ambiguous?.rowId).toBe("id:a");

    expect(out.exceptions).toEqual([
      {
        rowId: "id:a",
        code: "AMBIGUOUS_JOIN_KEY",
        field: "id",
        detail: expect.stringContaining("2 rows"),
      },
    ]);
    expect(out.summary).toMatchObject({ ambiguous: 1, matched: 1, rowsOut: 2 });
  });

  it("names BOTH values on the row when the two sides disagree on a column", () => {
    const out = expectOk(
      join(
        {
          left: [row("a", { id: "1", phone: "(416) 555-1234" })],
          right: [row("r1", { id: "1", phone: "(514) 555-9999" })],
        },
        joinParams()
      )
    );
    // The merge is refused WHOLE: the left row survives exactly as it came in.
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].fields.phone).toBe("(416) 555-1234");
    expect(out.rows[0].reviewReason).toContain("(416) 555-1234");
    expect(out.rows[0].reviewReason).toContain("(514) 555-9999");
    expect(out.rows[0].reviewReason).toContain("phone");

    expect(out.exceptions).toHaveLength(1);
    expect(out.exceptions[0]).toMatchObject({
      rowId: "id:a",
      code: "CONFLICTING_VALUE",
      field: "phone",
    });
    // The operator-facing half names the other row's lineage and neither value.
    expect(out.exceptions[0].detail).toContain("id:r1");
    expect(out.exceptions[0].detail).not.toContain("555");
    expect(out.summary.conflicts).toBe(1);
  });

  it("resolves a conflict silently only when the operator wrote down which side wins", () => {
    const datasets = {
      left: [row("a", { id: "1", phone: "(416) 555-1234" })],
      right: [row("r1", { id: "1", phone: "(514) 555-9999" })],
    };
    expect(
      expectOk(join(datasets, joinParams({ onConflict: "prefer_left" }))).rows[0].fields.phone
    ).toBe("(416) 555-1234");
    expect(
      expectOk(join(datasets, joinParams({ onConflict: "prefer_right" }))).rows[0].fields.phone
    ).toBe("(514) 555-9999");
    // A resolved conflict is a merge, so it produces a paired lineage and no
    // exception at all.
    const resolved = expectOk(join(datasets, joinParams({ onConflict: "prefer_left" })));
    expect(resolved.rows[0].rowId).toBe("join(id:a,id:r1)");
    expect(resolved.exceptions).toHaveLength(0);
  });

  it("fills a hole from the right without calling it a conflict", () => {
    const out = expectOk(
      join(
        {
          left: [row("a", { id: "1", phone: null })],
          right: [row("r1", { id: "1", phone: "(514) 555-9999" })],
        },
        joinParams()
      )
    );
    expect(out.rows[0].fields.phone).toBe("(514) 555-9999");
    expect(out.summary.conflicts).toBe(0);
  });

  it("keeps unmatched left rows under `left` and drops them under `inner`", () => {
    const datasets = {
      left: [row("a", { id: "1" }), row("b", { id: "2" })],
      right: [row("r1", { id: "1", phone: "4165551234" })],
    };
    const left = expectOk(join(datasets, joinParams({ type: "left" })));
    expect(left.rows.map((r) => r.unitKey)).toEqual(["a", "b"]);
    // Padded so the output is rectangular: a CSV whose columns depend on
    // whether a row matched is a file no importer reads twice.
    expect(left.rows[1].fields.phone).toBeNull();
    // An unmatched row was never paired with anything, so it keeps its own id.
    expect(left.rows[1].rowId).toBe("id:b");
    expect(expectOk(join(datasets, joinParams({ type: "inner" }))).rows.map((r) => r.unitKey)).toEqual([
      "a",
    ]);
  });

  it("gives a paired row no lineage at all when a parent has none", () => {
    // Half an ancestry is not an ancestry, and inventing the other half is
    // exactly what the contract forbids.
    const out = expectOk(
      join(
        { left: [row("a", { id: "1" })], right: [legacyRow("r1", { id: "1", phone: "418" })] },
        joinParams()
      )
    );
    expect(out.rows[0].fields.phone).toBe("418");
    expect(out.rows[0].rowId).toBeUndefined();
  });

  it("refuses when a named dataset is not in the run", () => {
    const out = join({ left: [] }, joinParams());
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("right");
  });
});

/* ───────────────────────────────── filter ───────────────────────────────── */

describe("filter never turns `cannot compare` into `false`", () => {
  it("applies the eight operators", () => {
    const rows = [
      row("a", { s: "Clinique Dentaire", n: "150" }),
      row("b", { s: "Garage", n: "50" }),
      row("c", { s: null, n: null }),
    ];
    const keys = (out: TransformOutcome) => expectOk(out).rows.map((r) => r.unitKey);
    const one = (c: DataFilterParams["conditions"][number]) =>
      keys(filter(rows, filterParams({ conditions: [c] })));

    expect(one({ field: "s", op: "eq", value: "Garage" })).toEqual(["b"]);
    expect(one({ field: "s", op: "neq", value: "Garage" })).toEqual(["a", "c"]);
    expect(one({ field: "s", op: "contains", value: "Dentaire" })).toEqual(["a"]);
    expect(one({ field: "s", op: "not_contains", value: "Dentaire" })).toEqual(["b", "c"]);
    expect(one({ field: "s", op: "empty", value: null })).toEqual(["c"]);
    expect(one({ field: "s", op: "not_empty", value: null })).toEqual(["a", "b"]);
    /**
     * Row "c" has no value at all in `n`, so a numeric comparison cannot place
     * it either way, and it is carried through undecided rather than removed.
     * That is the same set of rows the old contract sent to `exceptions` and
     * the wiring then appended back into the dataset; what changed is that the
     * row is now in the dataset ONCE, flagged, instead of twice.
     */
    expect(one({ field: "n", op: "gt", value: "100" })).toEqual(["a", "c"]);
    expect(one({ field: "n", op: "lt", value: "100" })).toEqual(["b", "c"]);
    const gt = expectOk(filter(rows, filterParams({ conditions: [{ field: "n", op: "gt", value: "100" }] })));
    expect(gt.rows[0].reviewReason).toBeNull();
    expect(flaggedKeys(gt.rows)).toEqual(["c"]);
  });

  it("honours all/any and keep/drop", () => {
    const rows = [row("a", { s: "x", n: "150" }), row("b", { s: "y", n: "50" })];
    const conditions: DataFilterParams["conditions"] = [
      { field: "s", op: "eq", value: "x" },
      { field: "n", op: "gt", value: "100" },
    ];
    expect(
      expectOk(filter(rows, filterParams({ conditions, match: "any" }))).rows.map((r) => r.unitKey)
    ).toEqual(["a"]);
    expect(
      expectOk(filter(rows, filterParams({ conditions, match: "all", action: "drop" }))).rows.map(
        (r) => r.unitKey
      )
    ).toEqual(["b"]);
  });

  it("KEEPS a row it could not compare, at its own position, and references it", () => {
    /**
     * The decision this transform documents: a rule that could not be
     * evaluated has excluded nothing, so removing the row would delete a
     * client record on the strength of a comparison that never happened. The
     * cost is that the output can hold a row the operator's rule might have
     * removed, which is why it is flagged and referenced.
     */
    const out = expectOk(
      filter(
        [
          row("a", { revenue: "250" }),
          row("b", { revenue: "about 2M" }),
          row("c", { revenue: "10" }),
        ],
        filterParams()
      )
    );
    expect(out.rows.map((r) => r.unitKey)).toEqual(["a", "b"]);
    // "b" is kept UNDECIDED, not kept as a match: the difference is on the row.
    expect(out.rows[0].reviewReason).toBeNull();
    expect(out.rows[1].reviewReason).toContain("revenue");
    expect(out.exceptions).toEqual([
      {
        rowId: "id:b",
        code: "NON_NUMERIC_COMPARISON",
        field: "revenue",
        detail: expect.stringContaining("kept rather than removed"),
      },
    ]);
    expect(out.summary).toMatchObject({ rowsIn: 3, rowsOut: 2, rowsRemoved: 1, rowsFlagged: 1 });
  });

  it("keeps the undecidable row under `drop` as well, where the rule would have removed it", () => {
    // The falsifiability companion: `action` decides what happens to rows the
    // rule DID place, and changes nothing for a row it could not place.
    const out = expectOk(
      filter(
        [row("a", { revenue: "250" }), row("b", { revenue: "about 2M" })],
        filterParams({ action: "drop" })
      )
    );
    expect(out.rows.map((r) => r.unitKey)).toEqual(["b"]);
    expect(out.rows[0].reviewReason).toContain("revenue");
  });

  it("does not raise an exception when another condition already settles the row", () => {
    // Under `all`, a definite false decides the row whatever the undecidable
    // comparison would have said, so nobody is asked to look at it.
    const out = expectOk(
      filter(
        [row("a", { s: "no", revenue: "about 2M" })],
        filterParams({
          conditions: [
            { field: "s", op: "eq", value: "yes" },
            { field: "revenue", op: "gt", value: "100" },
          ],
          match: "all",
        })
      )
    );
    expect(out.rows).toHaveLength(0);
    expect(out.exceptions).toHaveLength(0);
  });

  it("refuses a threshold that is not a number instead of flagging every row", () => {
    const out = filter(
      [row("a", { revenue: "10" })],
      filterParams({ conditions: [{ field: "revenue", op: "gt", value: "a lot" }] })
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("not a number");
  });
});

/* ──────────────────────────────── aggregate ─────────────────────────────── */

describe("aggregate refuses to publish a total it cannot stand behind", () => {
  it("groups and computes count, sum, avg, min and max", () => {
    const out = expectOk(
      aggregate(
        [
          row("a", { region: "QC", revenue: "100" }),
          row("b", { region: "QC", revenue: "50" }),
          row("c", { region: "ON", revenue: "300" }),
        ],
        aggregateParams({
          metrics: [
            { fn: "count", field: null, as: "n" },
            { fn: "sum", field: "revenue", as: "total" },
            { fn: "avg", field: "revenue", as: "mean" },
            { fn: "min", field: "revenue", as: "low" },
            { fn: "max", field: "revenue", as: "high" },
          ],
        })
      )
    );
    // Sorted by group key, never by the order the rows happened to arrive in.
    expect(out.rows.map((r) => r.fields.region)).toEqual(["ON", "QC"]);
    expect(out.rows[1].fields).toMatchObject({
      n: "2",
      total: "150",
      mean: "75",
      low: "50",
      high: "100",
    });
    // A group is a derived row, so it has a lineage of its own, minted from
    // the group's identity and not from the members' ids.
    expect(out.rows.every((r) => /^agg\([0-9a-f]{16}\)$/.test(r.rowId ?? ""))).toBe(true);
    expect(out.rows[0].rowId).not.toBe(out.rows[1].rowId);
    // Hashed, so the client's own cell text is not inside an internal id that
    // exception details quote verbatim.
    expect(out.rows[1].rowId).not.toContain("QC");
  });

  it("mints the same group id whichever order the grouping columns were named in", () => {
    const rows = [row("a", { region: "QC", segment: "dental", revenue: "100" })];
    const one = expectOk(aggregate(rows, aggregateParams({ groupBy: ["region", "segment"] })));
    const other = expectOk(aggregate(rows, aggregateParams({ groupBy: ["segment", "region"] })));
    expect(one.rows[0].rowId).toBe(other.rows[0].rowId);
  });

  it("empties every metric over a poisoned column and flags the GROUP", () => {
    const out = expectOk(
      aggregate(
        [
          row("a", { region: "QC", revenue: "100" }),
          row("b", { region: "QC", revenue: "confidential" }),
          row("c", { region: "ON", revenue: "300" }),
        ],
        aggregateParams({
          metrics: [
            { fn: "count", field: null, as: "n" },
            { fn: "sum", field: "revenue", as: "total" },
          ],
        })
      )
    );
    // Both groups produce a row, so the table is rectangular and nothing
    // disappears. What the poisoned one does NOT produce is a number.
    expect(out.rows.map((r) => r.fields.region)).toEqual(["ON", "QC"]);
    expect(out.rows[0].fields.total).toBe("300");
    expect(out.rows[1].fields.total).toBeNull();
    // Counting rows needs nothing from the values, so it still answers.
    expect(out.rows[1].fields.n).toBe("2");
    expect(out.rows[1].reviewReason).toContain("revenue");

    expect(out.exceptions).toHaveLength(1);
    expect(out.exceptions[0]).toMatchObject({ code: "POISONED_AGGREGATE", field: "revenue" });
    expect(out.exceptions[0].rowId).toBe(out.rows[1].rowId);
    expect(out.exceptions[0].detail).not.toContain("confidential");
    expect(out.summary).toMatchObject({ groups: 2, rowsOut: 2, groupsFlagged: 1 });
  });

  it("keeps counting when the values are unusable, because count needs no value", () => {
    const out = expectOk(
      aggregate(
        [row("a", { region: "QC", revenue: "confidential" })],
        aggregateParams({ metrics: [{ fn: "count", field: null, as: "n" }] })
      )
    );
    expect(out.rows[0].fields.n).toBe("1");
    expect(out.exceptions).toHaveLength(0);
  });

  it("reports no figures rather than a zero total when every value is absent", () => {
    const out = expectOk(
      aggregate([row("a", { region: "QC", revenue: null })], aggregateParams())
    );
    // "they sold nothing" is a claim; "we have no figures" is the truth.
    expect(out.rows[0].fields.total).toBeNull();
    // And an absence is not a poisoning: nobody is asked to look at it.
    expect(out.exceptions).toHaveLength(0);
  });

  it("refuses two metrics writing to the same column", () => {
    const out = aggregate(
      [row("a", { region: "QC", revenue: "1" })],
      aggregateParams({
        metrics: [
          { fn: "sum", field: "revenue", as: "total" },
          { fn: "avg", field: "revenue", as: "total" },
        ],
      })
    );
    expect(out.ok).toBe(false);
  });
});

/* ───────────────────────────────── compare ──────────────────────────────── */

describe("compare produces a diff, or nothing at all", () => {
  it("labels added, removed, changed and unchanged, and names the columns that moved", () => {
    const out = expectOk(
      compare(
        {
          before: [
            row("l1", { id: "1", phone: "111", city: "Laval" }),
            row("l2", { id: "2", phone: "222", city: "Hull" }),
            row("l3", { id: "3", phone: "333", city: "Sorel" }),
          ],
          after: [
            row("r1", { id: "1", phone: "999", city: "Longueuil" }),
            row("r2", { id: "2", phone: "222", city: "Hull" }),
            row("r4", { id: "4", phone: "444", city: "Rimouski" }),
          ],
        },
        compareParams()
      )
    );
    expect(out.rows.map((r) => [r.unitKey, r.fields._change])).toEqual([
      ["1", "changed"],
      ["2", "unchanged"],
      ["3", "removed"],
      ["4", "added"],
    ]);
    // Sorted, so the list reads the same on every run and on every host.
    expect(out.rows[0].fields._changed_fields).toBe("city, phone");
    expect(out.rows[1].fields._changed_fields).toBeNull();
    // A changed row carries the CURRENT state.
    expect(out.rows[0].fields.phone).toBe("999");
    // A removed row carries the state it had before it disappeared.
    expect(out.rows[2].fields.phone).toBe("333");
    // A diff row is derived from the two sides, with the missing half left
    // empty for a key that exists on one side only.
    expect(out.rows.map((r) => r.rowId)).toEqual([
      "cmp(id:l1,id:r1)",
      "cmp(id:l2,id:r2)",
      "cmp(id:l3,)",
      "cmp(,id:r4)",
    ]);
    expect(out.summary).toMatchObject({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it("compares only the named columns when the operator named some", () => {
    const out = expectOk(
      compare(
        {
          before: [row("l1", { id: "1", phone: "111", city: "Laval" })],
          after: [row("r1", { id: "1", phone: "111", city: "Longueuil" })],
        },
        compareParams({ compareFields: ["phone"] })
      )
    );
    expect(out.rows[0].fields._change).toBe("unchanged");
  });

  it("refuses a duplicate key, because a diff over an ambiguous key means nothing", () => {
    const out = compare(
      {
        before: [row("l1", { id: "1", phone: "111" }), row("l2", { id: "1", phone: "222" })],
        after: [row("r1", { id: "1", phone: "111" })],
      },
      compareParams()
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("before");
    expect(out.reason).toContain("ambiguous key");
    // No client value in a refusal reason.
    expect(out.reason).not.toContain("111");
  });

  it("refuses to overwrite a client column that is already called _change", () => {
    const out = compare(
      {
        before: [row("l1", { id: "1", _change: "mine" })],
        after: [row("r1", { id: "1", _change: "mine" })],
      },
      compareParams()
    );
    expect(out.ok).toBe(false);
  });

  it("carries a row that has no key through uncompared rather than dropping it", () => {
    const out = expectOk(
      compare(
        { before: [row("l1", { id: "", phone: "111" })], after: [row("r1", { id: "1" })] },
        compareParams()
      )
    );
    // Present, once, at the end, with an empty verdict and its own lineage.
    const carried = out.rows[out.rows.length - 1];
    expect(carried.rowId).toBe("id:l1");
    expect(carried.fields.phone).toBe("111");
    expect(carried.fields._change).toBeNull();
    expect(carried.reviewReason).toContain("id");
    expect(out.exceptions).toEqual([
      {
        rowId: "id:l1",
        code: "UNPARSEABLE_VALUE",
        field: "id",
        detail: expect.stringContaining("comparison key"),
      },
    ]);
    expect(out.summary).toMatchObject({ rowsFlagged: 1 });
  });
});

/* ──────────────────────────────── schemaMap ─────────────────────────────── */

describe("schemaMap renames what it was told and infers nothing", () => {
  it("renames per the explicit mapping", () => {
    const out = expectOk(
      schemaMap(
        [row("a", { "Company Name": "Clinique", "Tel.": "4165551234" })],
        schemaMapParams({
          mapping: [
            { from: "Company Name", to: "company" },
            { from: "Tel.", to: "phone" },
          ],
        })
      )
    );
    expect(out.rows[0].fields).toEqual({ company: "Clinique", phone: "4165551234" });
    expect(out.exceptions).toHaveLength(0);
  });

  it("keeps the row's lineage across the rebuild", () => {
    /**
     * THE CASE THAT BROKE OBJECT IDENTITY. Every row here is a brand new
     * object with new keys, so the wiring's old identity-based deduplication
     * could not tell the rebuilt row from a second record. The id is what
     * survives the rebuild, and it is why the flagged row below is one row.
     */
    const out = expectOk(
      schemaMap([row("a", { "Company Name": "Clinique" })], schemaMapParams({ unmapped: "drop" }))
    );
    expect(out.rows[0].rowId).toBe("id:a");
    expect(out.rows[0].fields).not.toBe(undefined);
  });

  it("flags an unmapped column under `exception` and carries it through, once", () => {
    const out = expectOk(
      schemaMap(
        [row("a", { "Company Name": "Clinique", Notes: "call after 4" })],
        schemaMapParams()
      )
    );
    // ONE row out for one row in. The flagged record is not a second entry.
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].reviewReason).toContain("Notes");
    // Carried, not destroyed: dropping it is the OTHER instruction.
    expect(out.rows[0].fields).toEqual({ company: "Clinique", Notes: "call after 4" });
    expect(out.exceptions).toEqual([
      {
        rowId: "id:a",
        code: "UNMAPPED_COLUMN",
        field: "Notes",
        detail: expect.stringContaining("original name"),
      },
    ]);
    // A column name may be named to an operator; a cell's contents may not.
    expect(out.exceptions[0].detail).not.toContain("call after 4");
    expect(out.summary).toMatchObject({ unmappedColumns: 1, rowsFlagged: 1 });
  });

  it("drops an unmapped column under `drop`, with no exception", () => {
    const out = expectOk(
      schemaMap(
        [row("a", { "Company Name": "Clinique", Notes: "call after 4" })],
        schemaMapParams({ unmapped: "drop" })
      )
    );
    expect(out.rows[0].fields).toEqual({ company: "Clinique" });
    expect(out.exceptions).toHaveLength(0);
  });

  it("refuses a mapping whose source column is not in this file", () => {
    const out = schemaMap(
      [row("a", { "Company Name": "Clinique" })],
      schemaMapParams({
        mapping: [
          { from: "Company Name", to: "company" },
          { from: "Raison sociale", to: "legal_name" },
        ],
      })
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    // Producing a column of nulls under a correct-looking header is the single
    // hardest defect for a client to notice.
    expect(out.reason).toContain("Raison sociale");
    expect(out.reason).toContain("column of nulls");
  });

  it("refuses two source columns mapping onto one target", () => {
    const out = schemaMap(
      [row("a", { "Company Name": "Clinique", "Legal Name": "9231-1234 Quebec inc." })],
      schemaMapParams({
        mapping: [
          { from: "Company Name", to: "company" },
          { from: "Legal Name", to: "company" },
        ],
      })
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain("company");
  });

  it("refuses a target that collides with a carried-through unmapped column", () => {
    const out = schemaMap(
      [row("a", { "Company Name": "Clinique", company: "something else" })],
      schemaMapParams()
    );
    expect(out.ok).toBe(false);
  });
});

/* ─────────────────────── one row in, one row out ────────────────────────── */

/**
 * THE INVARIANT THE DELIVERY-DUPLICATION BUG BROKE, ASSERTED ON ITS OWN.
 *
 * Every transform that reshapes a dataset rather than deriving a new one must
 * return exactly as many rows as it was given, minus the ones it was asked to
 * remove, and never one more. The old contract let a transform return a
 * flagged COPY beside the row it kept; the wiring concatenated the two lists
 * and the client received every flagged record twice.
 *
 * These cases are chosen to be exactly the ones that used to double: each of
 * them flags every row it is given.
 */
describe("a flagged row is one row", () => {
  // The two Notes values are near duplicates of each other on purpose, so the
  // dedupe case below has a pair to report; the two emails are distinct and
  // both unparseable, so the dedupe case merges nothing and the normalize case
  // flags both rows.
  const two = [
    row("a", { "Company Name": "Clinique", Notes: "rappeler apres 16h", email: "not an email" }),
    row("b", { "Company Name": "Garage", Notes: "rappeler apres 17h", email: "also not one" }),
  ];

  const cases: { name: string; run: () => TransformOutcome }[] = [
    {
      name: "schemaMap carrying an unmapped column",
      run: () => schemaMap(two, schemaMapParams({ mapping: [{ from: "email", to: "contact" }] })),
    },
    {
      name: "normalize leaving an unparseable value",
      run: () => normalize(two, normalizeParams([{ field: "email", as: "email" }])),
    },
    {
      name: "dedupe reporting a near duplicate",
      run: () =>
        dedupe(
          two,
          dedupeParams({
            keyFields: ["email"],
            reportNearDuplicates: { fields: ["Notes"], threshold: 0.5, maxPairs: 500 },
          })
        ),
    },
  ];

  for (const c of cases) {
    it(`${c.name} returns two rows for two rows`, () => {
      const out = expectOk(c.run());
      expect(out.rows).toHaveLength(2);
      expect(out.rows.map((r) => r.rowId)).toEqual(["id:a", "id:b"]);
      // Flagged, so the case is not vacuous: this is precisely the shape that
      // used to come back as four records.
      expect(flaggedKeys(out.rows)).toEqual(["a", "b"]);
      expect(out.exceptions.length).toBeGreaterThan(0);
    });
  }
});

/* ─────────────────────────────── determinism ────────────────────────────── */

/**
 * IDENTICAL INPUTS PRODUCE IDENTICAL OUTPUT, and so do inputs that differ only
 * in ways that carry no meaning.
 *
 * Two equivalences are exercised, and they are not the same thing:
 *
 *   - COLUMN ORDER inside a row. `{a, b}` and `{b, a}` are the same record, so
 *     every function must produce byte-identical output for both. This is the
 *     one that catches an accidental dependency on JS object key order.
 *   - ROW ORDER, for the two functions where it genuinely carries no meaning:
 *     a group's total and a key-matched diff do not depend on which order the
 *     file arrived in. It deliberately is NOT applied to dedupe or filter,
 *     where row order is part of the instruction (`keep: first` means the
 *     first row in the file) and shuffling would change the correct answer.
 *
 * A replay after a lease expiry re-runs a step in full. If any of these
 * assertions failed, attempt 2 would write a different artifact than attempt 1
 * for a reason nobody could explain to the client reconciling against it. The
 * ids minted for derived rows are covered by the same equality: a counter or a
 * clock in one of them would show up here as two unequal outcomes.
 */
describe("determinism", () => {
  /** Rebuilds every row's fields in reverse key order. Same data, new object. */
  const shuffleColumns = (rows: WorkflowRow[]): WorkflowRow[] =>
    rows.map((r) => {
      const fields: Record<string, string | null> = {};
      for (const k of Object.keys(r.fields).reverse()) fields[k] = r.fields[k];
      const sources: Record<string, string[]> = {};
      for (const k of Object.keys(r.sources).reverse()) sources[k] = r.sources[k];
      return { ...r, fields, sources };
    });

  const sample = [
    row("a", { id: "3", region: "QC", revenue: "100", email: "A@x.CA", company: "Clinique Belanger" }),
    row("b", { id: "1", region: "ON", revenue: "50", email: "b@x.ca", company: "Clinique Belangier" }),
    row("c", { id: "2", region: "QC", revenue: "25", email: "c@x.ca", company: "Garage Central" }),
    row("d", { id: "4", region: "ON", revenue: "75", email: "d@x.ca", company: "Depanneur Nord" }),
  ];

  const rotated = [sample[2], sample[3], sample[0], sample[1]];

  const cases: { name: string; run: (rows: WorkflowRow[]) => TransformOutcome }[] = [
    {
      name: "dedupe",
      run: (rows) =>
        dedupe(
          rows,
          dedupeParams({
            keyFields: ["region"],
            reportNearDuplicates: { fields: ["company"], threshold: 0.6, maxPairs: 500 },
          })
        ),
    },
    {
      name: "normalize",
      run: (rows) =>
        normalize(
          rows,
          normalizeParams([
            { field: "email", as: "email" },
            { field: "revenue", as: "number" },
            { field: "company", as: "title_case" },
          ])
        ),
    },
    {
      name: "join",
      run: (rows) => join({ left: rows, right: rows.slice(0, 2) }, joinParams({ onConflict: "prefer_left" })),
    },
    {
      name: "filter",
      run: (rows) =>
        filter(rows, filterParams({ conditions: [{ field: "revenue", op: "gt", value: "40" }] })),
    },
    {
      name: "aggregate",
      run: (rows) =>
        aggregate(
          rows,
          aggregateParams({
            metrics: [
              { fn: "count", field: null, as: "n" },
              { fn: "sum", field: "revenue", as: "total" },
              { fn: "avg", field: "revenue", as: "mean" },
            ],
          })
        ),
    },
    {
      name: "compare",
      run: (rows) => compare({ before: rows, after: rows.slice(1) }, compareParams()),
    },
    {
      name: "schemaMap",
      run: (rows) =>
        schemaMap(
          rows,
          schemaMapParams({
            mapping: [
              { from: "region", to: "province" },
              { from: "email", to: "contact_email" },
            ],
            unmapped: "drop",
          })
        ),
    },
  ];

  for (const c of cases) {
    it(`${c.name} is stable across a repeat and across column order`, () => {
      const first = c.run(sample);
      expect(c.run(sample)).toEqual(first);
      expect(c.run(shuffleColumns(sample))).toEqual(first);
    });
  }

  it("aggregate is stable across row order", () => {
    const c = cases.find((x) => x.name === "aggregate");
    if (c === undefined) throw new Error("missing aggregate case");
    expect(c.run(rotated)).toEqual(c.run(sample));
  });

  it("compare is stable across row order on BOTH sides", () => {
    // The datasets are named explicitly here rather than derived by slicing
    // the sample: a slice is itself order dependent, so rotating the input
    // would change which rows are being compared and the test would be
    // asserting that two different questions have the same answer.
    const after = [
      row("x", { id: "1", region: "ON", revenue: "50" }),
      row("y", { id: "2", region: "QC", revenue: "999" }),
      row("z", { id: "9", region: "AB", revenue: "10" }),
    ];
    const rotatedAfter = [after[2], after[0], after[1]];
    expect(compare({ before: rotated, after: rotatedAfter }, compareParams())).toEqual(
      compare({ before: sample, after }, compareParams())
    );
  });

  it("a group's total does not depend on the order the rows were added in", () => {
    // Floating-point addition is not associative, which is why aggregate sorts
    // a group's values before summing. Without that, these two orders can
    // disagree in the last digit and a replay would contradict itself.
    const forward = [
      row("a", { region: "QC", revenue: "0.1" }),
      row("b", { region: "QC", revenue: "0.2" }),
      row("c", { region: "QC", revenue: "0.3" }),
    ];
    const backward = [forward[2], forward[1], forward[0]];
    const params = aggregateParams({ metrics: [{ fn: "sum", field: "revenue", as: "total" }] });
    expect(expectOk(aggregate(backward, params)).rows[0].fields.total).toBe(
      expectOk(aggregate(forward, params)).rows[0].fields.total
    );
  });
});
