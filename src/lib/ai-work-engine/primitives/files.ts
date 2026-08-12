import { parseCsv } from "@/lib/ai-work-engine/codecs/csv";
import { buildXlsx, parseXlsx } from "@/lib/ai-work-engine/codecs/xlsx";
import type { Table } from "@/lib/ai-work-engine/codecs/table";
import {
  aggregate,
  compare,
  concat,
  dedupe,
  filter,
  join,
  normalize,
  schemaMap,
  type TransformOutcome,
} from "@/lib/ai-work-engine/transforms";
import type {
  BuildCsvParams,
  BuildXlsxParams,
  DataAggregateParams,
  DataCompareParams,
  DataConcatParams,
  DataDedupeParams,
  DataFilterParams,
  DataJoinParams,
  DataNormalizeParams,
  DataSchemaMapParams,
  IngestCsvParams,
  IngestXlsxParams,
} from "@/lib/ai-work-engine/primitive-params";
import { rowsToCsv } from "@/lib/ai-work-engine/primitives/pure";
import type {
  PrimitiveContext,
  PrimitiveResult,
  RowException,
  WorkflowPayload,
  WorkflowRow,
} from "@/lib/ai-work-engine/primitives/types";

/**
 * THE CAPABILITIES THAT READ A CLIENT'S OWN FILE, AND THE ONES THAT RESHAPE
 * WHAT THEY FOUND.
 *
 * All local, all deterministic, none of them able to send a byte anywhere. The
 * codecs and the transform library do the actual work and are unit-tested
 * without any of this; what lives here is only the wiring: pull the frozen
 * file, hand it to a codec, hand the rows to a transform, write the result
 * back into the payload.
 *
 * ── A REFUSAL IS NOT AN ERROR ──
 *
 * Every codec and every transform can decline: a ragged CSV row, an ambiguous
 * join key, a mapping written for a different file. When that happens the
 * primitive THROWS, and that is deliberate rather than lazy. A thrown step is
 * retried and then handed to a person by the runner, with the reason recorded,
 * which is exactly the outcome a refusal is asking for. Returning a
 * half-transformed payload with a note attached would let the next step build
 * on data nobody validated, and the client would receive it.
 *
 * The reasons are written by the modules that produce them and carry positions
 * and counts, never a cell's contents: they travel into step summaries and
 * admin screens that are not scoped to hold a confidential file.
 */

/** A refusal from a codec or a transform, surfaced to the runner as a failure. */
class PrimitiveRefusal extends Error {}

/* ────────────────────────────── payload plumbing ────────────────────────── */

/**
 * Rows carry no per-field sources and no verification verdict, because the
 * client's own file IS the source. Asking the two-independent-hosts bar about
 * a supplier list the client sent us would be answering a question nobody
 * asked, and would mark every row for review.
 *
 * ── WHERE EVERY LINEAGE IN THE ENGINE IS BORN ──
 *
 * `rowId` is `fileId#sheet#index`, and this is the only place one is minted
 * from nothing. `fileId` comes from the acceptance snapshot, so it is frozen
 * with the contract and replaying the same bytes yields the same ids, which is
 * what lets a retried step write a byte-identical artifact. It leads the id so
 * that two files in one mandate cannot collide on a row number.
 *
 * `index` is 0-based over the DATA rows, deliberately unlike `unitKey`'s
 * `row-N`, which is 1-based because that is the line a person sees in a
 * spreadsheet once the header is discounted. The id is internal and counts from
 * zero like the array it indexes; the two are not the same number and are not
 * meant to be read as one.
 */
function tableToRows(
  table: Table,
  keyColumn: string | null,
  lineage: { fileId: string; sheet: string }
): WorkflowRow[] {
  const keyIndex = keyColumn === null ? -1 : table.headers.indexOf(keyColumn);
  if (keyColumn !== null && keyIndex === -1) {
    throw new PrimitiveRefusal(
      `the key column named in the accepted step is not present in this file (${table.headers.length} columns read)`
    );
  }
  return table.rows.map((cells, i) => {
    const fields: Record<string, string | null> = {};
    table.headers.forEach((h, c) => {
      const v = cells[c] ?? "";
      // An empty cell is an ABSENT value, never an empty string: the rest of
      // the engine reads null as "not found" and "" as a real answer.
      fields[h] = v === "" ? null : v;
    });
    return {
      rowId: `${lineage.fileId}#${lineage.sheet}#${i}`,
      // Row number is 1-based over the data rows, matching what a person sees
      // in a spreadsheet once the header is discounted.
      unitKey: keyIndex === -1 ? `row-${i + 1}` : (cells[keyIndex] ?? `row-${i + 1}`),
      fields,
      sources: {},
      status: "verified" as const,
      reviewReason: null,
    };
  });
}

