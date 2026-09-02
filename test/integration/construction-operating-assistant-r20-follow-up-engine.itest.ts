import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  followUpQueueForUser,
  prepareDueManagedFollowUps,
  processFollowUpEngineCommand,
} from "@/server/construction-operating-assistant-r20/follow-up-engine";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R20 owner ${label}`,
      email: `r20-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R20 field ${label}`,
      email: `r20-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `R20 outsider ${label}`,
      email: `r20-outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R20 ${label}`,
  });
  await prisma.constructionWorkspaceMember.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId: field.id,
      role: "member",
      status: "active",
    },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R20-${label}`,
    name: `Chantier ${label}`,
  });
  const contact = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: `Marc ${label}`,
    role: "Fournisseur synthétique",
  });
  const job = await prisma.constructionJob.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      title: `Installer les fenêtres ${label}`,
      startsAt: new Date("2026-09-03T13:00:00.000Z"),
      endsAt: new Date("2026-09-03T15:00:00.000Z"),
      timezone: "America/Toronto",
      status: "scheduled",
      sourceRef: `synthetic:r20:${label}`,
      createdById: owner.id,
    },
  });
  return { owner, field, outsider, workspaceId: workspace.workspaceId, project, contact, job };
}

function createCommand(
  f: Awaited<ReturnType<typeof fixture>>,
  input?: {
    commandId?: string;
    channel?: "INTERNAL" | "SMS";
    ownerId?: string;
    maxAttempts?: number;
    escalateAfterAttempts?: number;
    escalationOwnerId?: string | null;
  },
) {
  return {
    schemaVersion: 1 as const,
    commandId: input?.commandId ?? crypto.randomUUID(),
    workspaceId: f.workspaceId,
    action: "CREATE_FOLLOW_UP" as const,
    projectId: f.project.id,
    contactId: f.contact.id,
    target: { kind: "JOB" as const, jobId: f.job.id },
    dueAt: "2026-09-02T14:00:00.000Z",
    channel: input?.channel ?? "INTERNAL",
    body: "Confirmer que le matériel est arrivé.",
    owner: { kind: "MEMBER" as const, ownerId: input?.ownerId ?? f.owner.id },
    nextDecision: "Confirmer si le travail peut commencer.",
    policy: {
      maxAttempts: input?.maxAttempts ?? 3,
      retryIntervalMinutes: 60,
      escalateAfterAttempts: input?.escalateAfterAttempts ?? 2,
      escalationOwner: input?.escalationOwnerId === null
        ? null
        : { kind: "MEMBER" as const, ownerId: input?.escalationOwnerId ?? f.field.id },
    },
  };
}

describe("R20 follow-up engine on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("creates and prepares one durable internal follow-up across concurrent replay and reconnect", async () => {
    const f = await fixture("PERSIST");
    const command = createCommand(f, { commandId: crypto.randomUUID() });
    const [first, second] = await Promise.all([
      processFollowUpEngineCommand({ userId: f.owner.id, command }),
      processFollowUpEngineCommand({ userId: f.owner.id, command }),
    ]);
    expect(first.followUpId).toBe(second.followUpId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);

    const [dueA, dueB] = await Promise.all([
      prepareDueManagedFollowUps({ now: new Date("2026-09-02T14:01:00.000Z") }),
      prepareDueManagedFollowUps({ now: new Date("2026-09-02T14:01:00.000Z") }),
    ]);
    expect(dueA.length + dueB.length).toBe(1);
    expect((dueA[0] ?? dueB[0])).toMatchObject({
      disposition: "READY_FOR_REVIEW",
      status: "READY_FOR_REVIEW",
      externalTransportPerformed: false,
    });
    expect(await prisma.constructionFollowUpAttempt.count({
      where: { followUpId: first.followUpId! },
    })).toBe(1);
    const before = await followUpQueueForUser({ userId: f.owner.id, workspaceId: f.workspaceId });
    await prisma.$disconnect();
    const after = await followUpQueueForUser({ userId: f.owner.id, workspaceId: f.workspaceId });
    expect(after.followUps).toEqual(before.followUps);
    expect(await prisma.constructionFollowUpTransition.count({
      where: { followUpId: first.followUpId! },
    })).toBe(2);
  });

  it("prepares without transport, escalates once, then requests an owner decision", async () => {
    const f = await fixture("ESCALATE");
    const created = await processFollowUpEngineCommand({
      userId: f.owner.id,
      command: createCommand(f, {
        channel: "SMS",
        maxAttempts: 2,
        escalateAfterAttempts: 1,
        escalationOwnerId: f.field.id,
      }),
    });
    const [prepared] = await prepareDueManagedFollowUps({
      now: new Date("2026-09-02T14:01:00.000Z"),
    });
    expect(prepared).toMatchObject({
      disposition: "PREPARED_UNSENT",
      status: "AWAITING_RESPONSE",
      version: 2,
      externalTransportPerformed: false,
    });
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
    })).toBe(0);

    const outcome = {
      schemaVersion: 1 as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      action: "RECORD_OUTCOME" as const,
      followUpId: created.followUpId!,
      expectedVersion: 2,
      attemptId: prepared.attemptId!,
      outcome: "NO_RESPONSE" as const,
      occurredAt: "2026-09-02T14:05:00.000Z",
    };
    const [escalated, replay] = await Promise.all([
      processFollowUpEngineCommand({ userId: f.owner.id, command: outcome }),
      processFollowUpEngineCommand({ userId: f.owner.id, command: outcome }),
    ]);
    expect([escalated.replayed, replay.replayed].sort()).toEqual([false, true]);
    expect(escalated).toMatchObject({
      status: "ESCALATED",
      disposition: "ESCALATED",
      owner: { kind: "MEMBER", ownerId: f.field.id },
      version: 3,
    });
    const field = await followUpQueueForUser({ userId: f.field.id, workspaceId: f.workspaceId });
    expect(field.role).toBe("FIELD_WORKER");
    expect(field.followUps).toHaveLength(1);
    const serialized = JSON.stringify(field);
    expect(serialized).not.toContain("body");
    expect(serialized).not.toContain("policy");
    expect(serialized).not.toContain("receivable");

    const [secondAttempt] = await prepareDueManagedFollowUps({
      now: new Date("2026-09-02T15:06:00.000Z"),
    });
    const decision = await processFollowUpEngineCommand({
      userId: f.owner.id,
      command: {
        ...outcome,
        commandId: crypto.randomUUID(),
        expectedVersion: 4,
        attemptId: secondAttempt.attemptId!,
        occurredAt: "2026-09-02T15:10:00.000Z",
      },
    });
    expect(decision).toMatchObject({
      status: "DECISION_REQUIRED",
      disposition: "DECISION_REQUIRED",
      version: 5,
      nextDueAt: null,
    });
  });

  it("cancels a closed target and refuses cross-workspace access", async () => {
    const f = await fixture("CLOSED");
    const created = await processFollowUpEngineCommand({
      userId: f.owner.id,
      command: createCommand(f),
    });
    await prisma.constructionJob.update({
      where: { id: f.job.id },
      data: { status: "completed", version: 2 },
    });
    const [cancelled] = await prepareDueManagedFollowUps({
      now: new Date("2026-09-02T14:01:00.000Z"),
    });
    expect(cancelled).toMatchObject({
      followUpId: created.followUpId,
      status: "CANCELLED",
      disposition: "CANCELLED",
    });
    expect(await prisma.constructionFollowUpAttempt.count({
      where: { followUpId: created.followUpId! },
    })).toBe(0);
    await expect(followUpQueueForUser({
      userId: f.outsider.id,
      workspaceId: f.workspaceId,
    })).rejects.toThrow();
    await expect(processFollowUpEngineCommand({
      userId: f.outsider.id,
      command: createCommand(f),
    })).rejects.toThrow();
  });
});
