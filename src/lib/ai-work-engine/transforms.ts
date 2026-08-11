import type {
  DataAggregateParams,
  DataCompareParams,
  DataDedupeParams,
  DataFilterParams,
  DataJoinParams,
  DataNormalizeParams,
  DataSchemaMapParams,
} from "@/lib/ai-work-engine/primitive-params";
import {
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
} from "@/lib/ai-work-engine/primitives/pure";
import type { RowException, WorkflowRow } from "@/lib/ai-work-engine/primitives/types";

/**
 * THE DETERMINISTIC TRANSFORM LIBRARY. Rows in, rows out, no judgement.
 *
 * Every function here is the machine half of a mandate that also has a human
 * half. That framing decides almost every question this file answers: when the
 * rules do not reach a single defensible answer, the step does not pick one, it
 * names what it could not decide and hands that part to a person. A refusal
 * costs somebody twenty minutes. A confident wrong total costs a client
 * relationship, and it costs it three months later when nobody remembers which
 * step produced the number.
 *
 * ── WHY THIS IS A LIBRARY AND NOT SEVEN PRIMITIVES ──
 *
 * The primitives in primitives/ take a PrimitiveContext: a task id, a cost
 * ceiling, an artifact writer. None of that is needed to deduplicate a list,
 * and requiring it would make these functions untestable without a fake runner.
 * So the decisions live here, pure, and the primitive wrappers stay thin enough
 * to read in one screen. `params.dataset` / `params.into` are deliberately
 * IGNORED by this file: which named set a step reads and writes is the runner's
 * routing problem, and duplicating that here would give it two answers.
 *
 * ── `rows` IS THE DATASET. `exceptions` ARE REFERENCES INTO IT ──
 *
 * `rows` holds exactly one entry per surviving logical row, and that is the
 * whole working dataset. An exception is metadata ABOUT one of those rows: a
 * lineage id, a code, a column, one sentence. No function in this file may put
 * a row object into `exceptions`.
 *
 * That rule is a closed bug rather than a preference. The two lists used to
 * OVERLAP: a transform that flagged a record it also kept returned the record
 * twice, the wiring concatenated both lists, and every flagged record reached
 * the client twice. A deduplication mandate delivering each near-duplicate
 * candidate twice is the worst version of that available.
 *
 * Three repairs were tried on the wiring and each was worse than the bug, so
 * each is banned here too:
 *
 *   - by `unitKey`: several legitimate rows share one, so it collapsed three
 *     distinct records into one in a DEDUPLICATION mandate, which is silent
 *     client data loss;
 *   - by object identity: schema_map and normalize build NEW objects for the
 *     same logical record, so it caught nothing there;
 *   - by value equality or serialised contents: two distinct entries are
 *     allowed to be identical, so it deleted real rows.
 *
 * The repair is the data model. A row carries a lineage (`rowId`), and an
 * exception points at it. See the comments on WorkflowRow and RowException.
 *
 * ── A FLAGGED ROW IS STILL EXACTLY ONE ROW ──
 *
 * When a transform cannot decide something about a row it does two things, and
 * neither is emitting a second record. It marks THE row in place
 * (`status: needs_review` plus a `reviewReason` in the client's own terms,
 * which is what split.exceptions, the human package and build.csv already know
 * how to read), and it appends a REFERENCE to `exceptions`.
 *
 * Two representations of one finding, deliberately, because they have
 * different audiences and different disclosure rules: the sentence on the row
 * may quote the client's own values back to the person finishing the mandate,
 * and an exception may not, because it travels into operator tooling and logs.
 * What they are never again is two rows.
 *
 * ── A ROW WITHOUT A LINEAGE STILL GETS THE SENTENCE ──
 *
 * `rowId` is optional: a payload written before this phase has none, and
 * inventing one is forbidden. Such a row is still flagged in place, so nothing
 * a person must see is lost; only the machine-readable reference is skipped,
 * because a reference that points at nothing is worse than no reference. The
 * cost is that an operator cannot COUNT findings on a legacy payload. Every
 * payload produced by ingest.csv / ingest.xlsx carries ids, and that is every
 * payload the client-file delivery path is built from.
 *
 * ── DETERMINISM IS LOAD-BEARING, NOT A NICETY ──
 *
 * A step reclaimed after a lease expiry re-runs in full on its predecessor's
 * payload. If a re-run reordered rows, the artifact written on attempt 2 would
 * differ from attempt 1 for no reason a human could explain, and the delivery
 * the client reconciles against would depend on which attempt happened to win.
 *
 * So: nothing observable is allowed to depend on JS object key order, on Map
 * insertion order, or on the runtime's collation. Concretely — every place that
 * enumerates field names sorts them with `compareStrings` (code-unit order, NOT
 * `localeCompare`, whose answer depends on the runtime's ICU build); every
 * newly created row set is sorted by a key derived from the data; and
 * `aggregate` sums a group's values in ascending numeric order rather than in
 * row order, because floating-point addition is not associative and a shuffled
 * input would otherwise produce a different last digit.
 *
 * The same rule governs the ids minted here: a derived row's id is a pure
 * function of its parents' ids or of its group key. Never a counter, never a
 * random, never a clock.
 *
 * ── BOUNDS ARE CHECKED BEFORE THE ALLOCATION ──
 *
 * Row counts here come from a client's uploaded file, so they are attacker
 * controlled in the only sense that matters: nobody vets the size for us. Each
 * entry point guards its inputs before building any index, and the one
 * quadratic scan in the file (near-duplicate detection) has its own, much
 * lower, ceiling. See MAX_NEAR_DUPLICATE_ROWS for the arithmetic.
 */

export type TransformOutcome =
  | {
      ok: true;
      /** The working dataset. Exactly one entry per surviving logical row. */
      rows: WorkflowRow[];
      /** References to rows in `rows`. Never rows, never a parallel dataset. */
      exceptions: RowException[];
      summary: Record<string, string | number | boolean>;
    }
  /** Operator-facing. Carries NO client data: see `refuse`. */
  | { ok: false; reason: string };

/* ─────────────────────────────── the bounds ─────────────────────────────── */

/**
 * The linear transforms are all O(n) or O(n log n) with an index, so this
 * ceiling is about memory rather than time: 50k rows of a few dozen columns is
 * already a couple of hundred megabytes once parsed, and a back-office mandate
 * that large is a data-engineering job somebody should have quoted as one.
 */
export const MAX_TRANSFORM_ROWS = 50_000;

/**
 * THE QUADRATIC ONE. Near-duplicate detection compares every surviving row
 * with every other, so the pair count is n(n-1)/2 and the work per pair is a
 * Levenshtein DP over up to MAX_SIMILARITY_CHARS characters on up to four
 * fields.
 *
 * At 1000 rows that is 499,500 pairs. The ceiling was chosen by measuring the
 * genuine worst case rather than by estimating it: 1000 rows, four compared
 * fields, every value exactly MAX_SIMILARITY_CHARS long so truncation never
 * shortens the DP, values random enough that every pair runs its matrix to the
 * last cell before being rejected, and the threshold at its 0.5 floor so the
 * distance cutoff prunes nothing. That runs in 4.9 seconds, which leaves an
 * order of magnitude of headroom inside the runner's ~60 second step budget
 * for a slower production host and for the rest of the step.
 *
 * Above it the step REFUSES rather than degrading (sampling, blocking on a
 * prefix, capping the scan). A partial near-duplicate scan reports "no
 * duplicates found" for the pairs it skipped, which is a false negative dressed
 * as a result, and false negatives are exactly what this feature exists to
 * prevent.
 */
export const MAX_NEAR_DUPLICATE_ROWS = 1_000;

/**
 * Values are truncated to this length before the similarity DP.
 *
 * The cost is real and one-directional: two long strings that first differ
 * after character 64 score as identical, so the scan OVER-reports. That is the
 * safe direction here and only here, because a near-duplicate finding never
 * merges anything. It produces an exception, and the worst case of an extra
 * exception is a person spending ten seconds saying "no, those are different".
 */
const MAX_SIMILARITY_CHARS = 64;