/** Field names in first-seen order across the rows, for a stable header. */
function fieldOrder(rows: WorkflowRow[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r.fields)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

function withDataset(
  input: WorkflowPayload,
  name: string,
  rows: WorkflowRow[],
  requestedFields: string[],
  exceptions?: RowException[]
): WorkflowPayload {
  const payload: WorkflowPayload = {
    ...input,
    rows,
    datasets: { ...(input.datasets ?? {}), [name]: rows },
    // The invariant the whole resolver rests on: after this write, the working
    // set IS the dataset called `name`, and the payload says so out loud
    // instead of leaving a later reader to infer it.
    workingDataset: name,
    requestedFields,
    provenance: "client_file",
  };
  // Left exactly as the input had it when the step raised nothing and the
  // input carried nothing: an old artifact replayed today must not grow a
  // field it did not have.
  if (exceptions !== undefined && exceptions.length > 0) payload.exceptions = exceptions;
  return payload;
}

/**
 * Code-unit ordering, for the same reason transforms.ts bans `localeCompare`:
 * its answer depends on the runtime's ICU build, so the same findings rendered
 * on a developer's machine and on the production host could come out in a
 * different order and a replay would write a different artifact.
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The step's findings ADDED to the ones already on the payload.
 *
 * Appended, never replacing: a later step must not erase what an earlier one
 * found, and a mandate's exception list is the accumulated record of everything
 * that needs a person, not a snapshot of the last transform.
 *
 * Deduplicated by (rowId, code, field), which is exactly what makes a REPLAY
 * safe: a step reclaimed after a lease expiry re-runs in full on the same
 * input, re-derives the same findings, and would otherwise double every one of
 * them on the payload it writes. The first occurrence wins, so a replay cannot
 * rewrite the wording of a finding that is already recorded either.
 *
 * The key is the tuple's JSON rather than a concatenation because a separator
 * character can appear inside a rowId (an XLSX sheet name reaches one
 * verbatim), and two different tuples flattening onto one key would drop a real
 * finding.
 */
function accumulateExceptions(
  existing: RowException[] | undefined,
  raised: RowException[]
): RowException[] {
  const out: RowException[] = [];
  const seen = new Set<string>();
  for (const exception of [...(existing ?? []), ...raised]) {
    const key = JSON.stringify([exception.rowId, exception.code, exception.field]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(exception);
  }
  return out;
}

/**
 * The name a step means when its params name no dataset. An ALIAS for the
 * working set, never a place to look something up by name.
 */
const WORKING_SET_ALIAS = "main";

/**
 * WHY `main` CANNOT BE ANSWERED ON THIS PAYLOAD, or null when it can.
 *
 * The previous rule was `{...datasets, main: rows}` — the working set always
 * wins for the alias. That was itself a fix (a STORED `main` used to shadow the
 * live rows and hand the client back their own original file), and it traded
 * one silent wrong answer for another: after a second ingest into a different
 * name, `main` quietly meant the second file while the first sat in
 * `datasets.main`, whole, correct and unreachable.
 *
 * Both versions answer a question that has two candidate answers. The fix is
 * not a third preference order. It is to REFUSE:
 *
 *   ambiguous dataset resolution -> fail closed, never "take the most recent"
 *
 * A refused step is retried, then handed to a person with the reason recorded,
 * which is a mandate somebody finishes by hand. The alternative is a
 * deliverable built from the wrong source that nobody can tell apart from a
 * correct one, found months later by the client reconciling against it.
 */
function workingSetAmbiguity(input: WorkflowPayload): string | null {
  const working = input.workingDataset;
  const stored = input.datasets ?? {};
  const names = Object.keys(stored).sort();

  if (working === undefined) {
    /**
     * No named dataset has ever been written: `main` is the only set there is,
     * which is every web-research payload and every single-source plan that
     * used the default throughout.
     *
     * Named sets WITHOUT a working name is the legacy case — a payload written
     * before this field existed, replayed by a run compiled before the fix. It
     * cannot say which dataset its rows are, and inferring is the defect, so it
     * refuses. Fail-closed: that mandate becomes a person's.
     */
    if (names.length === 0) return null;
    return (
      `"main" cannot be resolved: this payload names datasets (${names.join(", ")}) but was ` +
      `written before the engine recorded which one the working set is. Nothing here can say ` +
      `whether "main" means one of them or the rows alongside them, so this step is a person's.`
    );
  }

  if (working === WORKING_SET_ALIAS) return null;

  if (Object.hasOwn(stored, WORKING_SET_ALIAS)) {
    return (
      `"main" is ambiguous: a dataset named "main" was written earlier in this run and the ` +
      `working set has since moved to "${working}". Both are real and they are different rows. ` +
      `The step must name the one it means (available: ${names.join(", ")}).`
    );
  }

  return (
    `"main" is ambiguous: this run works with named datasets (${names.join(", ")}) and the ` +
    `working set is currently "${working}". Reading "main" here would silently mean ` +
    `"${working}" — the most recent one — which is exactly the guess this engine refuses. ` +
    `Name the dataset this step means.`
  );
}

/**
 * Every dataset a step may look up by name. `main` appears only when it is
 * unambiguous, so a caller that indexes this map directly (join, compare) gets
 * a miss rather than a guess; `rowsOfDataset` turns that miss into the precise
 * reason.
 */
function datasetsOf(input: WorkflowPayload): Record<string, WorkflowRow[]> {
  const stored = { ...(input.datasets ?? {}) };
  if (workingSetAmbiguity(input) === null) stored[WORKING_SET_ALIAS] = input.rows;
  else delete stored[WORKING_SET_ALIAS];
  return stored;
}

/**
 * The one place a transform's verdict becomes a payload.
 *
 * ── THE DATASET IS `outcome.rows`, FULL STOP ──
 *
 * This function used to compute `[...outcome.rows, ...outcome.exceptions]`
 * while several transforms put the same logical record in both lists. The
 * client then received every flagged record twice, once clean and once with
 * its review reason, and the doubling was invisible because both copies are
 * legitimate rows. A deduplication mandate delivered each near-duplicate
 * candidate twice.
 *
 * The repair is not a smarter matcher. Three were tried on this line and each
 * was worse than the bug: `unitKey` collapsed three distinct records into one
 * (silent client data loss in a deduplication mandate), object identity missed
 * schema_map and normalize because they build new objects for the same record,
 * and value equality deleted rows that are allowed to be identical. The repair
 * is that a transform no longer returns rows twice: `rows` is the dataset and
 * `exceptions` are references into it.
 *
 * The flagged row itself still carries `status` and `reviewReason`, which is
 * what split.exceptions and the human package already know how to read. What
 * it no longer has is a twin.
 */
function applyOutcome(
  input: WorkflowPayload,
  outcome: TransformOutcome,
  into: string,
  label: string
): PrimitiveResult {
  if (!outcome.ok) throw new PrimitiveRefusal(`${label}: ${outcome.reason}`);
  const exceptions = accumulateExceptions(input.exceptions, outcome.exceptions);
  return {
    payload: withDataset(input, into, outcome.rows, fieldOrder(outcome.rows), exceptions),
    summary: {
      ...outcome.summary,
      rowsOut: outcome.rows.length,
      // THIS step's findings, not the mandate's running total: a summary is
      // read as "what this step did", and reporting an inherited count there
      // would attribute an earlier step's work to this one.
      exceptions: outcome.exceptions.length,
    },
  };
}

/* ─────────────────────────────── ingestion ──────────────────────────────── */

/**
 * Resolve a file the CONTRACT authorises. `ctx.inputFiles` is built from the
 * acceptance snapshot, so a file uploaded or replaced after the client
 * accepted simply is not here, and `read()` re-checks the hash before handing
 * over a byte.
 */
async function readAcceptedFile(ctx: PrimitiveContext, fileId: string): Promise<Buffer> {
  const file = ctx.inputFiles.find((f) => f.fileId === fileId);
  if (!file) {
    throw new PrimitiveRefusal(
      "the file this step was accepted to read is not among the files frozen on the contract"
    );
  }
  return file.read();
}

export async function runIngestCsv(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as IngestCsvParams;
  const bytes = await readAcceptedFile(ctx, p.fileId);
  const parsed = parseCsv(bytes, { hasHeaderRow: p.hasHeaderRow, delimiter: p.delimiter });
  if (!parsed.ok) throw new PrimitiveRefusal(`ingest.csv: ${parsed.reason}`);
  // A CSV has no sheet, so the middle part of the lineage is empty rather than
  // invented. The id stays three parts wide either way, which is what keeps a
  // CSV row and a workbook row from ever reading as the same shape of id.
  const rows = tableToRows(parsed.table, p.keyColumn, { fileId: p.fileId, sheet: "" });
  return {
    payload: withDataset(ctx.input, p.datasetName, rows, parsed.table.headers),
    summary: {
      dataset: p.datasetName,
      rows: rows.length,
      columns: parsed.table.headers.length,
    },
  };
}

export async function runIngestXlsx(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as IngestXlsxParams;
  const bytes = await readAcceptedFile(ctx, p.fileId);
  const parsed = parseXlsx(bytes, { sheet: p.sheet, hasHeaderRow: p.hasHeaderRow });
  if (!parsed.ok) throw new PrimitiveRefusal(`ingest.xlsx: ${parsed.reason}`);
  /**
   * The sheet AS THE STEP NAMED IT, not as the workbook resolved it: the codec
   * reports a Table and never says which sheet it chose, and reaching into it
   * for the resolved name would couple this lineage to a codec internal. The
   * params are frozen on the accepted plan, so the id is still identical on
   * every replay, which is the property the lineage actually needs. `null`
   * means "the workbook's first sheet" and is recorded as an empty part.
   */
  const rows = tableToRows(parsed.table, p.keyColumn, {
    fileId: p.fileId,
    sheet: p.sheet === null ? "" : String(p.sheet),
  });
  return {
    payload: withDataset(ctx.input, p.datasetName, rows, parsed.table.headers),
    summary: {
      dataset: p.datasetName,
      rows: rows.length,
      columns: parsed.table.headers.length,
    },
  };
}

/* ─────────────────────────────── transforms ─────────────────────────────── */

function rowsOfDataset(input: WorkflowPayload, name: string): WorkflowRow[] {
  assertResolvable(input, [name]);
  const sets = datasetsOf(input);
  const rows = sets[name];
  if (rows === undefined) {
    throw new PrimitiveRefusal(`no dataset named "${name}" is present in this run`);
  }
  return rows;
}

/**
 * Refuse BEFORE any work when a step names a dataset that cannot be resolved.
 *
 * Used by the capabilities that take a whole dataset map — join, compare,
 * concat — because `datasetNamed` would otherwise report a plain "no dataset
 * named main", which is true and useless. The operator needs to be told that
 * `main` exists twice over, not that it does not exist.
 */
function assertResolvable(input: WorkflowPayload, names: string[]): void {
  if (!names.includes(WORKING_SET_ALIAS)) return;
  const ambiguity = workingSetAmbiguity(input);
  if (ambiguity !== null) throw new PrimitiveRefusal(ambiguity);
}

export async function runDataDedupe(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataDedupeParams;
  return applyOutcome(
    ctx.input,
    dedupe(rowsOfDataset(ctx.input, p.dataset), p),
    p.dataset,
    "data.dedupe"
  );
}

export async function runDataNormalize(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataNormalizeParams;
  return applyOutcome(
    ctx.input,
    normalize(rowsOfDataset(ctx.input, p.dataset), p),
    p.dataset,
    "data.normalize"
  );
}

export async function runDataJoin(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataJoinParams;
  assertResolvable(ctx.input, [p.left, p.right]);
  return applyOutcome(ctx.input, join(datasetsOf(ctx.input), p), p.into, "data.join");
}

/**
 * data.concat — datasets stacked one under another, in the order given.
 *
 * The capability the vocabulary was missing, found by measuring a mandate that
 * said "three regional lists, one file back": sixteen capabilities and not one
 * of them puts two tables end to end. `data.join` is not it — a join matches
 * keys and returns the LEFT side, so three lists of 40, 35 and 30 came out as
 * 40 rows and a plan that looked like it had worked.
 */
export async function runDataConcat(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataConcatParams;
  assertResolvable(ctx.input, p.datasets);
  return applyOutcome(ctx.input, concat(datasetsOf(ctx.input), p), p.into, "data.concat");
}

export async function runDataFilter(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataFilterParams;
  return applyOutcome(
    ctx.input,
    filter(rowsOfDataset(ctx.input, p.dataset), p),
    p.into,
    "data.filter"
  );
}

export async function runDataAggregate(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataAggregateParams;
  return applyOutcome(
    ctx.input,
    aggregate(rowsOfDataset(ctx.input, p.dataset), p),
    p.into,
    "data.aggregate"
  );
}

export async function runDataCompare(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataCompareParams;
  assertResolvable(ctx.input, [p.left, p.right]);
  return applyOutcome(ctx.input, compare(datasetsOf(ctx.input), p), p.into, "data.compare");
}

export async function runDataSchemaMap(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as DataSchemaMapParams;
  return applyOutcome(
    ctx.input,
    schemaMap(rowsOfDataset(ctx.input, p.dataset), p),
    p.into,
    "data.schema_map"
  );
}

/* ───────────────────────────────── output ──────────────────────────────── */

/** Explicit column order when the step declared one, else first-seen order. */
function columnsFor(rows: WorkflowRow[], declared: string[]): string[] {
  return declared.length > 0 ? declared : fieldOrder(rows);
}

/**
 * `columns` can name something that is not an own key of `fields` (an operator
 * declared it, or another row has it), and `fields` came out of JSON with
 * Object.prototype attached. A column literally named `toString` would
 * otherwise write a function's source text into a cell.
 */
function cellValue(row: WorkflowRow, column: string): string {
  return Object.hasOwn(row.fields, column) ? (row.fields[column] ?? "") : "";
}

/** The column the review reasons are written into, on both builders. */
const REVIEW_COLUMN = "review_reason";

/**
 * WHAT EACH WRITTEN ROW OWES A PERSON, JOINED ON LINEAGE.
 *
 * The exceptions on the payload are references: a rowId, a code, a column, a
 * sentence. This is the join that turns them back into something a human reads,
 * and it is the reason the dataset itself no longer carries a second copy of
 * every flagged record.
 *
 * Returns null when no row being written has anything against it, and the
 * column is then not emitted at all. A payload can hold exceptions about rows
 * that are not in THIS dataset (a later filter dropped them, or the step wrote
 * into a different set); those cannot be annotated here, so they do not conjure
 * an empty column either. They remain on the payload for the operator.
 *
 * ── THE ORDER INSIDE A CELL IS FIXED BY THE CONTENT, NOT BY ARRIVAL ──
 *
 * Several findings about one row are sorted by (code, field, detail) in
 * code-unit order and joined with " | ". Sorting by the order they were raised
 * would make the cell depend on which step ran first, and two runs of the same
 * plan that legitimately interleave their steps would then write different
 * bytes for the same findings.
 *
 * ── THE CELL SPEAKS THE OPERATOR'S VOCABULARY ──
 *
 * A `detail` names codes, columns and other rows' lineage ids, never a cell's
 * contents: that is the disclosure rule the exception type sets, and it is why
 * the row's own `reviewReason` (which may quote the client's values) still
 * exists beside it. The cost is that this column is written for the person
 * FINISHING the mandate rather than for the client, and a lineage id in it
 * cannot be looked up in the file itself. It is a review column on a candidate
 * artifact, which QC resolves before anything is delivered.
 */
function reviewColumnFor(
  rows: WorkflowRow[],
  columns: string[],
  exceptions: RowException[]
): string[] | null {
  const byRow = new Map<string, RowException[]>();
  for (const exception of exceptions) {
    const bucket = byRow.get(exception.rowId);
    if (bucket === undefined) byRow.set(exception.rowId, [exception]);
    else bucket.push(exception);
  }

  const cells = rows.map((row) => {
    if (row.rowId === undefined) return "";
    const found = byRow.get(row.rowId);
    if (found === undefined) return "";
    return found
      .slice()
      .sort(
        (a, b) =>
          compareStrings(a.code, b.code) ||
          compareStrings(a.field ?? "", b.field ?? "") ||
          compareStrings(a.detail, b.detail)
      )
      .map((e) => (e.field === null ? `${e.code}: ${e.detail}` : `${e.code} (${e.field}): ${e.detail}`))
      .join(" | ");
  });

  if (!cells.some((c) => c !== "")) return null;
  if (columns.includes(REVIEW_COLUMN)) {
    // Two columns under one header is a file no importer reads correctly, and
    // guessing which of the two the reader wanted is not this step's call.
    throw new PrimitiveRefusal(
      `build refused: the dataset already has a column named "${REVIEW_COLUMN}", which is the column the review reasons are written into. Writing both would produce a file with two columns under one header.`
    );
  }
  return cells;
}

function toTable(rows: WorkflowRow[], columns: string[], review: string[] | null): Table {
  if (review === null) {
    return { headers: columns, rows: rows.map((r) => columns.map((c) => cellValue(r, c))) };
  }
  return {
    headers: [...columns, REVIEW_COLUMN],
    rows: rows.map((r, i) => [...columns.map((c) => cellValue(r, c)), review[i]]),
  };
}

export async function runBuildXlsx(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as BuildXlsxParams;
  const rows = rowsOfDataset(ctx.input, p.dataset);
  const columns = columnsFor(rows, p.columns);
  const review = reviewColumnFor(rows, columns, ctx.input.exceptions ?? []);
  const body = buildXlsx(toTable(rows, columns, review), { sheetName: p.sheetName });
  await ctx.writeArtifact({
    name: "candidate",
    outputVersion: 1,
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
    // The file the worker finishes and delivers. It reaches the client only by
    // becoming a QC-approved delivery, exactly like the CSV candidate.
    visibility: "deliverable_candidate",
  });
  return {
    payload: ctx.input,
    // The width of the file that was actually written, review column included:
    // an operator reconciling a summary against the artifact counts headers.
    summary: {
      rows: rows.length,
      columns: columns.length + (review === null ? 0 : 1),
      bytes: body.byteLength,
    },
  };
}

/**
 * build.csv@2 — the same writer, now aware of where its rows came from.
 *
 * On a client-file payload there are no per-field source URLs and no
 * verification verdict to report, so emitting `_sources` and `status` would put
 * dead columns in the deliverable of every deduplication mandate. A
 * `review_reason` column is written only when the run actually raised something
 * against a row that is in this file. Web-research payloads are written exactly
 * as before, column for column, by the original function.
 */
export function clientFileRowsToCsv(
  rows: WorkflowRow[],
  columns: string[],
  review: string[] | null
): string {
  const escape = (v: string) => {
    const neutralized = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
  };
  // EXACTLY ONE LINE PER LOGICAL ROW. The dataset is the dataset; a row that
  // needs a person is annotated in place rather than written a second time,
  // which is the whole of the delivery-duplication repair as the client sees
  // it.
  const table = toTable(rows, columns, review);
  const lines = [table.headers.map(escape).join(",")];
  for (const cells of table.rows) lines.push(cells.map(escape).join(","));
  return `${lines.join("\n")}\n`;
}

export async function runBuildCsvV2(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const p = ctx.params as BuildCsvParams;
  if (ctx.input.provenance !== "client_file") {
    // Unchanged path: the research workflow's CSV is byte-identical to @1.
    const csv = rowsToCsv(ctx.input);
    await ctx.writeArtifact({
      name: "candidate",
      outputVersion: 1,
      extension: "csv",
      mime: "text/csv",
      body: Buffer.from(csv, "utf8"),
      visibility: "deliverable_candidate",
    });
    return {
      payload: ctx.input,
      summary: { rows: ctx.input.rows.length, bytes: Buffer.byteLength(csv, "utf8") },
    };
  }
  const rows = rowsOfDataset(ctx.input, p.dataset);
  const columns = columnsFor(rows, p.columns);
  const review = reviewColumnFor(rows, columns, ctx.input.exceptions ?? []);
  const csv = clientFileRowsToCsv(rows, columns, review);
  await ctx.writeArtifact({
    name: "candidate",
    outputVersion: 1,
    extension: "csv",
    mime: "text/csv",
    body: Buffer.from(csv, "utf8"),
    visibility: "deliverable_candidate",
  });
  return {
    payload: ctx.input,
    summary: {
      rows: rows.length,
      columns: columns.length + (review === null ? 0 : 1),
      bytes: Buffer.byteLength(csv, "utf8"),
    },
  };
}
