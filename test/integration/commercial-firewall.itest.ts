import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createClient, createTask } from "./fixtures";

/**
 * LOT B RELEASE GATE — THE COMMERCIAL FIREWALL, AGAINST REAL POSTGRES.
 *
 * Three properties an operator will bet real quotes on:
 *
 *   1. The pre-quote compile preview READS AND NOTHING ELSE. Two calls on
 *      the same task create zero rows anywhere and return identical facts.
 *   2. "Release to specialist pool" takes the sweep's exact degraded exit,
 *      now, with the operator's name on the audit event — once. A second
 *      click, or any non-paused state, is refused without touching state.
 *   3. An out_of_scope refusal is COUNTED (Closed Job Log category) while
 *      the operator's internal note never reaches the client: the client
 *      sees the money fact plus only the message written knowingly for them.
 */

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, getSessionUser: vi.fn(), requireRole: vi.fn() };
});
// The actions revalidate paths and schedule after() work; neither exists
// outside a Next request context, and neither is what this suite proves.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
const { requireRole } = await import("@/lib/authz");
const { cancelTask, releasePausedRunToPool } = await import("@/server/actions/admin");
const { compilePreviewForAdmin } = await import("@/lib/queries/plan");

const runNonce = randomUUID().replace(/-/g, "").slice(0, 10);
let seq = 0;
const uid = () => `cf${runNonce}${(seq++).toString(36)}`;

async function createAdmin() {
  return prisma.user.create({
    data: { name: "Integration Admin", email: `admin-${uid()}@it.local`, role: "ADMIN" },
    select: { id: true },
  });
}

/** A priced plan version with classification, the pricing screen's shape. */
async function createPlannedTask(opts?: { sensitive?: boolean }) {
  const task = await createTask({ status: "pricing_review" });
  await prisma.taskAiClassification.create({
    data: {
      taskId: task.id,
      objective: "Clean the attached supplier list",
      deliverableFormat: "csv",
      requiredFields: ["email"],
      quantityInterpreted: 100,
      geography: [],
      verificationLevel: "light",
      sourceRequirements: [],
      sensitiveData: opts?.sensitive ?? false,
      requiredAccess: [],
      missingInformation: [],
      assumptions: [],
      quoteTier: "manual",
      confidence: "medium",
      model: "integration-fixture",
    },
  });
  const version = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "The deduplicated list",
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
      dataClass: "business_confidential",
      dataClassSignals: ["client attachment named by the plan"],
      automationCostPolicyVersion: "ac1",
      expectedAutomationCostMicros: 1_500_000n,
      conservativeAutomationCostMicros: 3_000_000n,
      automationSpendCeilingMicros: 4_000_000n,
    },
    select: { id: true },
  });
  const stepBase = {
    planVersionId: version.id,
    estimatedMinutesOptimistic: 0,
    estimatedMinutesLikely: 0,
    estimatedMinutesConservative: 0,
    verificationMethod: "operator check",
    acceptanceCriteria: [] as string[],
    riskLevel: "low" as const,
  };
  await prisma.taskExecutionPlanStep.create({
    data: {
      ...stepBase,
      order: 1,
      title: "Read the accepted CSV",
      description: "Ingest the chosen attachment.",
      executor: "deterministic_code",
      dependsOnOrder: [],
      primitiveId: "ingest.csv",
      primitiveVersion: 1,
      params: { fileId: "clfixture0000000000000000", datasetName: "main" } as never,
    },
  });
  await prisma.taskExecutionPlanStep.create({
    data: {
      ...stepBase,
      order: 2,
      title: "Interview the top suppliers",
      description: "Judgment work.",
      executor: "human",
      dependsOnOrder: [1],
    },
  });
  return { task, versionId: version.id };
}

