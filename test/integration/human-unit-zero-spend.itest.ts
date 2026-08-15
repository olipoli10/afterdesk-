import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTask, createWorker } from "./fixtures";

const { providerClientConstructions } = vi.hoisted(() => ({
  providerClientConstructions: vi.fn(),
}));

/**
 * A provider import is harmless; constructing its client is the boundary this
 * spec forbids while a person owns the run. The fake has no usable API on
 * purpose: reaching it would be a product defect, not a synthetic provider
 * execution to accommodate.
 */
vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicWaitingStateSentinel {
    messages = { create: vi.fn() };

    constructor() {
      providerClientConstructions();
    }
  },
}));

const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
const { advanceWorkflow } = await import("@/server/workflow-runs");

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

const WAITING_STATES = [
  "published",
  "claimed",
  "submitted",
  "in_review",
  "revision_requested",
] as const;

type WaitingState = (typeof WAITING_STATES)[number];

/**
 * One accepted run with a billable provider step immediately behind the human
 * cut. The fixture starts in the real persisted shape: run awaiting the unit,
 * downstream step blocked. Each test later makes both rows look runnable to
 * prove the unit state itself remains a second, fail-closed barrier.
 */
async function waitingRun(state: WaitingState) {
  const worker = state === "published" ? null : await createWorker();
  const task = await createTask({
    status: state === "published" ? "open" : "claimed",
    claimedById: worker?.id ?? null,
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "zero-spend waiting-state proof",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 4_000,
      calibration: "calibrated" as never,
      expectedAutomationCostMicros: 1_000n,
      conservativeAutomationCostMicros: 1_000n,
      automationSpendCeilingMicros: 2_000n,
      automationCostPolicyVersion: "zero-spend-proof-v1",
      dataClass: "public",
      dataClassSignals: ["integration fixture"],
    },
    select: { id: true },
  });

  const makeStep = (input: {
    order: number;
    executor: "ai" | "human";
    primitiveId: string | null;
    primitiveVersion: number | null;
    dependsOnOrder: number[];
  }) =>
    prisma.taskExecutionPlanStep.create({
      data: {
        planVersionId: planVersion.id,
        order: input.order,
        title: `waiting step ${input.order}`,
        description: `waiting step ${input.order}`,
        executor: input.executor as never,
        humanRole: input.executor === "human" ? ("worker" as never) : null,
        primitiveId: input.primitiveId,
        primitiveVersion: input.primitiveVersion,
        params: {},
        fixedMinutes: input.executor === "human" ? 30 : null,
        estimatedMinutesOptimistic: 10,
        estimatedMinutesLikely: 20,
        estimatedMinutesConservative: 30,
        expectedCostMicrosAtQuote: input.primitiveId === null ? null : 1_000n,
        maxCostMicrosPerAttemptAtQuote: input.primitiveId === null ? null : 1_000n,
        maxAttemptsAtQuote: input.primitiveId === null ? null : 1,
        automationCostPolicyVersion: "zero-spend-proof-v1",
        verificationMethod: "sample_check",
        acceptanceCriteria: ["ok"],
        riskLevel: "low" as never,
        dependsOnOrder: input.dependsOnOrder,
        humanOutputSchema: input.executor === "human" ? OUTPUT_SCHEMA : undefined,
        humanRequiredArtifactKinds: [],
      },
      select: { id: true },
    });

  const producer = await makeStep({
    order: 1,
    executor: "ai",
    primitiveId: "normalize.contact_fields",
    primitiveVersion: REGISTRY["normalize.contact_fields"].version,
    dependsOnOrder: [],
  });
  const cut = await makeStep({
    order: 2,
    executor: "human",
    primitiveId: null,
    primitiveVersion: null,
    dependsOnOrder: [1],
  });
  const downstream = await makeStep({
    order: 3,
    executor: "ai",
    primitiveId: "research.web_search",
    primitiveVersion: REGISTRY["research.web_search"].version,
    dependsOnOrder: [2],
  });

  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "zero-spend waiting-state proof",
      description: "accepted contract",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      expectedAutomationCostMicros: 1_000n,
      conservativeAutomationCostMicros: 1_000n,
      automationSpendCeilingMicros: 2_000n,
      automationCostPolicyVersion: "zero-spend-proof-v1",
      dataClass: "public",
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: planVersion.id,
      status: "awaiting_human_unit" as never,
      automatedStepCount: 2,
      humanStepCount: 1,
      steps: {
        create: [
          {
            planStepId: producer.id,
            order: 1,
            primitiveId: "normalize.contact_fields",
            primitiveVersion: REGISTRY["normalize.contact_fields"].version,
            executionMode: "automated" as never,
            status: "done" as never,
          },
          {
            planStepId: cut.id,
            order: 2,
            executionMode: "human" as never,
            status: "handed_to_human" as never,
            handoffReason: "Human step",
          },
          {
            planStepId: downstream.id,
            order: 3,
            primitiveId: "research.web_search",
            primitiveVersion: REGISTRY["research.web_search"].version,
            executionMode: "automated" as never,
            status: "blocked_on_human_unit" as never,
          },
        ],
      },
    },
    select: { id: true },
  });
  const downstreamRun = await prisma.taskWorkflowStepRun.findUniqueOrThrow({
    where: { runId_order: { runId: run.id, order: 3 } },
    select: { id: true },
  });
  const definition = await prisma.humanWorkUnitDefinition.create({
    data: {
      planVersionId: planVersion.id,
      planStepId: cut.id,
      instructions: "Complete the accepted human step.",
      declaredInputs: [],
      outputSchema: OUTPUT_SCHEMA,
      requiredArtifactKinds: [],
      acceptanceCriteria: ["ok"],
      verificationMethod: "sample_check",
      eligibility: {},
      reviewerAuthority: "admin",
      expectedMinutes: 30,
      revisionBound: 2,
      publicationDeadlineHours: 72,
      submissionDeadlineHours: 72,
      claimLeaseHours: 72,
      economicProvenance: {},
      dataClass: "public",
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
      cutOrder: 2,
      state: state as never,
      remainingRevisions: state === "revision_requested" ? 1 : 2,
      claimedById: worker?.id ?? null,
      claimGeneration: worker === null ? 0 : 1,
      claimedAt: worker === null ? null : now,
      publishedAt: now,
      publicationDeadlineAt: new Date(now.getTime() + 72 * 60 * 60 * 1_000),
      claimLeaseExpiresAt:
        worker === null ? null : new Date(now.getTime() + 72 * 60 * 60 * 1_000),
      submissionDeadlineAt:
        worker === null ? null : new Date(now.getTime() + 72 * 60 * 60 * 1_000),
      submittedAt:
        state === "submitted" || state === "in_review" || state === "revision_requested"
          ? now
          : null,
    },
    select: { id: true },
  });

  return {
    state,
    taskId: task.id,
    runId: run.id,
    snapshotId: snapshot.id,
    unitId: unit.id,
    downstreamStepRunId: downstreamRun.id,
  };
}

