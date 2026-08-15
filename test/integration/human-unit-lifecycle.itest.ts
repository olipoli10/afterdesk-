import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { publishHumanWorkUnit } from "@/server/human-unit";
import { advanceWorkflow } from "@/server/workflow-runs";
import { createTask, createWorker } from "./fixtures";

/**
 * QUICKSTART SCENARIO A — THE PUBLICATION HALF (T024, partial).
 *
 * This file will eventually prove all eleven steps of Scenario A end to end.
 * Right now it proves steps 1-4: an admitted unit whose pre-cut block has
 * drained is published to the pool, exactly once, without touching a single
 * number the client already accepted.
 *
 * T024 stays OPEN until steps 5-11 exist, because a lifecycle test that stops
 * at publication has not proven the lifecycle. What is asserted here is
 * asserted for real.
 *
 * The reason publication is the dangerous moment: it is the first time the
 * mandate becomes visible to someone outside the transaction that created it.
 * If the payout moved, if the task reached the pool with nobody told, if a
 * provider hold was still open, or if the audit row went missing, every one of
 * those is discovered by a worker rather than by us.
 */

const OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

/**
 * An admitted unit whose pre-cut block is done: run `running`, task
 * `ai_processing`, cut at order 2 with step 1 complete behind it.
 *
 * Deliberately assembled here rather than by driving `compileWorkflowForTask`:
 * this file is testing PUBLICATION, and a fixture that also exercised
 * admission would fail for two unrelated reasons at once.
 */
async function admittedRunReadyToPublish(over?: {
  dataClass?: string;
  inputClass?: string;
  producerStatus?: string;
  vaPayoutCents?: number;
  estimatedMinutes?: number;
}) {
  const task = await createTask({
    status: "ai_processing",
    vaPayoutCents: over?.vaPayoutCents ?? 4_000,
    estimatedMinutes: over?.estimatedMinutes ?? 60,
  });
  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "lifecycle",
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
  /**
   * The escrow guard refuses a paid client task entering the pool without an
   * authorized or received payment, and it covers `ai_processing -> open`. That
   * is correct and this fixture must satisfy it rather than route around it:
   * a real admitted mandate has been paid for long before it reaches here.
   */
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
      title: "lifecycle",
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
          {
            planStepId: producer.id,
            order: 1,
            executionMode: "automated" as never,
            status: (over?.producerStatus ?? "done") as never,
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
      declaredInputs: [
        {
          kind: "artifact",
          ref: "step:1",
          label: "step 1",
          dataClass: over?.inputClass ?? "business_confidential",
        },
      ],
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
      dataClass: over?.dataClass ?? "business_confidential",
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
  return { task, run, unit, definition, snapshot };
}

describe("Scenario A steps 1-4 — the unit reaches the pool", () => {
  it("publishes: unit admitted -> published, task ai_processing -> open", async () => {
    const { task, run, unit } = await admittedRunReadyToPublish();
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(true);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, publishedAt: true, publicationDeadlineAt: true },
    });
    expect(after.state).toBe("published");
    expect(after.publishedAt).not.toBeNull();
    expect(after.publicationDeadlineAt).not.toBeNull();

    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true },
    });
    expect(taskAfter.status).toBe("open");
  });

  /**
   * THE LOAD-BEARING PUBLICATION ASSERTION.
   *
   * The worker is about to see a number. It must be the number the client
   * accepted, and publication must not be the moment it changes — this is the
   * whole reason `finishRun`'s residual path is not reused here.
   */
  it("writes neither vaPayoutCents nor estimatedMinutes", async () => {
    const { task, run } = await admittedRunReadyToPublish({
      vaPayoutCents: 4_000,
      estimatedMinutes: 60,
    });
    await publishHumanWorkUnit(run.id);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { vaPayoutCents: true, estimatedMinutes: true },
    });
    expect(after.vaPayoutCents).toBe(4_000);
    expect(after.estimatedMinutes).toBe(60);
  });

  it("tells the eligible pool, so the task is not open with nobody notified", async () => {
    await createWorker();
    const { task, run } = await admittedRunReadyToPublish();
    await publishHumanWorkUnit(run.id);
    const notifications = await prisma.notification.count({
      where: { taskId: task.id, type: "pool_task_available" },
    });
    expect(notifications).toBeGreaterThan(0);
  });

  it("writes the publication deadline alert exactly once", async () => {
    const { run, unit } = await admittedRunReadyToPublish();
    await publishHumanWorkUnit(run.id);
    const alerts = await prisma.humanWorkUnitAlert.findMany({
      where: { unitStateId: unit.id, kind: "publication_deadline" as never },
      select: { dueAt: true, claimGeneration: true },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].claimGeneration).toBe(0);
  });

  /**
   * `seq` comes from `transitionSeq` in the same write (C7/INV-T1). Two
   * concurrent writers reading `MAX(seq)+1` both compute the same number and
   * one loses the unique index; allocating from the counter cannot collide.
   */
  it("audits the transition with seq allocated from transitionSeq", async () => {
    const { run, unit } = await admittedRunReadyToPublish();
    await publishHumanWorkUnit(run.id);
    const rows = await prisma.humanWorkUnitTransition.findMany({
      where: { unitStateId: unit.id },
      orderBy: { seq: "asc" },
      select: { seq: true, cause: true, fromState: true, toState: true },
    });
    expect(rows.map((r) => r.cause)).toEqual(["admitted", "published"]);
    expect(rows[1].seq).toBe(2);
    expect(rows[1].fromState).toBe("admitted");
    expect(rows[1].toState).toBe("published");

    const state = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { transitionSeq: true },
    });
    expect(state.transitionSeq).toBe(2);
  });

  it("mirrors the publication onto the task timeline as human_unit_published", async () => {
    const { task, run } = await admittedRunReadyToPublish();
    await publishHumanWorkUnit(run.id);
    const events = await prisma.taskEvent.count({
      where: { taskId: task.id, action: "human_unit_published" },
    });
    expect(events).toBe(1);
  });

  /**
   * A second call is a redelivered webhook, a retried sweep, or two ticks
   * racing. It must change nothing rather than publish twice.
   */
  it("is idempotent: a second call publishes nothing further", async () => {
    const { run, unit, task } = await admittedRunReadyToPublish();
    await publishHumanWorkUnit(run.id);
    const second = await publishHumanWorkUnit(run.id);
    expect(second.published).toBe(false);

    const rows = await prisma.humanWorkUnitTransition.count({
      where: { unitStateId: unit.id },
    });
    expect(rows).toBe(2);
    const alerts = await prisma.humanWorkUnitAlert.count({ where: { unitStateId: unit.id } });
    expect(alerts).toBe(1);
    const events = await prisma.taskEvent.count({
      where: { taskId: task.id, action: "human_unit_published" },
    });
    expect(events).toBe(1);
  });

  /**
   * SC-006 / FR-031 / INV-15. Nothing bills while a person is being waited on.
   */
  it("spends nothing: no budget hold and no tool invocation while waiting", async () => {
    const { run } = await admittedRunReadyToPublish();
    await publishHumanWorkUnit(run.id);
    expect(await prisma.workflowBudgetHold.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.taskToolInvocation.count({ where: { stepRun: { runId: run.id } } })
    ).toBe(0);
  });
});