/**
 * A row with more columns than this is not a spreadsheet, it is a parser
 * accident. Guarded because several functions build a union of column names
 * across every row and that union is otherwise unbounded in the column
 * dimension even when the row count is fine.
 */
const MAX_COLUMNS_PER_ROW = 512;

/** How many names a reviewReason lists before it starts counting instead. */
const MAX_NAMED_IN_REASON = 5;
/** How much of a client value a reviewReason may quote. */
const MAX_VALUE_IN_REASON = 60;

/* ────────────────────────────── small helpers ───────────────────────────── */

/**
 * A refusal reason may quote PARAMS (the operator wrote them, and naming the
 * column they asked for is the only way the message is actionable) and counts
 * derived from the data. It may never quote a cell value or a column name read
 * out of the client's file: refusals travel into operator tooling and logs,
 * which is a wider blast radius than the payload itself.
 */
const refuse = (reason: string): TransformOutcome => ({ ok: false, reason });

/**
 * `fields` and `sources` arrive from JSON, so they carry Object.prototype and a
 * client column literally named `constructor` or `toString` would otherwise
 * read back as a function through a `string | null` type. Every access in this
 * file goes through these two.
 */
function fieldValue(row: WorkflowRow, name: string): string | null {
  return Object.hasOwn(row.fields, name) ? (row.fields[name] ?? null) : null;
}

function hasField(row: WorkflowRow, name: string): boolean {
  return Object.hasOwn(row.fields, name);
}

function sourcesFor(row: WorkflowRow, name: string): string[] {
  return Object.hasOwn(row.sources, name) ? (row.sources[name] ?? []) : [];
}

function datasetNamed(
  datasets: Record<string, WorkflowRow[]>,
  name: string
): WorkflowRow[] | null {
  return Object.hasOwn(datasets, name) ? (datasets[name] ?? null) : null;
}

/**
 * Code-unit ordering. `localeCompare` is banned in this file: its answer
 * depends on the runtime's ICU data, so the same rows sorted on a developer's
 * machine and on the production host can come out in a different order, which
 * is precisely the class of difference a replay must not produce.
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Own-key count without materialising the key array. */
function countOwnKeys(obj: Record<string, unknown>, stopAt: number): number {
  let n = 0;
  for (const k in obj) {
    if (!Object.hasOwn(obj, k)) continue;
    n += 1;
    if (n > stopAt) return n;
  }
  return n;
}

/** Refusal reason, or null when the rows are within every bound. */
function guardRows(rows: WorkflowRow[], label: string): string | null {
  if (rows.length > MAX_TRANSFORM_ROWS) {
    return `${label} refused: ${rows.length} rows exceeds the ${MAX_TRANSFORM_ROWS} row ceiling for a deterministic transform. A person splits this mandate.`;
  }
  for (const row of rows) {
    if (countOwnKeys(row.fields, MAX_COLUMNS_PER_ROW) > MAX_COLUMNS_PER_ROW) {
      return `${label} refused: a row carries more than ${MAX_COLUMNS_PER_ROW} columns, which is a parse accident rather than a table.`;
    }
  }
  return null;
}

/** Every column name across the rows, sorted. Never object key order. */
function fieldNamesOf(rows: WorkflowRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const name of Object.keys(row.fields)) seen.add(name);
  }
  return [...seen].sort(compareStrings);
}

function clip(value: string): string {
  return value.length <= MAX_VALUE_IN_REASON
    ? value
    : `${value.slice(0, MAX_VALUE_IN_REASON)}...`;
}

function nameList(names: string[]): string {
  if (names.length <= MAX_NAMED_IN_REASON) return names.join(", ");
  const shown = names.slice(0, MAX_NAMED_IN_REASON).join(", ");
  return `${shown} and ${names.length - MAX_NAMED_IN_REASON} more`;
}

/**
 * The row, marked for a person, as a COPY.
 *
 * It REPLACES the row in the working set. It is never appended beside it:
 * appending is the delivery-duplication bug this phase closed, and there is no
 * situation in which one logical record should occupy two entries.
 *
 * Nothing in this file mutates an input row either. A step is replayed on its
 * predecessor's payload, and a primitive that edited that payload in place
 * would make the second attempt read different input than the first.
 */
function flagged(row: WorkflowRow, reason: string): WorkflowRow {
  return { ...row, status: "needs_review", reviewReason: reason };
}

/** What an exception says about a row whose lineage is not known. */
const NO_LINEAGE = "(no lineage recorded)";

function lineageOf(row: WorkflowRow): string {
  return row.rowId ?? NO_LINEAGE;
}

/**
 * Appends a reference to `into`, when there is something to reference.
 *
 * A row with no `rowId` gets NO exception: the contract says an absent id means
 * "no lineage known" and forbids inventing one, and an exception whose rowId
 * was made up would point a reviewer at a row that does not exist. The row has
 * already been flagged in place by the caller, so the finding is not lost; only
 * its machine-readable form is.
 *
 * `detail` is operator-facing. It may name a column and another row's lineage
 * id. It may never carry a cell's contents: the same sentence is written into
 * step summaries and admin screens that are not scoped to hold a confidential
 * file. The client-facing wording of the same finding is on the row.
 */
function reference(
  into: RowException[],
  row: WorkflowRow,
  code: RowException["code"],
  field: string | null,
  detail: string
): void {
  if (row.rowId === undefined) return;
  into.push({ rowId: row.rowId, code, field, detail });
}

/** The row with a new lineage, or with none at all when there is none to give. */
function withRowId(row: WorkflowRow, rowId: string | undefined): WorkflowRow {
  const next = { ...row };
  if (rowId === undefined) delete next.rowId;
  else next.rowId = rowId;
  return next;
}

/**
 * Injective join of key parts. `\` and `|` are escaped so that ["a|b", "c"] and
 * ["a", "b|c"] cannot collapse onto the same group; a collision here would
 * merge two groups whose totals are then both wrong.
 */
