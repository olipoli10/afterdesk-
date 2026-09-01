import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { transitionTask } from "@/lib/state";
import { constructionHumanEscalationForWorker } from "@/lib/queries/construction-human-escalation";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { recordWorkFinished } from "@/server/construction-operating-assistant-r0/open-loops";
import {
  activateFundedConstructionHumanEscalation,
  applyAcceptedConstructionHumanEscalation,
  recoverPendingConstructionHumanEscalations,
  requestConstructionHumanEscalation,
  withdrawConstructionHumanEscalation,
} from "@/server/construction-operating-assistant-r5/escalations";
import {
  bindClaimToHumanUnit,
  decideHumanUnitCandidate,
  openHumanUnitReview,
  submitHumanUnitCandidate,
} from "@/server/human-unit";
import { createWorker } from "./fixtures";

async function fixture(label: string) {
  await prisma.setting.upsert({
    where: { key: "humanWorkUnitResumeEnabled" },
    create: { key: "humanWorkUnitResumeEnabled", value: true },
    update: { value: true },
  });
  const owner = await prisma.user.create({
    data: {
      name: `R5 owner ${label}`,
      email: `r5-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R5 Construction ${label}`,
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R5-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  const message = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: `r5-source-${label}`,
      sender: `user:${owner.id}`,
      recipients: ["ENDVERA_LOCAL"],
      originalBody: "Le travail est terminé, mais la preuve manque.",
      normalizedBody: "Le travail est terminé, mais la preuve manque.",
      status: "received",
      receivedAt: new Date("2026-09-01T13:00:00.000Z"),
    },
  });
  const opened = await recordWorkFinished({
    schemaVersion: 1,
    commandId: `r5-open-${label}`,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    actorId: owner.id,
    sourceMessageId: message.id,
    commandType: "REPORT_WORK_FINISHED",
    claims: {
      billingBasis: "CHANGE_ORDER",
      workDescription: "Dosseret de cuisine",
      amountMinor: 120_000,
      currency: "CAD",
      completion: true,
      approvalState: "APPROVED",
    },
  });
  return {
    ownerId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    loopId: opened.loopId,
    stateVersion: opened.decision.stateVersion,
  };
}

function request(
  f: Awaited<ReturnType<typeof fixture>>,
  key: string,
  evidenceKind: "WRITTEN_APPROVAL" | "PHOTO" | "DOCUMENT" = "PHOTO",
) {
  return {
    schemaVersion: 1 as const,
    requestId: `request-${key}`,
    idempotencyKey: key,
    actorId: f.ownerId,
    workspaceId: f.workspaceId,
    projectId: f.projectId,
    openLoopId: f.loopId,
    expectedStateVersion: f.stateVersion,
    purpose: "OBTAIN_MISSING_EVIDENCE" as const,
    evidenceKind,
    acceptedClientPriceCents: 5_000,
    acceptedWorkerPayoutCents: 2_500,
    acceptedEstimatedMinutes: 30,
    acceptedCurrency: "CAD" as const,
  };
}

async function authorizeAndActivate(input: {
  escalationId: string;
  taskId: string;
  ownerId: string;
  workspaceId: string;
}) {
  const payment = await prisma.payment.create({
    data: {
      taskId: input.taskId,
      amountCents: 5_000,
      currency: "CAD",
      method: "card",
      status: "authorized",
      note: "Synthetic local R5 authorization; no provider call.",
    },
  });
  return activateFundedConstructionHumanEscalation({
    escalationId: input.escalationId,
    actorId: input.ownerId,
    workspaceId: input.workspaceId,
    paymentId: payment.id,
  });
}