describe("pre-transaction refusals pause the unit and publish nothing", () => {
  /**
   * A REFUSAL IS A UNIT TRANSITION, NOT JUST A RUN PAUSE.
   *
   * contracts/audit-events.md §1 names both of these as `admitted -> paused`
   * transitions with their own causes, and FR-050 requires TWO records per
   * transition written in the same transaction as the transition itself: the
   * primary `HumanWorkUnitTransition` row and the `TaskEvent` mirror.
   *
   * Pausing only the workflow run would leave the unit reading `admitted`
   * forever. An operator opening the admin surface would be told the unit is
   * waiting to publish, and the audit trail would carry no record of why it
   * never did. The state and the reason move together or the state is a lie.
   *
   * Both refusals are decided BEFORE the transaction opens. Discovering one
   * halfway through would mean rolling back a task transition and a batch of
   * pool notifications, and a notification for a move that then rolls back is
   * worse than none.
   */

  /** Everything a refusal must have written, and everything it must not. */
  async function expectPausedByRefusal(input: {
    unitId: string;
    runId: string;
    taskId: string;
    cause: "input_unavailable" | "classification_conflict";
    detailMatches: RegExp;
  }) {
    const unit = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: input.unitId },
      select: {
        state: true,
        refusalCause: true,
        pausedDetail: true,
        transitionSeq: true,
        publishedAt: true,
        publicationDeadlineAt: true,
      },
    });
    expect(unit.state).toBe("paused");
    expect(unit.refusalCause).toBe(input.cause);
    expect(unit.pausedDetail).toMatch(input.detailMatches);
    // Nothing about publication happened.
    expect(unit.publishedAt).toBeNull();
    expect(unit.publicationDeadlineAt).toBeNull();
    // Allocated monotonically in the same CAS as the state change (C7).
    expect(unit.transitionSeq).toBe(2);

    /**
     * `pausedDetail` is operator-facing and separately constrained: no money
     * value and no identity-bearing text (FR-049). Leaking either would put it
     * on a surface the audit table was deliberately shaped to exclude.
     */
    expect(unit.pausedDetail ?? "").not.toMatch(/\$|\bcents\b|payout|price|@/i);

    const transitions = await prisma.humanWorkUnitTransition.findMany({
      where: { unitStateId: input.unitId },
      orderBy: { seq: "asc" },
      select: {
        seq: true,
        cause: true,
        fromState: true,
        toState: true,
        actorRole: true,
        actorId: true,
      },
    });
    expect(transitions).toHaveLength(2);
    expect(transitions[1]).toMatchObject({
      seq: 2,
      cause: `paused:${input.cause}`,
      fromState: "admitted",
      toState: "paused",
      actorRole: "system",
      // A system transition has no actor. An id here would be a person being
      // recorded as responsible for a machine's refusal.
      actorId: null,
    });

    // The mirror, written in the same transaction (FR-050).
    const mirrored = await prisma.taskEvent.count({
      where: { taskId: input.taskId, action: "human_unit_paused" },
    });
    expect(mirrored).toBe(1);

    const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: input.runId },
      select: { status: true, pausedReason: true },
    });
    expect(run.status).toBe("paused");
    expect(run.pausedReason).toMatch(input.detailMatches);

    // NOTHING was published: the task never left ai_processing, no worker was
    // told, and no publication clock was started.
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: input.taskId },
      select: { status: true },
    });
    expect(task.status).toBe("ai_processing");
    expect(await prisma.notification.count({ where: { taskId: input.taskId } })).toBe(0);
    expect(await prisma.humanWorkUnitAlert.count({ where: { unitStateId: input.unitId } })).toBe(0);
    expect(
      await prisma.taskEvent.count({
        where: { taskId: input.taskId, action: "human_unit_published" },
      })
    ).toBe(0);
  }

  it("input_unavailable: a producing step failed permanently", async () => {
    const { run, unit, task } = await admittedRunReadyToPublish({ producerStatus: "failed" });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(false);
    expect(outcome.cause).toBe("input_unavailable");

    await expectPausedByRefusal({
      unitId: unit.id,
      runId: run.id,
      taskId: task.id,
      cause: "input_unavailable",
      detailMatches: /input/i,
    });
  });

  /**
   * The unit would show a worker material classified more restrictively than
   * the unit itself. Publishing would be a downgrade by omission: the material
   * keeps its sensitivity while the unit stops declaring it.
   */
  it("classification_conflict: an input is more restrictive than the unit", async () => {
    const { run, unit, task } = await admittedRunReadyToPublish({
      dataClass: "business_confidential",
      inputClass: "personal_sensitive",
    });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(false);
    expect(outcome.cause).toBe("classification_conflict");

    await expectPausedByRefusal({
      unitId: unit.id,
      runId: run.id,
      taskId: task.id,
      cause: "classification_conflict",
      detailMatches: /classification|classified/i,
    });
  });

  /**
   * A retried sweep, a redelivered webhook, or two drain ticks racing. The CAS
   * on `admitted` means a second call finds `paused` and writes nothing, so the
   * audit trail carries one refusal rather than a pile of identical ones.
   */
  it.each([
    ["input_unavailable", { producerStatus: "failed" }] as const,
    [
      "classification_conflict",
      { dataClass: "business_confidential", inputClass: "personal_sensitive" },
    ] as const,
  ])("a repeated call after %s creates no duplicate", async (_cause, over) => {
    const { run, unit, task } = await admittedRunReadyToPublish(over);
    await publishHumanWorkUnit(run.id);
    const second = await publishHumanWorkUnit(run.id);
    expect(second.published).toBe(false);

    expect(
      await prisma.humanWorkUnitTransition.count({ where: { unitStateId: unit.id } })
    ).toBe(2);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: "human_unit_paused" } })
    ).toBe(1);
    const unitAfter = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { transitionSeq: true, state: true },
    });
    expect(unitAfter.transitionSeq).toBe(2);
    expect(unitAfter.state).toBe("paused");
  });

  it("permits an input no more restrictive than the unit", async () => {
    const { run, unit } = await admittedRunReadyToPublish({
      dataClass: "personal_sensitive",
      inputClass: "business_confidential",
    });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(true);
    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, refusalCause: true },
    });
    expect(after.state).toBe("published");
    expect(after.refusalCause).toBeNull();
  });

  it("refuses a run with no admitted unit, without throwing", async () => {
    const task = await createTask({ status: "ai_processing" });
    const planVersion = await prisma.taskExecutionPlanVersion.create({
      data: {
        taskId: task.id,
        version: 1,
        source: "ai_generated" as never,
        deliverableDescription: "none",
        assumptions: [],
        exclusions: [],
        internalCostLikelyCents: 1,
        internalCostConservativeCents: 1,
        suggestedPriceCents: 1,
        suggestedVaPayoutCents: 1,
        calibration: "calibrated" as never,
      },
      select: { id: true },
    });
    const snapshot = await prisma.taskAcceptanceSnapshot.create({
      data: {
        taskId: task.id,
        planVersionId: planVersion.id,
        clientPriceCents: 1,
        currency: "USD",
        title: "none",
        description: "c",
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
      },
      select: { id: true },
    });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(false);
  });
});

