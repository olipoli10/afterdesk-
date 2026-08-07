import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  releaseHold,
  reserveSpend,
  settleHold,
  unresolvedHoldMicros,
} from "@/server/workflow-budget";
import { createClient, createTask } from "./fixtures";

/**
 * The acceptance snapshot is IMMUTABLE by an existing trigger
 * (TaskAcceptanceSnapshot_no_update_or_delete), which is the correct product
 * behaviour: a signed contract is not edited. So the fixture builds the plan
 * FIRST and creates the snapshot already pointing at it, exactly as the real
 * acceptance path does inside one transaction.
 */
async function acceptedContract(input?: {
  ceiling?: bigint | null;
  policy?: string;
  maxAtQuote?: bigint | null;
  linkPlan?: boolean;
}) {
  const client = await createClient();
  const task = await createTask({ clientId: client.id, status: "open" });
  const planVersion = await makePlanVersion(task.id, {
    ceiling: input?.ceiling === null ? undefined : input?.ceiling,
    policy: input?.policy,
  });
  const step = await makePlanStep(
    planVersion.id,
    input?.maxAtQuote === undefined ? 2_000_000n : input.maxAtQuote
  );
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      // `linkPlan: false` leaves the plan unaccepted, which is what the
      // "still freely editable" case needs.
      planVersionId: input?.linkPlan === false ? null : planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "Integration task",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      expectedAutomationCostMicros: 750_000n,
      conservativeAutomationCostMicros: input?.ceiling ?? 2_600_000n,
      automationSpendCeilingMicros: input?.ceiling ?? 2_600_000n,
      automationCostPolicyVersion: input?.policy ?? "ac1",
    },
    select: { id: true },
  });
  return { taskId: task.id, planVersionId: planVersion.id, stepId: step.id, snapshotId: snapshot.id };
}

/**
 * REAL POSTGRES ONLY. These prove things a mock cannot: that an advisory lock
 * serialises two concurrent reservations, that a unique index makes a replay
 * idempotent, that an uncertain outcome keeps its budget occupied, and above
 * all that an ACCEPTED contract's economics cannot move afterwards.
 */

async function makePlanVersion(
  taskId: string,
  economics?: { ceiling?: bigint; policy?: string }
) {
  return prisma.taskExecutionPlanVersion.create({
    data: {
      taskId,
      version: 1,
      source: "ai_generated",
      rawOutput: {},
      deliverableDescription: "a file",
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
      expectedAutomationCostMicros: 750_000n,
      conservativeAutomationCostMicros: economics?.ceiling ?? 2_600_000n,
      automationSpendCeilingMicros: economics?.ceiling ?? 2_600_000n,
      automationCostPolicyVersion: economics?.policy ?? "ac1",
    },
    select: { id: true },
  });
}

async function makePlanStep(planVersionId: string, maxAtQuote: bigint | null) {
  return prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId,
      order: 1,
      title: "machine step",
      description: "d",
      executor: "ai",
      acceptanceCriteria: [],
      estimatedMinutesOptimistic: 0,
      estimatedMinutesLikely: 0,
      estimatedMinutesConservative: 0,
      verificationMethod: "operator check",
      riskLevel: "low",
      dependsOnOrder: [],
      primitiveId: "research.web_search",
      primitiveVersion: 1,
      maxCostMicrosPerAttemptAtQuote: maxAtQuote,
      expectedCostMicrosAtQuote: maxAtQuote === null ? null : 500_000n,
      automationCostPolicyVersion: "ac1",
    },
    select: { id: true },
  });
}

async function makeRun(ceilingMicros: bigint | null) {
  const c = await acceptedContract({ ceiling: ceilingMicros ?? undefined });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: c.snapshotId,
      taskId: c.taskId,
      planVersionId: c.planVersionId,
      status: "running",
      runAutomationBudgetMicros: ceilingMicros,
      budgetPolicyVersion: "budget_v2",
    },
    select: { id: true },
  });
  const step = await prisma.taskWorkflowStepRun.create({
    data: {
      runId: run.id,
      planStepId: c.stepId,
      order: 1,
      executionMode: "automated",
      status: "running",
    },
    select: { id: true },
  });
  return { runId: run.id, stepRunId: step.id, taskId: c.taskId, planVersionId: c.planVersionId };
}

