"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import {
  decideHumanUnitCandidate as decideCandidate,
  openHumanUnitReview as openReview,
} from "@/server/human-unit";
import { applyResume } from "@/server/human-unit-resume";
import { publishAdmittedResidualScope } from "@/server/workflow-runs";
import type { HumanUnitResult } from "@/server/actions/human-unit-worker";

const openSchema = z.string();
const decideSchema = z.object({
  candidateId: z.string(),
  outcome: z.enum(["accept", "reject"]),
  cause: z
    .enum(["revisions_exhausted", "unsafe_or_unverifiable", "quality"])
    .optional(),
  revisionInstructions: z.string().trim().min(5).max(4_000).optional(),
});
const continueSchema = z.object({
  taskId: z.string(),
  decision: z.enum(["continue_within_ceiling", "fail_closed_to_manual"]),
  reason: z.string().trim().min(3).max(2_000),
});

const ADMIN_ERRORS = {
  not_available: "This human work unit is not available for that action.",
  duplicate: "This review decision was already recorded.",
  self_review: "The worker who submitted this result cannot review it.",
  stale_generation: "This candidate belongs to an earlier assignment generation.",
  lifecycle_exit: "This task or run has already ended.",
  paused: "This run remains paused and requires a fail-closed operator decision.",
} as const;

type AdminRefusalCode = keyof typeof ADMIN_ERRORS;

function refusal(
  code: AdminRefusalCode,
  error: string = ADMIN_ERRORS[code]
): HumanUnitResult {
  return { ok: false, error, code };
}

function revalidateAdminTask(taskId: string): void {
  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath("/admin/tasks");
}

/** Authentication precedes even the string boundary, by contract. */
export async function openHumanUnitReview(taskId: string): Promise<HumanUnitResult> {
  const admin = await requireRole("ADMIN");
  const parsed = openSchema.safeParse(taskId);
  if (!parsed.success) return refusal("not_available", "A task id is required.");

  const outcome = await openReview({ taskId: parsed.data, actorId: admin.id });
  if (!outcome.opened) return refusal(outcome.cause);

  revalidateAdminTask(parsed.data);
  return { ok: true };
}

/**
 * Admin boundary for T7/T8/T9. The durable acceptance is committed before
 * `after()` receives applyResume; recovery owns convergence if that accelerator
 * never runs.
 */
export async function decideHumanUnitCandidate(
  input: unknown
): Promise<HumanUnitResult> {
  const admin = await requireRole("ADMIN");
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) {
    return refusal("not_available", "A valid review decision is required.");
  }

  const outcome = await decideCandidate({
    candidateId: parsed.data.candidateId,
    actorId: admin.id,
    outcome: parsed.data.outcome,
    cause:
      parsed.data.cause === "quality" ? undefined : parsed.data.cause,
    revisionInstructions: parsed.data.revisionInstructions,
  });
  if (!outcome.decided) return refusal(outcome.cause);

  if (outcome.state === "accepted") {
    after(() => applyResume(outcome.unitStateId));
  }
  revalidatePath("/admin/human-units");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

const TASK_LIFECYCLE_EXITS = new Set(["cancelled", "expired", "completed"]);
const RUN_LIFECYCLE_EXITS = new Set(["abandoned", "done"]);

type ContinueCommit =
  | { ok: false; code: AdminRefusalCode }
  | {
      ok: true;
      unitStateId: string;
      runId: string;
      state: "accepted" | "exhausted";
    };

/**
 * FR-037's sole operator gate. It may reopen only an economics pause whose
 * already-consumed and still-held spend fits the immutable accepted ceiling.
 * No branch writes a price, payout, ceiling, hold amount or policy version.
 */
