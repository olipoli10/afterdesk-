/**
 * RULE 1: filenames cross the divide in both directions and can carry an
 * identity — "AcmeCorp_CRM_export.xlsx" names the client, "maria_santos_v2.xlsx"
 * names the worker.
 *
 * These labels are the single source of truth for what a counterpart sees, and
 * they must match what the download route puts in Content-Disposition, so the
 * name in a listing is the name that lands on disk.
 */

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot) : "";
}

/** What a worker sees for a client's input file. */
export function inputFileLabel(fileName: string, taskId: string, fileId: string): string {
  return `task-${taskId.slice(-6)}-input-${fileId.slice(-4)}${extensionOf(fileName)}`;
}

/** What a client sees for a worker's deliverable. */
export function deliverableFileLabel(fileName: string, taskId: string): string {
  return `task-${taskId.slice(-6)}-deliverable${extensionOf(fileName)}`;
}
