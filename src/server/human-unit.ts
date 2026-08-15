import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { transitionTask, TransitionError } from "@/lib/state";
import { resolvePoolAudience, writePoolNotifications } from "@/server/pool-notifications";
import type {
  FrozenEligibility,
  FrozenHumanUnitDefinition,
} from "@/lib/ai-work-engine/human-unit-definition";
import { validateCandidate } from "@/lib/ai-work-engine/human-unit-result-schema";
import {
  ACTIVE_CLAIM_STATUSES,
  activeClaimCapRefusal,
  categoryCertificationRefusal,
  highValueRefusal,
  priorRejectionRefusal,
  vaStatusRefusal,
} from "@/lib/worker-eligibility";
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

export type SubmitOutcome =
  | { submitted: true; candidateId: string; unitStateId: string }
  | {
      submitted: false;
      cause:
        | "not_available"
        | "stale_generation"
        | "not_eligible"
        | "schema_invalid"
        | "duplicate"
        | "lifecycle_exit";
      missing?: string[];
    };

export type OpenReviewOutcome =
  | { opened: true; unitStateId: string }
  | {
      opened: false;
      cause: "not_available" | "self_review" | "duplicate" | "lifecycle_exit";
    };

export type DecisionOutcome =
  | {
      decided: true;
      unitStateId: string;
      state: "accepted" | "revision_requested" | "exhausted";
    }
  | {
      decided: false;
      cause:
        | "not_available"
        | "duplicate"
        | "self_review"
        | "stale_generation"
        | "lifecycle_exit"
        | "paused";
    };

type SubmitInput = {
  taskId: string;
  actorId: string;
  claimGeneration: number;
  payload: unknown;
  fileIds: string[];
};

type OpenReviewInput = {
  taskId: string;
  actorId: string;
};

type DecisionInput = {
  candidateId: string;
  actorId: string;
  outcome: "accept" | "reject";
  cause?: "revisions_exhausted" | "unsafe_or_unverifiable";
  revisionInstructions?: string;
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
 * A binding that was REQUIRED and did not happen.
 *
 * Thrown from inside the caller's transaction so the whole claim rolls back.
 * Deliberately distinct from "this task has no unit", which is an ordinary
 * pool claim and returns normally: collapsing the two is the fail-open this
 * class exists to prevent.
 */
export class HumanUnitBindError extends Error {}

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
  // business altering. THE ONLY legitimate no-op.
  if (!unit) return { assignmentEstablished: false };

  /**
   * A UNIT EXISTS AND CANNOT BE BOUND. This is a failure, never a no-op.
   *
   * Returning quietly here is what an earlier version did, and it let the
   * surrounding `claimTask` transaction COMMIT: a task marked claimed, with a
   * claimant and a `va_claimed` audit row, sitting on a unit that never bound
   * to it. That is exactly the divergence "one act, two records" exists to make
   * impossible, reached in silence.
   *
   * Throwing takes the whole claim down — the task transition, its claimant and
   * its audit trail all roll back with it.
   */
  if (unit.state !== "published" && unit.state !== "revision_requested") {
    throw new HumanUnitBindError(
      `human work unit for task ${input.taskId} is ${unit.state}; it cannot be claimed`
    );
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
  /**
   * Lost the CAS to a concurrent writer between the read above and here. The
   * caller's own task-level CAS makes this very hard to reach, but "very hard"
   * is not a guarantee, and the failure mode if it did happen is the same
   * silent divergence as above. Same answer: take the claim down.
   */
  if (moved.count === 0) {
    throw new HumanUnitBindError(
      `human work unit for task ${input.taskId} changed state during the claim`
    );
  }

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
 * Frozen criteria are stored as JSON. A malformed historical row is a refusal,
 * never a smaller set of requirements. This is intentionally the same parser
 * shape used by the residual publisher in workflow-runs.ts.
 */
function parseFrozenEligibility(value: unknown): FrozenEligibility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
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

class SubmitRefused extends Error {
  constructor(readonly outcome: Exclude<SubmitOutcome, { submitted: true }>) {
    super(outcome.cause);
  }
}

class LostSubmitCas extends Error {}

type RefusalAuditUnit = {
  id: string;
  taskId: string;
};

async function actorHeldClaimGeneration(
  tx: Prisma.TransactionClient,
  unitStateId: string,
  actorId: string,
  claimGeneration: number,
): Promise<boolean> {
  return (
    (await tx.humanWorkUnitTransition.count({
      where: {
        unitStateId,
        actorId,
        cause: "claimed",
        claimGeneration,
      },
    })) > 0
  );
}

/**
 * A recorded refusal changes no business state, but it still owns one audit
 * sequence. UPDATE ... RETURNING serializes against a concurrent transition,
 * so the row names the state and generation that were actually current when
 * the refusal was recorded rather than a stale pre-lock read.
 */
async function recordSubmitRefusal(
  tx: Prisma.TransactionClient,
  unit: RefusalAuditUnit,
  actorId: string,
  cause: "refused:stale_generation" | "refused:duplicate",
): Promise<void> {
  const audited = await tx.humanWorkUnitRunState.update({
    where: { id: unit.id },
    data: { transitionSeq: { increment: 1 } },
    select: {
      state: true,
      transitionSeq: true,
      claimGeneration: true,
      resumeGeneration: true,
    },
  });

  await tx.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: audited.transitionSeq,
      actorId,
      actorRole: "worker",
      fromState: audited.state,
      toState: audited.state,
      cause,
      claimGeneration: audited.claimGeneration,
      resumeGeneration: audited.resumeGeneration,
    },
  });
  await tx.taskEvent.create({
    data: {
      taskId: unit.taskId,
      action: "human_unit_refused",
      actorId,
      meta: {
        state: audited.state,
        cause,
        claimGeneration: audited.claimGeneration,
      },
    },
  });
}

