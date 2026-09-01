import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireRole: vi.fn() };
});

const { prisma } = await import("@/lib/db");
const { requireRole } = await import("@/lib/authz");
const { humanUnitForAdmin } = await import("@/lib/queries/human-unit");
const { sweepHumanWorkUnitDeadlines } = await import("@/server/human-unit-deadlines");
const { submitHumanUnitCandidate } = await import("@/server/human-unit");
const { createUs4Admin, createUs4Unit } = await import("./human-unit-us4-fixtures");
const { createTask } = await import("./fixtures");

async function expire(input: {
  state: "published" | "claimed" | "revision_requested";
  deadline: "publication" | "submission" | "lease";
}) {
  const built = await createUs4Unit({
    state: input.state,
    taskStatus: input.state === "published" ? "open" : "claimed",
  });
  const dueAt = new Date(Date.now() - 60_000);
  await prisma.humanWorkUnitRunState.update({
    where: { id: built.unit.id },
    data: {
      publicationDeadlineAt: input.deadline === "publication" ? dueAt : null,
      submissionDeadlineAt: input.deadline === "submission" ? dueAt : null,
      claimLeaseExpiresAt: input.deadline === "lease" ? dueAt : null,
    },
  });
  return { ...built, dueAt };
}

async function invariantCounts(unitStateId: string, taskId: string) {
  return {
    acceptances: await prisma.humanWorkUnitAcceptance.count({ where: { unitStateId } }),
    decisions: await prisma.humanWorkUnitReviewDecision.count({ where: { unitStateId } }),
    candidates: await prisma.humanWorkUnitCandidate.count({ where: { unitStateId } }),
    spend: await prisma.aiUsage.count({ where: { taskId } }),
  };
}

async function createRefusedRun(cause: "unsupported_topology" | "malformed_topology" | "unmapped_economics") {
  const task = await createTask({ status: "ai_processing" });
  const plan = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated",
      deliverableDescription: "refused human cut",
      internalCostLikelyCents: 100,
      internalCostConservativeCents: 200,
      suggestedPriceCents: 10_000,
      suggestedVaPayoutCents: 2_000,
      calibration: "uncalibrated",
      dataClass: "business_confidential",
      dataClassSignals: [],
    },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: plan.id,
      clientPriceCents: 10_000,
      currency: "USD",
      title: "refused run",
      description: "refused run",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      dataClass: "business_confidential",
    },
  });
  await prisma.taskWorkflowRun.create({
    data: {
      taskId: task.id,
      snapshotId: snapshot.id,
      planVersionId: plan.id,
      status: "awaiting_human",
      humanUnitAdmissionRefusalCause: cause,
    },
  });
  return task;
}

