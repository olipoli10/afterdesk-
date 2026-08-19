import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { bindClaimToHumanUnit, decideHumanUnitCandidate, openHumanUnitReview, publishHumanWorkUnit, submitHumanUnitCandidate } from "@/server/human-unit";
import { compileWorkflowForTask, finishRun } from "@/server/workflow-runs";
import { createTask, createWorker } from "./fixtures";

const rollout = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings")>();
  return {
    ...actual,
    getSettings: async () => ({
      ...actual.DEFAULT_SETTINGS,
      humanWorkUnitResumeEnabled: rollout.enabled,
    }),
  };
});
vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireRole: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
const { requireRole } = await import("@/lib/authz");
const { cancelTask } = await import("@/server/actions/admin");

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rows", "unitsTotal", "requestedFields"],
  properties: {
    rows: { type: "array", items: { type: "string" } },
    unitsTotal: { type: "number" },
    requestedFields: { type: "array", items: { type: "string" } },
  },
};
const candidatePayload = { rows: [], unitsTotal: 0, requestedFields: [] };

async function createAdmin() {
  return prisma.user.create({
    data: {
      name: "Rollout Admin",
      email: `rollout-admin-${Date.now()}-${Math.random()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
}

async function setFlag(enabled: boolean) {
  rollout.enabled = enabled;
  await prisma.setting.upsert({
    where: { key: "humanWorkUnitResumeEnabled" },
    create: { key: "humanWorkUnitResumeEnabled", value: enabled },
    update: { value: enabled },
  });
}

async function supportedTask() {
  const task = await createTask({
    status: "ai_processing",
    clientPriceCents: 100_000,
    vaPayoutCents: 50_000,
    estimatedMinutes: 120,
  });
  await prisma.payment.create({
    data: {
      taskId: task.id,
      amountCents: 100_000,
      currency: "USD",
      method: "card",
      status: "authorized",
    },
  });
  const version = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "Supported rollout fixture",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 50_000,
      internalCostConservativeCents: 60_000,
      suggestedPriceCents: 100_000,
      suggestedVaPayoutCents: 50_000,
      calibration: "calibrated",
      automationSpendCeilingMicros: 0n,
      automationCostPolicyVersion: "hwu-rollout-v1",
      dataClass: "business_confidential",
      dataClassSignals: ["rollout fixture"],
    },
    select: { id: true },
  });
  const base = {
    planVersionId: version.id,
    estimatedMinutesOptimistic: 10,
    estimatedMinutesLikely: 20,
    estimatedMinutesConservative: 30,
    automationCostPolicyVersion: "hwu-rollout-v1",
    verificationMethod: "operator review",
    acceptanceCriteria: ["Matches the accepted contract"],
    riskLevel: "low" as const,
  };
  await prisma.taskExecutionPlanStep.create({
    data: {
      ...base,
      order: 1,
      title: "Human cut",
      description: "Complete the frozen human unit",
      executor: "human",
      humanRole: "worker",
      dependsOnOrder: [],
      params: {},
      fixedMinutes: 30,
      humanOutputSchema: outputSchema,
      humanRequiredArtifactKinds: [],
    },
  });
  await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: version.id,
      clientPriceCents: 100_000,
      currency: "USD",
      title: "Supported rollout fixture",
      description: "Frozen accepted contract",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      automationSpendCeilingMicros: 0n,
      automationCostPolicyVersion: "hwu-rollout-v1",
      dataClass: "business_confidential",
    },
  });
  return task;
}

async function compileSupported() {
  const task = await supportedTask();
  const compiled = await compileWorkflowForTask(task.id);
  expect(compiled).not.toBeNull();
  const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
    where: { taskId: task.id },
    select: { id: true, humanWorkUnit: { select: { id: true, state: true } } },
  });
  return { task, run };
}

describe("T047 — rollout admission is prospective and disable-midflight is structural", () => {
  it("flag off preserves the historical residual package and enabling later never backfills the run", async () => {
    await setFlag(false);
    const { task, run } = await compileSupported();
    expect(run.humanWorkUnit).toBeNull();
    await finishRun(run.id);
    const historical = {
      task: await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { status: true } }),
      packages: await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } }),
      units: await prisma.humanWorkUnitRunState.count({ where: { runId: run.id } }),
    };
    expect(historical).toEqual({ task: { status: "open" }, packages: 1, units: 0 });

    await setFlag(true);
    await compileWorkflowForTask(task.id);
    expect(await prisma.humanWorkUnitRunState.count({ where: { runId: run.id } })).toBe(0);
    expect(await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } })).toBe(1);
  });

  it("enabling admits only a newly compiled mandate", async () => {
    await setFlag(true);
    const { run } = await compileSupported();
    expect(run.humanWorkUnit).toMatchObject({ state: "admitted" });
  });

  it("disabling while a worker holds and submits the unit does not gate review or acceptance", async () => {
    await setFlag(true);
    const { task, run } = await compileSupported();
    expect(run.humanWorkUnit).not.toBeNull();
    expect((await publishHumanWorkUnit(run.id)).published).toBe(true);
    const worker = await createWorker();
    const admin = await createAdmin();
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: { status: "claimed", claimedById: worker.id },
      });
      await bindClaimToHumanUnit(tx, { taskId: task.id, workerId: worker.id });
    });
    const unit = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { id: true, claimGeneration: true },
    });
    await setFlag(false);
    const submitted = await submitHumanUnitCandidate({
      taskId: task.id,
      actorId: worker.id,
      claimGeneration: unit.claimGeneration,
      payload: candidatePayload,
      fileIds: [],
    });
    expect(submitted.submitted).toBe(true);
    if (!submitted.submitted) return;
    expect((await openHumanUnitReview({ taskId: task.id, actorId: admin.id })).opened).toBe(true);
    const accepted = await decideHumanUnitCandidate({
      candidateId: submitted.candidateId,
      actorId: admin.id,
      outcome: "accept",
    });
    expect(accepted.decided).toBe(true);
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { state: true, acceptance: { select: { id: true } } },
      })
    ).toEqual({ state: "accepted", acceptance: { id: expect.any(String) } });

    const later = await supportedTask();
    await compileWorkflowForTask(later.id);
    expect(await prisma.humanWorkUnitRunState.count({ where: { taskId: later.id } })).toBe(0);
  });

  it("with migrations kept and the flag off, the ordinary admin cancellation path resolves an admitted wait", async () => {
    await setFlag(true);
    const { task, run } = await compileSupported();
    expect((await publishHumanWorkUnit(run.id)).published).toBe(true);
    await setFlag(false);
    await prisma.payment.updateMany({
      where: { taskId: task.id },
      data: { status: "cancelled" },
    });
    const admin = await createAdmin();
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);
    const result = await cancelTask({
      taskId: task.id,
      reason: "Rollback-safe admin resolution",
      clientMessage: "This run was closed safely.",
      lostReasonCategory: "other",
    });
    expect(result).toEqual({ ok: true });
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { taskId: task.id },
        select: { state: true, refusalCause: true },
      })
    ).toEqual({ state: "withdrawn", refusalCause: "lifecycle_exit" });
  });
});