function candidateRevisionIndex(unit: {
  remainingRevisions: number;
  definition: { revisionBound: number };
}): number | null {
  const index = unit.definition.revisionBound - unit.remainingRevisions;
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * A P2002 is a duplicate only when the exact durable T5 predecessor now
 * exists. This prevents an unrelated unique-index defect from being swallowed
 * as an ordinary double-click.
 */
async function recordDuplicateIfPresent(input: SubmitInput): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.humanWorkUnitRunState.findUnique({
      where: { taskId: input.taskId },
      select: {
        id: true,
        taskId: true,
        claimGeneration: true,
        remainingRevisions: true,
        definition: { select: { revisionBound: true } },
      },
    });
    if (!unit || unit.claimGeneration !== input.claimGeneration) return false;

    const revisionIndex = candidateRevisionIndex(unit);
    if (revisionIndex === null) return false;
    const candidate = await tx.humanWorkUnitCandidate.findUnique({
      where: {
        unitStateId_claimGeneration_revisionIndex: {
          unitStateId: unit.id,
          claimGeneration: input.claimGeneration,
          revisionIndex,
        },
      },
      select: { submittedById: true },
    });
    if (!candidate || candidate.submittedById !== input.actorId) return false;

    await recordSubmitRefusal(tx, unit, input.actorId, "refused:duplicate");
    return true;
  });
}

async function classifyLostSubmit(input: SubmitInput): Promise<SubmitOutcome> {
  if (await recordDuplicateIfPresent(input)) {
    return { submitted: false, cause: "duplicate" };
  }
  return prisma.$transaction(async (tx) => {
    const unit = await tx.humanWorkUnitRunState.findUnique({
      where: { taskId: input.taskId },
      select: { id: true, taskId: true, state: true, claimGeneration: true },
    });
    if (!unit) return { submitted: false, cause: "not_available" };
    if (unit.claimGeneration !== input.claimGeneration) {
      if (
        !(await actorHeldClaimGeneration(
          tx,
          unit.id,
          input.actorId,
          input.claimGeneration,
        ))
      ) {
        return { submitted: false, cause: "not_available" };
      }
      await recordSubmitRefusal(
        tx,
        unit,
        input.actorId,
        "refused:stale_generation",
      );
      return { submitted: false, cause: "stale_generation" };
    }
    if (["resumed", "exhausted", "withdrawn"].includes(unit.state)) {
      return { submitted: false, cause: "lifecycle_exit" };
    }
    return { submitted: false, cause: "not_available" };
  });
}

/**
 * SUBMIT A CANDIDATE — transaction T5.
 *
 * Conformance is only permission to create immutable evidence. It never
 * accepts the result and never makes a downstream machine step runnable.
 * Candidate, file links, unit CAS, primary transition and TaskEvent mirror
 * commit together or not at all.
 */
