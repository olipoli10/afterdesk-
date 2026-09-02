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
  humanEscalationCockpitForUser,
  processHumanEscalationCommand,
  recoverHumanEscalationsForOperator,
} from "@/server/construction-operating-assistant-r22/human-escalation-cockpit";
import { activateFundedConstructionHumanEscalation } from "@/server/construction-operating-assistant-r5/escalations";
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
      name: `R22 owner ${label}`,
      email: `r22-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R22 Construction ${label}`,
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R22-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  const message = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: `r22-source-${label}`,
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
    commandId: `r22-open-${label}`,
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

function prepareCommand(f: Awaited<ReturnType<typeof fixture>>, commandId: string) {
  return {
    schemaVersion: 1 as const,
    commandId,
    requestId: commandId,
    idempotencyKey: commandId,
    workspaceId: f.workspaceId,
    action: "PREPARE" as const,
    projectId: f.projectId,
    openLoopId: f.loopId,
    expectedStateVersion: f.stateVersion,
    purpose: "OBTAIN_MISSING_EVIDENCE" as const,
    evidenceKind: "PHOTO" as const,
    acceptedClientPriceCents: 5_000,
    acceptedWorkerPayoutCents: 2_500,
    acceptedEstimatedMinutes: 30,
    acceptedCurrency: "CAD" as const,
  };
}

