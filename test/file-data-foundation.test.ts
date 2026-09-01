import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODEC_LIMITS } from "@/lib/ai-work-engine/codecs/table";
import { buildXlsx, parseXlsx } from "@/lib/ai-work-engine/codecs/xlsx";
import { classifyMandateData } from "@/lib/ai-work-engine/data-class";
import { inspectedFile } from "@/../test/support/inspection";
import { inspectFile } from "@/lib/ai-work-engine/file-inspection";
import { compileDecisions, HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import {
  allInInternalCostMicros,
  machineContributionBps,
  machineContribution,
  preferMeasured,
  type MandateEffort,
} from "@/lib/ai-work-engine/machine-contribution";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import {
  FILE_READING_PRIMITIVE_IDS,
  PLAN_PRIMITIVE_IDS,
  PLAN_PRIMITIVE_REACH,
} from "@/lib/ai-work-engine/primitive-vocabulary";
import {
  runBuildCsvV2,
  runBuildXlsx,
  runDataDedupe,
  runDataJoin,
  runDataNormalize,
  runDataSchemaMap,
  runIngestCsv,
  runIngestXlsx,
} from "@/lib/ai-work-engine/primitives/files";
import {
  emptyPayload,
  type ArtifactSpec,
  type InvocationRecord,
  type PrimitiveContext,
  type PrimitiveResult,
  type WorkflowPayload,
} from "@/lib/ai-work-engine/primitives/types";

/**
 * THE 1E-alpha FOUNDATION, DRIVEN END TO END.
 *
 * codecs.test.ts proves the readers and writers; transforms.test.ts proves the
 * decisions; capability-substrate.test.ts proves the tables agree. None of them
 * ever builds a payload, and none of them ever sees an artifact. This file is
 * the join: a real buffer goes into a real primitive through a real
 * PrimitiveContext, and what comes out the other end is asserted as bytes.
 *
 * The twelve scenarios below are the acceptance list for the phase, in order,
 * one describe per line of it. They are written from the failure side wherever
 * a failure exists, because the deliverable that is silently wrong is the only
 * outcome this phase cannot survive, and every assertion has a companion that
 * would break if the behaviour under test were deleted.
 *
 * NO DATABASE AND NO NETWORK. The context is built by hand, which is possible
 * precisely because every capability added in this phase is `local`: a
 * primitive that needed a provider could not be tested this way at all, and
 * scenario 7 asserts that none of them can.
 */

/* ──────────────────────────── the fake runner ───────────────────────────── */

const utf8 = (text: string) => Buffer.from(text, "utf8");

/**
 * A file exactly as src/server/workflow-runs.ts presents one: an id, a name, a
 * size, the sha256 frozen onto the acceptance snapshot, and a `read()` that is
 * the ONLY way to the bytes.
 *
 * The hash is computed rather than stubbed because `read()` is where the runner
 * re-checks it, so a test that wants "the file moved" supplies a `read()` that
 * rejects (see `replacedFile`) rather than a mismatched string nobody consults.
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

/**
 * The same file after the bytes underneath it moved. The message is verbatim
 * the one the runner throws, because what is being tested is that a primitive
 * PROPAGATES it rather than turning it into a refusal of its own, and a
 * paraphrase would pass a test the real string would fail.
 */
function replacedFile(fileId: string, fileName: string) {
  return {
    fileId,
    fileName,
    sizeBytes: 0,
    sha256: "0".repeat(64),
    read: async (): Promise<Buffer> => {
      throw new Error(
        `accepted input file ${fileId} no longer matches the hash frozen at acceptance`
      );
    },
  };
}

type StubFile = ReturnType<typeof frozenFile>;

type Harness = {
  ctx: PrimitiveContext;
  /** Every artifact the step wrote, in the order it wrote them. */
  artifacts: ArtifactSpec[];
  /** Every external call the step recorded. For a local capability: none. */
  invocations: InvocationRecord[];
};

function makeContext(
  primitiveId: string,
  rawParams: Record<string, unknown>,
  over: { input?: WorkflowPayload; files?: StubFile[]; attempt?: number } = {}
): Harness {
  const artifacts: ArtifactSpec[] = [];
  const invocations: InvocationRecord[] = [];

  /**
   * Params go through the SAME parser the compiler uses. A primitive can never
   * be reached with anything else — a step whose params do not parse is
   * compiled to human work — so hand-rolling a params object here would
   * exercise a state the runner cannot produce, and would hide a schema that
   * had drifted away from what these tests assume.
   */
  const params = parsePrimitiveParams(primitiveId, rawParams);
  if (params === null) {
    throw new Error(`the test's own params for ${primitiveId} do not satisfy its schema`);
  }

  const ctx: PrimitiveContext = {
    taskId: "task_1e",
    runId: "run_1e",
    stepRunId: `step_${primitiveId}`,
    snapshotId: "snapshot_1e",
    order: 1,
    attempt: over.attempt ?? 1,
    brief: {
      title: "Deduplicate the supplier list",
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
    // ZERO MEANS "MAY NOT SPEND". Every capability here is local, so a step
    // that consulted this at all would be a step doing something it should not.
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

/** The Error a primitive threw. Fails loudly when it did not throw at all. */
async function refusalFrom(run: Promise<PrimitiveResult>): Promise<Error> {
  try {
    await run;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error("a primitive rejected with something that is not an Error");
  }
  throw new Error("expected the primitive to refuse, but it returned a result");
}

/** The one chain three scenarios need: ingest.csv, data.dedupe, build.csv. */
async function ingestDedupeBuild(csv: string, attempt: number) {
  const file = frozenFile("f_suppliers", "suppliers.csv", utf8(csv));

  const ingest = makeContext(
    "ingest.csv",
    { fileId: file.fileId, keyColumn: "email" },
    { files: [file], attempt }
  );
  const ingested = await runIngestCsv(ingest.ctx);

  const dedupe = makeContext(
    "data.dedupe",
    { keyFields: ["email"] },
    { input: ingested.payload, attempt }
  );
  const deduped = await runDataDedupe(dedupe.ctx);

  const build = makeContext("build.csv", {}, { input: deduped.payload, attempt });
  const built = await runBuildCsvV2(build.ctx);

  return {
    ingested,
    deduped,
    built,
    artifacts: build.artifacts,
    invocations: [...ingest.invocations, ...dedupe.invocations, ...build.invocations],
  };
}

/**
 * Two rows share an email under case folding; the third does not. The company
 * values are deliberately unrelated strings rather than "X" and "X copy", so
 * that asserting the loser's value is ABSENT cannot pass on a substring of the
 * survivor's.
 */
const SUPPLIERS_CSV =
  "email,company\n" +
  "owner@clinic.ca,Clinique Nord\n" +
  "OWNER@CLINIC.CA,Saisie en double\n" +
  "garage@central.ca,Garage Central\n";

/* ══════════════════════ 1. CSV deduplication, end to end ═════════════════ */

describe("1. a CSV is ingested, deduplicated and written, and build.csv@2 writes two shapes", () => {
  it("the artifact holds the survivors and not the duplicate", async () => {
    const run = await ingestDedupeBuild(SUPPLIERS_CSV, 1);

    expect(run.ingested.summary).toMatchObject({ dataset: "main", rows: 3, columns: 2 });
    expect(run.deduped.summary).toMatchObject({ rowsIn: 3, exactMerged: 1, exceptions: 0 });

    expect(run.artifacts).toHaveLength(1);
    const body = run.artifacts[0].body.toString("utf8");
    expect(body).toContain("owner@clinic.ca,Clinique Nord");
    expect(body).toContain("garage@central.ca,Garage Central");
    // The merged row is gone, both by its key and by its own value. Without
    // the dedupe step both of these would still be here.
    expect(body).not.toContain("OWNER@CLINIC.CA");
    expect(body).not.toContain("Saisie en double");
  });

  it("a client-file payload gets no _sources, status or review_reason columns", async () => {
    const run = await ingestDedupeBuild(SUPPLIERS_CSV, 1);
    const [header] = run.artifacts[0].body.toString("utf8").split("\n");

    // The client's own file IS the source, so there is nothing to cite and no
    // verification verdict to report. Three empty columns in the deliverable
    // of every deduplication mandate is what @1 would have written.
    expect(header).toBe("email,company");
    expect(run.built.payload.provenance).toBe("client_file");
  });

  it("a web-research payload still gets every one of them", async () => {
    /**
     * The other half of the version bump, and the half that makes the first
     * one meaningful: if build.csv@2 had simply dropped the columns, this
     * would fail. The research workflow's file is byte-identical to @1.
     */
    const webResearch: WorkflowPayload = {
      rows: [
        {
          unitKey: "clinic-1",
          fields: { email: "owner@clinic.ca" },
          sources: { email: ["https://a.example", "https://b.example"] },
          status: "verified",
          reviewReason: null,
        },
      ],
      unitsTotal: 1,
      requestedFields: ["email"],
    };
    const build = makeContext("build.csv", {}, { input: webResearch });
    await runBuildCsvV2(build.ctx);

    const [header] = build.artifacts[0].body.toString("utf8").split("\n");
    expect(header).toBe("unit_key,email,email_sources,status,review_reason");
  });
});

/* ═══════════════════════════ 2. CSV normalisation ════════════════════════ */

describe("2. normalisation reformats what parses and leaves the rest exactly as written", () => {
  const UNPARSEABLE = "ext. 12 ask for Marie";
  const CSV = `name,phone\nAlpha,4165551234\nBeta,${UNPARSEABLE}\n`;

  it("reformats the value that parses and flags the one that does not", async () => {
    const file = frozenFile("f_contacts", "contacts.csv", utf8(CSV));
    const ingest = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "name" },
      { files: [file] }
    );
    const ingested = await runIngestCsv(ingest.ctx);
    expect(ingested.payload.rows.map((r) => r.fields.phone)).toEqual([
      "4165551234",
      UNPARSEABLE,
    ]);

    const step = makeContext(
      "data.normalize",
      { rules: [{ field: "phone", as: "phone_na" }] },
      { input: ingested.payload }
    );
    const out = await runDataNormalize(step.ctx);

    /**
     * TWO records for two units. An exception describes the state of a unit of
     * work; it does not create a second one. Before the lineage model this
     * read ["Alpha", "Beta", "Beta"], and that third entry reached the
     * delivered CSV.
     */
    expect(out.payload.rows.map((r) => r.unitKey)).toEqual(["Alpha", "Beta"]);
    // The finding survives the deduplication, as a reference rather than a row.
    expect(out.payload.exceptions?.map((e) => e.code)).toEqual(["UNPARSEABLE_VALUE"]);
    expect(out.payload.exceptions?.[0].field).toBe("phone");
    expect(out.payload.exceptions?.[0].rowId).toBe(out.payload.rows[1].rowId);

    expect(out.payload.rows[0].fields.phone).toBe("(416) 555-1234");
    // Byte-for-byte what the client wrote, not collapsed, not blanked, not
    // best-effort parsed. Compared against the source text rather than a
    // literal so the assertion cannot drift away from the fixture.
    expect(out.payload.rows[1].fields.phone).toBe(UNPARSEABLE);
    expect(CSV).toContain(out.payload.rows[1].fields.phone ?? "");

    // Marked in place: the record that could not be parsed is the record that
    // carries the reason, not a copy appended after it.
    expect(out.payload.rows[1].status).toBe("needs_review");
    expect(out.payload.rows[1].reviewReason).toContain("phone");
    // And the one that DID parse is untouched, so the flag means something.
    expect(out.payload.rows[0].reviewReason).toBeNull();
    expect(out.summary).toMatchObject({ rowsIn: 2, valuesChanged: 1, exceptions: 1 });
  });
});

/* ════════════════════════════ 3. Multi-file join ═════════════════════════ */

describe("3. two ingested files join, and both survive in the payload", () => {
  it("reports matched and unmatched, and keeps every dataset it read", async () => {
    const left = frozenFile(
      "f_left",
      "companies.csv",
      utf8("id,company\n1,Clinique Nord\n2,Garage Central\n3,Depanneur Est\n")
    );
    const right = frozenFile("f_right", "phones.csv", utf8("id,phone\n1,4165551234\n3,8195550000\n"));

    const first = makeContext(
      "ingest.csv",
      { fileId: left.fileId, datasetName: "companies", keyColumn: "id" },
      { files: [left, right] }
    );
    const afterLeft = await runIngestCsv(first.ctx);

    // The second ingestion reads the FIRST one's payload, which is the only
    // way a second table reaches a run: the runner hands a step its
    // predecessor's output and nothing else.
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
    const out = await runDataJoin(step.ctx);

    expect(out.summary).toMatchObject({
      leftRows: 3,
      rightRows: 2,
      matched: 2,
      unmatched: 1,
      ambiguous: 0,
      conflicts: 0,
    });

    const joined = out.payload.datasets?.joined ?? [];
    expect(joined.map((r) => r.unitKey)).toEqual(["1", "2", "3"]);
    expect(joined[0].fields.phone).toBe("4165551234");
    // The unmatched row is kept and padded, so the file is rectangular.
    expect(joined[1].fields.phone).toBeNull();

    /**
     * BOTH INPUT SETS ARE STILL THERE. A join that consumed its operands would
     * make a second join, or a compare against the original, impossible for
     * the rest of the run, and nothing downstream would report the loss.
     */
    expect(out.payload.datasets?.companies).toHaveLength(3);
    expect(out.payload.datasets?.phones).toHaveLength(2);
    // Untouched, not merely present: the left set never grew a phone column.
    expect(out.payload.datasets?.companies?.[0].fields).toEqual({
      id: "1",
      company: "Clinique Nord",
    });
  });
});

/* ═══════════════════ 4. XLSX in, explicit mapping, XLSX out ══════════════ */

describe("4. an XLSX is mapped by an explicit mapping and written back as a workbook", () => {
  it("round trips through parseXlsx under the mapped headers", async () => {
    const source = buildXlsx(
      {
        headers: ["Company Name", "Tel.", "Ville"],
        rows: [
          ["Clinique Nord", "4165551234", "Laval"],
          ["Garage Central", "8195550000", "Hull"],
        ],
      },
      { sheetName: "Fournisseurs" }
    );
    const file = frozenFile("f_book", "fournisseurs.xlsx", source);

    const ingest = makeContext(
      "ingest.xlsx",
      { fileId: file.fileId, keyColumn: "Company Name" },
      { files: [file] }
    );
    const ingested = await runIngestXlsx(ingest.ctx);
    expect(ingested.summary).toMatchObject({ rows: 2, columns: 3 });

    const map = makeContext(
      "data.schema_map",
      {
        mapping: [
          { from: "Company Name", to: "company" },
          { from: "Tel.", to: "phone" },
          { from: "Ville", to: "city" },
        ],
        into: "mapped",
      },
      { input: ingested.payload }
    );
    const mapped = await runDataSchemaMap(map.ctx);
    // A mapping that covers every column leaves nothing to decide, so the
    // default `unmapped: "exception"` must produce no exceptions at all. This
    // is the companion that makes scenario 5's exceptions meaningful.
    expect(mapped.summary).toMatchObject({ mappedColumns: 3, unmappedColumns: 0, exceptions: 0 });

    // The dataset is named explicitly rather than left to default to "main".
    // That is not a style choice: see the second entry in "defects reported,
    // not repaired", where the default reads the PRE-mapping rows instead.
    const build = makeContext(
      "build.xlsx",
      { dataset: "mapped", columns: ["company", "phone", "city"], sheetName: "Livrable" },
      { input: mapped.payload }
    );
    await runBuildXlsx(build.ctx);

    const written = parseXlsx(build.artifacts[0].body, { sheet: "Livrable", hasHeaderRow: true });
    if (!written.ok) throw new Error(`expected a workbook, got a refusal: ${written.reason}`);
    expect(written.table.headers).toEqual(["company", "phone", "city"]);
    expect(written.table.rows).toEqual([
      ["Clinique Nord", "4165551234", "Laval"],
      ["Garage Central", "8195550000", "Hull"],
    ]);
    expect(build.artifacts[0].extension).toBe("xlsx");
  });
});

/* ══════════════════════ 5. An ambiguous mapping refuses ══════════════════ */

describe("5. an ambiguous mapping goes to a human", () => {
  const CSV = "Company Name,Notes\nClinique Nord,call after 4\n";

  async function ingested() {
    const file = frozenFile("f_map", "companies.csv", utf8(CSV));
    const harness = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "Company Name" },
      { files: [file] }
    );
    return (await runIngestCsv(harness.ctx)).payload;
  }

  it("carries an unmapped column through and flags it rather than dropping it", async () => {
    const input = await ingested();
    const step = makeContext(
      "data.schema_map",
      { mapping: [{ from: "Company Name", to: "company" }], unmapped: "exception", into: "mapped" },
      { input }
    );
    const out = await runDataSchemaMap(step.ctx);

    expect(out.summary).toMatchObject({ unmappedColumns: 1, exceptions: 1 });
    const rows = out.payload.datasets?.mapped ?? [];
    // Kept under its ORIGINAL name: the value survives and the decision is
    // visible, which is the only combination that loses nothing.
    expect(rows[0].fields).toEqual({ company: "Clinique Nord", Notes: "call after 4" });
    /**
     * ONE input row, ONE output row. The flag lives on that row rather than
     * on a copy appended beside it, which is what the whole lineage model is
     * for: before it, this fixture produced two records for one client
     * record and both reached the delivered file.
     */
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("needs_review");
    expect(rows[0].reviewReason).toContain("Notes");
    // The finding is also reachable as a reference, keyed to that same row.
    const refs = (out.payload.exceptions ?? []).filter((e) => e.code === "UNMAPPED_COLUMN");
    expect(refs).toHaveLength(1);
    expect(refs[0].rowId).toBe(rows[0].rowId);
    expect(refs[0].field).toBe("Notes");
  });

  it("drops it silently only when the operator wrote `drop` down", async () => {
    // The falsifiability companion for the test above: the exception is
    // produced by `unmapped: "exception"` and not by schema_map flagging
    // everything it touches.
    const input = await ingested();
    const step = makeContext(
      "data.schema_map",
      { mapping: [{ from: "Company Name", to: "company" }], unmapped: "drop", into: "mapped" },
      { input }
    );
    const out = await runDataSchemaMap(step.ctx);

    expect(out.summary).toMatchObject({ exceptions: 0 });
    expect((out.payload.datasets?.mapped ?? [])[0].fields).toEqual({ company: "Clinique Nord" });
  });

  it("refuses outright when the mapping names a column this file does not have", async () => {
    const input = await ingested();
    const step = makeContext(
      "data.schema_map",
      {
        mapping: [
          { from: "Company Name", to: "company" },
          { from: "Raison sociale", to: "legal_name" },
        ],
        into: "mapped",
      },
      { input }
    );

    const error = await refusalFrom(runDataSchemaMap(step.ctx));
    // A column of nulls under a header that looks correct is the single
    // hardest defect for a client to notice, so this one throws instead of
    // producing rows: the runner retries, then hands the mandate to a person.
    expect(error.message).toContain("column of nulls");
    // The operator's own words may be quoted; the client's may not.
    expect(error.message).toContain("Raison sociale");
    expect(error.message).not.toContain("call after 4");
  });
});

