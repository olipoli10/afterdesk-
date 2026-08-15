import "server-only";
import { prisma } from "@/lib/db";
import { HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { REGISTRY, resolvePrimitive } from "@/lib/ai-work-engine/registry";
import { Prisma } from "@prisma/client";

export type ResumeRefusalCause =
  | "not_found"
  | "not_accepted"
  | "already_resumed"
  | "stale_generation"
  | "lifecycle_exit"
  | "paused";

export type ResumeOutcome =
  | {
      resumed: true;
      resumeGeneration: number;
      resumedStepRunIds: string[];
      skippedStepRunIds: string[];
    }
  | { resumed: false; cause: ResumeRefusalCause };

type ResumeStep = {
  id: string;
  order: number;
  primitiveId: string | null;
  primitiveVersion: number | null;
  executionMode: string;
  status: string;
  handoffReason: string | null;
  planStep: {
    dependsOnOrder: number[];
    params: unknown;
    demotedForBudget: boolean;
  };
};

class LostResumeCas extends Error {}
class LostRunCas extends Error {}
class LostStepCas extends Error {}

const TASK_LIFECYCLE_EXITS = new Set(["cancelled", "expired", "completed"]);
const RUN_LIFECYCLE_EXITS = new Set(["abandoned", "done"]);

/**
 * Which accepted-plan steps are genuinely downstream of the human cut.
 * Admission already proves a total one-cut topology; this defensive graph walk
 * keeps the resume tied to dependencies instead of assuming order alone.
 */
function downstreamStepIds(steps: ResumeStep[], cutOrder: number): Set<string> {
  const byOrder = new Map(steps.map((step) => [step.order, step]));
  const memo = new Map<number, boolean>();
  const visiting = new Set<number>();
  const descendsFromCut = (order: number): boolean => {
    const cached = memo.get(order);
    if (cached !== undefined) return cached;
    if (order === cutOrder || visiting.has(order)) return false;
    const step = byOrder.get(order);
    if (!step) return false;
    visiting.add(order);
    const downstream = step.planStep.dependsOnOrder.some(
      (dependency) => dependency === cutOrder || descendsFromCut(dependency)
    );
    visiting.delete(order);
    memo.set(order, downstream);
    return downstream;
  };

  return new Set(steps.filter((step) => descendsFromCut(step.order)).map((step) => step.id));
}

function ownMeritRefusal(step: ResumeStep): string | null {
  if (step.planStep.demotedForBudget) {
    return step.handoffReason ?? HANDOFF_REASONS.no_primitive;
  }
  if (step.primitiveId === null) return HANDOFF_REASONS.no_primitive;
  if (!Object.hasOwn(REGISTRY, step.primitiveId)) return HANDOFF_REASONS.unknown_primitive;
  if (resolvePrimitive(step.primitiveId, step.primitiveVersion) === null) {
    return HANDOFF_REASONS.primitive_version_changed;
  }
  if (parsePrimitiveParams(step.primitiveId, step.planStep.params) === null) {
    return HANDOFF_REASONS.invalid_params;
  }
  return null;
}

/**
 * APPLY THE ACCEPTED RESULT — transaction T10.
 *
 * The acceptance is durable intent; this transaction is its only application.
 * Unit generation, unique resume record, step release, run transition and both
 * audit records commit together. A crash exposes all of them or none of them.
 */
export async function applyResume(unitStateId: string): Promise<ResumeOutcome> {
  try {
    return await prisma.$transaction(async (tx): Promise<ResumeOutcome> => {
      const unit = await tx.humanWorkUnitRunState.findUnique({
        where: { id: unitStateId },
        select: {
          id: true,
          state: true,
          taskId: true,
          runId: true,
          cutOrder: true,
          claimedById: true,
          claimGeneration: true,
          resumeGeneration: true,
          acceptance: { select: { id: true } },
          resume: { select: { id: true } },
          run: {
            select: {
              status: true,
              steps: {
                select: {
                  id: true,
                  order: true,
                  primitiveId: true,
                  primitiveVersion: true,
                  executionMode: true,
                  status: true,
                  handoffReason: true,
                  planStep: {
                    select: {
                      dependsOnOrder: true,
                      params: true,
                      demotedForBudget: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!unit) return { resumed: false, cause: "not_found" };

      // Lock the task row. Every lifecycle exit updates this same row, so the
      // resume and cancellation/expiry/completion have a single serial order.
      const lockedTasks = await tx.$queryRaw<{ status: string; claimedById: string | null }[]>(Prisma.sql`
        SELECT "status"::text AS status, "claimedById"
        FROM "Task"
        WHERE "id" = ${unit.taskId}
        FOR UPDATE
      `);
      const taskStatus = lockedTasks[0]?.status;
      if (!taskStatus || TASK_LIFECYCLE_EXITS.has(taskStatus)) {
        return { resumed: false, cause: "lifecycle_exit" };
      }
      if (
        taskStatus !== "claimed" ||
        unit.claimedById === null ||
        lockedTasks[0]?.claimedById !== unit.claimedById
      ) {
        return { resumed: false, cause: "not_accepted" };
      }
      if (RUN_LIFECYCLE_EXITS.has(unit.run.status)) {
        return { resumed: false, cause: "lifecycle_exit" };
      }
      if (unit.run.status === "paused" || unit.state === "paused") {
        return { resumed: false, cause: "paused" };
      }
      if (unit.resume || unit.state === "resumed") {
        return { resumed: false, cause: "already_resumed" };
      }
      if (unit.state === "exhausted" || unit.state === "withdrawn") {
        return { resumed: false, cause: "lifecycle_exit" };
      }
      if (unit.state !== "accepted" || !unit.acceptance) {
        return { resumed: false, cause: "not_accepted" };
      }

      const downstreamIds = downstreamStepIds(unit.run.steps, unit.cutOrder);
      const downstream = unit.run.steps
        .filter((step) => downstreamIds.has(step.id))
        .sort((a, b) => a.order - b.order);
      const byOrder = new Map(unit.run.steps.map((step) => [step.order, step]));
      const resumedStepRunIds: string[] = [];
      const skippedStepRunIds: string[] = [];
      const newlyDemoted = new Map<string, string[]>();

      // A step's primitive may still be runnable while one of its producers
      // no longer is. FR-024 requires both: own merits and every other
      // dependency satisfied. Re-evaluate the downstream graph as a graph so
      // a moved primitive cannot leave a decapitated consumer runnable.
      const refusalByStepId = new Map<string, string | null>();
      const visiting = new Set<string>();
      const resumeRefusal = (step: ResumeStep): string | null => {
        if (refusalByStepId.has(step.id)) return refusalByStepId.get(step.id)!;
        if (visiting.has(step.id)) return HANDOFF_REASONS.depends_on_human;

        if (step.status === "done") {
          refusalByStepId.set(step.id, null);
          return null;
        }
        if (step.status !== "blocked_on_human_unit" || step.executionMode !== "automated") {
          const refusal = step.handoffReason ?? HANDOFF_REASONS.depends_on_human;
          refusalByStepId.set(step.id, refusal);
          return refusal;
        }

        const ownRefusal = ownMeritRefusal(step);
        if (ownRefusal !== null) {
          refusalByStepId.set(step.id, ownRefusal);
          return ownRefusal;
        }

        visiting.add(step.id);
        const dependenciesSatisfied = step.planStep.dependsOnOrder.every((order) => {
          if (order === unit.cutOrder) return true;
          const dependency = byOrder.get(order);
          if (!dependency) return false;
          if (dependency.status === "done") return true;
          return downstreamIds.has(dependency.id) && resumeRefusal(dependency) === null;
        });
        visiting.delete(step.id);
        const refusal = dependenciesSatisfied ? null : HANDOFF_REASONS.depends_on_human;
        refusalByStepId.set(step.id, refusal);
        return refusal;
      };

      for (const step of downstream) {
        if (step.status !== "blocked_on_human_unit" || step.executionMode !== "automated") {
          skippedStepRunIds.push(step.id);
          continue;
        }
        const refusal = resumeRefusal(step);
        if (refusal === null) {
          resumedStepRunIds.push(step.id);
        } else {
          skippedStepRunIds.push(step.id);
          const ids = newlyDemoted.get(refusal) ?? [];
          ids.push(step.id);
          newlyDemoted.set(refusal, ids);
        }
      }

      const nextGeneration = unit.resumeGeneration + 1;
      const movedUnit = await tx.humanWorkUnitRunState.updateMany({
        where: {
          id: unit.id,
          state: "accepted",
          resumeGeneration: unit.resumeGeneration,
        },
        data: {
          state: "resumed",
          resumeGeneration: { increment: 1 },
          transitionSeq: { increment: 1 },
        },
      });
      if (movedUnit.count === 0) throw new LostResumeCas();

      await tx.humanWorkUnitResumeRecord.create({
        data: {
          runId: unit.runId,
          unitStateId: unit.id,
          acceptanceId: unit.acceptance.id,
          resumeGeneration: nextGeneration,
          resumedStepRunIds,
          skippedStepRunIds,
        },
      });

      if (resumedStepRunIds.length > 0) {
        const madePending = await tx.taskWorkflowStepRun.updateMany({
          where: {
            id: { in: resumedStepRunIds },
            runId: unit.runId,
            status: "blocked_on_human_unit",
            executionMode: "automated",
          },
          data: { status: "pending" },
        });
        if (madePending.count !== resumedStepRunIds.length) throw new LostStepCas();
      }

      for (const [handoffReason, ids] of newlyDemoted) {
        const demoted = await tx.taskWorkflowStepRun.updateMany({
          where: {
            id: { in: ids },
            runId: unit.runId,
            status: "blocked_on_human_unit",
            executionMode: "automated",
          },
          data: {
            status: "handed_to_human",
            executionMode: "human",
            handoffReason,
          },
        });
        if (demoted.count !== ids.length) throw new LostStepCas();
      }

      const demotedCount = [...newlyDemoted.values()].reduce(
        (total, ids) => total + ids.length,
        0
      );
      const movedRun = await tx.taskWorkflowRun.updateMany({
        where: { id: unit.runId, status: "awaiting_human_unit" },
        data: {
          status: "running",
          pausedReason: null,
          ...(demotedCount > 0
            ? {
                automatedStepCount: { decrement: demotedCount },
                humanStepCount: { increment: demotedCount },
              }
            : {}),
        },
      });
      if (movedRun.count === 0) throw new LostRunCas();

      const moved = await tx.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { transitionSeq: true },
      });
      await tx.humanWorkUnitTransition.create({
        data: {
          unitStateId: unit.id,
          seq: moved.transitionSeq,
          actorId: null,
          actorRole: "system",
          fromState: "accepted",
          toState: "resumed",
          cause: "resumed",
          claimGeneration: unit.claimGeneration,
          resumeGeneration: nextGeneration,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: unit.taskId,
          action: "human_unit_resumed",
          meta: {
            state: "resumed",
            cause: "resumed",
            claimGeneration: unit.claimGeneration,
            resumeGeneration: nextGeneration,
          },
        },
      });

      return {
        resumed: true,
        resumeGeneration: nextGeneration,
        resumedStepRunIds,
        skippedStepRunIds,
      };
    });
  } catch (error) {
    if (error instanceof LostResumeCas) {
      return { resumed: false, cause: "stale_generation" };
    }
    if (error instanceof LostRunCas) {
      const current = await prisma.taskWorkflowRun.findFirst({
        where: { humanWorkUnit: { id: unitStateId } },
        select: { status: true },
      });
      return {
        resumed: false,
        cause: current?.status === "paused" ? "paused" : "lifecycle_exit",
      };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { resumed: false, cause: "stale_generation" };
    }
    // A step changing between classification and transition means this resume
    // did not own the state it tried to publish. Roll back all of T10 and let a
    // later recovery tick re-read the now-current rows.
    if (error instanceof LostStepCas) {
      return { resumed: false, cause: "stale_generation" };
    }
    throw error;
  }
}

/** Crash recovery: each accepted intent is isolated from every other one. */
export async function recoverPendingHumanUnitResumes(): Promise<number> {
  const pending = await prisma.humanWorkUnitRunState.findMany({
    where: { state: "accepted", resume: null },
    select: { id: true },
    orderBy: { admittedAt: "asc" },
    take: 50,
  });

  let resumed = 0;
  for (const unit of pending) {
    try {
      const outcome = await applyResume(unit.id);
      if (outcome.resumed) resumed++;
    } catch (error) {
      console.error("[human-unit] could not recover accepted resume", {
        unitStateId: unit.id,
        error,
      });
    }
  }
  return resumed;
}