async function attributableSpend(fixture: Awaited<ReturnType<typeof waitingRun>>) {
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

beforeEach(() => {
  providerClientConstructions.mockClear();
});

describe("T026 — every Human Work Unit waiting state is provider-quiescent", () => {
  it("proves the provider-construction sentinel can observe a construction", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    new Anthropic({});
    expect(providerClientConstructions).toHaveBeenCalledOnce();
  });

  it.each(WAITING_STATES)(
    "%s creates no hold, invocation, settlement or provider client",
    async (state) => {
      const fixture = await waitingRun(state);
      expect(REGISTRY["research.web_search"].billable).toBe(true);
      expect(
        await prisma.taskWorkflowStepRun.findUniqueOrThrow({
          where: { id: fixture.downstreamStepRunId },
          select: { status: true, attempts: true },
        })
      ).toEqual({ status: "blocked_on_human_unit", attempts: 0 });

      // The real persisted waiting shape returns before the claim loop.
      expect(await advanceWorkflow(fixture.taskId)).toEqual({ steps: 0, finished: false });

      /**
       * Adversarial stale shape: even if the outer run and provider step both
       * look runnable, a non-resumed unit must remain the authority. This makes
       * the lifecycle guard observable rather than merely counting empty rows
       * behind an `awaiting_human_unit` early return.
       */
      await prisma.$transaction([
        prisma.taskWorkflowRun.update({
          where: { id: fixture.runId },
          data: { status: "running" as never },
        }),
        prisma.taskWorkflowStepRun.update({
          where: { id: fixture.downstreamStepRunId },
          data: { status: "pending" as never },
        }),
      ]);
      expect(await advanceWorkflow(fixture.taskId)).toEqual({ steps: 0, finished: false });
      expect(
        await prisma.taskWorkflowStepRun.findUniqueOrThrow({
          where: { id: fixture.downstreamStepRunId },
          select: { status: true, attempts: true, actualCostMicros: true },
        })
      ).toEqual({ status: "pending", attempts: 0, actualCostMicros: 0 });

      // INV-15 is a real PostgreSQL boundary, not an application pre-check.
      await expect(
        prisma.workflowBudgetHold.create({
          data: {
            runId: fixture.runId,
            stepRunId: fixture.downstreamStepRunId,
            operationKey: `research:${fixture.snapshotId}:3`,
            attempt: 1,
            amountMicros: 1_000n,
          },
        })
      ).rejects.toThrow(/still waiting|no provider reservation/i);

      expect(await attributableSpend(fixture)).toEqual({
        runHolds: 0,
        accountHolds: 0,
        invocations: 0,
      });
      expect(providerClientConstructions).not.toHaveBeenCalled();
      expect(
        await prisma.humanWorkUnitRunState.findUniqueOrThrow({
          where: { id: fixture.unitId },
          select: { state: true },
        })
      ).toEqual({ state });
    }
  );
});
