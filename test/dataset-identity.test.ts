import { describe, expect, it } from "vitest";
import {
  concat,
  MAX_TRANSFORM_ROWS,
  type TransformOutcome,
} from "@/lib/ai-work-engine/transforms";
import type { DataConcatParams } from "@/lib/ai-work-engine/primitive-params";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { plannerCapabilityContract } from "@/lib/ai-work-engine/capability-contract";
import {
  emptyPayload,
  withRows,
  type PrimitiveContext,
  type WorkflowPayload,
  type WorkflowRow,
} from "@/lib/ai-work-engine/primitives/types";
import {
  runDataConcat,
  runDataDedupe,
  runDataJoin,
  runIngestCsv,
} from "@/lib/ai-work-engine/primitives/files";
import { runNormalizeContactFields, runSplitExceptions } from "@/lib/ai-work-engine/primitives/pure";

/**
 * WHICH DATASET A STEP MEANS, AND THE CAPABILITY THAT PUTS TWO OF THEM
 * TOGETHER.
 *
 * Both halves of one P0. A mandate saying "three branch exports, one file
 * back" was measured producing forty rows out of a hundred and five, and
 * measuring it turned up a second, worse defect underneath: `main` could name
 * two different sets at once, and the engine picked one silently.
 *
 * Neither is a crash. Both produce a run that SUCCEEDS with the wrong data,
 * which is the single outcome this engine treats as unsurvivable, so the tests
 * below are written from the wrong-answer side rather than the happy path.
 */

const row = (prefix: string, i: number, fields: Record<string, string | null>): WorkflowRow => ({
  rowId: `${prefix}#${i}`,
  unitKey: `${prefix}-${i}`,
  fields,
  sources: {},
  status: "verified",
  reviewReason: null,
});

const named = (
  prefix: string,
  n: number,
  fields: (i: number) => Record<string, string | null>
): WorkflowRow[] => Array.from({ length: n }, (_, i) => row(prefix, i, fields(i)));

function expectOk(outcome: TransformOutcome) {
  if (!outcome.ok) throw new Error(`expected ok, got refusal: ${outcome.reason}`);
  return outcome;
}

const concatParams = (over: Partial<DataConcatParams> = {}): DataConcatParams => ({
  datasets: ["a", "b"],
  columns: "union",
  into: "main",
  ...over,
});

const SETS = {
  a: named("a", 3, (i) => ({ company: `A${i}`, city: "Montreal" })),
  b: named("b", 2, (i) => ({ company: `B${i}`, city: "Toronto" })),
  c: named("c", 4, (i) => ({ company: `C${i}`, city: "Halifax" })),
};

/* ─────────────────────── the transform, on its own ─────────────────────── */

