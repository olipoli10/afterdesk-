import {
  CODEC_LIMITS,
  decodeUtf8,
  okTable,
  refuse,
  syntheticHeaders,
  validateHeaders,
  type CodecResult,
} from "@/lib/ai-work-engine/codecs/table";

/**
 * RFC 4180 CSV, READ AS UNTRUSTED BYTES.
 *
 * Pure: no `server-only`, no database, no network, no clock, no randomness. The
 * runner replays a step in full after a crash, so the same buffer and the same
 * options must land on the same table forever. Every decision below is
 * therefore made from the bytes alone, including delimiter detection, which is
 * the one place a CSV reader is usually tempted to be clever.
 *
 * ── WHAT THIS PARSER REFUSES, AND WHY EACH REFUSAL IS THE CHEAP OUTCOME ──
 *
 * A refusal becomes human work: the mandate is quoted as a person's job and
 * someone opens the file. That is a visible, payable cost. Every alternative on
 * this list is invisible.
 *
 *   invalid UTF-8            Replacing bad bytes with U+FFFD produces plausible
 *                            mojibake that survives deduplication and reaches
 *                            the client as a name spelled wrong.
 *   unterminated quote       The rest of the file is one cell, or it is not; we
 *                            cannot know which, and both readings are lossy.
 *   a ragged row             PADDING INVENTS CELLS. A row with 5 values under a
 *                            7 column header is either a missing field or a
 *                            missing delimiter, and filling two blanks decides
 *                            that on the client's behalf, in the one place they
 *                            will never check.
 *   a duplicate header       A mapping onto two columns of the same name picks
 *                            one silently. See validateHeaders.
 *   an empty header          A column nothing can refer to.
 *
 * ── AND WHAT IT DELIBERATELY ACCEPTS ──
 *
 * A bare `"` INSIDE AN UNQUOTED FIELD is kept as a literal character. RFC 4180
 * says a field containing a quote must be quoted, so `ab"cd` is technically
 * malformed, but there is exactly one way to read it and taking it literally
 * invents nothing. A stray `"` inside a QUOTED field is the opposite: `"ab"cd"`
 * has several readings, so it refuses. The asymmetry is the rule this file
 * follows everywhere. Unambiguous is parsed, ambiguous is refused.
 *
 * A BARE CR is a record terminator. It can only appear unquoted in a file
 * written by classic Mac software or in a corrupted one, and both want the same
 * treatment. CRLF is one terminator, not two.
 */

const QUOTE = 0x22;
const CR = "\r";
const LF = "\n";

export type CsvDelimiter = "," | ";" | "\t" | "|";

/**
 * TIES RESOLVE IN THIS ORDER, TOP TO BOTTOM, AND THE ORDER IS PART OF THE
 * CONTRACT. Comma first because it is the format's name; semicolon second
 * because it is what every European Excel export produces; then tab; then pipe.
 *
 * The alternative implementations are all disqualified for the same reason: a
 * detector that consults the locale, the environment or a "confidence score"
 * gives a different answer on a different machine, and this decision is
 * replayed after a crash on whichever machine picks the step up.
 */
const DELIMITER_PREFERENCE: readonly CsvDelimiter[] = [",", ";", "\t", "|"];

/**
 * Counts each candidate on the first non-empty line, OUTSIDE quoted fields.
 * Counting inside quotes is how `"Smith, John"` turns a semicolon-delimited
 * file into a comma-delimited one.
 *
 * A file whose first line contains no candidate at all is a single-column file,
 * which parses identically under all four; the comma is returned so the answer
 * is stable rather than arbitrary.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts = new Map<string, number>(DELIMITER_PREFERENCE.map((d) => [d, 0]));
  let sawContent = false;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text.charCodeAt(i + 1) === QUOTE) i++;
        else inQuotes = false;
      }
      sawContent = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawContent = true;
      continue;
    }
    if (ch === LF || ch === CR) {
      // A leading blank line is skipped rather than treated as the first line.
      // No counts can have accumulated yet: sawContent is false only when
      // nothing at all, delimiter included, has been read.
      if (sawContent) break;
      continue;
    }
    const seen = counts.get(ch);
    if (seen !== undefined) counts.set(ch, seen + 1);
    sawContent = true;
  }

  let best: CsvDelimiter = ",";
  let bestCount = -1;
  for (const candidate of DELIMITER_PREFERENCE) {
    const n = counts.get(candidate) ?? 0;
    // Strictly greater, so a tie keeps the earlier candidate.
    if (n > bestCount) {
      best = candidate;
      bestCount = n;
    }
  }
  return best;
}

export function parseCsv(
  buffer: Buffer,
  opts: { hasHeaderRow: boolean; delimiter: CsvDelimiter | null }
): CodecResult {
  // BEFORE the decode, which allocates a string the size of the input.
  if (buffer.length > CODEC_LIMITS.maxBytes) {
    return refuse(`The file is larger than the ${CODEC_LIMITS.maxBytes} byte ceiling.`);
  }
  if (buffer.length === 0) return refuse("The file is empty.");
  /**
   * Same check as validateCsv in src/lib/file-security.ts, repeated rather than
   * imported because that module is `server-only` and this one cannot be. A NUL
   * is valid UTF-8 and would decode cleanly, so the strict decoder below does
   * not catch it; what it actually indicates is a UTF-16 file saved with the
   * wrong extension, whose every other byte is 0x00.
   */
  if (buffer.includes(0)) {
    return refuse("The file contains a NUL byte, so it is not plain text.");
  }

  const text = decodeUtf8(buffer);
  if (text === null) {
    return refuse("The file is not valid UTF-8. Re-export it as UTF-8.");
  }

  const delimiter = opts.delimiter ?? detectDelimiter(text);
  const scanned = scanRecords(text, delimiter);
  if (typeof scanned === "string") return refuse(scanned);

  if (scanned.length === 0) return refuse("The file has no rows.");

  const headers = opts.hasHeaderRow ? scanned[0].cells : syntheticHeaders(scanned[0].cells.length);
  const dataRecords = opts.hasHeaderRow ? scanned.slice(1) : scanned;

  const headerProblem = validateHeaders(headers);
  if (headerProblem !== null) return refuse(headerProblem);

  if (dataRecords.length > CODEC_LIMITS.maxRows) {
    return refuse(`The file has more than ${CODEC_LIMITS.maxRows} data rows.`);
  }

  const rows: string[][] = [];
  for (const record of dataRecords) {
    if (record.cells.length !== headers.length) {
      // `record.position` is the record's own place in the file, counted
      // through any blank lines that were skipped, so an operator opening the
      // file lands on the line the message names.
      return refuse(
        `Row ${record.position} has ${record.cells.length} columns where the header names ${headers.length}. Padding it would invent cells, so the file is refused instead.`
      );
    }
    rows.push(record.cells);
  }

  return okTable({ headers, rows });
}

