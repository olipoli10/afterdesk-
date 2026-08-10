import "server-only";
import { prisma } from "@/lib/db";
import {
  emailOnlyExceptionRateBps,
  secondSourceMissingRateBps,
  type ExceptionCause,
  type ExceptionCauseTally,
} from "@/lib/ai-work-engine/exception-cause";
import { eligibleForReliabilityStatistics } from "@/lib/operational-intelligence/eligibility";

/**
 * N1 AND N2, COMPUTED FROM WHAT PRODUCTION ACTUALLY SAW.
 *
 * ADMIN SURFACE ONLY. Field names here are the client's own words and the
 * counts describe internal execution quality; neither belongs on a client or
 * worker payload, and no role-shaped select references this module.
 *
 * ── WHAT THESE NUMBERS ARE, AND WHAT THEY ARE NOT ──
 *
 * N1 is the share of exception-bearing rows whose unresolved fields are all
 * email fields. It answers "if the email field stopped producing exceptions,
 * how many rows would stop needing a person".
 *
 * N2 is the share of causes that are exactly SECOND_INDEPENDENT_SOURCE_MISSING:
 * a value was found, backed by one distinct source, and the bar is two.
 *
 * N2 IS NOT "the share web_fetch would have fixed". Nobody fetched those
 * pages, so nobody knows whether they carried the value, carried a different
 * one, or rendered their contact block in JavaScript. That question is a
 * counterfactual and only an A/B against a control can answer it. Production
 * measures the fact; the benchmark, if it ever runs, measures the remedy.
 *
 * Both return null rather than zero on an empty denominator. A rate over
 * nothing is unknown, not zero, and the difference is what decides whether a
 * vendor gets bought.
 */

export type ExceptionMetrics = {
  /** Tasks whose data is fit for statistics at all. */
  taskCount: number;
  /** Rows across those tasks that carried at least one cause. */
  rowsWithCause: number;
  /** Total rows the machine produced, the denominator for coverage. */
  totalRowsSeen: number;
  n1EmailOnlyBps: number | null;
  n2SecondSourceMissingBps: number | null;
  /** Every cause, with its count. The distribution the founder asked for. */
  byCause: { cause: string; count: number }[];
  /** Per client field name. Admin-only by construction. */
  byField: { field: string; cause: string; count: number }[];
  /** Human seconds recorded on the tasks that carried each cause. */
  workerSecondsOnTasksWithCause: { cause: string; seconds: number }[];
  /** QC corrections on those same tasks. */
  qcCorrectionsOnTasksWithCause: { cause: string; corrections: number }[];
  /** Collection progress against the founder's gate. */
  readiness: {
    successfulTasks: number;
    successfulTasksTarget: number;
    rowsSeen: number;
    rowsTarget: number;
    ready: boolean;
  };
};

export const COLLECTION_TARGET_TASKS = 10;
export const COLLECTION_TARGET_ROWS = 500;

type StoredRow = {
  exceptionCauses?: { field: string; cause: ExceptionCause }[];
};

/**
 * Reads the tallies straight from the step payloads written by
 * split.exceptions@2. They live on the artifact payload rather than in a
 * dedicated table on purpose: a table would need a writer, a backfill and a
 * fingerprint entry of its own, and the payload is already the append-only
 * record of what each step produced.
 */
/**
 * Cross-client admin telemetry. May contain client-defined field names.
 * Never use as AI/provider/client context.
 *
 * This is the one function in the repo whose return value mixes free text
 * originating from several different clients into a single object: `byField`
 * aggregates unresolved field names across every mandate. Inside an operator's
 * dashboard that is exactly what it is for. Anywhere else it is a channel for
 * one client's wording to reach another client's processing, which is the
 * boundary references.ts was rewritten to hold.
 *
 * `test/data-isolation.test.ts` enforces the restriction by import path rather
 * than by this comment: only admin pages may reach this module, and widening
 * that has to be a deliberate edit to the allowlist.
 */
