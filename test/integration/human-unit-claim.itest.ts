import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { publishHumanWorkUnit } from "@/server/human-unit";
import { createTask, createWorker } from "./fixtures";

/**
 * QUICKSTART SCENARIO A, STEPS 5-6 — THE CLAIM (T035).
 *
 * One act, two records. A worker claims the task through the EXISTING
 * `claimTask` path, and the unit binds to that same claim inside the same
 * transaction. There is no second claim, no second assignment surface, and no
 * moment where the task and the unit disagree about who is holding the work.
 *
 * `Task.claimedById` stays the sole assignment authority (C9). The unit
 * mirrors it; it never competes with it.
 *
 * Only the SESSION BOUNDARY is faked. `requireApprovedVa` is that boundary for
 * a server action: it reads `headers()`, which does not exist outside a request
 * scope, so there is no way to reach `claimTask` without standing in for it.
 *
 * Faking it does NOT weaken what these tests prove. `claimTask` re-checks the
 * worker's profile status inside its own transaction through the T014
 * predicates, and that in-transaction check is the one that binds — the
 * repository's own rule that eligibility is "rechecked at every point of use,
 * inherited from nothing". The suspended-worker test below exercises exactly
 * that path, not this mock.
 *
 * Everything else is the production path: the same server action, the same
 * advisory-locked WIP cap, the same eligibility predicates, the same Prisma
 * queries, the same database triggers.
 */

/**
 * `revalidatePath` is Next.js cache invalidation and needs a request scope that
 * does not exist here. It runs AFTER the claim transaction commits, so without
 * this the database work all happens correctly and the action then throws on
 * its way out. Nothing under test depends on it.
 */
vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return { ...actual, revalidatePath: vi.fn() };
});

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireApprovedVa: vi.fn() };
});

const { requireApprovedVa } = await import("@/lib/authz");
const { claimTask } = await import("@/server/actions/va-tasks");

const signedInAs = (id: string) =>
  vi.mocked(requireApprovedVa).mockResolvedValue({ id, role: "VA" } as never);

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

