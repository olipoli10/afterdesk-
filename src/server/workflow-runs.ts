import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { classifyProviderError } from "@/lib/ai-work-engine/provider-error";
import {
  BUDGET_POLICY_VERSION,
  releaseHold,
  reserveSpend,
  settleHold,
} from "@/server/workflow-budget";
import {
  ACCOUNT_SPEND_BLOCKED_EVENT_ACTION,
  ACCOUNT_SPEND_CEILING_REASON_KEY,
  ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY,
  releaseAccountSpendHold,
  reserveAccountProviderSpend,
  settleAccountSpendHold,
} from "@/server/account-spend";
import { getSettings } from "@/lib/settings";
import { transitionTask, TransitionError } from "@/lib/state";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { compileDecisions, type CompileStepInput } from "@/lib/ai-work-engine/compile";
import { admitHumanCut } from "@/lib/ai-work-engine/human-unit-admission";
import {
  freezeHumanUnitDefinition,
  type FrozenEligibility,
  type FrozenHumanUnitDefinition,
} from "@/lib/ai-work-engine/human-unit-definition";
import {
  ACTIVE_CLAIM_STATUSES,
  activeClaimCapRefusal,
  categoryCertificationRefusal,
  highValueRefusal,
  priorRejectionRefusal,
  vaStatusRefusal,
} from "@/lib/worker-eligibility";
import { resolvePrimitive } from "@/lib/ai-work-engine/registry";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { primitiveReachOf } from "@/lib/ai-work-engine/primitive-vocabulary";
import { DATA_CLASSES, type DataClass } from "@/lib/ai-work-engine/data-class";
import { attemptsAllowedForStep } from "@/lib/ai-work-engine/automation-cost-policy";
import { computeResidual, type ResidualStepInput } from "@/lib/ai-work-engine/residual";
import { fetchCostMicros, searchCostMicros } from "@/lib/ai-work-engine/tool-cost";
import { buildHumanPackageCopy } from "@/lib/ai-work-engine/human-package-copy";
import {
  emptyPayload,
  type WorkflowPayload,
} from "@/lib/ai-work-engine/primitives/types";
import { loadLatestPayload, persistPayload, writeArtifact } from "@/server/workflow-artifacts";
import { readObject } from "@/lib/storage";
import { resolvePoolAudience, writePoolNotifications } from "@/server/pool-notifications";
import { publishHumanWorkUnit } from "@/server/human-unit";

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

/**
 * The stored class is a plain column, so it is validated on the way out.
 * An unrecognised string is treated as ABSENT rather than as a class, which
 * makes the compiler fall back to its pre-1E behaviour instead of trusting a
 * value nothing in this codebase wrote.
 */
