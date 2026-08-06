import "server-only";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { embed, embeddingsEnabled } from "@/lib/embeddings";
import { aiEnabled } from "@/lib/ai";
import { findSimilarPricedTasks, upsertEmbedding } from "@/lib/ai-work-engine/references";
import { runClassification } from "@/lib/ai-work-engine/classify";
import { runPlanGeneration } from "@/lib/ai-work-engine/plan";
import { runCritique, shouldCritique } from "@/lib/ai-work-engine/critique";
import { aiSuggestionColumns, pricePlan, type PricingStepInput } from "@/lib/ai-work-engine/pricing";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { floorConfidenceForCritique, resolveConfidence } from "@/lib/ai-work-engine/confidence";
import type { PlanOutput } from "@/lib/ai-work-engine/schemas";
import type { Prisma } from "@prisma/client";

/**
 * THE WORK ENGINE PIPELINE — Phase 1A. Replaces the single-call pricing
 * suggestion with: classify → plan → deterministic price → conditional
 * critique. Fired from the same after() hook in submitTask, under the same
 * two disciplines the single-call version established:
 *
 *  - RULE 3: writes ONLY the aiXxx columns on Task plus the engine's own
 *    tables. No path to clientPriceCents / vaPayoutCents / quotedAt — those
 *    stay exclusively approvePricing's, after a human click.
 *  - NEVER THROWS to the caller: any stage failing writes what already
 *    succeeded, logs, and stops. A pipeline failure must never be a
 *    task-submission failure, and the admin prices manually exactly as if
 *    the engine did not exist. aiComputedAt stays null in that case, which
 *    the pricing queue already renders as "not computed — price manually".
 *
 * Stage failures are deliberately not retried here: the pricing queue is
 * not latency-sensitive and a transient provider error surfaces to the
 * admin as a manually-priced task, the always-correct fallback.
 */

/**
 * The Phase-0 review's guard, as a pure predicate so it has its own test:
 * a Standing Capacity task is paid by its weekly block and never quoted
 * (approvePricing refuses it outright), and an internal practice task
 * exists to exercise the human pipeline. Running paid model calls whose
 * output nothing will ever read is a cost leak, not a feature.
 */
export function engineSkipsTask(task: {
  standingCapacityAccountId: string | null;
  isInternal: boolean;
}): boolean {
  return task.standingCapacityAccountId !== null || task.isInternal;
}

function planStepsToPricingInput(plan: PlanOutput): PricingStepInput[] {
  return plan.steps.map((s) => ({
    executor: s.executor,
    estimatedMinutesOptimistic: s.estimated_minutes_optimistic,
    estimatedMinutesLikely: s.estimated_minutes_likely,
    estimatedMinutesConservative: s.estimated_minutes_conservative,
    estimatedAiCostCents: s.estimated_ai_cost_cents,
    estimatedToolUnits: s.estimated_tool_units,
    tool: s.tool,
  }));
}

