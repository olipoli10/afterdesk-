import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import { REGISTRY } from "@/lib/ai-work-engine/registry";
import {
  applyResume,
  recoverPendingHumanUnitResumes,
} from "@/server/human-unit-resume";
import { createTask, createWorker } from "./fixtures";

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

type ResumeFixtureOptions = {
  downstreamVersion?: number;
  includeFollower?: boolean;
};

type SubmitOutcome =
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

type CandidateRuntime = {
  submitHumanUnitCandidate(input: {
    taskId: string;
    actorId: string;
    claimGeneration: number;
    payload: unknown;
    fileIds: string[];
  }): Promise<SubmitOutcome>;
};

/**
 * T040 is committed RED before T041 adds the export. The cast lets the eleven
 * older resume cases keep loading while the new cases reach the exact missing
 * T5 boundary when they execute.
 */
const candidateRuntime = (await import("@/server/human-unit")) as unknown as CandidateRuntime;

const CANDIDATE_PAYLOAD = { summary: "reviewed candidate" };

async function claimedUnitReadyToSubmit(options: { revisionBound?: number } = {}) {
  const revisionBound = options.revisionBound ?? 2;
  const worker = await createWorker();
  const task = await createTask({
    status: "claimed",
    claimedById: worker.id,
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "candidate replay",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 4_000,
      calibration: "calibrated" as never,
      dataClass: "business_confidential",
      dataClassSignals: ["T040 frozen fixture"],
    },
    select: { id: true },
  });
  const cut = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 1,
      title: "Review the record",
      description: "Return the frozen structured result.",
      executor: "human" as never,
      humanRole: "worker" as never,
      params: {},
      fixedMinutes: 30,
      estimatedMinutesOptimistic: 10,
      estimatedMinutesLikely: 20,
      estimatedMinutesConservative: 30,
      verificationMethod: "independent_admin_review",
      acceptanceCriteria: ["The summary is supported by the record."],
      riskLevel: "low" as never,
      dependsOnOrder: [],
      humanOutputSchema: OUTPUT_SCHEMA,
      humanRequiredArtifactKinds: [],
    },
    select: { id: true },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "T040 replay contract",
      description: "Frozen candidate transaction contract.",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      dataClass: "business_confidential",
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: planVersion.id,
      status: "awaiting_human_unit" as never,
      automatedStepCount: 0,
      humanStepCount: 1,
      unitsTotal: 1,
    },
    select: { id: true },
  });
  const definition = await prisma.humanWorkUnitDefinition.create({
    data: {
      planVersionId: planVersion.id,
      planStepId: cut.id,
      instructions: "Review the record and return the frozen structured result.",
      declaredInputs: [],
      outputSchema: OUTPUT_SCHEMA,
      requiredArtifactKinds: [],
      acceptanceCriteria: ["The summary is supported by the record."],
      verificationMethod: "independent_admin_review",
      eligibility: {
        categorySlug: null,
        tier: "standard",
        requireCategoryCertification: false,
        highValueThreshold: 4.5,
        minRatedDeliveries: 3,
        maxActiveClaims: 3,
      },
      reviewerAuthority: "admin",
      expectedMinutes: 20,
      revisionBound,
      publicationDeadlineHours: 72,
      submissionDeadlineHours: 72,
      claimLeaseHours: 72,
      economicProvenance: {
        planStepId: cut.id,
        fixedMinutes: 30,
        acceptedTaskPayoutCents: 4_000,
        acceptedEstimatedMinutes: 60,
      },
      dataClass: "business_confidential",
    },
    select: { id: true },
  });
  const now = new Date();
  const unit = await prisma.humanWorkUnitRunState.create({
    data: {
      runId: run.id,
      taskId: task.id,
      snapshotId: snapshot.id,
      definitionId: definition.id,
      cutOrder: 1,
      state: "claimed" as never,
      claimGeneration: 1,
      transitionSeq: 1,
      remainingRevisions: revisionBound,
      claimedById: worker.id,
      claimedAt: now,
      claimLeaseExpiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      submissionDeadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      publishedAt: new Date(now.getTime() - 60_000),
      publicationDeadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
  await prisma.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: 1,
      actorId: worker.id,
      actorRole: "worker" as never,
      fromState: "published" as never,
      toState: "claimed" as never,
      cause: "claimed",
      claimGeneration: 1,
      resumeGeneration: 0,
      assignmentEstablished: true,
    },
  });
  return { worker, task, unit };
}

