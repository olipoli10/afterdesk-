import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { transitionTask, TransitionError } from "@/lib/state";
import { resolvePoolAudience, writePoolNotifications } from "@/server/pool-notifications";
import {
  DATA_CLASSES,
  isAtLeastAsRestrictive,
  mostRestrictive,
  type DataClass,
} from "@/lib/ai-work-engine/data-class";

/**
 * THE HUMAN WORK UNIT RUNTIME.
 *
 * The machine has stopped at one admitted human step. Everything here is about
 * the moment that stop becomes visible to someone outside the transaction that
 * created it, and about refusing to make it visible when the mandate is not in
 * a state a person can safely act on.
 *
 * The feature flag is NOT read in this file. It gates admission, in
 * `compileWorkflowForTask`, and nowhere else (C10): a unit that was admitted is
 * carried to its end even if an operator turns the feature off mid-flight,
 * because the alternative is stranding someone who is already holding work on a
 * mandate a client has paid for.
 */

export type PublishOutcome = {
  published: boolean;
  /** Present only on a refusal. Named in the unit's own vocabulary (FR-053). */
  cause?: RefusalCause | "not_admitted" | "already_published";
};

/** Only the two causes publication itself can produce. */
type RefusalCause = "input_unavailable" | "classification_conflict";

type DeclaredInput = {
  kind: "payload_field" | "snapshot_file" | "artifact";
  ref: string;
  label: string;
  dataClass: string;
};

const asDataClass = (value: unknown): DataClass =>
  typeof value === "string" && (DATA_CLASSES as readonly string[]).includes(value)
    ? (value as DataClass)
    : // An unreadable class is treated as the MOST restrictive, not the least.
      // "I do not know what this is" must fail the same way as "this is
      // sensitive", or the default becomes the dangerous branch.
      "personal_sensitive";

function parseDeclaredInputs(raw: unknown): DeclaredInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.kind !== "string" || typeof e.ref !== "string") return [];
    return [
      {
        kind: e.kind as DeclaredInput["kind"],
        ref: e.ref,
        label: typeof e.label === "string" ? e.label : e.ref,
        dataClass: typeof e.dataClass === "string" ? e.dataClass : "personal_sensitive",
      },
    ];
  });
}

/**
 * REFUSE, ATOMICALLY — the `admitted -> paused` transition.
 *
 * contracts/audit-events.md §1 names both publication refusals as unit
 * transitions with their own causes, and FR-050 requires TWO records per
 * transition written in the SAME transaction as the transition itself.
 *
 * An earlier version of this function paused only the workflow run and wrote a
 * TaskEvent. That left the unit reading `admitted` forever: an operator would
 * be told the unit was waiting to publish, with nothing in the audit trail
 * explaining why it never did. The state and the reason have to move together,
 * or the state is a lie about a mandate someone has paid for.
 *
 * Everything below commits together or not at all. The CAS on `admitted` is
 * also what makes a retried sweep, a redelivered webhook and two racing drain
 * ticks converge on ONE refusal instead of a pile of identical audit rows.
 *
 * The task is deliberately NOT transitioned: it stays in `ai_processing`. A
 * refusal publishes nothing, so nothing about the client-facing lifecycle
 * moves; an admin decides what happens next.
 */
