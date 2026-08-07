import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  BUDGET_HEADROOM_MULTIPLIER,
  deriveRunBudgetMicros,
  releaseHold,
  reserveSpend,
  settleHold,
  unresolvedHoldMicros,
} from "@/server/workflow-budget";
import { createAcceptedTask } from "./fixtures";

/**
 * REAL POSTGRES ONLY. These prove things a mock cannot: that an advisory lock
 * serialises two concurrent reservations, that a unique index makes a replay
 * idempotent, and that an uncertain outcome keeps its budget occupied.
 */

async function makeRun(budgetMicros: number | null) {
  const { task, snapshot } = await createAcceptedTask();
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      rawOutput: {},
      deliverableDescription: "a file",
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: planVersion.id,
      status: "running",
      runAutomationBudgetMicros: budgetMicros,
      budgetPolicyVersion: "budget_v1",
    },
    select: { id: true },
  });
  const planStep = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: planVersion.id,
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
    },
    select: { id: true },
  });
  const step = await prisma.taskWorkflowStepRun.create({
    data: {
      runId: run.id,
      planStepId: planStep.id,
      order: 1,
      executionMode: "automated",
      status: "running",
    },
    select: { id: true },
  });
  return { runId: run.id, stepRunId: step.id, taskId: task.id };
}

describe("the budget derives from the accepted plan, never from the price", () => {
  it("sums the planned model cost of the automated steps only", () => {
    // 40 cents planned, doubled for honest variance headroom.
    expect(deriveRunBudgetMicros([{ estimatedAiCostCents: 25 }, { estimatedAiCostCents: 15 }])).toBe(
      40 * 10_000 * BUDGET_HEADROOM_MULTIPLIER
    );
  });

  it("floors on one worst-case attempt of every step, not on a constant", () => {
    /**
     * A planner that guesses one cent for a step whose reviewed cap is two
     * dollars would otherwise produce a ceiling that cannot pay for a single
     * attempt: the run would reserve, be refused, and pause having done
     * nothing. The floor is what the compiled work actually needs.
     */
    expect(
      deriveRunBudgetMicros([{ estimatedAiCostCents: 1, maxCostMicrosPerAttempt: 2_000_000 }])
    ).toBe(2_000_000);
    // And the planned figure still wins when it is the larger of the two.
    expect(
      deriveRunBudgetMicros([{ estimatedAiCostCents: 500, maxCostMicrosPerAttempt: 100_000 }])
    ).toBe(500 * 10_000 * BUDGET_HEADROOM_MULTIPLIER);
  });

  it("returns null when nothing was compiled to a machine, and null is not unlimited", () => {
    expect(deriveRunBudgetMicros([])).toBeNull();
  });
});

describe("reserveSpend", () => {
  it("refuses when no budget was frozen, rather than treating null as unlimited", async () => {
    const { runId, stepRunId } = await makeRun(null);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "k",
      worstCaseMicros: 1_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_budget_defined");
  });

  it("grants inside the ceiling and refuses beyond it", async () => {
    const { runId, stepRunId } = await makeRun(100_000);
    const first = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "a",
      worstCaseMicros: 60_000,
    });
    expect(first.ok).toBe(true);

    const second = await reserveSpend({
      runId,
      stepRunId,
      attempt: 2,
      operationKey: "b",
      worstCaseMicros: 60_000,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("would_exceed_budget");
      // The refusal reports the committed total INCLUDING the outstanding
      // hold, which is the number that made it refuse.
      expect(second.committedMicros).toBe(60_000);
    }
  });

  it("TWO CONCURRENT RESERVATIONS CANNOT BOTH WIN", async () => {
    /**
     * THE TEST THIS WHOLE MODULE EXISTS FOR.
     *
     * The runner hands a step to a second invocation when the first one's
     * lease expires, and the first call may still be in flight. With a plain
     * `spent + estimate <= ceiling` check, both read the same spend, both see
     * room, and both spend: a $1 ceiling pays for $1.20 of calls.
     *
     * The advisory lock plus the hold table make that impossible. Exactly one
     * of two simultaneous reservations may succeed when only one fits.
     */
    const { runId, stepRunId } = await makeRun(100_000);

    const [a, b] = await Promise.all([
      reserveSpend({
        runId,
        stepRunId,
        attempt: 1,
        operationKey: "concurrent-a",
        worstCaseMicros: 60_000,
      }),
      reserveSpend({
        runId,
        stepRunId,
        attempt: 2,
        operationKey: "concurrent-b",
        worstCaseMicros: 60_000,
      }),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    expect(winners).toHaveLength(1);

    const held = await prisma.workflowBudgetHold.count({ where: { runId, status: "held" } });
    expect(held).toBe(1);
  });

  it("a replay of the same attempt reuses its hold instead of stacking a second", async () => {
    const { runId, stepRunId } = await makeRun(100_000);
    const first = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "same",
      worstCaseMicros: 40_000,
    });
    const replay = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "same",
      worstCaseMicros: 40_000,
    });
    expect(first.ok && replay.ok).toBe(true);
    if (first.ok && replay.ok) expect(replay.holdId).toBe(first.holdId);
    expect(await prisma.workflowBudgetHold.count({ where: { runId } })).toBe(1);
  });
});

describe("settling and releasing", () => {
  it("settling frees the difference between the worst case and the real cost", async () => {
    const { runId, stepRunId } = await makeRun(100_000);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "s",
      worstCaseMicros: 60_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    await prisma.$transaction(async (tx) => {
      await settleHold(tx, r.holdId, 5_000);
    });
    expect(await unresolvedHoldMicros(runId)).toBe(0);

    // With the hold settled, a second large reservation now fits.
    const next = await reserveSpend({
      runId,
      stepRunId,
      attempt: 2,
      operationKey: "s2",
      worstCaseMicros: 60_000,
    });
    expect(next.ok).toBe(true);
  });

  it("AN UNCERTAIN OUTCOME KEEPS ITS BUDGET OCCUPIED", async () => {
    /**
     * The honest half of the timeout fix. An AbortSignal proves we stopped
     * waiting, not that the provider stopped billing. Releasing that hold
     * would hand the budget to the next attempt and let one run spend its
     * ceiling twice.
     */
    const { runId, stepRunId } = await makeRun(100_000);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "uncertain",
      worstCaseMicros: 60_000,
    });
    expect(r.ok).toBe(true);

    // Nothing settles it and nothing releases it: the outcome is unknown.
    expect(await unresolvedHoldMicros(runId)).toBe(60_000);

    const next = await reserveSpend({
      runId,
      stepRunId,
      attempt: 2,
      operationKey: "after-uncertain",
      worstCaseMicros: 60_000,
    });
    expect(next.ok).toBe(false);
  });

  it("releasing is only for calls that never left, and it does free the room", async () => {
    const { runId, stepRunId } = await makeRun(100_000);
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "never-sent",
      worstCaseMicros: 90_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await releaseHold(r.holdId);
    expect(await unresolvedHoldMicros(runId)).toBe(0);
  });

  it("already-spent money counts against the ceiling too, not just holds", async () => {
    const { runId, stepRunId } = await makeRun(100_000);
    await prisma.taskWorkflowRun.update({
      where: { id: runId },
      data: { actualAiCostMicros: 70_000, actualToolCostMicros: 10_000 },
    });
    const r = await reserveSpend({
      runId,
      stepRunId,
      attempt: 1,
      operationKey: "late",
      worstCaseMicros: 30_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.committedMicros).toBe(80_000);
  });
});
