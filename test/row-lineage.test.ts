import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import {
  runBuildCsvV2,
  runDataDedupe,
  runDataFilter,
  runDataJoin,
  runDataNormalize,
  runDataSchemaMap,
  runIngestCsv,
} from "@/lib/ai-work-engine/primitives/files";
import {
  emptyPayload,
  type ArtifactSpec,
  type InvocationRecord,
  type PrimitiveContext,
  type RowException,
  type WorkflowPayload,
  type WorkflowRow,
} from "@/lib/ai-work-engine/primitives/types";

/**
 * ROW LINEAGE: THE REGRESSION SUITE FOR THE BUG THAT DELIVERED EVERY FLAGGED
 * RECORD TWICE, AND FOR THE THREE FIXES THAT WERE WORSE THAN THE BUG.
 *
 * `applyOutcome` used to write `[...outcome.rows, ...outcome.exceptions]` while
 * several transforms put the SAME logical record in both lists. The client
 * received each flagged record twice, and a deduplication mandate delivered
 * each near-duplicate candidate twice, which is the worst possible mandate for
 * that to happen in.
 *
 * Every heuristic tried against it was a matcher, and every one was wrong:
 *
 *   unitKey            several legitimate rows share one, so three distinct
 *                      records collapsed into one. Silent client data loss,
 *                      which is worse than the duplication it repaired.
 *   object identity    schema_map and normalize build NEW objects for the same
 *                      logical record, so the match silently stops matching the
 *                      moment a transform runs between the flag and the write.
 *   value equality     two distinct entries are allowed to be identical.
 *
 * The fix is the data model: a row carries `rowId`, an exception REFERENCES one
 * and carries no data of its own. So this file asserts the model rather than
 * the symptom. Scenario 2 is the unitKey heuristic's grave, scenario 3 is
 * identity's, scenario 4 is value equality's, and each of them fails on the
 * heuristic it names even when the delivered row count happens to look right.
 *
 * The helper shape below is deliberately the one in file-data-foundation.test.ts
 * rather than an import of it: importing a test module would re-run its twelve
 * scenarios inside this file. Two copies of thirty lines is the cheaper cost,
 * and the two suites are meant to read as one codebase.
 *
 * NO DATABASE AND NO NETWORK: every capability exercised here is `local`.
 */

/* ──────────────────────────── the fake runner ───────────────────────────── */

const utf8 = (text: string) => Buffer.from(text, "utf8");

/**
 * A file as src/server/workflow-runs.ts presents one: the id and the sha256
 * frozen onto the acceptance snapshot, and a `read()` that is the only way to
 * the bytes. The fileId matters more here than anywhere else in the test suite,
 * because it LEADS every rowId this file asserts on.
 */
function frozenFile(fileId: string, fileName: string, body: Buffer) {
  return {
    fileId,
    fileName,
    sizeBytes: body.byteLength,
    sha256: createHash("sha256").update(body).digest("hex"),
    read: async () => body,
  };
}

type StubFile = ReturnType<typeof frozenFile>;

type Harness = {
  ctx: PrimitiveContext;
  artifacts: ArtifactSpec[];
  invocations: InvocationRecord[];
};

function makeContext(
  primitiveId: string,
  rawParams: Record<string, unknown>,
  over: { input?: WorkflowPayload; files?: StubFile[]; attempt?: number } = {}
): Harness {
  const artifacts: ArtifactSpec[] = [];
  const invocations: InvocationRecord[] = [];

  // The same parser the compiler uses. A primitive can never be reached with
  // anything else, so hand-rolling a params object would exercise a state the
  // runner cannot produce.
  const params = parsePrimitiveParams(primitiveId, rawParams);
  if (params === null) {
    throw new Error(`the test's own params for ${primitiveId} do not satisfy its schema`);
  }

  const ctx: PrimitiveContext = {
    taskId: "task_lineage",
    runId: "run_lineage",
    stepRunId: `step_${primitiveId}`,
    snapshotId: "snapshot_lineage",
    order: 1,
    attempt: over.attempt ?? 1,
    brief: {
      title: "Clean the supplier list",
      description: "One file, one clean list back.",
      quantity: null,
      objective: "clean_list",
      geography: [],
      requiredFields: [],
      quantityInterpreted: null,
    },
    input: over.input ?? emptyPayload(0, []),
    params,
    inputFiles: over.files ?? [],
    costCeilingMicros: 0n,
    recordInvocation: async (record) => {
      invocations.push(record);
    },
    writeArtifact: async (spec) => {
      artifacts.push(spec);
      return { fileId: `artifact_${artifacts.length}` };
    },
  };

  return { ctx, artifacts, invocations };
}

