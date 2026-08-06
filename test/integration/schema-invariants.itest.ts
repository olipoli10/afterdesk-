import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { insertLedgerEntry } from "@/lib/ledger";
import { createAcceptedTask, createTask, createWorker } from "./fixtures";

/**
 * DATABASE-LEVEL INVARIANTS, proven against real Postgres with real COMMITS.
 * Several of these are constraint triggers or partial indexes a rolled-back
 * transaction would never exercise — which is exactly why this suite exists.
 */

describe("BIGINT survives where Int would have lied", () => {
  it("stores, reads and SQL-sums values past the 32-bit ceiling", async () => {
    // 2 147 483 647 micros is $2,147.48; a $500 payout is 5e9 micros.
    const big = 5_000_000_000n;
    const { task } = await createAcceptedTask();
    await prisma.taskOperationalActual.create({
      data: {
        taskId: task.id,
        allInCostWithModeledMicros: big,
        bookedAndMeteredCostMicros: big,
        recognizedRevenueMicros: big * 3n,
        inputFingerprint: "fp",
        computedAt: new Date(),
        computationVersion: 1,
      },
    });
    const row = await prisma.taskOperationalActual.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { allInCostWithModeledMicros: true, recognizedRevenueMicros: true },
    });
    expect(row.allInCostWithModeledMicros).toBe(big);
    expect(row.recognizedRevenueMicros).toBe(15_000_000_000n);

    const agg = await prisma.taskOperationalActual.aggregate({
      _sum: { recognizedRevenueMicros: true },
    });
    expect(agg._sum.recognizedRevenueMicros).toBe(15_000_000_000n);
  });
});

describe("the baseline is immutable in Postgres, not in code", () => {
  it("refuses UPDATE and DELETE by trigger", async () => {
    const { baseline } = await createAcceptedTask();
    await expect(
      prisma.taskOperationalBaseline.update({
        where: { id: baseline.id },
        data: { clientPriceCents: 1 },
      })
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.taskOperationalBaseline.delete({ where: { id: baseline.id } })
    ).rejects.toThrow(/immutable/);
    // And the row is intact after both refusals.
    const still = await prisma.taskOperationalBaseline.findUniqueOrThrow({
      where: { id: baseline.id },
      select: { clientPriceCents: true },
    });
    expect(still.clientPriceCents).toBe(10_000);
  });
});

describe("Phase 1B guards survived Phase 1C — regression", () => {
  it("vaPayoutCents stays frozen once claimed", async () => {
    const worker = await createWorker();
    const task = await createTask({ status: "claimed", claimedById: worker.id });
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { vaPayoutCents: 1 } })
    ).rejects.toThrow(/frozen/);
  });

  it("an unpaid task cannot enter ai_processing nor reach the pool", async () => {
    const task = await createTask({ status: "awaiting_payment" });
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { status: "ai_processing" } })
    ).rejects.toThrow(/without an authorized or received payment/);

    await prisma.payment.create({
      data: {
        taskId: task.id,
        amountCents: 10_000,
        method: "card",
        provider: "stripe",
        providerRef: `it_${task.id}`,
        status: "authorized",
      },
    });
    // Paid: both hops now pass.
    await prisma.task.update({ where: { id: task.id }, data: { status: "ai_processing" } });
    await prisma.task.update({ where: { id: task.id }, data: { status: "open" } });
  });

  it("the human package freezes at claim", async () => {
    const worker = await createWorker();
    const { task, snapshot } = await createAcceptedTask();
    const planVersion = await prisma.taskExecutionPlanVersion.create({
      data: {
        taskId: task.id,
        version: 1,
        source: "ai_generated",
        deliverableDescription: "d",
        internalCostLikelyCents: 0,
        internalCostConservativeCents: 0,
        suggestedPriceCents: 0,
        suggestedVaPayoutCents: 0,
        calibration: "uncalibrated",
      },
      select: { id: true },
    });
    const run = await prisma.taskWorkflowRun.create({
      data: { taskId: task.id, snapshotId: snapshot.id, planVersionId: planVersion.id },
      select: { id: true },
    });
    const pkg = await prisma.taskHumanWorkPackage.create({
      data: {
        runId: run.id,
        taskId: task.id,
        planVersionId: planVersion.id,
        objective: "o",
        whatIsAlreadyDone: "w",
        instructions: "i",
        checklist: [],
        unitsRemaining: 1,
        unitsTotal: 1,
        estimatedMinutes: 30,
        computedPayoutCents: 2000,
        reservedBudgetCents: 2000,
      },
      select: { id: true },
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "claimed", claimedById: worker.id },
    });
    await expect(
      prisma.taskHumanWorkPackage.update({ where: { id: pkg.id }, data: { unitsRemaining: 0 } })
    ).rejects.toThrow(/frozen/);
  });
});

