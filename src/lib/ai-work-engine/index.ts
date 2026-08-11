import "server-only";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { classifyMandateData } from "@/lib/ai-work-engine/data-class";
import { inspectFiles } from "@/lib/ai-work-engine/file-inspection";
import { readObject } from "@/lib/storage";
import { embedWithUsage, embeddingsEnabled } from "@/lib/embeddings";
import { aiEnabled } from "@/lib/ai";
import { findSimilarPricedTasks, upsertEmbedding } from "@/lib/ai-work-engine/references";
import { runClassification } from "@/lib/ai-work-engine/classify";
import { runPlanGeneration } from "@/lib/ai-work-engine/plan";
import {
  buildAttachmentManifest,
  plannerAttachmentLines,
  resolveFileParams,
} from "@/lib/ai-work-engine/attachments";
import { runCritique, shouldCritique } from "@/lib/ai-work-engine/critique";
import { aiSuggestionColumns, pricePlan, type PricingStepInput } from "@/lib/ai-work-engine/pricing";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { floorConfidenceForCritique, resolveConfidence } from "@/lib/ai-work-engine/confidence";
import {
  applyIntakeFraming,
  classificationOutputSchema,
  currentPrimitiveVersion,
  type ClassificationOutput,
  type PlanOutput,
} from "@/lib/ai-work-engine/schemas";
import {
  CURRENT_AUTOMATION_COST_POLICY,
} from "@/lib/ai-work-engine/automation-cost-policy";
import { runAutomationPreflight } from "@/lib/ai-work-engine/automation-preflight";
import {
  claimAiOperation,
  engineOperationKey,
  failAiOperation,
  recordSupersededUsage,
  reserveAiOperation,
  succeedAiOperation,
  SupersededOperationError,
} from "@/server/ai-operations";
import type { Prisma } from "@prisma/client";

/**
 * THE WORK ENGINE PIPELINE — Phase 1A shape, Phase 1C accounting. Three
 * stages (classify → plan → conditional critique), each wrapped in a DURABLE
 * AI OPERATION: reserved before the call under a deterministic key, claimed
 * by CAS with a lease, closed fenced, with every billed provider call
 * recorded as an append-only AiUsage attempt — including the failure paths,
 * which are paid calls too.
 *
 * The operation keys derive from the RUN, never from a count:
 * `engine:{taskId}:{runKey}:{stage}`. The initial automatic pipeline always
 * uses runKey "initial", so a duplicated after(), a crash-and-retrigger or
 * two concurrent submissions all land on the SAME three logical operations
 * and the CAS decides who executes. A future deliberate re-run must mint its
 * own explicit runKey in the action that requests it — it gets fresh
 * operations by construction, not by counter.
 *
 *  - RULE 3 unchanged: writes ONLY the aiXxx columns on Task plus the
 *    engine's own tables.
 *  - NEVER THROWS to the caller: any stage failing writes what already
 *    succeeded, marks its operation failed (with its billed usage), logs,
 *    and stops. The admin prices manually exactly as if the engine did not
 *    exist.
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

/**
 * RE-PRICE A DEMOTED PLAN, AND NEVER DOWNWARD.
 *
 * When the economic preflight takes the automation away from a step, that
 * work does not vanish: it becomes a person's. But the planner gave machine
 * steps essentially no human minutes, so re-pricing the demoted plan on those
 * minutes produces a SMALLER internal cost, a smaller price and a smaller
 * payout — for a job that just got bigger. Underpaying a worker because a
 * model wrote a zero is the exact failure the residual engine was built to
 * refuse, and it must not come back in through the quote.
 *
 * So the recalculation happens, and then every money figure takes the LARGER
 * of the two. Demotion may raise a quote; it may never lower one. The
 * remaining imperfection is stated plainly rather than hidden: a client can
 * pay for automation the preflight then declined to run, which is the
 * conservative direction and is visible in the plan's own demotedForBudget
 * flags.
 */