async function pauseForRefusal(
  unit: { id: string; taskId: string; claimGeneration: number; resumeGeneration: number },
  runId: string,
  cause: RefusalCause,
  detail: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    /**
     * CAS `admitted -> paused`, allocating the audit sequence in the SAME
     * write (C7/INV-T1). `MAX(seq)+1` is forbidden: two concurrent writers
     * read the same maximum and both claim it.
     *
     * `pausedDetail` is operator-facing and separately constrained (FR-049):
     * no money value, no identity-bearing text. Callers supply sentences about
     * the mandate's shape, never about a person or an amount.
     */
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: { id: unit.id, state: "admitted" },
      data: {
        state: "paused",
        refusalCause: cause,
        pausedDetail: detail,
        transitionSeq: { increment: 1 },
      },
    });
    // Already refused, or already moved on. Write nothing: this is the
    // idempotence guarantee, not an error.
    if (moved.count === 0) return;

    const { transitionSeq } = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { transitionSeq: true },
    });

    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: unit.id,
        seq: transitionSeq,
        // No actor: a machine refused, and recording an id here would put a
        // person's name against a decision they did not make.
        actorId: null,
        actorRole: "system",
        fromState: "admitted",
        toState: "paused",
        cause: `paused:${cause}`,
        claimGeneration: unit.claimGeneration,
        resumeGeneration: unit.resumeGeneration,
      },
    });

    // The mirror, for the surfaces that already render TaskEvent generically.
    // `meta` carries non-sensitive scalars only.
    await tx.taskEvent.create({
      data: {
        taskId: unit.taskId,
        action: "human_unit_paused",
        meta: { state: "paused", cause: `paused:${cause}`, claimGeneration: unit.claimGeneration },
      },
    });

    // The run stops too: its machine block has nowhere to go until an admin
    // resolves the refusal.
    await tx.taskWorkflowRun.updateMany({
      where: { id: runId, status: { in: ["running", "compiling", "awaiting_human_unit"] } },
      data: { status: "paused", pausedReason: detail },
    });
  });
}

/**
 * BIND THE CLAIM — transaction T3, and deliberately NOT its own transaction.
 *
 * Called from INSIDE the existing `claimTask` transaction, after its
 * `transitionTask({ from: "open", to: "claimed", guard: { claimedById: null } })`
 * has already succeeded. That ordering is the whole design:
 *
 *   - `Task.claimedById` remains the SOLE assignment authority (C9). This
 *     function mirrors that decision onto the unit; it never makes a competing
 *     one, and there is no second claim anywhere.
 *   - sharing the caller's transaction means the task and the unit can never
 *     be observed disagreeing about who holds the work. A separate transaction
 *     would leave a window where the pool shows the task taken and the unit
 *     still says nobody has it.
 *   - the caller's advisory-locked WIP cap and the T014 eligibility predicates
 *     have already run. This function adds no authorization of its own and
 *     must not: a second, subtly different definition of "may claim" is
 *     exactly the drift `worker-eligibility.ts` exists to prevent.
 *
 * THE GENERATION IS BUMPED EXACTLY ONCE, and only for the initial
 * `NULL -> worker` assignment (C4). `INV-14`'s trigger deliberately excludes
 * that case — its guard is `OLD."claimedById" IS NOT NULL` — because a second
 * bump here would instantly stale the claim just created, and the worker's
 * first submission would be refused as coming from a superseded generation.
 */
export async function bindClaimToHumanUnit(
  tx: Prisma.TransactionClient,
  input: { taskId: string; workerId: string }
): Promise<{ assignmentEstablished: boolean }> {
  const unit = await tx.humanWorkUnitRunState.findUnique({
    where: { taskId: input.taskId },
    select: {
      id: true,
      state: true,
      claimedById: true,
      resumeGeneration: true,
      definition: { select: { claimLeaseHours: true, submissionDeadlineHours: true } },
    },
  });

  // No unit on this task: an ordinary pool claim, which this function has no
  // business altering.
  if (!unit) return { assignmentEstablished: false };
  if (unit.state !== "published" && unit.state !== "revision_requested") {
    return { assignmentEstablished: false };
  }

  /**
   * "Established or matched" (FR-048). The assignment is ESTABLISHED when the
   * unit had no claimant; it is MATCHED when the worker already held it, which
   * is what a re-bind after a revision request looks like. Only the first bumps
   * the generation.
   */
  const established = unit.claimedById === null;

  const now = new Date();
  const hours = (n: number) => new Date(now.getTime() + n * 60 * 60 * 1000);

  const moved = await tx.humanWorkUnitRunState.updateMany({
    where: { id: unit.id, state: { in: ["published", "revision_requested"] } },
    data: {
      state: "claimed",
      claimedById: input.workerId,
      claimedAt: now,
      /**
       * Both clocks come from the FROZEN durations on the definition, never
       * from the plan's expected minutes. FR-058: an estimate is the planner's
       * opinion, and turning it into a deadline would mean a generous guess
       * bought a worker time while a thin one took it away.
       */
      claimLeaseExpiresAt: hours(unit.definition.claimLeaseHours),
      submissionDeadlineAt: hours(unit.definition.submissionDeadlineHours),
      ...(established ? { claimGeneration: { increment: 1 } } : {}),
      transitionSeq: { increment: 1 },
    },
  });
  // Lost the CAS to a concurrent writer. The caller's own task-level CAS makes
  // this near-unreachable, but "near" is not a guarantee to build on.
  if (moved.count === 0) return { assignmentEstablished: false };

  const bound = await tx.humanWorkUnitRunState.findUniqueOrThrow({
    where: { id: unit.id },
    select: { transitionSeq: true, claimGeneration: true },
  });

  await tx.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: bound.transitionSeq,
      // A worker did this one, and the audit says so.
      actorId: input.workerId,
      actorRole: "worker",
      fromState: unit.state,
      toState: "claimed",
      cause: "claimed",
      claimGeneration: bound.claimGeneration,
      resumeGeneration: unit.resumeGeneration,
      assignmentEstablished: established,
    },
  });

  await tx.taskEvent.create({
    data: {
      taskId: input.taskId,
      action: "human_unit_claimed",
      meta: {
        state: "claimed",
        cause: "claimed",
        claimGeneration: bound.claimGeneration,
        assignmentEstablished: established,
      },
    },
  });

  return { assignmentEstablished: established };
}