function isDataClass(value: string | null | undefined): value is DataClass {
  return typeof value === "string" && (DATA_CLASSES as readonly string[]).includes(value);
}

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
  reason: string,
  /**
   * LOT B: the admin who pressed the release button, when one did. The two
   * historical callers (no-plan exit, stall sweep) are system actions and
   * pass nothing; the new admin action passes its actor so the TaskEvent
   * says WHO decided not to wait for the sweep.
   */
  actorId?: string
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
    select: {
      status: true,
      title: true,
      tier: true,
      isInternal: true,
      standingCapacityAccountId: true,
      vaPayoutCents: true,
      estimatedMinutes: true,
    },
  });
  if (!task || task.status !== "ai_processing") return;

  // The degraded exit publishes to the pool too, so it carries the same
  // refusal. A task released "as quoted" with no quoted amount is the exact
  // shape of the defect.
  if (
    await handoverBlockedForUnknownPayout({
      id: taskId,
      vaPayoutCents: task.vaPayoutCents,
      estimatedMinutes: task.estimatedMinutes,
      isInternal: task.isInternal,
      standingCapacityAccountId: task.standingCapacityAccountId,
    })
  ) {
    return;
  }

  const audience = await resolvePoolAudience(taskId, task);

  try {
    await prisma.$transaction(async (tx) => {
      await transitionTask({
        tx,
        taskId,
        from: "ai_processing",
        to: "open",
        action: "automated_processing_skipped",
        actorId,
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
      acceptanceSnapshot: {
        select: {
          id: true,
          planVersionId: true,
          // The frozen ceiling. Read, never recomputed.
          automationSpendCeilingMicros: true,
          automationCostPolicyVersion: true,
          // The frozen data class, for exactly the same reason.
          dataClass: true,
        },
      },
      aiClassification: { select: { sensitiveData: true, requiredAccess: true } },
      workflowRun: { select: { id: true, automatedStepCount: true } },
      /**
       * T032 — the accepted economics admission reads, and the facts the
       * eligibility snapshot freezes. Read from the contract, never
       * recomputed: the verdict must be reproducible by replay.
       */
      vaPayoutCents: true,
      estimatedMinutes: true,
      tier: true,
      category: { select: { slug: true } },
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
  // Hoisted: property narrowing does not survive into the transaction closure.
  const planVersionId = snapshot.planVersionId;

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
      /**
       * The step's economics, FROZEN AT QUOTE TIME. The runner reserves
       * against `maxCostMicrosPerAttemptAtQuote` and never opens the policy
       * table, so a later policy change cannot move what this contract may
       * spend. Null on a plan accepted before this correction: such a step
       * compiles to human work, fail-closed.
       */
      estimatedAiCostCents: true,
      maxCostMicrosPerAttemptAtQuote: true,
      demotedForBudget: true,
      params: true,
      /**
       * T031 — THE COLUMNS ADMISSION AND THE DEFINITION FREEZE READ.
       *
       * All frozen at quote time on the accepted plan step, and all read from
       * HERE rather than recomputed: the admission verdict has to be
       * reproducible by replay, which it is not if any input can be derived
       * differently later.
       *
       * `fixedMinutes` is the one that decides economic admission, and null
       * means UNKNOWN rather than zero — the distinction that once paid twenty
       * minutes on a mandate quoted at two hundred and forty.
       */
      fixedMinutes: true,
      secondsPerUnit: true,
      estimatedMinutesOptimistic: true,
      estimatedMinutesLikely: true,
      estimatedMinutesConservative: true,
      description: true,
      verificationMethod: true,
      acceptanceCriteria: true,
      humanOutputSchema: true,
      humanRequiredArtifactKinds: true,
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
    params: s.params,
  }));

  /**
   * THE DATA CLASS COMES FROM THE CONTRACT, like the ceiling below it and for
   * the same reason: it was computed locally from the client's own files
   * BEFORE the quote, and it is what decides whether a capability that leaves
   * this machine may run at all. Recomputing it here, after payment, would
   * mean a re-uploaded file could change what the accepted mandate authorises.
   *
   * Null on every contract accepted before 1E-alpha, and the compiler reads
   * that as `public_business` — correct for those mandates, none of which
   * could read a file.
   */
  const gate = {
    sensitiveData: task.aiClassification?.sensitiveData ?? false,
    requiredAccessCount: task.aiClassification?.requiredAccess.length ?? 0,
    dataClass: isDataClass(snapshot.dataClass) ? snapshot.dataClass : undefined,
  };

  /**
   * T1 — HUMAN WORK UNIT ADMISSION (T032).
   *
   * THE FLAG IS READ HERE AND NOWHERE ELSE (C10). It decides whether a NEW
   * workflow may be admitted; it is never consulted again for a workflow that
   * already has a unit. Turning it off must not strand a person who is already
   * holding work on a mandate a client has paid for.
   *
   * Everything below refuses rather than degrades. A plan that does not admit
   * compiles exactly as it does today — which is the behaviour that shipped
   * long before this feature and remains correct.
   */
  const settings = await getSettings();
  let admittedCut: { order: number } | undefined;
  let frozenDefinition: FrozenHumanUnitDefinition | null = null;

  if (settings.humanWorkUnitResumeEnabled) {
    const verdict = admitHumanCut(
      planSteps.map((s) => ({
        order: s.order,
        executor: s.executor as "ai" | "human" | "deterministic_code",
        dependsOnOrder: s.dependsOnOrder,
        fixedMinutes: s.fixedMinutes,
        secondsPerUnit: s.secondsPerUnit,
        estimatedMinutesOptimistic: s.estimatedMinutesOptimistic,
        estimatedMinutesLikely: s.estimatedMinutesLikely,
        estimatedMinutesConservative: s.estimatedMinutesConservative,
      })),
      { vaPayoutCents: task.vaPayoutCents, estimatedMinutes: task.estimatedMinutes }
    );

    if (verdict.admitted) {
      const cut = planSteps.find((s) => s.order === verdict.cutOrder);
      /**
       * The freeze returns null when the accepted step carries no compilable
       * output contract — a plan accepted before those columns existed. Not
       * admitted, fail-closed: inventing a default would put an obligation on
       * a worker that no client ever accepted. The not-admitted RECORDING is
       * T050; this only declines to admit.
       */
      if (cut) {
        frozenDefinition = freezeHumanUnitDefinition({
          planVersionId,
          cut: {
            id: cut.id,
            order: cut.order,
            title: cut.title,
            description: cut.description,
            verificationMethod: cut.verificationMethod,
            acceptanceCriteria: cut.acceptanceCriteria,
            humanOutputSchema: cut.humanOutputSchema,
            humanRequiredArtifactKinds: cut.humanRequiredArtifactKinds,
            fixedMinutes: cut.fixedMinutes,
            secondsPerUnit: cut.secondsPerUnit,
            estimatedMinutesOptimistic: cut.estimatedMinutesOptimistic,
            estimatedMinutesLikely: cut.estimatedMinutesLikely,
            estimatedMinutesConservative: cut.estimatedMinutesConservative,
          },
          // Non-null by construction: admission already refused a null or
          // non-positive payout as `unmapped_economics`.
          acceptedTaskPayoutCents: task.vaPayoutCents!,
          acceptedEstimatedMinutes: task.estimatedMinutes!,
          dataClass: gate.dataClass ?? "public_business",
          /**
           * WHAT THE WORKER MAY SEE, and the whole of it (FR-014): the outputs
           * of the steps this cut directly depends on. Derived from the
           * accepted graph, never operator-authored.
           */
          declaredInputs: cut.dependsOnOrder.flatMap((order) => {
            const producer = planSteps.find((s) => s.order === order);
            if (!producer) return [];
            return [
              {
                kind: "artifact" as const,
                ref: `step:${producer.order}`,
                label: producer.title,
                dataClass: gate.dataClass ?? "public_business",
              },
            ];
          }),
          settings: {
            revisionBound: settings.humanWorkUnitRevisionBound,
            publicationDeadlineHours: settings.humanWorkUnitPublicationDeadlineHours,
            submissionDeadlineHours: settings.humanWorkUnitSubmissionDeadlineHours,
            claimLeaseHours: settings.humanWorkUnitClaimLeaseHours,
          },
          /**
           * CRITERIA are frozen; the worker's own facts stay live (FR-009). A
           * later change to the platform configuration therefore affects only
           * units admitted afterwards, while a change to the individual
           * worker's status or score affects access immediately.
           */
          eligibility: {
            categorySlug: task.category?.slug ?? null,
            tier: task.tier,
            requireCategoryCertification: settings.requireCategoryCertification,
            highValueThreshold: settings.highValueThreshold,
            minRatedDeliveries: settings.minRatedDeliveries,
            maxActiveClaims: settings.maxActiveClaims,
          },
        });
        if (frozenDefinition) admittedCut = { order: verdict.cutOrder };
      }
    }
  }

  const compiled = compileDecisions(input, { ...gate, humanCut: admittedCut });

  /**
   * THE CEILING IS COPIED FROM THE CONTRACT, NOT COMPUTED HERE.
   *
   * The previous version derived it at this exact point from the CURRENT
   * registry caps. Compilation runs after payment, so a deploy that raised a
   * cap raised the budget of mandates already sold. The number now comes from
   * the acceptance snapshot, which froze it before the client signed.
   *
   * Null for a contract accepted before this correction: no ceiling means no
   * billable step may start, and reserveSpend refuses against it. That is
   * fail-closed by design, not an oversight.
   */

  /**
   * ONE TRANSACTION. The run, its steps, the frozen definition and the unit
   * state commit together or not at all: a run that exists without its unit
   * would be a mandate the machine believes it may finish alone, and a unit
   * without its run would be a person waiting on nothing.
   */
  const admitted = admittedCut !== undefined && frozenDefinition !== null;
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.taskWorkflowRun.create({
      data: {
        snapshotId: snapshot.id,
        taskId,
        planVersionId,
        status: compiled.fullyHuman ? "awaiting_human" : "running",
        automatedStepCount: compiled.automatedStepCount,
        humanStepCount: compiled.humanStepCount,
        runAutomationBudgetMicros: snapshot.automationSpendCeilingMicros,
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
            /**
             * A blocked step is machine work that is WAITING. It is not
             * pending — nothing may claim it — and it is not handed to a
             * person, because no person is going to do it. The resume makes it
             * pending again exactly once.
             */
            status: s.blockedOnHumanUnit
              ? "blocked_on_human_unit"
              : s.executionMode === "automated"
                ? "pending"
                : "handed_to_human",
            handoffReason: s.handoffReason,
          })),
        },
      },
      select: { id: true },
    });

    if (admitted && frozenDefinition && admittedCut) {
      const cutStep = planSteps.find((s) => s.order === admittedCut.order)!;
      const definition = await tx.humanWorkUnitDefinition.create({
        data: {
          planVersionId,
          planStepId: cutStep.id,
          instructions: frozenDefinition.instructions,
          declaredInputs: frozenDefinition.declaredInputs as Prisma.InputJsonValue,
          outputSchema: frozenDefinition.outputSchema as Prisma.InputJsonValue,
          requiredArtifactKinds: frozenDefinition.requiredArtifactKinds,
          acceptanceCriteria: frozenDefinition.acceptanceCriteria,
          verificationMethod: frozenDefinition.verificationMethod,
          eligibility: frozenDefinition.eligibility as unknown as Prisma.InputJsonValue,
          reviewerAuthority: frozenDefinition.reviewerAuthority,
          expectedMinutes: frozenDefinition.expectedMinutes,
          revisionBound: frozenDefinition.revisionBound,
          publicationDeadlineHours: frozenDefinition.publicationDeadlineHours,
          submissionDeadlineHours: frozenDefinition.submissionDeadlineHours,
          claimLeaseHours: frozenDefinition.claimLeaseHours,
          economicProvenance:
            frozenDefinition.economicProvenance as unknown as Prisma.InputJsonValue,
          dataClass: frozenDefinition.dataClass,
        },
        select: { id: true, revisionBound: true },
      });

      /**
       * `transitionSeq` is incremented in the SAME write that allocates the
       * audit row's `seq` (C7/INV-T1). `MAX(seq)+1` is forbidden: two
       * concurrent writers both read the same maximum and both claim it.
       */
      const unit = await tx.humanWorkUnitRunState.create({
        data: {
          runId: created.id,
          taskId,
          snapshotId: snapshot.id,
          definitionId: definition.id,
          cutOrder: admittedCut.order,
          state: "admitted",
          remainingRevisions: definition.revisionBound,
          transitionSeq: 1,
        },
        select: { id: true, claimGeneration: true, resumeGeneration: true },
      });

      await tx.humanWorkUnitTransition.create({
        data: {
          unitStateId: unit.id,
          seq: 1,
          actorRole: "system",
          fromState: null,
          toState: "admitted",
          cause: "admitted",
          claimGeneration: unit.claimGeneration,
          resumeGeneration: unit.resumeGeneration,
        },
      });
    }

    return created;
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
   * The step's configuration exactly as the client accepted it, unparsed.
   * Carried from TaskExecutionPlanStep for the same reason as the economics
   * below: the contract is the source, not the current code's idea of a
   * sensible default.
   */
  frozenParams: unknown;
  /**
   * THE PER-ATTEMPT CEILING, FROZEN WHEN THE CLIENT ACCEPTED.
   *
   * Carried from TaskExecutionPlanStep, never read from the current policy
   * table. Null on a contract accepted before this correction, and on a step
   * the economic preflight demoted: either way the step cannot bill and the
   * runner hands it to a person.
   */
  maxCostMicrosPerAttemptAtQuote: bigint | null;
  /**
   * HOW MANY ATTEMPTS THIS CONTRACT FUNDED FOR THIS STEP.
   *
   * Same provenance and same rule as the ceiling above. Null on a contract
   * accepted before the funded-retry correction, which is read as ONE: no
   * policy before it ever named a retry budget, so none of them funded a
   * second try.
   */
  maxAttemptsAtQuote: number | null;
  /**
   * THE FENCING TOKEN. Every write that ends this step carries it in the
   * WHERE clause, so an invocation whose lease has already expired and been
   * taken by someone else cannot finish on top of the new holder. See the
   * comment on `finishClaimedStep`.
   */
  lockedBy: string;
};

