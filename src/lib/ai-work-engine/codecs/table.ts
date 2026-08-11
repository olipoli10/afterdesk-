/**
 * THE SHAPE EVERY CODEC RETURNS, AND THE NUMBERS THAT BOUND IT.
 *
 * NO IMPORTS IN THIS FILE, deliberately, for the same reason data-class.ts has
 * none: these bounds are the only thing standing between a client's upload and
 * this process's memory, and a bound that can only be read by server code is a
 * bound the pure compiler and the unit tests cannot check.
 *
 * ── ROWS ARE STRINGS, ALL OF THEM, ALWAYS ──
 *
 * `Table.rows` is `string[][]` and nothing in this layer infers a type. A codec
 * reports what the file SAYS; deciding that "0123" is a number, that "N/A" is a
 * null, or that "01/02/03" is a date is a transform, it is configured
 * (data.normalize takes explicit rules), and it belongs to a step the client
 * approved. A codec that infers has already destroyed the leading zero of a
 * postal code before anyone could object.
 *
 * The one place a stored value is reformatted is an XLSX date serial, and it is
 * not an inference: the cell's own number format declares it a date, and the
 * serial is meaningless without that conversion. See xlsx.ts.
 *
 * ── WHY `truncated: false` IS A LITERAL AND NOT A BOOLEAN ──
 *
 * A file over any bound REFUSES. It is never read partially, never capped at
 * the first N rows, never "read as much as fits". The literal type is how that
 * promise is enforced by the compiler instead of by a comment: there is no
 * value a codec could construct that says a result was cut short, so no future
 * edit can add a quiet truncation path without changing this type first, in a
 * diff a reviewer will see.
 *
 * A silently truncated client file is the worst outcome available here, worse
 * than doing nothing. Nothing downstream can detect it: the rows look real, the
 * deliverable looks complete, and the missing half surfaces months later at the
 * client, who has by then reconciled against it. A refusal, by contrast, is a
 * mandate that a person does. That is a cost we can see and pay.
 *
 * ── REFUSAL REASONS CARRY NO CLIENT DATA ──
 *
 * `reason` is written for an operator and travels into step summaries, logs and
 * admin screens. It therefore names POSITIONS and COUNTS ("row 412 has 5
 * columns where the header names 7"), never contents, never a header's text.
 * The one thing a codec has in its hands is the client's own confidential file;
 * quoting it into an error string is how that file leaks into places that were
 * never scoped to hold it.
 */

export type Table = {
  headers: string[];
  rows: string[][];
};

/** Operator-facing, positional, and free of anything the client wrote. */
export type CodecRefusal = { ok: false; reason: string };

export type CodecOk = { ok: true; table: Table; truncated: false };

export type CodecResult = CodecOk | CodecRefusal;

/**
 * THE BOUNDS. Every one of them is checked BEFORE the allocation it protects,
 * never after, because "allocate then measure" is not a bound at all on input a
 * stranger chose the size of.
 *
 * ── maxBytes: 25 MiB ──
 *
 * Exactly DEFAULT_SETTINGS.maxFileSizeMB (src/lib/settings.ts). Not a coincidence
 * and not an independent guess: a file larger than the upload ceiling cannot be
 * a file this platform accepted, so a larger buffer arriving here means the
 * caller reached past the upload path and the honest answer is to refuse.
 *
 * The number does three jobs, and the second and third are the ones that matter:
 *
 *   1. the input buffer may not exceed it;
 *   2. the DECLARED uncompressed size of the ZIP members of an XLSX may not
 *      exceed it, checked from the central directory before a single byte is
 *      inflated (a 40 KB archive declaring 4 GB is refused having allocated
 *      nothing);
 *   3. the total number of CHARACTERS materialised into a Table may not exceed
 *      it. Job 3 exists because XLSX shared strings are a compression bomb that
 *      survives every ZIP-level check: 25 MB of sheet XML is roughly a million
 *      `<c t="s" v="0"/>` cells, and each one can point at the same 32,000
 *      character shared string. Bounding the archive alone would let 25 MB of
 *      input become tens of gigabytes of JavaScript strings.
 *
 * ── maxRows: 50,000 ──
 *
 * A hundred times extract.structured_rows' 500-row cap, and the multiple is
 * deliberate rather than generous. That cap bounds what a MODEL may emit, where
 * every row costs tokens and invites fabrication. This is deterministic local
 * code reading a file the client already has: the row count is a fact, not a
 * budget. A 50,000 row CRM export is an ordinary back-office file, and refusing
 * it would refuse the exact class of mandate this phase exists to serve.
 *
 * ── maxColumns: 256, maxCells: 1,000,000 ──
 *
 * Both dimensions are bounded, and so is their PRODUCT, because 50,000 x 256 is
 * 12.8 million cells and is not a file anyone typed. The product bound is the
 * one that actually protects the process: cells become JavaScript strings and
 * then a JSON payload persisted on the step row, so a million cells is already
 * tens of megabytes per step.
 *
 * The trade this makes, stated plainly because it will be hit: a 50,000 row file
 * with 30 columns REFUSES at 1.5 million cells even though both dimensions are
 * legal. That is the intended direction. A job that size is a data-warehouse
 * job, and a bounded step that half-does it is worse than a person who is told
 * up front that it is theirs.
 *
 * ── maxCellChars: 32,767 ──
 *
 * Excel's own hard ceiling on the contents of one cell. A cell longer than any
 * spreadsheet can hold did not come out of a spreadsheet, so there is no honest
 * file this rejects.
 *
 * ── maxSheetCount: 200 ──
 *
 * Matched to primitive-params.ts, where ingest.xlsx accepts a sheet index of
 * 0..199. If this were lower, an operator could freeze a step selecting a sheet
 * index the codec would always refuse, and the contradiction would only surface
 * at run time on an accepted contract. Cheap to allow, because exactly ONE sheet
 * is ever parsed: the others are names in a manifest, not work.
 */
