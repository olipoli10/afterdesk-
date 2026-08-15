import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import { REGISTRY } from "@/lib/ai-work-engine/registry";
import type { WorkflowPayload } from "@/lib/ai-work-engine/primitives/types";
import { compileFrozenOutputSchema } from "@/lib/ai-work-engine/human-unit-result-schema";
import { vaPoolSelect } from "@/lib/queries/tasks";
import { readObject } from "@/lib/storage";
import { publishHumanWorkUnit } from "@/server/human-unit";
import { persistPayload } from "@/server/workflow-artifacts";
import { createTask, createWorker } from "./fixtures";

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return {
    ...actual,
    requireApprovedVa: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return { ...actual, revalidatePath: vi.fn() };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

const { requireApprovedVa, requireRole } = await import("@/lib/authz");
const { claimTask, submitDeliverable } = await import("@/server/actions/va-tasks");
const { startWorkerSession } = await import("@/server/actions/work-sessions");
const { approveDeliverable } = await import("@/server/actions/admin-qc");
const { applyResume } = await import("@/server/human-unit-resume");
const { advanceWorkflow, compileWorkflowForTask } = await import("@/server/workflow-runs");

/**
 * QUICKSTART SCENARIO A — MACHINE → HUMAN → MACHINE (T024).
 *
 * The publication tests keep each T2 refusal and idempotence boundary narrow.
 * The final test then walks one accepted mandate through all eleven observable
 * lifecycle steps and diffs the accepted contract field-for-field and the
 * pre-cut artifact byte-for-byte after payout.
 *
 * The reason publication is the dangerous moment: it is the first time the
 * mandate becomes visible to someone outside the transaction that created it.
 * If the payout moved, if the task reached the pool with nobody told, if a
 * provider hold was still open, or if the audit row went missing, every one of
 * those is discovered by a worker rather than by us.
 */

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowId: { type: "string" },
          unitKey: { type: "string" },
          fields: {
            type: "object",
            properties: { email: { type: "string" } },
            required: ["email"],
          },
          sources: {
            type: "object",
            properties: {
              email: { type: "array", items: { type: "string" } },
            },
            required: ["email"],
          },
          status: { type: "string" },
          reviewReason: { type: "string" },
        },
        required: ["rowId", "unitKey", "fields", "sources", "status", "reviewReason"],
      },
    },
    unitsTotal: { type: "integer" },
    requestedFields: { type: "array", items: { type: "string" } },
  },
  required: ["rows", "unitsTotal", "requestedFields"],
};

const ACCEPTED_RESULT: WorkflowPayload = {
  rows: [
    {
      rowId: "human#1",
      unitKey: "human-accepted-row",
      fields: { email: " Alice@EXAMPLE.COM " },
      sources: { email: ["https://source.example/human"] },
      status: "needs_review",
      reviewReason: "Accepted by the independent reviewer.",
    },
  ],
  unitsTotal: 1,
  requestedFields: ["email"],
};

const PRE_CUT_PAYLOAD: WorkflowPayload = {
  rows: [
    {
      rowId: "machine#1",
      unitKey: "pre-cut-machine-row",
      fields: { email: "producer@example.com" },
      sources: { email: ["https://source.example/machine"] },
      status: "needs_review",
      reviewReason: "Waiting for human judgment.",
    },
  ],
  unitsTotal: 1,
  requestedFields: ["email"],
};

const MACHINE_PRIMITIVE_ID = "normalize.contact_fields";
const MACHINE_PRIMITIVE_VERSION = REGISTRY[MACHINE_PRIMITIVE_ID].version;
const FROZEN_AUTOMATION_CEILING = 25_000n;
const FROZEN_POLICY_VERSION = "lifecycle-policy-v1";

function asWorker(workerId: string) {
  vi.mocked(requireApprovedVa).mockResolvedValue({ id: workerId, role: "VA" } as never);
}

function asAdmin(adminId: string) {
  vi.mocked(requireRole).mockResolvedValue({ id: adminId, role: "ADMIN" } as never);
}