describe("reserveSpend", () => {
  it("refuses when no ceiling was frozen, rather than treating null as unlimited", async () => {
    const { runId, stepRunId } = await makeRun(null);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "k",
      worstCaseMicros: 1_000n,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_budget_defined");
  });

  it("grants inside the ceiling and refuses beyond it", async () => {
    const { runId, stepRunId } = await makeRun(100_000n);
    const first = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "a",
      worstCaseMicros: 60_000n,
    });
    expect(first.ok).toBe(true);

    const second = await reserveSpend({
      runId,
      stepRunId,
      attempt: 2,
      operationKey: "b",
      worstCaseMicros: 60_000n,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("would_exceed_budget");
      expect(second.committedMicros).toBe(60_000n);
    }
  });

  it("TWO CONCURRENT RESERVATIONS CANNOT BOTH WIN", async () => {
    /**
     * The runner hands a step to a second invocation when the first one's
     * lease expires, and the first call may still be in flight. With a plain
     * `spent + estimate <= ceiling` check, both read the same spend, both see
     * room, and both spend. The advisory lock plus the hold table forbid it.
     */
    const { runId, stepRunId } = await makeRun(100_000n);
    const [a, b] = await Promise.all([
      reserveSpend({
        runId,
        stepRunId,
        attempt: 1,
        operationKey: "concurrent-a",
        worstCaseMicros: 60_000n,
      }),
      reserveSpend({
        runId,
        stepRunId,
        attempt: 2,
        operationKey: "concurrent-b",
        worstCaseMicros: 60_000n,
      }),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.workflowBudgetHold.count({ where: { runId, status: "held" } })).toBe(1);
  });

  it("a replay of the same attempt reuses its hold instead of stacking a second", async () => {
    const { runId, stepRunId } = await makeRun(100_000n);
    const first = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "same",
      worstCaseMicros: 40_000n,
    });
    const replay = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "same",
      worstCaseMicros: 40_000n,
    });
    expect(first.ok && replay.ok).toBe(true);
    if (first.ok && replay.ok) expect(replay.holdId).toBe(first.holdId);
    expect(await prisma.workflowBudgetHold.count({ where: { runId } })).toBe(1);
  });

  it("holds an amount beyond the old Int ceiling without overflowing", async () => {
    // $3,000 in micros is past the Prisma Int limit of $2,147.48. The columns
    // are BigInt precisely so a future primitive needs no type migration.
    const huge = 3_000_000_000n;
    const { runId, stepRunId } = await makeRun(huge * 2n);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "huge",
      worstCaseMicros: huge,
    });
    expect(r.ok).toBe(true);
    expect(await unresolvedHoldMicros(runId)).toBe(huge);
  });
});

describe("settling and releasing", () => {
  it("settling frees the difference between the worst case and the real cost", async () => {
    const { runId, stepRunId } = await makeRun(100_000n);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "s",
      worstCaseMicros: 60_000n,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await prisma.$transaction(async (tx) => settleHold(tx, r.holdId, 5_000n));
    expect(await unresolvedHoldMicros(runId)).toBe(0n);

    const next = await reserveSpend({
      runId,
      stepRunId,
      attempt: 2,
      operationKey: "s2",
      worstCaseMicros: 60_000n,
    });
    expect(next.ok).toBe(true);
  });

  it("AN UNCERTAIN OUTCOME KEEPS ITS BUDGET OCCUPIED", async () => {
    const { runId, stepRunId } = await makeRun(100_000n);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "uncertain",
      worstCaseMicros: 60_000n,
    });
    expect(r.ok).toBe(true);
    // An AbortSignal proves we stopped waiting, not that nobody billed us.
    expect(await unresolvedHoldMicros(runId)).toBe(60_000n);
    const next = await reserveSpend({
      runId,
      stepRunId,
      attempt: 2,
      operationKey: "after-uncertain",
      worstCaseMicros: 60_000n,
    });
    expect(next.ok).toBe(false);
  });

  it("releasing is only for calls that never left, and it does free the room", async () => {
    const { runId, stepRunId } = await makeRun(100_000n);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "never-sent",
      worstCaseMicros: 90_000n,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await releaseHold(r.holdId);
    expect(await unresolvedHoldMicros(runId)).toBe(0n);
  });

  it("already-spent money counts against the ceiling too, not just holds", async () => {
    const { runId, stepRunId } = await makeRun(100_000n);
    await prisma.taskWorkflowRun.update({
      where: { id: runId },
      data: { actualAiCostMicros: 70_000, actualToolCostMicros: 10_000 },
    });
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "late",
      worstCaseMicros: 30_000n,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.committedMicros).toBe(80_000n);
  });
});

