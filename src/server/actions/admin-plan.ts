"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { aiSuggestionColumns, pricePlan } from "@/lib/ai-work-engine/pricing";
import { currentPrimitiveVersion, editPlanInputSchema } from "@/lib/ai-work-engine/schemas";
import { primitiveReadsFiles } from "@/lib/ai-work-engine/primitive-vocabulary";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { CURRENT_AUTOMATION_COST_POLICY } from "@/lib/ai-work-engine/automation-cost-policy";
import { runAutomationPreflight } from "@/lib/ai-work-engine/automation-preflight";

/**
 * The admin's plan edit. THE VERSIONING RULE LIVES HERE: an edit never
 * mutates an existing version — it inserts version N+1 with parentVersionId
 * pointing at what it changed and editedByAdminId saying who. That is the
 * audit trail the founder asked for ("what the AI proposed / what the admin
 * changed / what was sent"), obtained structurally instead of by logging.
 *
 * Re-pricing an edited version runs ONLY the deterministic engine
 * (pricePlan) — never a paid model call. Editing quantities must cost
 * keystrokes, not tokens.
 */

/**
 * Validation lives in editPlanInputSchema (ai-work-engine/schemas.ts),
 * colocated with the generation schemas whose output this form round-trips —
 * the caps MUST stay aligned or an unchanged AI sentence blocks every save
 * (found live; pinned by test).
 */
export type EditPlanResult = { ok: true; newVersion: number } | { ok: false; error: string };

/** Thrown inside the transaction to abort with a specific message. */
class Refused extends Error {}