export async function continuePausedHumanUnitRun(
  input: unknown
): Promise<HumanUnitResult> {
  const admin = await requireRole("ADMIN");
  const parsed = continueSchema.safeParse(input);
  if (!parsed.success) {
    return refusal("not_available", "A task, decision and reason are required.");
  }

  const committed = await prisma.$transaction<ContinueCommit>(async (tx) => {
    const unit = await tx.humanWorkUnitRunState.findUnique({
      where: { taskId: parsed.data.taskId },
      select: {
        id: true,
        taskId: true,
        state: true,
        refusalCause: true,
        transitionSeq: true,
        claimGeneration: true,
        resumeGeneration: true,
        acceptance: { select: { id: true } },
        task: { select: { status: true } },
        run: {
          select: {
            id: true,
            status: true,
            runAutomationBudgetMicros: true,
            actualAiCostMicros: true,
            actualToolCostMicros: true,
            snapshot: { select: { automationSpendCeilingMicros: true } },
            budgetHolds: {
              where: { status: "held" },
              select: { amountMicros: true },
            },
          },
        },
      },
    });
    if (!unit) return { ok: false, code: "not_available" };
    if (
      TASK_LIFECYCLE_EXITS.has(unit.task.status) ||
      RUN_LIFECYCLE_EXITS.has(unit.run.status)
    ) {
      return { ok: false, code: "lifecycle_exit" };
    }
    if (unit.state !== "paused" || unit.run.status !== "paused") {
      return { ok: false, code: "paused" };
    }

    const continuing = parsed.data.decision === "continue_within_ceiling";
    if (continuing) {
      if (
        unit.refusalCause !== "economics_exceeds_reserved" ||
        unit.acceptance === null
      ) {
        return { ok: false, code: "paused" };
      }
      const runCeiling = unit.run.runAutomationBudgetMicros;
      const frozenCeiling = unit.run.snapshot.automationSpendCeilingMicros;
      if (runCeiling === null || runCeiling !== frozenCeiling) {
        return { ok: false, code: "paused" };
      }
      const reserved = unit.run.budgetHolds.reduce(
        (sum, hold) => sum + hold.amountMicros,
        0n
      );
      const consumed =
        BigInt(unit.run.actualAiCostMicros) +
        BigInt(unit.run.actualToolCostMicros) +
        reserved;
      if (consumed > runCeiling) return { ok: false, code: "paused" };
    }

    const nextState = continuing ? ("accepted" as const) : ("exhausted" as const);
    const cause = continuing ? "admin_continued" : "admin_failed_closed";
    const movedUnit = await tx.humanWorkUnitRunState.updateMany({
      where: {
        id: unit.id,
        state: "paused",
        refusalCause: unit.refusalCause,
        transitionSeq: unit.transitionSeq,
      },
      data: {
        state: nextState,
        refusalCause: continuing ? null : unit.refusalCause,
        pausedDetail: null,
        transitionSeq: { increment: 1 },
      },
    });
    const movedRun = await tx.taskWorkflowRun.updateMany({
      where: { id: unit.run.id, status: "paused" },
      data: { status: "awaiting_human_unit", pausedReason: null },
    });
    if (movedUnit.count !== 1 || movedRun.count !== 1) {
      throw new Error("paused human unit continuation lost its compare-and-swap");
    }

    const audited = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { transitionSeq: true },
    });
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: unit.id,
        seq: audited.transitionSeq,
        actorId: admin.id,
        actorRole: "admin",
        fromState: "paused",
        toState: nextState,
        cause,
        claimGeneration: unit.claimGeneration,
        resumeGeneration: unit.resumeGeneration,
      },
    });
    await tx.taskEvent.create({
      data: {
        taskId: unit.taskId,
        action: continuing ? "human_unit_accepted" : "human_unit_exhausted",
        actorId: admin.id,
        reason: parsed.data.reason,
        meta: {
          state: nextState,
          cause,
          claimGeneration: unit.claimGeneration,
          resumeGeneration: unit.resumeGeneration,
        },
      },
    });
    return {
      ok: true,
      unitStateId: unit.id,
      runId: unit.run.id,
      state: nextState,
    };
  });

  if (!committed.ok) return refusal(committed.code);
  if (committed.state === "accepted") {
    after(() => applyResume(committed.unitStateId));
  } else {
    await publishAdmittedResidualScope(committed.runId);
  }
  revalidateAdminTask(parsed.data.taskId);
  revalidatePath("/admin/human-units");
  return { ok: true };
}
