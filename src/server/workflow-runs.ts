import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { classifyProviderError } from "@/lib/ai-work-engine/provider-error";
import {
  BUDGET_POLICY_VERSION,
  deriveRunBudgetMicros,
  releaseHold,
  reserveSpend,
  settleHold,
} from "@/server/workflow-budget";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { compileDecisions, type CompileStepInput } from "@/lib/ai-work-engine/compile";
import { resolvePrimitive } from "@/lib/ai-work-engine/registry";
import { computeResidual, type ResidualStepInput } from "@/lib/ai-work-engine/residual";
import { searchCostMicros } from "@/lib/ai-work-engine/tool-cost";
import { buildHumanPackageCopy } from "@/lib/ai-work-engine/human-package-copy";
import { emptyPayload } from "@/lib/ai-work-engine/primitives/types";
import { loadLatestPayload, persistPayload, writeArtifact } from "@/server/workflow-artifacts";
import { resolvePoolAudience, writePoolNotifications } from "@/server/pool-notifications";

/**
 * THE DURABLE STEP PROCESSOR.
 *
 * Modelled on processMoneyIntents — claim by compare-and-swap, cap the
 * attempts, record the error — with the three things that motif was missing,
 * all of which were found by auditing it: a LEASE (so a crashed runner does
 * not strand a step forever), a BACKOFF (so a transient failure is not retried
 * in a tight loop every tick), and an ALERT on exhaustion (so a dead step
 * reaches an operator instead of going quiet).
 *
 * State lives entirely in Postgres. `after()` is only an accelerator: any
 * invocation, from any process, can pick a run up where it was left.
 */

/** Long enough to outlast the slowest primitive, short enough to recover. */
const LEASE_MS = 6 * 60 * 1000;

/** Wall-clock budget for one invocation before it hands back to the next tick. */
const INVOCATION_BUDGET_MS = 60 * 1000;

/** Deterministic, growing: 1, 4, 9 minutes. No jitter — reproducibility wins. */
function backoffMs(attempts: number): number {
  return Math.min(attempts * attempts, 60) * 60 * 1000;
}

async function notifyAdmins(input: { type: string; title: string; body: string; taskId: string }) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, ...input })),
  });
}

// ── Routing at payment time ───────────────────────────────────────────────

/**
 * Cheap pre-check, made inside the payment transaction: is there anything for
 * the machine to try? One query, no compilation — compiling needs the plan
 * steps and the classification, and a payment transaction is the wrong place
 * to hold that open.
 *
 * A `false` here sends the task straight to `open`, exactly as before Phase
 * 1B. That is the majority path today and it must stay the cheap one.
 */
export async function hasExecutableContract(
  tx: { task: { findUnique: typeof prisma.task.findUnique } },
  taskId: string
): Promise<boolean> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      isInternal: true,
      standingCapacityAccountId: true,
      acceptanceSnapshot: { select: { planVersionId: true } },
    },
  });
  if (!task) return false;
  if (task.isInternal || task.standingCapacityAccountId !== null) return false;
  return Boolean(task.acceptanceSnapshot?.planVersionId);
}

/**
 * The entry point after payment clears. Compiles, then either runs the machine
 * block or hands straight over. Never throws: a workflow problem must not
 * become a payment problem.
 */
export async function startWorkflow(taskId: string): Promise<void> {
  try {
    const compiled = await compileWorkflowForTask(taskId);
    if (!compiled) {
      // Nothing compilable after all (a plan with no steps, a race with a
      // cancellation). The task must not sit in ai_processing forever.
      await releaseToPoolWithoutAutomation(taskId, "no executable plan");
      return;
    }
    if (compiled.fullyHuman) {
      // Everything is a person's: no machine block to run, but the residual
      // and the package are still built so the worker gets the same brief
      // shape either way.
      await finishRun(compiled.runId);
      return;
    }
    await advanceWorkflow(taskId);
  } catch (error) {
    console.error("[workflow] start failed", { taskId, error });
  }
}

/**
 * The degraded exit: leave ai_processing for the pool without changing the
 * payout. Used when there is nothing to compile and when an operator abandons
 * a run. The worker gets the mandate exactly as it was quoted.
 */
export async function releaseToPoolWithoutAutomation(
  taskId: string,
  reason: string
): Promise<void> {
  /**
   * The audience is resolved OUTSIDE the transaction, the same split finishRun
   * already had to make. `notifyEligiblePoolWorkers` reads the settings row
   * plus every approved worker profile, unbounded; Prisma's interactive
   * transactions time out at five seconds, and this path took the whole thing
   * inside. It failed as a P2028 rather than a TransitionError, so the catch
   * below rethrew it, the task stayed in ai_processing, and nothing was
   * scheduled to try again until the six-hourly stall sweep.
   */
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, title: true, tier: true, isInternal: true },
  });
  if (!task || task.status !== "ai_processing") return;
  const audience = await resolvePoolAudience(taskId, task);

  try {
    await prisma.$transaction(async (tx) => {
      await transitionTask({
        tx,
        taskId,
        from: "ai_processing",
        to: "open",
        action: "automated_processing_skipped",
        reason,
        meta: { reason },
      });
      await writePoolNotifications(tx, taskId, task.title, audience);
    });
  } catch (error) {
    if (error instanceof TransitionError) return;
    throw error;
  }
}

// ── Compilation ───────────────────────────────────────────────────────────