describe("partial unique indexes (SQL-only, invisible to Prisma)", () => {
  it("one OPEN session per (task, user, role); closed sessions do not block", async () => {
    const task = await createTask();
    await prisma.taskWorkSession.create({
      data: { taskId: task.id, userId: "u1", role: "worker", phase: "residual_work" },
    });
    await expect(
      prisma.taskWorkSession.create({
        data: { taskId: task.id, userId: "u1", role: "worker", phase: "residual_work" },
      })
    ).rejects.toThrow(/Unique constraint/);
    // A different role opens fine; a completed session frees the slot.
    await prisma.taskWorkSession.create({
      data: { taskId: task.id, userId: "u1", role: "reviewer", phase: "qc" },
    });
    await prisma.taskWorkSession.updateMany({
      where: { taskId: task.id, userId: "u1", role: "worker" },
      data: { status: "completed", endedAt: new Date() },
    });
    await prisma.taskWorkSession.create({
      data: { taskId: task.id, userId: "u1", role: "worker", phase: "residual_work" },
    });
  });

  it("(operationId, attempt) is unique — and intake rows with null stay free", async () => {
    const task = await createTask();
    const op = await prisma.aiOperation.create({
      data: { taskId: task.id, purpose: "planning", operationKey: `k:${task.id}` },
      select: { id: true },
    });
    const usage = {
      userId: "work-engine",
      model: "claude-opus-5",
      taskId: task.id,
      purpose: "planning",
      costMicros: 100,
    };
    await prisma.aiUsage.create({ data: { ...usage, operationId: op.id, attempt: 1 } });
    // Same attempt twice = the bug the index exists to surface.
    await expect(
      prisma.aiUsage.create({ data: { ...usage, operationId: op.id, attempt: 1 } })
    ).rejects.toThrow(/Unique constraint/);
    // A REAL second call gets attempt 2 and both costs stand.
    await prisma.aiUsage.create({ data: { ...usage, operationId: op.id, attempt: 2 } });
    // Intake-style rows: no operation, no constraint.
    await prisma.aiUsage.create({ data: usage });
    await prisma.aiUsage.create({ data: usage });
    const total = await prisma.aiUsage.aggregate({
      where: { taskId: task.id },
      _sum: { costMicros: true },
    });
    expect(total._sum.costMicros).toBe(400);
  });
});

describe("the ledger stays append-only and webhook-idempotent", () => {
  it("same source pair inserts once; UPDATE is refused", async () => {
    await prisma.$transaction(async (tx) => {
      await insertLedgerEntry(tx, {
        kind: "sale",
        amountCents: 10_000,
        currency: "USD",
        sourceKind: "it_test",
        sourceId: "src-1",
      });
    });
    await prisma.$transaction(async (tx) => {
      await insertLedgerEntry(tx, {
        kind: "sale",
        amountCents: 10_000,
        currency: "USD",
        sourceKind: "it_test",
        sourceId: "src-1",
      });
    });
    const rows = await prisma.ledgerEntry.findMany({ where: { sourceKind: "it_test" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBeGreaterThan(0n);
    expect(rows[0].rowHash).toMatch(/^[0-9a-f]+$/);
    await expect(
      prisma.ledgerEntry.update({ where: { id: rows[0].id }, data: { amountCents: 1 } })
    ).rejects.toThrow();
  });
});