describe("concat stacks sets end to end and merges nothing", () => {
  it("two sets: the output is the sum, in the order given", () => {
    const out = expectOk(concat(SETS, concatParams()));
    expect(out.rows).toHaveLength(5);
    expect(out.rows.map((r) => r.unitKey)).toEqual(["a-0", "a-1", "a-2", "b-0", "b-1"]);
    expect(out.summary.rowsOut).toBe(5);
    expect(out.summary.perDataset).toBe("a:3,b:2");
  });

  it("three sets, and the order is the plan's, not the map's", () => {
    const forward = expectOk(concat(SETS, concatParams({ datasets: ["a", "b", "c"] })));
    const reversed = expectOk(concat(SETS, concatParams({ datasets: ["c", "b", "a"] })));
    expect(forward.rows).toHaveLength(9);
    expect(reversed.rows).toHaveLength(9);
    expect(forward.rows[0].unitKey).toBe("a-0");
    expect(reversed.rows[0].unitKey).toBe("c-0");
  });

  it("N sets: ten is the ceiling and the sum still holds", () => {
    const many: Record<string, WorkflowRow[]> = {};
    const names: string[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `s${i}`;
      names.push(name);
      many[name] = named(name, i + 1, (j) => ({ company: `${name}-${j}` }));
    }
    const out = expectOk(concat(many, concatParams({ datasets: names })));
    expect(out.rows).toHaveLength(55);
  });

  it("identical rows from two files stay two rows", () => {
    /**
     * The line between concat and dedupe. Collapsing these would delete the
     * client's data under a step whose name says "combine", and whether two
     * records are the same record needs a key the operator chose.
     */
    const twins = {
      left: named("l", 2, () => ({ company: "Acme Ltd", city: "Montreal" })),
      right: named("r", 2, () => ({ company: "Acme Ltd", city: "Montreal" })),
    };
    const out = expectOk(concat(twins, concatParams({ datasets: ["left", "right"] })));
    expect(out.rows).toHaveLength(4);
    expect(out.rows.every((r) => r.fields.company === "Acme Ltd")).toBe(true);
  });

  it("a missing column becomes null, never an empty string", () => {
    // The engine reads null as "not found" and "" as a real answer, so a gap
    // filled with "" is a fabricated value sitting in the deliverable.
    const wide = {
      a: SETS.a,
      d: named("d", 2, (i) => ({ company: `D${i}`, city: "Quebec", phone: `514-555-000${i}` })),
    };
    const out = expectOk(concat(wide, concatParams({ datasets: ["a", "d"] })));
    expect(out.rows).toHaveLength(5);
    expect(out.rows[0].fields.phone).toBeNull();
    expect(out.rows[4].fields.phone).toBe("514-555-0001");
    for (const r of out.rows) {
      expect(Object.keys(r.fields).sort()).toEqual(["city", "company", "phone"]);
    }
  });

  it("intersection keeps only the columns every input has", () => {
    const wide = {
      a: SETS.a,
      d: named("d", 2, (i) => ({ company: `D${i}`, city: "Quebec", phone: `514-555-000${i}` })),
    };
    const out = expectOk(
      concat(wide, concatParams({ datasets: ["a", "d"], columns: "intersection" }))
    );
    expect(out.rows).toHaveLength(5);
    for (const r of out.rows) expect(Object.keys(r.fields).sort()).toEqual(["city", "company"]);
    expect(out.summary.columnsDroppedByIntersection).toBe(1);
  });

  it("column ORDER follows the inputs, and is identical on a rerun", () => {
    const wide = {
      first: named("f", 1, () => ({ zeta: "1", alpha: "2" })),
      second: named("s", 1, () => ({ beta: "3", alpha: "4" })),
    };
    const once = expectOk(concat(wide, concatParams({ datasets: ["first", "second"] })));
    const twice = expectOk(concat(wide, concatParams({ datasets: ["first", "second"] })));
    // First-seen across the datasets in the order the step listed them: the
    // first file keeps its own column order, then whatever the next adds.
    expect(Object.keys(once.rows[0].fields)).toEqual(["zeta", "alpha", "beta"]);
    expect(JSON.stringify(once.rows)).toBe(JSON.stringify(twice.rows));
  });

  it("an empty dataset contributes nothing and breaks nothing", () => {
    const withEmpty = { a: SETS.a, empty: [] as WorkflowRow[] };
    const out = expectOk(concat(withEmpty, concatParams({ datasets: ["a", "empty"] })));
    expect(out.rows).toHaveLength(3);
    expect(out.summary.perDataset).toBe("a:3,empty:0");
  });

  it("all-empty inputs give an empty set rather than a refusal", () => {
    const out = expectOk(concat({ x: [], y: [] }, concatParams({ datasets: ["x", "y"] })));
    expect(out.rows).toHaveLength(0);
    expect(out.summary.columnsOut).toBe(0);
  });

  it("lineage is carried, never reminted", () => {
    const out = expectOk(concat(SETS, concatParams()));
    expect(out.rows.map((r) => r.rowId)).toEqual(["a#0", "a#1", "a#2", "b#0", "b#1"]);
  });

  it("two inputs carrying the same lineage id REFUSE", () => {
    /**
     * Stacking a set with itself, or two views of one file. The ids collide,
     * the exception-to-row join would then attach one row's findings to
     * another, and the delivery-duplication protections would be reading a
     * corrupted key. Which of the two a rowId means is not decidable.
     */
    const twinned = { a: SETS.a, alias: SETS.a.map((r) => ({ ...r })) };
    const out = concat(twinned, concatParams({ datasets: ["a", "alias"] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("same");
  });

  it("a missing dataset refuses by name", () => {
    const out = concat(SETS, concatParams({ datasets: ["a", "nope"] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("nope");
  });

  it("the combined row ceiling is checked on the SUM, not per input", () => {
    // Two sets each under the ceiling can exceed it together, which is the one
    // bound a per-input check would miss.
    const half = Math.ceil(MAX_TRANSFORM_ROWS * 0.6);
    const big = {
      p: named("p", half, (i) => ({ company: `P${i}` })),
      q: named("q", half, (i) => ({ company: `Q${i}` })),
    };
    const out = concat(big, concatParams({ datasets: ["p", "q"] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain(String(MAX_TRANSFORM_ROWS));
  });

  it("an intersection that empties the column set refuses rather than delivering blank rows", () => {
    const disjoint = {
      a: named("a", 2, (i) => ({ alpha: `${i}` })),
      b: named("b", 2, (i) => ({ beta: `${i}` })),
    };
    const out = concat(disjoint, concatParams({ datasets: ["a", "b"], columns: "intersection" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("share no column");
  });

  it("it raises no exceptions and decides nothing about any row", () => {
    const out = expectOk(concat(SETS, concatParams({ datasets: ["a", "b", "c"] })));
    expect(out.exceptions).toEqual([]);
    expect(out.rows.every((r) => r.status === "verified")).toBe(true);
  });

  it("the inputs are not mutated", () => {
    // A step is replayed on its predecessor's payload; a transform that edited
    // that payload in place would make the second attempt read different input.
    const before = JSON.stringify(SETS);
    expectOk(concat(SETS, concatParams({ datasets: ["a", "b", "c"] })));
    expect(JSON.stringify(SETS)).toBe(before);
  });
});

describe("the schema keeps concat and join from being confusable", () => {
  it("concat takes a LIST of datasets and no key at all", () => {
    const parsed = parsePrimitiveParams("data.concat", {
      datasets: ["src1", "src2", "src3"],
      into: "combined",
    });
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({ datasets: ["src1", "src2", "src3"], columns: "union" });
    // No key field exists to be written, which is the structural difference.
    expect(Object.keys(parsed as object).sort()).toEqual(["columns", "datasets", "into"]);
  });

  it("fewer than two datasets is not a concatenation", () => {
    expect(parsePrimitiveParams("data.concat", { datasets: ["only"] })).toBeNull();
  });

  it("the same dataset twice is refused at the schema, before any rows are read", () => {
    expect(parsePrimitiveParams("data.concat", { datasets: ["a", "b", "a"] })).toBeNull();
  });

  it("an unknown column strategy is refused rather than defaulted", () => {
    expect(
      parsePrimitiveParams("data.concat", { datasets: ["a", "b"], columns: "smart" })
    ).toBeNull();
  });

  it("the planner's contract states the difference in both directions", () => {
    // Generated from the same tables the compiler reads, so this pins the
    // sentence a planner actually sees.
    const text = plannerCapabilityContract();
    expect(text).toContain("data.concat@1");
    expect(text).toContain("END TO END");
    expect(text).toContain("SIDE BY SIDE");
    // join's own entry points at concat, so a planner reaching for the wrong
    // one is corrected where it is looking rather than three lines below.
    expect(text).toContain("the capability is data.concat");
    expect(text).toContain("This is the capability for combining several files");
  });
});

/* ──────────────────── which dataset a step actually means ──────────────── */

function makeContext(input: WorkflowPayload, params: Record<string, unknown>): PrimitiveContext {
  return {
    taskId: "t",
    runId: "r",
    stepRunId: "s",
    snapshotId: "snap",
    order: 1,
    attempt: 1,
    brief: {
      title: "t",
      description: "d",
      quantity: null,
      objective: "o",
      geography: [],
      requiredFields: ["company"],
      quantityInterpreted: null,
    },
    input,
    params,
    inputFiles: [],
    costCeilingMicros: 0n,
    recordInvocation: async () => {},
    writeArtifact: async () => ({ fileId: "a" }),
  };
}

async function ctxFor(
  primitiveId: string,
  input: WorkflowPayload,
  raw: Record<string, unknown>,
  files: PrimitiveContext["inputFiles"] = []
) {
  const params = parsePrimitiveParams(primitiveId, raw);
  if (params === null) throw new Error(`the test's own params for ${primitiveId} are invalid`);
  const ctx = makeContext(input, params);
  ctx.inputFiles = files;
  return ctx;
}

const csvFile = (id: string, text: string) => ({
  fileId: id,
  fileName: `${id}.csv`,
  sizeBytes: Buffer.byteLength(text),
  sha256: "0".repeat(64),
  read: async () => Buffer.from(text, "utf8"),
});

describe("`main` is the working set's alias, and never a second name for something else", () => {
  const FILE_A = "company,city\nAcme,Montreal\nBorealis,Laval\n";
  const FILE_B = "company,city\nCypress,Toronto\n";

  async function ingestTwo(firstName: string, secondName: string) {
    let payload: WorkflowPayload = emptyPayload(3, ["company", "city"]);
    const files = [csvFile("file_1", FILE_A), csvFile("file_2", FILE_B)];
    payload = (
      await runIngestCsv(
        await ctxFor("ingest.csv", payload, { fileId: "file_1", datasetName: firstName }, files)
      )
    ).payload;
    payload = (
      await runIngestCsv(
        await ctxFor("ingest.csv", payload, { fileId: "file_2", datasetName: secondName }, files)
      )
    ).payload;
    return payload;
  }

  it("THE P0, REPRODUCED: two files, then a step asking for `main`, refuses", async () => {
    /**
     * The exact shape of W8's first defect. Before the fix this returned file
     * TWO — one row where two were ingested — with no error anywhere, and the
     * deliverable was built from the wrong source.
     */
    const payload = await ingestTwo("main", "src2");
    expect(payload.datasets?.main).toHaveLength(2);
    expect(payload.datasets?.src2).toHaveLength(1);
    expect(payload.workingDataset).toBe("src2");

    await expect(
      runDataDedupe(
        await ctxFor("data.dedupe", payload, { dataset: "main", keyFields: ["company"] })
      )
    ).rejects.toThrow(/ambiguous/);
  });

  it("no data was lost: both sets are still reachable BY NAME", async () => {
    // The fix removes a guess, not a table. This is the assertion that stops
    // "fail closed" from being implemented as "drop the earlier dataset".
    const payload = await ingestTwo("main", "src2");
    const bySecond = await runDataDedupe(
      await ctxFor("data.dedupe", payload, { dataset: "src2", keyFields: ["company"] })
    );
    expect(bySecond.summary.rowsOut).toBe(1);
  });

  it("naming BOTH sources leaves `main` ambiguous too, rather than meaning the last one", async () => {
    /**
     * The subtler half. With no stored `main` at all, the old rule would have
     * silently resolved the alias to whichever set ran last — "take the most
     * recent", which is the guess this engine refuses whatever it is dressed
     * as.
     */
    const payload = await ingestTwo("src1", "src2");
    expect(payload.datasets?.main).toBeUndefined();
    await expect(
      runDataDedupe(
        await ctxFor("data.dedupe", payload, { dataset: "main", keyFields: ["company"] })
      )
    ).rejects.toThrow(/ambiguous/);
  });

  it("a single-source plan using the default throughout still works", async () => {
    // The 90% case, unchanged: one ingest into the default name, transforms on
    // the default name, and `main` means exactly one thing the whole way.
    let payload: WorkflowPayload = emptyPayload(2, ["company", "city"]);
    payload = (
      await runIngestCsv(
        await ctxFor("ingest.csv", payload, { fileId: "file_1" }, [csvFile("file_1", FILE_A)])
      )
    ).payload;
    expect(payload.workingDataset).toBe("main");
    const out = await runDataDedupe(
      await ctxFor("data.dedupe", payload, { keyFields: ["company"] })
    );
    expect(out.summary.rowsOut).toBe(2);
  });

  it("a web-research payload has no named sets, so the alias is never ambiguous", () => {
    const web = emptyPayload(10, ["company"]);
    expect(web.workingDataset).toBeUndefined();
    expect(web.datasets).toBeUndefined();
    // withRows on an unnamed working set invents no name and no dataset map.
    const after = withRows(web, named("w", 2, (i) => ({ company: `W${i}` })));
    expect(after.workingDataset).toBeUndefined();
    expect(after.datasets).toBeUndefined();
  });

  it("a payload from BEFORE this field existed refuses instead of guessing", async () => {
    /**
     * A run compiled before the fix, replayed after it. Its payload carries
     * named datasets and cannot say which one its rows are, so the alias has
     * no answer. Fail-closed: that mandate becomes a person's, which is the
     * correct outcome for "we do not know".
     */
    const legacy: WorkflowPayload = {
      ...emptyPayload(3, ["company"]),
      rows: named("x", 1, () => ({ company: "X" })),
      datasets: { src1: named("s", 2, (i) => ({ company: `S${i}` })) },
    };
    await expect(
      runDataDedupe(
        await ctxFor("data.dedupe", legacy, { dataset: "main", keyFields: ["company"] })
      )
    ).rejects.toThrow(/before the engine recorded/);
  });

  it("join and concat refuse with the ambiguity reason, not with `no dataset named main`", async () => {
    // These take a whole dataset map, so without an explicit pre-check the
    // operator would be told the set does not exist when in fact it exists
    // twice — true, and useless.
    const payload = await ingestTwo("main", "src2");
    await expect(
      runDataJoin(
        await ctxFor("data.join", payload, {
          left: "main",
          right: "src2",
          leftKey: "company",
          rightKey: "company",
        })
      )
    ).rejects.toThrow(/ambiguous/);
    await expect(
      runDataConcat(
        await ctxFor("data.concat", payload, { datasets: ["main", "src2"], into: "combined" })
      )
    ).rejects.toThrow(/ambiguous/);
  });

  it("a rewrite of the working set keeps its named copy in step", async () => {
    /**
     * The invariant the resolver rests on. `normalize.contact_fields` replaces
     * `rows` without naming a dataset; if it spread the payload instead of
     * using withRows, `datasets[workingDataset]` would keep the OLD rows and
     * the same records would read differently depending on which name a later
     * step used.
     */
    let payload: WorkflowPayload = emptyPayload(1, ["email"]);
    payload = (
      await runIngestCsv(
        await ctxFor("ingest.csv", payload, { fileId: "file_1", datasetName: "src1" }, [
          csvFile("file_1", "email\n  DANA@ACME.EXAMPLE  \n"),
        ])
      )
    ).payload;
    const normalized = (await runNormalizeContactFields(makeContext(payload, {}))).payload;

    expect(normalized.workingDataset).toBe("src1");
    expect(normalized.rows[0].fields.email).toBe("dana@acme.example");
    expect(normalized.datasets?.src1?.[0].fields.email).toBe("dana@acme.example");
    // The two names now agree, which is the whole point.
    expect(JSON.stringify(normalized.datasets?.src1)).toBe(JSON.stringify(normalized.rows));
  });

  it("split.exceptions keeps the same invariant", async () => {
    let payload: WorkflowPayload = emptyPayload(2, ["company"]);
    payload = (
      await runIngestCsv(
        await ctxFor("ingest.csv", payload, { fileId: "file_1", datasetName: "src1" }, [
          csvFile("file_1", FILE_A),
        ])
      )
    ).payload;
    const split = (await runSplitExceptions(makeContext(payload, {}))).payload;
    expect(split.workingDataset).toBe("src1");
    expect(JSON.stringify(split.datasets?.src1)).toBe(JSON.stringify(split.rows));
  });

  it("concat's own output is named, so the step after it is unambiguous", async () => {
    const payload = await ingestTwo("src1", "src2");
    const out = await runDataConcat(
      await ctxFor("data.concat", payload, { datasets: ["src1", "src2"], into: "combined" })
    );
    expect(out.payload.workingDataset).toBe("combined");
    expect(out.payload.datasets?.combined).toHaveLength(3);
    expect(out.payload.rows).toHaveLength(3);
    // And the two sources survive untouched beside it.
    expect(out.payload.datasets?.src1).toHaveLength(2);
    expect(out.payload.datasets?.src2).toHaveLength(1);
  });
});