/* ─────────────────────────── lineage-side helpers ───────────────────────── */

/**
 * The rowId of a row that must have one.
 *
 * Every row in this file descends from an ingestion inside the same test, so a
 * missing id is a lineage defect and not a payload written before this phase.
 * Read as `undefined` it would silently equal the next `undefined`, and an
 * assertion comparing two absences passes while proving nothing.
 */
function lineage(row: WorkflowRow): string {
  if (row.rowId === undefined) {
    throw new Error(
      `a row ingested in this run carries no rowId (unitKey "${row.unitKey}"), so its lineage cannot be asserted`
    );
  }
  return row.rowId;
}

const lineageOf = (rows: WorkflowRow[]): string[] => rows.map(lineage);

const exceptionsOf = (payload: WorkflowPayload): RowException[] => payload.exceptions ?? [];

/** The ingested id for a CSV: the sheet part is empty and the index is 0-based. */
const csvRowId = (fileId: string, dataRowIndex: number) => `${fileId}##${dataRowIndex}`;

/**
 * One line of the artifact, split on the escaping build.csv writes. Needed
 * because a review column carries a sentence with commas in it, and splitting
 * on "," would report a column count that has nothing to do with the file.
 *
 * The fixtures below hold no embedded newline, so splitting the body on "\n"
 * before calling this is sound for them and only for them.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') {
        cell += ch;
      } else if (line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

function artifactLines(artifact: ArtifactSpec): string[] {
  return artifact.body.toString("utf8").trimEnd().split("\n");
}

/**
 * The column a builder fills by joining exceptions onto rows, found by name
 * rather than by position: which columns precede it depends on the client's
 * own file, and hardcoding an index would make this suite depend on the
 * fixture instead of on the contract.
 */
function reviewColumnIndex(header: string[]): number {
  const index = header.findIndex((h) => /review/i.test(h));
  if (index === -1) {
    throw new Error(
      `the artifact has no review column, so an exception has nowhere to be visible (header: ${header.join(" | ")})`
    );
  }
  return index;
}

/* ═══════ 1. a row that is both delivered and flagged ships exactly once ═══ */

