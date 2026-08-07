/**
 * WHY A FIELD SENT A UNIT TO A HUMAN — a closed vocabulary of OBSERVED FACTS.
 *
 * No imports, no server-only: the classifier is pure and the admin console
 * will need this table in a client component, same reason as
 * primitive-vocabulary.ts.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ──
 *
 * Every cause here describes something the engine SAW. None of them describes
 * something that would have happened under a different configuration.
 *
 * That distinction is the whole point. It is tempting to record
 * `WEB_FETCH_WOULD_HAVE_SOLVED` on a field that has one source, because it
 * feels obviously true. It is not observable: nobody fetched the page, so
 * nobody knows whether it carried the value, carried a different value, or
 * rendered its contact block in JavaScript. Writing that label would turn a
 * guess into a row in a database, and three months later the guess would be
 * quoted back as a measurement in a decision to buy a vendor.
 *
 * So production records SECOND_INDEPENDENT_SOURCE_MISSING — the fact — and a
 * counterfactual is proven, if ever, by running an A/B against a control.
 * `test/exception-cause.test.ts` fails the build if a counterfactual-shaped
 * name is added to this table.
 */

export const EXCEPTION_CAUSES = {
  /**
   * A value exists and is backed by exactly one distinct source. The
   * verification bar (MIN_SOURCES_PER_FIELD) is two. This is the cause that
   * feeds N2, and it says nothing about WHAT a second source would have been.
   */
  SECOND_INDEPENDENT_SOURCE_MISSING: 1,
  /** No value at all was found for a requested field. */
  NO_VALUE_FOUND: 1,
  /** Sources disagree on the value. A person arbitrates. */
  CONFLICTING_VALUES: 1,
  /** The mandate named no fields to verify, so nothing could be confirmed. */
  NO_FIELDS_REQUESTED: 1,
} as const;

export type ExceptionCause = keyof typeof EXCEPTION_CAUSES;
export const EXCEPTION_CAUSE_IDS = Object.keys(EXCEPTION_CAUSES) as ExceptionCause[];

/**
 * One field's reason for being unresolved. `field` is a name the CLIENT chose
 * ("owner email"), so it stays out of every aggregate key and every log line;
 * it lives on the row, next to the value it describes, and the admin console
 * is the only surface that shows it.
 */
export type FieldExceptionCause = {
  field: string;
  cause: ExceptionCause;
  /** Distinct sources actually seen. 0 or 1 for the causes above. */
  distinctSources: number;
};

/**
 * The queryable shape persisted on the step run, aggregated across rows.
 *
 * Counts per (field, cause) rather than a list of rows: the question the
 * founder asked is "which FIELD generates exceptions", and a per-row dump
 * would carry client values into an aggregate that gets read in a dashboard.
 */
export type ExceptionCauseTally = {
  /** `${field}::${cause}` to a count. Field names are client words. */
  byFieldAndCause: Record<string, number>;
  /** Cause to a count, across all fields. Safe to aggregate across tasks. */
  byCause: Partial<Record<ExceptionCause, number>>;
  /** Rows that contributed at least one cause. */
  rowsWithCause: number;
};

export function emptyTally(): ExceptionCauseTally {
  return { byFieldAndCause: {}, byCause: {}, rowsWithCause: 0 };
}

export function tallyKey(field: string, cause: ExceptionCause): string {
  return `${field}::${cause}`;
}

export function addToTally(
  tally: ExceptionCauseTally,
  causes: FieldExceptionCause[]
): ExceptionCauseTally {
  if (causes.length === 0) return tally;
  const byFieldAndCause = { ...tally.byFieldAndCause };
  const byCause = { ...tally.byCause };
  for (const c of causes) {
    const key = tallyKey(c.field, c.cause);
    byFieldAndCause[key] = (byFieldAndCause[key] ?? 0) + 1;
    byCause[c.cause] = (byCause[c.cause] ?? 0) + 1;
  }
  return { byFieldAndCause, byCause, rowsWithCause: tally.rowsWithCause + 1 };
}

/**
 * N1 — the share of exception-bearing rows whose causes are ALL on the email
 * field. "Only the email" is the honest reading of "attributable uniquely to
 * email": a row also missing a phone number would have gone to a person
 * anyway, so counting it would overstate what an email vendor could remove.
 *
 * Returns null rather than zero when there is nothing to divide by. A rate
 * over an empty denominator is not zero, it is unknown, and the difference
 * decides a purchase.
 */
export function emailOnlyExceptionRateBps(tallies: ExceptionCauseTally[]): number | null {
  let rowsWithCause = 0;
  let emailOnlyRows = 0;
  for (const t of tallies) {
    rowsWithCause += t.rowsWithCause;
    for (const [key, count] of Object.entries(t.byFieldAndCause)) {
      const field = key.slice(0, key.lastIndexOf("::")).toLowerCase();
      if (field.includes("email") || field.includes("courriel")) emailOnlyRows += count;
    }
  }
  if (rowsWithCause === 0) return null;
  // Bounded: a row can carry several email-field causes in principle.
  return Math.min(10_000, Math.round((emailOnlyRows * 10_000) / rowsWithCause));
}

/**
 * N2 — the share of causes that are exactly "one source, needed two".
 *
 * Read it as what it says. It does NOT say a page fetch would have fixed it,
 * and no caller may relabel it that way.
 */
export function secondSourceMissingRateBps(tallies: ExceptionCauseTally[]): number | null {
  let total = 0;
  let missing = 0;
  for (const t of tallies) {
    for (const [cause, count] of Object.entries(t.byCause)) {
      total += count;
      if (cause === "SECOND_INDEPENDENT_SOURCE_MISSING") missing += count;
    }
  }
  if (total === 0) return null;
  return Math.round((missing * 10_000) / total);
}