async function createAdmin() {
  return prisma.user.create({
    data: {
      name: "Lifecycle Admin",
      email: `lifecycle-admin-${randomUUID()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
}

beforeEach(() => {
  vi.mocked(requireApprovedVa).mockReset();
  vi.mocked(requireRole).mockReset();
});

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
  executableMachineSteps?: boolean;
}) {
  const task = await createTask({
    status: "ai_processing",
    clientPriceCents: 10_000,
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
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: FROZEN_AUTOMATION_CEILING,
      automationCostPolicyVersion: FROZEN_POLICY_VERSION,
      dataClass: over?.dataClass ?? "business_confidential",
      dataClassSignals: ["accepted lifecycle fixture"],
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
        primitiveId:
          executor === "human" || !over?.executableMachineSteps
            ? null
            : MACHINE_PRIMITIVE_ID,
        primitiveVersion:
          executor === "human" || !over?.executableMachineSteps
            ? null
            : MACHINE_PRIMITIVE_VERSION,
        params: {},
        fixedMinutes: executor === "human" ? 30 : null,
        estimatedMinutesOptimistic: 10,
        estimatedMinutesLikely: 20,
        estimatedMinutesConservative: 30,
        verificationMethod: "sample_check",
        acceptanceCriteria: ["ok"],
        riskLevel: "low" as never,
        dependsOnOrder: deps,
        expectedCostMicrosAtQuote:
          executor === "human" || !over?.executableMachineSteps ? null : 0n,
        maxCostMicrosPerAttemptAtQuote:
          executor === "human" || !over?.executableMachineSteps ? null : 0n,
        maxAttemptsAtQuote:
          executor === "human" || !over?.executableMachineSteps ? null : 1,
        automationCostPolicyVersion:
          executor === "human" || !over?.executableMachineSteps
            ? null
            : FROZEN_POLICY_VERSION,
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
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: FROZEN_AUTOMATION_CEILING,
      automationCostPolicyVersion: FROZEN_POLICY_VERSION,
      dataClass: over?.dataClass ?? "business_confidential",
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: planVersion.id,
      status: "running" as never,
      automatedStepCount: 2,
      humanStepCount: 1,
      unitsTotal: 1,
      unitsResolvedAutomatically: 0,
      runAutomationBudgetMicros: FROZEN_AUTOMATION_CEILING,
      budgetPolicyVersion: FROZEN_POLICY_VERSION,
      steps: {
        create: [
          {
            planStepId: producer.id,
            order: 1,
            primitiveId: over?.executableMachineSteps ? MACHINE_PRIMITIVE_ID : null,
            primitiveVersion: over?.executableMachineSteps
              ? MACHINE_PRIMITIVE_VERSION
              : null,
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
            primitiveId: over?.executableMachineSteps ? MACHINE_PRIMITIVE_ID : null,
            primitiveVersion: over?.executableMachineSteps
              ? MACHINE_PRIMITIVE_VERSION
              : null,
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
  return { task, run, unit, definition, snapshot, planVersion };
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

/**
 * The values a client and worker already accepted. Lifecycle state, audit
 * evidence and the eventual payout are deliberately excluded: those are the
 * additive facts this scenario is supposed to create. Everything returned by
 * this helper must compare exactly before publication and after QC.
 */
async function acceptedContract(taskId: string, preCutArtifactId: string) {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      title: true,
      description: true,
      quantity: true,
      clientPriceCents: true,
      vaPayoutCents: true,
      estimatedMinutes: true,
      acceptanceSnapshot: {
        select: {
          id: true,
          planVersionId: true,
          clientPriceCents: true,
          currency: true,
          title: true,
          description: true,
          quantity: true,
          clientDeadlineUtc: true,
          deliverableDescription: true,
          assumptions: true,
          exclusions: true,
          disputeCriteria: true,
          revisionWindowHours: true,
          maxRevisionRounds: true,
          disputeWindowHours: true,
          acceptedByUserId: true,
          expectedAutomationCostMicros: true,
          conservativeAutomationCostMicros: true,
          automationSpendCeilingMicros: true,
          automationCostPolicyVersion: true,
          dataClass: true,
        },
      },
      planVersions: {
        orderBy: { version: "asc" },
        select: {
          id: true,
          version: true,
          source: true,
          deliverableDescription: true,
          assumptions: true,
          exclusions: true,
          internalCostLikelyCents: true,
          internalCostConservativeCents: true,
          suggestedPriceCents: true,
          suggestedVaPayoutCents: true,
          expectedAutomationCostMicros: true,
          conservativeAutomationCostMicros: true,
          automationSpendCeilingMicros: true,
          automationCostPolicyVersion: true,
          dataClass: true,
          dataClassSignals: true,
          steps: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              title: true,
              description: true,
              executor: true,
              humanRole: true,
              primitiveId: true,
              primitiveVersion: true,
              params: true,
              fixedMinutes: true,
              secondsPerUnit: true,
              estimatedMinutesOptimistic: true,
              estimatedMinutesLikely: true,
              estimatedMinutesConservative: true,
              expectedCostMicrosAtQuote: true,
              maxCostMicrosPerAttemptAtQuote: true,
              maxAttemptsAtQuote: true,
              automationCostPolicyVersion: true,
              humanOutputSchema: true,
              humanRequiredArtifactKinds: true,
              verificationMethod: true,
              acceptanceCriteria: true,
              riskLevel: true,
              dependsOnOrder: true,
            },
          },
        },
      },
      workflowRun: {
        select: {
          snapshotId: true,
          planVersionId: true,
          runAutomationBudgetMicros: true,
          budgetPolicyVersion: true,
          humanWorkUnit: {
            select: {
              snapshotId: true,
              definition: {
                select: {
                  planVersionId: true,
                  planStepId: true,
                  instructions: true,
                  declaredInputs: true,
                  outputSchema: true,
                  requiredArtifactKinds: true,
                  acceptanceCriteria: true,
                  verificationMethod: true,
                  eligibility: true,
                  reviewerAuthority: true,
                  expectedMinutes: true,
                  revisionBound: true,
                  publicationDeadlineHours: true,
                  submissionDeadlineHours: true,
                  claimLeaseHours: true,
                  economicProvenance: true,
                  dataClass: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const artifact = await prisma.file.findUniqueOrThrow({
    where: { id: preCutArtifactId },
    select: {
      id: true,
      taskId: true,
      kind: true,
      uploaderId: true,
      storageKey: true,
      fileName: true,
      mime: true,
      sizeBytes: true,
      scanStatus: true,
      detectedMime: true,
      sha256: true,
      workflowRunId: true,
      workflowStepRunId: true,
      artifactVisibility: true,
      purgedAt: true,
    },
  });

  return {
    scopeAndEconomics: task,
    storedArtifact: {
      record: artifact,
      bytesBase64: (await readObject(artifact.storageKey)).toString("base64"),
    },
  };
}

/**
 * T024 is allowed to seed the User Story 2 review gate. The fixture still
 * writes the same durable facts that gate will own: one typed candidate, one
 * submitted transition, one independent acceptance, the cut step completed,
 * and one accepted transition. `applyResume` remains entirely production.
 */
async function seedAcceptedHumanResult(input: {
  unitId: string;
  runId: string;
  definitionId: string;
  workerId: string;
  adminId: string;
}) {
  const schema = compileFrozenOutputSchema(OUTPUT_SCHEMA);
  expect(schema, "the accepted human output contract must compile").not.toBeNull();
  expect(schema!.safeParse(ACCEPTED_RESULT).success).toBe(true);

  const claimed = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
    where: { id: input.unitId },
    select: { state: true, claimGeneration: true, resumeGeneration: true, transitionSeq: true },
  });
  expect(claimed.state).toBe("claimed");

  const candidate = await prisma.$transaction(async (tx) => {
    const created = await tx.humanWorkUnitCandidate.create({
      data: {
        unitStateId: input.unitId,
        claimGeneration: claimed.claimGeneration,
        revisionIndex: 0,
        submittedById: input.workerId,
        payload: ACCEPTED_RESULT as never,
      },
      select: { id: true },
    });
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: {
        id: input.unitId,
        state: "claimed",
        claimGeneration: claimed.claimGeneration,
        transitionSeq: claimed.transitionSeq,
      },
      data: {
        state: "submitted",
        submittedAt: new Date(),
        transitionSeq: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: input.unitId,
        seq: claimed.transitionSeq + 1,
        actorId: input.workerId,
        actorRole: "worker",
        fromState: "claimed",
        toState: "submitted",
        cause: "submitted",
        claimGeneration: claimed.claimGeneration,
        resumeGeneration: claimed.resumeGeneration,
      },
    });
    return created;
  });

  const submitted = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
    where: { id: input.unitId },
    select: { transitionSeq: true },
  });
  await prisma.$transaction(async (tx) => {
    const decision = await tx.humanWorkUnitReviewDecision.create({
      data: {
        candidateId: candidate.id,
        unitStateId: input.unitId,
        decidedById: input.adminId,
        outcome: "accepted",
        remainingRevisionsAfter: 2,
        claimGeneration: claimed.claimGeneration,
      },
      select: { id: true },
    });
    await tx.humanWorkUnitCandidate.update({
      where: { id: candidate.id },
      data: { status: "accepted" },
    });
    await tx.humanWorkUnitAcceptance.create({
      data: {
        unitStateId: input.unitId,
        candidateId: candidate.id,
        decisionId: decision.id,
        acceptedById: input.adminId,
        claimGenerationAtAcceptance: claimed.claimGeneration,
        resultPayload: ACCEPTED_RESULT as never,
        resultSha256: createHash("sha256")
          .update(JSON.stringify(ACCEPTED_RESULT))
          .digest("hex"),
        dataClass: "business_confidential",
        criteriaVersionRef: input.definitionId,
      },
    });
    const moved = await tx.humanWorkUnitRunState.updateMany({
      where: {
        id: input.unitId,
        state: "submitted",
        claimGeneration: claimed.claimGeneration,
        transitionSeq: submitted.transitionSeq,
      },
      data: {
        state: "accepted",
        acceptedAt: new Date(),
        transitionSeq: { increment: 1 },
      },
    });
    expect(moved.count).toBe(1);
    const finishedCut = await tx.taskWorkflowStepRun.updateMany({
      where: { runId: input.runId, order: 2, status: "handed_to_human" },
      data: { status: "done", finishedAt: new Date() },
    });
    expect(finishedCut.count).toBe(1);
    await tx.humanWorkUnitTransition.create({
      data: {
        unitStateId: input.unitId,
        seq: submitted.transitionSeq + 1,
        actorId: input.adminId,
        actorRole: "admin",
        fromState: "submitted",
        toState: "accepted",
        cause: "accepted",
        claimGeneration: claimed.claimGeneration,
        resumeGeneration: claimed.resumeGeneration,
      },
    });
  });
}

describe("T024 — Scenario A steps 1-11, accepted result to fixed payout", () => {
  it("runs the accepted human result downstream exactly once without changing the contract", async () => {
    const worker = await createWorker();
    const admin = await createAdmin();
    const { task, run, unit, definition, snapshot } = await admittedRunReadyToPublish({
      executableMachineSteps: true,
    });
    const [producer, downstream] = await Promise.all([
      prisma.taskWorkflowStepRun.findFirstOrThrow({
        where: { runId: run.id, order: 1 },
        select: { id: true, status: true },
      }),
      prisma.taskWorkflowStepRun.findFirstOrThrow({
        where: { runId: run.id, order: 3 },
        select: { id: true, status: true },
      }),
    ]);
    await persistPayload({
      taskId: task.id,
      runId: run.id,
      stepRunId: producer.id,
      snapshotId: snapshot.id,
      order: 1,
      payload: PRE_CUT_PAYLOAD,
    });
    const preCutArtifact = await prisma.file.findFirstOrThrow({
      where: { workflowStepRunId: producer.id, fileName: "payload.json" },
      select: { id: true },
    });
    const contractBefore = await acceptedContract(task.id, preCutArtifact.id);

    // 1. Pre-cut complete; the downstream machine work is blocked, not human.
    expect(producer.status).toBe("done");
    expect(downstream.status).toBe("blocked_on_human_unit");
    expect(
      await prisma.taskWorkflowStepRun.count({
        where: { runId: run.id, order: 3, status: "handed_to_human" },
      })
    ).toBe(0);

    // 2-4. The production drain publishes once at the cut and freezes money.
    await advanceWorkflow(task.id);
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { state: true },
      })
    ).toEqual({ state: "published" });
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true },
      })
    ).toEqual({ status: "awaiting_human_unit" });
    const poolTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: vaPoolSelect,
    });
    expect(poolTask).toMatchObject({ vaPayoutCents: 4_000, estimatedMinutes: 60 });
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        select: { status: true, claimedById: true },
      })
    ).toEqual({ status: "open", claimedById: null });
    expect(await prisma.taskHumanWorkPackage.count({ where: { runId: run.id } })).toBe(0);
    expect(await prisma.workflowBudgetHold.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: downstream.id },
        select: { status: true, attempts: true, lockedBy: true },
      })
    ).toEqual({ status: "blocked_on_human_unit", attempts: 0, lockedBy: null });

    // 5. One claim binds Task and unit to the same worker at generation one.
    asWorker(worker.id);
    const claim = await claimTask(task.id);
    expect(claim.ok, !claim.ok ? claim.error : "claim must succeed").toBe(true);
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        select: { status: true, claimedById: true },
      })
    ).toEqual({ status: "claimed", claimedById: worker.id });
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { state: true, claimedById: true, claimGeneration: true },
      })
    ).toEqual({ state: "claimed", claimedById: worker.id, claimGeneration: 1 });
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: {
          unitStateId: unit.id,
          cause: "claimed",
          actorId: worker.id,
          assignmentEstablished: true,
        },
      })
    ).toBe(1);

    // 6. T024 freezes only the allowlist; T054/T055 own the worker SQL view.
    const workerInputs = await prisma.humanWorkUnitDefinition.findUniqueOrThrow({
      where: { id: definition.id },
      select: { declaredInputs: true },
    });
    expect(workerInputs.declaredInputs).toEqual([
      {
        kind: "artifact",
        ref: "step:1",
        label: "step 1",
        dataClass: "business_confidential",
      },
    ]);
    expect(JSON.stringify(workerInputs)).not.toMatch(/clientPrice|payout|credential|secret/i);

    // 7-8. Seed the later review gate, but prove its durable evidence exactly.
    await seedAcceptedHumanResult({
      unitId: unit.id,
      runId: run.id,
      definitionId: definition.id,
      workerId: worker.id,
      adminId: admin.id,
    });
    expect(await prisma.humanWorkUnitCandidate.count({ where: { unitStateId: unit.id } })).toBe(1);
    expect(
      await prisma.humanWorkUnitTransition.count({
        where: { unitStateId: unit.id, cause: "submitted", actorId: worker.id },
      })
    ).toBe(1);
    expect(await prisma.humanWorkUnitAcceptance.count({ where: { unitStateId: unit.id } })).toBe(1);
    expect(
      await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: unit.id },
        select: { state: true },
      })
    ).toEqual({ state: "accepted" });

    // 9. One durable resume releases the eligible machine step once.
    const resumed = await applyResume(unit.id);
    expect(resumed).toMatchObject({
      resumed: true,
      resumeGeneration: 1,
      resumedStepRunIds: [downstream.id],
      skippedStepRunIds: [],
    });
    expect(await applyResume(unit.id)).toEqual({ resumed: false, cause: "already_resumed" });
    expect(await prisma.humanWorkUnitResumeRecord.count({ where: { runId: run.id } })).toBe(1);
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: downstream.id },
        select: { status: true, attempts: true },
      })
    ).toEqual({ status: "pending", attempts: 0 });
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: run.id },
        select: { status: true },
      })
    ).toEqual({ status: "running" });

    // 10-11. The accepted result is the first resumed input, exactly once.
    const drained = await advanceWorkflow(task.id);
    expect(drained).toEqual({ steps: 1, finished: true });
    expect(await advanceWorkflow(task.id)).toEqual({ steps: 0, finished: false });
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: downstream.id },
        select: { status: true, attempts: true },
      })
    ).toEqual({ status: "done", attempts: 1 });
    const downstreamArtifact = await prisma.file.findFirstOrThrow({
      where: { workflowStepRunId: downstream.id, fileName: "payload.json" },
      select: { storageKey: true },
    });
    const downstreamPayload = JSON.parse(
      (await readObject(downstreamArtifact.storageKey)).toString("utf8")
    ) as WorkflowPayload;
    expect(downstreamPayload.rows).toHaveLength(1);
    expect(downstreamPayload.rows[0]).toMatchObject({
      rowId: "human#1",
      unitKey: "human-accepted-row",
      fields: { email: "alice@example.com" },
    });
    expect(downstreamPayload.rows.map((row) => row.unitKey)).not.toContain(
      "pre-cut-machine-row"
    );
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: run.id },
        select: {
          status: true,
          actualAiCostMicros: true,
          actualToolCostMicros: true,
          runAutomationBudgetMicros: true,
        },
      })
    ).toEqual({
      status: "done",
      actualAiCostMicros: 0,
      actualToolCostMicros: 0,
      runAutomationBudgetMicros: FROZEN_AUTOMATION_CEILING,
    });
    expect(await prisma.workflowBudgetHold.count({ where: { runId: run.id } })).toBe(0);
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
        select: { status: true, claimedById: true },
      })
    ).toEqual({ status: "claimed", claimedById: worker.id });
    expect(
      await prisma.taskEvent.count({
        where: { taskId: task.id, action: "human_unit_run_finished" },
      })
    ).toBe(1);

    asWorker(worker.id);
    expect((await startWorkerSession(task.id)).ok).toBe(true);
    const delivery = await submitDeliverable({
      taskId: task.id,
      note: "Accepted human result processed and delivered.",
    });
    expect(delivery.ok, !delivery.ok ? delivery.error : "delivery must succeed").toBe(true);
    const submission = await prisma.submission.findFirstOrThrow({
      where: { taskId: task.id, vaId: worker.id, qcStatus: "pending" },
      select: { id: true },
    });
    asAdmin(admin.id);
    const approval = await approveDeliverable({
      submissionId: submission.id,
      rating: 5,
      identityVerified: true,
    });
    expect(approval.ok, !approval.ok ? approval.error : "approval must succeed").toBe(true);
    expect(
      await prisma.payout.findMany({
        where: { taskId: task.id },
        select: { vaId: true, amountCents: true, status: true },
      })
    ).toEqual([{ vaId: worker.id, amountCents: 4_000, status: "owed" }]);

    const contractAfter = await acceptedContract(task.id, preCutArtifact.id);
    expect(contractAfter).toEqual(contractBefore);
  });
});

const BUDGET_DEMOTION_REASON = HANDOFF_REASONS.budget_demoted;

/**
 * Scenario B starts from the accepted plan instead of hand-authoring the run.
 * That distinction is load-bearing for the budget case: economic preflight
 * clears primitiveId and leaves `demotedForBudget` as the durable explanation,
 * so only the real compiler can prove that explanation survives into the run.
 *
 * The moved-version row is then put back into its pre-resume blocked shape to
 * model the capability moving AFTER compilation. `applyResume` must re-check
 * it and demote it without touching the eligible sibling.
 */
async function partialResumeScenario() {
  await prisma.setting.upsert({
    where: { key: "humanWorkUnitResumeEnabled" },
    create: { key: "humanWorkUnitResumeEnabled", value: true },
    update: { value: true },
  });

  const worker = await createWorker();
  const admin = await createAdmin();
  const task = await createTask({
    status: "ai_processing",
    clientPriceCents: 10_000,
    vaPayoutCents: 4_000,
    estimatedMinutes: 60,
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

  const planVersion = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "partial resume",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 4_000,
      calibration: "calibrated" as never,
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: FROZEN_AUTOMATION_CEILING,
      automationCostPolicyVersion: FROZEN_POLICY_VERSION,
      dataClass: "business_confidential",
      dataClassSignals: ["accepted partial-resume fixture"],
    },
    select: { id: true },
  });

  const planStep = (input: {
    order: number;
    title: string;
    executor: "deterministic_code" | "human";
    primitiveId: string | null;
    primitiveVersion: number | null;
    demotedForBudget?: boolean;
  }) =>
    prisma.taskExecutionPlanStep.create({
      data: {
        planVersionId: planVersion.id,
        order: input.order,
        title: input.title,
        description: input.title,
        executor: input.executor as never,
        humanRole: input.executor === "human" ? ("worker" as never) : null,
        primitiveId: input.primitiveId,
        primitiveVersion: input.primitiveVersion,
        params: {},
        fixedMinutes: input.executor === "human" ? 30 : null,
        estimatedMinutesOptimistic: 10,
        estimatedMinutesLikely: 20,
        estimatedMinutesConservative: 30,
        expectedCostMicrosAtQuote:
          input.primitiveId === MACHINE_PRIMITIVE_ID ? 0n : null,
        maxCostMicrosPerAttemptAtQuote:
          input.primitiveId === MACHINE_PRIMITIVE_ID ? 0n : null,
        maxAttemptsAtQuote: input.primitiveId === MACHINE_PRIMITIVE_ID ? 1 : null,
        automationCostPolicyVersion: FROZEN_POLICY_VERSION,
        demotedForBudget: input.demotedForBudget ?? false,
        verificationMethod: "sample_check",
        acceptanceCriteria: ["ok"],
        riskLevel: "low" as never,
        dependsOnOrder: input.order === 1 ? [] : input.order === 2 ? [1] : [2],
        humanOutputSchema: input.executor === "human" ? OUTPUT_SCHEMA : undefined,
        humanRequiredArtifactKinds: [],
      },
      select: { id: true },
    });

  await planStep({
    order: 1,
    title: "produce",
    executor: "deterministic_code",
    primitiveId: MACHINE_PRIMITIVE_ID,
    primitiveVersion: MACHINE_PRIMITIVE_VERSION,
  });
  await planStep({
    order: 2,
    title: "judge",
    executor: "human",
    primitiveId: null,
    primitiveVersion: null,
  });
  await planStep({
    order: 3,
    title: "eligible sibling",
    executor: "deterministic_code",
    primitiveId: MACHINE_PRIMITIVE_ID,
    primitiveVersion: MACHINE_PRIMITIVE_VERSION,
  });
  await planStep({
    order: 4,
    title: "unknown capability",
    executor: "deterministic_code",
    primitiveId: "missing.capability",
    primitiveVersion: 1,
  });
  await planStep({
    order: 5,
    title: "moved capability version",
    executor: "deterministic_code",
    primitiveId: MACHINE_PRIMITIVE_ID,
    primitiveVersion: MACHINE_PRIMITIVE_VERSION + 1,
  });
  await planStep({
    order: 6,
    title: "budget demotion",
    executor: "deterministic_code",
    primitiveId: null,
    primitiveVersion: null,
    demotedForBudget: true,
  });

  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: planVersion.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "partial resume",
      description: "contract copy",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      expectedAutomationCostMicros: 0n,
      conservativeAutomationCostMicros: 0n,
      automationSpendCeilingMicros: FROZEN_AUTOMATION_CEILING,
      automationCostPolicyVersion: FROZEN_POLICY_VERSION,
      dataClass: "business_confidential",
    },
    select: { id: true },
  });

  const compiled = await compileWorkflowForTask(task.id);
  expect(compiled, "the supported one-cut plan must be admitted").not.toBeNull();
  const run = await prisma.taskWorkflowRun.findUniqueOrThrow({
    where: { taskId: task.id },
    select: {
      id: true,
      humanWorkUnit: { select: { id: true, definitionId: true } },
    },
  });
  expect(run.humanWorkUnit).not.toBeNull();

  const steps = await prisma.taskWorkflowStepRun.findMany({
    where: { runId: run.id },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const byOrder = new Map(steps.map((step) => [step.order, step.id]));
  const idAt = (order: number) => {
    const id = byOrder.get(order);
    if (!id) throw new Error(`missing step run at order ${order}`);
    return id;
  };

  await prisma.taskWorkflowStepRun.update({
    where: { id: idAt(1) },
    data: { status: "done" as never, finishedAt: new Date() },
  });
  await persistPayload({
    taskId: task.id,
    runId: run.id,
    stepRunId: idAt(1),
    snapshotId: snapshot.id,
    order: 1,
    payload: PRE_CUT_PAYLOAD,
  });

  // The accepted version becomes unavailable after compilation but before the
  // acceptance is applied. T10 owns this second, live executability check.
  await prisma.$transaction([
    prisma.taskWorkflowStepRun.update({
      where: { id: idAt(5) },
      data: {
        status: "blocked_on_human_unit" as never,
        executionMode: "automated" as never,
        handoffReason: null,
      },
    }),
    prisma.taskWorkflowRun.update({
      where: { id: run.id },
      data: {
        automatedStepCount: { increment: 1 },
        humanStepCount: { decrement: 1 },
      },
    }),
  ]);

  await advanceWorkflow(task.id);
  asWorker(worker.id);
  const claim = await claimTask(task.id);
  expect(claim.ok, !claim.ok ? claim.error : "claim must succeed").toBe(true);
  await seedAcceptedHumanResult({
    unitId: run.humanWorkUnit!.id,
    runId: run.id,
    definitionId: run.humanWorkUnit!.definitionId,
    workerId: worker.id,
    adminId: admin.id,
  });

  return {
    task,
    runId: run.id,
    unitId: run.humanWorkUnit!.id,
    worker,
    eligibleId: idAt(3),
    unknownId: idAt(4),
    movedId: idAt(5),
    budgetId: idAt(6),
  };
}

describe("T025 — Scenario B partial resume preserves every independent reason", () => {
  it("skips unknown, moved and budget-demoted work while one eligible sibling runs once", async () => {
    const fixture = await partialResumeScenario();

    const before = await prisma.taskWorkflowStepRun.findMany({
      where: {
        id: { in: [fixture.unknownId, fixture.movedId, fixture.budgetId] },
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        status: true,
        executionMode: true,
        handoffReason: true,
        planStep: { select: { demotedForBudget: true } },
      },
    });
    expect(before).toEqual([
      {
        id: fixture.unknownId,
        status: "handed_to_human",
        executionMode: "human",
        handoffReason: HANDOFF_REASONS.unknown_primitive,
        planStep: { demotedForBudget: false },
      },
      {
        id: fixture.movedId,
        status: "blocked_on_human_unit",
        executionMode: "automated",
        handoffReason: null,
        planStep: { demotedForBudget: false },
      },
      {
        id: fixture.budgetId,
        status: "handed_to_human",
        executionMode: "human",
        handoffReason: BUDGET_DEMOTION_REASON,
        planStep: { demotedForBudget: true },
      },
    ]);

    const outcome = await applyResume(fixture.unitId);
    expect(outcome.resumed).toBe(true);
    if (!outcome.resumed) throw new Error(`resume refused: ${outcome.cause}`);
    expect(outcome.resumedStepRunIds).toEqual([fixture.eligibleId]);
    expect(outcome.skippedStepRunIds).toEqual([
      fixture.unknownId,
      fixture.movedId,
      fixture.budgetId,
    ]);

    const record = await prisma.humanWorkUnitResumeRecord.findUniqueOrThrow({
      where: { runId: fixture.runId },
      select: { resumedStepRunIds: true, skippedStepRunIds: true },
    });
    expect(record).toEqual({
      resumedStepRunIds: [fixture.eligibleId],
      skippedStepRunIds: [fixture.unknownId, fixture.movedId, fixture.budgetId],
    });

    const after = await prisma.taskWorkflowStepRun.findMany({
      where: {
        id: {
          in: [fixture.eligibleId, fixture.unknownId, fixture.movedId, fixture.budgetId],
        },
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        status: true,
        executionMode: true,
        handoffReason: true,
        attempts: true,
        planStep: { select: { demotedForBudget: true } },
      },
    });
    expect(after).toEqual([
      {
        id: fixture.eligibleId,
        status: "pending",
        executionMode: "automated",
        handoffReason: null,
        attempts: 0,
        planStep: { demotedForBudget: false },
      },
      {
        id: fixture.unknownId,
        status: "handed_to_human",
        executionMode: "human",
        handoffReason: HANDOFF_REASONS.unknown_primitive,
        attempts: 0,
        planStep: { demotedForBudget: false },
      },
      {
        id: fixture.movedId,
        status: "handed_to_human",
        executionMode: "human",
        handoffReason: HANDOFF_REASONS.primitive_version_changed,
        attempts: 0,
        planStep: { demotedForBudget: false },
      },
      {
        id: fixture.budgetId,
        status: "handed_to_human",
        executionMode: "human",
        handoffReason: BUDGET_DEMOTION_REASON,
        attempts: 0,
        planStep: { demotedForBudget: true },
      },
    ]);
    expect(after.map((step) => step.handoffReason)).not.toContain(
      HANDOFF_REASONS.depends_on_human
    );

    expect(await advanceWorkflow(fixture.task.id)).toEqual({ steps: 1, finished: false });
    expect(await advanceWorkflow(fixture.task.id)).toEqual({ steps: 0, finished: false });
    expect(
      await prisma.taskWorkflowStepRun.findUniqueOrThrow({
        where: { id: fixture.eligibleId },
        select: { status: true, attempts: true },
      })
    ).toEqual({ status: "done", attempts: 1 });
    expect(
      await prisma.taskWorkflowStepRun.count({
        where: {
          id: { in: [fixture.unknownId, fixture.movedId, fixture.budgetId] },
          attempts: { gt: 0 },
        },
      })
    ).toBe(0);
    expect(
      await prisma.task.findUniqueOrThrow({
        where: { id: fixture.task.id },
        select: { status: true, claimedById: true },
      })
    ).toEqual({ status: "claimed", claimedById: fixture.worker.id });
    expect(
      await prisma.taskWorkflowRun.findUniqueOrThrow({
        where: { id: fixture.runId },
        select: { status: true },
      })
    ).toEqual({ status: "running" });
  });
});
