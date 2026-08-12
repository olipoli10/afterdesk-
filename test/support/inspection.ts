import type { FileInspection } from "@/lib/ai-work-engine/data-class";

/**
 * A FileInspection written the way a test wants to read one: the column names,
 * then the rows underneath them.
 *
 * The inspection type carries columns rather than two parallel lists because
 * the classifier needs to know which cell sits under which name. Tests should
 * not have to spell that association out by hand every time, and a helper that
 * builds it from a header row plus data rows keeps the fixtures looking like
 * the spreadsheets they stand for.
 *
 * Cells past the last header land in `unkeyedValues`, exactly as the real
 * inspector places them: they are real data and the value-shape scan must still
 * see them, but no rule that needs a column name may pretend to have one.
 */
export function inspectedFile(
  fileId: string,
  headers: string[],
  rows: string[][] = []
): FileInspection {
  const columns = headers.map((header) => ({ header, values: [] as string[] }));
  const unkeyedValues: string[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === "") continue;
      if (i < columns.length) columns[i].values.push(row[i]);
      else unkeyedValues.push(row[i]);
    }
  }
  return { fileId, inspected: true, columns, unkeyedValues };
}

/** A file the inspector could not open. Never a safe file. */
export function uninspectableFile(fileId: string): FileInspection {
  return { fileId, inspected: false, columns: [], unkeyedValues: [] };
}
