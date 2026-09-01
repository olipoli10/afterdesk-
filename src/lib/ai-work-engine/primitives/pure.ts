import {
  withRows,
  type PrimitiveContext,
  type PrimitiveResult,
  type RowStatus,
  type WorkflowPayload,
  type WorkflowRow,
} from "@/lib/ai-work-engine/primitives/types";
import {
  addToTally,
  emptyTally,
  type ExceptionCauseTally,
  type FieldExceptionCause,
} from "@/lib/ai-work-engine/exception-cause";

/**
 * THE THREE PURE PRIMITIVES. No network, no model, no database — same inputs,
 * same outputs, always. They are the majority of the machine block on purpose:
 * everything that can be decided by rules is, so the model only does what
 * genuinely needs judgment.
 *
 * They are also the reason a replay is safe. A step reclaimed after a lease
 * expiry re-runs from its predecessor's payload and lands on the same answer.
 */

// ── normalize.contact_fields ──────────────────────────────────────────────

const collapse = (v: string) => v.replace(/\s+/g, " ").trim();

/**
 * North American phone formatting. Anything that is not ten digits (or eleven
 * starting with 1) is LEFT AS WRITTEN rather than coerced: a number we cannot
 * parse is a number a person must look at, and silently reshaping it would
 * hide that.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return collapse(raw);
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Lowercases and trims. Does NOT validate deliverability and does not claim
 * to: docs/VERIFIED-PROSPECT-STANDARD.md is explicit that a syntax check is
 * not a verification, and this function is a formatter, not a gate.
 */
export function normalizeEmail(raw: string): string {
  return collapse(raw).toLowerCase();
}

/**
 * Adds a scheme when missing and strips a trailing slash. Never guesses a host.
 *
 * RETURNS "" FOR ANYTHING IT CANNOT PROVE IS AN ORDINARY http(s) URL, and the
 * caller turns "" into null. The previous version returned the raw string from
 * its catch branch, which meant `javascript:alert(1)` travelled through
 * unchanged and was written into the `website` column of the CSV handed to the
 * client. That is not an SSRF risk, it is an active payload in a deliverable:
 * spreadsheet and browser software will happily make it clickable.
 *
 * A dropped value is a value a person then fills in. A payload that survives
 * normalisation is a payload nobody sees until it is in the client's hands, so
 * the failure direction is not a close call.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = collapse(raw);
  if (trimmed === "") return trimmed;
  // A scheme is only added when NONE is present. Prefixing a string that
  // already carries `javascript:` or `data:` would build a nonsense URL that
  // happens to parse; refusing outright is the honest move.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return "";
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    // Credentials are dropped by rebuilding from protocol + host, and a host
    // that survived the parse but is empty is not a host.
    if (u.hostname === "") return "";
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return "";
  }
}

const FIELD_NORMALIZERS: Record<string, (v: string) => string> = {
  phone: normalizePhone,
  telephone: normalizePhone,
  email: normalizeEmail,
  website: normalizeUrl,
  url: normalizeUrl,
};

function normalizerFor(field: string): (v: string) => string {
  const key = field.toLowerCase();
  for (const [needle, fn] of Object.entries(FIELD_NORMALIZERS)) {
    if (key.includes(needle)) return fn;
  }
  return collapse;
}

export function normalizeRows(rows: WorkflowRow[]): WorkflowRow[] {
  return rows.map((row) => {
    const fields: Record<string, string | null> = {};
    for (const [name, value] of Object.entries(row.fields)) {
      if (value === null) {
        fields[name] = null;
        continue;
      }
      const normalized = normalizerFor(name)(value);
      // An empty string after normalisation means "nothing", and nothing is
      // null. A blank cell that reads as a value is how a delivery gets
      // called complete when it is not.
      fields[name] = normalized === "" ? null : normalized;
    }
    return { ...row, fields };
  });
}

export async function runNormalizeContactFields(
  ctx: PrimitiveContext
): Promise<PrimitiveResult> {
  const rows = normalizeRows(ctx.input.rows);
  const changed = rows.filter(
    (r, i) => JSON.stringify(r.fields) !== JSON.stringify(ctx.input.rows[i]?.fields)
  ).length;
  return {
    // withRows, not a spread: this step rewrites the working set, and if that
    // set has a name its stored copy must move with it. A spread would leave
    // `datasets[workingDataset]` holding the pre-normalisation rows, so the
    // same records would read differently depending on which name a later
    // step used — the divergence the dataset-identity rule exists to forbid.
    payload: withRows(ctx.input, rows),
    summary: { rowsIn: ctx.input.rows.length, rowsChanged: changed },
  };
}

// ── split.exceptions ──────────────────────────────────────────────────────

/**
 * The verification bar, in code. A field counts as verified when it holds a
 * value backed by at least two DISTINCT sources; a row counts as verified
 * when every requested field does.
 *
 * Two sources, not a model's confidence score, because that is the standard
 * already written down for these categories. A model saying "high confidence"
 * about a single source is exactly the fabricated precision the standard
 * refuses.
 */
