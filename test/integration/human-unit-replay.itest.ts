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