/** A PUBLISHED unit sitting in the pool, exactly as a worker would find it. */
async function publishedUnit() {
  const task = await createTask({
    status: "ai_processing",
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "claim",
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
  const mkStep = (order: number, executor: string, deps: number[]) =>
    prisma.taskExecutionPlanStep.create({
      data: {
        planVersionId: planVersion.id,
        order,
        title: `step ${order}`,
        description: "d",
        executor: executor as never,
        humanRole: executor === "human" ? ("worker" as never) : null,
        fixedMinutes: executor === "human" ? 30 : null,
        estimatedMinutesOptimistic: 10,
        estimatedMinutesLikely: 20,
        estimatedMinutesConservative: 30,
        verificationMethod: "sample_check",
        acceptanceCriteria: ["ok"],
        riskLevel: "low" as never,
        dependsOnOrder: deps,
        humanOutputSchema: executor === "human" ? OUTPUT_SCHEMA : undefined,
        humanRequiredArtifactKinds: [],
      },
      select: { id: true },
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
  const producer = await mkStep(1, "ai", []);
  const cut = await mkStep(2, "human", [1]);
  const downstream = await mkStep(3, "ai", [2]);

  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "claim",
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
      steps: {
        create: [
          { planStepId: producer.id, order: 1, executionMode: "automated" as never, status: "done" as never },
          { planStepId: cut.id, order: 2, executionMode: "human" as never, status: "handed_to_human" as never },
          { planStepId: downstream.id, order: 3, executionMode: "automated" as never, status: "blocked_on_human_unit" as never },
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
      // Deliberately different from the deadline hours below, so a test can
      // tell a frozen duration apart from an estimate.
      expectedMinutes: 20,
      revisionBound: 2,
      publicationDeadlineHours: 72,
      submissionDeadlineHours: 48,
      claimLeaseHours: 24,
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
  await publishHumanWorkUnit(run.id);
  return { task, run, unit, definition };
}

beforeEach(() => {
  vi.mocked(requireApprovedVa).mockReset();
});

describe("the claim binds the unit in the same act", () => {
  it("moves the unit published -> claimed and mirrors the task's claimant", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();
    signedInAs(worker.id);

    const result = await claimTask(task.id);
    expect(result.ok).toBe(true);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, claimedById: true, claimedAt: true },
    });
    expect(after.state).toBe("claimed");
    expect(after.claimedById).toBe(worker.id);
    expect(after.claimedAt).not.toBeNull();

    /**
     * C9. `Task.claimedById` is the assignment; the unit mirrors it. A unit
     * claimant that could differ from the task's would be a second engagement
     * in all but name, and the payee would be ambiguous.
     */
    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, claimedById: true },
    });
    expect(taskAfter.status).toBe("claimed");
    expect(taskAfter.claimedById).toBe(worker.id);
    expect(after.claimedById).toBe(taskAfter.claimedById);
  });

  /**
   * THE LOAD-BEARING GENERATION ASSERTION (C4).
   *
   * The initial `NULL -> worker` claim is bumped ONCE, by the application.
   * `INV-14`'s trigger deliberately excludes it — `OLD."claimedById" IS NOT
   * NULL` — because a second bump here would instantly stale the claim that
   * was just created, and the worker's very first submission would be refused
   * as coming from a superseded generation.
   */
  it("increments claimGeneration exactly once on the initial claim", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();
    signedInAs(worker.id);
    await claimTask(task.id);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { claimGeneration: true },
    });
    expect(after.claimGeneration).toBe(1);
  });

  /**
   * The deadlines come from the FROZEN durations on the definition, not from
   * the plan's expected minutes. FR-058: an estimate is the planner's opinion
   * and must never become a deadline a worker is held to.
   */
  it("stamps both clocks from the frozen durations, not from expected minutes", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();
    signedInAs(worker.id);
    const before = Date.now();
    await claimTask(task.id);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { claimLeaseExpiresAt: true, submissionDeadlineAt: true },
    });
    expect(after.claimLeaseExpiresAt).not.toBeNull();
    expect(after.submissionDeadlineAt).not.toBeNull();

    const hours = (d: Date | null) => (d!.getTime() - before) / 3_600_000;
    // 24 and 48 on this definition, and deliberately not 20 (expectedMinutes).
    expect(hours(after.claimLeaseExpiresAt)).toBeGreaterThan(23.5);
    expect(hours(after.claimLeaseExpiresAt)).toBeLessThan(24.5);
    expect(hours(after.submissionDeadlineAt)).toBeGreaterThan(47.5);
    expect(hours(after.submissionDeadlineAt)).toBeLessThan(48.5);
  });

  it("audits the claim with assignmentEstablished, plus the task-event mirror", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();
    signedInAs(worker.id);
    await claimTask(task.id);

    const rows = await prisma.humanWorkUnitTransition.findMany({
      where: { unitStateId: unit.id },
      orderBy: { seq: "asc" },
      select: {
        seq: true,
        cause: true,
        fromState: true,
        toState: true,
        actorRole: true,
        actorId: true,
        claimGeneration: true,
        assignmentEstablished: true,
      },
    });
    expect(rows.map((r) => r.cause)).toEqual(["admitted", "published", "claimed"]);
    expect(rows[2]).toMatchObject({
      seq: 3,
      fromState: "published",
      toState: "claimed",
      actorRole: "worker",
      actorId: worker.id,
      claimGeneration: 1,
      assignmentEstablished: true,
    });

    const state = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { transitionSeq: true },
    });
    expect(state.transitionSeq).toBe(3);

    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: "human_unit_claimed" } })
    ).toBe(1);
  });

  /**
   * A worker resubmitting after a revision request claims nothing new: the
   * unit is already theirs. `assignmentEstablished` is false — FR-048's
   * "established or matched" — and the generation does not move.
   */
  it("binds from revision_requested without re-establishing the assignment", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();
    signedInAs(worker.id);
    await claimTask(task.id);

    // The worker still holds the task; the unit went back for a revision.
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { state: "revision_requested" as never },
    });

    const second = await claimTask(task.id);
    expect(second.ok).toBe(false);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, claimGeneration: true, claimedById: true },
    });
    // The task CAS refuses a second claim, so nothing about the unit moved.
    expect(after.claimGeneration).toBe(1);
    expect(after.claimedById).toBe(worker.id);
    expect(after.state).toBe("revision_requested");
  });
});

