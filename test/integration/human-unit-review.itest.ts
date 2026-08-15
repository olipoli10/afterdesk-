import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { REGISTRY } from "@/lib/ai-work-engine/registry";
import { applyResume } from "@/server/human-unit-resume";
import { createTask, createWorker } from "./fixtures";

/**
 * T039 — QUICKSTART SCENARIO C, RED BEFORE T041/T042.
 *
 * A submission is evidence, not authority. These cases drive the planned T5–T9
 * runtime directly so the later server actions remain thin authorization and
 * input-validation wrappers. The cast keeps this contract executable before
 * the exports exist: every case reaches the intended missing runtime boundary
 * instead of the file failing to load after the first missing named import.
 */

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

type OpenReviewOutcome =
  | { opened: true; unitStateId: string }
  | {
      opened: false;
      cause: "not_available" | "self_review" | "duplicate" | "lifecycle_exit";
    };

type DecisionOutcome =
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

type ReviewRuntime = {
  submitHumanUnitCandidate(input: {
    taskId: string;
    actorId: string;
    claimGeneration: number;
    payload: unknown;
    fileIds: string[];
  }): Promise<SubmitOutcome>;
  openHumanUnitReview(input: {
    taskId: string;
    actorId: string;
  }): Promise<OpenReviewOutcome>;
  decideHumanUnitCandidate(input: {
    candidateId: string;
    actorId: string;
    outcome: "accept" | "reject";
    cause?: "revisions_exhausted" | "unsafe_or_unverifiable";
    revisionInstructions?: string;
  }): Promise<DecisionOutcome>;
};

const reviewRuntime = (await import("@/server/human-unit")) as unknown as ReviewRuntime;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["decision"],
};

const FIRST_RESULT = { decision: "needs a revision", confidence: 0.55 };
const ACCEPTED_RESULT = { decision: "approved after revision", confidence: 0.98 };
const MACHINE_PRIMITIVE_ID = "normalize.contact_fields";
const MACHINE_PRIMITIVE_VERSION = REGISTRY[MACHINE_PRIMITIVE_ID].version;

type ReviewFixture = Awaited<ReturnType<typeof claimedReviewUnit>>;

