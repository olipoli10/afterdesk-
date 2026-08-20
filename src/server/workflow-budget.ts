import "server-only";
import { Prisma } from "@prisma-client";
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
 * Provenance of the ceiling RULE, recorded on the run. It says which release
 * of the preflight produced the number; it is never read to decide an amount.
 * Bump it when the rule changes so a historical comparison is not silently
 * comparing two different definitions.
 */
export const BUDGET_POLICY_VERSION = "budget_v2";

/**
 * THE CEILING IS NOT DERIVED HERE. IT IS COPIED FROM THE ACCEPTED CONTRACT.
 *
 * The previous version of this file computed it at COMPILE time as
 * `max(sum of registry caps, planned × headroom)`. Compile runs after payment,
 * and the registry is deploy-time code, so raising a cap in a release raised
 * the budget of mandates that had already been sold. `budgetPolicyVersion`
 * stayed the same, so nothing said it had happened.
 *
 * The ceiling is now computed once, by the ECONOMIC PREFLIGHT, before the
 * quote is shown (src/lib/ai-work-engine/automation-preflight.ts), written on
 * the plan version, and copied verbatim onto TaskAcceptanceSnapshot at
 * acceptance. This module only reads it.
 *
 * There is deliberately no `deriveRunBudgetMicros` any more. Its absence is
 * the enforcement: there is no function here that could turn current code into
 * a bigger budget for an existing contract.
 */
export function ceilingFromSnapshot(snapshot: {
  automationSpendCeilingMicros: bigint | null;
}): bigint | null {
  return snapshot.automationSpendCeilingMicros;
}

export type ReservationRefusal = {
  ok: false;
  reason: "no_budget_defined" | "would_exceed_budget";
  ceilingMicros: bigint | null;
  committedMicros: bigint;
  requestedMicros: bigint;
};

export type ReservationGrant = {
  ok: true;
  holdId: string;
  /**
   * What this attempt may actually spend. The caller passes it down as the
   * primitive's cost ceiling, so the adapter can refuse a call it can already
   * prove is too expensive rather than discovering it afterwards.
   */
  grantedMicros: bigint;
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
  /**
   * THE FROZEN VALUE FROM THE ACCEPTED PLAN STEP, never a figure read from the
   * current policy table. The caller is responsible for that provenance, and
   * an accepted contract whose step carries no frozen value never reaches
   * here: it compiles to human work instead.
   */
  worstCaseMicros: bigint;
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
        committedMicros: 0n,
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
      };
    }

    const ceiling = run.runAutomationBudgetMicros;
    if (ceiling === null) {
      return {
        ok: false as const,
        reason: "no_budget_defined" as const,
        ceilingMicros: null,
        committedMicros: 0n,
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
    /**
     * BigInt end to end. `actualAiCostMicros` and `actualToolCostMicros` are
     * still Int columns (they count what ONE run spent, well inside the
     * range), but they are widened here so no step of the comparison happens
     * in floating point or in a narrower type than the ceiling.
     */
    const spent = BigInt(run.actualAiCostMicros) + BigInt(run.actualToolCostMicros);
    const committed = spent + (heldAgg._sum.amountMicros ?? 0n);

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
  actualMicros: bigint
): Promise<void> {
  await tx.workflowBudgetHold.updateMany({
    where: { id: holdId, status: "held" },
    data: { status: "settled", settledMicros: actualMicros < 0n ? 0n : actualMicros },
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
    data: { status: "released", settledMicros: 0n },
  });
}

/**
 * Holds whose outcome was never resolved, for the admin report. These are the
 * calls we are not sure about, expressed as money rather than as a shrug.
 */
export async function unresolvedHoldMicros(runId: string): Promise<bigint> {
  const agg = await prisma.workflowBudgetHold.aggregate({
    where: { runId, status: "held" },
    _sum: { amountMicros: true },
  });
  return agg._sum.amountMicros ?? 0n;
}
