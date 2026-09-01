import "server-only";
import { parseCsv } from "@/lib/ai-work-engine/codecs/csv";
import { parseXlsx } from "@/lib/ai-work-engine/codecs/xlsx";
import type { FileInspection } from "@/lib/ai-work-engine/data-class";

/**
 * READING THE FILE BEFORE DECIDING WHAT MAY TOUCH IT.
 *
 * The classification model reads the BRIEF. It has never read an attachment
 * and it still does not: a model is not in this path at all, deliberately.
 * Asking a provider what is inside a file, in order to decide whether that
 * file may be shown to a provider, is a circle that ends with the answer
 * always being yes.
 *
 * So this is deterministic code, run locally, before the quote: open the
 * spreadsheet, read the column names, sample a bounded number of values, hand
 * the shapes to classifyMandateData. Everything it produces is structural —
 * header text and a sample — and the verdict it feeds carries reasons naming
 * columns, never contents.
 *
 * ── WHAT AN INSPECTION FAILURE MEANS ──
 *
 * `inspected: false`, which classifyMandateData escalates to human-only. Not
 * because an unreadable file is probably sensitive, but because we know
 * nothing about it, and the branch for "we know nothing" must be the same as
 * the branch for "this is dangerous". A PDF, a scanned image, a workbook
 * outside the supported subset and a file over a bound all land here, and all
 * of them correctly mean: a person does this mandate.
 */

/**
 * Values sampled per file, spread across the first rows rather than taken from
 * one. A payment-card column that starts with three empty rows would slip past
 * a sample that only read row one, and the cost of reading a few hundred cells
 * is nothing against the cost of missing that.
 *
 * The sample is taken ROW BY ROW rather than column by column, and the global
 * cap is applied across the row sweep. That ordering is what keeps a wide file
 * fair: each row contributes at most one cell to every column, so forty columns
 * share the four hundred cells as ten rows each rather than the first sixteen
 * columns eating the whole budget and the rest arriving unsampled — which would
 * silently mean "we looked" for columns nobody looked at.
 */
const SAMPLE_ROWS = 25;
const MAX_SAMPLED_VALUES = 400;

/**
 * The inspector refuses a file larger than this rather than spending a request
 * inflating it. Deliberately well under the 25 MB upload cap: a spreadsheet
 * that big is not a spreadsheet a deterministic transform should be quoting
 * on, and the honest quote for it is a person's time.
 */
const MAX_INSPECT_BYTES = 8 * 1024 * 1024;

export type InspectableFile = {
  id: string;
  fileName: string;
  sizeBytes: number;
  read: () => Promise<Buffer>;
};

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i === -1 ? "" : fileName.slice(i + 1).toLowerCase();
}

/** One file's structural reading. Never throws: a throw would be a verdict. */
export async function inspectFile(file: InspectableFile): Promise<FileInspection> {
  const unreadable: FileInspection = {
    fileId: file.id,
    inspected: false,
    columns: [],
    unkeyedValues: [],
  };

  if (file.sizeBytes > MAX_INSPECT_BYTES) return unreadable;

  const ext = extensionOf(file.fileName);
  if (ext !== "csv" && ext !== "xlsx") return unreadable;

  try {
    const bytes = await file.read();
    const parsed =
      ext === "csv"
        ? parseCsv(bytes, { hasHeaderRow: true, delimiter: null })
        : parseXlsx(bytes, { sheet: null, hasHeaderRow: true });
    if (!parsed.ok) return unreadable;

    const columns = parsed.table.headers.map((header) => ({ header, values: [] as string[] }));
    const unkeyedValues: string[] = [];
    let sampled = 0;
    for (const row of parsed.table.rows.slice(0, SAMPLE_ROWS)) {
      for (let i = 0; i < row.length; i++) {
        if (sampled >= MAX_SAMPLED_VALUES) break;
        const cell = row[i];
        if (cell === "") continue;
        /**
         * A cell past the last header belongs to no column, and a rule that
         * needs a name must not be handed one it invented.
         *
         * Both codecs refuse a ragged file outright today, so this branch does
         * not fire — csv.ts rejects rather than pads, for the same reason. It
         * is kept because the alternative is to drop such a cell on the floor:
         * if a future codec ever admits a wider row, the value-shape scan must
         * still see those cells rather than silently stop looking at them.
         */
        if (i < columns.length) columns[i].values.push(cell);
        else unkeyedValues.push(cell);
        sampled++;
      }
      if (sampled >= MAX_SAMPLED_VALUES) break;
    }

    return {
      fileId: file.id,
      inspected: true,
      columns,
      unkeyedValues,
    };
  } catch {
    /**
     * A storage read that failed, a buffer that could not be decoded, anything
     * at all. Swallowed on purpose and turned into "not inspected": the
     * classifier's job is to be conservative, and an exception escaping here
     * would fail the whole pricing pipeline over a file we simply could not
     * open.
     */
    return unreadable;
  }
}

/** Every attachment, inspected. Order follows the input, for reproducibility. */
export async function inspectFiles(files: InspectableFile[]): Promise<FileInspection[]> {
  const out: FileInspection[] = [];
  for (const f of files) out.push(await inspectFile(f));
  return out;
}