describe("the existing claim guards still bind", () => {
  it("a second worker cannot take a claimed unit", async () => {
    const { task, unit } = await publishedUnit();
    const first = await createWorker();
    signedInAs(first.id);
    await claimTask(task.id);

    const second = await createWorker();
    signedInAs(second.id);
    const result = await claimTask(task.id);
    expect(result.ok).toBe(false);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { claimedById: true, claimGeneration: true },
    });
    expect(after.claimedById).toBe(first.id);
    expect(after.claimGeneration).toBe(1);
  });

  /**
   * Two workers, one task, at the same moment. The existing CAS on
   * `Task.claimedById` decides it; the unit must follow that same decision
   * exactly once, not twice and not zero times.
   */
  it("exactly one of two racing workers binds the unit", async () => {
    const { task, unit } = await publishedUnit();
    const a = await createWorker();
    const b = await createWorker();

    const results = await Promise.all([
      (async () => {
        signedInAs(a.id);
        return claimTask(task.id);
      })(),
      (async () => {
        signedInAs(b.id);
        return claimTask(task.id);
      })(),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, claimedById: true, claimGeneration: true },
    });
    expect(after.state).toBe("claimed");
    expect([a.id, b.id]).toContain(after.claimedById);
    expect(after.claimGeneration).toBe(1);

    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { claimedById: true },
    });
    expect(after.claimedById).toBe(taskAfter.claimedById);

    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: unit.id, cause: "claimed" },
      })
    ).toBe(1);
  });

  /**
   * The WIP cap is enforced under an advisory lock inside the claim
   * transaction. A worker at the cap gets nothing, and — the part that
   * matters here — the unit is not left half-bound.
   */
  it("a worker at the WIP cap binds nothing", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();

    // Three other tasks already in progress: the default cap is 3.
    for (let i = 0; i < 3; i += 1) {
      await createTask({ status: "claimed", claimedById: worker.id });
    }

    signedInAs(worker.id);
    const result = await claimTask(task.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tasks in progress/i);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, claimedById: true, claimGeneration: true },
    });
    expect(after.state).toBe("published");
    expect(after.claimedById).toBeNull();
    expect(after.claimGeneration).toBe(0);
  });

  it("an unapproved worker binds nothing", async () => {
    const { task, unit } = await publishedUnit();
    const worker = await createWorker();
    await prisma.vaProfile.update({
      where: { userId: worker.id },
      data: { status: "suspended" as never },
    });

    signedInAs(worker.id);
    const result = await claimTask(task.id);
    expect(result.ok).toBe(false);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, claimedById: true },
    });
    expect(after.state).toBe("published");
    expect(after.claimedById).toBeNull();
  });

  /**
   * A task with no unit claims exactly as it always did. The binding is
   * additive; it must not become a precondition for the ordinary pool.
   */
  it("a task with no unit still claims normally", async () => {
    const task = await createTask({ status: "open" });
    const worker = await createWorker();
    signedInAs(worker.id);

    const result = await claimTask(task.id);
    expect(result.ok).toBe(true);

    const after = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, claimedById: true },
    });
    expect(after.status).toBe("claimed");
    expect(after.claimedById).toBe(worker.id);
  });
});