describe("1. a row that is also the subject of an exception is delivered once", () => {
  /**
   * Two client rows and one column nobody mapped. Under `unmapped: "exception"`
   * schema_map carries "Notes" through AND raises an exception per row, which
   * is precisely the shape that used to double the deliverable.
   */
  const CSV = "Company Name,Notes\nClinique Nord,call after 4\nGarage Central,ferme lundi\n";

  async function mapAndBuild() {
    const file = frozenFile("f_once", "companies.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "Company Name" },
      { files: [file] }
    );
    const ingested = await runIngestCsv(ingest.ctx);

    const map = makeContext(
      "data.schema_map",
      { mapping: [{ from: "Company Name", to: "company" }] },
      { input: ingested.payload }
    );
    const mapped = await runDataSchemaMap(map.ctx);

    const build = makeContext("build.csv", {}, { input: mapped.payload });
    const built = await runBuildCsvV2(build.ctx);
    return { ingested, mapped, built, artifacts: build.artifacts };
  }

  it("the artifact holds one line per client row, header included", async () => {
    const run = await mapAndBuild();

    // The working set is the client's rows and nothing else. An exception is
    // metadata ABOUT a row, so it can never add one.
    expect(run.mapped.payload.rows).toHaveLength(2);
    expect(lineageOf(run.mapped.payload.rows)).toEqual([
      csvRowId("f_once", 0),
      csvRowId("f_once", 1),
    ]);

    const lines = artifactLines(run.artifacts[0]);
    expect(lines).toHaveLength(3);
    // Stated as a count of the client's own rows rather than as the literal 3,
    // so the assertion says what it means: no client row was doubled.
    expect(lines.length - 1).toBe(run.ingested.payload.rows.length);
  });

  it("the exception is still visible in the artifact's review column", async () => {
    /**
     * The companion that makes the count above meaningful. Delivering each row
     * once is trivially achievable by dropping the exceptions, and that would
     * be a worse bug than the duplication: the person finishing the mandate
     * would ship two rows carrying a column nobody could place, with nothing
     * anywhere saying so.
     */
    const run = await mapAndBuild();
    const lines = artifactLines(run.artifacts[0]);
    const header = splitCsvLine(lines[0]);
    const review = reviewColumnIndex(header);

    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      expect(cells[review]).not.toBe("");
      // The unmapped column is NAMED. An exception may name a column and
      // another row's id; it may never carry a cell's contents, because it
      // travels into operator tooling that is not scoped to hold the file.
      expect(cells[review]).toContain("Notes");
      expect(cells[review]).not.toContain("call after 4");
      expect(cells[review]).not.toContain("ferme lundi");
    }
    // The value itself still ships, under its own column: carrying it through
    // is what makes the exception a decision rather than a deletion.
    expect(run.artifacts[0].body.toString("utf8")).toContain("call after 4");
  });

  it("the exceptions reference the delivered rows by lineage, not by copy", async () => {
    const run = await mapAndBuild();
    const exceptions = exceptionsOf(run.mapped.payload);

    expect(exceptions).toHaveLength(2);
    expect(exceptions.map((e) => e.rowId)).toEqual(lineageOf(run.mapped.payload.rows));
    for (const exception of exceptions) {
      expect(exception.code).toBe("UNMAPPED_COLUMN");
      expect(exception.field).toBe("Notes");
      // An exception is not a row: it has no fields of its own to deliver.
      expect(Object.hasOwn(exception, "fields")).toBe(false);
    }
  });
});

/* ══════ 2. three distinct rows may share one unitKey and all survive ══════ */

describe("2. three rows sharing a unitKey all survive every transform", () => {
  /**
   * THE GRAVE OF THE unitKey HEURISTIC.
   *
   * Three genuinely different suppliers at one company. `unitKey` is the
   * client's own identity for the unit and is not unique by design, so a
   * deduplication keyed on it deleted two of these three and reported success.
   */
  const CSV =
    "email,company\n" +
    "a@x.ca,Clinique Nord\n" +
    "b@x.ca,Clinique Nord\n" +
    "c@x.ca,Clinique Nord\n";

  it("three in, three out, with three distinct rowIds", async () => {
    const file = frozenFile("f_shared", "suppliers.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "company" },
      { files: [file] }
    );
    const ingested = await runIngestCsv(ingest.ctx);

    // The premise: one unitKey, three records. If this ever stops holding the
    // rest of the test proves nothing.
    expect(new Set(ingested.payload.rows.map((r) => r.unitKey)).size).toBe(1);
    const ids = lineageOf(ingested.payload.rows);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([
      csvRowId("f_shared", 0),
      csvRowId("f_shared", 1),
      csvRowId("f_shared", 2),
    ]);

    const normalize = makeContext(
      "data.normalize",
      { rules: [{ field: "email", as: "lower" }] },
      { input: ingested.payload }
    );
    const normalized = await runDataNormalize(normalize.ctx);
    expect(lineageOf(normalized.payload.rows)).toEqual(ids);

    const map = makeContext(
      "data.schema_map",
      {
        mapping: [
          { from: "email", to: "contact_email" },
          { from: "company", to: "company_name" },
        ],
      },
      { input: normalized.payload }
    );
    const mapped = await runDataSchemaMap(map.ctx);
    expect(lineageOf(mapped.payload.rows)).toEqual(ids);

    const dedupe = makeContext(
      "data.dedupe",
      { keyFields: ["contact_email"] },
      { input: mapped.payload }
    );
    const deduped = await runDataDedupe(dedupe.ctx);
    expect(lineageOf(deduped.payload.rows)).toEqual(ids);
    expect(deduped.summary).toMatchObject({ rowsIn: 3, exactMerged: 0 });

    const build = makeContext("build.csv", {}, { input: deduped.payload });
    await runBuildCsvV2(build.ctx);
    const lines = artifactLines(build.artifacts[0]);
    expect(lines).toHaveLength(4);
    // Each supplier is in the file exactly once, by their own value.
    for (const email of ["a@x.ca", "b@x.ca", "c@x.ca"]) {
      expect(lines.filter((l) => l.includes(email))).toHaveLength(1);
    }
  });
});