async function claimAndAccept(input: {
  taskId: string;
  evidenceKind: "WRITTEN_APPROVAL" | "PHOTO" | "DOCUMENT";
}) {
  const worker = await createWorker();
  const admin = await prisma.user.create({
    data: {
      name: "R5 independent reviewer",
      email: `r5-admin-${crypto.randomUUID()}@example.invalid`,
      role: "ADMIN",
    },
  });
  await prisma.$transaction(async (tx) => {
    await transitionTask({
      tx,
      taskId: input.taskId,
      from: "open",
      to: "claimed",
      action: "r5_worker_claimed",
      actorId: worker.id,
      data: { claimedById: worker.id, claimedAt: new Date() },
    });
    await bindClaimToHumanUnit(tx, {
      taskId: input.taskId,
      workerId: worker.id,
    });
  });
  const unit = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
    where: { taskId: input.taskId },
    select: { claimGeneration: true },
  });
  const sha256 = "a".repeat(64);
  const file = await prisma.file.create({
    data: {
      kind: "deliverable",
      uploaderId: worker.id,
      storageKey: `r5/${crypto.randomUUID()}`,
      fileName: "synthetic-evidence.pdf",
      mime: "application/pdf",
      detectedMime: "application/pdf",
      sizeBytes: 256,
      scanStatus: "clean",
      sha256,
      scannedAt: new Date(),
    },
  });
  const submitted = await submitHumanUnitCandidate({
    taskId: input.taskId,
    actorId: worker.id,
    claimGeneration: unit.claimGeneration,
    payload: {
      summary: "Synthetic evidence attached; no additional fact inferred.",
    },
    fileIds: [file.id],
  });
  if (!submitted.submitted)
    throw new Error(`fixture submission refused: ${submitted.cause}`);
  const opened = await openHumanUnitReview({
    taskId: input.taskId,
    actorId: admin.id,
  });
  if (!opened.opened)
    throw new Error(`fixture review refused: ${opened.cause}`);
  const decided = await decideHumanUnitCandidate({
    candidateId: submitted.candidateId,
    actorId: admin.id,
    outcome: "accept",
  });
  if (!decided.decided)
    throw new Error(`fixture decision refused: ${decided.cause}`);
  return {
    worker,
    admin,
    claimGeneration: unit.claimGeneration,
    file,
    candidateId: submitted.candidateId,
  };
}