describe("AN ACCEPTED CONTRACT'S ECONOMICS ARE APPEND-ONLY", () => {
  /**
   * The defect this closes: the ceiling used to be derived at COMPILE time
   * from the registry, and compile runs after payment. A deploy that raised a
   * cap raised the budget of mandates already sold. The number is now frozen
   * on the contract, and Postgres refuses to let anyone move it.
   */
  it("refuses to UPDATE a step of an accepted plan", async () => {
    const { stepId } = await acceptedContract();
    await expect(
      prisma.taskExecutionPlanStep.update({
        where: { id: stepId },
        // The exact mutation this whole correction exists to forbid.
        data: { maxCostMicrosPerAttemptAtQuote: 4_000_000n },
      })
    ).rejects.toThrow(/append-only/);
  });

  it("refuses to DELETE a step of an accepted plan", async () => {
    const { stepId } = await acceptedContract();
    await expect(prisma.taskExecutionPlanStep.delete({ where: { id: stepId } })).rejects.toThrow(
      /append-only/
    );
  });

  it("refuses to INSERT a new step into an accepted plan", async () => {
    const { planVersionId } = await acceptedContract();
    await expect(makePlanStep(planVersionId, 2_000_000n)).rejects.toThrow(/append-only/);
  });

  it("refuses to REPARENT a step INTO an accepted plan", async () => {
    // Checking only OLD would let a reparent smuggle a new step in; checking
    // only NEW would let one be carried out. The guard reads both.
    const { planVersionId } = await acceptedContract();
    const free = await acceptedContract({ linkPlan: false });

    await expect(
      prisma.taskExecutionPlanStep.update({
        where: { id: free.stepId },
        data: { planVersionId },
      })
    ).rejects.toThrow(/append-only/);
  });

  it("refuses to UPDATE the accepted plan VERSION itself", async () => {
    const { planVersionId } = await acceptedContract();
    await expect(
      prisma.taskExecutionPlanVersion.update({
        where: { id: planVersionId },
        data: { automationSpendCeilingMicros: 9_000_000n },
      })
    ).rejects.toThrow(/cannot be modified/);
  });

  it("a plan that was never accepted stays freely editable", async () => {
    // The admin plan editor depends on this: the guard must not be a blanket
    // freeze on every plan in the table.
    const draft = await acceptedContract({ linkPlan: false });
    await expect(
      prisma.taskExecutionPlanStep.update({
        where: { id: draft.stepId },
        data: { title: "edited freely" },
      })
    ).resolves.toBeTruthy();
    await expect(
      prisma.taskExecutionPlanVersion.update({
        where: { id: draft.planVersionId },
        data: { deliverableDescription: "edited freely" },
      })
    ).resolves.toBeTruthy();
  });

  it("A NEW QUOTE USES THE NEW POLICY WHILE THE OLD CONTRACT KEEPS ITS OWN", async () => {
    /**
     * Contract A was quoted under a policy saying $2 per research attempt. A
     * later release adds `ac2` saying $4 — a NEW version, never an edit of
     * ac1, so the provenance of A's quote survives. Quote B is built with the
     * new number; A still reserves exactly $2, because its figure is
     * materialised on its own plan step and nothing reads the policy table at
     * execution time.
     */
    const a = await makeRun(2_000_000n);
    const stepA = await prisma.taskExecutionPlanStep.findFirstOrThrow({
      where: { planVersionId: a.planVersionId },
      select: { maxCostMicrosPerAttemptAtQuote: true },
    });
    expect(stepA.maxCostMicrosPerAttemptAtQuote).toBe(2_000_000n);

    // The later quote, written with the larger figure.
    await acceptedContract({ ceiling: 4_000_000n, policy: "ac2", maxAtQuote: 4_000_000n });

    // A is untouched, and A's own ceiling still refuses the larger amount.
    const reReadA = await prisma.taskExecutionPlanStep.findFirstOrThrow({
      where: { planVersionId: a.planVersionId },
      select: { maxCostMicrosPerAttemptAtQuote: true },
    });
    expect(reReadA.maxCostMicrosPerAttemptAtQuote).toBe(2_000_000n);

    const overA = await reserveSpend({
      runId: a.runId,
      stepRunId: a.stepRunId,
      attempt: 1,
      operationKey: "over",
      worstCaseMicros: 4_000_000n,
    });
    expect(overA.ok).toBe(false);
  });
});