/**
 * Turns the ACCEPTED contract into a run. Reads
 * TaskAcceptanceSnapshot.planVersionId and nothing else: never the latest plan
 * version, never Task.quotedPlanVersionId (which is nullable by SetNull). The
 * snapshot is the contract and the contract is what executes.
 *
 * Returns null when there is nothing to compile, which is the ordinary case
 * for a task quoted without a plan. The caller sends those straight to `open`.
 */
export async function compileWorkflowForTask(
  taskId: string
): Promise<{ runId: string; fullyHuman: boolean } | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      isInternal: true,
      standingCapacityAccountId: true,
      acceptanceSnapshot: { select: { id: true, planVersionId: true } },
      aiClassification: { select: { sensitiveData: true, requiredAccess: true } },
      workflowRun: { select: { id: true, automatedStepCount: true } },
    },
  });
  if (!task) return null;

  // Already compiled: the unique constraint on snapshotId guarantees one run
  // per contract, and a redelivered webhook must be a no-op.
  if (task.workflowRun) {
    return { runId: task.workflowRun.id, fullyHuman: task.workflowRun.automatedStepCount === 0 };
  }

  // Same guards as the Phase 1A engine: a standing-capacity block is paid per
  // period and never quoted, and internal practice work exists to exercise the
  // human pipeline.
  if (task.standingCapacityAccountId !== null || task.isInternal) return null;

  const snapshot = task.acceptanceSnapshot;
  if (!snapshot || !snapshot.planVersionId) return null;

  const planSteps = await prisma.taskExecutionPlanStep.findMany({
    where: { planVersionId: snapshot.planVersionId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      title: true,
      executor: true,
      primitiveId: true,
      primitiveVersion: true,
      dependsOnOrder: true,
      // 1D-alpha0: the provenance of the automation budget. This is the
      // planner's own per-step figure, already stamped into the accepted plan
      // version and already inside computeInternalCostCents, so the ceiling
      // derives from something the client's price was built on.
      estimatedAiCostCents: true,
    },
  });
  if (planSteps.length === 0) return null;

  const input: CompileStepInput[] = planSteps.map((s) => ({
    planStepId: s.id,
    order: s.order,
    title: s.title,
    executor: s.executor,
    primitiveId: s.primitiveId,
    primitiveVersion: s.primitiveVersion,
    dependsOnOrder: s.dependsOnOrder,
  }));

  const compiled = compileDecisions(input, {
    sensitiveData: task.aiClassification?.sensitiveData ?? false,
    requiredAccessCount: task.aiClassification?.requiredAccess.length ?? 0,
  });

  /**
   * THE BUDGET IS FROZEN HERE, ONCE, AND NEVER RECOMPUTED.
   *
   * Only the steps that actually compiled to `automated` contribute: a step
   * the gate or the topology sent to a person will not spend, so counting its
   * planned model cost would hand the run budget it has no use for.
   */
  const automatedPlanned = compiled.steps
    .filter((s) => s.executionMode === "automated")
    .map((s) => {
      const planStep = planSteps.find((p) => p.id === s.planStepId);
      if (!planStep) return null;
      // The registry's reviewed cap for this exact primitive, so the floor
      // below can guarantee one attempt of every step the compiler produced.
      const primitive = resolvePrimitive(s.primitiveId, s.primitiveVersion);
      return {
        estimatedAiCostCents: planStep.estimatedAiCostCents,
        maxCostMicrosPerAttempt: primitive?.maxCostMicrosPerAttempt ?? 0,
      };
    })
    .filter((p): p is { estimatedAiCostCents: number; maxCostMicrosPerAttempt: number } =>
      p !== null
    );

  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId,
      planVersionId: snapshot.planVersionId,
      status: compiled.fullyHuman ? "awaiting_human" : "running",
      automatedStepCount: compiled.automatedStepCount,
      humanStepCount: compiled.humanStepCount,
      runAutomationBudgetMicros: deriveRunBudgetMicros(automatedPlanned),
      budgetPolicyVersion: BUDGET_POLICY_VERSION,
      compiledAt: new Date(),
      startedAt: compiled.fullyHuman ? null : new Date(),
      steps: {
        create: compiled.steps.map((s) => ({
          planStepId: s.planStepId,
          order: s.order,
          primitiveId: s.primitiveId,
          primitiveVersion: s.primitiveVersion,
          executionMode: s.executionMode,
          status: s.executionMode === "automated" ? "pending" : "handed_to_human",
          handoffReason: s.handoffReason,
        })),
      },
    },
    select: { id: true },
  });

  return { runId: run.id, fullyHuman: compiled.fullyHuman };
}

// ── Execution ─────────────────────────────────────────────────────────────

type ClaimedStep = {
  id: string;
  order: number;
  primitiveId: string | null;
  primitiveVersion: number | null;
  attempts: number;
  /**
   * THE FENCING TOKEN. Every write that ends this step carries it in the
   * WHERE clause, so an invocation whose lease has already expired and been
   * taken by someone else cannot finish on top of the new holder. See the
   * comment on `finishClaimedStep`.
   */
  lockedBy: string;
};

/**
 * Ends a claimed step, but ONLY if this invocation still holds the lease.
 *
 * Without the `lockedBy` predicate the lease was decorative. The sequence that
 * breaks it needs no unusual conditions, only a slow primitive: invocation A
 * claims step 1 and starts a web search; A's wall-clock budget or the hosting
 * platform's request limit expires while the provider call is still in flight
 * (withTimeout races a promise it cannot cancel, so the call outlives it); the
 * six-minute lease lapses; invocation B legitimately reclaims step 1 and starts
 * replaying it. A then wakes up and writes `status: "done"` by id, clearing B's
 * lease. A walks on to step 2 while B is still executing step 1, and B's
 * eventual payload write lands on the deterministic key step 2 is at that
 * moment reading. The strict in-order walk in claimNextStep is correct; it was
 * being undone by the completion write, not by the selection.
 *
 * A zero count means this invocation was superseded. That is not an error: the
 * step belongs to someone else now, and the right response is to stop touching
 * it.
 */