/**
 * THE ACCEPTED HUMAN RESULT IS THE RESUME INPUT, NOT A SIDE EFFECT.
 *
 * Review validates the frozen output schema before an acceptance can exist,
 * but the workflow runner has a narrower, non-negotiable interface: machine
 * primitives consume a WorkflowPayload. Refuse a corrupt or incompatible
 * accepted row here instead of quietly falling back to the pre-cut artifact —
 * that fallback would make the durable acceptance irrelevant while still
 * marking the downstream work successful.
 */
function acceptedHumanWorkflowPayload(value: unknown): WorkflowPayload {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray((value as WorkflowPayload).rows) ||
    typeof (value as WorkflowPayload).unitsTotal !== "number" ||
    !Array.isArray((value as WorkflowPayload).requestedFields) ||
    !(value as WorkflowPayload).requestedFields.every((field) => typeof field === "string")
  ) {
    throw new Error("The accepted human result is not a workflow payload.");
  }
  return value as WorkflowPayload;
}

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
  /**
   * Once a human result has resumed this run, a permanent machine failure is
   * no longer an ordinary automation pause. The task already has its one
   * claimant and its accepted fixed payout, so the only safe handover is T14:
   * publish the remaining scope to that same claimant without reopening the
   * pool or recomputing money.
   */
  const admittedUnit = await prisma.humanWorkUnitRunState.findUnique({
    where: { runId: input.runId },
    select: { state: true },
  });
  if (admittedUnit?.state === "resumed" || admittedUnit?.state === "exhausted") {
    await publishAdmittedResidualScope(input.runId);
    return;
  }

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
  refusal: {
    reason: string;
    ceilingMicros: bigint | null;
    committedMicros: bigint;
    requestedMicros: bigint;
  }
): Promise<void> {
  const ceiling = refusal.ceilingMicros;
  const reason =
    refusal.reason === "no_budget_defined"
      ? "No automation budget was frozen for this run, so no billable step may start."
      : `Automation budget reached: ${refusal.committedMicros} of ${ceiling ?? 0n} microdollars committed, next step needs ${refusal.requestedMicros}.`;

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
        // Serialised: Prisma Json cannot hold a BigInt.
        ceilingMicros: ceiling === null ? null : ceiling.toString(),
        committedMicros: refusal.committedMicros.toString(),
        requestedMicros: refusal.requestedMicros.toString(),
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
    select: {
      id: true,
      order: true,
      primitiveId: true,
      primitiveVersion: true,
      attempts: true,
      status: true,
      leaseExpiresAt: true,
      nextAttemptAt: true,
      lastError: true,
      // The frozen economics travel with the step, from the accepted plan.
      planStep: {
        // 1E-alpha: `params` travels the same way and for the same reason. The
        // client approved a deduplication on `email`; the runner reads that
        // from the frozen contract rather than from anything current.
        select: {
          maxCostMicrosPerAttemptAtQuote: true,
          maxAttemptsAtQuote: true,
          params: true,
        },
      },
    },
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
    const attemptsAllowed = attemptsAllowedForStep(
      primitive,
      candidate.planStep.maxAttemptsAtQuote
    );
    if (candidate.attempts >= attemptsAllowed) {
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
        attempts: { lt: attemptsAllowed },
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
      maxCostMicrosPerAttemptAtQuote: candidate.planStep.maxCostMicrosPerAttemptAtQuote,
      maxAttemptsAtQuote: candidate.planStep.maxAttemptsAtQuote,
      frozenParams: candidate.planStep.params,
      lockedBy,
    };
  }
  return null;
}

