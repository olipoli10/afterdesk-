import { sanitizeClientText } from "@/lib/ai-work-engine/client-scope";

/**
 * WHAT THE PERSON IS TOLD when the machine hands the mandate over.
 *
 * Pure code, in lib rather than server, for the same reason residual.ts is:
 * this text is the entire briefing a worker gets, nobody reviews it before it
 * reaches them, and it has already been wrong twice. It has to be exercisable
 * offline, in every branch, without a database.
 *
 * The two failures it is written against, both found on live runs:
 *
 *  1. A worker was told "0 of 12 records are already filled in" and handed an
 *     eight-kilobyte file with eleven fully populated rows in it. DRAFTED and
 *     VERIFIED are different numbers and both have to be said, in that order.
 *  2. A fully-human run attaches no candidate file, and the copy still opened
 *     with "open the attached candidate file and read the status column" —
 *     sending the worker to look for a file that does not exist. Their first
 *     move would be to ask an operator, which is exactly the contact this
 *     platform is built to avoid.
 */

export type HumanPackageCopy = {
  objective: string;
  whatIsAlreadyDone: string;
  instructions: string;
  checklist: string[];
};

export function buildHumanPackageCopy(input: {
  unitsRemaining: number;
  unitsTotal: number;
  /** Whether a candidate file is actually attached to this package. */
  hasCandidate: boolean;
  /** Rows the machine drafted, verified or not. */
  draftedRows: number;
  /** Rows that cleared the two-source bar and need no further work. */
  verifiedRows: number;
}): HumanPackageCopy {
  const drafted = Math.max(0, input.draftedRows);
  const verified = Math.max(0, Math.min(input.verifiedRows, drafted));

  /**
   * NO CANDIDATE FILE MEANS NO VOCABULARY ABOUT ONE. Nothing here may mention
   * an attachment, a status column, or a verified row: on this branch none of
   * the three exists. A sensitive-data mandate, a plan with no primitives and
   * an abandoned machine block all land here.
   */
  if (!input.hasCandidate || drafted === 0) {
    return {
      objective: sanitizeClientText(
        `Research and verify ${input.unitsRemaining} of ${input.unitsTotal} records.`
      ),
      whatIsAlreadyDone: sanitizeClientText(
        "Nothing was completed automatically. Every record is yours to research, and there is no candidate file to start from."
      ),
      instructions: sanitizeClientText(
        "Build the file from scratch against the brief. " +
          "Every field needs two independent published sources, recorded in that field's source column. " +
          "A record you cannot confirm is marked unavailable with a reason: never guess a value.",
        2000
      ),
      checklist: [
        "Read the brief and the required fields before starting.",
        "Research each record against the stated criteria.",
        "Record two independent sources per field you fill.",
        "Mark anything unconfirmed as unavailable, with a short reason.",
        "Deliver the finished file.",
      ],
    };
  }

  const alreadyDone =
    verified === 0
      ? `${drafted} of ${input.unitsTotal} records are drafted with their sources in the attached file, but none of them clear the two-source bar yet, so every row still needs your check. Drafted is a head start, not a result.`
      : `${verified} of ${input.unitsTotal} records are done and sourced, and ${drafted - verified} more are drafted but not yet confirmed. The attached file has every row, its sources and a status column.`;

  return {
    objective: sanitizeClientText(
      `Finish and verify ${input.unitsRemaining} of ${input.unitsTotal} records.`
    ),
    whatIsAlreadyDone: sanitizeClientText(alreadyDone),
    instructions: sanitizeClientText(
      "Work only the rows marked needs_review or not_found, and the rows missing from the file. " +
        "Do not change a row marked verified. " +
        "Every field you complete needs two independent published sources, recorded in that field's source column. " +
        "A record you cannot confirm stays marked unavailable with a reason: never guess a value.",
      2000
    ),
    checklist: [
      "Open the attached candidate file and read the status column.",
      "Leave every verified row untouched.",
      "Complete or correct the rows marked needs_review.",
      "Add the rows the file is missing, up to the stated total.",
      "Record two independent sources per field you fill.",
      "Mark anything unconfirmed as unavailable, with a short reason.",
      "Deliver the finished file.",
    ],
  };
}