/* ════════════════════ 6. A fuzzy duplicate is never merged ═══════════════ */

describe("6. a fuzzy duplicate goes to a human, and is never merged", () => {
  const CSV =
    "email,company\n" +
    "a@x.ca,Clinique Dentaire Belanger\n" +
    "b@x.ca,Clinique Dentaire Belangier\n" +
    "c@x.ca,Garage Central\n";

  async function ingested() {
    const file = frozenFile("f_near", "clients.csv", utf8(CSV));
    const harness = makeContext(
      "ingest.csv",
      { fileId: file.fileId, keyColumn: "email" },
      { files: [file] }
    );
    return (await runIngestCsv(harness.ctx)).payload;
  }

  it("reports the candidate pair and leaves both members in the output", async () => {
    const input = await ingested();
    const step = makeContext(
      "data.dedupe",
      {
        keyFields: ["email"],
        reportNearDuplicates: { fields: ["company"], threshold: 0.85, maxPairs: 500 },
      },
      { input }
    );
    const out = await runDataDedupe(step.ctx);

    expect(out.summary).toMatchObject({ rowsIn: 3, exactMerged: 0, candidatePairs: 1 });

    /**
     * THE POINT OF THE FEATURE: the row count did not move, and every input
     * record is present EXACTLY ONCE. Being flagged is a property of a row,
     * not a second row beside it, so the survivors are simply all of them.
     */
    const survivors = out.payload.rows;
    expect(survivors.map((r) => r.unitKey)).toEqual(["a@x.ca", "b@x.ca", "c@x.ca"]);
    expect(survivors[0].fields.company).toBe("Clinique Dentaire Belanger");
    expect(survivors[1].fields.company).toBe("Clinique Dentaire Belangier");

    const flagged = out.payload.rows.filter((r) => r.reviewReason !== null);
    expect(flagged.map((r) => r.unitKey)).toEqual(["a@x.ca", "b@x.ca"]);
    expect(flagged[0].reviewReason).toContain("b@x.ca");
    expect(flagged[0].reviewReason).toContain("Not merged");
    expect(flagged[1].reviewReason).toContain("a@x.ca");
    // The unrelated row is not dragged into somebody's queue.
    expect(flagged.map((r) => r.unitKey)).not.toContain("c@x.ca");
  });

  it("produces no candidates at all when the scan was not asked for", async () => {
    // Falsifiability companion: the exceptions above come from the
    // near-duplicate scan, and switching it off changes nothing else.
    const input = await ingested();
    const step = makeContext("data.dedupe", { keyFields: ["email"] }, { input });
    const out = await runDataDedupe(step.ctx);

    expect(out.summary).toMatchObject({ rowsIn: 3, exactMerged: 0, candidatePairs: 0, exceptions: 0 });
    expect(out.payload.rows.map((r) => r.unitKey)).toEqual(["a@x.ca", "b@x.ca", "c@x.ca"]);
  });
});

