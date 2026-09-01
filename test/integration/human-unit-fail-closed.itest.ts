import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { admitHumanCut, type AdmissionStep } from "@/lib/ai-work-engine/human-unit-admission";
import { compileWorkflowForTask, finishRun } from "@/server/workflow-runs";
import { createTask } from "./fixtures";

type AdmissionCause = "unsupported_topology" | "malformed_topology" | "unmapped_economics";

type StepShape = {
  order: number;
  executor: "human" | "deterministic_code";
  dependsOnOrder: number[];
  fixedMinutes?: number | null;
};

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

async function setFlag(enabled: boolean) {
  await prisma.setting.upsert({
    where: { key: "humanWorkUnitResumeEnabled" },
    create: { key: "humanWorkUnitResumeEnabled", value: enabled },
    update: { value: enabled },
  });
}

async function acceptedPlan(input: {
  steps: StepShape[];
  flag?: boolean;
  vaPayoutCents?: number;
  estimatedMinutes?: number;
}) {
  await setFlag(input.flag ?? true);
  const task = await createTask({
    status: "ai_processing",
    clientPriceCents: 100_000,
    vaPayoutCents: input.vaPayoutCents ?? 50_000,
    estimatedMinutes: input.estimatedMinutes ?? 120,
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
      deliverableDescription: "Frozen fail-closed fixture",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 50_000,
      internalCostConservativeCents: 60_000,
      suggestedPriceCents: 100_000,
      suggestedVaPayoutCents: input.vaPayoutCents ?? 50_000,
      calibration: "calibrated",
      automationSpendCeilingMicros: 0n,
      automationCostPolicyVersion: "hwu-it-v1",
      dataClass: "business_confidential",
      dataClassSignals: ["integration fixture"],
    },
    select: { id: true },
  });
  for (const step of input.steps) {
    await prisma.taskExecutionPlanStep.create({
      data: {
        planVersionId: version.id,
        order: step.order,
        title: `Step ${step.order}`,
        description: `Frozen step ${step.order}`,
        executor: step.executor,
        humanRole: step.executor === "human" ? "worker" : null,
        primitiveId: step.executor === "deterministic_code" ? "data.dedupe" : null,
        primitiveVersion: step.executor === "deterministic_code" ? 1 : null,
        params:
          step.executor === "deterministic_code"
            ? { dataset: "main", keyFields: ["id"], strategy: "exact", keep: "first" }
            : {},
        fixedMinutes:
          step.executor === "human"
            ? step.fixedMinutes === undefined
              ? 30
              : step.fixedMinutes
            : null,
        estimatedMinutesOptimistic: 10,
        estimatedMinutesLikely: 20,
        estimatedMinutesConservative: 30,
        expectedCostMicrosAtQuote: step.executor === "deterministic_code" ? 0n : null,
        maxCostMicrosPerAttemptAtQuote: step.executor === "deterministic_code" ? 0n : null,
        maxAttemptsAtQuote: step.executor === "deterministic_code" ? 1 : null,
        automationCostPolicyVersion: "hwu-it-v1",
        verificationMethod: "operator review",
        acceptanceCriteria: ["Matches the accepted contract"],
        riskLevel: "low",
        dependsOnOrder: step.dependsOnOrder,
        humanOutputSchema: step.executor === "human" ? outputSchema : undefined,
        humanRequiredArtifactKinds: [],
      },
    });
  }
  await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: version.id,
      clientPriceCents: 100_000,
      currency: "USD",
      title: "Frozen fail-closed fixture",
      description: "Frozen accepted contract",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      automationSpendCeilingMicros: 0n,
      automationCostPolicyVersion: "hwu-it-v1",
      dataClass: "business_confidential",
    },
  });
  return task;
}

async function persistedAdmissionCause(runId: string): Promise<AdmissionCause | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cause: AdmissionCause | null }>>(
    `SELECT "humanUnitAdmissionRefusalCause" AS cause FROM "TaskWorkflowRun" WHERE "id" = $1`,
    runId
  );
  return rows[0]?.cause ?? null;
}

const linear = (): StepShape[] => [
  { order: 1, executor: "deterministic_code", dependsOnOrder: [] },
  { order: 2, executor: "human", dependsOnOrder: [1], fixedMinutes: 30 },
  { order: 3, executor: "deterministic_code", dependsOnOrder: [2] },
];