function joinKeyParts(parts: string[]): string {
  return parts.map((p) => p.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")).join(" | ");
}

/* ──────────────────────────── derived lineage ───────────────────────────── */

/**
 * The same escaping problem as joinKeyParts, one level up: a derived id is
 * built out of its parents' ids, and a parent id may itself contain a comma
 * (an XLSX sheet named "Q1,Q2" reaches an ingested id verbatim). Escaping the
 * separator keeps the map from parent pair to derived id injective, so two
 * different pairings can never mint the same lineage.
 */
function escapeIdPart(part: string): string {
  return part.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}

/**
 * The id of a row that genuinely has two parents.
 *
 * Undefined when either parent has no lineage. A half-known ancestry is not an
 * ancestry: recording `join(abc,)` would claim a provenance for a row whose
 * other half nobody can name, which is the invention the contract forbids.
 */
function pairedRowId(
  kind: string,
  left: WorkflowRow,
  right: WorkflowRow
): string | undefined {
  if (left.rowId === undefined || right.rowId === undefined) return undefined;
  return `${kind}(${escapeIdPart(left.rowId)},${escapeIdPart(right.rowId)})`;
}

/**
 * A 64 bit hash, as two independent 32 bit FNV-1a style passes.
 *
 * Integer operations only (`Math.imul` and `^`), so the answer is identical on
 * every runtime and every architecture. It exists for ONE job: an aggregate
 * group's id must identify the group without carrying the group's key text,
 * because that text is the client's own cell contents and a lineage id ends up
 * quoted in operator-facing exception details.
 *
 * A hash can collide, and a collision would merge two groups' lineage. That is
 * not left to probability: `aggregate` remembers which key each id was minted
 * from and REFUSES if a second key ever lands on the same id. So the hash width
 * is a question of how often the step gives up, never of whether it is right.
 */
function hash64(text: string): string {
  let a = 0x811c9dc5 | 0;
  let b = 0xc2b2ae35 | 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

/* ───────────────────────────── value parsing ────────────────────────────── */

const collapseSpace = (v: string) => v.replace(/\s+/g, " ").trim();

/** `1234`, `-12.5`, `1,234,567.89`, `.5`. Nothing ambiguous. */
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
const GROUPED_NUMBER = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * The canonical TEXT of a number, or null when the value is not unambiguously
 * one. Returns text rather than a Number on purpose: `Number("00012300")` round
 * trips to "12300" and `Number("1.10")` to "1.1", both of which are a reformat
 * the client never asked for, and a 20-digit account-like integer would lose
 * digits outright.
 *
 * `$1,200`, `1 200,50` and `12%` deliberately do NOT parse. Each of them has
 * more than one honest reading, and picking one is exactly the guess this
 * library refuses to make.
 */
function canonicalNumberText(raw: string): string | null {
  // The whitespace class already matches U+00A0 and U+202F, which is what a
  // French-formatted "1 234" actually contains. Spelling those two out as
  // literals would put invisible characters in the source for no gain.
  const compact = raw.replace(/\s/g, "");
  if (compact === "") return null;
  let body = compact;
  if (GROUPED_NUMBER.test(body)) body = body.replace(/,/g, "");
  if (!PLAIN_NUMBER.test(body)) return null;
  return body.startsWith("+") ? body.slice(1) : body;
}

/** The same parse, as a number, for gt/lt and the aggregate metrics. */
function parseNumeric(raw: string): number | null {
  const text = canonicalNumberText(raw);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * ISO date, or null. Only year-first forms are accepted, and the calendar is
 * checked by hand rather than through `Date` (whose parsing of anything
 * non-ISO is implementation defined, which is the same thing as
 * non-deterministic across runtimes).
 *
 * `03/04/2024` is REFUSED. It is the 3rd of April to half the client base and
 * the 4th of March to the other half, and a transform that silently picks one
 * has changed the client's data by a month without saying so.
 */
function toIsoDate(raw: string): string | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw.trim());
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Canadian postal code. The letter sets are the real ones (D, F, I, O, Q and U
 * are never used, and W and Z never lead), so a typo'd code fails to parse and
 * becomes a person's problem instead of a plausible-looking wrong address.
 */
function toPostalCa(raw: string): string | null {
  const m = /^([ABCEGHJ-NPRSTVXY])(\d)([ABCEGHJ-NPRSTV-Z])[\s-]?(\d)([ABCEGHJ-NPRSTV-Z])(\d)$/i.exec(
    collapseSpace(raw)
  );
  if (m === null) return null;
  return `${m[1]}${m[2]}${m[3]} ${m[4]}${m[5]}${m[6]}`.toUpperCase();
}

function toPostalUs(raw: string): string | null {
  const m = /^(\d{5})(?:[\s-]?(\d{4}))?$/.exec(collapseSpace(raw));
  if (m === null) return null;
  return m[2] === undefined ? m[1] : `${m[1]}-${m[2]}`;
}

/**
 * Lossy by nature: "McDonald" comes back "Mcdonald" and "IBM" comes back "Ibm".
 * It is in the schema because operators ask for it on address and city columns
 * where it is right, and the loss is visible to whoever wrote the rule. Nothing
 * else in this file destroys information this way.
 */
function toTitleCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}

/** The generic key normalisation: case folded and whitespace collapsed. */
function foldGeneric(value: string): string {
  return collapseSpace(value).toLowerCase();
}

/**
 * Which of pure.ts's normalisers applies to a column, by the same substring
 * rule normalize.contact_fields already uses. Reusing those functions rather
 * than writing a second phone parser is not tidiness: two phone normalisers
 * that disagree by one edge case produce a dedupe key that does not match the
 * value the client sees in the delivered file.
 */
function keyNormalizerFor(field: string): (v: string) => string {
  const key = field.toLowerCase();
  if (key.includes("email")) return (v) => normalizeEmail(v);
  if (key.includes("phone") || key.includes("telephone")) return (v) => normalizePhone(v);
  if (key.includes("website") || key.includes("url")) {
    // normalizeUrl returns "" for anything it cannot prove is http(s). For a
    // KEY that is the wrong answer: every unprovable URL would key the same and
    // merge unrelated rows. Fall back to the generic fold instead.
    return (v) => {
      const normalized = normalizeUrl(v);
      return normalized === "" ? foldGeneric(v) : normalized.toLowerCase();
    };
  }
  return foldGeneric;
}

/* ─────────────────────────── similarity scoring ─────────────────────────── */

/**
 * Levenshtein distance, abandoned as soon as it is known to exceed `cutoff`.
 * Returns `cutoff + 1` in that case, which is all the caller needs: it only
 * ever asks whether the pair is above a threshold.
 *
 * The two row buffers are passed in rather than allocated per call. Half a
 * million pairs times two allocations is the difference between a scan that
 * finishes and one that spends its time in the garbage collector. They are
 * fully overwritten on entry, so the function stays referentially transparent.
 */
function levenshteinWithin(
  a: string,
  b: string,
  cutoff: number,
  prev: Int32Array,
  curr: Int32Array
): number {
  const la = a.length;
  const lb = b.length;
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      let best = del < ins ? del : ins;
      if (sub < best) best = sub;
      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > cutoff) return cutoff + 1;
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

/**
 * Normalised similarity in 0..1, or 0 when the pair is provably below
 * `threshold`. Two empty strings score 0 rather than 1: a pair matched on two
 * blanks is not a duplicate, it is two rows that are both missing the column.
 */
function similarityAtLeast(
  a: string,
  b: string,
  threshold: number,
  prev: Int32Array,
  curr: Int32Array
): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const longest = la > lb ? la : lb;
  const cutoff = Math.floor((1 - threshold) * longest);
  // A length gap alone already costs that many edits, so most pairs never
  // reach the DP at all.
  if (Math.abs(la - lb) > cutoff) return 0;
  const distance = levenshteinWithin(a, b, cutoff, prev, curr);
  if (distance > cutoff) return 0;
  return 1 - distance / longest;
}

/** Three decimals, so the same pair always reads the same in a reviewReason. */
function scoreText(score: number): string {
  return (Math.round(score * 1000) / 1000).toFixed(3);
}

/* ────────────────────────────── data.dedupe ─────────────────────────────── */

/**
 * Merges rows that share a key, and NEVER merges on similarity.
 *
 * The survivor is kept whole, and it keeps its `rowId`: a survivor is the same
 * logical record it was before the step, so its lineage does not move. Field
 * values are not back-filled from the row that loses, even where the loser has
 * a value the survivor is missing: choosing which of two records is right about
 * a phone number is a judgement, `keep` only says which record to trust as a
 * whole, and a silently assembled chimera is unreconcilable against either
 * source row.
 *
 * A row whose key fields are all empty is never merged. Grouping every keyless
 * row together would collapse unrelated records on the strength of a shared
 * absence, which is the worst possible reason to merge two things.
 */