/**
 * THE RUNTIME WIRING (T034).
 *
 * `advanceWorkflow` is the drain: it runs machine steps until there are none
 * left to run. An admitted run changes what "none left" means twice over.
 *
 * Before this wiring, an admitted run was actively harmful. Its blocked
 * descendants are `executionMode: "automated"` with a status that is not
 * `done`, so the old tail counted them as remaining and the run never
 * finished; and the moment publication moved the task to `open`, the very next
 * tick saw a task outside `ai_processing` and ABANDONED the run — throwing away
 * a mandate a person was at that moment being asked to work on.
 */
describe("T034 — the drain tail publishes at the cut", () => {
  it("publishes when the next incomplete step is the cut", async () => {
    const { task, run, unit } = await admittedRunReadyToPublish();
    await advanceWorkflow(task.id);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true },
    });
    expect(after.state).toBe("published");

    const runAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true },
    });
    expect(runAfter.status).toBe("awaiting_human_unit");

    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true },
    });
    expect(taskAfter.status).toBe("open");
  });

  /**
   * The pre-cut block has NOT drained. Publishing here would hand a worker a
   * unit whose inputs do not exist yet.
   */
  it("does not publish while a pre-cut step is still incomplete", async () => {
    const { task, run, unit } = await admittedRunReadyToPublish({
      producerStatus: "pending",
    });
    await advanceWorkflow(task.id);

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, publishedAt: true },
    });
    expect(after.state).toBe("admitted");
    expect(after.publishedAt).toBeNull();

    const runAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true },
    });
    expect(runAfter.status).not.toBe("awaiting_human_unit");

    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true },
    });
    expect(taskAfter.status).toBe("ai_processing");
  });

  /**
   * A redelivered webhook, a cron tick landing on top of an `after()` call, or
   * simply the next scheduled drain. None may publish a second time.
   */
  it("replays without publishing twice", async () => {
    const { task, unit } = await admittedRunReadyToPublish();
    await advanceWorkflow(task.id);
    await advanceWorkflow(task.id);
    await advanceWorkflow(task.id);

    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: unit.id, cause: "published" },
      })
    ).toBe(1);
    expect(await prisma.humanWorkUnitAlert.count({ where: { unitStateId: unit.id } })).toBe(1);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: "human_unit_published" } })
    ).toBe(1);
  });
});