describe("Construction Operating Assistant R5 human escalation on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("admits one escalation across concurrent retry and projects no financial or identity data", async () => {
    const f = await fixture("admission");
    const input = request(f, "r5-admission-key");
    const [first, second] = await Promise.all([
      requestConstructionHumanEscalation(input),
      requestConstructionHumanEscalation(input),
    ]);
    expect(first.escalationId).toBe(second.escalationId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(
      await prisma.constructionHumanEscalation.count({
        where: { workspaceId: f.workspaceId },
      }),
    ).toBe(1);
    expect(await prisma.task.count({ where: { id: first.taskId } })).toBe(1);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: first.taskId } }))
        .status,
    ).toBe("awaiting_payment");
    await expect(
      activateFundedConstructionHumanEscalation({
        escalationId: first.escalationId,
        actorId: f.ownerId,
        workspaceId: f.workspaceId,
        paymentId: "missing-payment",
      }),
    ).rejects.toThrow("CONSTRUCTION_HUMAN_ESCALATION_FUNDING_NOT_AUTHORIZED");
    expect(
      await prisma.constructionHumanEscalation.findUniqueOrThrow({
        where: { id: first.escalationId },
        select: { state: true },
      }),
    ).toEqual({ state: "prepared" });
    const activation = await authorizeAndActivate({
      escalationId: first.escalationId,
      taskId: first.taskId,
      ownerId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    expect(activation).toMatchObject({ activated: true, replayed: false });

    const worker = await createWorker();
    await prisma.$transaction(async (tx) => {
      await transitionTask({
        tx,
        taskId: first.taskId,
        from: "open",
        to: "claimed",
        action: "r5_projection_claim",
        actorId: worker.id,
        data: { claimedById: worker.id, claimedAt: new Date() },
      });
      await bindClaimToHumanUnit(tx, {
        taskId: first.taskId,
        workerId: worker.id,
      });
    });
    const unit = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
      where: { taskId: first.taskId },
      select: { claimGeneration: true },
    });
    const projection = await constructionHumanEscalationForWorker({
      taskId: first.taskId,
      workerId: worker.id,
      claimGeneration: unit.claimGeneration,
    });
    expect(projection?.purpose).toBe("OBTAIN_MISSING_EVIDENCE");
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("120000");
    expect(serialized).not.toContain(f.ownerId);
    expect(serialized).not.toContain("vaPayout");
    expect(serialized).not.toContain("clientPrice");
  });

  it("applies one immutable accepted artifact across concurrent retries", async () => {
    const f = await fixture("apply");
    const admitted = await requestConstructionHumanEscalation(
      request(f, "r5-apply-key", "PHOTO"),
    );
    await authorizeAndActivate({
      escalationId: admitted.escalationId,
      taskId: admitted.taskId,
      ownerId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    await claimAndAccept({ taskId: admitted.taskId, evidenceKind: "PHOTO" });
    const [first, second] = await Promise.all([
      applyAcceptedConstructionHumanEscalation(admitted.escalationId),
      applyAcceptedConstructionHumanEscalation(admitted.escalationId),
    ]);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(true);
    expect(
      await prisma.constructionOpenLoopEvidence.count({
        where: {
          loopId: f.loopId,
          evidenceKey: { startsWith: "human-unit-acceptance:" },
        },
      }),
    ).toBe(1);
    expect(
      await prisma.humanWorkUnitResumeRecord.count({
        where: {
          unitState: { constructionEscalation: { id: admitted.escalationId } },
        },
      }),
    ).toBe(1);
    const binding = await prisma.constructionHumanEscalation.findUniqueOrThrow({
      where: { id: admitted.escalationId },
    });
    expect(binding).toMatchObject({ state: "resumed" });
    expect(binding.appliedAt).toBeInstanceOf(Date);
    await expect(
      prisma.constructionHumanEscalation.update({
        where: { id: binding.id },
        data: { acceptedResultHash: "0".repeat(64) },
      }),
    ).rejects.toThrow("applied construction human escalation is immutable");
  });

  it("recovers accepted intent after reconnect and withdraws an unaccepted unit exactly once", async () => {
    const recoveryFixture = await fixture("recovery");
    const admitted = await requestConstructionHumanEscalation(
      request(recoveryFixture, "r5-recovery-key", "DOCUMENT"),
    );
    await authorizeAndActivate({
      escalationId: admitted.escalationId,
      taskId: admitted.taskId,
      ownerId: recoveryFixture.ownerId,
      workspaceId: recoveryFixture.workspaceId,
    });
    await claimAndAccept({ taskId: admitted.taskId, evidenceKind: "DOCUMENT" });
    await prisma.$disconnect();
    await prisma.$connect();
    expect(await recoverPendingConstructionHumanEscalations()).toBe(1);
    expect(await recoverPendingConstructionHumanEscalations()).toBe(0);
    expect(
      (
        await prisma.constructionHumanEscalation.findUniqueOrThrow({
          where: { id: admitted.escalationId },
        })
      ).state,
    ).toBe("resumed");

    const withdrawalFixture = await fixture("withdrawal");
    const pending = await requestConstructionHumanEscalation(
      request(withdrawalFixture, "r5-withdrawal-key", "WRITTEN_APPROVAL"),
    );
    const first = await withdrawConstructionHumanEscalation({
      escalationId: pending.escalationId,
      actorId: withdrawalFixture.ownerId,
      workspaceId: withdrawalFixture.workspaceId,
      reason: "The owner resolved this locally.",
    });
    const replay = await withdrawConstructionHumanEscalation({
      escalationId: pending.escalationId,
      actorId: withdrawalFixture.ownerId,
      workspaceId: withdrawalFixture.workspaceId,
      reason: "The owner resolved this locally.",
    });
    expect(first).toEqual({ withdrawn: true, replayed: false });
    expect(replay).toEqual({ withdrawn: true, replayed: true });
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: pending.taskId } }))
        .status,
    ).toBe("cancelled");
    expect(
      (
        await prisma.humanWorkUnitRunState.findUniqueOrThrow({
          where: { taskId: pending.taskId },
        })
      ).state,
    ).toBe("withdrawn");
    expect(
      await prisma.constructionConnectorOperation.count({
        where: {
          workspaceId: withdrawalFixture.workspaceId,
          externalTransportPerformed: true,
        },
      }),
    ).toBe(0);
  });
});