export async function submitHumanUnitCandidate(
  input: SubmitInput,
): Promise<SubmitOutcome> {
  try {
    return await prisma.$transaction(async (tx) => {
      const unit = await tx.humanWorkUnitRunState.findUnique({
        where: { taskId: input.taskId },
        include: {
          definition: true,
          task: {
            select: {
              status: true,
              claimedById: true,
              category: { select: { slug: true, name: true } },
            },
          },
        },
      });
      if (!unit) return { submitted: false, cause: "not_available" };

      const revisionIndex = candidateRevisionIndex(unit);
      if (revisionIndex === null)
        return { submitted: false, cause: "not_available" };

      // The generation fences first. An old holder is stale even if the task
      // has since moved to somebody else; their old result is never merged.
      if (unit.claimGeneration !== input.claimGeneration) {
        if (
          !(await actorHeldClaimGeneration(
            tx,
            unit.id,
            input.actorId,
            input.claimGeneration,
          ))
        ) {
          return { submitted: false, cause: "not_available" };
        }
        await recordSubmitRefusal(
          tx,
          unit,
          input.actorId,
          "refused:stale_generation",
        );
        return { submitted: false, cause: "stale_generation" };
      }

      // A response lost after commit reaches this exact durable predecessor.
      // It is a duplicate even after review concluded, and recording the retry
      // must not reopen or otherwise rewrite that conclusion.
      const existing = await tx.humanWorkUnitCandidate.findUnique({
        where: {
          unitStateId_claimGeneration_revisionIndex: {
            unitStateId: unit.id,
            claimGeneration: input.claimGeneration,
            revisionIndex,
          },
        },
        select: { submittedById: true },
      });
      if (existing?.submittedById === input.actorId) {
        await recordSubmitRefusal(tx, unit, input.actorId, "refused:duplicate");
        return { submitted: false, cause: "duplicate" };
      }

      if (["resumed", "exhausted", "withdrawn"].includes(unit.state)) {
        return { submitted: false, cause: "lifecycle_exit" };
      }
      if (
        unit.claimedById !== input.actorId ||
        unit.task.claimedById !== input.actorId ||
        unit.task.status !== "claimed"
      ) {
        return { submitted: false, cause: "not_available" };
      }
      if (unit.state !== "claimed" && unit.state !== "revision_requested") {
        return { submitted: false, cause: "not_available" };
      }

      const eligibility = parseFrozenEligibility(unit.definition.eligibility);
      if (eligibility === null)
        return { submitted: false, cause: "not_eligible" };

      const profile = await tx.vaProfile.findUnique({
        where: { userId: input.actorId },
        select: { status: true, scoreCache: true, ratedCount: true },
      });
      let eligibilityRefusal = vaStatusRefusal(profile?.status);
      if (eligibilityRefusal === null && profile) {
        const frozenCategory =
          eligibility.categorySlug === null
            ? null
            : {
                slug: eligibility.categorySlug,
                name:
                  unit.task.category?.slug === eligibility.categorySlug
                    ? unit.task.category.name
                    : eligibility.categorySlug,
              };
        let certifiedCount = 0;
        if (eligibility.requireCategoryCertification && frozenCategory) {
          certifiedCount = await tx.certification.count({
            where: { userId: input.actorId, courseSlug: frozenCategory.slug },
          });
        }
        eligibilityRefusal = categoryCertificationRefusal({
          requireCategoryCertification:
            eligibility.requireCategoryCertification,
          category: frozenCategory,
          certifiedCount,
        });

        if (eligibilityRefusal === null) {
          const previouslyFailed = await tx.submission.count({
            where: {
              taskId: input.taskId,
              vaId: input.actorId,
              qcStatus: "rejected",
            },
          });
          eligibilityRefusal = priorRejectionRefusal(previouslyFailed);
        }
        if (eligibilityRefusal === null) {
          eligibilityRefusal = highValueRefusal({
            tier: eligibility.tier,
            scoreCache: profile.scoreCache,
            ratedCount: profile.ratedCount,
            highValueThreshold: eligibility.highValueThreshold,
            minRatedDeliveries: eligibility.minRatedDeliveries,
          });
        }
        if (eligibilityRefusal === null) {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtext(${`claim-cap:${input.actorId}`}))
          `;
          const activeCount = await tx.task.count({
            where: {
              id: { not: input.taskId },
              claimedById: input.actorId,
              status: { in: [...ACTIVE_CLAIM_STATUSES] },
            },
          });
          eligibilityRefusal = activeClaimCapRefusal({
            activeCount,
            maxActiveClaims: eligibility.maxActiveClaims,
          });
        }
      }
      if (eligibilityRefusal !== null) {
        return { submitted: false, cause: "not_eligible" };
      }

      const uniqueFileIds = [...new Set(input.fileIds)];
      if (uniqueFileIds.length !== input.fileIds.length) {
        return {
          submitted: false,
          cause: "schema_invalid",
          missing: ["artifact_file"],
        };
      }

      /**
       * `fileIds` is the frozen action shape; it has no second user-authored
       * artifact-kind channel. Required kinds are ordered on the definition,
       * so each uploaded file occupies that declared slot. An extra file has
       * no accepted-contract kind and is refused rather than labelled by us.
       */
      if (input.fileIds.length > unit.definition.requiredArtifactKinds.length) {
        return {
          submitted: false,
          cause: "schema_invalid",
          missing: ["artifact_kind"],
        };
      }
      const artifactKinds = unit.definition.requiredArtifactKinds.slice(
        0,
        input.fileIds.length,
      );
      const validation = validateCandidate(
        unit.definition as unknown as FrozenHumanUnitDefinition,
        input.payload,
        artifactKinds,
      );
      if (!validation.ok) {
        return {
          submitted: false,
          cause: "schema_invalid",
          missing: validation.missing,
        };
      }

      if (input.fileIds.length > 0) {
        const attached = await tx.file.updateMany({
          where: {
            id: { in: input.fileIds },
            uploaderId: input.actorId,
            taskId: null,
            kind: "deliverable",
            scanStatus: "clean",
          },
          data: { taskId: input.taskId },
        });
        if (attached.count !== input.fileIds.length) {
          throw new SubmitRefused({
            submitted: false,
            cause: "schema_invalid",
            missing:
              artifactKinds.length > 0 ? artifactKinds : ["artifact_file"],
          });
        }
      }

      const candidate = await tx.humanWorkUnitCandidate.create({
        data: {
          unitStateId: unit.id,
          claimGeneration: input.claimGeneration,
          revisionIndex,
          submittedById: input.actorId,
          payload: validation.value as Prisma.InputJsonValue,
          files:
            input.fileIds.length === 0
              ? undefined
              : {
                  create: input.fileIds.map((fileId, index) => ({
                    fileId,
                    artifactKind: artifactKinds[index]!,
                  })),
                },
        },
        select: { id: true },
      });

      const submittedAt = new Date();
      const moved = await tx.humanWorkUnitRunState.updateMany({
        where: {
          id: unit.id,
          taskId: input.taskId,
          state: { in: ["claimed", "revision_requested"] },
          claimedById: input.actorId,
          claimGeneration: input.claimGeneration,
        },
        data: {
          state: "submitted",
          submittedAt,
          transitionSeq: { increment: 1 },
        },
      });
      if (moved.count === 0) throw new LostSubmitCas();

      const submitted = await tx.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { transitionSeq: true, resumeGeneration: true },
      });
      await tx.humanWorkUnitTransition.create({
        data: {
          unitStateId: unit.id,
          seq: submitted.transitionSeq,
          actorId: input.actorId,
          actorRole: "worker",
          fromState: unit.state,
          toState: "submitted",
          cause: "submitted",
          claimGeneration: input.claimGeneration,
          resumeGeneration: submitted.resumeGeneration,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: input.taskId,
          action: "human_unit_submitted",
          actorId: input.actorId,
          meta: {
            state: "submitted",
            cause: "submitted",
            claimGeneration: input.claimGeneration,
          },
        },
      });

      return {
        submitted: true,
        candidateId: candidate.id,
        unitStateId: unit.id,
      };
    });
  } catch (error) {
    if (error instanceof SubmitRefused) return error.outcome;
    if (error instanceof LostSubmitCas) return classifyLostSubmit(input);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      if (await recordDuplicateIfPresent(input)) {
        return { submitted: false, cause: "duplicate" };
      }
    }
    throw error;
  }
}

const TASK_LIFECYCLE_EXITS = new Set(["cancelled", "expired", "completed"]);
const RUN_LIFECYCLE_EXITS = new Set(["abandoned", "done"]);

type ReviewAuditCause =
  | "review_opened"
  | "accepted"
  | "revision_requested"
  | "exhausted:revisions"
  | "exhausted:unsafe";

type ReviewRefusalCause =
  | "refused:self_review"
  | "refused:duplicate"
  | "refused:stale_generation";

class LostDecisionCas extends Error {}

/**
 * Canonical JSON for the acceptance digest. Object keys are ordered at every
 * depth; array order remains meaningful. The acceptance stores both this
 * digest and a copied JSON value, so a later corruption is detectable without
 * trusting the candidate row that preceded it.
 */
function canonicalJson(value: unknown): string {
  const canonicalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(canonicalize);
    if (entry && typeof entry === "object") {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(entry).sort()) {
        const child = (entry as Record<string, unknown>)[key];
        if (child !== undefined) result[key] = canonicalize(child);
      }
      return result;
    }
    if (typeof entry === "number" && !Number.isFinite(entry)) {
      throw new Error("a non-finite number has no canonical JSON form");
    }
    return entry;
  };
  const encoded = JSON.stringify(canonicalize(value));
  if (encoded === undefined) throw new Error("the accepted result is not JSON");
  return encoded;
}

function resultDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

async function recordReviewRefusal(
  tx: Prisma.TransactionClient,
  unit: RefusalAuditUnit,
  actorId: string,
  cause: ReviewRefusalCause,
): Promise<void> {
  const audited = await tx.humanWorkUnitRunState.update({
    where: { id: unit.id },
    data: { transitionSeq: { increment: 1 } },
    select: {
      state: true,
      transitionSeq: true,
      claimGeneration: true,
      resumeGeneration: true,
    },
  });
  await tx.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: audited.transitionSeq,
      actorId,
      actorRole: "admin",
      fromState: audited.state,
      toState: audited.state,
      cause,
      claimGeneration: audited.claimGeneration,
      resumeGeneration: audited.resumeGeneration,
    },
  });
  await tx.taskEvent.create({
    data: {
      taskId: unit.taskId,
      action: "human_unit_refused",
      actorId,
      meta: {
        state: audited.state,
        cause,
        claimGeneration: audited.claimGeneration,
        resumeGeneration: audited.resumeGeneration,
      },
    },
  });
}

async function writeReviewTransition(
  tx: Prisma.TransactionClient,
  input: {
    unitStateId: string;
    taskId: string;
    actorId: string;
    seq: number;
    fromState: "submitted" | "in_review";
    toState: "in_review" | "accepted" | "revision_requested" | "exhausted";
    cause: ReviewAuditCause;
    claimGeneration: number;
    resumeGeneration: number;
    action:
      | "human_unit_submitted"
      | "human_unit_accepted"
      | "human_unit_rejected"
      | "human_unit_exhausted";
  },
): Promise<void> {
  await tx.humanWorkUnitTransition.create({
    data: {
      unitStateId: input.unitStateId,
      seq: input.seq,
      actorId: input.actorId,
      actorRole: "admin",
      fromState: input.fromState,
      toState: input.toState,
      cause: input.cause,
      claimGeneration: input.claimGeneration,
      resumeGeneration: input.resumeGeneration,
    },
  });
  await tx.taskEvent.create({
    data: {
      taskId: input.taskId,
      action: input.action,
      actorId: input.actorId,
      meta: {
        state: input.toState,
        cause: input.cause,
        claimGeneration: input.claimGeneration,
        resumeGeneration: input.resumeGeneration,
      },
    },
  });
}

/** Transaction T6. Opening a review is optional; deciding from submitted is legal. */
export async function openHumanUnitReview(
  input: OpenReviewInput,
): Promise<OpenReviewOutcome> {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.humanWorkUnitRunState.findUnique({
      where: { taskId: input.taskId },
      select: {
        id: true,
        taskId: true,
        state: true,
        claimGeneration: true,
        resumeGeneration: true,
        claimedById: true,
        run: { select: { status: true } },
        task: { select: { status: true, claimedById: true } },
        candidates: {
          where: { status: "pending" },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { submittedById: true, claimGeneration: true },
        },
      },
    });
    if (!unit) return { opened: false, cause: "not_available" };
    if (
      TASK_LIFECYCLE_EXITS.has(unit.task.status) ||
      RUN_LIFECYCLE_EXITS.has(unit.run.status) ||
      ["resumed", "exhausted", "withdrawn"].includes(unit.state)
    ) {
      return { opened: false, cause: "lifecycle_exit" };
    }

    const candidate = unit.candidates[0];
    if (!candidate) return { opened: false, cause: "not_available" };
    if (candidate.submittedById === input.actorId) {
      await recordReviewRefusal(tx, unit, input.actorId, "refused:self_review");
      return { opened: false, cause: "self_review" };
    }

    const actor = await tx.user.findUnique({
      where: { id: input.actorId },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN") return { opened: false, cause: "not_available" };
    if (
      unit.task.status !== "claimed" ||
      unit.claimedById === null ||
      unit.task.claimedById !== unit.claimedById ||
      candidate.claimGeneration !== unit.claimGeneration
    ) {
      return { opened: false, cause: "not_available" };
    }
    if (unit.state === "in_review") {
      await recordReviewRefusal(tx, unit, input.actorId, "refused:duplicate");
      return { opened: false, cause: "duplicate" };
    }
    if (unit.state !== "submitted") return { opened: false, cause: "not_available" };

    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: {
        id: unit.id,
        state: "submitted",
        claimGeneration: candidate.claimGeneration,
      },
      data: { state: "in_review", transitionSeq: { increment: 1 } },
    });
    if (moved.count === 0) {
      const current = await tx.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { state: true },
      });
      if (current.state === "in_review") {
        await recordReviewRefusal(tx, unit, input.actorId, "refused:duplicate");
        return { opened: false, cause: "duplicate" };
      }
      if (["resumed", "exhausted", "withdrawn"].includes(current.state)) {
        return { opened: false, cause: "lifecycle_exit" };
      }
      return { opened: false, cause: "not_available" };
    }

    const opened = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { transitionSeq: true, resumeGeneration: true },
    });
    await writeReviewTransition(tx, {
      unitStateId: unit.id,
      taskId: unit.taskId,
      actorId: input.actorId,
      seq: opened.transitionSeq,
      fromState: "submitted",
      toState: "in_review",
      cause: "review_opened",
      claimGeneration: unit.claimGeneration,
      resumeGeneration: opened.resumeGeneration,
      // The frozen TaskEvent vocabulary has no review-open action. This is the
      // existing submitted-family mirror, distinguished by state and cause.
      action: "human_unit_submitted",
    });
    return { opened: true, unitStateId: unit.id };
  });
}

type LoadedReviewCandidate = NonNullable<
  Awaited<ReturnType<typeof loadReviewCandidate>>
>;

async function loadReviewCandidate(
  tx: Prisma.TransactionClient,
  candidateId: string,
) {
  return tx.humanWorkUnitCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      unitStateId: true,
      submittedById: true,
      claimGeneration: true,
      payload: true,
      status: true,
      decision: { select: { id: true } },
      unitState: {
        select: {
          id: true,
          taskId: true,
          runId: true,
          state: true,
          claimGeneration: true,
          resumeGeneration: true,
          remainingRevisions: true,
          claimedById: true,
          run: { select: { status: true } },
          task: { select: { status: true, claimedById: true } },
          definition: {
            select: { id: true, dataClass: true, declaredInputs: true },
          },
        },
      },
    },
  });
}

function reviewLifecycleOutcome(
  candidate: LoadedReviewCandidate,
): Exclude<DecisionOutcome, { decided: true }> | null {
  const unit = candidate.unitState;
  if (unit.state === "paused" || unit.run.status === "paused") {
    return { decided: false, cause: "paused" };
  }
  if (
    TASK_LIFECYCLE_EXITS.has(unit.task.status) ||
    RUN_LIFECYCLE_EXITS.has(unit.run.status) ||
    ["resumed", "exhausted", "withdrawn"].includes(unit.state)
  ) {
    return { decided: false, cause: "lifecycle_exit" };
  }
  return null;
}

async function recordDecisionDuplicateIfPresent(
  input: DecisionInput,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const candidate = await loadReviewCandidate(tx, input.candidateId);
    if (!candidate?.decision) return false;
    await recordReviewRefusal(
      tx,
      candidate.unitState,
      input.actorId,
      "refused:duplicate",
    );
    return true;
  });
}

async function classifyLostDecision(input: DecisionInput): Promise<DecisionOutcome> {
  if (await recordDecisionDuplicateIfPresent(input)) {
    return { decided: false, cause: "duplicate" };
  }
  return prisma.$transaction(async (tx) => {
    const candidate = await loadReviewCandidate(tx, input.candidateId);
    if (!candidate) return { decided: false, cause: "not_available" };
    const lifecycle = reviewLifecycleOutcome(candidate);
    if (lifecycle) return lifecycle;
    if (candidate.claimGeneration !== candidate.unitState.claimGeneration) {
      await recordReviewRefusal(
        tx,
        candidate.unitState,
        input.actorId,
        "refused:stale_generation",
      );
      return { decided: false, cause: "stale_generation" };
    }
    return { decided: false, cause: "not_available" };
  });
}

/** Transactions T7/T8/T9. Exactly one immutable decision can win. */
export async function decideHumanUnitCandidate(
  input: DecisionInput,
): Promise<DecisionOutcome> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const candidate = await loadReviewCandidate(tx, input.candidateId);
      if (!candidate) return { outcome: { decided: false, cause: "not_available" } as const };
      const unit = candidate.unitState;

      // Application refusal is first so the database trigger is a backstop,
      // never the only protection and never the reason the refusal audit rolls back.
      if (candidate.submittedById === input.actorId) {
        await recordReviewRefusal(tx, unit, input.actorId, "refused:self_review");
        return { outcome: { decided: false, cause: "self_review" } as const };
      }
      const actor = await tx.user.findUnique({
        where: { id: input.actorId },
        select: { role: true },
      });
      if (actor?.role !== "ADMIN") {
        return { outcome: { decided: false, cause: "not_available" } as const };
      }
      if (candidate.decision) {
        await recordReviewRefusal(tx, unit, input.actorId, "refused:duplicate");
        return { outcome: { decided: false, cause: "duplicate" } as const };
      }

      const lifecycle = reviewLifecycleOutcome(candidate);
      if (lifecycle) return { outcome: lifecycle };
      if (candidate.claimGeneration !== unit.claimGeneration) {
        await recordReviewRefusal(
          tx,
          unit,
          input.actorId,
          "refused:stale_generation",
        );
        return { outcome: { decided: false, cause: "stale_generation" } as const };
      }
      if (
        unit.task.status !== "claimed" ||
        unit.claimedById === null ||
        unit.task.claimedById !== unit.claimedById ||
        candidate.submittedById !== unit.claimedById
      ) {
        return { outcome: { decided: false, cause: "lifecycle_exit" } as const };
      }
      if (
        candidate.status !== "pending" ||
        (unit.state !== "submitted" && unit.state !== "in_review")
      ) {
        return { outcome: { decided: false, cause: "not_available" } as const };
      }

      const fromState = unit.state;
      const unsafe = input.outcome === "reject" && input.cause === "unsafe_or_unverifiable";
      const exhausted = input.outcome === "reject" && (unsafe || unit.remainingRevisions === 0);
      const remainingAfter =
        input.outcome === "reject" && !exhausted
          ? unit.remainingRevisions - 1
          : unit.remainingRevisions;
      const refusalCause = exhausted
        ? unsafe
          ? ("unsafe_or_unverifiable" as const)
          : ("revisions_exhausted" as const)
        : null;
      const decision = await tx.humanWorkUnitReviewDecision.create({
        data: {
          candidateId: candidate.id,
          unitStateId: unit.id,
          decidedById: input.actorId,
          outcome: input.outcome === "accept" ? "accepted" : "rejected",
          cause: refusalCause,
          revisionInstructions: input.revisionInstructions?.trim() || null,
          remainingRevisionsAfter: remainingAfter,
          claimGeneration: candidate.claimGeneration,
        },
        select: { id: true },
      });

      if (input.outcome === "accept") {
        await tx.humanWorkUnitAcceptance.create({
          data: {
            unitStateId: unit.id,
            candidateId: candidate.id,
            decisionId: decision.id,
            acceptedById: input.actorId,
            claimGenerationAtAcceptance: candidate.claimGeneration,
            resultPayload: candidate.payload as Prisma.InputJsonValue,
            resultSha256: resultDigest(candidate.payload),
            dataClass: mostRestrictive([
              asDataClass(unit.definition.dataClass),
              ...parseDeclaredInputs(unit.definition.declaredInputs).map((declared) =>
                asDataClass(declared.dataClass),
              ),
            ]),
            criteriaVersionRef: unit.definition.id,
          },
        });
        const candidateMoved = await tx.humanWorkUnitCandidate.updateMany({
          where: { id: candidate.id, status: "pending" },
          data: { status: "accepted" },
        });
        if (candidateMoved.count !== 1) throw new LostDecisionCas();
        const acceptedAt = new Date();
        const unitMoved = await tx.humanWorkUnitRunState.updateMany({
          where: {
            id: unit.id,
            state: fromState,
            claimGeneration: candidate.claimGeneration,
            remainingRevisions: unit.remainingRevisions,
          },
          data: {
            state: "accepted",
            acceptedAt,
            transitionSeq: { increment: 1 },
          },
        });
        if (unitMoved.count !== 1) throw new LostDecisionCas();
        const accepted = await tx.humanWorkUnitRunState.findUniqueOrThrow({
          where: { id: unit.id },
          select: { transitionSeq: true, resumeGeneration: true },
        });
        await writeReviewTransition(tx, {
          unitStateId: unit.id,
          taskId: unit.taskId,
          actorId: input.actorId,
          seq: accepted.transitionSeq,
          fromState,
          toState: "accepted",
          cause: "accepted",
          claimGeneration: candidate.claimGeneration,
          resumeGeneration: accepted.resumeGeneration,
          action: "human_unit_accepted",
        });
        return {
          outcome: {
            decided: true,
            unitStateId: unit.id,
            state: "accepted",
          } as const,
        };
      }

      const candidateMoved = await tx.humanWorkUnitCandidate.updateMany({
        where: { id: candidate.id, status: "pending" },
        data: { status: exhausted ? "rejected" : "superseded" },
      });
      if (candidateMoved.count !== 1) throw new LostDecisionCas();

      if (!exhausted) {
        const unitMoved = await tx.humanWorkUnitRunState.updateMany({
          where: {
            id: unit.id,
            state: fromState,
            claimGeneration: candidate.claimGeneration,
            remainingRevisions: unit.remainingRevisions,
          },
          data: {
            state: "revision_requested",
            remainingRevisions: { decrement: 1 },
            transitionSeq: { increment: 1 },
          },
        });
        if (unitMoved.count !== 1) throw new LostDecisionCas();
        const revised = await tx.humanWorkUnitRunState.findUniqueOrThrow({
          where: { id: unit.id },
          select: { transitionSeq: true, resumeGeneration: true },
        });
        await writeReviewTransition(tx, {
          unitStateId: unit.id,
          taskId: unit.taskId,
          actorId: input.actorId,
          seq: revised.transitionSeq,
          fromState,
          toState: "revision_requested",
          cause: "revision_requested",
          claimGeneration: candidate.claimGeneration,
          resumeGeneration: revised.resumeGeneration,
          action: "human_unit_rejected",
        });
        const notifiedAt = new Date();
        await tx.humanWorkUnitAlert.create({
          data: {
            unitStateId: unit.id,
            kind: "revision_requested",
            dueAt: notifiedAt,
            claimGeneration: candidate.claimGeneration,
          },
        });
        await tx.notification.create({
          data: {
            userId: unit.claimedById,
            taskId: unit.taskId,
            type: "human_unit_revision_requested",
            title: "A revision was requested",
            body: "An administrator reviewed the submitted result. Follow the revision instructions and resubmit while the task remains assigned to you.",
          },
        });
        return {
          outcome: {
            decided: true,
            unitStateId: unit.id,
            state: "revision_requested",
          } as const,
        };
      }

      const unitMoved = await tx.humanWorkUnitRunState.updateMany({
        where: {
          id: unit.id,
          state: fromState,
          claimGeneration: candidate.claimGeneration,
          remainingRevisions: unit.remainingRevisions,
        },
        data: {
          state: "exhausted",
          refusalCause: refusalCause!,
          transitionSeq: { increment: 1 },
        },
      });
      if (unitMoved.count !== 1) throw new LostDecisionCas();
      const exhaustedUnit = await tx.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { transitionSeq: true, resumeGeneration: true },
      });
      const transitionCause = unsafe ? "exhausted:unsafe" : "exhausted:revisions";
      await writeReviewTransition(tx, {
        unitStateId: unit.id,
        taskId: unit.taskId,
        actorId: input.actorId,
        seq: exhaustedUnit.transitionSeq,
        fromState,
        toState: "exhausted",
        cause: transitionCause,
        claimGeneration: candidate.claimGeneration,
        resumeGeneration: exhaustedUnit.resumeGeneration,
        action: "human_unit_exhausted",
      });
      const alertedAt = new Date();
      await tx.humanWorkUnitAlert.create({
        data: {
          unitStateId: unit.id,
          kind: "admin_pause",
          dueAt: alertedAt,
          claimGeneration: candidate.claimGeneration,
        },
      });
      const admins = await tx.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            taskId: unit.taskId,
            type: "human_unit_exhausted",
            title: "Human work unit needs residual handling",
            body: "The independent review exhausted this human work unit. The existing claimant keeps the task while the remaining manual scope is published.",
          })),
        });
      }
      return {
        outcome: {
          decided: true,
          unitStateId: unit.id,
          state: "exhausted",
        } as const,
        residualRunId: unit.runId,
      };
    });

    if (result.residualRunId) {
      // T14 is the existing, independently replayable residual transaction.
      // The exhausted state above is its durable intent; this direct call makes
      // the handoff immediate, while the workflow drain remains the recovery.
      const { publishAdmittedResidualScope } = await import("@/server/workflow-runs");
      await publishAdmittedResidualScope(result.residualRunId);
    }
    return result.outcome;
  } catch (error) {
    if (error instanceof LostDecisionCas) return classifyLostDecision(input);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (await recordDecisionDuplicateIfPresent(input))
    ) {
      return { decided: false, cause: "duplicate" };
    }
    throw error;
  }
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