describe("T034 — finishAdmittedRun only when every step is done", () => {
  /** All steps done, unit terminal: the admitted run is over. */
  async function allDone(unitState: string) {
    const built = await admittedRunReadyToPublish();
    await prisma.taskWorkflowStepRun.updateMany({
      where: { runId: built.run.id },
      data: { status: "done" },
    });
    await prisma.humanWorkUnitRunState.update({
      where: { id: built.unit.id },
      data: { state: unitState as never, acceptedAt: new Date() },
    });
    // The worker holds the task through delivery; the run finishing does not
    // take it away from them.
    await prisma.task.update({
      where: { id: built.task.id },
      data: { status: "claimed" as never, claimedById: (await createWorker()).id },
    });
    return built;
  }

  it("finishes the run and leaves the task with its claimant", async () => {
    const { task, run } = await allDone("resumed");
    await advanceWorkflow(task.id);

    const runAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, finishedAt: true },
    });
    expect(runAfter.status).toBe("done");
    expect(runAfter.finishedAt).not.toBeNull();

    /**
     * FR-057. The run ending is not a payout event: the same claimant delivers
     * through the existing QC path at the accepted fixed payout.
     */
    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, claimedById: true, vaPayoutCents: true, estimatedMinutes: true },
    });
    expect(taskAfter.status).toBe("claimed");
    expect(taskAfter.claimedById).not.toBeNull();
    expect(taskAfter.vaPayoutCents).toBe(4_000);
    expect(taskAfter.estimatedMinutes).toBe(60);
    expect(await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } })).toBe(0);
  });

  it("does not finish while a blocked descendant is still waiting", async () => {
    const { task, run, unit } = await admittedRunReadyToPublish();
    await prisma.humanWorkUnitRunState.update({
      where: { id: unit.id },
      data: { state: "published" as never, publishedAt: new Date() },
    });
    await advanceWorkflow(task.id);

    const runAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, finishedAt: true },
    });
    expect(runAfter.status).not.toBe("done");
    expect(runAfter.finishedAt).toBeNull();
  });
});