type CandidateFixture = Awaited<ReturnType<typeof claimedUnitReadyToSubmit>>;

const submitCandidate = (fixture: CandidateFixture) =>
  candidateRuntime.submitHumanUnitCandidate({
    taskId: fixture.task.id,
    actorId: fixture.worker.id,
    claimGeneration: 1,
    payload: CANDIDATE_PAYLOAD,
    fileIds: [],
  });

async function candidateSubmissionSnapshot(fixture: CandidateFixture) {
  const [unit, candidates, transitions, mirrors] = await prisma.$transaction([
    prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fixture.unit.id },
      select: {
        state: true,
        submittedAt: true,
        transitionSeq: true,
        claimedById: true,
      },
    }),
    prisma.humanWorkUnitCandidate.findMany({
      where: { unitStateId: fixture.unit.id },
      select: {
        id: true,
        claimGeneration: true,
        revisionIndex: true,
        submittedById: true,
        payload: true,
        status: true,
      },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.humanWorkUnitTransition.count({
      where: { unitStateId: fixture.unit.id, cause: "submitted" },
    }),
    prisma.taskEvent.count({
      where: { taskId: fixture.task.id, action: "human_unit_submitted" },
    }),
  ]);
  return { unit, candidates, transitions, mirrors };
}

async function installBeforeCandidateCommitCrash() {
  await removeBeforeCandidateCommitCrash();
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION afterdesk_test_t040_fail_before_candidate_commit()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'forced T040 crash before candidate commit';
    END;
    $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER afterdesk_test_t040_fail_before_candidate_commit
    BEFORE INSERT ON "HumanWorkUnitTransition"
    FOR EACH ROW
    WHEN (NEW."cause" = 'submitted')
    EXECUTE FUNCTION afterdesk_test_t040_fail_before_candidate_commit()
  `);
}

async function removeBeforeCandidateCommitCrash() {
  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS afterdesk_test_t040_fail_before_candidate_commit
    ON "HumanWorkUnitTransition"
  `);
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS afterdesk_test_t040_fail_before_candidate_commit()`
  );
}

/** The runtime returns only after T5 committed; losing this return is the post-commit crash. */
async function submitThenLoseTheCommittedResponse(fixture: CandidateFixture) {
  const outcome = await submitCandidate(fixture);
  expect(outcome).toMatchObject({ submitted: true, unitStateId: fixture.unit.id });
  throw new Error("forced T040 crash after candidate commit");
}

/** Seed a valid T5→T8 terminal predecessor so the concluded-review retry is independent. */
async function seedConcludedCandidate(fixture: CandidateFixture) {
  const admin = await prisma.user.create({
    data: {
      name: "T040 review admin",
      email: `t040-review-${Date.now()}-${Math.random()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
  const candidate = await prisma.$transaction(async (tx) => {
    const created = await tx.humanWorkUnitCandidate.create({
      data: {
        unitStateId: fixture.unit.id,
        claimGeneration: 1,
        revisionIndex: 0,
        submittedById: fixture.worker.id,
        payload: CANDIDATE_PAYLOAD,
      },
      select: { id: true },
    });
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: { id: fixture.unit.id, state: "claimed", claimGeneration: 1 },
      data: {
        state: "submitted",
        submittedAt: new Date(),
        transitionSeq: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    const unit = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fixture.unit.id },
      select: { transitionSeq: true },
    });
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: fixture.unit.id,
        seq: unit.transitionSeq,
        actorId: fixture.worker.id,
        actorRole: "worker" as never,
        fromState: "claimed" as never,
        toState: "submitted" as never,
        cause: "submitted",
        claimGeneration: 1,
        resumeGeneration: 0,
      },
    });
    await tx.taskEvent.create({
      data: {
        taskId: fixture.task.id,
        action: "human_unit_submitted",
        actorId: fixture.worker.id,
        meta: { state: "submitted", cause: "submitted", claimGeneration: 1 },
      },
    });
    return created;
  });

  await prisma.$transaction(async (tx) => {
    await tx.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: fixture.unit.id,
        decidedById: admin.id,
        outcome: "rejected" as never,
        cause: "revisions_exhausted" as never,
        remainingRevisionsAfter: 0,
        claimGeneration: 1,
      },
    });
    await tx.humanWorkUnitCandidate.update({
      where: { id: candidate.id },
      data: { status: "rejected" as never },
    });
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: {
        id: fixture.unit.id,
        state: "submitted",
        claimGeneration: 1,
        remainingRevisions: 0,
      },
      data: {
        state: "exhausted",
        refusalCause: "revisions_exhausted" as never,
        transitionSeq: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    const unit = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fixture.unit.id },
      select: { transitionSeq: true },
    });
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: fixture.unit.id,
        seq: unit.transitionSeq,
        actorId: admin.id,
        actorRole: "admin" as never,
        fromState: "submitted" as never,
        toState: "exhausted" as never,
        cause: "exhausted:revisions",
        claimGeneration: 1,
        resumeGeneration: 0,
      },
    });
    await tx.taskEvent.create({
      data: {
        taskId: fixture.task.id,
        action: "human_unit_exhausted",
        actorId: admin.id,
        meta: {
          state: "exhausted",
          cause: "exhausted:revisions",
          claimGeneration: 1,
        },
      },
    });
  });
  return candidate;
}