function reprice(
  raw: ReturnType<typeof pricePlan>,
  steps: PricingStepInput[],
  demoted: Map<number, { demotedForBudget: boolean }>,
  rates: { workerHourlyUsd: number }
): ReturnType<typeof pricePlan> {
  const onDemotedPlan = pricePlan(
    steps.map((step, i) =>
      demoted.get(i + 1)?.demotedForBudget
        ? { ...step, executor: "human" as const, estimatedAiCostCents: 0 }
        : step
    ),
    rates
  );
  const up = (a: number, b: number) => (a > b ? a : b);
  return {
    ...onDemotedPlan,
    internalCostLikelyCents: up(raw.internalCostLikelyCents, onDemotedPlan.internalCostLikelyCents),
    internalCostConservativeCents: up(
      raw.internalCostConservativeCents,
      onDemotedPlan.internalCostConservativeCents
    ),
    suggestedPriceCents: up(raw.suggestedPriceCents, onDemotedPlan.suggestedPriceCents),
    suggestedVaPayoutCents: up(raw.suggestedVaPayoutCents, onDemotedPlan.suggestedVaPayoutCents),
  };
}

/**
 * LOT A: the persist-side half of the attachment manifest. A file-reading
 * step's params go through the deterministic ref -> File.id resolution; every
 * other step's params pass through untouched. An unresolvable reference
 * (invented, out of range, or a raw id the model produced) loses its fileId
 * here, which makes the ingest schema's required-field check fail at compile
 * and the step a person's — a quote-time fact instead of a runtime surprise.
 */
