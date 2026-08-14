"use server";

import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { closedJobCategoryStats } from "@/lib/queries/closed-jobs";
import {
  analyzeClosedJobs,
  closedJobAnalysisCostMicros,
  closedJobAnalysisEnabled,
  closedJobAnalysisReservationMicros,
  type Observation,
} from "@/lib/closed-job-analysis";
import {
  reserveAccountProviderSpend,
  settleAccountSpendHoldDirect,
} from "@/server/account-spend";

export type RunAnalysisResult =
  | { ok: true; observations: Observation[] }
  | { ok: false; error: string };

/**
 * Run on demand only — never automatic, never scheduled. See the doc
 * comment on ClosedJobLog (schema.prisma) and closed-job-analysis.ts for
 * why this stays strictly advisory.
 */
export async function runClosedJobAnalysis(): Promise<RunAnalysisResult> {
  await requireRole("ADMIN");

  if (!closedJobAnalysisEnabled) {
    return { ok: false, error: "Analysis isn't available right now." };
  }

  const settings = await getSettings();
  const { total, categories } = await closedJobCategoryStats();

  if (total < settings.closedJobAnalysisMinTotal) {
    return {
      ok: false,
      error: `Not enough closed jobs yet — ${total} of ${settings.closedJobAnalysisMinTotal} needed before analysis is meaningful rather than noise.`,
    };
  }
  if (categories.length === 0) {
    return {
      ok: false,
      error: "No category has enough closed jobs on its own yet, even though the total is high enough.",
    };
  }

  /**
   * R5.2 — THE ACCOUNT-LEVEL SPEND GATE, BEFORE THE CALL LEAVES AFTERDESK.
   *
   * Internal and non-critical: exactly ONE call per invocation — the
   * per-category aggregation already happened in SQL above, so there is no
   * loop over jobs and no unbounded fan-out. A refusal simply defers the
   * analysis; no queue is built.
   *
   * IDENTITY: per-invocation uuid. No automatic retry layer exists here, so
   * one invocation is exactly one dispatch, and the admin pressing the button
   * again is a new invocation that takes its own reservation.
   */
  const accountHold = await reserveAccountProviderSpend({
    operationKey: `closed-job-analysis:${randomUUID()}`,
    attempt: 1,
    worstCaseMicros: BigInt(
      closedJobAnalysisReservationMicros({
        model: settings.closedJobAnalysisModel,
        total,
        categories,
      })
    ),
  });
  if (!accountHold.ok) {
    console.warn("[closed-job-analysis] account spend ceiling refused the run", {
      reason: accountHold.reason,
      periodKey: accountHold.periodKey,
    });
    return { ok: false, error: "Analysis isn't available right now — try again later." };
  }

  const result = await analyzeClosedJobs(total, categories);
  // analyzeClosedJobs never throws for a provider failure; it reports zero
  // usage in that case, which settles honestly at zero for a call that
  // produced nothing billable.
  await settleAccountSpendHoldDirect(
    accountHold.holdId,
    BigInt(closedJobAnalysisCostMicros(settings.closedJobAnalysisModel, result.usage))
  );

  if (result.observations.length === 0) {
    return { ok: false, error: "Analysis didn't return anything usable — try again shortly." };
  }
  return { ok: true, observations: result.observations };
}