/* ═════════════════ 7. A sensitive file reaches no provider ═══════════════ */

describe("7. a sensitive file sends nothing to a provider", () => {
  const plan = [
    {
      planStepId: "s1",
      order: 1,
      title: "Read the file",
      executor: "ai" as const,
      primitiveId: "ingest.csv" as string | null,
      primitiveVersion: 1 as number | null,
      dependsOnOrder: [] as number[],
      params: { fileId: "f_payroll" } as unknown,
    },
    {
      planStepId: "s2",
      order: 2,
      title: "Deduplicate",
      executor: "ai" as const,
      primitiveId: "data.dedupe" as string | null,
      primitiveVersion: 1 as number | null,
      dependsOnOrder: [1] as number[],
      params: { keyFields: ["email"] } as unknown,
    },
    {
      planStepId: "s3",
      order: 3,
      title: "Look it up on the web",
      executor: "ai" as const,
      primitiveId: "research.web_search" as string | null,
      primitiveVersion: 1 as number | null,
      dependsOnOrder: [2] as number[],
      params: {} as unknown,
    },
  ];

  it("a payroll column classifies personal-sensitive and makes every step a person's", () => {
    const verdict = classifyMandateData({
      declaredSensitive: false,
      declaredRequiredAccessCount: 0,
      fileCount: 1,
      inspections: [
        inspectedFile(
          "f_payroll",
          ["employee", "salaire", "email"],
          [["Dana", "52000", "dana@acme.com"]]
        ),
      ],
    });
    expect(verdict.dataClass).toBe("personal_sensitive");

    const compiled = compileDecisions(plan, {
      sensitiveData: false,
      requiredAccessCount: 0,
      dataClass: verdict.dataClass,
    });
    expect(compiled.fullyHuman).toBe(true);
    expect(compiled.automatedStepCount).toBe(0);
    for (const step of compiled.steps) {
      expect(step.executionMode).toBe("human");
      expect(step.handoffReason).toBe(HANDOFF_REASONS.sensitive_data);
      // Params are withheld too: a human step is not handed a machine's
      // configuration to run by hand.
      expect(step.params).toBeNull();
    }
  });

  it("the same plan under the client's ordinary business data does automate", () => {
    /**
     * Without this the test above would pass on a compiler that refused
     * everything. The local steps run; only the provider step is refused, and
     * it is refused by the mixing rule rather than by the class.
     */
    const compiled = compileDecisions(plan, {
      sensitiveData: false,
      requiredAccessCount: 0,
      dataClass: "business_confidential",
    });
    expect(compiled.automatedStepCount).toBe(2);
    expect(compiled.steps[0].executionMode).toBe("automated");
    expect(compiled.steps[1].executionMode).toBe("automated");
    expect(compiled.steps[2].executionMode).toBe("human");
    /**
     * TWO RULES REFUSE THIS STEP AND THE CLASS RULE IS THE ONE THAT REPORTS.
     *
     * `business_confidential` already forbids every provider, so compile.ts
     * never reaches the mixing rule for it; the mixing reason belongs to the
     * case where the class alone would have allowed the provider, which
     * capability-substrate.test.ts covers. Pinning the reason here rather than
     * only the mode is deliberate: it is what an operator reads off the admin
     * console, and a plausible-but-wrong explanation of a refusal is how a
     * correct refusal gets "fixed" by somebody later.
     */
    expect(compiled.steps[2].handoffReason).toBe(HANDOFF_REASONS.data_class_forbids_reach);
  });

  it("no file-reading, data or build capability has anywhere to send data", () => {
    /**
     * The structural half, DERIVED from the vocabulary rather than listed. A
     * hardcoded list only protects the ids somebody remembered to write down;
     * this fails on the day a `data.enrich` is added with a provider reach,
     * which is the only way this guarantee can realistically be lost.
     */
    const localFamilies = PLAN_PRIMITIVE_IDS.filter(
      (id) => id.startsWith("data.") || id.startsWith("build.")
    );
    expect(localFamilies.length).toBeGreaterThanOrEqual(9);
    expect(localFamilies).toContain("build.csv");
    expect(FILE_READING_PRIMITIVE_IDS.length).toBeGreaterThanOrEqual(2);

    for (const id of [...FILE_READING_PRIMITIVE_IDS, ...localFamilies]) {
      expect(PLAN_PRIMITIVE_REACH[id], `${id} must not reach a provider`).toBe("local");
    }
    // Not vacuous: the table does say "provider" for the capabilities that
    // genuinely are one, so "local" is a fact about these ids and not the
    // table's only value.
    expect(PLAN_PRIMITIVE_REACH["research.web_search"]).toBe("provider");
  });

  it("running the whole local chain records no external call whatsoever", async () => {
    const run = await ingestDedupeBuild(SUPPLIERS_CSV, 1);
    // The runtime companion to the table above: nothing in the chain reached
    // for `recordInvocation`, so there was no call to record.
    expect(run.invocations).toHaveLength(0);
  });
});