export function dedupe(rows: WorkflowRow[], params: DataDedupeParams): TransformOutcome {
  const guard = guardRows(rows, "data.dedupe");
  if (guard !== null) return refuse(guard);

  const normalizers =
    params.strategy === "normalized"
      ? params.keyFields.map((f) => keyNormalizerFor(f))
      : params.keyFields.map(() => (v: string) => v.trim());

  const groups = new Map<string, WorkflowRow[]>();
  /** First-occurrence order, so the output does not depend on Map internals. */
  const groupOrder: string[] = [];

  for (const row of rows) {
    const parts: string[] = [];
    let anyValue = false;
    for (let i = 0; i < params.keyFields.length; i++) {
      const raw = fieldValue(row, params.keyFields[i]);
      const part = raw === null ? "" : normalizers[i](raw);
      if (part !== "") anyValue = true;
      parts.push(part);
    }
    // A keyless row keys on its own identity: present in the output, merged
    // with nothing.
    const key = anyValue ? joinKeyParts(parts) : ` unkeyed ${row.unitKey}`;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [row]);
      groupOrder.push(key);
    } else {
      bucket.push(row);
    }
  }

  const survivors: WorkflowRow[] = [];
  for (const key of groupOrder) {
    const bucket = groups.get(key) ?? [];
    // keep=last still emits the group at the position of its FIRST member.
    // Emitting at the last member's position would reorder the file for a
    // reason the operator did not ask for.
    survivors.push(params.keep === "last" ? bucket[bucket.length - 1] : bucket[0]);
  }

  const exactMerged = rows.length - survivors.length;
  const near = params.reportNearDuplicates;
  if (near === null) {
    return {
      ok: true,
      rows: survivors,
      exceptions: [],
      summary: {
        rowsIn: rows.length,
        rowsOut: survivors.length,
        exactMerged,
        candidatePairs: 0,
        rowsFlagged: 0,
      },
    };
  }

  if (survivors.length > MAX_NEAR_DUPLICATE_ROWS) {
    return refuse(
      `data.dedupe refused: near-duplicate reporting compares every row with every other, and ${survivors.length} rows after exact merging is above the ${MAX_NEAR_DUPLICATE_ROWS} row ceiling for that scan. Sampling it would report "no duplicates" for the pairs it skipped, so the mandate goes to a person instead.`
    );
  }

  // Comparison strings are built once per row per field, bounded by
  // MAX_SIMILARITY_CHARS, BEFORE the quadratic loop starts.
  const comparable: string[][] = survivors.map((row) =>
    near.fields.map((f) => {
      const raw = fieldValue(row, f);
      return raw === null ? "" : foldGeneric(raw).slice(0, MAX_SIMILARITY_CHARS);
    })
  );

  const prev = new Int32Array(MAX_SIMILARITY_CHARS + 1);
  const curr = new Int32Array(MAX_SIMILARITY_CHARS + 1);
  /** row index -> the partners it is a candidate duplicate of, in scan order. */
  const partners = new Map<number, { other: number; score: number }[]>();
  let pairCount = 0;

  for (let i = 0; i < survivors.length; i++) {
    for (let j = i + 1; j < survivors.length; j++) {
      // The MINIMUM across the named fields, not the average: a pair is a
      // candidate only when it is similar on every field the operator named.
      // Averaging lets an identical city carry a completely different company
      // over the threshold, which is a candidate list nobody trusts twice.
      let score = 1;
      for (let f = 0; f < near.fields.length && score >= near.threshold; f++) {
        const s = similarityAtLeast(comparable[i][f], comparable[j][f], near.threshold, prev, curr);
        if (s < score) score = s;
      }
      if (score < near.threshold) continue;

      pairCount += 1;
      // Checked before the pair is stored, so the collection can never hold
      // more than maxPairs entries.
      if (pairCount > near.maxPairs) {
        return refuse(
          `data.dedupe refused: more than ${near.maxPairs} near-duplicate candidate pairs were found among ${survivors.length} rows. A list that long is not reviewable, so the whole mandate becomes human work rather than an exception queue nobody can finish.`
        );
      }
      const forI = partners.get(i);
      if (forI === undefined) partners.set(i, [{ other: j, score }]);
      else forI.push({ other: j, score });
      const forJ = partners.get(j);
      if (forJ === undefined) partners.set(j, [{ other: i, score }]);
      else forJ.push({ other: i, score });
    }
  }

  /**
   * ONE ENTRY PER ROW INVOLVED, NAMING EVERY PARTNER, rather than one per pair
   * member. A row in four pairs would otherwise appear four times in the queue
   * and be judged four times against a different half of the same cluster.
   *
   * Both members of a pair are flagged and both get a reference, so a reviewer
   * reaching either side of the pair sees it. The `field` is null because the
   * finding is about the whole record: the scan compares several columns and
   * the pair is a candidate only when it is similar on all of them.
   */
  const out = survivors.slice();
  const exceptions: RowException[] = [];
  for (let i = 0; i < survivors.length; i++) {
    const found = partners.get(i);
    if (found === undefined) continue;
    // Sorted by the partner's unitKey so the two renderings below list the same
    // partners in the same order, on every run and on every host.
    const ordered = found
      .slice()
      .sort((a, b) => compareStrings(survivors[a.other].unitKey, survivors[b.other].unitKey));
    const named = ordered.map(
      (p) => `${survivors[p.other].unitKey} (similarity ${scoreText(p.score)})`
    );
    const referenced = ordered.map(
      (p) => `${lineageOf(survivors[p.other])} (similarity ${scoreText(p.score)})`
    );
    out[i] = flagged(
      survivors[i],
      `Possible duplicate of ${nameList(named)}. Not merged: the key did not match exactly, so a person decides.`
    );
    reference(
      exceptions,
      survivors[i],
      "AMBIGUOUS_DUPLICATE",
      null,
      `Possible duplicate of ${nameList(referenced)}. Nothing was merged: the key did not match exactly.`
    );
  }

  return {
    ok: true,
    rows: out,
    exceptions,
    summary: {
      rowsIn: rows.length,
      rowsOut: out.length,
      exactMerged,
      candidatePairs: pairCount,
      rowsFlagged: partners.size,
    },
  };
}

/* ───────────────────────────── data.normalize ───────────────────────────── */

type NormalizeAs = DataNormalizeParams["rules"][number]["as"];

/** The formatted value, or null when the value does not parse for its type. */
function applyRule(value: string, as: NormalizeAs): string | null {
  switch (as) {
    case "trim":
      return value.trim();
    case "collapse_space":
      return collapseSpace(value);
    case "lower":
      return value.toLowerCase();
    case "upper":
      return value.toUpperCase();
    case "title_case":
      return toTitleCase(value);
    case "email": {
      const candidate = collapseSpace(value);
      return EMAIL_SHAPE.test(candidate) ? normalizeEmail(candidate) : null;
    }
    case "phone_na": {
      // The parse test is done here rather than by reading normalizePhone's
      // output because that function's contract is to return the collapsed
      // ORIGINAL when it cannot parse. Collapsing is still a change, and this
      // rule promises the value is left exactly as written.
      const digits = value.replace(/\D/g, "");
      const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
      return ten.length === 10 ? normalizePhone(value) : null;
    }
    case "url": {
      const normalized = normalizeUrl(value);
      return normalized === "" ? null : normalized;
    }
    case "number":
      return canonicalNumberText(value);
    case "date_iso":
      return toIsoDate(value);
    case "postal_ca":
      return toPostalCa(value);
    case "postal_us":
      return toPostalUs(value);
  }
}

/**
 * Reformats values; never replaces, blanks or invents one. The row keeps its
 * `rowId`: reformatting a cell does not make the record a different record.
 *
 * A value that does not parse for its declared type is left byte-for-byte as
 * the client wrote it and the row is flagged. Not blanked, not defaulted, not
 * "best effort" parsed: the client will reconcile the delivered file against
 * their own, and a cell that changed without their instruction is a defect they
 * find before we do.
 *
 * One exception per FIELD, because each column failed for its own declared
 * type and an operator counting UNPARSEABLE_VALUE by column is counting the
 * rule that needs rewriting. Bounded by the 40 rule ceiling on the params.
 *
 * A null value is not an exception. There is nothing to parse in an absent
 * value, and flagging every hole in the file would bury the rows that actually
 * need a decision.
 */
