import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { REGISTRY } from "@/lib/ai-work-engine/registry";
import { vaPoolSelect } from "@/lib/queries/tasks";
import { createTask, createWorker } from "./fixtures";

/**
 * T027 — THE MONEY DOES NOT MOVE.
 *
 * This is the integration proof for the accepted fixed-price human-unit path.
 * The amount shown before claim, held at claim, and recorded as owed after QC
 * must be the same integer. The admitted-run finisher is intentionally boring:
 * it closes the run and writes its audit event, atomically, and nothing else.
 */

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return {
    ...actual,
    requireApprovedVa: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return { ...actual, revalidatePath: vi.fn() };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

// The spy is load-bearing: an admitted run must never enter this function.
vi.mock("@/lib/ai-work-engine/residual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-work-engine/residual")>();
  return { ...actual, computeResidual: vi.fn(actual.computeResidual) };
});

const { requireApprovedVa, requireRole } = await import("@/lib/authz");
const { computeResidual } = await import("@/lib/ai-work-engine/residual");
const { claimTask, submitDeliverable } = await import("@/server/actions/va-tasks");
const { startWorkerSession } = await import("@/server/actions/work-sessions");
const { approveDeliverable } = await import("@/server/actions/admin-qc");
const { applyResume } = await import("@/server/human-unit-resume");
const { advanceWorkflow, finishAdmittedRun, finishRun } = await import("@/server/workflow-runs");

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

const nonce = randomUUID().replaceAll("-", "").slice(0, 10);
let seq = 0;
const uid = () => `hp${nonce}${(seq++).toString(36)}`;