/* ═══════════════════════ 8. An oversized file refuses ════════════════════ */

describe("8. an oversized file goes to a human", () => {
  const HEADER = "email,company\n";
  const LINE = "owner@clinic.ca,Clinique Nord\n";

  async function ingest(csv: string) {
    const file = frozenFile("f_big", "export.csv", utf8(csv));
    const harness = makeContext("ingest.csv", { fileId: file.fileId }, { files: [file] });
    return runIngestCsv(harness.ctx);
  }

  it("refuses a file over the row ceiling instead of truncating it", async () => {
    const error = await refusalFrom(ingest(HEADER + LINE.repeat(CODEC_LIMITS.maxRows + 1)));

    expect(error.message).toContain(String(CODEC_LIMITS.maxRows));
    /**
     * The refusal travels into step summaries, logs and admin screens that are
     * not scoped to hold a confidential file, so it names counts and never
     * contents. Both of these values are in every one of the 50,001 rows it
     * just walked past.
     */
    expect(error.message).not.toContain("clinic.ca");
    expect(error.message).not.toContain("Clinique Nord");
  });

  it("reads the same file shape when it is under the ceiling", async () => {
    // The bound is what refused, not the content: the identical rows parse.
    const out = await ingest(HEADER + LINE.repeat(2));
    expect(out.summary).toMatchObject({ rows: 2, columns: 2 });
  });
});