export function normalize(rows: WorkflowRow[], params: DataNormalizeParams): TransformOutcome {
  const guard = guardRows(rows, "data.normalize");
  if (guard !== null) return refuse(guard);

  /**
   * A rule naming a column that is in NO row is the operator having written
   * rules for a different file. Doing nothing quietly is the failure this
   * whole library exists to prevent, so it refuses, exactly as schema_map does
   * for the same mistake. Skipped on an empty dataset, where every column is
   * absent for an innocent reason.
   */
  if (rows.length > 0) {
    const present = new Set(fieldNamesOf(rows));
    const orphans = [...new Set(params.rules.map((r) => r.field))]
      .filter((f) => !present.has(f))
      .sort(compareStrings);
    if (orphans.length > 0) {
      return refuse(
        `data.normalize refused: the rules name ${orphans.length} column(s) that are not in this dataset (${nameList(orphans)}). Those rules were written for a different file, and applying the rest would report a normalisation that did not happen.`
      );
    }
  }

  const out: WorkflowRow[] = [];
  const exceptions: RowException[] = [];
  let valuesChanged = 0;
  let rowsFlagged = 0;

  for (const row of rows) {
    const fields: Record<string, string | null> = { ...row.fields };
    /** Field to the type it failed to parse as. First failure per field wins. */
    const unparsed: { field: string; as: NormalizeAs }[] = [];
    for (const rule of params.rules) {
      const current = Object.hasOwn(fields, rule.field) ? (fields[rule.field] ?? null) : null;
      if (current === null) continue;
      const result = applyRule(current, rule.as);
      if (result === null) {
        // Left exactly as written. Recorded once per field even if two rules on
        // the same column both failed: the row's problem is the column, and the
        // second rule was going to run on the same unchanged text.
        if (!unparsed.some((u) => u.field === rule.field)) {
          unparsed.push({ field: rule.field, as: rule.as });
        }
        continue;
      }
      if (result !== current) valuesChanged += 1;
      fields[rule.field] = result;
    }
    const normalized: WorkflowRow = { ...row, fields };
    if (unparsed.length === 0) {
      out.push(normalized);
      continue;
    }
    rowsFlagged += 1;
    out.push(
      flagged(
        normalized,
        `Left exactly as written because the value does not parse for its declared type: ${nameList(unparsed.map((u) => u.field))}.`
      )
    );
    for (const u of unparsed) {
      reference(
        exceptions,
        normalized,
        "UNPARSEABLE_VALUE",
        u.field,
        `Left exactly as written: the value in this column does not parse as ${u.as}.`
      );
    }
  }

  return {
    ok: true,
    rows: out,
    exceptions,
    summary: {
      rowsIn: rows.length,
      rowsOut: out.length,
      valuesChanged,
      rowsFlagged,
    },
  };
}

/* ─────────────────────────────── data.join ──────────────────────────────── */

function mergeSources(
  left: Record<string, string[]>,
  right: Record<string, string[]>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const names = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareStrings);
  for (const name of names) {
    const merged = [
      ...(Object.hasOwn(left, name) ? (left[name] ?? []) : []),
      ...(Object.hasOwn(right, name) ? (right[name] ?? []) : []),
    ];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const url of merged) {
      if (seen.has(url)) continue;
      seen.add(url);
      unique.push(url);
    }
    out[name] = unique;
  }
  return out;
}

/** The left row alone, padded so the output stays rectangular. */
function paddedWith(row: WorkflowRow, columns: string[]): WorkflowRow {
  const fields: Record<string, string | null> = { ...row.fields };
  for (const name of columns) if (!Object.hasOwn(fields, name)) fields[name] = null;
  return { ...row, fields };
}

/**
 * Inner or left join on an EXACT key, after trimming.
 *
 * The key is compared byte-for-byte. Case folding or punctuation stripping a
 * join key is a decision with a real failure mode (two genuinely different
 * account codes that differ only in case) and the operator did not write it
 * down, so it is not made here. `data.normalize` exists for exactly that, and
 * running it first is a choice somebody made on purpose.
 *
 * ── WHAT COMES OUT, AND UNDER WHICH LINEAGE ──
 *
 * A matched row is a NEW logical record built from two parents, so it gets a
 * derived id: `join(left,right)`. A left row that was kept without a partner
 * (unmatched under a left join, or one the step refused to merge) is the same
 * record it always was, padded, so it KEEPS its own id.
 *
 * ── AN UNMERGEABLE ROW IS EMITTED UNMERGED, NEVER DROPPED ──
 *
 * An ambiguous key and a conflicting column both stop the merge: picking one of
 * two right-hand rows, or one of two values, is a guess. But the left row is
 * still the client's record, so it is emitted AS IT CAME IN and flagged, rather
 * than left out of the output with a note about it somewhere else. This is the
 * one place the file departs from SQL, and the reason is that the previous
 * behaviour (emit nothing, report separately) only ever looked correct because
 * the wiring silently appended the report back into the dataset.
 *
 * The whole merge is refused, not the contested column of it: a row carrying
 * the right side's uncontested columns and not its contested one is a chimera
 * that reconciles against neither source file.
 */
export function join(
  datasets: Record<string, WorkflowRow[]>,
  params: DataJoinParams
): TransformOutcome {
  const left = datasetNamed(datasets, params.left);
  const right = datasetNamed(datasets, params.right);
  if (left === null) {
    return refuse(`data.join refused: no dataset named "${params.left}" is present in this run.`);
  }
  if (right === null) {
    return refuse(`data.join refused: no dataset named "${params.right}" is present in this run.`);
  }
  const leftGuard = guardRows(left, "data.join");
  if (leftGuard !== null) return refuse(leftGuard);
  const rightGuard = guardRows(right, "data.join");
  if (rightGuard !== null) return refuse(rightGuard);

  const index = new Map<string, WorkflowRow[]>();
  let rightWithoutKey = 0;
  for (const row of right) {
    const raw = fieldValue(row, params.rightKey);
    const key = raw === null ? "" : raw.trim();
    if (key === "") {
      rightWithoutKey += 1;
      continue;
    }
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [row]);
    else bucket.push(row);
  }

  // Unmatched left rows are padded with the right side's columns so the output
  // is rectangular. A CSV whose column set depends on whether a row matched is
  // a file no importer reads twice.
  const rightColumns = fieldNamesOf(right);

  const out: WorkflowRow[] = [];
  const exceptions: RowException[] = [];
  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let conflicts = 0;

  for (const row of left) {
    const raw = fieldValue(row, params.leftKey);
    const key = raw === null ? "" : raw.trim();
    const bucket = key === "" ? undefined : index.get(key);

    if (bucket === undefined) {
      unmatched += 1;
      if (params.type === "left") out.push(paddedWith(row, rightColumns));
      continue;
    }

    if (bucket.length > 1) {
      ambiguous += 1;
      out.push(
        flagged(
          paddedWith(row, rightColumns),
          `Ambiguous match: the "${params.right}" dataset has ${bucket.length} rows with this join key, and picking one of them would be a guess.`
        )
      );
      reference(
        exceptions,
        row,
        "AMBIGUOUS_JOIN_KEY",
        params.leftKey,
        `The "${params.right}" dataset holds ${bucket.length} rows under this row's join key, so no partner was chosen and nothing was merged.`
      );
      continue;
    }

    const partner = bucket[0];
    const fields: Record<string, string | null> = { ...row.fields };
    const contested: string[] = [];
    for (const name of fieldNamesOf([partner])) {
      const rightValue = fieldValue(partner, name);
      const leftValue = Object.hasOwn(fields, name) ? (fields[name] ?? null) : null;
      if (rightValue === null) continue;
      if (leftValue === null) {
        // Filling a hole is not a conflict: there is only one value on offer.
        fields[name] = rightValue;
        continue;
      }
      if (leftValue === rightValue) continue;
      contested.push(name);
      if (params.onConflict === "prefer_right") fields[name] = rightValue;
    }

    if (contested.length > 0) {
      conflicts += 1;
      if (params.onConflict === "exception") {
        const described = contested.map(
          (name) =>
            `${name}: "${clip(fieldValue(row, name) ?? "")}" on the left, "${clip(fieldValue(partner, name) ?? "")}" on the right`
        );
        out.push(
          flagged(
            paddedWith(row, rightColumns),
            `Both sides carry a different value for ${nameList(described)}.`
          )
        );
        for (const name of contested) {
          reference(
            exceptions,
            row,
            "CONFLICTING_VALUE",
            name,
            `The matching "${params.right}" row ${lineageOf(partner)} carries a different value in this column, so the merge was refused and nothing was taken from either side.`
          );
        }
        continue;
      }
    }

    matched += 1;
    out.push({
      ...withRowId(row, pairedRowId("join", row, partner)),
      fields,
      sources: mergeSources(row.sources, partner.sources),
    });
  }

  return {
    ok: true,
    rows: out,
    exceptions,
    summary: {
      leftRows: left.length,
      rightRows: right.length,
      rightRowsWithoutKey: rightWithoutKey,
      matched,
      unmatched,
      ambiguous,
      conflicts,
      rowsOut: out.length,
    },
  };
}

/* ────────────────────────────── data.filter ─────────────────────────────── */

type Condition = DataFilterParams["conditions"][number];