/**
 * The durable crash boundary T029 starts from: acceptance committed, resume
 * not yet attempted. The acceptance is seeded deliberately — it is the exact
 * durable resume intent the later review transaction writes, and US1 must be
 * independently provable before that review path exists.
 */
async function acceptedUnitReadyToResume(options: ResumeFixtureOptions = {}) {
  const worker = await createWorker();
  const admin = await prisma.user.create({
    data: {
      name: "Integration Admin",
      email: `resume-admin-${Date.now()}-${Math.random()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
  const task = await createTask({
    status: "claimed",
    claimedById: worker.id,
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "resume",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 4_000,
      calibration: "calibrated" as never,
    },
    select: { id: true },
  });
  const primitiveId = "normalize.contact_fields";
  const primitiveVersion =
    options.downstreamVersion ?? REGISTRY[primitiveId].version;
  const producer = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 1,
      title: "produce",
      description: "produce",
      executor: "deterministic_code" as never,
      primitiveId,
      primitiveVersion: REGISTRY[primitiveId].version,
      params: {},
      estimatedMinutesOptimistic: 1,
      estimatedMinutesLikely: 1,
      estimatedMinutesConservative: 1,
      verificationMethod: "sample_check",
      acceptanceCriteria: ["ok"],
      riskLevel: "low" as never,
      dependsOnOrder: [],
    },
    select: { id: true },
  });
  const cut = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 2,
      title: "judge",
      description: "judge",
      executor: "human" as never,
      humanRole: "worker" as never,
      fixedMinutes: 30,
      estimatedMinutesOptimistic: 10,
      estimatedMinutesLikely: 20,
      estimatedMinutesConservative: 30,
      verificationMethod: "sample_check",
      acceptanceCriteria: ["ok"],
      riskLevel: "low" as never,
      dependsOnOrder: [1],
      humanOutputSchema: OUTPUT_SCHEMA,
      humanRequiredArtifactKinds: [],
    },
    select: { id: true },
  });
  const downstream = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 3,
      title: "continue",
      description: "continue",
      executor: "deterministic_code" as never,
      primitiveId,
      primitiveVersion,
      params: {},
      estimatedMinutesOptimistic: 1,
      estimatedMinutesLikely: 1,
      estimatedMinutesConservative: 1,
      verificationMethod: "sample_check",
      acceptanceCriteria: ["ok"],
      riskLevel: "low" as never,
      dependsOnOrder: [2],
    },
    select: { id: true },
  });
  const follower = options.includeFollower
    ? await prisma.taskExecutionPlanStep.create({
        data: {
          planVersionId: planVersion.id,
          order: 4,
          title: "consume",
          description: "consume",
          executor: "deterministic_code" as never,
          primitiveId,
          primitiveVersion: REGISTRY[primitiveId].version,
          params: {},
          estimatedMinutesOptimistic: 1,
          estimatedMinutesLikely: 1,
          estimatedMinutesConservative: 1,
          verificationMethod: "sample_check",
          acceptanceCriteria: ["ok"],
          riskLevel: "low" as never,
          dependsOnOrder: [3],
        },
        select: { id: true },
      })
    : null;
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "resume",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: planVersion.id,
      status: "awaiting_human_unit" as never,
      automatedStepCount: follower ? 3 : 2,
      humanStepCount: 1,
      steps: {
        create: [
          {
            planStepId: producer.id,
            order: 1,
            primitiveId,
            primitiveVersion: REGISTRY[primitiveId].version,
            executionMode: "automated" as never,
            status: "done" as never,
          },
          {
            planStepId: cut.id,
            order: 2,
            executionMode: "human" as never,
            status: "handed_to_human" as never,
            handoffReason: HANDOFF_REASONS.human_step,
          },
          {
            planStepId: downstream.id,
            order: 3,
            primitiveId,
            primitiveVersion,
            executionMode: "automated" as never,
            status: "blocked_on_human_unit" as never,
          },
          ...(follower
            ? [
                {
                  planStepId: follower.id,
                  order: 4,
                  primitiveId,
                  primitiveVersion: REGISTRY[primitiveId].version,
                  executionMode: "automated" as never,
                  status: "blocked_on_human_unit" as never,
                },
              ]
            : []),
        ],
      },
    },
    select: { id: true },
  });
  const definition = await prisma.humanWorkUnitDefinition.create({
    data: {
      planVersionId: planVersion.id,
      planStepId: cut.id,
      instructions: "Confirm each row.",
      declaredInputs: [],
      outputSchema: OUTPUT_SCHEMA,
      requiredArtifactKinds: [],
      acceptanceCriteria: ["ok"],
      verificationMethod: "sample_check",
      eligibility: {},
      reviewerAuthority: "admin",
      expectedMinutes: 20,
      revisionBound: 2,
      publicationDeadlineHours: 72,
      submissionDeadlineHours: 72,
      claimLeaseHours: 72,
      economicProvenance: {},
      dataClass: "business_confidential",
    },
    select: { id: true },
  });
  const acceptedAt = new Date();
  const unit = await prisma.humanWorkUnitRunState.create({
    data: {
      runId: run.id,
      taskId: task.id,
      snapshotId: snapshot.id,
      definitionId: definition.id,
      cutOrder: 2,
      state: "accepted" as never,
      remainingRevisions: 2,
      claimedById: worker.id,
      claimedAt: acceptedAt,
      acceptedAt,
      claimGeneration: 1,
      resumeGeneration: 0,
      transitionSeq: 1,
    },
    select: { id: true },
  });
  const candidate = await prisma.humanWorkUnitCandidate.create({
    data: {
      unitStateId: unit.id,
      claimGeneration: 1,
      revisionIndex: 0,
      submittedById: worker.id,
      payload: { summary: "accepted" },
      status: "accepted" as never,
    },
    select: { id: true },
  });
  const decision = await prisma.humanWorkUnitReviewDecision.create({
    data: {
      candidateId: candidate.id,
      unitStateId: unit.id,
      decidedById: admin.id,
      outcome: "accepted" as never,
      remainingRevisionsAfter: 2,
      claimGeneration: 1,
    },
    select: { id: true },
  });
  const acceptance = await prisma.humanWorkUnitAcceptance.create({
    data: {
      unitStateId: unit.id,
      candidateId: candidate.id,
      decisionId: decision.id,
      acceptedById: admin.id,
      claimGenerationAtAcceptance: 1,
      resultPayload: { summary: "accepted" },
      resultSha256: "0".repeat(64),
      dataClass: "business_confidential",
      criteriaVersionRef: definition.id,
      acceptedAt,
    },
    select: { id: true },
  });
  await prisma.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: 1,
      actorId: admin.id,
      actorRole: "admin" as never,
      fromState: "submitted" as never,
      toState: "accepted" as never,
      cause: "accepted",
      claimGeneration: 1,
      resumeGeneration: 0,
    },
  });
  const step = await prisma.taskWorkflowStepRun.findFirstOrThrow({
    where: { runId: run.id, order: 3 },
    select: { id: true },
  });
  const followerStep = await prisma.taskWorkflowStepRun.findFirst({
    where: { runId: run.id, order: 4 },
    select: { id: true },
  });
  return { task, run, unit, acceptance, step, followerStep, worker };
}

describe("T040 — candidate commit is atomic across crash and replay", () => {
  it("a crash immediately before commit leaves nothing and the same request retries safely", async () => {
    const fixture = await claimedUnitReadyToSubmit();
    await installBeforeCandidateCommitCrash();
    try {
      await expect(submitCandidate(fixture)).rejects.toThrow(
        /forced T040 crash before candidate commit/i
      );
      expect(await candidateSubmissionSnapshot(fixture)).toEqual({
        unit: {
          state: "claimed",
          submittedAt: null,
          transitionSeq: 1,
          claimedById: fixture.worker.id,
        },
        candidates: [],
        transitions: 0,
        mirrors: 0,
      });
    } finally {
      await removeBeforeCandidateCommitCrash();
    }

    const retry = await submitCandidate(fixture);
    expect(retry).toMatchObject({ submitted: true, unitStateId: fixture.unit.id });
    expect(await candidateSubmissionSnapshot(fixture)).toMatchObject({
      unit: {
        state: "submitted",
        submittedAt: expect.any(Date),
        transitionSeq: 2,
        claimedById: fixture.worker.id,
      },
      candidates: [
        {
          claimGeneration: 1,
          revisionIndex: 0,
          submittedById: fixture.worker.id,
          payload: CANDIDATE_PAYLOAD,
          status: "pending",
        },
      ],
      transitions: 1,
      mirrors: 1,
    });
  });

  it("a crash immediately after commit exposes one complete submission and its retry is duplicate", async () => {
    const fixture = await claimedUnitReadyToSubmit();

    await expect(submitThenLoseTheCommittedResponse(fixture)).rejects.toThrow(
      /forced T040 crash after candidate commit/i
    );
    const committed = await candidateSubmissionSnapshot(fixture);
    expect(committed).toMatchObject({
      unit: {
        state: "submitted",
        submittedAt: expect.any(Date),
        transitionSeq: 2,
        claimedById: fixture.worker.id,
      },
      candidates: [
        {
          claimGeneration: 1,
          revisionIndex: 0,
          submittedById: fixture.worker.id,
          payload: CANDIDATE_PAYLOAD,
          status: "pending",
        },
      ],
      transitions: 1,
      mirrors: 1,
    });

    expect(await submitCandidate(fixture)).toEqual({ submitted: false, cause: "duplicate" });
    const afterRetry = await candidateSubmissionSnapshot(fixture);
    expect(afterRetry.candidates).toEqual(committed.candidates);
    expect(afterRetry).toMatchObject({
      unit: {
        state: "submitted",
        submittedAt: committed.unit.submittedAt,
        transitionSeq: 3,
        claimedById: fixture.worker.id,
      },
      transitions: 1,
      mirrors: 1,
    });
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: fixture.unit.id, cause: "refused:duplicate" },
      })
    ).toBe(1);
    expect(
      await prisma.taskEvent.count({
        where: {
          taskId: fixture.task.id,
          action: "human_unit_refused",
          meta: { path: ["cause"], equals: "refused:duplicate" },
        },
      })
    ).toBe(1);
  });

  it("a duplicate submission cannot reopen a review that already concluded", async () => {
    const fixture = await claimedUnitReadyToSubmit({ revisionBound: 0 });
    const candidate = await seedConcludedCandidate(fixture);
    const before = await prisma.$transaction([
      prisma.humanWorkUnitCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
      prisma.humanWorkUnitReviewDecision.findUniqueOrThrow({
        where: { candidateId: candidate.id },
      }),
      prisma.humanWorkUnitAcceptance.findUnique({
        where: { candidateId: candidate.id },
      }),
      prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unit.id },
        select: {
          state: true,
          refusalCause: true,
          remainingRevisions: true,
          claimedById: true,
        },
      }),
    ]);

    expect(await submitCandidate(fixture)).toEqual({ submitted: false, cause: "duplicate" });

    const after = await prisma.$transaction([
      prisma.humanWorkUnitCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
      prisma.humanWorkUnitReviewDecision.findUniqueOrThrow({
        where: { candidateId: candidate.id },
      }),
      prisma.humanWorkUnitAcceptance.findUnique({
        where: { candidateId: candidate.id },
      }),
      prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unit.id },
        select: {
          state: true,
          refusalCause: true,
          remainingRevisions: true,
          claimedById: true,
        },
      }),
    ]);
    expect(after).toEqual(before);
    expect(
      await prisma.humanWorkUnitCandidate.count({ where: { unitStateId: fixture.unit.id } })
    ).toBe(1);
    expect(
      await prisma.humanWorkUnitReviewDecision.count({ where: { unitStateId: fixture.unit.id } })
    ).toBe(1);
    expect(
      await prisma.humanWorkUnitAcceptance.count({ where: { unitStateId: fixture.unit.id } })
    ).toBe(0);
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: fixture.unit.id, cause: "refused:duplicate" },
      })
    ).toBe(1);
    expect(
      await prisma.taskEvent.count({
        where: {
          taskId: fixture.task.id,
          action: "human_unit_refused",
          meta: { path: ["cause"], equals: "refused:duplicate" },
        },
      })
    ).toBe(1);
  });
});

describe("T029/T036 — crash-safe, exactly-once resume", () => {
  it("recovers an acceptance committed before the process died", async () => {
    const { task, run, unit, acceptance, step, worker } =
      await acceptedUnitReadyToResume();

    expect(await recoverPendingHumanUnitResumes()).toBe(1);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, resumeGeneration: true, transitionSeq: true },
    });
    expect(after).toMatchObject({ state: "resumed", resumeGeneration: 1, transitionSeq: 2 });
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true },
      })
    ).toMatchObject({ status: "running" });
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true },
      })
    ).toMatchObject({ status: "pending" });
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        select: { status: true, claimedById: true, vaPayoutCents: true },
      })
    ).toMatchObject({
      status: "claimed",
      claimedById: worker.id,
      vaPayoutCents: 4_000,
    });

    const record = await prisma.humanWorkUnitResumeRecord.findUniqueOrThrow({
      where: { runId: run.id },
    });
    expect(record.acceptanceId).toBe(acceptance.id);
    expect(record.resumeGeneration).toBe(1);
    expect(record.resumedStepRunIds).toEqual([step.id]);
    expect(record.skippedStepRunIds).toEqual([]);
  });

  it("a direct trigger and the recovery sweep converge on one transition", async () => {
    const { run, unit, step } = await acceptedUnitReadyToResume();

    const [direct, recovered] = await Promise.all([
      applyResume(unit.id),
      recoverPendingHumanUnitResumes(),
    ]);
    expect(Number(direct.resumed) + recovered).toBe(1);
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(1);
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: unit.id, cause: "resumed" },
      })
    ).toBe(1);
    expect(
      await prisma.taskEvent.count({ where: { taskId: (await prisma.taskWorkflowRun.findUniqueOrThrow({ where: { id: run.id }, select: { taskId: true } })).taskId, action: "human_unit_resumed" } })
    ).toBe(1);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true, attempts: true },
      })
    ).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("a full double concurrent replay creates no duplicate resume or execution", async () => {
    const { run, unit, step } = await acceptedUnitReadyToResume();

    await Promise.all([
      applyResume(unit.id),
      applyResume(unit.id),
      recoverPendingHumanUnitResumes(),
      recoverPendingHumanUnitResumes(),
    ]);
    await Promise.all([applyResume(unit.id), recoverPendingHumanUnitResumes()]);

    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(1);
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: unit.id, cause: "resumed" },
      })
    ).toBe(1);
    expect(await prisma.taskToolInvocation.count({ where: { stepRunId: step.id } })).toBe(0);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true, attempts: true },
      })
    ).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("skips a blocked step whose pinned primitive version is no longer runnable", async () => {
    const { run, unit, step, followerStep } = await acceptedUnitReadyToResume({
      downstreamVersion: 999,
      includeFollower: true,
    });
    expect(followerStep).not.toBeNull();

    const result = await applyResume(unit.id);
    expect(result.resumed).toBe(true);
    const record = await prisma.humanWorkUnitResumeRecord.findUniqueOrThrow({
      where: { runId: run.id },
    });
    expect(record.resumedStepRunIds).toEqual([]);
    expect(record.skippedStepRunIds).toEqual([step.id, followerStep!.id]);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true, executionMode: true, handoffReason: true },
      })
    ).toMatchObject({
      status: "handed_to_human",
      executionMode: "human",
      handoffReason: HANDOFF_REASONS.primitive_version_changed,
    });
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: followerStep!.id },
        select: { status: true, executionMode: true, handoffReason: true },
      })
    ).toMatchObject({
      status: "handed_to_human",
      executionMode: "human",
      handoffReason: HANDOFF_REASONS.depends_on_human,
    });
  });

  it("refuses an admin-owned pause without changing anything", async () => {
    const { run, unit, step } = await acceptedUnitReadyToResume();
    await prisma.taskWorkflowRun.update({
      where: { id: run.id },
      data: { status: "paused" as never, pausedReason: "Admin decision required." },
    });

    expect(await applyResume(unit.id)).toMatchObject({ resumed: false, cause: "paused" });
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true },
      })
    ).toMatchObject({ status: "blocked_on_human_unit" });
  });

  it("refuses an accepted result after the task claimant was released", async () => {
    const { task, run, unit, step } = await acceptedUnitReadyToResume();
    await prisma.task.update({
      where: { id: task.id },
      data: { claimedById: null, claimedAt: null },
    });

    expect(await applyResume(unit.id)).toMatchObject({
      resumed: false,
      cause: "not_accepted",
    });
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true },
      })
    ).toMatchObject({ status: "blocked_on_human_unit" });
  });

  it.each([
    ["cancelled", null],
    ["expired", null],
    ["completed", null],
    [null, "abandoned"],
    [null, "done"],
  ])("refuses lifecycle exit task=%s run=%s", async (taskStatus, runStatus) => {
    const { task, run, unit, step, worker } = await acceptedUnitReadyToResume();
    if (taskStatus) {
      if (taskStatus === "completed") {
        await prisma.payout.create({
          data: {
            taskId: task.id,
            vaId: worker.id,
            amountCents: 4_000,
            status: "owed" as never,
          },
        });
      }
      await prisma.task.update({
        where: { id: task.id },
        data: { status: taskStatus as never },
      });
    }
    if (runStatus) {
      await prisma.taskWorkflowRun.update({
        where: { id: run.id },
        data: { status: runStatus as never },
      });
    }

    expect(await applyResume(unit.id)).toMatchObject({
      resumed: false,
      cause: "lifecycle_exit",
    });
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: step.id },
        select: { status: true },
      })
    ).toMatchObject({ status: "blocked_on_human_unit" });
  });
});