/* ════════ 3. a rewritten row is the same logical row, new object ═════════ */

describe("3. schema_map clones the row objects and the lineage survives", () => {
  const CSV = "Company Name,Tel.\nClinique Nord,4165551234\nGarage Central,8195550000\n";

  it("the rowIds are equal while the objects are not the same references", async () => {
    /**
     * THE GRAVE OF THE OBJECT-IDENTITY HEURISTIC. Nothing in this file mutates
     * an input row, because a step is replayed on its predecessor's payload, so
     * every transform hands back new objects for the same logical records. An
     * identity match is therefore a match on "did anything run in between",
     * which is not a question anybody wanted answered.
     */
    const file = frozenFile("f_clone", "companies.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "Company Name" },
      { files: [file] }
    );
    const ingested = await runIngestCsv(ingest.ctx);

    const map = makeContext(
      "data.schema_map",
      {
        mapping: [
          { from: "Company Name", to: "company" },
          { from: "Tel.", to: "phone" },
        ],
      },
      { input: ingested.payload }
    );
    const mapped = await runDataSchemaMap(map.ctx);

    const before = ingested.payload.rows;
    const after = mapped.payload.rows;
    expect(lineageOf(after)).toEqual(lineageOf(before));

    for (let i = 0; i < before.length; i++) {
      expect(Object.is(after[i], before[i])).toBe(false);
      expect(Object.is(after[i].fields, before[i].fields)).toBe(false);
    }

    // Non-vacuity: the step really did reshape the record, so "same id, new
    // object" is a statement about a rewrite and not about a no-op.
    expect(Object.keys(before[0].fields)).toEqual(["Company Name", "Tel."]);
    expect(Object.keys(after[0].fields)).toEqual(["company", "phone"]);
    expect(after[0].fields.company).toBe("Clinique Nord");
  });
});

/* ═════ 4. identical values are not the same row, and are not merged ══════ */