export const CODEC_LIMITS = {
  maxBytes: 26_214_400,
  maxRows: 50_000,
  maxColumns: 256,
  maxCells: 1_000_000,
  maxCellChars: 32_767,
  maxSheetCount: 200,
} as const;

export function refuse(reason: string): CodecRefusal {
  return { ok: false, reason };
}

export function okTable(table: Table): CodecOk {
  return { ok: true, table, truncated: false };
}

/**
 * `fatal: true` is the entire point: the default TextDecoder replaces every
 * malformed sequence with U+FFFD and returns a string that LOOKS fine, which
 * means a Latin-1 export would arrive as plausible mojibake, be deduplicated
 * against, and be delivered. An encoding we cannot decode is a file a person
 * re-exports, not a file we guess at.
 *
 * `ignoreBOM: true` because the caller strips the BOM itself (see stripBom).
 * With the default the decoder would ALSO eat a leading U+FEFF, so a file whose
 * first cell legitimately begins with a zero-width no-break space would lose it
 * after the byte-level strip had already removed the real BOM.
 */
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Drops exactly one UTF-8 BOM. Returns the input untouched when absent. */
export function stripBom(bytes: Uint8Array): Uint8Array {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return hasBom ? bytes.subarray(3) : bytes;
}

/** Strict UTF-8, BOM removed. Null means "this is not UTF-8", never a guess. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return UTF8.decode(stripBom(bytes));
  } catch {
    return null;
  }
}

/**
 * Header names when the file has no header row. `column_1`, not `A`: the name
 * has to survive being written into a mapping, a filter predicate and a CSV
 * header, and a bare letter reads as a spreadsheet coordinate that would then
 * disagree with the sheet's real one the moment a column is dropped.
 */
export function syntheticHeaders(count: number): string[] {
  const headers: string[] = [];
  for (let i = 0; i < count; i++) headers.push(`column_${i + 1}`);
  return headers;
}

/**
 * The header rules, shared by both codecs so they cannot drift apart.
 *
 * Returns a refusal reason, or null when the headers are usable.
 *
 * DUPLICATES ARE COMPARED CASE-INSENSITIVELY AND WHITESPACE-COLLAPSED, which is
 * stricter than string equality and deliberately so. The question is not
 * whether two headers are the same bytes, it is whether a mapping onto them
 * would be ambiguous, and `Email` beside `email ` is ambiguous to every human
 * who will ever write that mapping. Refusing costs one renamed column; guessing
 * costs a silently overwritten field.
 *
 * The original strings are never modified. Comparison folds, storage does not:
 * a codec that trimmed headers would be inventing a column name.
 */
export function validateHeaders(headers: string[]): string | null {
  if (headers.length === 0) return "The file has no columns.";
  if (headers.length > CODEC_LIMITS.maxColumns) {
    return `The file has more than ${CODEC_LIMITS.maxColumns} columns.`;
  }
  const seen = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    const raw = headers[i];
    const folded = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (folded === "") {
      return `Header cell ${i + 1} is empty, so the column it names cannot be referred to.`;
    }
    const first = seen.get(folded);
    if (first !== undefined) {
      return `Header cells ${first + 1} and ${i + 1} are the same column name, so a mapping onto them would be ambiguous.`;
    }
    seen.set(folded, i);
  }
  return null;
}

/**
 * DELIBERATELY NOT HERE: a `tableToRows(table, opts)` that turns a Table into
 * the engine's WorkflowRow[]. That conversion needs a key column, a dataset
 * name and the payload's own conventions, all of which are the integrator's
 * concern; a codec that reached into WorkflowPayload would stop being a codec
 * and start being a primitive. These files read and write files. That is all.
 */