/**
 * PUBLISH THE UNIT TO THE POOL — transaction T2.
 *
 * Called by `advanceWorkflow` when the pre-cut block has drained and the unit
 * is still `admitted`.
 *
 * Every refusal below happens BEFORE the transaction opens, each one pausing
 * the run with its own cause and publishing absolutely nothing. That ordering
 * is not tidiness: a refusal discovered halfway through would have to roll back
 * a task transition and a batch of pool notifications, and a notification for a
 * move that then rolls back is worse than no notification at all.
 */
export async function publishHumanWorkUnit(runId: string): Promise<PublishOutcome> {
  const unit = await prisma.humanWorkUnitRunState.findUnique({
    where: { runId },
    select: {
      id: true,
      taskId: true,
      state: true,
      cutOrder: true,
      claimGeneration: true,
      resumeGeneration: true,
      definition: {
        select: { dataClass: true, declaredInputs: true, publicationDeadlineHours: true },
      },
      run: {
        select: {
          id: true,
          planVersionId: true,
          task: { select: { id: true, title: true, tier: true, isInternal: true } },
        },
      },
    },
  });

  // No unit, or one that has already moved on. Both are no-ops rather than
  // errors: this is called from a drain tail that can run twice.
  if (!unit) return { published: false, cause: "not_admitted" };
  if (unit.state !== "admitted") return { published: false, cause: "already_published" };

  const declaredInputs = parseDeclaredInputs(unit.definition.declaredInputs);

  /**
   * REFUSAL 1 — `input_unavailable`.
   *
   * The unit is about to show a person the outputs of the steps it depends on.
   * If a producing step failed permanently there is nothing to show, and if an
   * accepted snapshot file no longer resolves or no longer matches the hash
   * frozen at acceptance then what WOULD be shown is not what the client
   * accepted. Both publish nothing.
   */
  const cutStep = await prisma.taskExecutionPlanStep.findFirst({
    where: { planVersionId: unit.run.planVersionId, order: unit.cutOrder },
    select: { dependsOnOrder: true },
  });
  const producerOrders = cutStep?.dependsOnOrder ?? [];
  if (producerOrders.length > 0) {
    const brokenProducers = await prisma.taskWorkflowStepRun.count({
      where: {
        runId: unit.run.id,
        order: { in: producerOrders },
        status: "failed",
      },
    });
    if (brokenProducers > 0) {
      await pauseForRefusal(
        unit,
        unit.run.id,
        "input_unavailable",
        "A step this human unit depends on did not produce its input, so there is nothing to hand a worker."
      );
      return { published: false, cause: "input_unavailable" };
    }
  }

  // Snapshot files must still resolve AND still match the hash frozen at
  // acceptance. The same `read()` discipline the runner applies to accepted
  // files: a file that changed under a signed contract is not that contract.
  const fileRefs = declaredInputs.filter((i) => i.kind === "snapshot_file");
  for (const ref of fileRefs) {
    const [fileId, frozenSha] = ref.ref.split("#");
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, sha256: true },
    });
    if (!file || (frozenSha && file.sha256 !== frozenSha)) {
      await pauseForRefusal(
        unit,
        unit.run.id,
        "input_unavailable",
        "An accepted file this human unit declares no longer resolves, or no longer matches the hash frozen at acceptance."
      );
      return { published: false, cause: "input_unavailable" };
    }
  }

  /**
   * REFUSAL 2 — `classification_conflict`.
   *
   * The unit may not be less restricted than the most restricted thing it will
   * show. Publishing anyway would be a downgrade by omission: the material
   * keeps its sensitivity, the unit stops declaring it, and the worker's
   * projection is built from the unit.
   */
  const unitClass = asDataClass(unit.definition.dataClass);
  const inputClass = mostRestrictive(declaredInputs.map((i) => asDataClass(i.dataClass)));
  if (!isAtLeastAsRestrictive(unitClass, inputClass)) {
    await pauseForRefusal(
      unit,
      unit.run.id,
      "classification_conflict",
      `This human unit is classified ${unitClass} but declares an input classified ${inputClass}; publishing would show a worker material under a weaker classification than it carries.`
    );
    return { published: false, cause: "classification_conflict" };
  }

  /**
   * The audience is resolved BEFORE the transaction. Reading Settings and every
   * approved worker's profile from inside one pushed `finishRun` past Prisma's
   * 5-second interactive limit on a local database, and the whole handover
   * rolled back with the machine work already done. A transaction holds writes.
   */
  const poolAudience = await resolvePoolAudience(unit.taskId, unit.run.task);

  const publishedAt = new Date();
  const publicationDeadlineAt = new Date(
    publishedAt.getTime() + unit.definition.publicationDeadlineHours * 60 * 60 * 1000
  );

  try {
    await prisma.$transaction(async (tx) => {
      /**
       * CAS `admitted → published`, and the audit sequence allocated in the
       * SAME write (C7/INV-T1). `MAX(seq)+1` is forbidden: two concurrent
       * writers read the same maximum and both claim it, and one of them is
       * then a lost audit row rather than a caught collision.
       */
      const moved = await tx.humanWorkUnitRunState.updateMany({
        where: { id: unit.id, state: "admitted" },
        data: {
          state: "published",
          publishedAt,
          publicationDeadlineAt,
          transitionSeq: { increment: 1 },
        },
      });
      // Someone else published between the read above and here.
      if (moved.count === 0) throw new AlreadyPublished();

      const { transitionSeq } = await tx.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { transitionSeq: true },
      });

      /**
       * NO `vaPayoutCents`, NO `estimatedMinutes`. The worker is about to see a
       * number and it must be the one the client accepted; publication is not
       * the moment it changes. This is the whole reason the residual payout
       * path is not reused here.
       */
      await transitionTask({
        tx,
        taskId: unit.taskId,
        from: "ai_processing",
        to: "open",
        action: "human_unit_published",
        meta: { state: "published", cause: "published", claimGeneration: unit.claimGeneration },
      });

      // Without this the task reaches the pool and nobody is told.
      await writePoolNotifications(tx, unit.taskId, unit.run.task.title, poolAudience);

      // Keyed (unit, kind, dueAt): a replayed sweep loses the unique index and
      // changes nothing, which is what makes the deadline sweep replay-safe
      // without a racy "have we notified?" read.
      await tx.humanWorkUnitAlert.create({
        data: {
          unitStateId: unit.id,
          kind: "publication_deadline",
          dueAt: publicationDeadlineAt,
          claimGeneration: unit.claimGeneration,
        },
      });

      await tx.humanWorkUnitTransition.create({
        data: {
          unitStateId: unit.id,
          seq: transitionSeq,
          actorRole: "system",
          fromState: "admitted",
          toState: "published",
          cause: "published",
          claimGeneration: unit.claimGeneration,
          resumeGeneration: unit.resumeGeneration,
        },
      });
    });
  } catch (error) {
    if (error instanceof AlreadyPublished) {
      return { published: false, cause: "already_published" };
    }
    // A task that moved out of ai_processing under us is not an error worth
    // failing a webhook over; the run is picked up again by the drain.
    if (error instanceof TransitionError) {
      return { published: false, cause: "not_admitted" };
    }
    throw error;
  }

  return { published: true };
}

/** Thrown inside T2 to roll the whole publication back on a lost CAS. */
class AlreadyPublished extends Error {}