describe("4. two rows with identical values but distinct rowIds are never merged", () => {
  /**
   * THE GRAVE OF VALUE EQUALITY. A client's file is allowed to hold the same
   * line twice on purpose: two invoices for the same amount on the same day,
   * two seats on the same order. Collapsing them because they serialise the
   * same is a decision nobody asked for, made in the one place the client
   * cannot check.
   */
  const CSV =
    "email,company\n" + "owner@clinic.ca,Clinique Nord\n" + "owner@clinic.ca,Clinique Nord\n";

  async function ingested() {
    const file = frozenFile("f_twins", "entries.csv", utf8(CSV));
    const harness = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "email" },
      { files: [file] }
    );
    return (await runIngestCsv(harness.ctx)).payload;
  }

  it("survives normalisation, mapping and filtering as two rows", async () => {
    const input = await ingested();
    expect(input.rows).toHaveLength(2);
    // Same values, same unitKey, different lineage. That is the whole premise.
    expect(input.rows[0].fields).toEqual(input.rows[1].fields);
    expect(input.rows[0].unitKey).toBe(input.rows[1].unitKey);
    const ids = lineageOf(input.rows);
    expect(ids).toEqual([csvRowId("f_twins", 0), csvRowId("f_twins", 1)]);

    const normalize = makeContext(
      "data.normalize",
      { rules: [{ field: "company", as: "trim" }] },
      { input }
    );
    const normalized = await runDataNormalize(normalize.ctx);
    expect(lineageOf(normalized.payload.rows)).toEqual(ids);

    const map = makeContext(
      "data.schema_map",
      {
        mapping: [
          { from: "email", to: "contact_email" },
          { from: "company", to: "company_name" },
        ],
      },
      { input: normalized.payload }
    );
    const mapped = await runDataSchemaMap(map.ctx);
    expect(lineageOf(mapped.payload.rows)).toEqual(ids);

    const filter = makeContext(
      "data.filter",
      { conditions: [{ field: "contact_email", op: "not_empty" }] },
      { input: mapped.payload }
    );
    const filtered = await runDataFilter(filter.ctx);
    expect(lineageOf(filtered.payload.rows)).toEqual(ids);

    const build = makeContext("build.csv", {}, { input: filtered.payload });
    await runBuildCsvV2(build.ctx);
    expect(artifactLines(build.artifacts[0])).toHaveLength(3);
  });

  it("and is merged by an explicit dedupe on a declared key, which is the only path", async () => {
    /**
     * The falsifiability companion. The two rows above are not un-mergeable;
     * they are un-mergeable BY ACCIDENT. An operator who wrote down "these are
     * duplicates when the email matches" gets exactly what they asked for.
     */
    const input = await ingested();
    const dedupe = makeContext("data.dedupe", { keyFields: ["email"] }, { input });
    const out = await runDataDedupe(dedupe.ctx);

    expect(out.payload.rows).toHaveLength(1);
    expect(out.summary).toMatchObject({ rowsIn: 2, exactMerged: 1 });
    // The survivor keeps its own lineage rather than acquiring a merged one:
    // the delivered record IS the first row, and that is traceable.
    expect(lineage(out.payload.rows[0])).toBe(csvRowId("f_twins", 0));
  });
});

/* ═══════════════ 5. a replay is identical, ids and bytes ═════════════════ */

describe("5. replaying the same bytes produces the same ids and the same artifact", () => {
  const CSV =
    "email,company\n" +
    "owner@clinic.ca,Clinique Nord\n" +
    "OWNER@CLINIC.CA,Saisie en double\n" +
    "garage@central.ca,Garage Central\n";

  async function chain(attempt: number) {
    const file = frozenFile("f_replay", "suppliers.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "email" },
      { files: [file], attempt }
    );
    const ingested = await runIngestCsv(ingest.ctx);

    const normalize = makeContext(
      "data.normalize",
      { rules: [{ field: "email", as: "lower" }] },
      { input: ingested.payload, attempt }
    );
    const normalized = await runDataNormalize(normalize.ctx);

    const dedupe = makeContext(
      "data.dedupe",
      { keyFields: ["email"] },
      { input: normalized.payload, attempt }
    );
    const deduped = await runDataDedupe(dedupe.ctx);

    const build = makeContext("build.csv", {}, { input: deduped.payload, attempt });
    await runBuildCsvV2(build.ctx);
    return { ingested, deduped, artifacts: build.artifacts };
  }

  it("the second attempt lands on the same lineage and the same bytes", async () => {
    /**
     * A step reclaimed after a lease expiry re-runs in full, and the attempt
     * number is the only thing that differs between the two runs. A rowId
     * minted from a counter or a clock would pass every other test in this file
     * and fail exactly here, which is why the id is a function of the frozen
     * fileId and the row's position in the file.
     */
    const first = await chain(1);
    const second = await chain(2);

    expect(lineageOf(second.ingested.payload.rows)).toEqual(
      lineageOf(first.ingested.payload.rows)
    );
    expect(lineageOf(second.deduped.payload.rows)).toEqual(lineageOf(first.deduped.payload.rows));
    expect(second.deduped.payload).toStrictEqual(first.deduped.payload);

    expect(second.artifacts[0].body.equals(first.artifacts[0].body)).toBe(true);
    // Not vacuous: the run really did produce a file, and really did merge the
    // case-folded duplicate, so there was something for the replay to differ on.
    expect(first.artifacts[0].body.byteLength).toBeGreaterThan(0);
    expect(lineageOf(first.deduped.payload.rows)).toEqual([
      csvRowId("f_replay", 0),
      csvRowId("f_replay", 2),
    ]);
  });
});

