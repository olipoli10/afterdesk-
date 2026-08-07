import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * THE AUTOMATION BUDGET — reserved before the call, never checked after it.
 *
 * ── WHY A RESERVATION AND NOT A COMPARISON ──
 *
 * The obvious control is `spent + estimate <= ceiling`, evaluated just before
 * dispatching. It is wrong here, and not in a theoretical way: the runner
 * hands a step to a second invocation when the first one's lease expires
 * (workflow-runs.ts claims a `running` step whose leaseExpiresAt has passed).
 * The first call may still be in flight. Both invocations read the same
 * `actualAiCostMicros`, both conclude there is room, both spend. With a $2
 * ceiling and a $1.50 worst case, two concurrent attempts spend $3.
 *
 * A hold makes the room TAKEN before the call. `reserveSpend` inserts the
 * worst case under `pg_advisory_xact_lock` keyed on the run, so two concurrent
 * reservations serialise and the second sees the first one's hold. Whoever
 * loses does not call.
 *
 * ── WHY THE WORST CASE, NOT AN AVERAGE ──
 *
 * An optimistic reservation reserves nothing. The amount held is the largest
 * number of microdollars this attempt could possibly cost: max output tokens
 * at the model's output rate, plus every search it is allowed to make. If the
 * call comes back cheaper, `settleSpend` records the real number and the
 * difference is released. Reserving high and settling low is safe; the
 * reverse silently overspends.
 *
 * ── WHY AN UNKNOWN OUTCOME IS NEVER RELEASED ──
 *
 * If a call was dispatched and we then aborted, or it failed without a usable
 * response, we do not know what the provider billed. The hold stays `held`.
 * The budget stays consumed until a human settles it. Treating "I do not know"
 * as "zero" is the exact failure mode that lets spend drift, and it is the
 * same discipline Phase 1C applies to a missing figure: a dash, never a zero.
 */

/**
 * Version of the derivation rule. Bump when the PROVENANCE changes, so a
 * historical comparison is not silently comparing two different definitions.
 */
export const BUDGET_POLICY_VERSION = "budget_v1";

/**
 * The ceiling for a run, derived from the ACCEPTED PLAN and nothing else.
 *
 * Source: the sum of `estimatedAiCostCents` over the plan steps that compiled
 * to automated execution. That number was produced by the planner, stamped
 * into the plan version, and already went into `computeInternalCostCents`,
 * which is what the client's price was built from. So the ceiling is a figure
 * the client already paid against, not a new invention.
 *
 * NOT derived from clientPriceCents. A percentage of the price would authorise
 * more machine spend on an expensive mandate than on an identical cheap one,
 * which gets the causality backwards: the work decides what the machine may
 * cost, and the price is downstream of the work.
 *
 * The multiplier is the honest part of the estimate. The planner's per-step
 * figure is a guess made before the work, so a run that reaches exactly its
 * estimate and stops would pause constantly for normal variance. Two times the
 * plan, floored at a value that lets a single small step run at all, is the
 * headroom; beyond that an admin decides, which is what `pausedReason` and the
 * admin notification already exist for.
 */
export const BUDGET_HEADROOM_MULTIPLIER = 2;

/**
 * THE FLOOR IS DERIVED FROM THE WORK, NOT FROM A CONSTANT.
 *
 * A fixed floor was wrong in a way that only arithmetic exposes. The planner's
 * `estimated_ai_cost_cents` is a model's guess made before the work; it
 * routinely says twenty cents for a step whose worst case is two dollars.
 * Doubling twenty cents gives a ceiling that cannot pay for ONE attempt of the
 * first step, so the run would reserve, be refused, and pause having done
 * nothing at all. A budget that guarantees a pause is not a budget.
 *
 * So the floor is the sum of one worst-case attempt of every billable step the
 * compiler actually produced. That is the least a run must be allowed to spend
 * to have any chance of finishing, and it comes from the registry's reviewed
 * caps rather than from a model's estimate.
 */
export function deriveRunBudgetMicros(
  automatedSteps: { estimatedAiCostCents: number; maxCostMicrosPerAttempt?: number }[]
): number | null {
  // No machine steps means no machine spend is authorised. Null is a real
  // answer here, not a missing one, and reserveSpend refuses against it.
  if (automatedSteps.length === 0) return null;
  const plannedCents = automatedSteps.reduce(
    (sum, s) => sum + Math.max(0, s.estimatedAiCostCents),
    0
  );
  const plannedMicros = plannedCents * 10_000;
  const oneAttemptEach = automatedSteps.reduce(
    (sum, s) => sum + Math.max(0, s.maxCostMicrosPerAttempt ?? 0),
    0
  );
  return Math.max(oneAttemptEach, plannedMicros * BUDGET_HEADROOM_MULTIPLIER);
}

export type ReservationRefusal = {
  ok: false;
  reason: "no_budget_defined" | "would_exceed_budget";
  ceilingMicros: number | null;
  committedMicros: number;
  requestedMicros: number;
};