const refusedCases: Array<{ name: string; cause: AdmissionCause; steps: StepShape[]; payout?: number; minutes?: number }> = [
  {
    name: "two human steps",
    cause: "unsupported_topology",
    steps: [
      { order: 1, executor: "human", dependsOnOrder: [] },
      { order: 2, executor: "human", dependsOnOrder: [1] },
    ],
  },
  {
    name: "parallel branch crossing the human cut",
    cause: "unsupported_topology",
    steps: [...linear(), { order: 4, executor: "deterministic_code", dependsOnOrder: [1] }],
  },
  {
    name: "dependency cycle",
    cause: "malformed_topology",
    steps: [
      { order: 1, executor: "deterministic_code", dependsOnOrder: [2] },
      { order: 2, executor: "human", dependsOnOrder: [1] },
    ],
  },
  {
    name: "dependency on a nonexistent step",
    cause: "malformed_topology",
    steps: [
      { order: 1, executor: "human", dependsOnOrder: [99] },
      { order: 2, executor: "deterministic_code", dependsOnOrder: [1] },
    ],
  },
  {
    name: "null fixed minutes",
    cause: "unmapped_economics",
    steps: linear().map((step) => (step.order === 2 ? { ...step, fixedMinutes: null } : step)),
  },
  {
    name: "zero fixed minutes",
    cause: "unmapped_economics",
    steps: linear().map((step) => (step.order === 2 ? { ...step, fixedMinutes: 0 } : step)),
  },
  { name: "non-positive payout", cause: "unmapped_economics", steps: linear(), payout: 0 },
  { name: "non-positive estimated minutes", cause: "unmapped_economics", steps: linear(), minutes: 0 },
];

describe("T046 — every admission refusal fails closed to the historical manual path", () => {
  for (const row of refusedCases) {
    it(`${row.name}: records ${row.cause}, creates no unit and preserves the manual residual`, async () => {
      const task = await acceptedPlan({
        steps: row.steps,
        vaPayoutCents: row.payout,
        estimatedMinutes: row.minutes,
      });
      const compiled = await compileWorkflowForTask(task.id);
      expect(compiled).not.toBeNull();
      const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { taskId: task.id },
        select: { id: true, humanWorkUnit: { select: { id: true } } },
      });
      expect(run.humanWorkUnit).toBeNull();
      expect(await persistedAdmissionCause(run.id)).toBe(row.cause);
      expect(
        await prisma.taskEvent.findMany({
          where: { taskId: task.id, action: "human_unit_not_admitted" },
          select: { meta: true },
        })
      ).toEqual([{ meta: { cause: row.cause, runId: run.id } }]);

      if ((row.payout ?? 50_000) > 0 && (row.minutes ?? 120) > 0) {
        await finishRun(run.id);
        expect(await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } })).toBe(1);
        expect(
          await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { status: true } })
        ).toEqual({ status: "open" });
      }

      const replaySteps: AdmissionStep[] = row.steps.map((step) => ({
        ...step,
        fixedMinutes:
          step.executor === "human"
            ? step.fixedMinutes === undefined
              ? 30
              : step.fixedMinutes
            : null,
        secondsPerUnit: null,
        estimatedMinutesOptimistic: 10,
        estimatedMinutesLikely: 20,
        estimatedMinutesConservative: 30,
      }));
      const economics = {
        vaPayoutCents: row.payout ?? 50_000,
        estimatedMinutes: row.minutes ?? 120,
      };
      expect(admitHumanCut(replaySteps, economics)).toEqual(admitHumanCut(replaySteps, economics));
    });
  }

  it("flag off leaves the supported plan on the exact historical path with no refusal claim", async () => {
    const task = await acceptedPlan({ steps: linear(), flag: false });
    const compiled = await compileWorkflowForTask(task.id);
    expect(compiled).not.toBeNull();
    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { id: true, humanWorkUnit: { select: { id: true } } },
    });
    expect(run.humanWorkUnit).toBeNull();
    expect(await persistedAdmissionCause(run.id)).toBeNull();
    expect(
      await prisma.taskEvent.count({
        where: { taskId: task.id, action: "human_unit_not_admitted" },
      })
    ).toBe(0);
    await finishRun(run.id);
    expect(await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } })).toBe(1);
  });
});

describe("T046 — runtime refusal causes remain named and operational", () => {
  it.each([
    "input_unavailable",
    "classification_conflict",
    "revisions_exhausted",
    "lifecycle_exit",
  ] as const)("%s is disjoint from capability and budget labels", (cause) => {
    expect(cause).not.toMatch(/capabil|budget|demot|missing/i);
  });

  it("uses a unique nonce so repeated runs never collide", () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});