/* ══════════════ 9. A file that moved, or was replaced, is caught ═════════ */

describe("9. an accepted file that was modified or replaced is caught", () => {
  it("propagates the hash mismatch rather than swallowing it", async () => {
    /**
     * The runner turns a throw into a retry and then a human handoff, so
     * propagating IS the correct behaviour: the bytes under this contract are
     * not the bytes the client approved, and there is no safe way to continue.
     * A primitive that caught this and carried on would deliver a file the
     * client never accepted.
     */
    const moved = replacedFile("f_moved", "suppliers.csv");
    const harness = makeContext("ingest.csv", { fileId: moved.fileId }, { files: [moved] });

    const error = await refusalFrom(runIngestCsv(harness.ctx));
    expect(error.message).toContain("no longer matches the hash frozen at acceptance");
    expect(error.message).toContain(moved.fileId);
  });

  it("refuses a fileId that is not in the frozen set at all", async () => {
    // The "replaced by a different upload" case: a file uploaded after
    // acceptance is simply not in `inputFiles`, so it cannot be reached.
    const accepted = frozenFile("f_accepted", "suppliers.csv", utf8(SUPPLIERS_CSV));
    const harness = makeContext(
      "ingest.csv",
      { fileId: "f_uploaded_later" },
      { files: [accepted] }
    );

    const error = await refusalFrom(runIngestCsv(harness.ctx));
    expect(error.message).toContain("not among the files frozen on the contract");
  });

  it("reads the file that IS on the contract", async () => {
    // Non-vacuity for both refusals above: the same primitive, the same
    // context shape, an id that was frozen.
    const accepted = frozenFile("f_accepted", "suppliers.csv", utf8(SUPPLIERS_CSV));
    const harness = makeContext(
      "ingest.csv",
      { fileId: accepted.fileId },
      { files: [accepted] }
    );
    const out = await runIngestCsv(harness.ctx);
    expect(out.summary).toMatchObject({ rows: 3 });
  });
});

/* ═════════════════════ 10. A retry replays to the same bytes ═════════════ */

describe("10. a retry and a replay are deterministic", () => {
  it("the same buffer produces the same payload and the same artifact, row order included", async () => {
    /**
     * A step reclaimed after a lease expiry re-runs in full on its
     * predecessor's payload, and the attempt number is the one thing that
     * differs between the two runs. If any of this moved, the artifact written
     * on attempt 2 would differ from attempt 1 for a reason nobody could
     * explain to the client reconciling against it.
     */
    const first = await ingestDedupeBuild(SUPPLIERS_CSV, 1);
    const second = await ingestDedupeBuild(SUPPLIERS_CSV, 2);

    expect(second.ingested.payload).toStrictEqual(first.ingested.payload);
    expect(second.deduped.payload).toStrictEqual(first.deduped.payload);
    expect(second.built.summary).toStrictEqual(first.built.summary);

    // Stated separately from the deep equality above: two payloads holding the
    // same rows in a different order are not equal, but a reader should not
    // have to work that out from a toStrictEqual to know order is covered.
    expect(second.deduped.payload.rows.map((r) => r.unitKey)).toEqual([
      "owner@clinic.ca",
      "garage@central.ca",
    ]);
    expect(first.deduped.payload.rows.map((r) => r.unitKey)).toEqual(
      second.deduped.payload.rows.map((r) => r.unitKey)
    );

    expect(second.artifacts[0].body.equals(first.artifacts[0].body)).toBe(true);
    expect(second.artifacts[0].body.toString("utf8")).toBe(
      "email,company\nowner@clinic.ca,Clinique Nord\ngarage@central.ca,Garage Central\n"
    );
  });
});

/* ════════════════ 11. Machine artifacts are deliverable candidates ═══════ */