async function createAdmin(label = "review") {
  return prisma.user.create({
    data: {
      name: `Human unit ${label} admin`,
      email: `hwu-${label}-${randomUUID()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
}

/**
 * A real persisted unit immediately before T5: the task and unit carry the
 * same sole claimant, the run is waiting, and its machine descendant is
 * blocked. Admission/publication/claim have their own integration proofs; this
 * fixture isolates the review contract rather than making every rejection
 * depend on those earlier transactions too.
 */
async function claimedReviewUnit(options?: {
  revisionBound?: number;
  requiredArtifactKinds?: string[];
}) {
  const worker = await createWorker();
  const admin = await createAdmin();
  const task = await createTask({
    status: "claimed",
    claimedById: worker.id,
    clientPriceCents: 10_000,
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "Review one structured human result.",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 4_000,
      calibration: "calibrated" as never,
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: 25_000n,
      automationCostPolicyVersion: "review-policy-v1",
      dataClass: "business_confidential",
      dataClassSignals: ["T039 frozen fixture"],
    },
    select: { id: true },
  });
  const cut = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 1,
      title: "Judge the record",
      description: "Return the frozen structured decision.",
      executor: "human" as never,
      humanRole: "worker" as never,
      params: {},
      fixedMinutes: 30,
      estimatedMinutesOptimistic: 10,
      estimatedMinutesLikely: 20,
      estimatedMinutesConservative: 30,
      verificationMethod: "independent_admin_review",
      acceptanceCriteria: ["The decision is supported by the declared input."],
      riskLevel: "low" as never,
      dependsOnOrder: [],
      humanOutputSchema: OUTPUT_SCHEMA,
      humanRequiredArtifactKinds: options?.requiredArtifactKinds ?? [],
    },
    select: { id: true },
  });
  const downstream = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 2,
      title: "Assemble the result",
      description: "Runs only from the accepted human result.",
      executor: "deterministic_code" as never,
      primitiveId: MACHINE_PRIMITIVE_ID,
      primitiveVersion: MACHINE_PRIMITIVE_VERSION,
      params: {},
      fixedMinutes: null,
      estimatedMinutesOptimistic: 1,
      estimatedMinutesLikely: 1,
      estimatedMinutesConservative: 1,
      verificationMethod: "schema_check",
      acceptanceCriteria: ["The accepted result was applied."],
      riskLevel: "low" as never,
      dependsOnOrder: [1],
      expectedCostMicrosAtQuote: 0n,
      maxCostMicrosPerAttemptAtQuote: 0n,
      maxAttemptsAtQuote: 1,
      automationCostPolicyVersion: "review-policy-v1",
    },
    select: { id: true },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "T039 review contract",
      description: "A frozen contract used only by the review integration proof.",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: 25_000n,
      automationCostPolicyVersion: "review-policy-v1",
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
      automatedStepCount: 1,
      humanStepCount: 1,
      unitsTotal: 1,
      unitsResolvedAutomatically: 0,
      runAutomationBudgetMicros: 25_000n,
      budgetPolicyVersion: "review-policy-v1",
      steps: {
        create: [
          {
            planStepId: cut.id,
            order: 1,
            executionMode: "human" as never,
            status: "handed_to_human" as never,
          },
          {
            planStepId: downstream.id,
            order: 2,
            primitiveId: MACHINE_PRIMITIVE_ID,
            primitiveVersion: MACHINE_PRIMITIVE_VERSION,
            executionMode: "automated" as never,
            status: "blocked_on_human_unit" as never,
          },
        ],
      },
    },
    select: {
      id: true,
      steps: { where: { order: 2 }, select: { id: true }, take: 1 },
    },
  });
  const definition = await prisma.humanWorkUnitDefinition.create({
    data: {
      planVersionId: planVersion.id,
      planStepId: cut.id,
      instructions: "Judge the record and return the frozen structured decision.",
      declaredInputs: [],
      outputSchema: OUTPUT_SCHEMA,
      requiredArtifactKinds: options?.requiredArtifactKinds ?? [],
      acceptanceCriteria: ["The decision is supported by the declared input."],
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
      revisionBound: options?.revisionBound ?? 2,
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
      remainingRevisions: options?.revisionBound ?? 2,
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
  return {
    worker,
    admin,
    task,
    runId: run.id,
    snapshotId: snapshot.id,
    unitId: unit.id,
    downstreamStepRunId: run.steps[0]!.id,
  };
}

async function submit(fixture: ReviewFixture, payload: unknown = FIRST_RESULT) {
  const outcome = await reviewRuntime.submitHumanUnitCandidate({
    taskId: fixture.task.id,
    actorId: fixture.worker.id,
    claimGeneration: 1,
    payload,
    fileIds: [],
  });
  expect(outcome).toMatchObject({ submitted: true, unitStateId: fixture.unitId });
  if (!outcome.submitted) throw new Error(`submission refused: ${outcome.cause}`);
  return outcome.candidateId;
}

/**
 * Fixture seam for T042's branches. T039 precedes both T041 and T042, so a
 * review-only case must not be hidden behind the missing submit runtime. This
 * writes the exact durable T5 outcome directly — candidate, submitted state
 * and audit in one transaction — just as US1 seeded the later acceptance row
 * before the real review gate existed. The end-to-end Scenario C case above
 * still uses the real submit runtime and prevents this seam from replacing it.
 */
async function seedSubmittedCandidate(
  fixture: ReviewFixture,
  payload: unknown = FIRST_RESULT
) {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.humanWorkUnitCandidate.create({
      data: {
        unitStateId: fixture.unitId,
        claimGeneration: 1,
        revisionIndex: 0,
        submittedById: fixture.worker.id,
        payload: payload as never,
      },
      select: { id: true },
    });
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: { id: fixture.unitId, state: "claimed", claimGeneration: 1 },
      data: {
        state: "submitted",
        submittedAt: new Date(),
        transitionSeq: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    const unit = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fixture.unitId },
      select: { transitionSeq: true },
    });
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: fixture.unitId,
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
    return candidate.id;
  });
}

async function seedRejectedDecision(fixture: ReviewFixture, candidateId: string) {
  return prisma.$transaction(async (tx) => {
    const decision = await tx.humanWorkUnitReviewDecision.create({
      data: {
        candidateId,
        unitStateId: fixture.unitId,
        decidedById: fixture.admin.id,
        outcome: "rejected" as never,
        revisionInstructions: "Add the missing explanation before resubmitting.",
        remainingRevisionsAfter: 1,
        claimGeneration: 1,
      },
    });
    await tx.humanWorkUnitCandidate.update({
      where: { id: candidateId },
      data: { status: "superseded" as never },
    });
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: { id: fixture.unitId, state: "submitted", remainingRevisions: 2 },
      data: {
        state: "revision_requested",
        remainingRevisions: { decrement: 1 },
        transitionSeq: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    const unit = await tx.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: fixture.unitId },
      select: { transitionSeq: true },
    });
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: fixture.unitId,
        seq: unit.transitionSeq,
        actorId: fixture.admin.id,
        actorRole: "admin" as never,
        fromState: "submitted" as never,
        toState: "revision_requested" as never,
        cause: "revision_requested",
        claimGeneration: 1,
        resumeGeneration: 0,
      },
    });
    return decision;
  });
}

async function attributableSpend(fixture: ReviewFixture) {
  const [runHolds, accountHolds, invocations] = await prisma.$transaction([
    prisma.workflowBudgetHold.count({ where: { runId: fixture.runId } }),
    prisma.accountProviderSpendHold.count({
      where: { operationKey: { contains: fixture.snapshotId } },
    }),
    prisma.taskToolInvocation.count({
      where: { stepRun: { runId: fixture.runId } },
    }),
  ]);
  return { runHolds, accountHolds, invocations };
}

async function expectStillBlockedAndUnspent(fixture: ReviewFixture) {
  expect(
    await prisma.taskWorkflowStepRun.findUniqueOrThrow({
      where: { id: fixture.downstreamStepRunId },
      select: { status: true, attempts: true, actualCostMicros: true },
    })
  ).toEqual({ status: "blocked_on_human_unit", attempts: 0, actualCostMicros: 0 });
  expect(await attributableSpend(fixture)).toEqual({
    runHolds: 0,
    accountHolds: 0,
    invocations: 0,
  });
}

describe("T039 — Scenario C: revision, resubmission, acceptance", () => {
  it("keeps the candidate non-authoritative, consumes one revision, then resumes one acceptance", async () => {
    const fixture = await claimedReviewUnit();
    const firstCandidateId = await submit(fixture);

    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true, remainingRevisions: true, claimedById: true },
      })
    ).toEqual({ state: "submitted", remainingRevisions: 2, claimedById: fixture.worker.id });
    await expectStillBlockedAndUnspent(fixture);

    expect(
      await reviewRuntime.openHumanUnitReview({
        taskId: fixture.task.id,
        actorId: fixture.admin.id,
      })
    ).toMatchObject({ opened: true, unitStateId: fixture.unitId });
    await expectStillBlockedAndUnspent(fixture);

    expect(
      await reviewRuntime.decideHumanUnitCandidate({
        candidateId: firstCandidateId,
        actorId: fixture.admin.id,
        outcome: "reject",
        revisionInstructions: "Explain the evidence behind the decision and resubmit.",
      })
    ).toEqual({ decided: true, unitStateId: fixture.unitId, state: "revision_requested" });

    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true, remainingRevisions: true, claimedById: true },
      })
    ).toEqual({
      state: "revision_requested",
      remainingRevisions: 1,
      claimedById: fixture.worker.id,
    });
    expect(
      await prisma.humanWorkUnitCandidate.findUniqueOrThrow({
        where: { id: firstCandidateId },
        select: { status: true, payload: true, submittedById: true },
      })
    ).toEqual({ status: "superseded", payload: FIRST_RESULT, submittedById: fixture.worker.id });
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: fixture.runId } })).toBe(
      0
    );
    await expectStillBlockedAndUnspent(fixture);

    const secondCandidateId = await submit(fixture, ACCEPTED_RESULT);
    expect(
      await prisma.humanWorkUnitCandidate.findMany({
        where: { unitStateId: fixture.unitId },
        orderBy: { revisionIndex: "asc" },
        select: { id: true, revisionIndex: true, status: true },
      })
    ).toEqual([
      { id: firstCandidateId, revisionIndex: 0, status: "superseded" },
      { id: secondCandidateId, revisionIndex: 1, status: "pending" },
    ]);
    await expectStillBlockedAndUnspent(fixture);

    expect(
      await reviewRuntime.decideHumanUnitCandidate({
        candidateId: secondCandidateId,
        actorId: fixture.admin.id,
        outcome: "accept",
      })
    ).toEqual({ decided: true, unitStateId: fixture.unitId, state: "accepted" });

    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true, remainingRevisions: true, acceptedAt: true },
      })
    ).toMatchObject({ state: "accepted", remainingRevisions: 1, acceptedAt: expect.any(Date) });
    expect(
      await prisma.humanWorkUnitAcceptance.findMany({
        where: { unitStateId: fixture.unitId },
        select: {
          candidateId: true,
          acceptedById: true,
          resultPayload: true,
          resultSha256: true,
        },
      })
    ).toEqual([
      {
        candidateId: secondCandidateId,
        acceptedById: fixture.admin.id,
        resultPayload: ACCEPTED_RESULT,
        resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);

    const resumes = await Promise.all([applyResume(fixture.unitId), applyResume(fixture.unitId)]);
    expect(resumes.filter((outcome) => outcome.resumed)).toHaveLength(1);
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: fixture.runId } })).toBe(
      1
    );
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: fixture.downstreamStepRunId },
        select: { status: true },
      })
    ).toEqual({ status: "pending" });
  });
});

describe("T039 — fail closed at the revision bound or for unsafe work", () => {
  it.each([
    {
      label: "the frozen revision bound is exhausted",
      revisionBound: 0,
      decisionCause: undefined,
      refusalCause: "revisions_exhausted",
      transitionCause: "exhausted:revisions",
    },
    {
      label: "the result is unsafe or unverifiable",
      revisionBound: 2,
      decisionCause: "unsafe_or_unverifiable" as const,
      refusalCause: "unsafe_or_unverifiable",
      transitionCause: "exhausted:unsafe",
    },
  ])("$label", async ({ revisionBound, decisionCause, refusalCause, transitionCause }) => {
    const fixture = await claimedReviewUnit({ revisionBound });
    const candidateId = await seedSubmittedCandidate(fixture);

    expect(
      await reviewRuntime.decideHumanUnitCandidate({
        candidateId,
        actorId: fixture.admin.id,
        outcome: "reject",
        ...(decisionCause ? { cause: decisionCause } : {}),
        revisionInstructions: "Do not use this result as an input.",
      })
    ).toEqual({ decided: true, unitStateId: fixture.unitId, state: "exhausted" });

    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true, refusalCause: true, claimedById: true },
      })
    ).toEqual({ state: "exhausted", refusalCause, claimedById: fixture.worker.id });
    expect(
      await prisma.humanWorkUnitCandidate.findUniqueOrThrow({
        where: { id: candidateId },
        select: { status: true },
      })
    ).toEqual({ status: "rejected" });
    expect(
      await prisma.humanWorkUnitReviewDecision.findUniqueOrThrow({
        where: { candidateId },
        select: { cause: true },
      })
    ).toEqual({ cause: refusalCause });
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: fixture.unitId, cause: transitionCause },
      })
    ).toBe(1);
    expect(
      await prisma.taskHumanWorkPackage.count({
        where: { runId: fixture.runId, taskId: fixture.task.id },
      })
    ).toBe(1);
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: fixture.runId },
        select: { status: true },
      })
    ).toEqual({ status: "awaiting_human" });
    expect(await prisma.humanWorkUnitAcceptance.count({ where: { unitStateId: fixture.unitId } })).toBe(
      0
    );
    await expectStillBlockedAndUnspent(fixture);
  });
});

describe("T039 — review refusals preserve the candidate and the first decision", () => {
  it("records the submitter attempting to open their own review", async () => {
    const fixture = await claimedReviewUnit();
    const candidateId = await seedSubmittedCandidate(fixture);

    expect(
      await reviewRuntime.openHumanUnitReview({
        taskId: fixture.task.id,
        actorId: fixture.worker.id,
      })
    ).toEqual({ opened: false, cause: "self_review" });

    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true },
      })
    ).toEqual({ state: "submitted" });
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: fixture.unitId, cause: "refused:self_review" },
      })
    ).toBe(1);
    expect(
      await prisma.taskEvent.count({
        where: {
          taskId: fixture.task.id,
          action: "human_unit_refused",
          meta: { path: ["cause"], equals: "refused:self_review" },
        },
      })
    ).toBe(1);
    expect(await prisma.humanWorkUnitReviewDecision.count({ where: { candidateId } })).toBe(0);
  });

  it("records the submitter attempting to accept their own candidate", async () => {
    const fixture = await claimedReviewUnit();
    const candidateId = await seedSubmittedCandidate(fixture);

    expect(
      await reviewRuntime.decideHumanUnitCandidate({
        candidateId,
        actorId: fixture.worker.id,
        outcome: "accept",
      })
    ).toEqual({ decided: false, cause: "self_review" });

    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true },
      })
    ).toEqual({ state: "submitted" });
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: fixture.unitId, cause: "refused:self_review" },
      })
    ).toBe(1);
    expect(
      await prisma.taskEvent.count({
        where: {
          taskId: fixture.task.id,
          action: "human_unit_refused",
          meta: { path: ["cause"], equals: "refused:self_review" },
        },
      })
    ).toBe(1);
    expect(await prisma.humanWorkUnitReviewDecision.count({ where: { candidateId } })).toBe(0);
    expect(await prisma.humanWorkUnitAcceptance.count({ where: { unitStateId: fixture.unitId } })).toBe(
      0
    );
  });

  it("refuses a second decision as duplicate and leaves the first byte-for-byte unmodified", async () => {
    const fixture = await claimedReviewUnit();
    const candidateId = await seedSubmittedCandidate(fixture);
    const first = await seedRejectedDecision(fixture, candidateId);

    expect(
      await reviewRuntime.decideHumanUnitCandidate({
        candidateId,
        actorId: (await createAdmin("duplicate")).id,
        outcome: "accept",
      })
    ).toEqual({ decided: false, cause: "duplicate" });

    expect(
      await prisma.humanWorkUnitReviewDecision.findUniqueOrThrow({ where: { candidateId } })
    ).toEqual(first);
    expect(await prisma.humanWorkUnitReviewDecision.count({ where: { candidateId } })).toBe(1);
    expect(await prisma.humanWorkUnitAcceptance.count({ where: { unitStateId: fixture.unitId } })).toBe(
      0
    );
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true, remainingRevisions: true },
      })
    ).toEqual({ state: "revision_requested", remainingRevisions: 1 });
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: fixture.unitId, cause: "refused:duplicate" },
      })
    ).toBe(1);
  });
});

describe("T039 — schema and declared-artifact refusals leave the work with its holder", () => {
  it.each([
    {
      label: "a required output field is missing",
      requiredArtifactKinds: [] as string[],
      payload: {},
      missing: "decision",
    },
    {
      label: "a required declared artifact is missing",
      requiredArtifactKinds: ["review_evidence"],
      payload: ACCEPTED_RESULT,
      missing: "review_evidence",
    },
  ])("$label", async ({ requiredArtifactKinds, payload, missing }) => {
    const fixture = await claimedReviewUnit({ requiredArtifactKinds });
    const outcome = await reviewRuntime.submitHumanUnitCandidate({
      taskId: fixture.task.id,
      actorId: fixture.worker.id,
      claimGeneration: 1,
      payload,
      fileIds: [],
    });

    expect(outcome).toMatchObject({
      submitted: false,
      cause: "schema_invalid",
      missing: expect.arrayContaining([missing]),
    });
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: fixture.unitId },
        select: { state: true, claimedById: true, claimGeneration: true },
      })
    ).toEqual({ state: "claimed", claimedById: fixture.worker.id, claimGeneration: 1 });
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: fixture.task.id },
        select: { status: true, claimedById: true },
      })
    ).toEqual({ status: "claimed", claimedById: fixture.worker.id });
    expect(await prisma.humanWorkUnitCandidate.count({ where: { unitStateId: fixture.unitId } })).toBe(
      0
    );
    expect(
      await prisma.humanWorkUnitTransition.count({ where: { unitStateId: fixture.unitId } })
    ).toBe(1);
    await expectStillBlockedAndUnspent(fixture);
  });
});