async function authorizeActivateClaimAndAccept(input: {
  escalationId: string;
  ownerId: string;
  workspaceId: string;
  taskId: string;
}) {
  const payment = await prisma.payment.create({
    data: {
      taskId: input.taskId,
      amountCents: 5_000,
      currency: "CAD",
      method: "card",
      status: "authorized",
      note: "Synthetic local R22 authorization; no provider call.",
    },
  });
  await activateFundedConstructionHumanEscalation({
    escalationId: input.escalationId,
    actorId: input.ownerId,
    workspaceId: input.workspaceId,
    paymentId: payment.id,
  });
  const worker = await createWorker();
  const reviewer = await prisma.user.create({
    data: {
      name: "R22 independent reviewer",
      email: `r22-reviewer-${crypto.randomUUID()}@example.invalid`,
      role: "ADMIN",
    },
  });
  await prisma.$transaction(async (tx) => {
    await transitionTask({
      tx,
      taskId: input.taskId,
      from: "open",
      to: "claimed",
      action: "r22_worker_claimed",
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
  const workerProjection = await constructionHumanEscalationForWorker({
    taskId: input.taskId,
    workerId: worker.id,
    claimGeneration: unit.claimGeneration,
  });
  expect(workerProjection).not.toBeNull();
  const serializedWorker = JSON.stringify(workerProjection);
  expect(serializedWorker).not.toContain("clientPrice");
  expect(serializedWorker).not.toContain("workerPayout");
  expect(serializedWorker).not.toContain(input.ownerId);

  const file = await prisma.file.create({
    data: {
      kind: "deliverable",
      uploaderId: worker.id,
      storageKey: `r22/${crypto.randomUUID()}`,
      fileName: "synthetic-photo.jpg",
      mime: "image/jpeg",
      detectedMime: "image/jpeg",
      sizeBytes: 256,
      scanStatus: "clean",
      sha256: "a".repeat(64),
      scannedAt: new Date(),
    },
  });
  const submitted = await submitHumanUnitCandidate({
    taskId: input.taskId,
    actorId: worker.id,
    claimGeneration: unit.claimGeneration,
    payload: { summary: "Synthetic photo attached; no additional fact inferred." },
    fileIds: [file.id],
  });
  if (!submitted.submitted) throw new Error(`R22 submission refused: ${submitted.cause}`);
  const opened = await openHumanUnitReview({ taskId: input.taskId, actorId: reviewer.id });
  if (!opened.opened) throw new Error(`R22 review refused: ${opened.cause}`);
  const decided = await decideHumanUnitCandidate({
    candidateId: submitted.candidateId,
    actorId: reviewer.id,
    outcome: "accept",
  });
  if (!decided.decided) throw new Error(`R22 decision refused: ${decided.cause}`);
}

describe("R22 human escalation cockpit on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("prepares one canonical escalation across concurrency and replay", async () => {
    const f = await fixture("concurrent");
    const before = await humanEscalationCockpitForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    expect(before.role).toBe("OWNER");
    if (before.role !== "OWNER") throw new Error("owner fixture expected");
    expect(before.eligibleLoops).toEqual(expect.arrayContaining([
      expect.objectContaining({ loopId: f.loopId, stateVersion: f.stateVersion }),
    ]));

    const command = prepareCommand(f, crypto.randomUUID());
    const [first, second] = await Promise.all([
      processHumanEscalationCommand({ userId: f.ownerId, command }),
      processHumanEscalationCommand({ userId: f.ownerId, command }),
    ]);
    expect(first.escalationId).toBe(second.escalationId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await prisma.constructionHumanEscalation.count({
      where: { workspaceId: f.workspaceId },
    })).toBe(1);
    expect((await processHumanEscalationCommand({
      userId: f.ownerId,
      command,
    })).replayed).toBe(true);
    await expect(processHumanEscalationCommand({
      userId: f.ownerId,
      command: {
        ...command,
        commandId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        acceptedWorkerPayoutCents: 2_000,
      },
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const after = await humanEscalationCockpitForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    expect(after.role).toBe("OWNER");
    if (after.role !== "OWNER") throw new Error("owner projection expected");
    expect(after.escalations).toEqual([
      expect.objectContaining({
        escalationId: first.escalationId,
        state: "PREPARED",
        fundingRequired: true,
        acceptedClientPriceCents: 5_000,
        externalTransportPerformed: false,
      }),
    ]);
    expect(JSON.stringify(after)).not.toContain("acceptedWorkerPayoutCents");
  });

  it("refuses stale and cross-workspace preparation without partial state", async () => {
    const f = await fixture("refusal");
    const other = await fixture("other");
    const stale = prepareCommand(f, crypto.randomUUID());
    await expect(processHumanEscalationCommand({
      userId: f.ownerId,
      command: { ...stale, expectedStateVersion: f.stateVersion + 1 },
    })).rejects.toMatchObject({ code: "STALE_STATE_VERSION" });
    await expect(processHumanEscalationCommand({
      userId: other.ownerId,
      command: prepareCommand(f, crypto.randomUUID()),
    })).rejects.toThrow();
    await prisma.setting.update({
      where: { key: "humanWorkUnitResumeEnabled" },
      data: { value: false },
    });
    await expect(processHumanEscalationCommand({
      userId: f.ownerId,
      command: prepareCommand(f, crypto.randomUUID()),
    })).rejects.toMatchObject({ code: "HUMAN_ESCALATION_DISABLED" });
    await prisma.setting.update({
      where: { key: "humanWorkUnitResumeEnabled" },
      data: { value: true },
    });
    expect(await prisma.constructionHumanEscalation.count({
      where: { workspaceId: f.workspaceId },
    })).toBe(0);
  });

  it("returns a financially empty field projection and withdraws exactly once", async () => {
    const f = await fixture("field-withdraw");
    const field = await prisma.user.create({
      data: {
        name: "R22 field worker",
        email: `r22-field-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: f.workspaceId,
        userId: field.id,
        role: "member",
        status: "active",
      },
    });
    expect(await humanEscalationCockpitForUser({
      userId: field.id,
      workspaceId: f.workspaceId,
    })).toMatchObject({
      role: "FIELD_WORKER",
      eligibleLoops: [],
      escalations: [],
      financialDataVisible: false,
    });
    await expect(processHumanEscalationCommand({
      userId: field.id,
      command: prepareCommand(f, crypto.randomUUID()),
    })).rejects.toThrow();

    const prepared = await processHumanEscalationCommand({
      userId: f.ownerId,
      command: prepareCommand(f, crypto.randomUUID()),
    });
    const withdraw = {
      schemaVersion: 1 as const,
      commandId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      action: "WITHDRAW" as const,
      escalationId: prepared.escalationId,
      reason: "Le propriétaire a obtenu la preuve autrement.",
    };
    expect(await processHumanEscalationCommand({
      userId: f.ownerId,
      command: withdraw,
    })).toMatchObject({ state: "WITHDRAWN", replayed: false });
    expect(await processHumanEscalationCommand({
      userId: f.ownerId,
      command: withdraw,
    })).toMatchObject({ state: "WITHDRAWN", replayed: true });
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
  });

  it("shows independent acceptance and recovers exact Construction delivery once", async () => {
    const f = await fixture("resume");
    const prepared = await processHumanEscalationCommand({
      userId: f.ownerId,
      command: prepareCommand(f, crypto.randomUUID()),
    });
    const binding = await prisma.constructionHumanEscalation.findUniqueOrThrow({
      where: { id: prepared.escalationId },
      select: { taskId: true },
    });
    await authorizeActivateClaimAndAccept({
      escalationId: prepared.escalationId,
      ownerId: f.ownerId,
      workspaceId: f.workspaceId,
      taskId: binding.taskId,
    });
    const accepted = await humanEscalationCockpitForUser({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    expect(accepted.role).toBe("OWNER");
    if (accepted.role !== "OWNER") throw new Error("owner projection expected");
    expect(accepted.escalations[0]).toMatchObject({
      escalationId: prepared.escalationId,
      state: "ACCEPTED_PENDING_RESUME",
      nextResponsibleRole: "SYSTEM",
      appliedAt: null,
    });

    await prisma.$disconnect();
    await prisma.$connect();
    const recovered = await recoverHumanEscalationsForOperator({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    });
    expect(recovered.recovered).toBe(1);
    expect(recovered.cockpit.role).toBe("OWNER");
    if (recovered.cockpit.role !== "OWNER") throw new Error("owner projection expected");
    expect(recovered.cockpit.escalations[0]).toMatchObject({
      state: "APPLIED",
      nextResponsibleRole: "NONE",
    });
    expect((await recoverHumanEscalationsForOperator({
      userId: f.ownerId,
      workspaceId: f.workspaceId,
    })).recovered).toBe(0);
    expect(await prisma.humanWorkUnitResumeRecord.count({
      where: { unitState: { constructionEscalation: { id: prepared.escalationId } } },
    })).toBe(1);
    expect(await prisma.constructionOpenLoopEvidence.count({
      where: {
        loopId: f.loopId,
        evidenceKey: { startsWith: "human-unit-acceptance:" },
      },
    })).toBe(1);
  });
});