/* ════════════ 6. two files cannot collide, and a join is traceable ═══════ */

describe("6. rows from two different files carry disjoint ids, and a join derives from both", () => {
  async function joined() {
    const left = frozenFile(
      "f_left",
      "companies.csv",
      utf8("id,company\n1,Clinique Nord\n2,Garage Central\n3,Depanneur Est\n")
    );
    const right = frozenFile(
      "f_right",
      "phones.csv",
      utf8("id,phone\n1,4165551234\n3,8195550000\n")
    );

    const first = makeContext(
      "ingest.csv",
      { fileId: left.fileId, datasetName: "companies", keyColumn: "id" },
      { files: [left, right] }
    );
    const afterLeft = await runIngestCsv(first.ctx);

    // The second ingestion reads the first one's payload: the runner hands a
    // step its predecessor's output and nothing else.
    const second = makeContext(
      "ingest.csv",
      { fileId: right.fileId, datasetName: "phones", keyColumn: "id" },
      { files: [left, right], input: afterLeft.payload }
    );
    const afterRight = await runIngestCsv(second.ctx);

    const step = makeContext(
      "data.join",
      { left: "companies", right: "phones", leftKey: "id", rightKey: "id", into: "joined" },
      { input: afterRight.payload }
    );
    return { payload: (await runDataJoin(step.ctx)).payload };
  }

  it("no id from one file is an id from the other", async () => {
    const out = await joined();
    const companies = lineageOf(out.payload.datasets?.companies ?? []);
    const phones = lineageOf(out.payload.datasets?.phones ?? []);

    expect(companies).toHaveLength(3);
    expect(phones).toHaveLength(2);
    // The fileId LEADS the id, which is what makes a multi-file mandate safe:
    // row 0 of one file and row 0 of another are not the same record.
    const intersection = companies.filter((id) => phones.includes(id));
    expect(intersection).toEqual([]);
    expect(companies).toEqual([
      csvRowId("f_left", 0),
      csvRowId("f_left", 1),
      csvRowId("f_left", 2),
    ]);
    expect(phones).toEqual([csvRowId("f_right", 0), csvRowId("f_right", 1)]);
  });

  it("a joined row's id names both parents, and an unmatched row keeps its own", async () => {
    const out = await joined();
    const rows = out.payload.datasets?.joined ?? [];
    expect(rows.map((r) => r.unitKey)).toEqual(["1", "2", "3"]);

    /**
     * A join genuinely CREATES a row: it is one record made of two, and neither
     * parent's id can stand for it. The id is minted from both, deterministically
     * and readably, so an operator holding the delivered row can walk back to
     * the two lines it came from. A hash would be deterministic too and would
     * not be traceable, which is half the point.
     */
    const pairs: [number, string, string][] = [
      [0, csvRowId("f_left", 0), csvRowId("f_right", 0)],
      [2, csvRowId("f_left", 2), csvRowId("f_right", 1)],
    ];
    for (const [index, leftId, rightId] of pairs) {
      const id = lineage(rows[index]);
      expect(id).toContain(leftId);
      expect(id).toContain(rightId);
      expect(id).not.toBe(leftId);
      expect(id).not.toBe(rightId);
    }

    // The unmatched left row was padded, not created: same logical record, new
    // shape, so it keeps the id it arrived with.
    expect(rows[1].fields.phone).toBeNull();
    expect(lineage(rows[1])).toBe(csvRowId("f_left", 1));

    // And no derived id collides with an ingested one.
    const ingestedIds = new Set([
      ...lineageOf(out.payload.datasets?.companies ?? []),
      ...lineageOf(out.payload.datasets?.phones ?? []),
    ]);
    expect(lineageOf(rows).filter((id) => ingestedIds.has(id))).toEqual([
      csvRowId("f_left", 1),
    ]);
  });
});