/** true / false / null, where null means "this row cannot be decided". */
function evaluate(row: WorkflowRow, condition: Condition): boolean | null {
  const value = fieldValue(row, condition.field);
  switch (condition.op) {
    case "empty":
      return value === null || value.trim() === "";
    case "not_empty":
      return value !== null && value.trim() !== "";
    case "eq":
      // A null field is not equal to anything the operator can have typed,
      // and it IS different from every non-null value, so neq holds.
      return value !== null && value.trim() === (condition.value ?? "").trim();
    case "neq":
      return value === null || value.trim() !== (condition.value ?? "").trim();
    case "contains":
      return value !== null && value.includes(condition.value ?? "");
    case "not_contains":
      return value === null || !value.includes(condition.value ?? "");
    case "gt":
    case "lt": {
      if (value === null) return null;
      const cell = parseNumeric(value);
      if (cell === null) return null;
      const bound = parseNumeric(condition.value ?? "");
      if (bound === null) return null;
      return condition.op === "gt" ? cell > bound : cell < bound;
    }
  }
}

/**
 * Keeps or drops rows. Comparisons are case sensitive and are made on the value
 * as written, because a case-insensitive match is a different instruction and
 * the operator did not write it. A surviving row keeps its `rowId`: a filter
 * chooses rows, it does not rewrite them.
 *
 * ── AN UNDECIDABLE ROW SURVIVES, WHATEVER `action` SAYS ──
 *
 * A gt/lt against a value that is not a number does not evaluate to false. A
 * silent false quietly drops the row (or quietly keeps it, under `drop`), and
 * "we could not compare this" and "this is below the threshold" are not the
 * same fact.
 *
 * So the row is KEPT, under `keep` and under `drop` alike, flagged, with the
 * column named. That is a decision with a cost and this is the cost: under
 * `drop` the output can contain a row the operator's rule might have removed,
 * so the count is not the count they expected and a person has to look. The
 * alternative costs more. A filter removes what the rule EXCLUDES, and a rule
 * that could not be evaluated has excluded nothing; deleting the row would be
 * deleting a client record on the strength of a comparison that never happened,
 * and nothing downstream could tell it apart from a legitimate removal.
 */
export function filter(rows: WorkflowRow[], params: DataFilterParams): TransformOutcome {
  const guard = guardRows(rows, "data.filter");
  if (guard !== null) return refuse(guard);

  for (let i = 0; i < params.conditions.length; i++) {
    const c = params.conditions[i];
    const needsValue = c.op !== "empty" && c.op !== "not_empty";
    if (needsValue && c.value === null) {
      return refuse(
        `data.filter refused: condition ${i + 1} uses "${c.op}" with no value to compare against.`
      );
    }
    if ((c.op === "gt" || c.op === "lt") && parseNumeric(c.value ?? "") === null) {
      // Refused rather than turned into a per-row exception: the fault is in
      // the frozen params, no client data is involved, and letting it through
      // would send every row in the file to the exception queue.
      return refuse(
        `data.filter refused: condition ${i + 1} compares with "${c.op}" against a value that is not a number.`
      );
    }
  }

  const kept: WorkflowRow[] = [];
  const exceptions: RowException[] = [];
  let rowsFlagged = 0;

  for (const row of rows) {
    let decided: boolean | null = null;
    const undecidable: string[] = [];
    if (params.match === "all") {
      let anyFalse = false;
      for (const c of params.conditions) {
        const verdict = evaluate(row, c);
        if (verdict === false) anyFalse = true;
        else if (verdict === null && !undecidable.includes(c.field)) undecidable.push(c.field);
      }
      // A definite false settles `all` whatever the undecidable ones would
      // have said, so those rows never reach a person for nothing.
      decided = anyFalse ? false : undecidable.length > 0 ? null : true;
    } else {
      let anyTrue = false;
      for (const c of params.conditions) {
        const verdict = evaluate(row, c);
        if (verdict === true) anyTrue = true;
        else if (verdict === null && !undecidable.includes(c.field)) undecidable.push(c.field);
      }
      decided = anyTrue ? true : undecidable.length > 0 ? null : false;
    }

    if (decided === null) {
      rowsFlagged += 1;
      // Kept at its own position in the file, not appended at the end: the
      // order of the client's rows is not this step's to rearrange.
      kept.push(
        flagged(
          row,
          `Cannot be filtered: a numeric comparison was asked for on a value that is not a number (${nameList(undecidable)}).`
        )
      );
      for (const field of undecidable) {
        reference(
          exceptions,
          row,
          "NON_NUMERIC_COMPARISON",
          field,
          `This column was compared as a number and does not hold one, so the filter could not place the row. It was kept rather than removed, because a rule that did not evaluate has excluded nothing.`
        );
      }
      continue;
    }
    const matches = params.action === "keep" ? decided : !decided;
    if (matches) kept.push(row);
  }

  return {
    ok: true,
    rows: kept,
    exceptions,
    summary: {
      rowsIn: rows.length,
      rowsOut: kept.length,
      rowsRemoved: rows.length - kept.length,
      rowsFlagged,
    },
  };
}

/* ───────────────────────────── data.aggregate ───────────────────────────── */

/**
 * Groups rows and computes the metrics. Every group produces exactly ONE row,
 * under an id derived from the group's own key.
 *
 * ── A POISONED METRIC IS EMPTY, NEVER PARTIAL ──
 *
 * A group containing a value that is not a number under sum/avg/min/max gets
 * NULL for every metric over that column, and the group's row is flagged. Not a
 * partial total: a total that is wrong by one row's worth is indistinguishable
 * from a right one at the point where somebody acts on it. `count` is never
 * affected, because counting rows needs nothing from the values, and metrics
 * over a clean column in the same group are still computed.
 *
 * The group's row is emitted rather than withheld. Withholding it was the older
 * behaviour and it only ever worked because the wiring appended the report back
 * into the dataset; an empty cell next to a flagged row states "we have no
 * figure for this group", which is the true thing, while a missing row states
 * nothing at all.
 *
 * Nulls are skipped by sum/avg/min/max, as in SQL: an absent value contributes
 * nothing and is not in the average's denominator. A metric with no values at
 * all comes back null rather than 0, because "they sold nothing" is a claim and
 * "we have no figures" is the truth.
 */