export async function runWorkEngine(taskId: string): Promise<void> {
  if (!aiEnabled || !embeddingsEnabled) return;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true,
        description: true,
        quantity: true,
        clientDeadlineUtc: true,
        standingCapacityAccountId: true,
        isInternal: true,
      },
    });
    if (!task) return;

    if (engineSkipsTask(task)) return;

    // Idempotency: submitTask fires this once, but a crash-and-retry or a
    // future manual re-run must not stack duplicate v1 plans.
    const existingPlan = await prisma.taskExecutionPlanVersion.findFirst({
      where: { taskId },
      select: { id: true },
    });
    if (existingPlan) return;

    const settings = await getSettings();
    const [vector, categories] = await Promise.all([
      embed(`${task.title}\n\n${task.description}`, "query"),
      prisma.taskCategory.findMany({
        where: { active: true },
        select: { slug: true, name: true, disputeCriteria: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    // Stored BEFORE any model call: even if everything downstream fails,
    // this task's embedding is on record and becomes a reference for the
    // next task the moment it is approved. Same reasoning as the original
    // single-call pricer.
    await upsertEmbedding(taskId, vector);

    const referenceTasks = await findSimilarPricedTasks(
      taskId,
      vector,
      settings.pricingSimilarityMaxDistance
    );

    // ── Stage 1: classification ──
    const classified = await runClassification({
      title: task.title,
      description: task.description,
      quantity: task.quantity,
      categories,
    });
    if (!classified) {
      console.error("[work-engine] classification failed", { taskId });
      return;
    }

    // The same server-side floor the single-call pricer had: confidence
    // measures PRECEDENT. Zero close reference tasks forces "low" no matter
    // what the model self-reported.
    const baseConfidence = resolveConfidence(classified.output.confidence, referenceTasks.length);

    await prisma.taskAiClassification.upsert({
      where: { taskId },
      create: {
        taskId,
        categorySlugGuess: classified.output.category_slug_guess,
        objective: classified.output.objective,
        deliverableFormat: classified.output.deliverable_format,
        requiredFields: classified.output.required_fields,
        quantityInterpreted: classified.output.quantity_interpreted,
        geography: classified.output.geography,
        verificationLevel: classified.output.verification_level,
        sourceRequirements: classified.output.source_requirements,
        sensitiveData: classified.output.sensitive_data,
        requiredAccess: classified.output.required_access,
        missingInformation: classified.output.missing_information,
        assumptions: classified.output.assumptions,
        quoteTier: classified.output.quote_tier,
        confidence: baseConfidence,
        model: classified.model,
        rawOutput: classified.raw as Prisma.InputJsonValue,
      },
      update: {
        categorySlugGuess: classified.output.category_slug_guess,
        objective: classified.output.objective,
        deliverableFormat: classified.output.deliverable_format,
        requiredFields: classified.output.required_fields,
        quantityInterpreted: classified.output.quantity_interpreted,
        geography: classified.output.geography,
        verificationLevel: classified.output.verification_level,
        sourceRequirements: classified.output.source_requirements,
        sensitiveData: classified.output.sensitive_data,
        requiredAccess: classified.output.required_access,
        missingInformation: classified.output.missing_information,
        assumptions: classified.output.assumptions,
        quoteTier: classified.output.quote_tier,
        confidence: baseConfidence,
        model: classified.model,
        rawOutput: classified.raw as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
    });

    // ── Stage 2: plan ──
    const planned = await runPlanGeneration({
      title: task.title,
      description: task.description,
      quantity: task.quantity,
      classification: classified.output,
      categories,
      referenceTasks,
    });
    if (!planned) {
      console.error("[work-engine] plan generation failed", { taskId });
      return;
    }

    // ── Stage 3: deterministic pricing (pure code, no model) ──
    const rates = {
      workerHourlyUsd: Math.max(COST_CATALOG.workerHourlyUsdBase, settings.minWorkerHourlyUsd),
    };
    const priced = pricePlan(planStepsToPricingInput(planned.output), rates);

    const planVersion = await prisma.taskExecutionPlanVersion.create({
      data: {
        taskId,
        version: 1,
        source: "ai_generated",
        deliverableDescription: planned.output.deliverable_description,
        assumptions: planned.output.assumptions,
        exclusions: planned.output.exclusions,
        internalCostLikelyCents: priced.internalCostLikelyCents,
        internalCostConservativeCents: priced.internalCostConservativeCents,
        suggestedPriceCents: priced.suggestedPriceCents,
        suggestedVaPayoutCents: priced.suggestedVaPayoutCents,
        calibration: priced.calibration,
        model: planned.model,
        rawOutput: planned.raw as Prisma.InputJsonValue,
        steps: {
          create: planned.output.steps.map((s, i) => ({
            order: i + 1,
            title: s.title,
            description: s.description,
            executor: s.executor,
            humanRole: s.human_role,
            tool: s.tool,
            estimatedMinutesOptimistic: s.estimated_minutes_optimistic,
            estimatedMinutesLikely: s.estimated_minutes_likely,
            estimatedMinutesConservative: s.estimated_minutes_conservative,
            estimatedAiCostCents: s.estimated_ai_cost_cents,
            estimatedToolUnits: s.estimated_tool_units,
            verificationMethod: s.verification_method,
            acceptanceCriteria: s.acceptance_criteria,
            riskLevel: s.risk_level,
            riskNote: s.risk_note,
            dependsOnOrder: s.depends_on_order,
          })),
        },
      },
    });

    // ── Stage 4: conditional critique ──
    let critiqueSeverity: "none" | "minor" | "major" | "blocking" | null = null;
    let critiqueSummary: string | null = null;
    let critiqueTriggered = false;
    if (
      shouldCritique({
        classification: classified.output,
        categoryHasDisputeCriteria: categories.some(
          (c) => c.slug === classified.output.category_slug_guess && c.disputeCriteria !== null
        ),
        hasHighRiskStep: planned.output.steps.some((s) => s.risk_level === "high"),
        internalCostConservativeCents: priced.internalCostConservativeCents,
      })
    ) {
      critiqueTriggered = true;
      const critiqued = await runCritique({
        title: task.title,
        description: task.description,
        quantity: task.quantity,
        classification: classified.output,
        plan: planned.output,
      });
      if (critiqued) {
        critiqueSeverity = critiqued.output.severity;
        critiqueSummary = critiqued.output.overall_assessment;
        await prisma.taskExecutionPlanCritique.create({
          data: {
            planVersionId: planVersion.id,
            provider: "anthropic",
            model: critiqued.model,
            missingSteps: critiqued.output.missing_steps,
            wrongToolFlags: critiqued.output.wrong_tool_flags,
            timeRiskFlags: critiqued.output.time_risk_flags,
            securityRiskFlags: critiqued.output.security_risk_flags,
            overallAssessment: critiqued.output.overall_assessment,
            severity: critiqued.output.severity,
            rawOutput: critiqued.raw as Prisma.InputJsonValue,
          },
        });
      } else {
        console.error("[work-engine] critique failed; continuing without it", { taskId });
      }
    }

    const finalConfidence = floorConfidenceForCritique(baseConfidence, critiqueSeverity);

    // ── The existing aiXxx surface, so approvePricing and the queue change
    //    shape not at all. Mapping documented in the plan: low = price at the
    //    likely cost, high = price at the conservative cost, suggestion = the
    //    conservative-based recommendation.
    const reasoning = [
      `Plan v1: ${planned.output.steps.length} steps, ~${Math.round(priced.estimatedMinutesLikelyTotal / 60)}h likely.`,
      `Internal cost $${(priced.internalCostLikelyCents / 100).toFixed(0)} likely / $${(priced.internalCostConservativeCents / 100).toFixed(0)} conservative (uncalibrated catalog).`,
      // "Not triggered" and "triggered but failed" are different admin
      // signals: the first means the engine judged it unnecessary, the
      // second means a wanted safety check is MISSING — never conflate them.
      critiqueSeverity
        ? `Critique: ${critiqueSeverity}. ${critiqueSummary ?? ""}`
        : critiqueTriggered
          ? "Critique: triggered but failed; review this plan as if unchecked."
          : "Critique: not triggered.",
    ]
      .join(" ")
      .slice(0, 2000);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        ...aiSuggestionColumns(priced),
        aiReasoning: reasoning,
        aiConfidence: finalConfidence,
        aiSuggestedCategorySlug: classified.output.category_slug_guess,
        aiComputedAt: new Date(),
      },
    });
  } catch (error) {
    // Logged, never rethrown — a pipeline failure must never be a
    // task-submission failure. The task prices manually, as always.
    console.error("[work-engine] pipeline failed", { taskId, error });
  }
}