/* ═════════ 7. an ambiguous pair is reported, by id, and never merged ═════ */

describe("7. an ambiguous duplicate is reported against exactly the pair's rowIds", () => {
  const CSV =
    "email,company\n" +
    "a@x.ca,Clinique Dentaire Belanger\n" +
    "b@x.ca,Clinique Dentaire Belangier\n" +
    "c@x.ca,Garage Central\n";

  async function scanned() {
    const file = frozenFile("f_near", "clients.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "email" },
      { files: [file] }
    );
    const ingested = await runIngestCsv(ingest.ctx);

    const dedupe = makeContext(
      "data.dedupe",
      {
        keyFields: ["email"],
        reportNearDuplicates: { fields: ["company"], threshold: 0.85, maxPairs: 500 },
      },
      { input: ingested.payload }
    );
    return runDataDedupe(dedupe.ctx);
  }

  it("nothing is merged and the row count does not move", async () => {
    const out = await scanned();
    expect(out.summary).toMatchObject({ rowsIn: 3, exactMerged: 0, candidatePairs: 1 });
    expect(lineageOf(out.payload.rows)).toEqual([
      csvRowId("f_near", 0),
      csvRowId("f_near", 1),
      csvRowId("f_near", 2),
    ]);
    // This is the mandate the duplication bug was worst in: a deduplication
    // that delivers each candidate twice is unusable.
    expect(out.payload.rows.filter((r) => r.unitKey === "a@x.ca")).toHaveLength(1);
    expect(out.payload.rows.filter((r) => r.unitKey === "b@x.ca")).toHaveLength(1);
  });

  it("the exceptions name the two members of the pair, and no other row", async () => {
    const out = await scanned();
    const ambiguous = exceptionsOf(out.payload).filter((e) => e.code === "AMBIGUOUS_DUPLICATE");

    const first = csvRowId("f_near", 0);
    const second = csvRowId("f_near", 1);
    const unrelated = csvRowId("f_near", 2);

    /**
     * Every row this pair's exceptions REACH, whether as the subject or as the
     * partner named in the sentence a person will read. Counted this way rather
     * than as "two exceptions, one per member" because both shapes are
     * defensible (one entry per involved row, or one per pair naming the other
     * side) and neither is the property under test. The property is that the
     * report covers the pair and stops there.
     */
    expect(ambiguous.length).toBeGreaterThanOrEqual(1);
    const referenced = new Set<string>();
    for (const exception of ambiguous) {
      referenced.add(exception.rowId);
      for (const id of [first, second, unrelated]) {
        if (exception.detail.includes(id)) referenced.add(id);
      }
    }
    expect([...referenced].sort()).toEqual([first, second].sort());

    // The unrelated record is not dragged into anybody's queue, by any code.
    expect(exceptionsOf(out.payload).some((e) => e.rowId === unrelated)).toBe(false);
  });

  it("produces no exception at all when the scan was not asked for", async () => {
    // Falsifiability companion: the exceptions above come from the
    // near-duplicate scan and from nothing else.
    const file = frozenFile("f_near", "clients.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "email" },
      { files: [file] }
    );
    const ingested = await runIngestCsv(ingest.ctx);
    const dedupe = makeContext("data.dedupe", { keyFields: ["email"] }, { input: ingested.payload });
    const out = await runDataDedupe(dedupe.ctx);

    expect(exceptionsOf(out.payload)).toEqual([]);
    expect(out.payload.rows).toHaveLength(3);
  });
});