describe("11. every machine artifact is a deliverable candidate, and none of them is the client's file", () => {
  it("build.csv, on both provenances, and build.xlsx all declare the same visibility", async () => {
    const clientFile = await ingestDedupeBuild(SUPPLIERS_CSV, 1);

    const webResearch = makeContext(
      "build.csv",
      {},
      {
        input: {
          rows: [
            {
              unitKey: "clinic-1",
              fields: { email: "owner@clinic.ca" },
              sources: {},
              status: "needs_review",
              reviewReason: "needs a second source: email",
            },
          ],
          unitsTotal: 1,
          requestedFields: ["email"],
        },
      }
    );
    await runBuildCsvV2(webResearch.ctx);

    const workbook = makeContext(
      "build.xlsx",
      { sheetName: "Livrable" },
      { input: clientFile.deduped.payload }
    );
    await runBuildXlsx(workbook.ctx);

    const written = [...clientFile.artifacts, ...webResearch.artifacts, ...workbook.artifacts];
    expect(written).toHaveLength(3);
    for (const artifact of written) {
      /**
       * `deliverable_candidate`, never `admin_only` and never
       * `worker_after_claim`. The artifact is what the worker finishes and
       * delivers; it reaches the client only by becoming a QC-approved
       * delivery. A machine output that landed on `admin_only` would be
       * invisible to the person who has to finish it, and one that widened the
       * other way would expose a client input before anybody claimed the work.
       */
      expect(artifact.visibility).toBe("deliverable_candidate");
      expect(artifact.name).toBe("candidate");
      expect(artifact.outputVersion).toBe(1);
      expect(artifact.body.byteLength).toBeGreaterThan(0);
    }
    expect(written.map((a) => a.extension)).toEqual(["csv", "csv", "xlsx"]);
  });

  it("no artifact is a copy of the file that was ingested", async () => {
    const raw = utf8(SUPPLIERS_CSV);
    const run = await ingestDedupeBuild(SUPPLIERS_CSV, 1);
    const artifact = run.artifacts[0].body;

    // Overlapping on purpose: a surviving line is in both, which is what makes
    // the negative below a statement about the WHOLE file rather than an
    // accident of two unrelated buffers.
    expect(artifact.includes(utf8("owner@clinic.ca,Clinique Nord"))).toBe(true);
    expect(artifact.includes(raw)).toBe(false);
    expect(raw.includes(raw)).toBe(true);
  });
});

/* ══════════════ 12. The payout path was not touched by any of this ═══════ */

describe("12. adding ten capabilities did not touch how a person is paid", () => {
  const filesSource = readFileSync(
    join(__dirname, "..", "src/lib/ai-work-engine/primitives/files.ts"),
    "utf8"
  );
  const residualSource = readFileSync(
    join(__dirname, "..", "src/lib/ai-work-engine/residual.ts"),
    "utf8"
  );

  it("is not vacuous: both files were read and are the modules they claim to be", () => {
    // A source-level assertion that passed on an empty string would be the
    // most reassuring test in this file and would prove nothing at all.
    expect(filesSource).toContain("export async function runIngestCsv");
    expect(filesSource).toContain("export async function runBuildXlsx");
    expect(residualSource).toContain("export function computeResidual");
    expect(residualSource).toContain("payoutCents");
  });

  it("the file capabilities name no money field at all", () => {
    for (const forbidden of [
      /payout/i,
      /price/i,
      /pricing/i,
      /\bcents\b/i,
      /minutes/i,
      /hourly/i,
      /\bwage\b/i,
      /\bsalary\b/i,
      /\bdollar/i,
    ]) {
      expect(filesSource, `files.ts must not reason about ${forbidden}`).not.toMatch(forbidden);
    }
    expect(filesSource).not.toContain("ai-work-engine/residual");
    expect(filesSource).not.toContain("ai-work-engine/pricing");
  });

  it("no 1E-alpha capability id appears anywhere in the residual computation", () => {
    const added = PLAN_PRIMITIVE_IDS.filter(
      (id) => id.startsWith("ingest.") || id.startsWith("data.") || id.startsWith("build.")
    );
    expect(added.length).toBeGreaterThanOrEqual(10);
    for (const id of added) {
      expect(residualSource, `residual.ts must not know about ${id}`).not.toContain(id);
    }
    /**
     * What residual.ts DOES still speak is the executor vocabulary it has
     * spoken since 1B, which is what makes the absences above meaningful: the
     * payout is computed from who does the work, never from which capability
     * happened to run.
     */
    expect(residualSource).toContain('step.executor !== "human"');
    expect(residualSource).not.toContain("primitives/files");
  });
});

/* ════════════════ the machine's share of internal cost ═══════════════════ */

describe("machineContributionBps reports a share, or nothing", () => {
  const effort = (over: Partial<MandateEffort> = {}): MandateEffort => ({
    provenance: "measured",
    machineStepCount: 3,
    humanStepCount: 1,
    workerMinutes: 20,
    reviewerMinutes: 5,
    machineCostMicros: 0n,
    workerCostMicros: 0n,
    reviewerCostMicros: 0n,
    ...over,
  });

  it("sums exactly the three money fields", () => {
    expect(
      allInInternalCostMicros(
        effort({ machineCostMicros: 250_000n, workerCostMicros: 700_000n, reviewerCostMicros: 50_000n })
      )
    ).toBe(1_000_000n);
  });

  it("ignores the minutes and the step counts entirely", () => {
    // Adding minutes into a denominator of microdollars is a unit error that
    // produces a plausible percentage, which is the worst kind of wrong here.
    const money = { machineCostMicros: 1n, workerCostMicros: 1n, reviewerCostMicros: 0n };
    expect(
      allInInternalCostMicros(effort({ ...money, workerMinutes: 0, reviewerMinutes: 0, machineStepCount: 0 }))
    ).toBe(allInInternalCostMicros(effort({ ...money, workerMinutes: 9_999, reviewerMinutes: 9_999 })));
    expect(machineContributionBps(effort({ ...money, workerMinutes: 9_999 }))).toBe(5_000);
  });

  it("returns the floored basis points of the machine's share", () => {
    expect(
      machineContributionBps(
        effort({ machineCostMicros: 250_000n, workerCostMicros: 700_000n, reviewerCostMicros: 50_000n })
      )
    ).toBe(2_500);
    // Floored, never rounded: 1/3 is 3333 bps, not 3334.
    expect(
      machineContributionBps(effort({ machineCostMicros: 1n, workerCostMicros: 2n }))
    ).toBe(3_333);
    expect(machineContributionBps(effort({ workerCostMicros: 5n }))).toBe(0);
  });

  it("returns NULL, never zero, when there is nothing to divide by", () => {
    /**
     * The house rule: an unknown is not a measurement of zero. A mandate with
     * no recorded cost has not been measured, and 0 bps would read as "the
     * machine contributed nothing", which is a claim nobody made.
     */
    const unmeasured = machineContributionBps(effort());
    expect(unmeasured).toBeNull();
    expect(unmeasured).not.toBe(0);
    // And the measured-at-zero case really is 0, so null carries information.
    expect(machineContributionBps(effort({ workerCostMicros: 1n }))).toBe(0);
  });

  it("returns null on a negative component rather than a negative share", () => {
    expect(
      machineContributionBps(effort({ machineCostMicros: -1n, workerCostMicros: 10n }))
    ).toBeNull();
    expect(
      machineContributionBps(effort({ machineCostMicros: 10n, workerCostMicros: -1n }))
    ).toBeNull();
  });

  it("keeps its precision above 2^53, where a Number path silently rounds", () => {
    /**
     * A person did one microdollar of the work. In doubles the numerator and
     * the denominator collapse onto the same value and the answer is 10000
     * bps: "the machine did all of it". The bigint path says 9999.
     */
    const share = machineContributionBps(
      effort({ machineCostMicros: 9_007_199_254_740_992n, workerCostMicros: 1n })
    );
    expect(share).toBe(9_999);
    expect(
      Math.floor((9_007_199_254_740_992 * 10_000) / 9_007_199_254_740_993)
    ).toBe(10_000);
  });
});