/**
 * R5.1 — the runner's outer deadline, made DISTINGUISHABLE from every other
 * throw. It is the one failure where "nothing was dispatched" cannot be
 * assumed: the timer races the primitive as a whole, so it can fire while a
 * provider POST is still open and `recordInvocation` has not run yet. The
 * catch below must therefore NOT hand the reservations back on this error —
 * see the release site for the full reasoning.
 */
export class StepTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} exceeded ${ms}ms`);
    this.name = "StepTimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(label, ms)), ms);
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
        /**
         * T034 — the admitted human work unit, if this run has one. Its
         * presence changes what the drain tail means and what the lifecycle
         * guard is allowed to do.
         */
        humanWorkUnit: {
          select: {
            id: true,
            state: true,
            cutOrder: true,
            acceptance: { select: { resultPayload: true } },
            resume: { select: { resumedStepRunIds: true } },
          },
        },
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
      /**
       * T034 — THE ONE EXCEPTION, AND ONLY FOR AN ADMITTED RUN.
       *
       * The rule above is right for every other run: a task that left
       * `ai_processing` was cancelled or finished elsewhere, and a run still
       * executing against it burns money on a mandate nobody wants.
       *
       * An admitted run is the case that rule never anticipated. Publication
       * DELIBERATELY moves the task to `open` so a worker can claim it, and a
       * claim moves it to `claimed`. Abandoning there would discard the machine
       * block sitting behind a person who is at that moment doing the work, and
       * there is no way back from `abandoned`.
       *
       * Everything else keeps failing closed: `cancelled`, `expired`,
       * `completed` and any other status still stop the run, admitted or not.
       * Nobody is owed that work any more.
       */
      const heldByAPerson =
        run.humanWorkUnit !== null &&
        (run.task.status === "open" || run.task.status === "claimed");

      if (!heldByAPerson) {
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

      /**
       * Before acceptance, the run survives but no machine step may move: the
       * blocked block is released exactly once by `applyResume`. AFTER that
       * durable `resumed` state, however, the whole point of the admitted path
       * is to continue the downstream machine block while the SAME claimant
       * keeps the task. Returning unconditionally here left every resumed run
       * marked `running` but permanently unable to execute.
       *
       * `open` is retained only as the pre-claim publication state. A resumed
       * unit must still have the claimed task assignment before any machine
       * continuation is allowed.
       */
      const mayContinueAfterResume =
        run.humanWorkUnit?.state === "resumed" && run.task.status === "claimed";
      if (!mayContinueAfterResume) return { steps: 0, finished: false };
    }

    const classification = run.task.aiClassification;

    /**
     * 1E-alpha: THE ONLY CLIENT FILES THIS RUN MAY READ.
     *
     * Resolved once from the ACCEPTANCE SNAPSHOT, never from the task's
     * current attachments. That distinction is the whole guarantee: a file
     * uploaded, replaced or deleted after the client accepted is simply not in
     * this list, so no primitive can reach it and a replay after a crash sees
     * exactly the set the first attempt saw.
     *
     * `read()` verifies the hash before returning a single byte. A file whose
     * content moved is not an error to log and continue past: it means the
     * bytes under this contract are not the bytes the client approved, and the
     * only safe answer is to stop and let a person look. The throw is caught
     * by the step's own failure path, which retries and then hands the step to
     * a human, so a tampered or restored-from-backup file degrades the mandate
     * rather than corrupting a deliverable.
     */
    const frozenFiles = await prisma.taskAcceptanceSnapshotFile.findMany({
      where: { snapshotId: run.snapshotId },
      select: { fileId: true, sha256: true, fileName: true, sizeBytes: true },
      orderBy: { fileName: "asc" },
    });
    const inputFiles = frozenFiles.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256,
      read: async () => {
        const record = await prisma.file.findUnique({
          where: { id: f.fileId },
          select: { storageKey: true, purgedAt: true },
        });
        if (!record || record.purgedAt !== null) {
          throw new Error(`accepted input file ${f.fileId} is no longer stored`);
        }
        const body = await readObject(record.storageKey);
        const actual = createHash("sha256").update(body).digest("hex");
        if (actual !== f.sha256) {
          throw new Error(
            `accepted input file ${f.fileId} no longer matches the hash frozen at acceptance`
          );
        }
        return body;
      },
    }));

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
       * 1E-alpha: THE FROZEN CONFIGURATION, RE-READ FROM THE CONTRACT.
       *
       * The compiler already validated these params before the run existed, so
       * this parse should never fail — and it is done again anyway, from the
       * frozen plan step rather than from anything recomputed, because the one
       * case where it COULD fail is the one that matters: a deploy that
       * tightened a capability's schema after a client accepted a plan. When
       * that happens the honest answer is a person, not a primitive running on
       * a configuration the current code no longer considers valid.
       */
      const stepParams = parsePrimitiveParams(step.primitiveId, step.frozenParams);
      if (stepParams === null) {
        await handOffStepToHuman(
          step.id,
          run.id,
          "The step's accepted configuration is not valid for this capability."
        );
        continue;
      }

      /**
       * Declared OUTSIDE the try so the catch can give the reservation back.
       * A throw before the provider call (a missing key builds no client) has
       * reserved money that was never spent, and the failure path is exactly
       * where that must be noticed.
       */
      let reservation: Awaited<ReturnType<typeof reserveSpend>> | null = null;
      let accountHold: Awaited<ReturnType<typeof reserveAccountProviderSpend>> | null = null;
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
        /**
         * The first step released by T10 starts a NEW machine block. Its
         * predecessor is the human cut, so its input is the immutable result
         * copied onto HumanWorkUnitAcceptance — never the last machine payload
         * from before the cut. `applyResume` records ids in dependency order;
         * only index zero takes this branch. Every later resumed step reads the
         * persisted output of its machine predecessor through the ordinary
         * artifact path below.
         *
         * This also preserves replay safety: if the first resumed step wrote
         * its payload and crashed before the fenced status write, its retry is
         * still fed the accepted result, not the output it partially wrote.
         */
        const firstResumedStepId = run.humanWorkUnit?.resume?.resumedStepRunIds[0];
        const acceptedResumeInput =
          run.humanWorkUnit?.state === "resumed" && firstResumedStepId === step.id
            ? acceptedHumanWorkflowPayload(run.humanWorkUnit.acceptance?.resultPayload)
            : null;
        const input =
          acceptedResumeInput ??
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
        /**
         * THE FROZEN VALUE, NOT THE CURRENT ONE.
         *
         * `step.maxCostMicrosPerAttemptAtQuote` was written on the plan step
         * before the client accepted. Reading `primitive.maxCostMicrosPerAttempt`
         * here — which the previous version did — is exactly how a deploy
         * changed what an already-signed contract could spend.
         *
         * A billable step with no frozen value is a contract accepted before
         * this correction, or one the preflight demoted. It cannot be priced
         * honestly, so it is not run: the step goes to a person, which is the
         * fallback 1B established for everything the compiler cannot prove.
         */
        if (primitive.billable && step.maxCostMicrosPerAttemptAtQuote === null) {
          await handOffStepToHuman(
            step.id,
            run.id,
            "This step carries no per-attempt cost frozen at quote time, so its spend cannot be bounded against the accepted contract; a person does it."
          );
          continue;
        }

        reservation = primitive.billable
          ? await reserveSpend({
              runId: run.id,
              stepRunId: step.id,
              attempt: step.attempts,
              operationKey: `${primitive.id}:${run.snapshotId}:${step.order}`,
              worstCaseMicros: step.maxCostMicrosPerAttemptAtQuote!,
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
         * R5 — THE ACCOUNT-LEVEL CIRCUIT BREAKER, AFTER THE PER-RUN GATE,
         * BEFORE THE PRIMITIVE EVER RUNS.
         *
         * validate accepted execution -> validate per-run allowance (above)
         * -> reserve account-level allowance (here) -> dispatch (below) ->
         * settle. Never the reverse: a call that already left AfterDesk
         * cannot be un-made by a check that runs afterwards.
         *
         * Reuses the SAME frozen worst-case ceiling as the per-run
         * reservation (`maxCostMicrosPerAttemptAtQuote`) — this is not a new
         * quote-time estimate recomputed at execution, it is the identical
         * already-frozen number, read twice for two different ceilings.
         */
        if (primitive.billable) {
          accountHold = await reserveAccountProviderSpend({
            operationKey: `${primitive.id}:${run.snapshotId}:${step.order}`,
            attempt: step.attempts,
            worstCaseMicros: step.maxCostMicrosPerAttemptAtQuote!,
          });

          if (!accountHold.ok) {
            /**
             * Give back the per-run hold this attempt is not going to use —
             * the same "a refusal is not an attempt" rule as the per-run
             * budget refusal above, applied to a different reservation.
             */
            if (reservation !== null && reservation.ok) {
              await releaseHold(reservation.holdId);
            }
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
            const reasonKey =
              accountHold.reason === "ceiling_not_configured"
                ? ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY
                : ACCOUNT_SPEND_CEILING_REASON_KEY;
            await prisma.taskEvent.create({
              data: {
                taskId: run.task.id,
                action: ACCOUNT_SPEND_BLOCKED_EVENT_ACTION,
                meta: {
                  reasonKey,
                  stepRunId: step.id,
                  order: step.order,
                  primitiveId: primitive.id,
                  provider: accountHold.provider,
                  periodKey: accountHold.periodKey,
                  ceilingMicros: accountHold.ceilingMicros?.toString() ?? null,
                  committedMicros: accountHold.committedMicros.toString(),
                  requestedMicros: accountHold.requestedMicros.toString(),
                },
              },
            });
            /**
             * SAFE TO ALWAYS DEMOTE: a step only reaches execution after the
             * compiler already proved it automatable (data class, reach,
             * mode — compile.ts) and it was never running because it was
             * unsafe for a person, only because it was cheaper than one.
             * Handing it to a human here is the existing, already-proven
             * fallback (identical mechanism as a primitive-version mismatch),
             * and the existing downstream safety net — finishRun's
             * `residual.overBudget` pause — is what stops an unsafe/
             * over-reserved human fallback from silently overspending the
             * ACCEPTED contract. Nothing new is built for that; it already
             * runs on every human residual, including this one.
             */
            await handOffStepToHuman(
              step.id,
              run.id,
              "AfterDesk's own provider spend safety ceiling is at capacity right now; a person completes this step."
            );
            continue;
          }
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
            params: stepParams,
            /**
             * FILE HANDLES ONLY FOR CAPABILITIES THAT STAY ON THIS MACHINE.
             *
             * Only the local file primitives read ctx.inputFiles today, but
             * "nothing else happens to read it" is a fact about the current
             * code, not a guarantee. The documented claim is structural: no
             * combination of a wrong brief, a wrong classification and a
             * wrong plan can put a client file in front of a provider. So a
             * provider-reach primitive receives an empty list, and the claim
             * is true by construction rather than by convention.
             */
            inputFiles:
              primitiveReachOf(step.primitiveId) === "local" ? inputFiles : [],
            /**
             * 1D-alpha0: the real remaining allowance, not the literal `0`
             * that meant "unbounded" and was read by nothing. Zero here now
             * means a pure step that may not spend at all, which is exactly
             * what the three pure primitives are.
             */
            costCeilingMicros: reservation?.grantedMicros ?? 0n,
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
                      fetchCount: record.fetchCount,
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
                      await settleHold(tx, holdId, BigInt(record.costMicros));
                    } else if (record.dispatchState === "cancelled_before_dispatch") {
                      await tx.workflowBudgetHold.updateMany({
                        where: { id: holdId, status: "held" },
                        data: { status: "released", settledMicros: 0n },
                      });
                    }
                  }
                  /**
                   * R5 — the account-level hold, resolved in the SAME
                   * transaction and by the SAME rule: settled on a settled
                   * dispatch, released only when we know nothing was
                   * dispatched, kept `held` on either uncertain outcome.
                   */
                  if (accountHold !== null && accountHold.ok) {
                    const acctHoldId = accountHold.holdId;
                    if (record.dispatchState === "settled") {
                      await settleAccountSpendHold(tx, acctHoldId, BigInt(record.costMicros));
                    } else if (record.dispatchState === "cancelled_before_dispatch") {
                      await tx.accountProviderSpendHold.updateMany({
                        where: { id: acctHoldId, status: "held" },
                        data: { status: "released", settledMicros: 0n },
                      });
                    }
                  }
                  // Split at the point of record: searches are billed per
                  // query by the provider, tokens by volume, and an operator
                  // reading "we spent X" needs to know which lever moves it.
                  // Fetches carry a documented $0 per-request price, so the
                  // term is a recorded assumption that keeps the split honest
                  // the day the price stops being zero.
                  const toolMicros =
                    searchCostMicros(record.searchCount) + fetchCostMicros(record.fetchCount);
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
        if (accountHold !== null && accountHold.ok && !recordedAnInvocation) {
          await releaseAccountSpendHold(accountHold.holdId);
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
        /**
         * The same release as the success path: a throw BEFORE the provider
         * call (no API key, a bad argument) reserved money it never spent.
         *
         * R5.1 — EXCEPT ON THE RUNNER'S OWN DEADLINE. `withTimeout` races the
         * primitive AS A WHOLE, and the primitive does pre-dispatch work
         * first (`await getSettings()`, a DB round trip). The inner call
         * deadline is designed to fire first — 180s inside a 200s outer bound
         * (research.ts:42-46) — but that margin is only 20s, so a slow enough
         * pre-dispatch step inverts the order: the outer timer fires while the
         * POST is still open and `recordInvocation` has not run, leaving
         * `recordedAnInvocation` false for a request the provider will still
         * bill. Releasing there would hand a real charge's room straight back
         * to the day's ceiling — the exact understatement this ledger exists
         * to prevent.
         *
         * So a timeout keeps BOTH holds, which is precisely the rule the
         * settlement path already applies to `dispatched_then_cancelled`:
         * an unknown outcome stays reserved. Over-holding is safe and the
         * daily window releases it at the next UTC rollover; under-counting a
         * billed call is not recoverable at all.
         */
        const mayHaveDispatched = error instanceof StepTimeoutError;
        if (reservation !== null && reservation.ok && !recordedAnInvocation && !mayHaveDispatched) {
          await releaseHold(reservation.holdId);
        }
        if (accountHold !== null && accountHold.ok && !recordedAnInvocation && !mayHaveDispatched) {
          await releaseAccountSpendHold(accountHold.holdId);
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
          step.attempts >= attemptsAllowedForStep(primitive, step.maxAttemptsAtQuote) ||
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

    /**
     * T034 — THE DRAIN TAIL FOR AN ADMITTED RUN.
     *
     * Kept entirely separate from the ordinary tail below, which stays
     * byte-identical for every run without a unit.
     *
     * The ordinary tail counts unfinished AUTOMATED steps, and an admitted
     * run's blocked descendants are exactly that: `automated`, and not `done`.
     * Falling through would mean the run could never finish, and the mandate
     * would sit in the drain forever with nobody told.
     */
    if (run.humanWorkUnit) {
      const unit = run.humanWorkUnit;
      const nextIncomplete = await prisma.taskWorkflowStepRun.findFirst({
        where: { runId: run.id, status: { not: "done" } },
        orderBy: { order: "asc" },
        select: { order: true },
      });

      if (!nextIncomplete) {
        await finishAdmittedRun(run.id);
        return { steps, finished: true };
      }

      /**
       * The pre-cut block has drained exactly when the FIRST unfinished step is
       * the cut itself. Anything earlier still incomplete means a producer has
       * not run, and publishing would hand a worker a unit whose inputs do not
       * exist.
       */
      if (nextIncomplete.order === unit.cutOrder && unit.state === "admitted") {
        const outcome = await publishHumanWorkUnit(run.id);
        if (outcome.published) {
          /**
           * CAS off `running`, and the RESULT IS CHECKED. A blind updateMany
           * here would silently do nothing if a concurrent tick had already
           * moved the run, and the caller would be told the run is waiting on a
           * person when it might be paused or abandoned.
           */
          const moved = await prisma.taskWorkflowRun.updateMany({
            where: { id: run.id, status: "running" },
            data: { status: "awaiting_human_unit" },
          });
          if (moved.count === 0) {
            console.warn("[workflow] run left running before awaiting_human_unit", {
              runId: run.id,
            });
          }
        }
      }
      // Either way the machine has nothing more to do on this tick: the
      // remaining steps are blocked behind a person.
      return { steps, finished: false };
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

/**
 * A PAYOUT THAT IS NOT KNOWN IS NOT A PAYOUT OF ZERO.
 *
 * `vaPayoutCents ?? 0` was a fail-OPEN, and its cascade was silent all the way
 * down: on a fully human mandate `reductionProven` is false, so the residual
 * pins the payout to the reserve; a reserve of 0 gives 0 minutes; and
 * `payoutClearsHourlyFloor` returns true for zero minutes, so the hourly floor
 * never fires and `overBudget` (0 > 0) never fires either. The mandate reaches
 * the pool at $0.00 for 0 minutes with nothing raising a hand.
 *
 * No path produces that null today — approvePricing always writes both, and
 * nothing ever sets them back to null — but the guarantee was a convention,
 * not a construction, and the failure it guards is invisible.
 *
 * THERE IS NO AUTHORITATIVE FALLBACK. The acceptance snapshot carries the
 * client price, not the payout. `TaskExecutionPlanVersion.suggestedVaPayoutCents`
 * is a SUGGESTION the admin may have overridden, so reading it would publish a
 * number the operator did not choose. `Task.vaPayoutCents` is the only
 * depository of the accepted amount. When it is missing, an operator decides;
 * this function refuses to guess, and says so.
 */
async function handoverBlockedForUnknownPayout(task: {
  id: string;
  vaPayoutCents: number | null;
  estimatedMinutes: number | null;
  isInternal: boolean;
  standingCapacityAccountId?: string | null;
}): Promise<boolean> {
  // Internal practice tasks and Standing Capacity mandates are not paid per
  // task: the first is never paid, the second is covered by its weekly block.
  if (task.isInternal || (task.standingCapacityAccountId ?? null) !== null) return false;
  if (
    task.vaPayoutCents !== null &&
    task.vaPayoutCents > 0 &&
    task.estimatedMinutes !== null &&
    task.estimatedMinutes > 0
  ) {
    return false;
  }

  await prisma.taskEvent.create({
    data: {
      taskId: task.id,
      action: "workflow_handover_blocked",
      reason: "unknown_payout",
      meta: {
        vaPayoutCents: task.vaPayoutCents,
        estimatedMinutes: task.estimatedMinutes,
      },
    },
  });
  await notifyAdmins({
    type: "workflow_handover_blocked",
    title: "Handover blocked: the payout is not known",
    body: `Task ${task.id} finished automated processing but has no usable payout or effort estimate, so it was NOT published to the pool. An unknown payout is not a payout of zero, and there is no authoritative amount to fall back on. Re-price the task to release it.`,
    taskId: task.id,
  });
  console.error("[workflow] handover blocked: payout unknown", {
    taskId: task.id,
    vaPayoutCents: task.vaPayoutCents,
    estimatedMinutes: task.estimatedMinutes,
  });
  return true;
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
      humanWorkUnit: { select: { id: true } },
      task: {
        select: {
          id: true,
          title: true,
          tier: true,
          isInternal: true,
          standingCapacityAccountId: true,
          status: true,
          vaPayoutCents: true,
          estimatedMinutes: true,
          aiClassification: { select: { quantityInterpreted: true } },
        },
      },
    },
  });
  // An admitted run carries the fixed payout the worker already saw. Sending
  // it through this ordinary residual path would recompute that promise and
  // create a second human-work package. The caller already branches, but this
  // guard is the fail-closed boundary for every future caller (T037).
  if (!run || run.humanWorkUnit !== null || run.task.status !== "ai_processing") return;

  if (
    await handoverBlockedForUnknownPayout({
      id: run.task.id,
      vaPayoutCents: run.task.vaPayoutCents,
      estimatedMinutes: run.task.estimatedMinutes,
      isInternal: run.task.isInternal,
      standingCapacityAccountId: run.task.standingCapacityAccountId,
    })
  ) {
    return;
  }

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

  /**
   * Non-null by construction: handoverBlockedForUnknownPayout returned false,
   * which for a commercial task means both figures are present and positive.
   * An internal or Standing Capacity task is exempt there and legitimately
   * carries no per-task payout, so it falls back to zero here — for those, a
   * zero reserve is a fact, not a missing measurement.
   */
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

/**
 * END AN ADMITTED RUN — and do NOTHING else.
 *
 * Marks the run `done`, stamps `finishedAt`, writes the audit event. No
 * residual payout computation, no `vaPayoutCents` or `estimatedMinutes` write,
 * no `TaskHumanWorkPackage`, and no task transition: the same claimant delivers
 * through the existing `submitDeliverable -> submitted_for_qc ->
 * approveDeliverable` path at the accepted fixed payout (FR-057).
 *
 * Run state and audit event are one transaction. A crash or an audit failure
 * therefore exposes both or neither; `done` without its reason is forbidden.
 */
export async function finishAdmittedRun(runId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.taskWorkflowRun.findUnique({
      where: { id: runId },
      select: { taskId: true },
    });
    if (!run) return;

    // CAS, and the result is checked: a run already finished by a concurrent
    // tick must not produce a second audit event.
    const finished = await tx.taskWorkflowRun.updateMany({
      where: { id: runId, status: { in: ["running", "awaiting_human_unit"] } },
      data: { status: "done", finishedAt: new Date() },
    });
    if (finished.count === 0) return;

    await tx.taskEvent.create({
      data: {
        taskId: run.taskId,
        action: "human_unit_run_finished",
        meta: { runId },
      },
    });
  });
}

/**
 * A frozen definition was written by our compiler, but it is stored as JSON.
 * Treat an unreadable historical row as ineligible instead of casting it and
 * accidentally turning missing criteria into permission.
 */
function parseFrozenEligibility(value: unknown): FrozenEligibility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (
    !(e.categorySlug === null || typeof e.categorySlug === "string") ||
    typeof e.tier !== "string" ||
    typeof e.requireCategoryCertification !== "boolean" ||
    typeof e.highValueThreshold !== "number" ||
    !Number.isFinite(e.highValueThreshold) ||
    typeof e.minRatedDeliveries !== "number" ||
    !Number.isInteger(e.minRatedDeliveries) ||
    e.minRatedDeliveries < 0 ||
    typeof e.maxActiveClaims !== "number" ||
    !Number.isInteger(e.maxActiveClaims) ||
    e.maxActiveClaims < 1
  ) {
    return null;
  }
  return {
    categorySlug: e.categorySlug as string | null,
    tier: e.tier,
    requireCategoryCertification: e.requireCategoryCertification,
    highValueThreshold: e.highValueThreshold,
    minRatedDeliveries: e.minRatedDeliveries,
    maxActiveClaims: e.maxActiveClaims,
  };
}

/**
 * PUBLISH ONLY THE WORK THAT REMAINS AFTER AN ADMITTED RESUME FAILED.
 *
 * This is deliberately not `finishRun`. The task is already claimed, its
 * payout was accepted before that claim, and the claimant already produced the
 * human result that resumed the machine. T14 changes only the worker's brief:
 * it never changes the task, its assignment, its estimate or its money.
 *
 * All durable writes share one transaction. The run CAS serializes concurrent
 * calls; the package's existing `runId` and `taskId` unique keys are the final
 * replay guard if stale run state is presented. A unique-key loser rolls back
 * its run move and audit with it.
 */
export async function publishAdmittedResidualScope(runId: string): Promise<void> {
  const scope = await prisma.taskWorkflowRun.findUnique({
    where: { id: runId },
    select: {
      taskId: true,
      unitsTotal: true,
    },
  });
  if (!scope) return;

  // Scope is descriptive, not economic. It may shrink after automation, but
  // neither this read nor the package copy enters the payout calculation.
  const payload = await loadLatestPayload(runId);
  const unitsTotal = payload?.unitsTotal ?? scope.unitsTotal ?? 0;
  const unitsRemaining = payload
    ? payload.rows.filter((row) => row.status !== "verified").length +
      Math.max(0, unitsTotal - payload.rows.length)
    : unitsTotal;
  const hasCandidate =
    (await prisma.file.count({
      where: { workflowRunId: runId, artifactVisibility: "deliverable_candidate", purgedAt: null },
    })) > 0;
  const draftedRows = payload?.rows.length ?? 0;
  const verifiedRows = payload?.rows.filter((row) => row.status === "verified").length ?? 0;
  const copy = buildHumanPackageCopy({
    unitsRemaining,
    unitsTotal,
    hasCandidate,
    draftedRows,
    verifiedRows,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const run = await tx.taskWorkflowRun.findUnique({
        where: { id: runId },
        select: {
          id: true,
          taskId: true,
          planVersionId: true,
          status: true,
          humanWorkUnit: {
            select: {
              id: true,
              state: true,
              claimedById: true,
              claimGeneration: true,
              definition: { select: { eligibility: true } },
            },
          },
          task: {
            select: {
              status: true,
              claimedById: true,
              vaPayoutCents: true,
              estimatedMinutes: true,
              category: { select: { slug: true, name: true } },
            },
          },
        },
      });
      if (
        !run ||
        !["running", "awaiting_human_unit"].includes(run.status) ||
        !run.humanWorkUnit ||
        !["resumed", "exhausted"].includes(run.humanWorkUnit.state)
      ) {
        return;
      }

      const unit = run.humanWorkUnit;
      const eligibility = parseFrozenEligibility(unit.definition.eligibility);
      const claimantId = unit.claimedById;
      let refusal: string | null = null;

      /**
       * The task assignment is the authority. A missing or divergent mirror
       * is not permission to invent a payee; it is an admin-owned stop.
       */
      if (
        claimantId === null ||
        run.task.claimedById !== claimantId ||
        run.task.status !== "claimed"
      ) {
        refusal = "The current task assignment cannot be verified.";
      } else if (eligibility === null) {
        refusal = "The frozen worker eligibility rules cannot be verified.";
      } else if (
        run.task.vaPayoutCents === null ||
        run.task.vaPayoutCents <= 0 ||
        run.task.estimatedMinutes === null ||
        run.task.estimatedMinutes <= 0
      ) {
        refusal = "The accepted task economics cannot be verified.";
      }

      if (refusal === null && claimantId !== null && eligibility !== null) {
        const profile = await tx.vaProfile.findUnique({
          where: { userId: claimantId },
          select: { status: true, scoreCache: true, ratedCount: true },
        });
        refusal = vaStatusRefusal(profile?.status);

        if (refusal === null && profile) {
          const frozenCategory =
            eligibility.categorySlug === null
              ? null
              : {
                  slug: eligibility.categorySlug,
                  name:
                    run.task.category?.slug === eligibility.categorySlug
                      ? run.task.category.name
                      : eligibility.categorySlug,
                };
          let certifiedCount = 0;
          if (eligibility.requireCategoryCertification && frozenCategory) {
            certifiedCount = await tx.certification.count({
              where: { userId: claimantId, courseSlug: frozenCategory.slug },
            });
          }
          refusal = categoryCertificationRefusal({
            requireCategoryCertification: eligibility.requireCategoryCertification,
            category: frozenCategory,
            certifiedCount,
          });

          if (refusal === null) {
            const previouslyFailed = await tx.submission.count({
              where: { taskId: run.taskId, vaId: claimantId, qcStatus: "rejected" },
            });
            refusal = priorRejectionRefusal(previouslyFailed);
          }

          if (refusal === null) {
            refusal = highValueRefusal({
              tier: eligibility.tier,
              scoreCache: profile.scoreCache,
              ratedCount: profile.ratedCount,
              highValueThreshold: eligibility.highValueThreshold,
              minRatedDeliveries: eligibility.minRatedDeliveries,
            });
          }

          if (refusal === null) {
            // Identical lock and statuses as claimTask. The current task is
            // excluded because this is a RE-check of the capacity that existed
            // immediately before its already-established claim.
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(hashtext(${`claim-cap:${claimantId}`}))
            `;
            const activeCount = await tx.task.count({
              where: {
                id: { not: run.taskId },
                claimedById: claimantId,
                status: { in: [...ACTIVE_CLAIM_STATUSES] },
              },
            });
            refusal = activeClaimCapRefusal({
              activeCount,
              maxActiveClaims: eligibility.maxActiveClaims,
            });
          }
        }
      }

      if (refusal !== null) {
        const pausedAt = new Date();
        const paused = await tx.taskWorkflowRun.updateMany({
          where: { id: run.id, status: { in: ["running", "awaiting_human_unit"] } },
          data: {
            status: "paused",
            pausedReason: `${refusal} An administrator must review the existing assignment.`,
          },
        });
        if (paused.count === 0) return;

        await tx.humanWorkUnitAlert.create({
          data: {
            unitStateId: unit.id,
            kind: "admin_pause",
            dueAt: pausedAt,
            claimGeneration: unit.claimGeneration,
          },
        });
        await tx.taskEvent.create({
          data: {
            taskId: run.taskId,
            action: "human_unit_paused",
            meta: { runId, cause: "paused:claimant_ineligible" },
          },
        });

        const admins = await tx.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true },
        });
        const recipients = new Set(admins.map((admin) => admin.id));
        if (claimantId !== null) recipients.add(claimantId);
        if (recipients.size > 0) {
          await tx.notification.createMany({
            data: [...recipients].map((userId) => ({
              userId,
              taskId: run.taskId,
              type: "human_unit_paused",
              title: "Remaining work needs an administrator",
              body: "The downstream automation stopped and the current assignment must be reviewed before the remaining scope can be published. No payout or assignment changed.",
            })),
          });
        }
        return;
      }

      // Narrowing above proves these accepted values exist. Restated as local
      // integers so no fallback can silently turn an unknown promise into 0.
      const frozenPayoutCents = run.task.vaPayoutCents!;
      const frozenEstimatedMinutes = run.task.estimatedMinutes!;
      const finishedAt = new Date();
      const moved = await tx.taskWorkflowRun.updateMany({
        where: { id: run.id, status: { in: ["running", "awaiting_human_unit"] } },
        data: {
          status: "awaiting_human",
          finishedAt,
          unitsTotal,
          unitsResolvedAutomatically: Math.max(0, unitsTotal - unitsRemaining),
          unitsPrefilled: draftedRows,
          unitsVerifiedByMachine: verifiedRows,
        },
      });
      if (moved.count === 0) return;

      await tx.taskHumanWorkPackage.create({
        data: {
          runId: run.id,
          taskId: run.taskId,
          planVersionId: run.planVersionId,
          objective: copy.objective,
          whatIsAlreadyDone: copy.whatIsAlreadyDone,
          instructions: copy.instructions,
          checklist: copy.checklist,
          unitsRemaining,
          unitsTotal,
          // References only: no payout calculation is called on this path.
          estimatedMinutes: frozenEstimatedMinutes,
          computedPayoutCents: frozenPayoutCents,
          reservedBudgetCents: frozenPayoutCents,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: run.taskId,
          action: "human_unit_residual_scope_published",
          meta: { runId, unitStateId: unit.id, claimantPreserved: true },
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The existing runId/taskId constraints are the replay guard. The whole
      // transaction, including its CAS and audit, has already rolled back.
      return;
    }
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
