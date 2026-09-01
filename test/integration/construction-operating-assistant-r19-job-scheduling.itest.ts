import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  JobSchedulingConflict,
  jobScheduleForUser,
  processJobSchedulingCommand,
} from "@/server/construction-operating-assistant-r19/job-scheduling";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R19 owner ${label}`,
      email: `r19-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R19 field ${label}`,
      email: `r19-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `R19 outsider ${label}`,
      email: `r19-outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R19 ${label}` });
  await prisma.constructionWorkspaceMember.create({
    data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R19-${label}`,
    name: `Chantier ${label}`,
  });
  const marc = await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: `Marc ${label}`,
    role: "Fournisseur synthétique",
  });
  return { owner, field, outsider, workspaceId: workspace.workspaceId, project, marc };
}

const commandBase = (workspaceId: string) => ({ schemaVersion: 1 as const, commandId: crypto.randomUUID(), workspaceId });

async function createJob(input: { userId: string; workspaceId: string; projectId: string; title: string; startsAt: string; endsAt: string; commandId?: string }) {
  return processJobSchedulingCommand({
    userId: input.userId,
    command: {
      ...commandBase(input.workspaceId),
      ...(input.commandId ? { commandId: input.commandId } : {}),
      action: "CREATE_JOB",
      projectId: input.projectId,
      title: input.title,
      description: null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      priority: 0,
      sourceRef: null,
    },
  });
}

describe("R19 job scheduling on disposable PostgreSQL", () => {
  it("persists, assigns, commits and reconstructs the exact schedule after reconnect", async () => {
    const f = await fixture("PERSIST");
    const created = await createJob({
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      projectId: f.project.id,
      title: "Installer les fenêtres",
      startsAt: "2026-09-03T13:00:00.000Z",
      endsAt: "2026-09-03T15:00:00.000Z",
    });
    const assigned = await processJobSchedulingCommand({
      userId: f.owner.id,
      command: {
        ...commandBase(f.workspaceId),
        action: "ASSIGN_RESOURCE",
        jobId: created.jobId!,
        expectedVersion: created.version!,
        assigneeKind: "CONTACT",
        assigneeId: f.marc.id,
        roleLabel: "Livraison et installation",
      },
    });
    const committed = await processJobSchedulingCommand({
      userId: f.owner.id,
      command: {
        ...commandBase(f.workspaceId),
        action: "COMMIT_SCHEDULE",
        jobId: created.jobId!,
        expectedVersion: assigned.version!,
      },
    });
    expect(committed).toMatchObject({ applied: true, status: "SCHEDULED", version: 3, conflicts: [], externalTransportPerformed: false });
    const before = await jobScheduleForUser({ userId: f.owner.id, workspaceId: f.workspaceId });
    await prisma.$disconnect();
    const after = await jobScheduleForUser({ userId: f.owner.id, workspaceId: f.workspaceId });
    expect(after.jobs).toEqual(before.jobs);
    expect(after.jobs[0]).toMatchObject({ title: "Installer les fenêtres", status: "SCHEDULED", version: 3 });
    expect(await prisma.constructionJobTransition.count({ where: { jobId: created.jobId! } })).toBe(3);
  });

  it("keeps conflicts visible, refuses cycles and reports downstream impact without moving successors", async () => {
    const f = await fixture("IMPACT");
    const first = await createJob({
      userId: f.owner.id, workspaceId: f.workspaceId, projectId: f.project.id, title: "Préparer ouverture",
      startsAt: "2026-09-04T13:00:00.000Z", endsAt: "2026-09-04T15:00:00.000Z",
    });
    const second = await createJob({
      userId: f.owner.id, workspaceId: f.workspaceId, projectId: f.project.id, title: "Installer fenêtre",
      startsAt: "2026-09-04T16:00:00.000Z", endsAt: "2026-09-04T18:00:00.000Z",
    });
    const secondAssigned = await processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "ASSIGN_RESOURCE", jobId: second.jobId!, expectedVersion: 1, assigneeKind: "CONTACT", assigneeId: f.marc.id, roleLabel: null },
    });
    await processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "SET_AVAILABILITY", assigneeKind: "CONTACT", assigneeId: f.marc.id, availabilityKind: "UNAVAILABLE", startsAt: "2026-09-04T15:30:00.000Z", endsAt: "2026-09-04T17:00:00.000Z", sourceRef: "synthetic-r19" },
    });
    const dependent = await processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "ADD_DEPENDENCY", jobId: second.jobId!, expectedVersion: secondAssigned.version!, predecessorJobId: first.jobId! },
    });
    const refusedCommit = await processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "COMMIT_SCHEDULE", jobId: second.jobId!, expectedVersion: dependent.version! },
    });
    expect(refusedCommit.applied).toBe(false);
    expect(refusedCommit.conflicts.map((conflict) => conflict.code)).toEqual(expect.arrayContaining(["RESOURCE_UNAVAILABLE", "DEPENDENCY_NOT_COMPLETED"]));
    await expect(processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "ADD_DEPENDENCY", jobId: first.jobId!, expectedVersion: first.version!, predecessorJobId: second.jobId! },
    })).rejects.toMatchObject({ code: "DEPENDENCY_CYCLE" });
    const moved = await processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "RESCHEDULE_JOB", jobId: first.jobId!, expectedVersion: first.version!, startsAt: "2026-09-04T14:00:00.000Z", endsAt: "2026-09-04T17:00:00.000Z" },
    });
    expect(moved.impactedJobs).toEqual([{ jobId: second.jobId!, reason: "PREDECESSOR_ENDS_AFTER_SUCCESSOR_START", delayMinutes: 60 }]);
    const unchangedSuccessor = await prisma.constructionJob.findUniqueOrThrow({ where: { id: second.jobId! } });
    expect(unchangedSuccessor.startsAt.toISOString()).toBe("2026-09-04T16:00:00.000Z");
  });

  it("serializes exact copies, reconstructs replay and refuses changed command content", async () => {
    const f = await fixture("REPLAY");
    const commandId = crypto.randomUUID();
    const input = {
      userId: f.owner.id,
      workspaceId: f.workspaceId,
      projectId: f.project.id,
      title: "Travail unique",
      startsAt: "2026-09-05T13:00:00.000Z",
      endsAt: "2026-09-05T15:00:00.000Z",
      commandId,
    };
    const results = await Promise.all([createJob(input), createJob(input)]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => result.jobId)).size).toBe(1);
    expect(await prisma.constructionJob.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionJobTransition.count({ where: { workspaceId: f.workspaceId, commandId } })).toBe(1);
    await expect(createJob({ ...input, title: "Contenu changé" })).rejects.toBeInstanceOf(JobSchedulingConflict);
  });

  it("enforces workspace authority and returns a financially redacted assigned-only field view", async () => {
    const f = await fixture("ROLES");
    const other = await fixture("OTHER");
    const assigned = await createJob({
      userId: f.owner.id, workspaceId: f.workspaceId, projectId: f.project.id, title: "Tâche terrain",
      startsAt: "2026-09-06T13:00:00.000Z", endsAt: "2026-09-06T15:00:00.000Z",
    });
    await processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "ASSIGN_RESOURCE", jobId: assigned.jobId!, expectedVersion: 1, assigneeKind: "MEMBER", assigneeId: f.field.id, roleLabel: "Installateur" },
    });
    await createJob({
      userId: f.owner.id, workspaceId: f.workspaceId, projectId: f.project.id, title: "Tâche bureau privée",
      startsAt: "2026-09-07T13:00:00.000Z", endsAt: "2026-09-07T15:00:00.000Z",
    });
    const fieldView = await jobScheduleForUser({ userId: f.field.id, workspaceId: f.workspaceId });
    expect(fieldView.role).toBe("FIELD_WORKER");
    expect(fieldView.jobs).toHaveLength(1);
    expect(fieldView.jobs[0].title).toBe("Tâche terrain");
    const fieldJson = JSON.stringify(fieldView);
    expect(fieldJson).not.toMatch(/amount|invoice|receivable|payment|sourceRef|beforeState|afterState/i);
    await expect(jobScheduleForUser({ userId: f.outsider.id, workspaceId: f.workspaceId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processJobSchedulingCommand({
      userId: f.owner.id,
      command: { ...commandBase(f.workspaceId), action: "ASSIGN_RESOURCE", jobId: assigned.jobId!, expectedVersion: 2, assigneeKind: "CONTACT", assigneeId: other.marc.id, roleLabel: null },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