/* ════════ defects found while writing the above, since repaired ═════════ */

/**
 * TWO DEFECTS IN CODE THIS FILE ONLY EXERCISES, RECORDED RATHER THAN REPAIRED.
 *
 * Both were found by running the primitives end to end and reading the bytes
 * that came out, which is the one thing the existing unit tests cannot do:
 * transforms.test.ts never builds a payload and codecs.test.ts never sees one.
 *
 * They are written with `it.fails` deliberately. The body states the contract
 * the code SHOULD meet, so nothing here cements the current behaviour; the
 * marker says "this does not hold today". The moment somebody fixes either
 * one, `it.fails` itself fails, which is the prompt to delete the marker and
 * promote the body to an ordinary `it`. Asserting the broken output as if it
 * were the specification would have been the quiet way to lose both of these.
 */
describe("defects found by this suite, now closed", () => {
  /** The two transforms whose exceptions are COPIES of rows that also ship. */
  async function mapWithAnUnmappedColumn() {
    const csv = "Company Name,Notes\nClinique Nord,call after 4\nGarage Central,ferme lundi\n";
    const file = frozenFile("f_defect", "companies.csv", utf8(csv));
    const ingest = makeContext("ingest.csv", { fileId: file.fileId }, { files: [file] });
    const ingested = await runIngestCsv(ingest.ctx);
    const map = makeContext(
      "data.schema_map",
      { mapping: [{ from: "Company Name", to: "company" }], unmapped: "exception" },
      { input: ingested.payload }
    );
    return runDataSchemaMap(map.ctx);
  }

  it(
    "FIXED: an exception is a reference, so a flagged record is delivered once",
    async () => {
      /**
       * src/lib/ai-work-engine/primitives/files.ts, applyOutcome:
       *   const rows = [...outcome.rows, ...outcome.exceptions];
       *
       * transforms.ts states plainly that for one whole category of exception
       * "the row is in BOTH lists", and that therefore
       * "rows.length + exceptions.length is not a count of anything".
       * applyOutcome computes exactly that sum and makes it the payload.
       *
       * So a two row file with one unmapped column produces four records, and
       * build.csv writes all four: each of the client's rows appears once with
       * an empty review_reason and once with the flag. The same mechanism hits
       * data.normalize (every row holding a value that does not parse) and
       * data.dedupe with reportNearDuplicates, where a DEDUPLICATION mandate
       * delivers each near-duplicate candidate twice.
       *
       * Exceptions that are not also rows (an ambiguous join, a poisoned
       * aggregate group, an undecidable filter row) are appended correctly,
       * which is why the concatenation looks right in isolation.
       */
      const mapped = await mapWithAnUnmappedColumn();
      const build = makeContext("build.csv", {}, { input: mapped.payload });
      await runBuildCsvV2(build.ctx);

      const lines = build.artifacts[0].body.toString("utf8").trimEnd().split("\n");
      // One header and one record per row of the client's file.
      expect(lines).toHaveLength(3);
    }
  );

  it(
    "FIXED: a plan that maps into a named dataset and then builds the default REFUSES",
    async () => {
      /**
       * THE DESIGN CALL THIS TEST LEFT OPEN, NOW MADE.
       *
       * The original defect was `{ main: input.rows, ...(input.datasets ?? {}) }`:
       * a STORED `main` won over the live working set, so a plan that mapped
       * into "mapped" and built the default handed the client back their own
       * ORIGINAL file, under the original headers, with no error anywhere.
       *
       * The first fix flipped the spread — the working set wins for `main` —
       * and that traded one silent wrong answer for another, measured later on
       * a three-file mandate: after a second ingest into a different name,
       * `main` quietly meant the second file while the first sat in
       * `datasets.main`, whole and unreachable.
       *
       * Both versions answer a question with two candidate answers. The rule
       * now is that it has none: `main` is the working set's alias, and once
       * the working set has a NAME that is not `main`, asking for `main`
       * refuses. This test therefore asserts the refusal, and then asserts
       * that the plan which says what it means gets exactly what it meant.
       */
      const csv = "Company Name\nClinique Nord\n";
      const file = frozenFile("f_defect2", "companies.csv", utf8(csv));
      const ingest = makeContext("ingest.csv", { fileId: file.fileId }, { files: [file] });
      const ingested = await runIngestCsv(ingest.ctx);
      const map = makeContext(
        "data.schema_map",
        { mapping: [{ from: "Company Name", to: "company" }], unmapped: "drop", into: "mapped" },
        { input: ingested.payload }
      );
      const mapped = await runDataSchemaMap(map.ctx);

      const refusal = await refusalFrom(
        runBuildCsvV2(makeContext("build.csv", {}, { input: mapped.payload }).ctx)
      );
      expect(refusal.message).toContain("ambiguous");
      expect(refusal.message).toContain("mapped");

      const build = makeContext("build.csv", { dataset: "mapped" }, { input: mapped.payload });
      await runBuildCsvV2(build.ctx);
      const [header] = build.artifacts[0].body.toString("utf8").split("\n");
      expect(header.split(",")).toEqual(Object.keys(mapped.payload.rows[0].fields));
    }
  );
});

