"use server";

import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { closedJobCategoryStats } from "@/lib/queries/closed-jobs";
import { analyzeClosedJobs, closedJobAnalysisEnabled, type Observation } from "@/lib/closed-job-analysis";

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

  const result = await analyzeClosedJobs(total, categories);
  if (result.observations.length === 0) {
    return { ok: false, error: "Analysis didn't return anything usable — try again shortly." };
  }
  return { ok: true, observations: result.observations };
}