describe("T034 — an admitted run is not abandoned while a person holds it", () => {
  /**
   * THE LOAD-BEARING GUARD.
   *
   * The existing rule is right for every other run: a task that left
   * `ai_processing` was cancelled or finished elsewhere, and a run that keeps
   * executing against it burns money on a mandate nobody wants.
   *
   * An admitted run is the exception the rule never anticipated. Publication
   * deliberately moves the task to `open` so a worker can claim it, and a claim
   * moves it to `claimed`. Under the old guard the next tick would abandon the
   * run in both states — discarding the machine block behind a person who is
   * actively working, with no way back.
   */
  async function admittedRunWithTask(taskStatus: string) {
    const built = await admittedRunReadyToPublish();
    await prisma.humanWorkUnitRunState.update({
      where: { id: built.unit.id },
      data: { state: "published" as never, publishedAt: new Date() },
    });
    if (taskStatus === "claimed") {
      await prisma.task.update({
        where: { id: built.task.id },
        data: { status: "open" as never },
      });
      await prisma.task.update({
        where: { id: built.task.id },
        data: { status: "claimed" as never, claimedById: (await createWorker()).id },
      });
    } else {
      await prisma.task.update({
        where: { id: built.task.id },
        data: { status: taskStatus as never },
      });
    }
    return built;
  }

  it.each(["open", "claimed"])("survives a drain tick while the task is %s", async (status) => {
    const { task, run } = await admittedRunWithTask(status);
    await advanceWorkflow(task.id);

    const after = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, pausedReason: true },
    });
    expect(after.status).not.toBe("abandoned");
    expect(after.pausedReason ?? "").not.toMatch(/left ai_processing/i);
  });

  /**
   * Fail-closed is unchanged where it should be. A cancelled or expired
   * mandate stops, admitted or not: nobody is owed that work any more.
   */
  it.each(["cancelled", "expired"])("still abandons when the task is %s", async (status) => {
    const { task, run } = await admittedRunWithTask(status);
    await advanceWorkflow(task.id);

    const after = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true },
    });
    expect(after.status).toBe("abandoned");
  });

  /**
   * The widening is scoped to admitted runs; everything else keeps failing
   * closed exactly as before.
   *
   * Built from scratch rather than by deleting a unit: `INV-7` refuses to let
   * an audit row be deleted outside the retention purge, and it is right to.
   * A test that had to disable an append-only guard to set up its fixture
   * would be proving something about a database this product does not run.
   */
  it("still abandons a run with no unit when its task is open", async () => {
    const task = await createTask({ status: "open" });
    const planVersion = await prisma.taskExecutionPlanVersion.create({
      data: {
        taskId: task.id,
        version: 1,
        source: "ai_generated" as never,
        deliverableDescription: "no unit",
        assumptions: [],
        exclusions: [],
        internalCostLikelyCents: 1,
        internalCostConservativeCents: 1,
        suggestedPriceCents: 1,
        suggestedVaPayoutCents: 1,
        calibration: "calibrated" as never,
      },
      select: { id: true },
    });
    const snapshot = await prisma.taskAcceptanceSnapshot.create({
      data: {
        taskId: task.id,
        planVersionId: planVersion.id,
        clientPriceCents: 1,
        currency: "USD",
        title: "no unit",
        description: "c",
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
      },
      select: { id: true },
    });

    await advanceWorkflow(task.id);
    const after = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true },
    });
    expect(after.status).toBe("abandoned");
  });

});