/** Row counts across every table a leaky preview could plausibly write. */
async function writeFootprint() {
  const [runs, stepRuns, events, versions, steps, notifications, holds, invocations] =
    await Promise.all([
      prisma.taskWorkflowRun.count(),
      prisma.taskWorkflowStepRun.count(),
      prisma.taskEvent.count(),
      prisma.taskExecutionPlanVersion.count(),
      prisma.taskExecutionPlanStep.count(),
      prisma.notification.count(),
      prisma.workflowBudgetHold.count(),
      prisma.taskToolInvocation.count(),
    ]);
  return { runs, stepRuns, events, versions, steps, notifications, holds, invocations };
}

/** A task in ai_processing whose run is genuinely paused, the button's state. */
async function createPausedRunTask() {
  const task = await createTask({ status: "ai_processing" });
  // The pool trigger refuses a paid task entering `open` without money on
  // hold — exactly right, the release publishes work someone already bought.
  await prisma.payment.create({
    data: { taskId: task.id, amountCents: 10_000, method: "card", status: "authorized" },
  });
  const version = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "The deliverable",
      internalCostLikelyCents: 3_000,
      internalCostConservativeCents: 4_000,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
    },
    select: { id: true },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: version.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "Integration task",
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
      taskId: task.id,
      snapshotId: snapshot.id,
      planVersionId: version.id,
      status: "paused",
      pausedReason: "integration fixture: a primitive refused mid-run",
    },
    select: { id: true },
  });
  return { task, run };
}

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
});

describe("the compile preview reads, and only reads", () => {
  it("two calls create zero rows anywhere and agree with each other and the plan", async () => {
    const { task } = await createPlannedTask();

    const before = await writeFootprint();
    const first = await compilePreviewForAdmin(task.id);
    const second = await compilePreviewForAdmin(task.id);
    const after = await writeFootprint();

    // The zero-side-effect pin: byte-identical footprint across every table
    // a run, a hold, an event or a notification would have touched.
    expect(after).toEqual(before);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    if (!first) return;

    // The facts an operator prices on, straight from the pure compiler:
    // the file step machine, the judgment step human, and honest badges.
    expect(first.steps).toHaveLength(2);
    expect(first.steps[0].executionMode).toBe("automated");
    expect(first.steps[1].executionMode).toBe("human");
    expect(first.machineStepShareBps).toBe(5_000);
    expect(first.badges).toContain("FILE AUTOMATION");
    expect(first.badges).toContain("UNCALIBRATED");
    expect(first.badges).not.toContain("SENSITIVE / HUMAN ONLY");
    expect(first.economics).toEqual({
      policyVersion: "ac1",
      expectedUsd: "$1.50",
      conservativeUsd: "$3.00",
      ceilingUsd: "$4.00",
    });
  });

  it("a sensitive mandate previews fully human — the same gate the runtime applies", async () => {
    const { task } = await createPlannedTask({ sensitive: true });
    const preview = await compilePreviewForAdmin(task.id);
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.automatedCount).toBe(0);
    expect(preview.badges).toContain("SENSITIVE / HUMAN ONLY");
  });

  it("a task the pipeline never planned has no preview, not a crash", async () => {
    const task = await createTask({ status: "pricing_review" });
    expect(await compilePreviewForAdmin(task.id)).toBeNull();
  });
});