export const MIN_SOURCES_PER_FIELD = 2;

function distinctHosts(urls: string[]): number {
  const hosts = new Set<string>();
  for (const raw of urls) {
    try {
      hosts.add(new URL(raw).host.toLowerCase().replace(/^www\./, ""));
    } catch {
      // An unparseable source still counts as one distinct claim, keyed by
      // its own text: dropping it would quietly upgrade a row.
      if (raw.trim() !== "") hosts.add(raw.trim().toLowerCase());
    }
  }
  return hosts.size;
}

export function classifyRow(row: WorkflowRow, requestedFields: string[]): {
  status: RowStatus;
  reviewReason: string | null;
  /**
   * 1D-alpha0: the same verdict as `reviewReason`, in a closed vocabulary, one
   * entry per field that failed. Every value here is something this function
   * OBSERVED. Nothing here claims what a different pipeline would have done.
   */
  causes: FieldExceptionCause[];
} {
  /**
   * NOTHING REQUESTED MEANS NOTHING VERIFIED.
   *
   * Without this guard the loop below never runs, `missing` and `thin` stay
   * empty, both checks fall through, and every row returns `verified` having
   * inspected literally nothing. That is not cosmetic: verified rows are
   * subtracted from `unitsRemaining`, which is the only evidence
   * `computeResidual` accepts that the machine reduced the work. The
   * classification schema permits an empty `required_fields`, and extract
   * falls back to that same array, so a mandate quoted at 80 units would mark
   * all 80 resolved, prove a reduction that never happened, and pay the
   * worker the dignity floor for a job nobody has started.
   *
   * A verification bar of zero fields is not a bar that was cleared.
   */
  if (requestedFields.length === 0) {
    return {
      status: "needs_review",
      reviewReason: "No fields were specified to verify, so nothing could be confirmed.",
      causes: [{ field: "*", cause: "NO_FIELDS_REQUESTED", distinctSources: 0 }],
    };
  }

  const missing: string[] = [];
  const thin: string[] = [];
  const causes: FieldExceptionCause[] = [];

  for (const field of requestedFields) {
    const value = row.fields[field] ?? null;
    if (value === null) {
      missing.push(field);
      causes.push({ field, cause: "NO_VALUE_FOUND", distinctSources: 0 });
      continue;
    }
    const sources = distinctHosts(row.sources[field] ?? []);
    if (sources < MIN_SOURCES_PER_FIELD) {
      thin.push(field);
      causes.push({
        field,
        // Exactly what was observed: a value backed by fewer distinct sources
        // than the bar requires. Not "a page fetch would have fixed it".
        cause: "SECOND_INDEPENDENT_SOURCE_MISSING",
        distinctSources: sources,
      });
    }
  }

  if (missing.length === requestedFields.length && requestedFields.length > 0) {
    return {
      status: "not_found",
      reviewReason: "Nothing credible found for this record.",
      causes,
    };
  }
  if (missing.length > 0 || thin.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`not found: ${missing.join(", ")}`);
    if (thin.length > 0) parts.push(`needs a second source: ${thin.join(", ")}`);
    return { status: "needs_review", reviewReason: parts.join("; "), causes };
  }
  return { status: "verified", reviewReason: null, causes: [] };
}

export function splitExceptions(payload: WorkflowPayload): {
  payload: WorkflowPayload;
  verified: number;
  needsReview: number;
  notFound: number;
  /** Contract units with no row at all. A person must still produce them. */
  missingRows: number;
  /**
   * 1D-alpha0: the queryable why, aggregated per (field, cause). This is the
   * only new output of split.exceptions@2, and it is what N1 and N2 are
   * computed from. Rows keep their prose reason unchanged.
   */
  causeTally: ExceptionCauseTally;
} {
  let causeTally = emptyTally();
  const rows = payload.rows.map((row) => {
    const { status, reviewReason, causes } = classifyRow(row, payload.requestedFields);
    causeTally = addToTally(causeTally, causes);
    return {
      ...row,
      status,
      reviewReason,
      ...(causes.length > 0 ? { exceptionCauses: causes } : {}),
    };
  });

  const verified = rows.filter((r) => r.status === "verified").length;
  const needsReview = rows.filter((r) => r.status === "needs_review").length;
  const notFound = rows.filter((r) => r.status === "not_found").length;
  // Never negative: a run that found MORE rows than the contract asked for is
  // not owed negative work.
  const missingRows = Math.max(0, payload.unitsTotal - rows.length);

  return {
    payload: { ...payload, rows },
    verified,
    needsReview,
    notFound,
    missingRows,
    causeTally,
  };
}

