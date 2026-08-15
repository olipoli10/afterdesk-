import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { publishHumanWorkUnit } from "@/server/human-unit";
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

describe("pre-transaction refusals publish nothing", () => {
  /**
   * Both refusals below pause the run and leave the unit `admitted`. They are
   * deliberately checked BEFORE the transaction opens: a refusal discovered
   * halfway through would have to roll back a task transition and a set of
   * notifications, and a notification for a move that then rolls back is worse
   * than no notification at all.
   */
  it("input_unavailable when a producing step failed permanently", async () => {
    const { run, unit, task } = await admittedRunReadyToPublish({ producerStatus: "failed" });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(false);
    expect(outcome.cause).toBe("input_unavailable");

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true, publishedAt: true },
    });
    expect(after.state).toBe("admitted");
    expect(after.publishedAt).toBeNull();

    const runAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, pausedReason: true },
    });
    expect(runAfter.status).toBe("paused");
    expect(runAfter.pausedReason).toMatch(/input/i);

    // Nothing reached the pool.
    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true },
    });
    expect(taskAfter.status).toBe("ai_processing");
    expect(await prisma.notification.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.humanWorkUnitAlert.count({ where: { unitStateId: unit.id } })).toBe(0);
  });

  /**
   * The unit would show a worker material classified more restrictively than
   * the unit itself is. Publishing would be a downgrade by omission.
   */
  it("classification_conflict when an input is more restrictive than the unit", async () => {
    const { run, unit, task } = await admittedRunReadyToPublish({
      dataClass: "business_confidential",
      inputClass: "personal_sensitive",
    });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(false);
    expect(outcome.cause).toBe("classification_conflict");

    const after = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { id: unit.id },
      select: { state: true },
    });
    expect(after.state).toBe("admitted");

    const runAfter = await prisma.taskWorkflowRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { status: true, pausedReason: true },
    });
    expect(runAfter.status).toBe("paused");
    expect(runAfter.pausedReason).toMatch(/classification/i);

    const taskAfter = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true },
    });
    expect(taskAfter.status).toBe("ai_processing");
  });

  it("permits an input no more restrictive than the unit", async () => {
    const { run } = await admittedRunReadyToPublish({
      dataClass: "personal_sensitive",
      inputClass: "business_confidential",
    });
    const outcome = await publishHumanWorkUnit(run.id);
    expect(outcome.published).toBe(true);
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