describe("release to specialist pool — the sweep's exit, on demand, exactly once", () => {
  it("releases a paused run to open with the operator's name on the audit event", async () => {
    const admin = await createAdmin();
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);
    const { task } = await createPausedRunTask();
    const payoutBefore = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { vaPayoutCents: true },
    });

    const result = await releasePausedRunToPool({ taskId: task.id });
    expect(result).toEqual({ ok: true });

    const afterState = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, vaPayoutCents: true },
    });
    expect(afterState.status).toBe("open");
    // The frozen payout is untouched: released "as quoted" means as quoted.
    expect(afterState.vaPayoutCents).toBe(payoutBefore.vaPayoutCents);

    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id, action: "automated_processing_skipped" },
      select: { actorId: true, reason: true },
    });
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(admin.id);
    expect(events[0].reason).toContain("without waiting for the stall sweep");
  });

  it("a second click is refused and changes nothing — one release, one event", async () => {
    const admin = await createAdmin();
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);
    const { task } = await createPausedRunTask();

    expect((await releasePausedRunToPool({ taskId: task.id })).ok).toBe(true);
    const second = await releasePausedRunToPool({ taskId: task.id });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toContain("paused");

    const events = await prisma.taskEvent.count({
      where: { taskId: task.id, action: "automated_processing_skipped" },
    });
    expect(events).toBe(1);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { status: true } }))
        .status
    ).toBe("open");
  });

  it("refuses every non-paused state without touching it", async () => {
    const admin = await createAdmin();
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);

    // A running run: the runner still owns it.
    const running = await createPausedRunTask();
    await prisma.taskWorkflowRun.update({
      where: { id: running.run.id },
      data: { status: "running" },
    });
    const onRunning = await releasePausedRunToPool({ taskId: running.task.id });
    expect(onRunning.ok).toBe(false);

    // No run at all: the compile path owns the exit.
    const unplanned = await createTask({ status: "pricing_review" });
    const onUnplanned = await releasePausedRunToPool({ taskId: unplanned.id });
    expect(onUnplanned.ok).toBe(false);

    expect(
      (
        await prisma.task.findUniqueOrThrow({
          where: { id: running.task.id },
          select: { status: true },
        })
      ).status
    ).toBe("ai_processing");
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: unplanned.id }, select: { status: true } }))
        .status
    ).toBe("pricing_review");
  });
});

describe("out_of_scope refusal — counted internally, sanitized outward", () => {
  it("logs the category with the internal note, while the client reads only their message", async () => {
    const admin = await createAdmin();
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);
    const client = await createClient();
    const task = await createTask({ clientId: client.id, status: "pricing_review" });

    const internalNote = `margin impossible below the floor, missing verification capability ${uid()}`;
    const clientMessage =
      "This request needs certified legal review, which is outside what we can take responsibility for.";
    const result = await cancelTask({
      taskId: task.id,
      reason: internalNote,
      clientMessage,
      lostReasonCategory: "out_of_scope",
    });
    expect(result).toEqual({ ok: true });

    // Counted: the refusal is a measurable category, not "other" noise.
    const log = await prisma.closedJobLog.findUniqueOrThrow({
      where: { taskId: task.id },
      select: { outcome: true, lostReasonCategory: true, lostReasonDetail: true },
    });
    expect(log.outcome).toBe("lost");
    expect(log.lostReasonCategory).toBe("out_of_scope");
    expect(log.lostReasonDetail).toBe(internalNote);

    // Sanitized: the client notification carries the money fact and the
    // message written FOR them — never the operator's internal note.
    const notification = await prisma.notification.findFirstOrThrow({
      where: { taskId: task.id, userId: client.id, type: "task_cancelled" },
      select: { body: true },
    });
    expect(notification.body).toContain(clientMessage);
    expect(notification.body).not.toContain(internalNote);
    expect(notification.body).toContain("You have not been charged");
  });

  it("with no client message, the client reads the money fact alone", async () => {
    const admin = await createAdmin();
    vi.mocked(requireRole).mockResolvedValue({ id: admin.id, role: "ADMIN" } as never);
    const client = await createClient();
    const task = await createTask({ clientId: client.id, status: "pricing_review" });

    const internalNote = `capability gap, declined at pricing ${uid()}`;
    expect(
      (
        await cancelTask({
          taskId: task.id,
          reason: internalNote,
          lostReasonCategory: "out_of_scope",
        })
      ).ok
    ).toBe(true);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { taskId: task.id, userId: client.id, type: "task_cancelled" },
      select: { body: true },
    });
    expect(notification.body).toBe("You have not been charged for this task.");
    expect(notification.body).not.toContain(internalNote);
  });
});
