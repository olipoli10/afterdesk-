import "server-only";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { classifyMandateData } from "@/lib/ai-work-engine/data-class";
import { inspectFiles } from "@/lib/ai-work-engine/file-inspection";
import { readObject } from "@/lib/storage";
import {
  embedWithUsage,
  embeddingsEnabled,
  voyageActualMicros,
  voyageMicrosPerMillionTokens,
  voyageWorstCaseMicros,
  VOYAGE_PROVIDER,
} from "@/lib/embeddings";
import { aiEnabled } from "@/lib/ai";
import { findSimilarPricedTasks, upsertEmbedding } from "@/lib/ai-work-engine/references";
import { classifyReservationMicros, runClassification } from "@/lib/ai-work-engine/classify";
import { planReservationMicros, runPlanGeneration } from "@/lib/ai-work-engine/plan";
import {
  buildAttachmentManifest,
  plannerAttachmentLines,
  resolveFileParams,
} from "@/lib/ai-work-engine/attachments";
import { critiqueReservationMicros, runCritique, shouldCritique } from "@/lib/ai-work-engine/critique";
import {
  AccountSpendCeilingError,
  recordAccountSpendBlocked,
  reserveAccountProviderSpend,
  settleAccountSpendHoldDirect,
} from "@/server/account-spend";
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
import { compileDecisions } from "@/lib/ai-work-engine/compile";
import {
  assessDemotionPricing,
  HUMAN_COST_UNKNOWN_NOTICE,
} from "@/lib/ai-work-engine/demotion-pricing";
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

    /**
     * R5.2 — THE VOYAGE GATE, BEFORE THE EMBEDDING POST.
     *
     * This is the earliest billable call the platform makes for a task, and
     * until R5.2 it ran ahead of every reservation — so "production with no
     * ceiling configured spends nothing" was false by exactly one Voyage
     * charge per submission, on the one provider the admin card could not see.
     *
     * NO RATE IS INVENTED. embeddings.ts still contains no Voyage price; the
     * operator supplies the current published rate, and without it production
     * simply does not make the call. That is the same early return
     * `!embeddingsEnabled` above already performs, i.e. an existing, supported
     * product state: no AI pricing suggestion, the admin prices manually.
     */
    const voyageRate = voyageMicrosPerMillionTokens();
    let embedHold: Awaited<ReturnType<typeof reserveAccountProviderSpend>> | null = null;
    if (voyageRate === null) {
      if (process.env.NODE_ENV === "production") {
        console.error(
          "[work-engine] VOYAGE_EMBEDDING_MICROS_PER_MILLION_TOKENS is not configured; " +
            "refusing to dispatch an unmeterable billable embedding call. AI pricing is " +
            "skipped for this task and the admin prices it manually."
        );
        return;
      }
      // Non-production keeps its historical behaviour so every existing
      // harness (which mocks the provider outright, spending nothing) is
      // unaffected. Production is where the money is, and production is closed.
      console.warn("[work-engine] Voyage rate unconfigured; embedding is unmetered in non-production.");
    } else {
      embedHold = await reserveAccountProviderSpend({
        provider: VOYAGE_PROVIDER,
        operationKey: engineOperationKey(taskId, runKey, "embed"),
        attempt: 1,
        worstCaseMicros: voyageWorstCaseMicros(voyageRate),
      });
      if (!embedHold.ok) {
        await recordAccountSpendBlocked({
          taskId,
          stage: "embedding",
          operationKey: engineOperationKey(taskId, runKey, "embed"),
          attempt: 1,
          refusal: embedHold,
        });
        return;
      }
    }

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
     * R5.2 — settle the Voyage hold at the EXACT measured cost. Voyage returns
     * total_tokens, so this is a measurement rather than an estimate. When it
     * reports nothing, the hold deliberately stays `held`: an unmeasured call
     * is never settled to a number nobody observed.
     */
    if (embedHold !== null && embedHold.ok && voyageRate !== null) {
      const actual = voyageActualMicros(embedding.usage.totalTokens, voyageRate);
      if (actual !== null) await settleAccountSpendHoldDirect(embedHold.holdId, actual);
    }

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
        classificationOutput = applyIntakeFraming(revalidated.data, {
          attachmentCount: attachmentManifest.length,
        });
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

      /**
       * R5 — THE ACCOUNT-LEVEL CIRCUIT BREAKER, BEFORE THIS CALL LEAVES
       * AFTERDESK. Phase 1A has no run and no step, so this is the only
       * pre-dispatch cost gate it has ever had. Reserved here, in the
       * already fully DB-coupled orchestrator, rather than inside
       * classify.ts itself — that keeps classify.ts free of any Prisma
       * dependency, which is what lets test/synthetic-provider.test.ts keep
       * calling runClassification directly against the mocked SDK alone.
       *
       * A refusal throws BEFORE the real call, inside the SAME try the
       * ordinary provider-failure path already uses: failAiOperation runs,
       * the error re-raises, and the call simply never happens — no new
       * failure path, the identical one a timeout or a rate limit takes.
       */
      const classifyReservedMicros = classifyReservationMicros({
        title: task.title,
        description: task.description,
        quantity: task.quantity,
        categories,
        attachmentLines,
      });
      const classifyAccountHold = await reserveAccountProviderSpend({
        operationKey: claim.operationKey,
        attempt: claim.attempt,
        worstCaseMicros: BigInt(classifyReservedMicros),
      });

      let classified: Awaited<ReturnType<typeof runClassification>>;
      try {
        if (!classifyAccountHold.ok) {
          // R5.1 — the block is a durable, queryable fact before it is a throw.
          await recordAccountSpendBlocked({
            taskId,
            stage: "classification",
            operationKey: claim.operationKey,
            attempt: claim.attempt,
            refusal: classifyAccountHold,
          });
          throw new AccountSpendCeilingError(classifyAccountHold);
        }
        classified = await runClassification({
          title: task.title,
          description: task.description,
          quantity: task.quantity,
          categories,
          attachmentLines,
        });
        // The response arrived, so the real cost is known: settle now,
        // always. A refusal above never reaches this line (nothing was
        // reserved to settle). A throw from the real call itself
        // (network/timeout) also never reaches this line, and the hold
        // correctly stays `held` — an unknown outcome, never optimistically
        // released.
        if (classified.usage) {
          await settleAccountSpendHoldDirect(classifyAccountHold.holdId, BigInt(classified.usage.costMicros));
        }
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
      const output = applyIntakeFraming(classified.result.output, {
        attachmentCount: attachmentManifest.length,
      });
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

    // R5 — same account-level gate as classify's, same reasoning: reserved
    // here (already DB-coupled) rather than inside plan.ts.
    const planReservedMicros = planReservationMicros({
      title: task.title,
      description: task.description,
      quantity: task.quantity,
      classification: classificationOutput,
      categories,
      referenceTasks,
      attachmentLines,
      model: settings.pricingModel,
    });
    const planAccountHold = await reserveAccountProviderSpend({
      operationKey: planClaim.operationKey,
      attempt: planClaim.attempt,
      worstCaseMicros: BigInt(planReservedMicros),
    });

    let planned: Awaited<ReturnType<typeof runPlanGeneration>>;
    try {
      if (!planAccountHold.ok) {
        // R5.1 — the block is a durable, queryable fact before it is a throw.
        await recordAccountSpendBlocked({
          taskId,
          stage: "planning",
          operationKey: planClaim.operationKey,
          attempt: planClaim.attempt,
          refusal: planAccountHold,
        });
        throw new AccountSpendCeilingError(planAccountHold);
      }
      planned = await runPlanGeneration({
        title: task.title,
        description: task.description,
        quantity: task.quantity,
        classification: classificationOutput,
        categories,
        referenceTasks,
        attachmentLines,
      });
      if (planned.usage) {
        await settleAccountSpendHoldDirect(planAccountHold.holdId, BigInt(planned.usage.costMicros));
      }
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
    const rawPriced = pricePlan(planStepsToPricingInput(plannedOutput), rates);

    /**
     * THE REAL COMPILER, RUN AT PRICING TIME — not a proxy for it.
     *
     * Until this fix, this stage asked ONE question about automatability:
     * "did the planner mark this step ai/deterministic_code and give it a
     * primitive". That is `compileDecisions`'s topology check and nothing
     * else — blind to the mandate-level sensitivity/access gate, to reach and
     * data-class rules, to whether the step's own params actually parse. A
     * mandate flagged `personal_sensitive` priced every step as if it would
     * run on a machine, because nothing at pricing time had ever asked
     * compile.ts what it would actually decide.
     *
     * L3 on Neon found exactly that: two refusal mandates compiled to 100%
     * human at both preview time and real execution — compile-preview.ts and
     * workflow-runs.ts both call compileDecisions for real — while their
     * SUGGESTED PRICE, computed here, survived un-suppressed, because this
     * was the one place in the whole pipeline that never ran the real
     * compiler at all.
     *
     * Params are resolved through the SAME attachment-manifest substitution
     * that will be persisted a few dozen lines below (`resolvePlannedParams`),
     * not the raw planner tokens — an invented file reference must compile to
     * human HERE, at pricing time, exactly as it will at quote-preview time
     * and at real execution, or this fix would still miss that one shape.
     */
    const compileGate = {
      sensitiveData: classificationOutput.sensitive_data,
      requiredAccessCount: classificationOutput.required_access.length,
      // Always computed above (classifyMandateData never returns an absent
      // class); unlike compile-preview.ts's version this is never reading a
      // nullable STORED column, so no fallback is needed.
      dataClass: dataVerdict.dataClass,
    };
    const compiled = compileDecisions(
      plannedOutput.steps.map((s, i) => ({
        planStepId: String(i + 1), // no DB row exists yet; order is the only identity that matters here
        order: i + 1,
        title: s.title,
        executor: s.executor,
        primitiveId: s.primitive_id,
        primitiveVersion: currentPrimitiveVersion(s.primitive_id),
        dependsOnOrder: s.depends_on_order,
        params: resolvePlannedParams(attachmentManifest, s.primitive_id, s.params),
      })),
      compileGate
    );
    const compiledByOrder = new Map(compiled.steps.map((s) => [s.order, s]));

    /**
     * THE ECONOMIC PREFLIGHT, BEFORE ANYTHING IS PERSISTED.
     *
     * Sequence, in memory, one write at the end: compile the raw plan for
     * real, price it, ask the preflight what it would cost to run the steps
     * the COMPILER — not a guess about the compiler — says are automatable,
     * demote what the economic rule will not carry, then RE-PRICE the demoted
     * plan so the quote describes the work that will actually happen.
     *
     * Never "persist then correct until affordable": a plan version that
     * exists is one other code can already read, and repairing it afterwards
     * opens a window where the stored price does not match the stored plan.
     */
    const preflight = runAutomationPreflight({
      steps: plannedOutput.steps.map((s, i) => ({
        order: i + 1,
        primitiveId: s.primitive_id,
        primitiveVersion: currentPrimitiveVersion(s.primitive_id),
        // The real compiled verdict, not an approximation of it. A step the
        // mandate-level gate or a capability/reach/class/params check already
        // refused is never offered to the budget preflight as billable — it
        // was never going to run on a machine, so reserving money against it
        // would fund automation nobody could ever spend it on.
        automatable: compiledByOrder.get(i + 1)?.executionMode === "automated",
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

    /**
     * PRICING INTEGRITY, GENERALISED (2026-08-12): a step humanised for ANY
     * reason, whose human cost nobody estimated, must not produce a suggested
     * price.
     *
     * `executesAsHuman` is the UNION of two independent verdicts: the real
     * compiler (`compiled`, above — sensitivity, access, capability, reach,
     * class, topology, params) OR the budget preflight (`demotedByOrder`).
     * Nothing here asks WHY beyond that; demotion-pricing.ts's whole point is
     * that the reason must never matter to the suppression decision, only to
     * the audit trail (`humanizedReason`). A step already planned human, with
     * real minutes on it, still clears `carriesHumanCost` on its own and never
     * appears in `unpricedOrders` — this generalisation adds coverage, it does
     * not add false positives on ordinary human steps.
     *
     * There is no honest number to substitute — nobody has measured what these
     * steps cost by hand — so the engine says so instead of guessing. See
     * demotion-pricing.ts for why the refusal is the correct branch.
     */
    const demotionPricing = assessDemotionPricing(
      plannedOutput.steps.map((s, i) => {
        const order = i + 1;
        const compiledStep = compiledByOrder.get(order);
        const budgetDemoted = demotedByOrder.get(order)?.demotedForBudget ?? false;
        const executesAsHuman = compiledStep?.executionMode === "human" || budgetDemoted;
        return {
          order,
          executesAsHuman,
          humanizedReason: !executesAsHuman
            ? null
            : budgetDemoted
              ? "Demoted for budget by the economic preflight."
              : (compiledStep?.handoffReason ?? "Handed to a person by the compiler."),
          estimatedMinutesLikely: s.estimated_minutes_likely,
          estimatedMinutesConservative: s.estimated_minutes_conservative,
          fixedMinutes: s.fixed_minutes,
          secondsPerUnit: s.seconds_per_unit,
        };
      })
    );

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
                  humanOutputSchema:
                    (s.human_output_schema ?? undefined) as Prisma.InputJsonValue | undefined,
                  humanRequiredArtifactKinds: s.human_required_artifact_kinds,
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
        // R5 — same account-level gate as classify's and plan's.
        const critiqueReservedMicros = critiqueReservationMicros({
          title: task.title,
          description: task.description,
          quantity: task.quantity,
          classification: classificationOutput,
          plan: plannedOutput,
          model: settings.pricingModel,
        });
        const critiqueAccountHold = await reserveAccountProviderSpend({
          operationKey: critiqueClaim.operationKey,
          attempt: critiqueClaim.attempt,
          worstCaseMicros: BigInt(critiqueReservedMicros),
        });

        let critiqued: Awaited<ReturnType<typeof runCritique>> | null = null;
        try {
          if (!critiqueAccountHold.ok) {
            // R5.1 — the block is a durable, queryable fact before it is a throw.
            await recordAccountSpendBlocked({
              taskId,
              stage: "critique",
              operationKey: critiqueClaim.operationKey,
              attempt: critiqueClaim.attempt,
              refusal: critiqueAccountHold,
            });
            throw new AccountSpendCeilingError(critiqueAccountHold);
          }
          critiqued = await runCritique({
            title: task.title,
            description: task.description,
            quantity: task.quantity,
            classification: classificationOutput,
            plan: plannedOutput,
          });
          if (critiqued.usage) {
            await settleAccountSpendHoldDirect(critiqueAccountHold.holdId, BigInt(critiqued.usage.costMicros));
          }
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
      // Leads the operator to the one fact that invalidates every figure above.
      demotionPricing.humanCostUnknown
        ? `${HUMAN_COST_UNKNOWN_NOTICE} (steps ${demotionPricing.unpricedOrders.join(", ")})`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2000);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        /**
         * The suggestion is SUPPRESSED, not corrected, when a demotion left
         * human work nobody costed: there is no honest number to write, and a
         * wrong one is worse than none because it is the one an operator can
         * approve in a single click. The plan, its steps and its economics are
         * all still on record — only the price stays the admin's to write.
         */
        ...(demotionPricing.humanCostUnknown
          ? {
              aiSuggestedPriceCents: null,
              aiLowCents: null,
              aiHighCents: null,
              aiSuggestedVaPayoutCents: null,
              aiEstimatedMinutes: null,
            }
          : aiSuggestionColumns(priced)),
        aiReasoning: reasoning,
        // A quote the engine refuses to price is never a confident one.
        aiConfidence: demotionPricing.humanCostUnknown ? "low" : finalConfidence,
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