export async function exceptionMetricsForAdmin(): Promise<ExceptionMetrics> {
  const runs = await prisma.taskWorkflowRun.findMany({
    where: {
      task: { isInternal: false, standingCapacityAccountId: null },
    },
    select: {
      taskId: true,
      task: {
        select: {
          isInternal: true,
          standingCapacityAccountId: true,
          acceptanceSnapshot: { select: { id: true } },
          operationalActual: {
            select: {
              outcomeClass: true,
              dataQualityFlags: true,
              workerActiveSeconds: true,
              unitsCorrectedByReviewer: true,
            },
          },
        },
      },
      steps: {
        where: { primitiveId: "split.exceptions" },
        select: { outputSummary: true, order: true },
      },
      artifacts: { select: { id: true } },
    },
  });

  let rowsWithCause = 0;
  let totalRowsSeen = 0;
  let successfulTasks = 0;
  const tallies: ExceptionCauseTally[] = [];
  const byCause = new Map<string, number>();
  const byField = new Map<string, number>();
  const workerSecondsByCause = new Map<string, number>();
  const qcByCause = new Map<string, number>();
  let taskCount = 0;

  for (const run of runs) {
    const t = run.task;
    // Same gate the calibration uses, so a benchmark or an internal probe can
    // never contaminate the number a purchase is decided on.
    const eligible = eligibleForReliabilityStatistics({
      hasAcceptanceSnapshot: t.acceptanceSnapshot !== null,
      isInternal: t.isInternal,
      isStandingCapacity: t.standingCapacityAccountId !== null,
      dataQualityFlags: t.operationalActual?.dataQualityFlags ?? [],
    });
    if (!eligible) continue;
    taskCount += 1;
    if (t.operationalActual?.outcomeClass === "workflow_success") successfulTasks += 1;

    const payload = await loadCauseTally(run.taskId);
    if (payload === null) continue;
    tallies.push(payload.tally);
    rowsWithCause += payload.tally.rowsWithCause;
    totalRowsSeen += payload.rowCount;

    for (const [cause, count] of Object.entries(payload.tally.byCause)) {
      byCause.set(cause, (byCause.get(cause) ?? 0) + (count ?? 0));
      // Human time and QC corrections are TASK-level facts, attributed to
      // every cause the task carried. Stated plainly because it is not a
      // per-cause measurement and must not be read as one.
      workerSecondsByCause.set(
        cause,
        (workerSecondsByCause.get(cause) ?? 0) + (t.operationalActual?.workerActiveSeconds ?? 0)
      );
      qcByCause.set(
        cause,
        (qcByCause.get(cause) ?? 0) + (t.operationalActual?.unitsCorrectedByReviewer ?? 0)
      );
    }
    for (const [key, count] of Object.entries(payload.tally.byFieldAndCause)) {
      byField.set(key, (byField.get(key) ?? 0) + count);
    }
  }

  return {
    taskCount,
    rowsWithCause,
    totalRowsSeen,
    n1EmailOnlyBps: emailOnlyExceptionRateBps(tallies),
    n2SecondSourceMissingBps: secondSourceMissingRateBps(tallies),
    byCause: [...byCause.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count),
    byField: [...byField.entries()]
      .map(([key, count]) => {
        const at = key.lastIndexOf("::");
        return { field: key.slice(0, at), cause: key.slice(at + 2), count };
      })
      .sort((a, b) => b.count - a.count),
    workerSecondsOnTasksWithCause: [...workerSecondsByCause.entries()].map(([cause, seconds]) => ({
      cause,
      seconds,
    })),
    qcCorrectionsOnTasksWithCause: [...qcByCause.entries()].map(([cause, corrections]) => ({
      cause,
      corrections,
    })),
    readiness: {
      successfulTasks,
      successfulTasksTarget: COLLECTION_TARGET_TASKS,
      rowsSeen: totalRowsSeen,
      rowsTarget: COLLECTION_TARGET_ROWS,
      // AND, not OR: the founder's gate is both, because ten tiny tasks and
      // one huge one are each a bad basis for a purchase.
      ready:
        successfulTasks >= COLLECTION_TARGET_TASKS && totalRowsSeen >= COLLECTION_TARGET_ROWS,
    },
  };
}

/**
 * The cause tally for one task, rebuilt from the payload split.exceptions
 * wrote. Returns null when the task predates split.exceptions@2 — an absent
 * measurement, never a zero.
 */
async function loadCauseTally(
  taskId: string
): Promise<{ tally: ExceptionCauseTally; rowCount: number } | null> {
  /**
   * Read from the STEP SUMMARY, not from the payload artifact. The payload
   * lives in object storage and would need a per-task fetch plus the storage
   * client; the summary is already a Postgres column and split.exceptions@2
   * writes the tally into it. Kept behind its own function so the source can
   * change later without the metric changing.
   */
  const step = await prisma.taskWorkflowStepRun.findFirst({
    where: { run: { taskId }, primitiveId: "split.exceptions" },
    orderBy: { order: "desc" },
    select: { outputSummary: true },
  });
  const summary = step?.outputSummary as Record<string, unknown> | null;
  if (!summary || typeof summary.exceptionCauses !== "string") return null;

  let byCause: Partial<Record<ExceptionCause, number>> = {};
  let byFieldAndCause: Record<string, number> = {};
  try {
    byCause = JSON.parse(summary.exceptionCauses) as Partial<Record<ExceptionCause, number>>;
    /**
     * The per-field half. A step written by an older build has `byCause` but
     * not this, and that is an ABSENT measurement, not an empty one: without
     * the field dimension N1's numerator is structurally zero and the rate
     * would read "email causes 0% of exceptions" when the truth is "this task
     * cannot say". So a summary missing it is dropped from the sample
     * entirely rather than counted as evidence against email.
     */
    if (typeof summary.exceptionCausesByField !== "string") return null;
    byFieldAndCause = JSON.parse(summary.exceptionCausesByField) as Record<string, number>;
  } catch {
    return null;
  }
  const rowsWithCause =
    typeof summary.rowsWithExceptionCause === "number" ? summary.rowsWithExceptionCause : 0;
  const rowCount =
    (typeof summary.verified === "number" ? summary.verified : 0) +
    (typeof summary.needsReview === "number" ? summary.needsReview : 0) +
    (typeof summary.notFound === "number" ? summary.notFound : 0);

  return { tally: { byCause, byFieldAndCause, rowsWithCause }, rowCount };
}

export type { StoredRow };