export type ReservationGrant = {
  ok: true;
  holdId: string;
  /**
   * What this attempt may actually spend. The caller passes it down as the
   * primitive's cost ceiling, so the adapter can refuse a call it can already
   * prove is too expensive rather than discovering it afterwards.
   */
  grantedMicros: number;
  remainingAfterMicros: number;
};

/**
 * Reserve the worst case of one attempt. Idempotent per
 * (stepRunId, attempt, operationKey): a replay of the same attempt returns the
 * existing hold instead of stacking a second one.
 */
export async function reserveSpend(input: {
  runId: string;
  stepRunId: string;
  attempt: number;
  operationKey: string;
  worstCaseMicros: number;
}): Promise<ReservationGrant | ReservationRefusal> {
  return prisma.$transaction(async (tx) => {
    /**
     * Serialised per run. Without this the SELECT below and the INSERT that
     * follows are two statements with a gap, and the gap is exactly where the
     * second invocation reads a total that does not yet include the first
     * one's hold. The lock is transaction-scoped, so it releases on commit or
     * rollback without any cleanup path of its own.
     */
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"wf-budget:" + input.runId}))`;

    const run = await tx.taskWorkflowRun.findUnique({
      where: { id: input.runId },
      select: {
        runAutomationBudgetMicros: true,
        actualAiCostMicros: true,
        actualToolCostMicros: true,
      },
    });
    if (!run) {
      return {
        ok: false as const,
        reason: "no_budget_defined" as const,
        ceilingMicros: null,
        committedMicros: 0,
        requestedMicros: input.worstCaseMicros,
      };
    }

    const existing = await tx.workflowBudgetHold.findUnique({
      where: {
        stepRunId_attempt_operationKey: {
          stepRunId: input.stepRunId,
          attempt: input.attempt,
          operationKey: input.operationKey,
        },
      },
      select: { id: true, amountMicros: true, status: true },
    });
    // A replay of the same attempt is the same reservation, not a new one.
    if (existing && existing.status === "held") {
      return {
        ok: true as const,
        holdId: existing.id,
        grantedMicros: existing.amountMicros,
        remainingAfterMicros: 0,
      };
    }

    const ceiling = run.runAutomationBudgetMicros;
    if (ceiling === null) {
      return {
        ok: false as const,
        reason: "no_budget_defined" as const,
        ceilingMicros: null,
        committedMicros: 0,
        requestedMicros: input.worstCaseMicros,
      };
    }

    /**
     * Committed = money already gone PLUS money already promised. Holds in
     * `held` count at their full reserved amount, including the ones whose
     * outcome is unknown. That is the whole point: an uncertain attempt keeps
     * occupying its worst case.
     */
    const heldAgg = await tx.workflowBudgetHold.aggregate({
      where: { runId: input.runId, status: "held" },
      _sum: { amountMicros: true },
    });
    const spent = run.actualAiCostMicros + run.actualToolCostMicros;
    const committed = spent + (heldAgg._sum.amountMicros ?? 0);

    if (committed + input.worstCaseMicros > ceiling) {
      return {
        ok: false as const,
        reason: "would_exceed_budget" as const,
        ceilingMicros: ceiling,
        committedMicros: committed,
        requestedMicros: input.worstCaseMicros,
      };
    }

    const hold = await tx.workflowBudgetHold.create({
      data: {
        runId: input.runId,
        stepRunId: input.stepRunId,
        attempt: input.attempt,
        operationKey: input.operationKey,
        amountMicros: input.worstCaseMicros,
      },
      select: { id: true },
    });

    return {
      ok: true as const,
      holdId: hold.id,
      grantedMicros: input.worstCaseMicros,
      remainingAfterMicros: ceiling - committed - input.worstCaseMicros,
    };
  });
}

/**
 * Convert a hold into the cost that actually happened. Called from inside the
 * same transaction that writes the invocation row, so a crash cannot leave a
 * billed call with a hold that still pretends to be pending, or the reverse.
 */
export async function settleHold(
  tx: Prisma.TransactionClient,
  holdId: string,
  actualMicros: number
): Promise<void> {
  await tx.workflowBudgetHold.updateMany({
    where: { id: holdId, status: "held" },
    data: { status: "settled", settledMicros: Math.max(0, actualMicros) },
  });
}

/**
 * Give the room back. ONLY legal when we know nothing was dispatched. Any
 * other outcome keeps the hold, because releasing an uncertain attempt would
 * hand its budget to the next one and let a run spend its ceiling twice.
 */
export async function releaseHold(holdId: string): Promise<void> {
  await prisma.workflowBudgetHold.updateMany({
    where: { id: holdId, status: "held" },
    data: { status: "released", settledMicros: 0 },
  });
}

/**
 * Holds whose outcome was never resolved, for the admin report. These are the
 * calls we are not sure about, expressed as money rather than as a shrug.
 */
export async function unresolvedHoldMicros(runId: string): Promise<number> {
  const agg = await prisma.workflowBudgetHold.aggregate({
    where: { runId, status: "held" },
    _sum: { amountMicros: true },
  });
  return agg._sum.amountMicros ?? 0;
}