export async function editPlanVersion(input: unknown): Promise<EditPlanResult> {
  const admin = await requireRole("ADMIN");
  const parsed = editPlanInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the plan fields and try again.",
    };
  }
  const { taskId, baseVersionId, editNote, deliverableDescription, assumptions, exclusions, steps } =
    parsed.data;

  /**
   * LOT A — THE OWNERSHIP BOUNDARY, ENFORCED BY CODE AT THE EDIT DOOR.
   *
   * A file-reading step's fileId must name a file that belongs to THIS task
   * (input kind, scanned clean, unpurged — the same set the planner's
   * manifest was built over and the acceptance freeze will pin). A cuid being
   * hard to guess is not a boundary; this check is. It refuses the edit with
   * a clear message instead of freezing a pointer that either reads another
   * client's file (never — the runtime snapshot check is the third wall) or
   * dies at runtime hours after payment.
   *
   * Params that do not PARSE are still allowed to save: an unparseable
   * configuration compiles to human work (invalid_params), which is the
   * established fail-closed floor, and blocking every malformed save would
   * prevent the legitimate "leave this step to a person" edit.
   */
  const fileSteps = steps.filter((s) => primitiveReadsFiles(s.primitiveId));
  if (fileSteps.length > 0) {
    const owned = await prisma.file.findMany({
      where: { taskId, kind: "input", scanStatus: "clean", purgedAt: null },
      select: { id: true, fileName: true },
    });
    const ownedIds = new Set(owned.map((f) => f.id));
    for (const s of fileSteps) {
      const parsedParams = parsePrimitiveParams(s.primitiveId, s.params);
      if (parsedParams === null) continue;
      const fileId = parsedParams.fileId as string;
      if (!ownedIds.has(fileId)) {
        return {
          ok: false,
          error:
            "A file step points at a file this task does not own. Pick one of the task's own attachments" +
            (owned.length > 0 ? ` (${owned.map((f) => f.fileName).join(", ")}).` : "; this task has none."),
        };
      }
    }
  }

  const settings = await getSettings();
  const rates = {
    workerHourlyUsd: Math.max(COST_CATALOG.workerHourlyUsdBase, settings.minWorkerHourlyUsd),
  };
  // Deterministic only — zero model calls on an edit, by design.
  const pricingInput = steps.map((s) => ({
    executor: s.executor,
    estimatedMinutesOptimistic: s.estimatedMinutesOptimistic,
    estimatedMinutesLikely: s.estimatedMinutesLikely,
    estimatedMinutesConservative: s.estimatedMinutesConservative,
    estimatedAiCostCents: s.estimatedAiCostCents,
    estimatedToolUnits: s.estimatedToolUnits,
    tool: s.tool,
  }));
  const rawPriced = pricePlan(pricingInput, rates);

  /**
   * THE SAME ECONOMIC PREFLIGHT AS THE AI PIPELINE, FOR THE SAME REASON.
   *
   * An admin edit produces a plan version the client can accept, so it needs
   * the same frozen economics: without them every step compiles to human at
   * runtime (fail-closed), and an operator who carefully chose a primitive
   * would watch it silently do nothing.
   *
   * Deterministic and model-free, like the rest of this action.
   */
  const preflight = runAutomationPreflight({
    steps: steps.map((s, i) => ({
      order: i + 1,
      primitiveId: s.primitiveId,
      primitiveVersion: currentPrimitiveVersion(s.primitiveId),
      automatable: s.executor !== "human" && s.primitiveId !== null,
      estimatedAiCostCents: s.estimatedAiCostCents,
      // 1E-beta1: same edges the compiler will read at execution, so an
      // admin-edited plan demotes consumers with their producers too.
      dependsOnOrder: s.dependsOnOrder,
    })),
    internalCostCents: rawPriced.internalCostConservativeCents,
    policyVersion: CURRENT_AUTOMATION_COST_POLICY,
  });
  const frozen = new Map(preflight.steps.map((s) => [s.order, s]));

  /**
   * Re-price on the demoted plan, and never downward. A demoted step becomes a
   * person's work, but the planner gave machine steps no human minutes, so
   * pricing the demoted plan on those minutes shrinks the payout for a job
   * that just got bigger. Every money figure therefore takes the larger of the
   * two: demotion may raise a quote, never lower one.
   */
  const priced =
    preflight.demotedCount === 0
      ? rawPriced
      : (() => {
          const onDemoted = pricePlan(
            pricingInput.map((step, i) =>
              frozen.get(i + 1)?.demotedForBudget
                ? { ...step, executor: "human" as const, estimatedAiCostCents: 0 }
                : step
            ),
            rates
          );
          const up = (a: number, b: number) => (a > b ? a : b);
          return {
            ...onDemoted,
            internalCostLikelyCents: up(
              rawPriced.internalCostLikelyCents,
              onDemoted.internalCostLikelyCents
            ),
            internalCostConservativeCents: up(
              rawPriced.internalCostConservativeCents,
              onDemoted.internalCostConservativeCents
            ),
            suggestedPriceCents: up(rawPriced.suggestedPriceCents, onDemoted.suggestedPriceCents),
            suggestedVaPayoutCents: up(
              rawPriced.suggestedVaPayoutCents,
              onDemoted.suggestedVaPayoutCents
            ),
          };
        })();

  let newVersionNumber = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { status: true },
      });
      if (!task) throw new Refused("Task not found.");
      /**
       * THE LOCK. Once the task has left the pricing stage the plan under
       * the quote is what the client is deciding on (and after acceptance,
       * what the snapshot recorded). Editing it would desynchronize the
       * quote from its own basis — a new price needs a fresh quote cycle,
       * which is the existing product rule ("every submission is priced
       * fresh"), not a new one.
       */
      if (!["submitted", "pricing_review"].includes(task.status)) {
        throw new Refused(
          "This task has already been quoted. The plan behind a live quote is locked; cancel and re-quote to change it."
        );
      }

      const base = await tx.taskExecutionPlanVersion.findUnique({
        where: { id: baseVersionId },
        select: { taskId: true, version: true, dataClass: true, dataClassSignals: true },
      });
      if (!base || base.taskId !== taskId) {
        throw new Refused("That plan version does not belong to this task.");
      }

      const latest = await tx.taskExecutionPlanVersion.findFirst({
        where: { taskId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      // Only the HEAD may be edited. The P2002 handler below only catches
      // two saves in the same instant; without this check a tab opened
      // before someone else's v2 silently supersedes it with a v3 built on
      // v1's content, and the fork is invisible (adversarial review).
      if (latest && base.version !== latest.version) {
        throw new Refused("Someone else just edited this plan. Reload and try again.");
      }
      newVersionNumber = (latest?.version ?? 0) + 1;

      await tx.taskExecutionPlanVersion.create({
        data: {
          taskId,
          version: newVersionNumber,
          source: "admin_edited",
          parentVersionId: baseVersionId,
          editedByAdminId: admin.id,
          editNote: editNote || null,
          deliverableDescription,
          assumptions,
          exclusions,
          internalCostLikelyCents: priced.internalCostLikelyCents,
          internalCostConservativeCents: priced.internalCostConservativeCents,
          suggestedPriceCents: priced.suggestedPriceCents,
          suggestedVaPayoutCents: priced.suggestedVaPayoutCents,
          calibration: priced.calibration,
          /**
           * The frozen economics of this edited version. Writing them here is
           * what makes an admin edit acceptable at all: a version without them
           * hands every billable step to a person at runtime, so an operator
           * who deliberately chose a primitive would watch it do nothing while
           * the mandate was still priced as if the machine had run.
           */
          expectedAutomationCostMicros: preflight.expectedAutomationCostMicros,
          conservativeAutomationCostMicros: preflight.conservativeAutomationCostMicros,
          automationSpendCeilingMicros: preflight.automationSpendCeilingMicros,
          automationCostPolicyVersion: preflight.policyVersion,
          /**
           * THE DATA CLASS SURVIVES AN EDIT, VERBATIM.
           *
           * It is a property of the mandate's DATA, computed from the client's
           * own files before the quote; editing the plan's text changes
           * nothing about what is inside those files. Left out, this create
           * wrote NULL, the compiler read NULL as public_business, and an
           * admin edit silently discarded a personal_sensitive escalation on
           * the one path where ingestion can actually run. Found by the final
           * adversarial review, and exactly the class of defect it exists for.
           */
          dataClass: base.dataClass,
          dataClassSignals: base.dataClassSignals,
          steps: {
            create: steps.map((s, i) => ({
              order: i + 1,
              title: s.title,
              description: s.description,
              executor: s.executor,
              humanRole: s.humanRole,
              tool: s.tool,
              /**
               * From the PREFLIGHT, not from the form. The version is still
               * the code's stamp, never the admin's; and when the economic
               * rule demoted a step, the stored plan must say so, otherwise
               * the price describes a demoted plan while the steps still
               * claim their primitive.
               */
              primitiveId: frozen.get(i + 1)?.primitiveId ?? null,
              primitiveVersion: frozen.get(i + 1)?.primitiveVersion ?? null,
              // Same freeze as the engine's writer: an operator editing a
              // capability's configuration is editing the contract.
              params: (s.params ?? undefined) as Prisma.InputJsonValue | undefined,
              expectedCostMicrosAtQuote: frozen.get(i + 1)?.expectedCostMicrosAtQuote ?? null,
              maxCostMicrosPerAttemptAtQuote:
                frozen.get(i + 1)?.maxCostMicrosPerAttemptAtQuote ?? null,
              maxAttemptsAtQuote: frozen.get(i + 1)?.maxAttemptsAtQuote ?? null,
              automationCostPolicyVersion: preflight.policyVersion,
              demotedForBudget: frozen.get(i + 1)?.demotedForBudget ?? false,
              fixedMinutes: s.fixedMinutes,
              secondsPerUnit: s.secondsPerUnit,
              estimatedMinutesOptimistic: s.estimatedMinutesOptimistic,
              estimatedMinutesLikely: s.estimatedMinutesLikely,
              estimatedMinutesConservative: s.estimatedMinutesConservative,
              estimatedAiCostCents: s.estimatedAiCostCents,
              estimatedToolUnits: s.estimatedToolUnits,
              verificationMethod: s.verificationMethod,
              acceptanceCriteria: s.acceptanceCriteria,
              riskLevel: s.riskLevel,
              riskNote: s.riskNote,
              dependsOnOrder: s.dependsOnOrder,
            })),
          },
        },
      });

      // The refreshed preview on the SAME aiXxx columns the queue and the
      // pricing form already read — still suggestion-side only (RULE 3):
      // clientPriceCents/vaPayoutCents/quotedAt remain approvePricing's.
      // updateMany with the status predicate re-asserts the edit lock AT
      // WRITE TIME: the read above holds no row lock, so approvePricing can
      // commit pricing_review→quoted between the check and here — in that
      // race the count comes back 0 and the whole edit rolls back instead
      // of stacking a version on a live quote (adversarial review).
      const updated = await tx.task.updateMany({
        where: { id: taskId, status: { in: ["submitted", "pricing_review"] } },
        data: aiSuggestionColumns(priced),
      });
      if (updated.count === 0) {
        throw new Refused(
          "This task has already been quoted. The plan behind a live quote is locked; cancel and re-quote to change it."
        );
      }
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.message };
    // Two concurrent edits raced to the same version number and one lost the
    // (taskId, version) unique constraint; everything rolled back — retry.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Someone else just edited this plan. Reload and try again." };
    }
    throw e;
  }

  revalidatePath(`/admin/pricing/${taskId}`);
  revalidatePath("/admin/pricing");
  return { ok: true, newVersion: newVersionNumber };
}
