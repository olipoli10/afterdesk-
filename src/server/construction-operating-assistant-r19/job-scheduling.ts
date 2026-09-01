import "server-only";

import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  fieldJobScheduleProjectionSchema,
  jobScheduleProjectionSchema,
  jobSchedulingCommandSchema,
  jobSchedulingResultSchema,
  ownerJobScheduleProjectionSchema,
  type JobConflict,
  type JobScheduleProjection,
  type JobSchedulingCommand,
  type JobSchedulingResult,
  type ScheduleImpact,
} from "@/lib/construction-operating-assistant-r19/contracts";
import {
  assertValidInterval,
  calculateScheduleImpacts,
  dependencyWouldCycle,
  evaluateScheduleConflicts,
  rejectFieldScheduleLeaks,
} from "@/lib/construction-operating-assistant-r19/scheduling";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export class JobSchedulingConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "JobSchedulingConflict";
  }
}

const JOB_SELECT = {
  id: true,
  workspaceId: true,
  projectId: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  status: true,
  priority: true,
  version: true,
  sourceRef: true,
  createdById: true,
  assignments: {
    orderBy: [{ assigneeKind: "asc" }, { assigneeId: "asc" }],
    select: {
      id: true,
      assigneeKind: true,
      assigneeId: true,
      roleLabel: true,
      contactId: true,
    },
  },
} satisfies Prisma.ConstructionJobSelect;

type JobState = Prisma.ConstructionJobGetPayload<{ select: typeof JOB_SELECT }>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function publicStatus(status: JobState["status"]): JobSchedulingResult["status"] {
  return status.toUpperCase() as JobSchedulingResult["status"];
}

function publicAssigneeKind(kind: "member" | "contact") {
  return kind === "member" ? "MEMBER" as const : "CONTACT" as const;
}

function dbAssigneeKind(kind: "MEMBER" | "CONTACT") {
  return kind === "MEMBER" ? "member" as const : "contact" as const;
}

function snapshot(job: JobState | null) {
  if (!job) return null;
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    title: job.title,
    description: job.description,
    startsAt: job.startsAt.toISOString(),
    endsAt: job.endsAt.toISOString(),
    timezone: job.timezone,
    status: publicStatus(job.status),
    priority: job.priority,
    version: job.version,
    sourceRef: job.sourceRef,
    createdById: job.createdById,
    assignments: job.assignments.map((assignment) => ({
      kind: publicAssigneeKind(assignment.assigneeKind),
      assigneeId: assignment.assigneeId,
      roleLabel: assignment.roleLabel,
    })),
  };
}

async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r19:${key}`}, 0))::text AS acquired
  `);
}

async function existingReplay(
  tx: Prisma.TransactionClient,
  command: JobSchedulingCommand,
  commandHash: string,
): Promise<JobSchedulingResult | null> {
  const existing = await tx.constructionJobTransition.findUnique({
    where: {
      workspaceId_commandId: {
        workspaceId: command.workspaceId,
        commandId: command.commandId,
      },
    },
    select: { commandHash: true, result: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) {
    throw new JobSchedulingConflict("COMMAND_ID_COLLISION");
  }
  const result = jobSchedulingResultSchema.parse(existing.result);
  return { ...result, replayed: true };
}

async function insertTransition(
  tx: Prisma.TransactionClient,
  input: {
    command: JobSchedulingCommand;
    commandHash: string;
    userId: string;
    jobId: string | null;
    before: JobState | null;
    after: JobState | null;
    result: JobSchedulingResult;
  },
) {
  await tx.constructionJobTransition.create({
    data: {
      workspaceId: input.command.workspaceId,
      jobId: input.jobId,
      commandId: input.command.commandId,
      commandHash: input.commandHash,
      action: input.command.action,
      versionBefore: input.before?.version ?? null,
      versionAfter: input.after?.version ?? null,
      beforeState: input.before ? asJson(snapshot(input.before)) : Prisma.JsonNull,
      afterState: input.after ? asJson(snapshot(input.after)) : Prisma.JsonNull,
      result: asJson(input.result),
      actorId: input.userId,
    },
  });
}

async function authorizedJob(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  jobId: string,
): Promise<JobState> {
  const job = await tx.constructionJob.findFirst({
    where: { id: jobId, workspaceId },
    select: JOB_SELECT,
  });
  if (!job) throw new ConstructionAccessDenied();
  return job;
}

function requireVersion(job: JobState, expectedVersion: number) {
  if (job.version !== expectedVersion) throw new JobSchedulingConflict("STALE_JOB_VERSION");
  if (job.status === "completed" || job.status === "cancelled") {
    throw new JobSchedulingConflict("TERMINAL_JOB_IMMUTABLE");
  }
}

async function ensureAssignee(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    projectId?: string;
    assigneeKind: "MEMBER" | "CONTACT";
    assigneeId: string;
  },
) {
  if (input.assigneeKind === "MEMBER") {
    const member = await tx.constructionWorkspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.assigneeId,
        },
      },
      select: { status: true },
    });
    if (member?.status !== "active") throw new ConstructionAccessDenied();
    return;
  }
  const contact = await tx.constructionContact.findFirst({
    where: {
      id: input.assigneeId,
      workspaceId: input.workspaceId,
      status: "active",
      ...(input.projectId
        ? { OR: [{ projectId: null }, { projectId: input.projectId }] }
        : {}),
    },
    select: { id: true },
  });
  if (!contact) throw new ConstructionAccessDenied();
}