describe("a forecast never becomes a measurement", () => {
  const e = (provenance: "planned" | "measured", machine: bigint): MandateEffort => ({
    provenance,
    machineStepCount: 1,
    humanStepCount: 1,
    workerMinutes: 0,
    reviewerMinutes: 0,
    machineCostMicros: machine,
    workerCostMicros: 100n - machine,
    reviewerCostMicros: 0n,
  });

  it("the ratio always says where it came from", () => {
    expect(machineContribution(e("planned", 85n))?.provenance).toBe("planned");
    expect(machineContribution(e("measured", 40n))?.provenance).toBe("measured");
  });

  it("the measurement wins once it exists, and is never averaged with the plan", () => {
    /**
     * The exact failure the separation exists to prevent: a plan promising
     * 85% machine on a mandate where the specialist then redid half the file
     * by hand. Reporting 85%, or any blend of 85 and 40, would tell the
     * calibration loop the platform automated more than it did.
     */
    const got = preferMeasured(e("planned", 85n), e("measured", 40n));
    expect(got).toEqual({ bps: 4000, provenance: "measured" });
  });

  it("falls back to the plan only when nothing was measured", () => {
    expect(preferMeasured(e("planned", 85n), null)).toEqual({
      bps: 8500,
      provenance: "planned",
    });
    expect(preferMeasured(null, null)).toBeNull();
  });

  it("refuses a planned record handed in as if it were measured", () => {
    // Argument position is not evidence. A caller that mislabels a forecast
    // gets nothing rather than a laundered one.
    expect(preferMeasured(null, e("planned", 85n))).toBeNull();
  });

  it("a measured record with nothing recorded in it falls back to the plan, and says so", () => {
    /**
     * The edge the doc comment's own warning lands closest to: a mandate that
     * HAS a measured record whose costs are all zero has not actually been
     * measured, so the ratio comes from the plan.
     *
     * What makes that safe is the label rather than the number. `provenance`
     * comes back "planned", so a caller feeding the calibration loop can
     * refuse it; a caller that ignored the label would be reporting a forecast
     * as an actual, which is exactly what the field exists to prevent. Pinned
     * here because it is the one path where the returned bps did not come from
     * the argument a reader would expect.
     */
    const nothingRecorded: MandateEffort = {
      provenance: "measured",
      machineStepCount: 4,
      humanStepCount: 2,
      workerMinutes: 30,
      reviewerMinutes: 10,
      machineCostMicros: 0n,
      workerCostMicros: 0n,
      reviewerCostMicros: 0n,
    };
    expect(machineContribution(nothingRecorded)).toBeNull();
    expect(preferMeasured(e("planned", 85n), nothingRecorded)).toEqual({
      bps: 8500,
      provenance: "planned",
    });
    // And with no plan either, the honest answer is still nothing.
    expect(preferMeasured(null, nothingRecorded)).toBeNull();
  });
});

/* ─────────── the inspector: real bytes in, columns with their cells out ─────────── */

describe("inspectFile reads a real file into columns that keep their values", () => {
  const csvFile = (name: string, text: string) => ({
    id: `f_${name}`,
    fileName: `${name}.csv`,
    sizeBytes: Buffer.byteLength(text),
    read: async () => Buffer.from(text, "utf8"),
  });

  const classify = async (name: string, text: string) =>
    classifyMandateData({
      declaredSensitive: false,
      declaredRequiredAccessCount: 0,
      fileCount: 1,
      inspections: [await inspectFile(csvFile(name, text))],
    });

  it("keeps each cell under its own header", async () => {
    const insp = await inspectFile(
      csvFile("crm", "company,signup_date\nAcme Ltd,2024-01-12\nBorealis,2025-06-30\n")
    );
    expect(insp.inspected).toBe(true);
    expect(insp.columns.map((c) => c.header)).toEqual(["company", "signup_date"]);
    expect(insp.columns[0].values).toEqual(["Acme Ltd", "Borealis"]);
    expect(insp.columns[1].values).toEqual(["2024-01-12", "2025-06-30"]);
    // Both codecs refuse ragged rows, so nothing should ever land here.
    expect(insp.unkeyedValues).toEqual([]);
  });

  it("an ordinary CRM export with timestamps stays automatable", async () => {
    /**
     * The end-to-end form of the regression. Every column below is the
     * substance of the product's core market, and the file used to come back
     * human-only because `2024-01-12` matched a value-alone pattern named
     * date_of_birth.
     */
    const v = await classify(
      "crm",
      [
        "company,contact,work_email,signup_date,last_checked,created_at",
        "Acme Ltd,Dana Reid,ops@acme.example,2024-01-12,2026-07-31,2023-11-04",
        "Borealis,Sam Okafor,sam@borealis.example,2025-06-30,2026-07-30,2024-02-19",
      ].join("\n")
    );
    expect(v.dataClass).toBe("business_confidential");
  });

  it("an HR export spelled the way a database writes it is still human-only", async () => {
    // `date_of_birth`, not `date of birth`: the spelling the header list used
    // to miss entirely, caught now by normalisation rather than by the
    // accidental value-shape backstop that was removed.
    const v = await classify(
      "hr",
      "employee,date_of_birth,start_date\nDana Reid,1988-04-12,2019-03-01\n"
    );
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it("a loose birth column is decided by what is actually under it", async () => {
    const dates = await classify("f1", "name,birth\nDana Reid,1994-03-14\n");
    expect(dates.dataClass).toBe("personal_sensitive");

    const places = await classify("f2", "name,birth\nDana Reid,Montreal\n");
    expect(places.dataClass).toBe("business_confidential");
  });

  it("every column of a wide file is sampled, not just the ones the budget reached", async () => {
    /**
     * The sample is capped at 400 cells. A 40-column file has 1000 in 25 rows,
     * so something must be dropped — and WHICH cells are dropped decides
     * whether the last columns were inspected or merely declared inspected. A
     * column-major fill would leave column 40 empty while reporting a clean
     * scan, which is the same failure mode as reading only row one.
     */
    const headers = Array.from({ length: 40 }, (_, i) => `col_${i}`);
    const row = (n: number) => headers.map((_, i) => `v${n}_${i}`).join(",");
    const text = [headers.join(","), ...Array.from({ length: 25 }, (_, r) => row(r))].join("\n");

    const insp = await inspectFile(csvFile("wide", text));
    expect(insp.inspected).toBe(true);
    expect(insp.columns).toHaveLength(40);
    for (const col of insp.columns) expect(col.values.length).toBeGreaterThan(0);
    const total = insp.columns.reduce((n, c) => n + c.values.length, 0);
    expect(total).toBeLessThanOrEqual(400);

    // And the sensitive shape in the LAST column is still found.
    const withSin = [
      [...headers.slice(0, 39), "reference"].join(","),
      ...Array.from({ length: 25 }, (_, r) =>
        [...headers.slice(0, 39).map((_, i) => `v${r}_${i}`), "046-454-286"].join(",")
      ),
    ].join("\n");
    const v = classifyMandateData({
      declaredSensitive: false,
      declaredRequiredAccessCount: 0,
      fileCount: 1,
      inspections: [await inspectFile(csvFile("wide2", withSin))],
    });
    expect(v.dataClass).toBe("personal_sensitive");
  });

  it("a file the codec refuses is human-only, with no columns invented", async () => {
    // A ragged CSV: the codec refuses rather than padding, and a refusal is
    // an uninspected file, which is the conservative branch.
    const insp = await inspectFile(csvFile("ragged", "a,b\n1,2,3\n"));
    expect(insp.inspected).toBe(false);
    expect(insp.columns).toEqual([]);
  });
});