describe("T11 — Human Work Unit deadline sweep", () => {
  let adminId = "";

  beforeAll(async () => {
    adminId = (await createUs4Admin("deadline")).id;
    vi.mocked(requireRole).mockResolvedValue({ id: adminId, role: "ADMIN" } as never);
  });

  it("uses a publication-time scheduled alert as the same exactly-once deadline fact", async () => {
    const built = await expire({ state: "published", deadline: "publication" });
    await prisma.humanWorkUnitAlert.create({
      data: {
        unitStateId: built.unit.id,
        kind: "publication_deadline",
        dueAt: built.dueAt,
        claimGeneration: 0,
      },
    });
    await Promise.all([sweepHumanWorkUnitDeadlines(), sweepHumanWorkUnitDeadlines()]);
    expect(await prisma.humanWorkUnitAlert.count({ where: { unitStateId: built.unit.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { taskId: built.task.id, type: "human_unit_deadline" } })).toBe(1);
    expect(await prisma.humanWorkUnitRunState.findUniqueOrThrow({ where: { id: built.unit.id } }))
      .toMatchObject({ state: "paused", refusalCause: "publication_deadline" });
  });

  it.each([
    ["published", "publication", "publication_deadline", "publication_deadline"],
    ["claimed", "submission", "submission_deadline", "submission_deadline"],
    ["claimed", "lease", "claim_lease", "claim_lease_expired"],
    ["revision_requested", "submission", "submission_deadline", "submission_deadline"],
  ] as const)(
    "%s / %s lapses exactly once without accepting, rejecting, revising or spending",
    async (state, deadline, alertKind, refusalCause) => {
      const built = await expire({ state, deadline });
      const before = await invariantCounts(built.unit.id, built.task.id);

      await Promise.all([sweepHumanWorkUnitDeadlines(), sweepHumanWorkUnitDeadlines()]);
      await sweepHumanWorkUnitDeadlines();

      const unit = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
        where: { id: built.unit.id },
        select: { state: true, refusalCause: true, remainingRevisions: true, claimGeneration: true },
      });
      expect(unit).toMatchObject({ state: "paused", refusalCause, remainingRevisions: 2 });
      expect(await invariantCounts(built.unit.id, built.task.id)).toEqual(before);
      expect(await prisma.humanWorkUnitAlert.count({
        where: { unitStateId: built.unit.id, kind: alertKind },
      })).toBe(1);
      expect(await prisma.notification.count({
        where: { taskId: built.task.id, userId: adminId, type: "human_unit_deadline" },
      })).toBe(1);

      if (state !== "published") {
        const task = await prisma.task.findUniqueOrThrow({
          where: { id: built.task.id },
          select: { status: true, claimedById: true },
        });
        expect(task).toEqual({ status: "open", claimedById: null });
        expect(unit.claimGeneration).toBeGreaterThan(built.claimGeneration);
        await expect(submitHumanUnitCandidate({
          taskId: built.task.id,
          actorId: built.worker.id,
          claimGeneration: built.claimGeneration,
          payload: { summary: "late" },
          fileIds: [],
        })).resolves.toMatchObject({ submitted: false, cause: "stale_generation" });
      }
    },
  );

  it("admin projection answers the five operator questions for every waiting state", async () => {
    const cases = [
      ["published", "open", "claim_or_wait", "eligible_worker_pool"],
      ["claimed", "claimed", "submit_or_release", "current_claimant"],
      ["submitted", "submitted_for_qc", "accept_or_reject", "admin"],
      ["in_review", "submitted_for_qc", "accept_or_reject", "admin"],
      ["revision_requested", "claimed", "revise_or_release", "current_claimant"],
      ["accepted", "claimed", "await_resume", "system"],
      ["paused", "open", "open_manual_residual_path", "admin"],
      ["exhausted", "open", "open_manual_residual_path", "admin"],
    ] as const;

    for (const [state, taskStatus, nextAction, actor] of cases) {
      const built = await createUs4Unit({ state, taskStatus });
      if (state === "paused") {
        await prisma.humanWorkUnitRunState.update({
          where: { id: built.unit.id },
          data: { refusalCause: "publication_deadline", pausedDetail: "No claim before deadline." },
        });
      }
      const view = await humanUnitForAdmin(built.task.id);
      expect(view).not.toBeNull();
      expect(view?.answers).toMatchObject({
        state,
        whoMayAct: actor,
        remainingRevisions: 2,
        safeNextAction: nextAction,
      });
      expect(view?.answers.why).toBeTruthy();
      expect(view?.answers.safeNextAction).toBeTruthy();
    }
  });

  it.each(["unsupported_topology", "malformed_topology", "unmapped_economics"] as const)(
    "renders not-admitted cause %s in its own terms",
    async (cause) => {
      const task = await createRefusedRun(cause);
      const view = await humanUnitForAdmin(task.id);
      expect(view?.answers).toEqual({
        why: `not_admitted:${cause}`,
        state: "not_admitted",
        refusalCause: cause,
        pausedDetail: null,
        whoMayAct: "admin",
        applicableDeadline: null,
        remainingRevisions: null,
        safeNextAction: "open_manual_residual_path",
      });
    },
  );
});
