import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { humanUnitForWorker } from "@/lib/queries/human-unit";
import { submitHumanUnitCandidate } from "@/server/human-unit";
import { createTask, createWorker } from "./fixtures";
import { createUs4Unit } from "./human-unit-us4-fixtures";

const submit = (fixture: Awaited<ReturnType<typeof createUs4Unit>>, overrides?: Partial<{
  taskId: string;
  actorId: string;
  claimGeneration: number;
}>) => submitHumanUnitCandidate({
  taskId: overrides?.taskId ?? fixture.task.id,
  actorId: overrides?.actorId ?? fixture.worker.id,
  claimGeneration: overrides?.claimGeneration ?? fixture.claimGeneration,
  payload: { summary: "bounded result" },
  fileIds: [],
});

describe("T053 point-of-use authorization is inherited from nothing", () => {
  it("freezes platform criteria at admission but applies worker facts live", async () => {
    const admittedBeforeChange = await createUs4Unit({
      eligibility: {
        categorySlug: null,
        tier: "standard",
        requireCategoryCertification: false,
        highValueThreshold: 4.5,
        minRatedDeliveries: 3,
        maxActiveClaims: 3,
      },
    });
    await createTask({ status: "claimed", claimedById: admittedBeforeChange.worker.id });
    await prisma.setting.upsert({
      where: { key: "maxActiveClaims" },
      create: { key: "maxActiveClaims", value: 1 },
      update: { value: 1 },
    });

    expect(await humanUnitForWorker({
      taskId: admittedBeforeChange.task.id,
      workerId: admittedBeforeChange.worker.id,
      claimGeneration: 1,
    })).not.toBeNull();

    const admittedAfterChange = await createUs4Unit({
      workerId: admittedBeforeChange.worker.id,
      eligibility: {
        categorySlug: null,
        tier: "standard",
        requireCategoryCertification: false,
        highValueThreshold: 4.5,
        minRatedDeliveries: 3,
        maxActiveClaims: 1,
      },
    });
    expect(await humanUnitForWorker({
      taskId: admittedAfterChange.task.id,
      workerId: admittedAfterChange.worker.id,
      claimGeneration: 1,
    })).toBeNull();
  });

  it("withdrawal of approval after claim closes both read and submit", async () => {
    const fixture = await createUs4Unit();
    await prisma.vaProfile.update({
      where: { userId: fixture.worker.id },
      data: { status: "suspended" },
    });
    expect(await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: fixture.worker.id,
      claimGeneration: 1,
    })).toBeNull();
    expect(await submit(fixture)).toEqual({ submitted: false, cause: "not_eligible" });
  });

  it("rechecks frozen category, tier, prior rejection and WIP criteria against live facts", async () => {
    const category = await createUs4Unit({
      eligibility: {
        categorySlug: "research",
        tier: "standard",
        requireCategoryCertification: true,
        highValueThreshold: 4.5,
        minRatedDeliveries: 3,
        maxActiveClaims: 3,
      },
    });
    expect(await submit(category)).toMatchObject({ submitted: false, cause: "not_eligible" });

    const high = await createUs4Unit({
      tier: "high_value",
      eligibility: {
        categorySlug: null,
        tier: "high_value",
        requireCategoryCertification: false,
        highValueThreshold: 4.8,
        minRatedDeliveries: 20,
        maxActiveClaims: 3,
      },
    });
    expect(await submit(high)).toMatchObject({ submitted: false, cause: "not_eligible" });

    const rejected = await createUs4Unit();
    await prisma.submission.create({
      data: {
        taskId: rejected.task.id,
        vaId: rejected.worker.id,
        attemptNo: 1,
        qcStatus: "rejected",
      },
    });
    expect(await submit(rejected)).toMatchObject({ submitted: false, cause: "not_eligible" });

    const capped = await createUs4Unit({
      eligibility: {
        categorySlug: null,
        tier: "standard",
        requireCategoryCertification: false,
        highValueThreshold: 4.5,
        minRatedDeliveries: 3,
        maxActiveClaims: 1,
      },
    });
    await createTask({ status: "claimed", claimedById: capped.worker.id });
    expect(await submit(capped)).toMatchObject({ submitted: false, cause: "not_eligible" });
  });

  it("makes cross-task and cross-holder guessing indistinguishable from absence", async () => {
    const fixture = await createUs4Unit();
    const stranger = await createWorker();
    const other = await createUs4Unit();
    const readAbsent = await humanUnitForWorker({
      taskId: "absent",
      workerId: stranger.id,
      claimGeneration: 1,
    });
    expect(await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: stranger.id,
      claimGeneration: 1,
    })).toEqual(readAbsent);
    expect(await submit(fixture, { actorId: stranger.id })).toEqual({
      submitted: false,
      cause: "not_available",
    });
    expect(await submit(fixture, { taskId: other.task.id, actorId: fixture.worker.id })).toEqual({
      submitted: false,
      cause: "not_available",
    });
  });

  it("returns stale_generation only to the worker who actually held that generation", async () => {
    const fixture = await createUs4Unit({ claimGeneration: 2 });
    await prisma.humanWorkUnitTransition.create({
      data: {
        unitStateId: fixture.unit.id,
        seq: 2,
        actorId: fixture.worker.id,
        actorRole: "worker",
        fromState: "claimed",
        toState: "claimed",
        cause: "claimed",
        claimGeneration: 1,
        resumeGeneration: 0,
      },
    });
    await prisma.humanWorkUnitRunState.update({
      where: { id: fixture.unit.id },
      data: { transitionSeq: 2 },
    });
    expect(await submit(fixture, { claimGeneration: 1 })).toEqual({
      submitted: false,
      cause: "stale_generation",
    });
    const stranger = await createWorker();
    expect(await submit(fixture, { actorId: stranger.id, claimGeneration: 1 })).toEqual({
      submitted: false,
      cause: "not_available",
    });
  });
});