type CsvRecord = { cells: string[]; position: number };

/**
 * The scanner. Returns the records, or a refusal reason as a string.
 *
 * Index-based rather than character-by-character accumulation: a 25 MB file is
 * up to 25 million characters, and building each cell with `+=` would allocate
 * a new string per character. Every field is either one slice of the source or,
 * for a quoted field containing doubled quotes, a small array of slices.
 *
 * Every bound is checked before the allocation it guards, which for `maxCellChars`
 * means measuring the span BEFORE slicing it out of the source.
 */
function scanRecords(text: string, delimiter: string): CsvRecord[] | string {
  const n = text.length;
  const records: CsvRecord[] = [];
  let current: string[] = [];
  let cells = 0;
  let recordsSeen = 0;
  // Set by the first record and never revised; it decides whether a blank line
  // is a row or a separator (see flush).
  let columnCount = -1;
  let i = 0;

  const flush = (): string | null => {
    recordsSeen++;
    const isBlankLine = current.length === 1 && current[0] === "";
    if (columnCount === -1) {
      columnCount = current.length;
    } else if (isBlankLine && columnCount !== 1) {
      /**
       * A BLANK LINE IS NOT A ROW, AND THIS IS NOT PADDING.
       *
       * With two or more columns a real row carries at least one delimiter, so
       * a record of zero characters cannot be one: skipping it drops no cell.
       * That is a different act from padding a short row, which manufactures
       * cells that were never written.
       *
       * With exactly ONE column the two are indistinguishable at the byte
       * level, and there a blank line IS a legitimate empty value. It is kept.
       * Dropping it would be the data loss this whole file exists to prevent,
       * and the cost of keeping it is one extra empty row on a file that ends
       * with a spare newline.
       */
      current = [];
      return null;
    }
    if (records.length >= CODEC_LIMITS.maxRows + 1) {
      return `The file has more than ${CODEC_LIMITS.maxRows} data rows.`;
    }
    records.push({ cells: current, position: recordsSeen });
    current = [];
    return null;
  };

  while (i < n) {
    let value: string;

    if (text.charCodeAt(i) === QUOTE) {
      i++;
      const parts: string[] = [];
      let length = 0;
      for (;;) {
        const close = text.indexOf('"', i);
        if (close < 0) {
          return `A quoted field starting on row ${recordsSeen + 1} is never closed.`;
        }
        length += close - i;
        if (length > CODEC_LIMITS.maxCellChars) {
          return `A cell on row ${recordsSeen + 1} is longer than ${CODEC_LIMITS.maxCellChars} characters.`;
        }
        parts.push(text.slice(i, close));
        i = close + 1;
        if (text.charCodeAt(i) === QUOTE) {
          // "" inside a quoted field is one literal quote, per RFC 4180.
          parts.push('"');
          length++;
          if (length > CODEC_LIMITS.maxCellChars) {
            return `A cell on row ${recordsSeen + 1} is longer than ${CODEC_LIMITS.maxCellChars} characters.`;
          }
          i++;
          continue;
        }
        break;
      }
      value = parts.length === 1 ? parts[0] : parts.join("");
      if (i < n) {
        const after = text[i];
        if (after !== delimiter && after !== LF && after !== CR) {
          return `Row ${recordsSeen + 1} has a stray quote character inside a quoted field, so where the field ends is ambiguous.`;
        }
      }
    } else {
      let j = i;
      while (j < n) {
        const ch = text[j];
        if (ch === delimiter || ch === LF || ch === CR) break;
        j++;
      }
      if (j - i > CODEC_LIMITS.maxCellChars) {
        return `A cell on row ${recordsSeen + 1} is longer than ${CODEC_LIMITS.maxCellChars} characters.`;
      }
      value = text.slice(i, j);
      i = j;
    }

    cells++;
    if (cells > CODEC_LIMITS.maxCells) {
      return `The file holds more than ${CODEC_LIMITS.maxCells} cells.`;
    }
    if (current.length >= CODEC_LIMITS.maxColumns) {
      return `A row has more than ${CODEC_LIMITS.maxColumns} columns.`;
    }
    current.push(value);

    if (i >= n) break;
    const separator = text[i];
    if (separator === delimiter) {
      i++;
      continue;
    }
    if (separator === CR) {
      i++;
      if (text.charCodeAt(i) === 0x0a) i++;
    } else {
      i++;
    }
    const problem = flush();
    if (problem !== null) return problem;
  }

  // The final record only exists when the file did not end on a terminator; a
  // trailing newline must not manufacture an empty row.
  if (current.length > 0) {
    const problem = flush();
    if (problem !== null) return problem;
  }

  return records;
}