async function createAdmin() {
  return prisma.user.create({
    data: {
      name: "Integration Admin",
      email: `admin-${uid()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
}

function asWorker(workerId: string) {
  vi.mocked(requireApprovedVa).mockResolvedValue({ id: workerId, role: "VA" } as never);
}

function asAdmin(adminId: string) {
  vi.mocked(requireRole).mockResolvedValue({ id: adminId, role: "ADMIN" } as never);
}

/**
 * An admitted run at the publication cut. Admission itself is deliberately a
 * fixture: T027 proves the money and finish boundary, not the compiler's
 * admission predicates (which have their own integration file).
 */
async function admittedPayoutRun() {
  const task = await createTask({
    status: "ai_processing",
    clientPriceCents: 10_000,
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "fixed-payout proof",
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
  const primitiveVersion = REGISTRY[primitiveId].version;
  const producer = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
      order: 1,
      title: "produce",
      description: "produce",
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

  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "fixed-payout proof",
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
      status: "running" as never,
      automatedStepCount: 2,
      humanStepCount: 1,
      steps: {
        create: [
          {
            planStepId: producer.id,
            order: 1,
            primitiveId,
            primitiveVersion,
            executionMode: "automated" as never,
            status: "done" as never,
          },
          {
            planStepId: cut.id,
            order: 2,
            executionMode: "human" as never,
            status: "handed_to_human" as never,
          },
          {
            planStepId: downstream.id,
            order: 3,
            primitiveId,
            primitiveVersion,
            executionMode: "automated" as never,
            status: "blocked_on_human_unit" as never,
          },
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
  const unit = await prisma.humanWorkUnitRunState.create({
    data: {
      runId: run.id,
      taskId: task.id,
      snapshotId: snapshot.id,
      definitionId: definition.id,
      cutOrder: 2,
      state: "admitted" as never,
      remainingRevisions: 2,
      transitionSeq: 1,
    },
    select: { id: true },
  });
  await prisma.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: 1,
      actorRole: "system" as never,
      toState: "admitted" as never,
      cause: "admitted",
      claimGeneration: 0,
      resumeGeneration: 0,
    },
  });
  await prisma.payment.create({
    data: {
      taskId: task.id,
      amountCents: 10_000,
      currency: "USD",
      method: "card" as never,
      status: "authorized" as never,
    },
  });

  return { task, run, unit, definition };
}

/** Seed only the review decision, then use the real crash-safe resume path. */
async function acceptAndResume(input: {
  runId: string;
  unitId: string;
  definitionId: string;
  workerId: string;
  adminId: string;
}) {
  const before = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
    where: { id: input.unitId },
    select: { state: true, claimGeneration: true, transitionSeq: true },
  });
  expect(before.state).toBe("claimed");

  const candidate = await prisma.humanWorkUnitCandidate.create({
    data: {
      unitStateId: input.unitId,
      claimGeneration: before.claimGeneration,
      revisionIndex: 0,
      submittedById: input.workerId,
      payload: { summary: "accepted" },
      status: "accepted" as never,
    },
    select: { id: true },
  });
  const decision = await prisma.humanWorkUnitReviewDecision.create({
    data: {
      candidateId: candidate.id,
      unitStateId: input.unitId,
      decidedById: input.adminId,
      outcome: "accepted" as never,
      remainingRevisionsAfter: 2,
      claimGeneration: before.claimGeneration,
    },
    select: { id: true },
  });
  await prisma.humanWorkUnitAcceptance.create({
    data: {
      unitStateId: input.unitId,
      candidateId: candidate.id,
      decisionId: decision.id,
      acceptedById: input.adminId,
      claimGenerationAtAcceptance: before.claimGeneration,
      resultPayload: { summary: "accepted" },
      resultSha256: "0".repeat(64),
      dataClass: "business_confidential",
      criteriaVersionRef: input.definitionId,
    },
  });
  const accepted = await prisma.humanWorkUnitRunState.updateMany({
    where: {
      id: input.unitId,
      state: "claimed" as never,
      claimGeneration: before.claimGeneration,
      transitionSeq: before.transitionSeq,
    },
    data: {
      state: "accepted" as never,
      acceptedAt: new Date(),
      transitionSeq: { increment: 1 },
    },
  });
  expect(accepted.count).toBe(1);
  await prisma.humanWorkUnitTransition.create({
    data: {
      unitStateId: input.unitId,
      seq: before.transitionSeq + 1,
      actorId: input.adminId,
      actorRole: "admin" as never,
      fromState: "claimed" as never,
      toState: "accepted" as never,
      cause: "accepted",
      claimGeneration: before.claimGeneration,
      resumeGeneration: 0,
    },
  });

  const resumed = await applyResume(input.unitId);
  expect(resumed.resumed).toBe(true);
  await prisma.taskWorkflowStepRun.updateMany({
    where: { runId: input.runId },
    data: { status: "done" as never, finishedAt: new Date() },
  });
}

beforeEach(() => {
  vi.mocked(computeResidual).mockClear();
  vi.mocked(requireApprovedVa).mockReset();
  vi.mocked(requireRole).mockReset();
});

describe("T027/T037 — fixed payout and admitted-run finish", () => {
  it("shows, claims, and pays one worker the same fixed amount with zero drift", async () => {
    const worker = await createWorker();
    const admin = await createAdmin();
    const { task, run, unit, definition } = await admittedPayoutRun();
    await advanceWorkflow(task.id);
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { state: true },
      })
    ).toEqual({ state: "published" });

    const poolView = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: vaPoolSelect,
    });
    expect(poolView.vaPayoutCents).toBe(4_000);
    expect(poolView.estimatedMinutes).toBe(60);

    asWorker(worker.id);
    const claim = await claimTask(task.id);
    expect(claim.ok, !claim.ok ? claim.error : "claim must succeed").toBe(true);
    const atClaim = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, claimedById: true, vaPayoutCents: true, estimatedMinutes: true },
    });
    expect(atClaim).toMatchObject({
      status: "claimed",
      claimedById: worker.id,
      vaPayoutCents: poolView.vaPayoutCents,
      estimatedMinutes: poolView.estimatedMinutes,
    });

    await acceptAndResume({
      runId: run.id,
      unitId: unit.id,
      definitionId: definition.id,
      workerId: worker.id,
      adminId: admin.id,
    });
    await finishAdmittedRun(run.id);

    expect(computeResidual, "the residual money path is forbidden for admitted runs").not.toHaveBeenCalled();
    expect(
      await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } }),
      "the fixed unit never creates the ordinary residual package"
    ).toBe(0);
    const afterFinish = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, claimedById: true, vaPayoutCents: true, estimatedMinutes: true },
    });
    expect(afterFinish).toEqual(atClaim);
    expect(
      await prisma.taskEvent.count({
        where: { taskId: task.id, action: "human_unit_run_finished" },
      })
    ).toBe(1);

    asWorker(worker.id);
    expect((await startWorkerSession(task.id)).ok).toBe(true);
    const submitted = await submitDeliverable({ taskId: task.id, note: "Completed fixed unit." });
    expect(submitted.ok, !submitted.ok ? submitted.error : "submission must succeed").toBe(true);
    const submission = await prisma.submission.findFirstOrThrow({
      where: { taskId: task.id, vaId: worker.id, qcStatus: "pending" },
      select: { id: true },
    });

    asAdmin(admin.id);
    const approved = await approveDeliverable({
      submissionId: submission.id,
      rating: 5,
      identityVerified: true,
    });
    expect(approved.ok, !approved.ok ? approved.error : "approval must succeed").toBe(true);

    const completed = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, claimedById: true, vaPayoutCents: true, estimatedMinutes: true },
    });
    expect(completed).toMatchObject({
      status: "completed",
      claimedById: worker.id,
      vaPayoutCents: poolView.vaPayoutCents,
      estimatedMinutes: poolView.estimatedMinutes,
    });
    const payouts = await prisma.payout.findMany({
      where: { taskId: task.id },
      select: { vaId: true, amountCents: true, status: true },
    });
    expect(payouts).toEqual([{ vaId: worker.id, amountCents: poolView.vaPayoutCents, status: "owed" }]);
  });

  it("rolls the run back if its finish audit cannot be written", async () => {
    const { task, run } = await admittedPayoutRun();
    const trigger = `it_reject_finish_audit_${uid()}`;
    const fn = `${trigger}_fn`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."action" = 'human_unit_run_finished' THEN
          RAISE EXCEPTION 'forced finish audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${trigger}"
      BEFORE INSERT ON "TaskEvent"
      FOR EACH ROW EXECUTE FUNCTION "${fn}"()
    `);

    try {
      await expect(finishAdmittedRun(run.id)).rejects.toThrow(/forced finish audit failure/i);
      const after = await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true, finishedAt: true },
      });
      expect(after).toEqual({ status: "running", finishedAt: null });
      expect(
        await prisma.taskEvent.count({
          where: { taskId: task.id, action: "human_unit_run_finished" },
        })
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "TaskEvent"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });

  it("converges two finish attempts on one run update and one audit event", async () => {
    const { task, run } = await admittedPayoutRun();
    await Promise.all([finishAdmittedRun(run.id), finishAdmittedRun(run.id)]);

    const after = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, finishedAt: true },
    });
    expect(after.status).toBe("done");
    expect(after.finishedAt).not.toBeNull();
    expect(
      await prisma.taskEvent.count({
        where: { taskId: task.id, action: "human_unit_run_finished" },
      })
    ).toBe(1);
  });

  it("ordinary finishRun refuses an admitted run before residual computation", async () => {
    const { task, run } = await admittedPayoutRun();
    const before = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, vaPayoutCents: true, estimatedMinutes: true },
    });

    await finishRun(run.id);

    expect(computeResidual).not.toHaveBeenCalled();
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        select: { status: true, vaPayoutCents: true, estimatedMinutes: true },
      })
    ).toEqual(before);
    expect(await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true },
      })
    ).toEqual({ status: "running" });
  });
});