function resolvePlannedParams(
  manifest: ReturnType<typeof buildAttachmentManifest>,
  primitiveId: string | null,
  rawParams: unknown
): Prisma.InputJsonValue | undefined {
  const resolution = resolveFileParams(manifest, primitiveId, rawParams);
  return (resolution.params ?? undefined) as Prisma.InputJsonValue | undefined;
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

export async function runWorkEngine(
  taskId: string,
  options?: {
    /**
     * "initial" for the automatic pipeline. A deliberate future re-run
     * action mints its own key (e.g. `rerun:${cuid}`) so it can never
     * collide with, or be deduplicated against, the initial run.
     */
    runKey?: string;
  }
): Promise<void> {
  if (!aiEnabled || !embeddingsEnabled) return;
  const runKey = options?.runKey ?? "initial";

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
        /**
         * 1E-alpha: the attachments, so the data class can be computed from
         * what is actually IN them rather than from what the brief says about
         * them. Only scanned, unpurged uploads are eligible — the same set the
         * acceptance freeze will later pin.
         */
        files: {
          where: { kind: "input", scanStatus: "clean", purgedAt: null },
          select: { id: true, fileName: true, sizeBytes: true, storageKey: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!task) return;

    if (engineSkipsTask(task)) return;

    // Idempotency after full success: a plan on record means the pipeline
    // finished. (Mid-pipeline recovery is the operations' job below.)
    const existingPlan = await prisma.taskExecutionPlanVersion.findFirst({
      where: { taskId },
      select: { id: true },
    });
    if (existingPlan) return;

    const settings = await getSettings();
    const [embedding, categories] = await Promise.all([
      embedWithUsage(`${task.title}\n\n${task.description}`, "query"),
      prisma.taskCategory.findMany({
        where: { active: true },
        select: { slug: true, name: true, disputeCriteria: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    const vector = embedding.vector;

    /**
     * 1D-alpha0: the embedding provider stops being an invisible paying
     * vendor. This call site is the ONLY one in the repo, and it has a taskId
     * in scope, so the attribution is real rather than assigned for
     * convenience. `costMicros` stays 0 on purpose: no verified Voyage rate
     * exists here, and the actual flags the omission rather than pretending
     * the call was free. See src/lib/embeddings.ts for the full statement.
     */
    await prisma.aiUsage.create({
      data: {
        userId: "work-engine",
        taskId,
        purpose: "embedding",
        provider: embedding.usage.provider,
        model: embedding.usage.model,
        inputTokens: embedding.usage.totalTokens ?? 0,
        costMicros: 0,
      },
    });

    // Stored BEFORE any model call: even if everything downstream fails,
    // this task's embedding is on record and becomes a reference for the
    // next task the moment it is approved.
    await upsertEmbedding(taskId, vector);

    const referenceTasks = await findSimilarPricedTasks(
      taskId,
      vector,
      settings.pricingSimilarityMaxDistance
    );

    /**
     * COMMERCIAL READINESS, LOTS A+C: the attachment manifest, built ONCE over
     * the exact file set the query above loaded (scanned, unpurged,
     * createdAt-ordered — the same set the acceptance freeze pins later).
     * Both model stages receive only the provider-safe lines (ref, name,
     * kind, size — never ids, never content): the classifier so source_shape
     * is grounded in what actually exists, the planner so ingest refs are
     * real. This module keeps the full manifest to resolve refs back to
     * fileIds at persist time.
     */
    const attachmentManifest = buildAttachmentManifest(task.files);
    const attachmentLines = plannerAttachmentLines(attachmentManifest);

    // ── Stage 1: classification, as a durable operation ──
    const classifyKey = engineOperationKey(taskId, runKey, "classify");
    await reserveAiOperation({ taskId, purpose: "classification", operationKey: classifyKey });

    let classificationOutput: ClassificationOutput | null = null;

    const classifyOp = await prisma.aiOperation.findUnique({
      where: { operationKey: classifyKey },
      select: { status: true },
    });
    if (classifyOp?.status === "succeeded") {
      /**
       * A previous invocation classified and then died before the plan. The
       * result is on record; re-running the stage would bill a second call
       * for an answer we already own. rawOutput IS the model's JSON, so it
       * re-validates through the same schema the live path uses.
       */
      const stored = await prisma.taskAiClassification.findUnique({
        where: { taskId },
        select: { rawOutput: true },
      });
      const revalidated = classificationOutputSchema.safeParse(stored?.rawOutput);
      if (revalidated.success) {
        // LOT C: the framing gate applies on the resume path too (a pre-LOT-C
        // rawOutput gets the schema's conservative defaults, then the same
        // tightening) — both paths must hand downstream the same framed tier.
        classificationOutput = applyIntakeFraming(revalidated.data);
      } else {
        /**
         * PERMANENT wedge, said out loud: the operation is `succeeded` so no
         * claim will ever run this stage again, and the stored rawOutput no
         * longer passes the (presumably tightened) schema. Every retrigger
         * lands here. The task prices manually — the always-correct
         * fallback — but the log must say "permanent", not hint at a
         * transient hiccup.
         */
        console.error(
          "[work-engine] classification succeeded but its stored output no longer validates; " +
            "this pipeline is PERMANENTLY stalled for this task and it will be priced manually",
          { taskId, runKey }
        );
        return;
      }
    }

    if (classificationOutput === null) {
      const claim = await claimAiOperation(classifyKey);
      if (!claim) {
        // Another invocation holds the lease, or attempts are exhausted.
        // Either way this invocation stops; it never waits and never forks
        // a second provider call for the same logical operation.
        console.warn("[work-engine] classify operation not claimable", { taskId, runKey });
        return;
      }

      let classified: Awaited<ReturnType<typeof runClassification>>;
      try {
        classified = await runClassification({
          title: task.title,
          description: task.description,
          quantity: task.quantity,
          categories,
          attachmentLines,
        });
      } catch (error) {
        // No response arrived at all — nothing billable to record, and if a
        // call WAS emitted before the death, the operation's attempt count
        // exceeding its usage rows surfaces it as AI_ATTEMPT_UNACCOUNTED.
        await failAiOperation({
          claim,
          taskId,
          purpose: "classification",
          usage: null,
          error: String(error).slice(0, 500),
        });
        throw error;
      }

      if (!classified.result) {
        await failAiOperation({
          claim,
          taskId,
          purpose: "classification",
          usage: classified.usage,
          error: classified.failure ?? "unusable output",
        });
        console.error("[work-engine] classification failed", {
          taskId,
          failure: classified.failure,
        });
        return;
      }

      /**
       * LOT C: the code-enforced half of the intake framing, applied to the
       * model output BEFORE anything reads it. A recurring ask or an
       * artifact no primitive produces is forced to the manual tier here —
       * in code, not in the prompt — so shouldCritique, the persisted row
       * and the admin screen all see the same framed tier, and a prompt
       * drift can never relax the gate. rawOutput stays the model's own
       * JSON: the row records what the model said, the columns record what
       * the platform decided.
       */
      const output = applyIntakeFraming(classified.result.output);
      const baseConfidence = resolveConfidence(output.confidence, referenceTasks.length);
      const raw = classified.result.raw;

      const columns = {
        categorySlugGuess: output.category_slug_guess,
        objective: output.objective,
        deliverableFormat: output.deliverable_format,
        requiredFields: output.required_fields,
        quantityInterpreted: output.quantity_interpreted,
        geography: output.geography,
        verificationLevel: output.verification_level,
        sourceRequirements: output.source_requirements,
        sensitiveData: output.sensitive_data,
        requiredAccess: output.required_access,
        missingInformation: output.missing_information,
        assumptions: output.assumptions,
        quoteTier: output.quote_tier,
        confidence: baseConfidence,
        // LOT C: the intake framing, persisted so the admin screen and the
        // Level-2 measurement read the same distinctions the planner routed on.
        sourceShape: output.source_shape,
        verificationExpectation: output.verification_expectation,
        outputFormatCode: output.output_format_code,
        recurrence: output.recurrence,
        model: classified.usage?.model ?? "unknown",
        rawOutput: raw as Prisma.InputJsonValue,
      };

      try {
        await succeedAiOperation({
          claim,
          taskId,
          purpose: "classification",
          usage: classified.usage,
          writeResult: async (tx) => {
            const row = await tx.taskAiClassification.upsert({
              where: { taskId },
              create: { taskId, ...columns },
              update: { ...columns, computedAt: new Date() },
              select: { id: true },
            });
            return { resultKind: "taskAiClassification", resultId: row.id, value: row };
          },
        });
      } catch (error) {
        if (error instanceof SupersededOperationError) {
          // The lease moved on mid-call. The successor owns the pipeline;
          // this invocation's only remaining duty is the money it spent.
          await recordSupersededUsage(claim, taskId, "classification", classified.usage);
          return;
        }
        throw error;
      }
      classificationOutput = output;
    }

    const classificationRow = await prisma.taskAiClassification.findUniqueOrThrow({
      where: { taskId },
      select: { confidence: true },
    });
    const baseConfidence = classificationRow.confidence;

    /**
     * 1E-alpha: THE DATA CLASS, COMPUTED LOCALLY, BEFORE ANY PRICE EXISTS.
     *
     * Deterministic code opens each attachment, reads its column names and a
     * bounded sample of values, and hands the SHAPES to a pure classifier. No
     * model participates: asking a provider what is inside a file, in order to
     * decide whether that file may be shown to a provider, is a circle whose
     * answer is always yes.
     *
     * Placed here rather than beside the classification call so that a RESUMED
     * run reaches it too. The stage above is skipped when a previous
     * invocation already succeeded, and a mandate whose class was computed on
     * the first attempt but not the second would be priced under whichever
     * path happened to run.
     *
     * The model's own reading of the brief is folded in as one signal among
     * several, and it can only ever raise the restriction. It is a
     * declaration, not evidence.
     */
    const dataVerdict = classifyMandateData({
      declaredSensitive: classificationOutput.sensitive_data,
      declaredRequiredAccessCount: classificationOutput.required_access.length,
      fileCount: task.files.length,
      inspections: await inspectFiles(
        task.files.map((f) => ({
          id: f.id,
          fileName: f.fileName,
          sizeBytes: f.sizeBytes,
          read: () => readObject(f.storageKey),
        }))
      ),
    });

    // ── Stage 2: plan, as a durable operation ──
    const planKey = engineOperationKey(taskId, runKey, "plan");
    await reserveAiOperation({ taskId, purpose: "planning", operationKey: planKey });
    const planClaim = await claimAiOperation(planKey);
    if (!planClaim) {
      console.warn("[work-engine] plan operation not claimable", { taskId, runKey });
      return;
    }

    let planned: Awaited<ReturnType<typeof runPlanGeneration>>;
    try {
      planned = await runPlanGeneration({
        title: task.title,
        description: task.description,
        quantity: task.quantity,
        classification: classificationOutput,
        categories,
        referenceTasks,
        attachmentLines,
      });
    } catch (error) {
      await failAiOperation({
        claim: planClaim,
        taskId,
        purpose: "planning",
        usage: null,
        error: String(error).slice(0, 500),
      });
      throw error;
    }

    if (!planned.result) {
      await failAiOperation({
        claim: planClaim,
        taskId,
        purpose: "planning",
        usage: planned.usage,
        error: planned.failure ?? "unusable output",
      });
      console.error("[work-engine] plan generation failed", { taskId, failure: planned.failure });
      return;
    }

    const plannedOutput = planned.result.output;

    // ── Stage 3: deterministic pricing (pure code, no model) ──
    const rates = {
      workerHourlyUsd: Math.max(COST_CATALOG.workerHourlyUsdBase, settings.minWorkerHourlyUsd),
    };
    /**
     * THE ECONOMIC PREFLIGHT, BEFORE ANYTHING IS PERSISTED.
     *
     * Sequence, in memory, one write at the end: price the raw plan, ask the
     * preflight what it would cost to run and whether the economic rule will
     * carry that risk, demote what it will not, then RE-PRICE the demoted plan
     * so the quote describes the work that will actually happen.
     *
     * Never "persist then correct until affordable": a plan version that
     * exists is one other code can already read, and repairing it afterwards
     * opens a window where the stored price does not match the stored plan.
     */
    const rawPriced = pricePlan(planStepsToPricingInput(plannedOutput), rates);
    const preflight = runAutomationPreflight({
      steps: plannedOutput.steps.map((s, i) => ({
        order: i + 1,
        primitiveId: s.primitive_id,
        primitiveVersion: currentPrimitiveVersion(s.primitive_id),
        // The topology's own verdict is not available here (the compiler runs
        // later), so the preflight is conservative: any step the planner marked
        // machine-executable is treated as billable. Over-reserving at quote
        // time is safe; under-reserving is what this correction removes.
        automatable: s.executor !== "human" && s.primitive_id !== null,
        estimatedAiCostCents: s.estimated_ai_cost_cents,
        // 1E-beta1: the plan's own edges, so an economic demotion takes every
        // transitive consumer with it and the quote never prices a machine
        // step whose producer this preflight just handed to a person.
        dependsOnOrder: s.depends_on_order,
      })),
      internalCostCents: rawPriced.internalCostConservativeCents,
      policyVersion: CURRENT_AUTOMATION_COST_POLICY,
    });

    /**
     * Re-price on the DEMOTED plan. A step the preflight took the automation
     * away from is human work now, and its cost, its minutes and therefore the
     * client's price all change. Pricing the raw plan and storing the demoted
     * one would sell automation that was already decided against.
     */
    const demotedByOrder = new Map(preflight.steps.map((s) => [s.order, s]));
    const priced =
      preflight.demotedCount === 0
        ? rawPriced
        : reprice(rawPriced, planStepsToPricingInput(plannedOutput), demotedByOrder, rates);

    let planVersion: { id: string };
    try {
      planVersion = await succeedAiOperation({
        claim: planClaim,
        taskId,
        purpose: "planning",
        usage: planned.usage,
        writeResult: async (tx) => {
          const created = await tx.taskExecutionPlanVersion.create({
            data: {
              taskId,
              version: 1,
              source: "ai_generated",
              deliverableDescription: plannedOutput.deliverable_description,
              assumptions: plannedOutput.assumptions,
              exclusions: plannedOutput.exclusions,
              internalCostLikelyCents: priced.internalCostLikelyCents,
              internalCostConservativeCents: priced.internalCostConservativeCents,
              suggestedPriceCents: priced.suggestedPriceCents,
              suggestedVaPayoutCents: priced.suggestedVaPayoutCents,
              calibration: priced.calibration,
              // The frozen economics of this plan version. Copied verbatim
              // onto the acceptance snapshot later, in the same transaction
              // as the acceptance itself.
              expectedAutomationCostMicros: preflight.expectedAutomationCostMicros,
              conservativeAutomationCostMicros: preflight.conservativeAutomationCostMicros,
              automationSpendCeilingMicros: preflight.automationSpendCeilingMicros,
              automationCostPolicyVersion: preflight.policyVersion,
              /**
               * 1E-alpha: WHAT THIS MANDATE'S DATA IS, decided here and frozen
               * with the rest. Computed from a deterministic local read of the
               * attachments (no model, no provider), so the answer to "may a
               * capability that leaves this machine touch this work" is
               * settled before the client is ever quoted.
               */
              dataClass: dataVerdict.dataClass,
              dataClassSignals: dataVerdict.signals.map((sig) => sig.reason),
              model: planned.usage?.model ?? null,
              rawOutput: planned.result!.raw as Prisma.InputJsonValue,
              steps: {
                create: plannedOutput.steps.map((s, i) => ({
                  order: i + 1,
                  title: s.title,
                  description: s.description,
                  executor: s.executor,
                  humanRole: s.human_role,
                  tool: s.tool,
                  /**
                   * The primitive is the MODEL's choice, made before the
                   * quote. The VERSION is the CODE's stamp, frozen with this
                   * plan version. A later registry bump leaves this row
                   * pinned to the behaviour the client accepted, and the
                   * compiler hands the step to a person rather than silently
                   * running the new one.
                   */
                  primitiveId: demotedByOrder.get(i + 1)?.primitiveId ?? null,
                  primitiveVersion: demotedByOrder.get(i + 1)?.primitiveVersion ?? null,
                  /**
                   * The step's configuration, frozen beside its economics and
                   * for the same reason. A demoted step keeps its params: they
                   * describe what the client approved, and a person reading
                   * the handoff needs to know which columns were meant.
                   *
                   * LOT A: file-reading params pass through the manifest
                   * resolution FIRST, so what freezes is either a real, owned
                   * File.id or a params object whose missing fileId makes the
                   * compiler hand the step to a person at quote time. An
                   * invented reference can no longer survive to the runtime.
                   */
                  params: resolvePlannedParams(
                    attachmentManifest,
                    demotedByOrder.get(i + 1)?.primitiveId ?? null,
                    s.params
                  ),
                  /**
                   * The step's own economics, frozen. The runner reserves
                   * against THIS number and never reads the policy table, so
                   * a later policy change cannot move what this contract may
                   * spend.
                   */
                  expectedCostMicrosAtQuote:
                    demotedByOrder.get(i + 1)?.expectedCostMicrosAtQuote ?? null,
                  maxCostMicrosPerAttemptAtQuote:
                    demotedByOrder.get(i + 1)?.maxCostMicrosPerAttemptAtQuote ?? null,
                  maxAttemptsAtQuote: demotedByOrder.get(i + 1)?.maxAttemptsAtQuote ?? null,
                  automationCostPolicyVersion: preflight.policyVersion,
                  demotedForBudget: demotedByOrder.get(i + 1)?.demotedForBudget ?? false,
                  fixedMinutes: s.fixed_minutes,
                  secondsPerUnit: s.seconds_per_unit,
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
            select: { id: true },
          });
          return { resultKind: "planVersion", resultId: created.id, value: created };
        },
      });
    } catch (error) {
      if (error instanceof SupersededOperationError) {
        await recordSupersededUsage(planClaim, taskId, "planning", planned.usage);
        return;
      }
      throw error;
    }

    // ── Stage 4: conditional critique, as a durable operation ──
    let critiqueSeverity: "none" | "minor" | "major" | "blocking" | null = null;
    let critiqueSummary: string | null = null;
    let critiqueTriggered = false;
    if (
      shouldCritique({
        classification: classificationOutput,
        categoryHasDisputeCriteria: categories.some(
          (c) => c.slug === classificationOutput.category_slug_guess && c.disputeCriteria !== null
        ),
        hasHighRiskStep: plannedOutput.steps.some((s) => s.risk_level === "high"),
        internalCostConservativeCents: priced.internalCostConservativeCents,
      })
    ) {
      critiqueTriggered = true;
      const critiqueOpKey = engineOperationKey(taskId, runKey, "critique");
      await reserveAiOperation({ taskId, purpose: "critique", operationKey: critiqueOpKey });
      const critiqueClaim = await claimAiOperation(critiqueOpKey);
      if (critiqueClaim) {
        let critiqued: Awaited<ReturnType<typeof runCritique>> | null = null;
        try {
          critiqued = await runCritique({
            title: task.title,
            description: task.description,
            quantity: task.quantity,
            classification: classificationOutput,
            plan: plannedOutput,
          });
        } catch (error) {
          await failAiOperation({
            claim: critiqueClaim,
            taskId,
            purpose: "critique",
            usage: null,
            error: String(error).slice(0, 500),
          });
          console.error("[work-engine] critique threw; continuing without it", { taskId });
        }
        if (critiqued && critiqued.result) {
          const output = critiqued.result.output;
          critiqueSeverity = output.severity;
          critiqueSummary = output.overall_assessment;
          try {
            await succeedAiOperation({
              claim: critiqueClaim,
              taskId,
              purpose: "critique",
              usage: critiqued.usage,
              writeResult: async (tx) => {
                const row = await tx.taskExecutionPlanCritique.create({
                  data: {
                    planVersionId: planVersion.id,
                    provider: "anthropic",
                    model: critiqued!.usage?.model ?? "unknown",
                    missingSteps: output.missing_steps,
                    wrongToolFlags: output.wrong_tool_flags,
                    timeRiskFlags: output.time_risk_flags,
                    securityRiskFlags: output.security_risk_flags,
                    overallAssessment: output.overall_assessment,
                    severity: output.severity,
                    rawOutput: critiqued!.result!.raw as Prisma.InputJsonValue,
                  },
                  select: { id: true },
                });
                return { resultKind: "planCritique", resultId: row.id, value: row };
              },
            });
          } catch (error) {
            if (error instanceof SupersededOperationError) {
              await recordSupersededUsage(critiqueClaim, taskId, "critique", critiqued.usage);
            } else {
              throw error;
            }
          }
        } else if (critiqued && !critiqued.result) {
          await failAiOperation({
            claim: critiqueClaim,
            taskId,
            purpose: "critique",
            usage: critiqued.usage,
            error: critiqued.failure ?? "unusable output",
          });
          console.error("[work-engine] critique failed; continuing without it", { taskId });
        }
      } else {
        console.warn("[work-engine] critique operation not claimable", { taskId, runKey });
      }
    }

    const finalConfidence = floorConfidenceForCritique(baseConfidence, critiqueSeverity);

    // ── The existing aiXxx surface, so approvePricing and the queue change
    //    shape not at all. ──
    const reasoning = [
      `Plan v1: ${plannedOutput.steps.length} steps, ~${Math.round(priced.estimatedMinutesLikelyTotal / 60)}h likely.`,
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
        aiSuggestedCategorySlug: classificationOutput.category_slug_guess,
        aiComputedAt: new Date(),
      },
    });
  } catch (error) {
    // Logged, never rethrown — a pipeline failure must never be a
    // task-submission failure. The task prices manually, as always.
    console.error("[work-engine] pipeline failed", { taskId, error });
  }
}