/**
 * A step that has burned its whole attempt budget is a decision for a person,
 * so the run stops and says so. The motif this engine is modelled on simply
 * let an exhausted row become invisible, which is how a stuck money intent
 * could sit unnoticed for as long as it liked.
 *
 * Shared by both discovery paths: the failure handler (the attempt threw) and
 * the claim loop (the attempt's process died, so no handler ever ran). The
 * `status` predicate makes a second call a no-op, so a run cannot be paused
 * twice or alert an operator twice for the same step.
 */
async function pauseRunForExhaustedStep(input: {
  runId: string;
  order: number;
  primitiveId: string;
  attempts: number;
  message: string;
}): Promise<void> {
  const paused = await prisma.taskWorkflowRun.updateMany({
    where: { id: input.runId, status: { in: ["running", "compiling"] } },
    data: {
      status: "paused",
      pausedReason: `Step ${input.order} (${input.primitiveId}) failed ${input.attempts} times: ${input.message}`,
    },
  });
  if (paused.count === 0) return;

  const run = await prisma.taskWorkflowRun.findUnique({
    where: { id: input.runId },
    select: { taskId: true },
  });
  if (!run) return;

  // Phase 1C: a pause that writes ONLY run columns was invisible to the
  // operational staleness sweep (which watches events, payments, payouts
  // and sessions). The journal entry makes the pause a fact the
  // intelligence layer can see - and gives the audit log the stop it was
  // missing anyway.
  await prisma.taskEvent.create({
    data: {
      taskId: run.taskId,
      action: "workflow_run_paused",
      meta: { order: input.order, primitiveId: input.primitiveId, attempts: input.attempts },
    },
  });

  await notifyAdmins({
    type: "workflow_step_exhausted",
    title: "Automated processing stopped",
    body: `Task ${run.taskId}: step ${input.order} (${input.primitiveId}) failed ${input.attempts} times. The run is paused; releasing it to the pool pays the worker the full quoted amount.`,
    taskId: run.taskId,
  });
}

/**
 * The run reached its automation ceiling. Same mechanics as an exhausted step
 * (idempotent pause, journal entry, operator notification), different reason:
 * this is not a failure to retry, it is a decision that belongs to a person.
 * The work already produced survives, and releasing the mandate to the pool
 * pays the worker the full quoted amount.
 */
async function pauseRunForBudget(
  runId: string,
  taskId: string,
  refusal: { reason: string; ceilingMicros: number | null; committedMicros: number; requestedMicros: number }
): Promise<void> {
  const ceiling = refusal.ceilingMicros;
  const reason =
    refusal.reason === "no_budget_defined"
      ? "No automation budget was frozen for this run, so no billable step may start."
      : `Automation budget reached: ${refusal.committedMicros} of ${ceiling ?? 0} microdollars committed, next step needs ${refusal.requestedMicros}.`;

  const paused = await prisma.taskWorkflowRun.updateMany({
    where: { id: runId, status: { in: ["running", "compiling"] } },
    data: { status: "paused", pausedReason: reason },
  });
  if (paused.count === 0) return;

  await prisma.taskEvent.create({
    data: {
      taskId,
      action: "workflow_run_paused",
      meta: {
        reason: "automation_budget",
        ceilingMicros: ceiling,
        committedMicros: refusal.committedMicros,
        requestedMicros: refusal.requestedMicros,
      },
    },
  });

  await notifyAdmins({
    type: "workflow_over_budget",
    title: "Automated processing stopped at its budget",
    body: `Task ${taskId}: the run reached its automation budget and paused before spending more. Nothing is lost; releasing it to the pool pays the worker the full quoted amount.`,
    taskId,
  });
}

async function finishClaimedStep(
  step: ClaimedStep,
  data: Record<string, unknown>
): Promise<boolean> {
  const written = await prisma.taskWorkflowStepRun.updateMany({
    where: { id: step.id, lockedBy: step.lockedBy },
    data,
  });
  if (written.count === 0) {
    console.warn("[workflow] step finished by a superseded invocation, ignoring", {
      stepRunId: step.id,
      lockedBy: step.lockedBy,
    });
    return false;
  }
  return true;
}

/**
 * Claims the next runnable step, or returns null when the machine block is
 * done. Automated steps run in ascending `order`: the compiler guarantees the
 * automatable set has no dependency on anything outside itself, so ordinal
 * order already respects every real dependency.
 */
/**
 * HAND ONE STEP TO A PERSON, AND KEEP THE RUN'S COUNTERS TRUE.
 *
 * The bug this exists to fix: the in-flight handoff paths flipped the STEP to
 * `handed_to_human` but never moved `automatedStepCount` / `humanStepCount` on
 * the run. Those two are not display fields — `computeResidual` reads
 * `automatedStepCount` in `finishRun` as the evidence that the machine reduced
 * the work, and a residual computed from an inflated count pays a worker for
 * automation that did not happen. A step that quietly became human work while
 * still being counted as automated is money, not bookkeeping.
 *
 * Both writes go in ONE transaction, and the counter only moves when the step
 * update actually changed a row, so a replay cannot decrement twice.
 */