export function aggregate(rows: WorkflowRow[], params: DataAggregateParams): TransformOutcome {
  const guard = guardRows(rows, "data.aggregate");
  if (guard !== null) return refuse(guard);

  const outputNames = new Set<string>();
  for (const metric of params.metrics) {
    if (metric.fn !== "count" && metric.field === null) {
      return refuse(
        `data.aggregate refused: the "${metric.as}" metric uses "${metric.fn}" with no field to compute over.`
      );
    }
    if (outputNames.has(metric.as)) {
      return refuse(
        `data.aggregate refused: two metrics both write to "${metric.as}", so one would overwrite the other.`
      );
    }
    outputNames.add(metric.as);
  }
  for (const g of params.groupBy) {
    if (outputNames.has(g)) {
      return refuse(
        `data.aggregate refused: a metric writes to "${g}", which is also a grouping column.`
      );
    }
  }

  const groups = new Map<string, { parts: string[]; rows: WorkflowRow[] }>();
  for (const row of rows) {
    const parts = params.groupBy.map((f) => (fieldValue(row, f) ?? "").trim());
    const key = joinKeyParts(parts);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, { parts, rows: [row] });
    else bucket.rows.push(row);
  }

  // Sorted by group key, never by Map insertion order: two runs over the same
  // rows in a different order must produce the same file.
  const keys = [...groups.keys()].sort(compareStrings);

  const out: WorkflowRow[] = [];
  const exceptions: RowException[] = [];
  /** Minted id to the group key it was minted from, so a clash is caught. */
  const minted = new Map<string, string>();
  let groupsFlagged = 0;

  for (const key of keys) {
    const group = groups.get(key);
    if (group === undefined) continue;
    const fields: Record<string, string | null> = {};
    for (let i = 0; i < params.groupBy.length; i++) {
      fields[params.groupBy[i]] = group.parts[i] === "" ? null : group.parts[i];
    }

    const poisoned: string[] = [];
    for (const metric of params.metrics) {
      if (metric.fn === "count") {
        // A named field counts the rows that HAVE a value there; no field
        // counts the rows themselves.
        fields[metric.as] =
          metric.field === null
            ? String(group.rows.length)
            : String(
                group.rows.filter((r) => {
                  const v = fieldValue(r, metric.field as string);
                  return v !== null && v.trim() !== "";
                }).length
              );
        continue;
      }

      const field = metric.field as string;
      const values: { n: number; text: string }[] = [];
      let bad = false;
      for (const r of group.rows) {
        const raw = fieldValue(r, field);
        if (raw === null || raw.trim() === "") continue;
        const n = parseNumeric(raw);
        if (n === null) {
          bad = true;
          break;
        }
        values.push({ n, text: raw.trim() });
      }
      if (bad) {
        if (!poisoned.includes(field)) poisoned.push(field);
        // Written as an absence rather than skipped, so the group's row has the
        // same columns as every other one.
        fields[metric.as] = null;
        continue;
      }
      if (values.length === 0) {
        fields[metric.as] = null;
        continue;
      }

      // Sorted ascending before anything is summed. Floating-point addition is
      // not associative, so summing in row order would make the last digit of
      // a total depend on the order the file happened to arrive in, and a
      // replay of the same step could then disagree with itself.
      values.sort((a, b) => (a.n - b.n !== 0 ? a.n - b.n : compareStrings(a.text, b.text)));
      if (metric.fn === "min") fields[metric.as] = values[0].text;
      else if (metric.fn === "max") fields[metric.as] = values[values.length - 1].text;
      else {
        let sum = 0;
        for (const v of values) sum += v.n;
        fields[metric.as] = metric.fn === "sum" ? String(sum) : String(sum / values.length);
      }
    }

    /**
     * The id is a function of the group's IDENTITY, not of its members' ids:
     * the group is what the operator asked for, and it exists whether or not
     * the rows underneath it carry a lineage of their own.
     *
     * Hashed rather than embedded, because the group key is the client's own
     * cell text and a lineage id is quoted verbatim into operator-facing
     * exception details. Canonicalised as sorted `column | value` pairs, so
     * naming the same columns in a different order in `groupBy` identifies the
     * same group.
     */
    const canonical = joinKeyParts(
      params.groupBy.map((f, i) => joinKeyParts([f, group.parts[i]])).sort(compareStrings)
    );
    const rowId = `agg(${hash64(canonical)})`;
    const clash = minted.get(rowId);
    if (clash !== undefined && clash !== canonical) {
      // Two different groups on one lineage id would merge their exceptions and
      // point a reviewer at the wrong total. Astronomically unlikely, and the
      // house rule is to refuse rather than to rely on that.
      return refuse(
        `data.aggregate refused: two different groups produced the same internal lineage id, so their exceptions could not be told apart. A person runs this mandate.`
      );
    }
    minted.set(rowId, canonical);

    const groupRow: WorkflowRow = {
      rowId,
      unitKey: key,
      fields,
      sources: {},
      // A computed group was never verified against two independent sources
      // and never could be. `needs_review` over `verified` because claiming a
      // verification nobody performed is the one direction that cannot be
      // walked back once the file is delivered.
      status: "needs_review",
      reviewReason: null,
    };

    if (poisoned.length === 0) {
      out.push(groupRow);
      continue;
    }
    groupsFlagged += 1;
    out.push(
      flagged(
        groupRow,
        `This group was not totalled: ${nameList(poisoned)} holds a value that is not a number, and a wrong total is worse than an absent one.`
      )
    );
    for (const field of poisoned) {
      reference(
        exceptions,
        groupRow,
        "POISONED_AGGREGATE",
        field,
        `Every metric over this column was left empty for this group: one of the grouped rows holds a value that is not a number, and a total that is wrong by one row reads exactly like a right one.`
      );
    }
  }

  return {
    ok: true,
    rows: out,
    exceptions,
    summary: {
      rowsIn: rows.length,
      groups: keys.length,
      rowsOut: out.length,
      groupsFlagged,
    },
  };
}

/* ────────────────────────────── data.compare ────────────────────────────── */

export const CHANGE_FIELD = "_change";
export const CHANGED_FIELDS_FIELD = "_changed_fields";

/**
 * Key-matched diff. `left` is the before, `right` is the after, so a key only
 * on the left is `removed` and a key only on the right is `added`.
 *
 * Duplicate keys on either side are a refusal, not an exception. A diff whose
 * key matches two rows has no defined answer at all: there is no such thing as
 * a partially meaningful comparison, so there is nothing to hand a person
 * except the original files.
 *
 * A diff row is a new logical record made of one or two parents, so it gets a
 * derived id: `cmp(before,after)`, with the missing side left empty for an
 * added or a removed key. A row whose parent has no lineage produces a diff row
 * with none either, because half an ancestry is not one.
 *
 * The output row carries the CURRENT state (the right side's values, or the
 * left's for a removed key) plus the names of the columns that moved. The
 * previous values are not in the diff. That is a real cost, paid so that the
 * output has the same columns as the input instead of twice as many; a caller
 * who needs the old value still has the left dataset in the payload.
 *
 * A row with no value in the key column cannot be placed on either side. It is
 * emitted anyway, at the end, with an empty verdict and a flag, because the
 * only alternative is dropping a record the client gave us. Its `_change` cell
 * is empty on purpose: "this row was not compared" is the honest reading, and
 * inventing a fourth verdict for it would put a word in the column that the
 * three real ones have to be told apart from.
 */