/**
 * What a person still has to resolve: every row that is not verified, PLUS
 * every contract unit no row was produced for. The second term is the one an
 * automation engine forgets, and forgetting it reports the job as more done
 * than it is.
 */
export function unitsRemainingFrom(split: {
  needsReview: number;
  notFound: number;
  missingRows: number;
}): number {
  return split.needsReview + split.notFound + split.missingRows;
}

export async function runSplitExceptions(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const split = splitExceptions(ctx.input);
  return {
    // Same reason as normalize: the statuses it writes are a rewrite of the
    // working set, and a named working set must not be left holding the
    // pre-split rows.
    payload: withRows(ctx.input, split.payload.rows),
    summary: {
      verified: split.verified,
      needsReview: split.needsReview,
      notFound: split.notFound,
      missingRows: split.missingRows,
      unitsRemaining: unitsRemainingFrom(split),
      /**
       * Flattened into the step summary because `summary` is
       * Record<string, string | number | boolean> by contract and the admin
       * console reads it directly. The full tally travels on the payload
       * rows; this is the at-a-glance version.
       */
      rowsWithExceptionCause: split.causeTally.rowsWithCause,
      exceptionCauses: JSON.stringify(split.causeTally.byCause),
      /**
       * The PER-FIELD tally, which N1 is computed from. Persisting only
       * `byCause` (the first version of this) made N1 structurally zero: the
       * metric divides email-field causes by rows-with-a-cause, and without
       * the field dimension the numerator was always empty. A rate that can
       * only ever be 0% is a fabricated number, not a measurement, and it
       * would have been read as "email is not the bottleneck".
       *
       * Field names are the CLIENT's own words, so this stays on the step
       * summary, which is an admin surface, and never reaches a worker or
       * client payload.
       */
      exceptionCausesByField: JSON.stringify(split.causeTally.byFieldAndCause),
    },
  };
}

// ── build.csv ─────────────────────────────────────────────────────────────

/**
 * FORMULA INJECTION IS NEUTRALISED, NOT REJECTED. Content extracted from the
 * public web is untrusted even when we are the ones writing the file, and a
 * cell beginning with = + - @ is a formula in Excel and Sheets.
 *
 * The upload path (src/lib/file-security.ts validateCsv) REFUSES such a file,
 * which is right for something a stranger uploaded and wrong here: refusing
 * our own generated artifact would strand the run, and a leading "-" is also
 * just a negative number or a hyphenated name. Prefixing with an apostrophe
 * is the standard neutralisation, and it survives the round trip.
 */
export function neutralizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvEscape(value: string): string {
  const neutralized = neutralizeCsvCell(value);
  return /[",\n\r]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}

export function rowsToCsv(payload: WorkflowPayload): string {
  const header = [
    "unit_key",
    ...payload.requestedFields,
    ...payload.requestedFields.map((f) => `${f}_sources`),
    "status",
    "review_reason",
  ];
  const lines = [header.map(csvEscape).join(",")];

  for (const row of payload.rows) {
    const cells = [
      row.unitKey,
      ...payload.requestedFields.map((f) => row.fields[f] ?? ""),
      ...payload.requestedFields.map((f) => (row.sources[f] ?? []).join(" | ")),
      row.status,
      row.reviewReason ?? "",
    ];
    lines.push(cells.map(csvEscape).join(","));
  }

  // Trailing newline: a POSIX text file ends with one, and spreadsheet
  // importers are happier for it.
  return `${lines.join("\n")}\n`;
}

export async function runBuildCsv(ctx: PrimitiveContext): Promise<PrimitiveResult> {
  const csv = rowsToCsv(ctx.input);
  await ctx.writeArtifact({
    name: "candidate",
    outputVersion: 1,
    extension: "csv",
    mime: "text/csv",
    body: Buffer.from(csv, "utf8"),
    // The file the worker finishes and delivers. Never reaches the client as
    // it stands: it becomes visible only by becoming a QC-approved delivery.
    visibility: "deliverable_candidate",
  });
  return {
    payload: ctx.input,
    summary: { rows: ctx.input.rows.length, bytes: Buffer.byteLength(csv, "utf8") },
  };
}