async function handOffStepToHuman(
  stepRunId: string,
  runId: string,
  reason: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const moved = await tx.taskWorkflowStepRun.updateMany({
      where: {
        id: stepRunId,
        status: { notIn: ["done", "handed_to_human"] },
        executionMode: "automated",
      },
      data: {
        status: "handed_to_human",
        executionMode: "human",
        handoffReason: reason,
        leaseExpiresAt: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (moved.count === 0) return;
    await tx.taskWorkflowRun.update({
      where: { id: runId },
      data: {
        automatedStepCount: { decrement: moved.count },
        humanStepCount: { increment: moved.count },
      },
    });
  });
}

async function claimNextStep(runId: string): Promise<ClaimedStep | null> {
  const now = new Date();

  /**
   * THE PIPELINE RUNS STRICTLY IN ORDER, WITH NO SKIPPING.
   *
   * Every automated step is fetched, not only the claimable ones, and the
   * walk stops at the first one that is not `done`. Selecting "the lowest
   * claimable step" instead would let step N+1 run while step N is still in
   * flight under a live lease: two invocations (the after() fast path and a
   * cron tick) would then execute different stages of the same run
   * concurrently, and build.csv could write an empty candidate file from a
   * payload extract.structured_rows had not produced yet.
   *
   * The steps genuinely form a chain — each reads its predecessor's payload —
   * so "first incomplete step or nothing" is the only safe rule.
   */
  const steps = await prisma.taskWorkflowStepRun.findMany({
    where: { runId, executionMode: "automated" },
    orderBy: { order: "asc" },
    select: { id: true, order: true, primitiveId: true, primitiveVersion: true, attempts: true, status: true, leaseExpiresAt: true, nextAttemptAt: true, lastError: true },
  });

  const candidates = [];
  for (const step of steps) {
    if (step.status === "done" || step.status === "handed_to_human") continue;
    // The first step that is not finished is the ONLY one we may consider.
    const claimable =
      step.status === "pending" ||
      step.status === "ready" ||
      (step.status === "failed" &&
        (step.nextAttemptAt === null || step.nextAttemptAt <= now)) ||
      (step.status === "running" &&
        step.leaseExpiresAt !== null &&
        step.leaseExpiresAt < now);
    if (claimable) candidates.push(step);
    // Whether or not it was claimable, nothing after it may run yet.
    break;
  }

  for (const candidate of candidates) {
    const primitive = resolvePrimitive(candidate.primitiveId, candidate.primitiveVersion);
    if (!primitive) {
      /**
       * The registry moved under an accepted contract. Handing the step over
       * HERE is what keeps the run alive: skipping it (the previous
       * behaviour) left the run permanently unable to advance, because the
       * recovery branch further down could only ever be reached by a step
       * that had already resolved.
       */
      await handOffStepToHuman(
        candidate.id,
        runId,
        "The primitive changed or was withdrawn after this plan was accepted; a person does this step."
      );
      continue;
    }
    /**
     * EXHAUSTION IS DECIDED HERE, NOT ONLY IN THE FAILURE HANDLER.
     *
     * The handler below pauses the run and alerts an operator when a step
     * burns its last attempt — but only when the attempt ends in a caught
     * exception. A step claimed on its final attempt whose PROCESS DIES runs
     * no catch at all, and the hosting platform killing a long request is the
     * ordinary case here, not the exotic one. The row was then left `running`
     * with an expired lease and `attempts === maxAttempts`: selected on every
     * subsequent tick, skipped by this line, never claimed, never alerted.
     * The run stayed `running` forever and occupied one of the ten slots
     * processWorkflowRuns takes per tick, so enough of them stall the queue.
     */
    if (candidate.attempts >= primitive.maxAttempts) {
      await prisma.taskWorkflowStepRun.updateMany({
        where: { id: candidate.id, status: { notIn: ["done", "handed_to_human"] } },
        data: {
          status: "failed",
          lastError: candidate.lastError ?? "The step ran out of attempts without reporting an error.",
          leaseExpiresAt: null,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: null,
        },
      });
      await pauseRunForExhaustedStep({
        runId,
        order: candidate.order,
        primitiveId: primitive.id,
        attempts: candidate.attempts,
        message: candidate.lastError ?? "the process ended before the step reported a result",
      });
      continue;
    }

    // The claim repeats the selection predicate, so two runners racing on the
    // same expired lease cannot both win it. The token is generated HERE, not
    // inline in `data`, because the caller has to carry it: it is the fencing
    // token every terminal write checks.
    const lockedBy = randomUUID();
    const claimed = await prisma.taskWorkflowStepRun.updateMany({
      where: {
        id: candidate.id,
        attempts: { lt: primitive.maxAttempts },
        OR: [
          { status: { in: ["pending", "ready"] } },
          // The backoff belongs in the CLAIM, not only in the selection above.
          // Omitting it let a second invocation claim a step that the first
          // had just failed and scheduled for later, so a single transient
          // 429 burned both attempts back to back in seconds instead of over
          // five minutes, and billed the searches twice.
          {
            status: "failed",
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: "running", leaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: {
        status: "running",
        attempts: { increment: 1 },
        lockedAt: new Date(),
        lockedBy,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        startedAt: new Date(),
        lastError: null,
      },
    });
    if (claimed.count === 0) continue;

    return {
      id: candidate.id,
      order: candidate.order,
      primitiveId: candidate.primitiveId,
      primitiveVersion: candidate.primitiveVersion,
      attempts: candidate.attempts + 1,
      lockedBy,
    };
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Advances one run as far as one invocation's time budget allows, then hands
 * back. Never throws to its caller: a workflow failure must never become a
 * webhook failure or a page-render failure.
 */
export async function advanceWorkflow(taskId: string): Promise<{ steps: number; finished: boolean }> {
  let steps = 0;
  const deadline = Date.now() + INVOCATION_BUDGET_MS;

  try {
    const run = await prisma.taskWorkflowRun.findUnique({
      where: { taskId },
      select: {
        id: true,
        snapshotId: true,
        status: true,
        task: {
          select: {
            id: true,
            status: true,
            title: true,
            description: true,
            quantity: true,
            aiClassification: {
              select: {
                objective: true,
                geography: true,
                requiredFields: true,
                quantityInterpreted: true,
              },
            },
          },
        },
      },
    });
    if (!run) return { steps: 0, finished: false };
    if (run.status !== "running") return { steps: 0, finished: run.status === "awaiting_human" };
    /**
     * The task's own status is the authority, not the run's. `ai_processing`
     * has cancelled and expired as legal exits and an operator can take
     * either from the admin task page: without this check a cancelled mandate
     * would keep spending on searches and model calls, and would keep being
     * picked up by every cron tick because its run row still says "running".
     */
    if (run.task.status !== "ai_processing") {
      await prisma.taskWorkflowRun.updateMany({
        where: { id: run.id, status: "running" },
        data: {
          status: "abandoned",
          finishedAt: new Date(),
          pausedReason: `Task left ai_processing (${run.task.status}); execution stopped.`,
        },
      });
      return { steps: 0, finished: false };
    }

    const classification = run.task.aiClassification;

    while (Date.now() < deadline) {
      const step = await claimNextStep(run.id);
      if (!step) break;

      const primitive = resolvePrimitive(step.primitiveId, step.primitiveVersion);
      if (!primitive) {
        // Unreachable via claimNextStep, but a run must never spin on a step
        // it cannot resolve. Goes through the counter-aware helper for the
        // same reason as the other handoff: a step that becomes human work
        // while still counted as automated inflates the residual reduction.
        await handOffStepToHuman(step.id, run.id, "The primitive is no longer available.");
        continue;
      }

      /**
       * Declared OUTSIDE the try so the catch can give the reservation back.
       * A throw before the provider call (a missing key builds no client) has
       * reserved money that was never spent, and the failure path is exactly
       * where that must be noticed.
       */
      let reservation: Awaited<ReturnType<typeof reserveSpend>> | null = null;
      let recordedAnInvocation = false;

      try {
        // Bounded to strictly earlier steps: a replay must read its
        // predecessor's output, never the output it wrote itself last time.
        //
        // Inside the try on purpose. An unreadable payload now throws rather
        // than degrading to empty, and it has to land in the ordinary failure
        // path so the step backs off and retries with the data intact —
        // outside the try it escaped to the run-level handler, which left the
        // step running under a dead lease with no recorded error.
        const input =
          (await loadLatestPayload(run.id, step.order)) ??
          emptyPayload(
            classification?.quantityInterpreted ?? 0,
            classification?.requiredFields ?? []
          );

        /**
         * THE BUDGET IS TAKEN BEFORE THE CALL, NOT CHECKED AFTER IT.
         *
         * Pure primitives declare no capability and reserve nothing: they have
         * no provider and cannot spend, so putting them through a reservation
         * would be ceremony. Everything that CAN bill reserves its worst case
         * first, and a refusal pauses the run for an operator rather than
         * failing the step, because "we ran out of money" is a decision, not
         * an error to retry.
         */
        reservation = primitive.billable
          ? await reserveSpend({
              runId: run.id,
              stepRunId: step.id,
              attempt: step.attempts,
              operationKey: `${primitive.id}:${run.snapshotId}:${step.order}`,
              worstCaseMicros: primitive.maxCostMicrosPerAttempt,
            })
          : null;

        if (reservation && !reservation.ok) {
          /**
           * A BUDGET REFUSAL IS NOT AN ATTEMPT.
           *
           * claimNextStep already incremented `attempts` and took the lease
           * before we got here. Leaving both in place would charge the step a
           * retry credit for a call that never happened, and would strand it
           * `running` under a lease nobody holds, so an operator who raises
           * the budget finds a step that can no longer be claimed.
           *
           * The step goes back to `pending` with its attempt refunded. It is
           * exactly where it was before this invocation touched it.
           */
          await prisma.taskWorkflowStepRun.updateMany({
            where: { id: step.id, lockedBy: step.lockedBy },
            data: {
              status: "pending",
              attempts: { decrement: 1 },
              leaseExpiresAt: null,
              lockedAt: null,
              lockedBy: null,
            },
          });
          await pauseRunForBudget(run.id, run.task.id, reservation);
          break;
        }

        /**
         * A RESERVED HOLD THAT NEVER BECAME A CALL MUST BE GIVEN BACK.
         *
         * A primitive can return without ever calling `recordInvocation`:
         * extract.structured_rows exits early and successfully when there is
         * no evidence to structure, and a throw before the provider call
         * (a missing API key builds no client) does the same. The reservation
         * would then sit `held` for the life of the run, counting against
         * every later step, and the run would pause reporting a budget it
         * never spent. `releaseHold` had no production caller at all.
         *
         * Tracked by a flag rather than by re-querying: the invocation row is
         * written inside a transaction that may still roll back on P2002, and
         * "did the primitive dispatch anything" is a question about THIS
         * invocation, not about the table.
         */
        const result = await withTimeout(
          primitive.run({
            taskId: run.task.id,
            runId: run.id,
            stepRunId: step.id,
            snapshotId: run.snapshotId,
            order: step.order,
            attempt: step.attempts,
            brief: {
              title: run.task.title,
              description: run.task.description,
              quantity: run.task.quantity,
              objective: classification?.objective ?? run.task.title,
              geography: classification?.geography ?? [],
              requiredFields: classification?.requiredFields ?? [],
              quantityInterpreted: classification?.quantityInterpreted ?? null,
            },
            input,
            /**
             * 1D-alpha0: the real remaining allowance, not the literal `0`
             * that meant "unbounded" and was read by nothing. Zero here now
             * means a pure step that may not spend at all, which is exactly
             * what the three pure primitives are.
             */
            costCeilingMicros: reservation?.grantedMicros ?? 0,
            recordInvocation: async (record) => {
              recordedAnInvocation = true;
              /**
               * Phase 1C - ONE transaction, and the counters move ONLY when
               * the invocation row is newly created. The previous shape
               * (upsert, then two unconditional increments as separate
               * statements) had two real failure modes: a crash after the
               * upsert left a billed invocation the run counters never
               * learned about, and a replayed (stepRunId, operationKey,
               * attempt) deduplicated the row while incrementing the
               * counters a second time.
               */
              try {
                await prisma.$transaction(async (tx) => {
                  await tx.taskToolInvocation.create({
                    data: {
                      stepRunId: step.id,
                      primitiveId: primitive.id,
                      operationKey: record.operationKey,
                      attempt: step.attempts,
                      providerIdempotencyKey: record.providerIdempotencyKey,
                      provider: record.provider,
                      model: record.model,
                      inputTokens: record.inputTokens,
                      outputTokens: record.outputTokens,
                      cacheReadTokens: record.cacheReadTokens,
                      cacheWriteTokens: record.cacheWriteTokens,
                      searchCount: record.searchCount,
                      costMicros: record.costMicros,
                      durationMs: record.durationMs,
                      ok: record.ok,
                      error: record.error,
                      // 1D-alpha0: what we know about the failure, and what
                      // we know about the spend. Neither is derivable from
                      // `ok`, which is why both are stored.
                      errorClass: record.errorClass,
                      httpStatus: record.httpStatus,
                      dispatchState: record.dispatchState,
                      startedAt: record.startedAt,
                      finishedAt: record.finishedAt,
                    },
                  });
                  /**
                   * The reservation is resolved in the SAME transaction as the
                   * invocation row. A crash between the two would otherwise
                   * leave either a billed call whose hold still blocks the
                   * budget forever, or a released hold with no record of the
                   * money.
                   *
                   * Only a `settled` dispatch releases the difference. The two
                   * uncertain states keep their full worst case reserved,
                   * because we do not know what the provider billed and
                   * guessing downward is how a ceiling stops being one.
                   */
                  if (reservation !== null && reservation.ok) {
                    const holdId = reservation.holdId;
                    if (record.dispatchState === "settled") {
                      await settleHold(tx, holdId, record.costMicros);
                    } else if (record.dispatchState === "cancelled_before_dispatch") {
                      await tx.workflowBudgetHold.updateMany({
                        where: { id: holdId, status: "held" },
                        data: { status: "released", settledMicros: 0 },
                      });
                    }
                  }
                  // Split at the point of record: searches are billed per
                  // query by the provider, tokens by volume, and an operator
                  // reading "we spent X" needs to know which lever moves it.
                  const toolMicros = searchCostMicros(record.searchCount);
                  const aiMicros = Math.max(0, record.costMicros - toolMicros);
                  await tx.taskWorkflowRun.update({
                    where: { id: run.id },
                    data: {
                      actualAiCostMicros: { increment: aiMicros },
                      actualToolCostMicros: { increment: toolMicros },
                    },
                  });
                  await tx.taskWorkflowStepRun.update({
                    where: { id: step.id },
                    data: { actualCostMicros: { increment: record.costMicros } },
                  });
                });
              } catch (error) {
                if (
                  error instanceof Prisma.PrismaClientKnownRequestError &&
                  error.code === "P2002"
                ) {
                  // Same attempt already recorded - the transaction rolled
                  // back whole, so neither the row nor the counters moved.
                  // A replay is a no-op, never a double count.
                  return;
                }
                throw error;
              }
            },
            writeArtifact: async (spec) =>
              writeArtifact({
                taskId: run.task.id,
                runId: run.id,
                stepRunId: step.id,
                snapshotId: run.snapshotId,
                order: step.order,
                spec,
              }),
          }),
          primitive.timeoutMs,
          primitive.id
        );

        // Nothing was dispatched, so nothing was billed. Give the room back
        // rather than let a phantom hold squeeze every later step.
        if (reservation !== null && reservation.ok && !recordedAnInvocation) {
          await releaseHold(reservation.holdId);
        }

        /**
         * Payload first, THEN the status write, and never the reverse: a step
         * marked done whose payload never landed would make its successor
         * read the step BEFORE it, silently feeding the pipeline the wrong
         * input. The `beforeOrder` bound in loadLatestPayload makes the
         * payload-then-crash order safe to retry; the inverse is not.
         */
        await persistPayload({
          taskId: run.task.id,
          runId: run.id,
          stepRunId: step.id,
          snapshotId: run.snapshotId,
          order: step.order,
          payload: result.payload,
        });

        // Fenced: if the lease moved on while the primitive was running, this
        // invocation is a ghost. Stop the walk rather than march it on to the
        // next step alongside whoever holds the step now.
        if (
          !(await finishClaimedStep(step, {
            status: "done",
            finishedAt: new Date(),
            // Phase 1C: the input side, so estimate-vs-actual can see what
            // each step was FED, not only what it produced. This column
            // existed since 1B and was never written - a dead column is a
            // promise that looks like a datum.
            inputSummary: { rowsIn: input.rows.length, unitsTotal: input.unitsTotal },
            outputSummary: result.summary,
            leaseExpiresAt: null,
            lockedAt: null,
            lockedBy: null,
            nextAttemptAt: null,
          }))
        ) {
          break;
        }
        steps++;
      } catch (error) {
        /**
         * 1D-alpha0 — THE FAILURE IS CLASSIFIED, AND THE CLASSIFICATION IS
         * ACTED ON. Storing the class on the invocation row without changing
         * behaviour would have left the original defect intact under a nicer
         * label: one catch treating a permanent 401 exactly like a transient
         * 429, burning three attempts and nine minutes of backoff on a key
         * that will never work.
         *
         * Two things change with the class:
         *  - a PERMANENT failure (auth, quota, bad_request) is not retried at
         *    all. The run pauses now, an operator is told now, and the mandate
         *    reaches a person nine minutes earlier;
         *  - a rate limit honours the provider's own Retry-After instead of
         *    our fixed curve, because the provider knows when it will accept
         *    us again and we do not.
         */
        const classified = classifyProviderError(error);
        // The same release as the success path: a throw BEFORE the provider
        // call (no API key, a bad argument) reserved money it never spent.
        if (reservation !== null && reservation.ok && !recordedAnInvocation) {
          await releaseHold(reservation.holdId);
        }
        /**
         * `classified.message` is the REDACTED, bounded form. Recomputing a
         * raw slice here would put an unbounded provider echo — which can
         * quote our request, and our request carries the client's brief —
         * into `lastError` and into `pausedReason`, both of which are
         * re-displayed in the admin console.
         */
        const message = classified.message;
        // Permanent failures are exhausted on the spot: a further attempt
        // sends the identical request to the identical refusal.
        const exhausted =
          step.attempts >= primitive.maxAttempts ||
          classified.pauseRunImmediately ||
          !classified.retryable;

        const backoff =
          classified.retryAfterSeconds !== null
            ? classified.retryAfterSeconds * 1000
            : backoffMs(step.attempts);

        const stillOurs = await finishClaimedStep(step, {
          status: "failed",
          lastError: `[${classified.errorClass}] ${message}`,
          leaseExpiresAt: null,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: exhausted ? null : new Date(Date.now() + backoff),
        });
        // Someone else owns the step now, and their attempt may well succeed.
        // Recording our failure over their claim would be a lie.
        if (!stillOurs) break;

        if (exhausted) {
          await pauseRunForExhaustedStep({
            runId: run.id,
            order: step.order,
            primitiveId: primitive.id,
            attempts: step.attempts,
            message: classified.retryable
              ? message
              : `${message} (${classified.errorClass}: not retryable, stopped without burning further attempts)`,
          });
          return { steps, finished: false };
        }
        // A retryable failure: hand back and let the next tick pick it up
        // after the backoff, rather than spinning here.
        return { steps, finished: false };
      }
    }

    const remaining = await prisma.taskWorkflowStepRun.count({
      where: { runId: run.id, executionMode: "automated", status: { not: "done" } },
    });
    if (remaining > 0) return { steps, finished: false };

    await finishRun(run.id);
    return { steps, finished: true };
  } catch (error) {
    // Never rethrow: a workflow failure must not become a webhook failure.
    console.error("[workflow] advance failed", { taskId, error });
    return { steps, finished: false };
  }
}

// ── Handover to a person ──────────────────────────────────────────────────


/**
 * Closes the machine block: computes the residual, writes the human package,
 * fixes the payout, and moves the task into the pool. All of it in one
 * transaction, because a task that reached `open` without a package or with a
 * stale payout would be a mandate nobody can price.
 */
export async function finishRun(runId: string): Promise<void> {
  const run = await prisma.taskWorkflowRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      taskId: true,
      planVersionId: true,
      status: true,
      automatedStepCount: true,
      task: {
        select: {
          id: true,
          title: true,
          tier: true,
          isInternal: true,
          status: true,
          vaPayoutCents: true,
          estimatedMinutes: true,
          aiClassification: { select: { quantityInterpreted: true } },
        },
      },
    },
  });
  if (!run || run.task.status !== "ai_processing") return;

  const settings = await getSettings();
  const payload = await loadLatestPayload(runId);
  const unitsTotal =
    payload?.unitsTotal ?? run.task.aiClassification?.quantityInterpreted ?? 0;

  const unitsRemaining = payload
    ? payload.rows.filter((r) => r.status !== "verified").length +
      Math.max(0, unitsTotal - payload.rows.length)
    : unitsTotal;

  const planSteps = await prisma.taskExecutionPlanStep.findMany({
    where: { planVersionId: run.planVersionId },
    select: {
      executor: true,
      fixedMinutes: true,
      secondsPerUnit: true,
      estimatedMinutesOptimistic: true,
      estimatedMinutesLikely: true,
      estimatedMinutesConservative: true,
    },
  });

  const residualSteps: ResidualStepInput[] = planSteps.map((s) => ({
    executor: s.executor,
    fixedMinutes: s.fixedMinutes,
    secondsPerUnit: s.secondsPerUnit,
    estimatedMinutesOptimistic: s.estimatedMinutesOptimistic,
    estimatedMinutesLikely: s.estimatedMinutesLikely,
    estimatedMinutesConservative: s.estimatedMinutesConservative,
  }));

  const reservedBudgetCents = run.task.vaPayoutCents ?? 0;
  const residual = computeResidual({
    steps: residualSteps,
    unitsRemaining,
    unitsTotal,
    rates: {
      workerHourlyUsd: Math.max(COST_CATALOG.workerHourlyUsdBase, settings.minWorkerHourlyUsd),
    },
    reservedBudgetCents,
    automatedStepCount: run.automatedStepCount,
    quotedMinutes: run.task.estimatedMinutes ?? 0,
  });

  if (residual.overBudget) {
    /**
     * Never resolved by quietly paying less. The residual is what the work is
     * worth; exceeding the reserve means the mandate was mis-estimated, and
     * that is an operator's call.
     */
    await prisma.taskWorkflowRun.update({
      where: { id: runId },
      data: {
        status: "paused",
        unitsTotal,
        unitsResolvedAutomatically: Math.max(0, unitsTotal - unitsRemaining),
        // Phase 1C: drafted vs verified as COLUMNS even on the paused
        // branch - an over-budget pause was precisely where the residual
        // numbers used to evaporate into prose.
        unitsPrefilled: payload?.rows.length ?? 0,
        unitsVerifiedByMachine: payload?.rows.filter((r) => r.status === "verified").length ?? 0,
        pausedReason: `Residual work is worth $${(residual.payoutCents / 100).toFixed(2)} but the quote reserved $${(reservedBudgetCents / 100).toFixed(2)}.`,
      },
    });
    await prisma.taskEvent.create({
      data: {
        taskId: run.taskId,
        action: "workflow_run_paused",
        meta: { reason: "over_budget", unitsRemaining, unitsTotal },
      },
    });
    await notifyAdmins({
      type: "workflow_over_budget",
      title: "Residual work exceeds the reserved payout",
      body: `Task ${run.taskId}: ${unitsRemaining} of ${unitsTotal} units remain, worth $${(residual.payoutCents / 100).toFixed(2)} against a reserve of $${(reservedBudgetCents / 100).toFixed(2)}. The run is paused.`,
      taskId: run.taskId,
    });
    return;
  }

  const hasCandidate =
    (await prisma.file.count({
      where: { workflowRunId: runId, artifactVisibility: "deliverable_candidate", purgedAt: null },
    })) > 0;

  const copy = buildHumanPackageCopy({
    unitsRemaining,
    unitsTotal,
    hasCandidate,
    draftedRows: payload?.rows.length ?? 0,
    verifiedRows: payload?.rows.filter((r) => r.status === "verified").length ?? 0,
  });

  /**
   * Resolved BEFORE the transaction. Reading Settings and every approved
   * worker's profile from inside it pushed this past Prisma's 5-second
   * interactive limit on a local database, and the whole handover rolled back
   * with the machine work already done and paid for. A transaction holds
   * writes; the audience lookup is a read.
   */
  const poolAudience = await resolvePoolAudience(run.taskId, run.task);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.taskHumanWorkPackage.create({
        data: {
          runId,
          taskId: run.taskId,
          planVersionId: run.planVersionId,
          objective: copy.objective,
          whatIsAlreadyDone: copy.whatIsAlreadyDone,
          instructions: copy.instructions,
          checklist: copy.checklist,
          unitsRemaining,
          unitsTotal,
          estimatedMinutes: residual.minutes,
          computedPayoutCents: residual.payoutCents,
          reservedBudgetCents,
        },
      });

      await tx.taskWorkflowRun.update({
        where: { id: runId },
        data: {
          status: "awaiting_human",
          finishedAt: new Date(),
          unitsTotal,
          unitsResolvedAutomatically: Math.max(0, unitsTotal - unitsRemaining),
          // Phase 1C: the drafted/verified distinction, queryable at last -
          // the "0 of 12 already filled in" incident lived in prose only.
          unitsPrefilled: payload?.rows.length ?? 0,
          unitsVerifiedByMachine: payload?.rows.filter((r) => r.status === "verified").length ?? 0,
        },
      });

      /**
       * The payout is written HERE and only here: once, before the pool can
       * show it, and frozen by a database trigger the moment a worker claims.
       * Nobody sees a number that then moves.
       */
      await transitionTask({
        tx,
        taskId: run.taskId,
        from: "ai_processing",
        to: "open",
        action: "automated_processing_complete",
        data: {
          vaPayoutCents: residual.payoutCents,
          estimatedMinutes: residual.minutes,
        },
        meta: { unitsRemaining, unitsTotal, automatedUnits: unitsTotal - unitsRemaining },
      });

      // Without this the task reaches the pool and nobody is told.
      await writePoolNotifications(tx, run.taskId, run.task.title, poolAudience);
    });
  } catch (error) {
    if (error instanceof TransitionError) return;
    throw error;
  }
}

// ── The scheduled drain ───────────────────────────────────────────────────

/**
 * The safety net. `after()` starts a run the moment payment clears; this is
 * what picks it up when that process died, when a step backed off, or when a
 * lease expired.
 */
export async function processWorkflowRuns(): Promise<{ runs: number; steps: number }> {
  const runs = await prisma.taskWorkflowRun.findMany({
    where: { status: "running" },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { taskId: true },
  });

  let steps = 0;
  for (const run of runs) {
    const result = await advanceWorkflow(run.taskId);
    steps += result.steps;
  }
  return { runs: runs.length, steps };
}