export function compare(
  datasets: Record<string, WorkflowRow[]>,
  params: DataCompareParams
): TransformOutcome {
  const left = datasetNamed(datasets, params.left);
  const right = datasetNamed(datasets, params.right);
  if (left === null) {
    return refuse(`data.compare refused: no dataset named "${params.left}" is present in this run.`);
  }
  if (right === null) {
    return refuse(
      `data.compare refused: no dataset named "${params.right}" is present in this run.`
    );
  }
  const leftGuard = guardRows(left, "data.compare");
  if (leftGuard !== null) return refuse(leftGuard);
  const rightGuard = guardRows(right, "data.compare");
  if (rightGuard !== null) return refuse(rightGuard);

  const leftColumns = fieldNamesOf(left);
  const rightColumns = fieldNamesOf(right);
  for (const reserved of [CHANGE_FIELD, CHANGED_FIELDS_FIELD]) {
    if (leftColumns.includes(reserved) || rightColumns.includes(reserved)) {
      return refuse(
        `data.compare refused: a source column is already named "${reserved}", which is the column the diff writes its verdict into. Overwriting it would destroy the client's own data.`
      );
    }
  }

  const exceptions: RowException[] = [];
  /** Rows that could not be placed on either side, kept for a person. */
  const unplaceable: WorkflowRow[] = [];

  /** Refusal reason, or the index. Duplicate keys are fatal by design. */
  function indexSide(rows: WorkflowRow[], side: string): Map<string, WorkflowRow> | string {
    const map = new Map<string, WorkflowRow>();
    let duplicates = 0;
    for (const row of rows) {
      const raw = fieldValue(row, params.key);
      const key = raw === null ? "" : raw.trim();
      if (key === "") {
        const blank: Record<string, string | null> = {
          ...row.fields,
          [CHANGE_FIELD]: null,
          [CHANGED_FIELDS_FIELD]: null,
        };
        unplaceable.push(
          flagged(
            { ...row, fields: blank },
            `This row has no value in the comparison key "${params.key}", so it could not be placed on either side of the diff.`
          )
        );
        /**
         * UNPARSEABLE_VALUE is the closest code in the closed vocabulary: the
         * cell holds nothing that can be read as a key. There is no
         * MISSING_KEY, and widening the vocabulary is a change to a shared
         * contract that this step is not the right place to make.
         */
        reference(
          exceptions,
          row,
          "UNPARSEABLE_VALUE",
          params.key,
          `The comparison key is empty in this row, so it belongs to neither side of the diff and was carried through uncompared.`
        );
        continue;
      }
      if (map.has(key)) duplicates += 1;
      else map.set(key, row);
    }
    if (duplicates > 0) {
      return `data.compare refused: the "${side}" dataset has ${duplicates} row(s) repeating a value of the key column "${params.key}". A diff over an ambiguous key has no defined answer.`;
    }
    return map;
  }

  const leftIndex = indexSide(left, params.left);
  if (typeof leftIndex === "string") return refuse(leftIndex);
  const rightIndex = indexSide(right, params.right);
  if (typeof rightIndex === "string") return refuse(rightIndex);

  const compared =
    params.compareFields.length > 0
      ? [...new Set(params.compareFields)].sort(compareStrings)
      : // Every column on both sides, minus the key: comparing the key against
        // itself is guaranteed to agree and would pad every diff row for
        // nothing.
        leftColumns.filter((c) => rightColumns.includes(c) && c !== params.key);

  const allKeys = [...new Set([...leftIndex.keys(), ...rightIndex.keys()])].sort(compareStrings);

  const out: WorkflowRow[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  /** `cmp(before,after)`, with an empty half for a side that does not exist. */
  const diffRowId = (
    before: WorkflowRow | undefined,
    after: WorkflowRow | undefined
  ): string | undefined => {
    const parts: string[] = [];
    for (const parent of [before, after]) {
      if (parent === undefined) {
        parts.push("");
        continue;
      }
      if (parent.rowId === undefined) return undefined;
      parts.push(escapeIdPart(parent.rowId));
    }
    return `cmp(${parts[0]},${parts[1]})`;
  };

  for (const key of allKeys) {
    const before = leftIndex.get(key);
    const after = rightIndex.get(key);

    if (before === undefined && after !== undefined) {
      added += 1;
      out.push({
        ...withRowId(after, diffRowId(before, after)),
        unitKey: key,
        fields: { ...after.fields, [CHANGE_FIELD]: "added", [CHANGED_FIELDS_FIELD]: null },
      });
      continue;
    }
    if (after === undefined && before !== undefined) {
      removed += 1;
      out.push({
        ...withRowId(before, diffRowId(before, after)),
        unitKey: key,
        fields: { ...before.fields, [CHANGE_FIELD]: "removed", [CHANGED_FIELDS_FIELD]: null },
      });
      continue;
    }
    if (before === undefined || after === undefined) continue;

    const differing: string[] = [];
    for (const column of compared) {
      const b = fieldValue(before, column);
      const a = fieldValue(after, column);
      if (b !== a) differing.push(column);
    }
    if (differing.length > 0) changed += 1;
    else unchanged += 1;
    out.push({
      ...withRowId(after, diffRowId(before, after)),
      unitKey: key,
      fields: {
        ...after.fields,
        [CHANGE_FIELD]: differing.length > 0 ? "changed" : "unchanged",
        [CHANGED_FIELDS_FIELD]: differing.length > 0 ? differing.join(", ") : null,
      },
    });
  }

  // Appended after the diff, ordered by a key derived from the rows themselves
  // rather than by which dataset happened to be indexed first, so the output
  // does not depend on the order either file arrived in.
  const trailing = unplaceable
    .slice()
    .sort(
      (a, b) => compareStrings(lineageOf(a), lineageOf(b)) || compareStrings(a.unitKey, b.unitKey)
    );
  for (const row of trailing) out.push(row);

  return {
    ok: true,
    rows: out,
    exceptions,
    summary: {
      leftRows: left.length,
      rightRows: right.length,
      added,
      removed,
      changed,
      unchanged,
      rowsOut: out.length,
      rowsFlagged: unplaceable.length,
    },
  };
}

/* ──────────────────────────── data.schema_map ───────────────────────────── */

/**
 * Renames columns per the EXPLICIT mapping and infers nothing. The row keeps
 * its `rowId` across the rebuild: a renamed column is the same record under a
 * new header, and this is precisely the case where object identity failed as a
 * lineage, because every row here is a brand new object.
 *
 * A mapping whose `from` is in no row at all is a refusal, not a column of
 * nulls: the operator wrote that mapping for a different file, and a file full
 * of empty cells under the right header is the single hardest defect for a
 * client to notice.
 *
 * Under `unmapped: "exception"` a column nobody mapped is carried through under
 * its ORIGINAL name and the row is flagged. Dropping it would be the `drop`
 * behaviour, which is a separate instruction the operator has to have written;
 * refusing outright would strand a mandate over a stray column. So the data
 * survives and the decision is visible, which is the only combination that
 * loses nothing.
 */
export function schemaMap(rows: WorkflowRow[], params: DataSchemaMapParams): TransformOutcome {
  const guard = guardRows(rows, "data.schema_map");
  if (guard !== null) return refuse(guard);

  const targets = new Set<string>();
  for (const pair of params.mapping) {
    if (targets.has(pair.to)) {
      return refuse(
        `data.schema_map refused: two source columns both map onto "${pair.to}", so one would silently overwrite the other.`
      );
    }
    targets.add(pair.to);
  }

  // An empty dataset makes every `from` absent for an innocent reason, so the
  // existence check is skipped rather than turned into a refusal.
  if (rows.length === 0) {
    return {
      ok: true,
      rows: [],
      exceptions: [],
      summary: { rowsIn: 0, rowsOut: 0, mappedColumns: params.mapping.length, unmappedColumns: 0, rowsFlagged: 0 },
    };
  }

  const present = fieldNamesOf(rows);
  const presentSet = new Set(present);
  const orphans = params.mapping
    .map((m) => m.from)
    .filter((f) => !presentSet.has(f))
    .sort(compareStrings);
  if (orphans.length > 0) {
    return refuse(
      `data.schema_map refused: ${orphans.length} mapped source column(s) do not exist in this dataset (${nameList([...new Set(orphans)])}). Proceeding would produce a column of nulls under a header that looks correct.`
    );
  }

  const mappedFrom = new Set(params.mapping.map((m) => m.from));
  const unmapped = present.filter((c) => !mappedFrom.has(c));

  if (params.unmapped === "exception") {
    // The carried-through column keeps its own name, so a mapping that targets
    // that same name would collide with it.
    const collisions = unmapped.filter((c) => targets.has(c)).sort(compareStrings);
    if (collisions.length > 0) {
      return refuse(
        `data.schema_map refused: ${collisions.length} mapping target(s) collide with an unmapped source column of the same name, which would merge two different columns into one.`
      );
    }
  }

  const out: WorkflowRow[] = [];
  const exceptions: RowException[] = [];
  let rowsFlagged = 0;

  for (const row of rows) {
    const fields: Record<string, string | null> = {};
    const sources: Record<string, string[]> = {};
    for (const pair of params.mapping) {
      fields[pair.to] = fieldValue(row, pair.from);
      const s = sourcesFor(row, pair.from);
      if (s.length > 0) sources[pair.to] = s;
    }
    const carried: string[] = [];
    if (params.unmapped === "exception") {
      for (const column of unmapped) {
        if (!hasField(row, column)) continue;
        carried.push(column);
        fields[column] = fieldValue(row, column);
        const s = sourcesFor(row, column);
        if (s.length > 0) sources[column] = s;
      }
    }
    // Keys rebuilt in sorted order so the output object never inherits the
    // input file's column order through the back door.
    const ordered: Record<string, string | null> = {};
    for (const name of Object.keys(fields).sort(compareStrings)) ordered[name] = fields[name];

    const mapped: WorkflowRow = { ...row, fields: ordered, sources };
    if (carried.length === 0) {
      out.push(mapped);
      continue;
    }
    rowsFlagged += 1;
    out.push(
      flagged(
        mapped,
        `Carried through unmapped, because the mapping does not say where they belong: ${nameList(carried)}.`
      )
    );
    for (const column of carried) {
      reference(
        exceptions,
        mapped,
        "UNMAPPED_COLUMN",
        column,
        `Carried through under its original name: the mapping does not say where this column belongs.`
      );
    }
  }

  return {
    ok: true,
    rows: out,
    exceptions,
    summary: {
      rowsIn: rows.length,
      rowsOut: out.length,
      mappedColumns: params.mapping.length,
      unmappedColumns: unmapped.length,
      rowsFlagged,
    },
  };
}