async function evaluateConflicts(
  tx: Prisma.TransactionClient,
  job: JobState,
): Promise<JobConflict[]> {
  const [scheduledJobs, availability, predecessorLinks] = await Promise.all([
    tx.constructionJob.findMany({
      where: {
        workspaceId: job.workspaceId,
        id: { not: job.id },
        status: { in: ["scheduled", "in_progress"] },
        startsAt: { lt: job.endsAt },
        endsAt: { gt: job.startsAt },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        assignments: { select: { assigneeKind: true, assigneeId: true } },
      },
    }),
    tx.constructionResourceAvailability.findMany({
      where: {
        workspaceId: job.workspaceId,
      },
      select: {
        assigneeKind: true,
        assigneeId: true,
        kind: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    tx.constructionJobDependency.findMany({
      where: { workspaceId: job.workspaceId, successorJobId: job.id },
      select: {
        predecessorJob: { select: { id: true, status: true, endsAt: true } },
      },
    }),
  ]);
  return evaluateScheduleConflicts({
    job,
    assignments: job.assignments.map((assignment) => ({
      assigneeKind: publicAssigneeKind(assignment.assigneeKind),
      assigneeId: assignment.assigneeId,
    })),
    scheduledAssignments: scheduledJobs.flatMap((candidate) =>
      candidate.assignments.map((assignment) => ({
        jobId: candidate.id,
        assigneeKind: publicAssigneeKind(assignment.assigneeKind),
        assigneeId: assignment.assigneeId,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
      })),
    ),
    availability: availability.map((entry) => ({
      assigneeKind: publicAssigneeKind(entry.assigneeKind),
      assigneeId: entry.assigneeId,
      kind: entry.kind === "available" ? "AVAILABLE" : "UNAVAILABLE",
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
    })),
    predecessors: predecessorLinks.map(({ predecessorJob }) => ({
      id: predecessorJob.id,
      status: publicStatus(predecessorJob.status)!,
      endsAt: predecessorJob.endsAt,
    })),
  });
}

async function scheduleImpacts(
  tx: Prisma.TransactionClient,
  job: Pick<JobState, "id" | "workspaceId" | "endsAt">,
): Promise<ScheduleImpact[]> {
  const [edges, jobs] = await Promise.all([
    tx.constructionJobDependency.findMany({
      where: { workspaceId: job.workspaceId },
      select: { predecessorJobId: true, successorJobId: true },
    }),
    tx.constructionJob.findMany({
      where: { workspaceId: job.workspaceId, status: { notIn: ["completed", "cancelled"] } },
      select: { id: true, startsAt: true },
    }),
  ]);
  return calculateScheduleImpacts({
    rescheduledJobId: job.id,
    rescheduledEndsAt: job.endsAt,
    edges,
    jobs,
  });
}

function resultFor(input: {
  command: JobSchedulingCommand;
  job: JobState | null;
  applied: boolean;
  conflicts?: JobConflict[];
  impactedJobs?: ScheduleImpact[];
}): JobSchedulingResult {
  return jobSchedulingResultSchema.parse({
    schemaVersion: 1,
    commandId: input.command.commandId,
    workspaceId: input.command.workspaceId,
    action: input.command.action,
    jobId: input.job?.id ?? null,
    status: input.job ? publicStatus(input.job.status) : null,
    version: input.job?.version ?? null,
    applied: input.applied,
    replayed: false,
    conflicts: input.conflicts ?? [],
    impactedJobs: input.impactedJobs ?? [],
    externalTransportPerformed: false,
  });
}

async function updatedJob(tx: Prisma.TransactionClient, jobId: string): Promise<JobState> {
  return tx.constructionJob.findUniqueOrThrow({ where: { id: jobId }, select: JOB_SELECT });
}

export async function processJobSchedulingCommand(input: {
  userId: string;
  command: JobSchedulingCommand | unknown;
}): Promise<JobSchedulingResult> {
  const command = jobSchedulingCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, command.workspaceId);
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new ConstructionAccessDenied();
    }
    await lock(tx, `command:${command.workspaceId}:${command.commandId}`);
    const replay = await existingReplay(tx, command, commandHash);
    if (replay) return replay;

    if (command.action === "CREATE_JOB") {
      assertValidInterval({ startsAt: new Date(command.startsAt), endsAt: new Date(command.endsAt) });
      const project = await tx.constructionProject.findFirst({
        where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
        select: { id: true, timezone: true },
      });
      if (!project) throw new ConstructionAccessDenied();
      const job = await tx.constructionJob.create({
        data: {
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          title: command.title,
          description: command.description,
          startsAt: new Date(command.startsAt),
          endsAt: new Date(command.endsAt),
          timezone: project.timezone,
          priority: command.priority,
          sourceRef: command.sourceRef,
          createdById: input.userId,
        },
        select: JOB_SELECT,
      });
      const result = resultFor({ command, job, applied: true });
      await insertTransition(tx, { command, commandHash, userId: input.userId, jobId: job.id, before: null, after: job, result });
      return result;
    }

    if (command.action === "SET_AVAILABILITY") {
      assertValidInterval({ startsAt: new Date(command.startsAt), endsAt: new Date(command.endsAt) });
      await ensureAssignee(tx, command);
      await tx.constructionResourceAvailability.create({
        data: {
          workspaceId: command.workspaceId,
          assigneeKind: dbAssigneeKind(command.assigneeKind),
          assigneeId: command.assigneeId,
          kind: command.availabilityKind === "AVAILABLE" ? "available" : "unavailable",
          startsAt: new Date(command.startsAt),
          endsAt: new Date(command.endsAt),
          sourceRef: command.sourceRef,
        },
      });
      const result = resultFor({ command, job: null, applied: true });
      await insertTransition(tx, { command, commandHash, userId: input.userId, jobId: null, before: null, after: null, result });
      return result;
    }

    await lock(tx, `job:${command.workspaceId}:${command.jobId}`);
    const before = await authorizedJob(tx, command.workspaceId, command.jobId);
    requireVersion(before, command.expectedVersion);

    if (command.action === "ASSIGN_RESOURCE") {
      await ensureAssignee(tx, {
        workspaceId: command.workspaceId,
        projectId: before.projectId,
        assigneeKind: command.assigneeKind,
        assigneeId: command.assigneeId,
      });
      const duplicate = before.assignments.some(
        (assignment) => assignment.assigneeKind === dbAssigneeKind(command.assigneeKind) && assignment.assigneeId === command.assigneeId,
      );
      if (duplicate) throw new JobSchedulingConflict("ASSIGNMENT_EXISTS");
      await tx.constructionJobAssignment.create({
        data: {
          workspaceId: command.workspaceId,
          jobId: before.id,
          assigneeKind: dbAssigneeKind(command.assigneeKind),
          assigneeId: command.assigneeId,
          roleLabel: command.roleLabel,
          contactId: command.assigneeKind === "CONTACT" ? command.assigneeId : null,
        },
      });
      await tx.constructionJob.update({ where: { id: before.id }, data: { version: { increment: 1 } } });
    } else if (command.action === "ADD_DEPENDENCY") {
      const predecessor = await tx.constructionJob.findFirst({
        where: {
          id: command.predecessorJobId,
          workspaceId: command.workspaceId,
          projectId: before.projectId,
        },
        select: { id: true },
      });
      if (!predecessor) throw new ConstructionAccessDenied();
      const edges = await tx.constructionJobDependency.findMany({
        where: { workspaceId: command.workspaceId },
        select: { predecessorJobId: true, successorJobId: true },
      });
      if (dependencyWouldCycle(edges, predecessor.id, before.id)) {
        throw new JobSchedulingConflict("DEPENDENCY_CYCLE");
      }
      if (edges.some((edge) => edge.predecessorJobId === predecessor.id && edge.successorJobId === before.id)) {
        throw new JobSchedulingConflict("DEPENDENCY_EXISTS");
      }
      await tx.constructionJobDependency.create({
        data: {
          workspaceId: command.workspaceId,
          predecessorJobId: predecessor.id,
          successorJobId: before.id,
        },
      });
      await tx.constructionJob.update({ where: { id: before.id }, data: { version: { increment: 1 } } });
    } else if (command.action === "COMMIT_SCHEDULE") {
      const conflicts = await evaluateConflicts(tx, before);
      if (conflicts.length > 0) {
        const result = resultFor({ command, job: before, applied: false, conflicts });
        await insertTransition(tx, { command, commandHash, userId: input.userId, jobId: before.id, before, after: before, result });
        return result;
      }
      await tx.constructionJob.update({
        where: { id: before.id },
        data: { status: "scheduled", version: { increment: 1 } },
      });
    } else if (command.action === "RESCHEDULE_JOB") {
      assertValidInterval({ startsAt: new Date(command.startsAt), endsAt: new Date(command.endsAt) });
      await tx.constructionJob.update({
        where: { id: before.id },
        data: {
          startsAt: new Date(command.startsAt),
          endsAt: new Date(command.endsAt),
          status: "proposed",
          version: { increment: 1 },
        },
      });
    } else if (command.action === "CHANGE_STATUS") {
      const next = command.status.toLowerCase() as "proposed" | "blocked" | "in_progress" | "completed" | "cancelled";
      const allowed: Record<JobState["status"], JobState["status"][]> = {
        proposed: ["blocked", "cancelled"],
        scheduled: ["blocked", "in_progress", "completed", "cancelled"],
        blocked: ["proposed", "cancelled"],
        in_progress: ["blocked", "completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowed[before.status].includes(next)) throw new JobSchedulingConflict("INVALID_JOB_TRANSITION");
      await tx.constructionJob.update({
        where: { id: before.id },
        data: { status: next, version: { increment: 1 } },
      });
    }

    const after = await updatedJob(tx, before.id);
    const impactedJobs = command.action === "RESCHEDULE_JOB" ? await scheduleImpacts(tx, after) : [];
    const result = resultFor({ command, job: after, applied: true, impactedJobs });
    await insertTransition(tx, { command, commandHash, userId: input.userId, jobId: after.id, before, after, result });
    return result;
  });
}

export async function jobScheduleForUser(input: {
  userId: string;
  workspaceId: string;
  projectId?: string;
}): Promise<JobScheduleProjection> {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    if (input.projectId) {
      const project = await tx.constructionProject.findFirst({
        where: { id: input.projectId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!project) throw new ConstructionAccessDenied();
    }
    const [jobs, availability, members, contacts] = await Promise.all([
      tx.constructionJob.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        include: {
          project: { select: { code: true, name: true } },
          assignments: { orderBy: [{ assigneeKind: "asc" }, { assigneeId: "asc" }] },
          successorLinks: { select: { predecessorJobId: true, successorJobId: true } },
          predecessorLinks: { select: { predecessorJobId: true, successorJobId: true } },
        },
      }),
      tx.constructionResourceAvailability.findMany({ where: { workspaceId: input.workspaceId } }),
      tx.constructionWorkspaceMember.findMany({
        where: { workspaceId: input.workspaceId, status: "active" },
        select: { userId: true, user: { select: { name: true } } },
      }),
      tx.constructionContact.findMany({
        where: { workspaceId: input.workspaceId, status: "active" },
        select: { id: true, displayName: true },
      }),
    ]);
    const memberNames = new Map(members.map((member) => [member.userId, member.user.name]));
    const contactNames = new Map(contacts.map((contact) => [contact.id, contact.displayName]));
    const edges = jobs.flatMap((job) => job.predecessorLinks).filter(
      (edge, index, all) => all.findIndex((candidate) => candidate.predecessorJobId === edge.predecessorJobId && candidate.successorJobId === edge.successorJobId) === index,
    );
    const scheduledAssignments = jobs
      .filter((job) => job.status === "scheduled" || job.status === "in_progress")
      .flatMap((job) => job.assignments.map((assignment) => ({
        jobId: job.id,
        assigneeKind: publicAssigneeKind(assignment.assigneeKind),
        assigneeId: assignment.assigneeId,
        startsAt: job.startsAt,
        endsAt: job.endsAt,
      })));
    const visibleJobs = membership.role === "member"
      ? jobs.filter((job) => job.assignments.some((assignment) => assignment.assigneeKind === "member" && assignment.assigneeId === input.userId))
      : jobs;
    const visibleIds = new Set(visibleJobs.map((job) => job.id));
    const projected = visibleJobs.map((job) => {
      const allAssignments = job.assignments.map((assignment) => ({
        kind: publicAssigneeKind(assignment.assigneeKind),
        assigneeId: assignment.assigneeId,
        displayName: assignment.assigneeKind === "member"
          ? memberNames.get(assignment.assigneeId) ?? "Membre autorisé"
          : contactNames.get(assignment.assigneeId) ?? "Contact autorisé",
        roleLabel: assignment.roleLabel,
      }));
      const assignments = membership.role === "member"
        ? allAssignments.filter((assignment) => assignment.kind === "MEMBER" && assignment.assigneeId === input.userId)
        : allAssignments;
      const dependencies = [...job.successorLinks, ...job.predecessorLinks]
        .filter((edge) => membership.role !== "member" || (visibleIds.has(edge.predecessorJobId) && visibleIds.has(edge.successorJobId)))
        .filter((edge, index, all) => all.findIndex((candidate) => candidate.predecessorJobId === edge.predecessorJobId && candidate.successorJobId === edge.successorJobId) === index)
        .map((edge) => ({ predecessorJobId: edge.predecessorJobId, successorJobId: edge.successorJobId }));
      const base = {
        id: job.id,
        projectId: job.projectId,
        projectCode: job.project.code,
        projectName: job.project.name,
        title: job.title,
        description: job.description,
        startsAt: job.startsAt.toISOString(),
        endsAt: job.endsAt.toISOString(),
        timezone: job.timezone,
        status: publicStatus(job.status)!,
        priority: job.priority,
        version: job.version,
        assignments,
        dependencies,
      };
      if (membership.role === "member") return base;
      return {
        ...base,
        conflicts: evaluateScheduleConflicts({
          job,
          assignments: job.assignments.map((assignment) => ({
            assigneeKind: publicAssigneeKind(assignment.assigneeKind),
            assigneeId: assignment.assigneeId,
          })),
          scheduledAssignments,
          availability: availability.map((entry) => ({
            assigneeKind: publicAssigneeKind(entry.assigneeKind),
            assigneeId: entry.assigneeId,
            kind: entry.kind === "available" ? "AVAILABLE" as const : "UNAVAILABLE" as const,
            startsAt: entry.startsAt,
            endsAt: entry.endsAt,
          })),
          predecessors: job.successorLinks.map((edge) => {
            const predecessor = jobs.find((candidate) => candidate.id === edge.predecessorJobId);
            if (!predecessor) throw new ConstructionAccessDenied();
            return { id: predecessor.id, status: publicStatus(predecessor.status)!, endsAt: predecessor.endsAt };
          }),
        }),
        impactedJobs: calculateScheduleImpacts({
          rescheduledJobId: job.id,
          rescheduledEndsAt: job.endsAt,
          edges,
          jobs: jobs.map((candidate) => ({ id: candidate.id, startsAt: candidate.startsAt })),
        }),
      };
    });
    const generatedAt = new Date().toISOString();
    if (membership.role === "member") {
      const result = fieldJobScheduleProjectionSchema.parse({
        schemaVersion: 1,
        generatedAt,
        workspaceId: input.workspaceId,
        role: "FIELD_WORKER",
        jobs: projected,
      });
      rejectFieldScheduleLeaks(result);
      return result;
    }
    return ownerJobScheduleProjectionSchema.parse({
      schemaVersion: 1,
      generatedAt,
      workspaceId: input.workspaceId,
      role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
      jobs: projected,
    });
  }).then((value) => jobScheduleProjectionSchema.parse(value));
}
