import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { computeTaskOperationalActual } from "@/server/operational-actuals";
import { recomputeWorkflowCalibration } from "@/server/workflow-calibration";
import { createAcceptedTask } from "./fixtures";

/**
 * THE RECOMPUTE CONTRACT, proven on real Postgres:
 *  - repeated recompute = identical row + exactly ONE journaled transition
 *    (the silence of the second run is the proof of idempotence);
 *  - an IN-PLACE source mutation with no count change is detected;
 *  - two concurrent recomputes serialize on the advisory lock and produce
 *    one coherent transition, no lost update;
 *  - the profile rebuild is deterministic to the bit.
 */

const eventsFor = (taskId: string) =>
  prisma.taskEvent.findMany({
    where: { taskId, action: "operational_actual_recomputed" },
    orderBy: { createdAt: "asc" },
  });

describe("repeated recompute is silent after the first write", () => {
  it("three runs → one row, one event, identical hash", async () => {
    const { task } = await createAcceptedTask();
    const r1 = await computeTaskOperationalActual(task.id, "test_first");
    const r2 = await computeTaskOperationalActual(task.id, "test_second");
    const r3 = await computeTaskOperationalActual(task.id, "test_third");
    expect(r1.outcome).toBe("written");
    expect(r2.outcome).toBe("unchanged");
    expect(r3.outcome).toBe("unchanged");

    const events = await eventsFor(task.id);
    expect(events).toHaveLength(1);
    const meta = events[0].meta as { beforeHash: string | null; afterHash: string; reason: string };
    expect(meta.beforeHash).toBeNull();
    expect(meta.afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.reason).toBe("test_first");
  });
});

describe("an in-place mutation with NO count change is detected", () => {
  it("a payout re-armed to a new amount changes the fingerprint and the actual", async () => {
    const { task } = await createAcceptedTask();
    const worker = await prisma.user.create({
      data: { name: "W", email: `w-${task.id}@it.local`, role: "VA" },
      select: { id: true },
    });
    await prisma.payout.create({
      data: { taskId: task.id, vaId: worker.id, amountCents: 2000, status: "owed" },
    });
    const first = await computeTaskOperationalActual(task.id, "seed");
    expect(first.outcome).toBe("written");
    const before = await prisma.taskOperationalActual.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { workerPayoutCurrentLiabilityCents: true, inputFingerprint: true },
    });
    expect(before.workerPayoutCurrentLiabilityCents).toBe(2000);

    // THE mutation class counts cannot see: same row, same row count, new value.
    await prisma.payout.updateMany({
      where: { taskId: task.id },
      data: { amountCents: 3500 },
    });

    const second = await computeTaskOperationalActual(task.id, "rearm");
    expect(second.outcome).toBe("written");
    const after = await prisma.taskOperationalActual.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { workerPayoutCurrentLiabilityCents: true, inputFingerprint: true },
    });
    expect(after.workerPayoutCurrentLiabilityCents).toBe(3500);
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
    expect(await eventsFor(task.id)).toHaveLength(2);
  });

  it("capturedAmountCents differing from the authorized amount flags the mismatch", async () => {
    const { task } = await createAcceptedTask({ clientPriceCents: 87_000 });
    await prisma.payment.create({
      data: {
        taskId: task.id,
        amountCents: 87_000,
        capturedAmountCents: 85_000,
        method: "card",
        provider: "stripe",
        providerRef: `it-cap-${task.id}`,
        status: "received",
        receivedAt: new Date(),
      },
    });
    await computeTaskOperationalActual(task.id, "capture");
    const actual = await prisma.taskOperationalActual.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { recognizedRevenueMicros: true, dataQualityFlags: true },
    });
    // Revenue recognizes what was CAPTURED, and says why it differs.
    expect(actual.recognizedRevenueMicros).toBe(850_000_000n);
    expect(actual.dataQualityFlags).toContain("CAPTURE_AMOUNT_MISMATCH");
  });
});

describe("concurrent recomputes serialize under the advisory lock", () => {
  it("no lost update, no duplicate row, coherent journal", async () => {
    const { task } = await createAcceptedTask();
    const results = await Promise.all([
      computeTaskOperationalActual(task.id, "race_a"),
      computeTaskOperationalActual(task.id, "race_b"),
      computeTaskOperationalActual(task.id, "race_c"),
    ]);
    const written = results.filter((r) => r.outcome === "written");
    // At least one writes; the racers either observe "unchanged" or retried
    // into "unchanged". Never two conflicting creations.
    expect(written.length).toBeGreaterThanOrEqual(1);
    expect(await prisma.taskOperationalActual.count({ where: { taskId: task.id } })).toBe(1);
    const events = await eventsFor(task.id);
    // Every journaled transition is a REAL one: distinct afterHash per event.
    const hashes = events.map((e) => (e.meta as { afterHash: string }).afterHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("the profile rebuild is deterministic", () => {
  it("rebuild without data change → numerically identical profile", async () => {
    const { task, baseline } = await createAcceptedTask();
    const key = "list_building|fmt_csv|q_11_50|rigorous|public_only|research.web_search@1>human:worker|k1";
    // Give the actual a workflow key by planting it on the baseline-driven
    // actual directly (the fixture baseline has none).
    await computeTaskOperationalActual(task.id, "seed");
    await prisma.taskOperationalActual.update({
      where: { taskId: task.id },
      data: {
        executionWorkflowKey: key,
        executionWorkflowHash: "h".repeat(64),
        outcomeClass: "workflow_success",
        deliveredAt: new Date("2026-08-07T00:00:00Z"),
        eligibleForReliabilityStatistics: true,
        eligibleForCostAndPerformanceCalibration: true,
        metricsCompletenessBps: 9000,
        allInCostWithModeledMicros: 1_234_567n,
        unitsRequested: 12,
        automatedUnitRateBps: 5000,
        pricingPolicyVersion: "pricing_v1+cc1",
        qualityPolicyVersion: "qc_v1",
      },
    });
    void baseline;

    await recomputeWorkflowCalibration(key);
    const first = await prisma.workflowCalibrationProfile.findUniqueOrThrow({
      where: { executionWorkflowKey: key },
      include: { strata: { orderBy: [{ dimension: "asc" }, { policyVersion: "asc" }] } },
    });
    await recomputeWorkflowCalibration(key);
    const second = await prisma.workflowCalibrationProfile.findUniqueOrThrow({
      where: { executionWorkflowKey: key },
      include: { strata: { orderBy: [{ dimension: "asc" }, { policyVersion: "asc" }] } },
    });

    const strip = (p: typeof first) => {
      const { updatedAt, lastComputedAt, recommendationGeneratedAt, strata, ...rest } = p;
      void updatedAt;
      void lastComputedAt;
      void recommendationGeneratedAt;
      return {
        ...rest,
        strata: strata.map(({ id, createdAt, updatedAt: u, ...st }) => {
          void id;
          void createdAt;
          void u;
          return st;
        }),
      };
    };
    expect(JSON.stringify(strip(second), (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(
      JSON.stringify(strip(first), (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    );
    expect(first.sampleSizeCostPerf).toBe(1);
    expect(first.calibrationLevel).toBe("uncalibrated");
  });
});
