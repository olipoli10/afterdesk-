import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  fieldFollowUpQueueSchema,
  followUpEngineCommandSchema,
  followUpEngineResultSchema,
  managedFollowUpPolicySchema,
  ownerFollowUpQueueSchema,
  type FollowUpEngineCommand,
  type FollowUpEngineResult,
  type FollowUpQueue,
  type ManagedFollowUpPolicy,
} from "@/lib/construction-operating-assistant-r20/contracts";
import {
  decideNoResponse,
  rejectFieldFollowUpLeaks,
} from "@/lib/construction-operating-assistant-r20/policy";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

export class FollowUpEngineConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "FollowUpEngineConflict";
  }
}

const FOLLOW_UP_SELECT = {
  id: true,
  workspaceId: true,
  projectId: true,
  contactId: true,
  receivableId: true,
  openLoopId: true,
  jobId: true,
  calendarItemId: true,
  kind: true,
  status: true,
  dueAt: true,
  channel: true,
  body: true,
  bodyHash: true,
  idempotencyKey: true,
  requestedById: true,
  attempt: true,
  version: true,
  ownerKind: true,
  ownerId: true,
  nextDecision: true,
  policy: true,
  policyHash: true,
  escalationLevel: true,
  lastAttemptAt: true,
  preparedAt: true,
  completedAt: true,
  cancelledAt: true,
  attempts: {
    orderBy: { attemptNumber: "asc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      dueAt: true,
      preparedAt: true,
      resolvedAt: true,
    },
  },
} satisfies Prisma.ConstructionFollowUpSelect;

type FollowUpState = Prisma.ConstructionFollowUpGetPayload<{
  select: typeof FOLLOW_UP_SELECT;
}>;

const FOLLOW_UP_PROJECTION_SELECT = {
  ...FOLLOW_UP_SELECT,
  project: { select: { code: true, name: true } },
  contact: { select: { displayName: true } },
  receivable: { select: { invoiceReference: true } },
  openLoop: { select: { desiredOutcome: true } },
  job: { select: { title: true } },
  calendarItem: { select: { title: true } },
} satisfies Prisma.ConstructionFollowUpSelect;

type FollowUpProjectionRow = Prisma.ConstructionFollowUpGetPayload<{
  select: typeof FOLLOW_UP_PROJECTION_SELECT;
}>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function publicStatus(status: FollowUpState["status"]): FollowUpEngineResult["status"] {
  return status.toUpperCase() as FollowUpEngineResult["status"];
}

function publicOwnerKind(kind: "member" | "contact") {
  return kind === "member" ? "MEMBER" as const : "CONTACT" as const;
}

function dbOwnerKind(kind: "MEMBER" | "CONTACT") {
  return kind === "MEMBER" ? "member" as const : "contact" as const;
}

function policyOf(followUp: FollowUpState): ManagedFollowUpPolicy {
  if (!followUp.policyHash || !followUp.policy) {
    throw new FollowUpEngineConflict("FOLLOW_UP_NOT_MANAGED");
  }
  return managedFollowUpPolicySchema.parse(followUp.policy);
}

function snapshot(followUp: FollowUpState | null) {
  if (!followUp) return null;
  return {
    id: followUp.id,
    workspaceId: followUp.workspaceId,
    projectId: followUp.projectId,
    contactId: followUp.contactId,
    receivableId: followUp.receivableId,
    openLoopId: followUp.openLoopId,
    jobId: followUp.jobId,
    calendarItemId: followUp.calendarItemId,
    kind: followUp.kind,
    status: publicStatus(followUp.status),
    dueAt: followUp.dueAt.toISOString(),
    channel: followUp.channel,
    bodyHash: followUp.bodyHash,
    attempt: followUp.attempt,
    version: followUp.version,
    owner: followUp.ownerKind && followUp.ownerId
      ? { kind: publicOwnerKind(followUp.ownerKind), ownerId: followUp.ownerId }
      : null,
    nextDecision: followUp.nextDecision,
    policyHash: followUp.policyHash,
    escalationLevel: followUp.escalationLevel,
    lastAttemptAt: followUp.lastAttemptAt?.toISOString() ?? null,
    completedAt: followUp.completedAt?.toISOString() ?? null,
    cancelledAt: followUp.cancelledAt?.toISOString() ?? null,
    attempts: followUp.attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status.toUpperCase(),
      dueAt: attempt.dueAt.toISOString(),
      preparedAt: attempt.preparedAt.toISOString(),
      resolvedAt: attempt.resolvedAt?.toISOString() ?? null,
    })),
  };
}

async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r20:${key}`}, 0))::text AS acquired
  `);
}

async function requireOperator(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role === "member") throw new ConstructionAccessDenied();
  return membership;
}

async function assertOwner(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    projectId: string;
    owner: { kind: "MEMBER" | "CONTACT"; ownerId: string };
  },
) {
  if (input.owner.kind === "MEMBER") {
    const member = await tx.constructionWorkspaceMember.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.owner.ownerId,
        status: "active",
      },
      select: { id: true },
    });
    if (!member) throw new ConstructionAccessDenied();
    return;
  }
  const contact = await tx.constructionContact.findFirst({
    where: {
      id: input.owner.ownerId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      status: "active",
    },
    select: { id: true },
  });
  if (!contact) throw new ConstructionAccessDenied();
}

async function assertProjectContact(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; projectId: string; contactId: string },
) {
  const [project, contact] = await Promise.all([
    tx.constructionProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId, status: "active" },
      select: { id: true },
    }),
    tx.constructionContact.findFirst({
      where: {
        id: input.contactId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: "active",
      },
      select: { id: true },
    }),
  ]);
  if (!project || !contact) throw new ConstructionAccessDenied();
}

type TargetBinding = {
  kind: "receivable_payment" | "missing_evidence" | "job_progress" | "calendar_confirmation";
  receivableId: string | null;
  openLoopId: string | null;
  jobId: string | null;
  calendarItemId: string | null;
};

async function assertTarget(
  tx: Prisma.TransactionClient,
  input: Extract<FollowUpEngineCommand, { action: "CREATE_FOLLOW_UP" }>,
): Promise<TargetBinding> {
  if (input.target.kind === "RECEIVABLE") {
    const target = await tx.constructionReceivable.findFirst({
      where: {
        id: input.target.receivableId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: { in: ["open", "partial", "disputed"] },
      },
      select: { id: true },
    });
    if (!target) throw new ConstructionAccessDenied();
    return { kind: "receivable_payment", receivableId: target.id, openLoopId: null, jobId: null, calendarItemId: null };
  }
  if (input.target.kind === "OPEN_LOOP") {
    const target = await tx.constructionOpenLoop.findFirst({
      where: {
        id: input.target.openLoopId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: { notIn: ["closed", "revoked", "ready_to_invoice"] },
      },
      select: { id: true },
    });
    if (!target) throw new ConstructionAccessDenied();
    return { kind: "missing_evidence", receivableId: null, openLoopId: target.id, jobId: null, calendarItemId: null };
  }
  if (input.target.kind === "JOB") {
    const target = await tx.constructionJob.findFirst({
      where: {
        id: input.target.jobId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        status: { notIn: ["completed", "cancelled"] },
      },
      select: { id: true },
    });
    if (!target) throw new ConstructionAccessDenied();
    return { kind: "job_progress", receivableId: null, openLoopId: null, jobId: target.id, calendarItemId: null };
  }
  const target = await tx.constructionCalendarItem.findFirst({
    where: {
      id: input.target.calendarItemId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      status: { notIn: ["cancelled", "completed"] },
    },
    select: { id: true },
  });
  if (!target) throw new ConstructionAccessDenied();
  return { kind: "calendar_confirmation", receivableId: null, openLoopId: null, jobId: null, calendarItemId: target.id };
}

async function authorizedFollowUp(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  followUpId: string,
) {
  const followUp = await tx.constructionFollowUp.findFirst({
    where: { id: followUpId, workspaceId, policyHash: { not: null } },
    select: FOLLOW_UP_SELECT,
  });
  if (!followUp) throw new ConstructionAccessDenied();
  return followUp;
}

function requireVersion(followUp: FollowUpState, expectedVersion: number) {
  if (followUp.version !== expectedVersion) {
    throw new FollowUpEngineConflict("STALE_FOLLOW_UP_VERSION");
  }
  if (["completed", "cancelled"].includes(followUp.status)) {
    throw new FollowUpEngineConflict("TERMINAL_FOLLOW_UP_IMMUTABLE");
  }
}

async function existingReplay(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  commandId: string,
  commandHash: string,
) {
  const existing = await tx.constructionFollowUpTransition.findUnique({
    where: { workspaceId_commandId: { workspaceId, commandId } },
    select: { commandHash: true, result: true },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) {
    throw new FollowUpEngineConflict("COMMAND_ID_COLLISION");
  }
  const result = followUpEngineResultSchema.parse(existing.result);
  return { ...result, replayed: true };
}

async function insertTransition(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    commandId: string;
    commandHash: string;
    action: string;
    actorId: string;
    followUpId: string | null;
    before: FollowUpState | null;
    after: FollowUpState | null;
    result: FollowUpEngineResult;
  },
) {
  await tx.constructionFollowUpTransition.create({
    data: {
      workspaceId: input.workspaceId,
      followUpId: input.followUpId,
      commandId: input.commandId,
      commandHash: input.commandHash,
      action: input.action,
      versionBefore: input.before?.version ?? null,
      versionAfter: input.after?.version ?? null,
      beforeState: input.before ? asJson(snapshot(input.before)) : Prisma.JsonNull,
      afterState: input.after ? asJson(snapshot(input.after)) : Prisma.JsonNull,
      result: asJson(input.result),
      actorId: input.actorId,
    },
  });
}

function resultFor(input: {
  commandId: string;
  workspaceId: string;
  action: string;
  followUp: FollowUpState;
  attemptId?: string | null;
  disposition: FollowUpEngineResult["disposition"];
}) {
  return followUpEngineResultSchema.parse({
    schemaVersion: 1,
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    action: input.action,
    followUpId: input.followUp.id,
    attemptId: input.attemptId ?? null,
    status: publicStatus(input.followUp.status),
    version: input.followUp.version,
    owner: input.followUp.ownerKind && input.followUp.ownerId
      ? { kind: publicOwnerKind(input.followUp.ownerKind), ownerId: input.followUp.ownerId }
      : null,
    nextDecision: input.followUp.nextDecision,
    nextDueAt: ["scheduled", "escalated"].includes(input.followUp.status)
      ? input.followUp.dueAt.toISOString()
      : null,
    disposition: input.disposition,
    applied: true,
    replayed: false,
    externalTransportPerformed: false,
  });
}

export async function processFollowUpEngineCommand(input: {
  userId: string;
  command: unknown;
}) {
  const command = followUpEngineCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await lock(tx, `${command.workspaceId}:command:${command.commandId}`);
    await requireOperator(tx, input.userId, command.workspaceId);
    const replay = await existingReplay(tx, command.workspaceId, command.commandId, commandHash);
    if (replay) return replay;

    if (command.action === "CREATE_FOLLOW_UP") {
      await assertProjectContact(tx, command);
      await assertOwner(tx, { ...command, owner: command.owner });
      if (command.policy.escalationOwner) {
        await assertOwner(tx, { ...command, owner: command.policy.escalationOwner });
      }
      const target = await assertTarget(tx, command);
      const policyHash = sha256Canonical(command.policy);
      const created = await tx.constructionFollowUp.create({
        data: {
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          contactId: command.contactId,
          ...target,
          dueAt: new Date(command.dueAt),
          channel: command.channel,
          body: command.body,
          bodyHash: sha256Canonical({ body: command.body }),
          idempotencyKey: `r20:${command.commandId}`,
          requestedById: input.userId,
          ownerKind: dbOwnerKind(command.owner.kind),
          ownerId: command.owner.ownerId,
          nextDecision: command.nextDecision,
          policy: asJson(command.policy),
          policyHash,
        },
        select: FOLLOW_UP_SELECT,
      });
      const result = resultFor({
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        action: command.action,
        followUp: created,
        disposition: "CREATED",
      });
      await insertTransition(tx, {
        workspaceId: command.workspaceId,
        commandId: command.commandId,
        commandHash,
        action: command.action,
        actorId: input.userId,
        followUpId: created.id,
        before: null,
        after: created,
        result,
      });
      return result;
    }

    await lock(tx, `${command.workspaceId}:follow-up:${command.followUpId}`);
    const before = await authorizedFollowUp(tx, command.workspaceId, command.followUpId);
    requireVersion(before, command.expectedVersion);
    const nextVersion = before.version + 1;

    if (command.action === "REASSIGN_OWNER") {
      await assertOwner(tx, {
        workspaceId: command.workspaceId,
        projectId: before.projectId,
        owner: command.owner,
      });
      await tx.constructionFollowUp.update({
        where: { id: before.id },
        data: {
          ownerKind: dbOwnerKind(command.owner.kind),
          ownerId: command.owner.ownerId,
          nextDecision: command.nextDecision,
          version: nextVersion,
        },
      });
    } else if (command.action === "COMPLETE_FOLLOW_UP") {
      await tx.constructionFollowUp.update({
        where: { id: before.id },
        data: { status: "completed", completedAt: new Date(command.completedAt), version: nextVersion },
      });
    } else if (command.action === "CANCEL_FOLLOW_UP") {
      await tx.constructionFollowUp.update({
        where: { id: before.id },
        data: { status: "cancelled", cancelledAt: new Date(command.cancelledAt), version: nextVersion },
      });
    } else {
      const attempt = await tx.constructionFollowUpAttempt.findFirst({
        where: {
          id: command.attemptId,
          followUpId: before.id,
          workspaceId: command.workspaceId,
          status: { in: ["prepared_unsent", "ready_for_review"] },
        },
        select: { id: true, status: true },
      });
      if (!attempt) throw new FollowUpEngineConflict("ATTEMPT_NOT_ACTIONABLE");
      const occurredAt = new Date(command.occurredAt);
      await tx.constructionFollowUpAttempt.update({
        where: { id: attempt.id },
        data: {
          status: command.outcome === "RESOLVED" ? "resolved" : "no_response",
          resolvedAt: occurredAt,
        },
      });
      if (command.outcome === "RESOLVED") {
        await tx.constructionFollowUp.update({
          where: { id: before.id },
          data: { status: "completed", completedAt: occurredAt, version: nextVersion },
        });
      } else {
        const policy = policyOf(before);
        const decision = decideNoResponse({
          policy,
          attempt: before.attempt,
          escalationLevel: before.escalationLevel,
          occurredAt: command.occurredAt,
        });
        if (decision.useEscalationOwner && policy.escalationOwner) {
          await assertOwner(tx, {
            workspaceId: command.workspaceId,
            projectId: before.projectId,
            owner: policy.escalationOwner,
          });
        }
        await tx.constructionFollowUp.update({
          where: { id: before.id },
          data: {
            status:
              decision.status === "SCHEDULED"
                ? "scheduled"
                : decision.status === "ESCALATED"
                  ? "escalated"
                  : "decision_required",
            dueAt: decision.nextDueAt ? new Date(decision.nextDueAt) : before.dueAt,
            ownerKind:
              decision.useEscalationOwner && policy.escalationOwner
                ? dbOwnerKind(policy.escalationOwner.kind)
                : before.ownerKind,
            ownerId:
              decision.useEscalationOwner && policy.escalationOwner
                ? policy.escalationOwner.ownerId
                : before.ownerId,
            nextDecision:
              decision.status === "DECISION_REQUIRED"
                ? "Décider manuellement de la prochaine action de suivi."
                : before.nextDecision,
            escalationLevel: decision.status === "ESCALATED"
              ? before.escalationLevel + 1
              : before.escalationLevel,
            version: nextVersion,
          },
        });
      }
    }

    const after = await authorizedFollowUp(tx, command.workspaceId, before.id);
    const disposition: FollowUpEngineResult["disposition"] =
      after.status === "completed" ? "COMPLETED" :
      after.status === "cancelled" ? "CANCELLED" :
      after.status === "escalated" ? "ESCALATED" :
      after.status === "decision_required" ? "DECISION_REQUIRED" : "UPDATED";
    const result = resultFor({
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      action: command.action,
      followUp: after,
      attemptId: command.action === "RECORD_OUTCOME" ? command.attemptId : null,
      disposition,
    });
    await insertTransition(tx, {
      workspaceId: command.workspaceId,
      commandId: command.commandId,
      commandHash,
      action: command.action,
      actorId: input.userId,
      followUpId: before.id,
      before,
      after,
      result,
    });
    return result;
  });
}

async function targetIsClosed(tx: Prisma.TransactionClient, followUp: FollowUpState) {
  if (followUp.receivableId) {
    const row = await tx.constructionReceivable.findUnique({ where: { id: followUp.receivableId }, select: { status: true } });
    return !row || ["paid", "void"].includes(row.status);
  }
  if (followUp.openLoopId) {
    const row = await tx.constructionOpenLoop.findUnique({ where: { id: followUp.openLoopId }, select: { status: true } });
    return !row || ["closed", "revoked", "ready_to_invoice"].includes(row.status);
  }
  if (followUp.jobId) {
    const row = await tx.constructionJob.findUnique({ where: { id: followUp.jobId }, select: { status: true } });
    return !row || ["completed", "cancelled"].includes(row.status);
  }
  const row = await tx.constructionCalendarItem.findUnique({ where: { id: followUp.calendarItemId ?? "" }, select: { status: true } });
  return !row || ["completed", "cancelled"].includes(row.status);
}

function messageChannel(channel: "SMS" | "EMAIL" | "HUMAN_CALL") {
  return channel === "SMS" ? "sms" : channel === "EMAIL" ? "email" : "voice";
}

export async function processDueManagedFollowUpInTransaction(
  tx: Prisma.TransactionClient,
  followUpId: string,
  now: Date,
) {
    await lock(tx, `due:${followUpId}`);
    const before = await tx.constructionFollowUp.findFirst({
      where: {
        id: followUpId,
        policyHash: { not: null },
        status: { in: ["scheduled", "escalated"] },
        dueAt: { lte: now },
      },
      select: FOLLOW_UP_SELECT,
    });
    if (!before) return null;
    const commandId = `due:${before.id}:${before.version}`;
    const commandHash = sha256Canonical({ commandId, dueAt: before.dueAt.toISOString() });
    const replay = await existingReplay(tx, before.workspaceId, commandId, commandHash);
    if (replay) return replay;
    const nextVersion = before.version + 1;

    if (await targetIsClosed(tx, before)) {
      await tx.constructionFollowUp.update({
        where: { id: before.id },
        data: { status: "cancelled", cancelledAt: now, version: nextVersion },
      });
      const after = await authorizedFollowUp(tx, before.workspaceId, before.id);
      const result = resultFor({
        commandId,
        workspaceId: before.workspaceId,
        action: "PROCESS_DUE",
        followUp: after,
        disposition: "CANCELLED",
      });
      await insertTransition(tx, {
        workspaceId: before.workspaceId,
        commandId,
        commandHash,
        action: "PROCESS_DUE",
        actorId: before.requestedById,
        followUpId: before.id,
        before,
        after,
        result,
      });
      return result;
    }

    const attemptNumber = before.attempt + 1;
    const attemptId = randomUUID();
    let actionId: string | null = null;
    let nextStatus: "ready_for_review" | "awaiting_response";
    let disposition: "READY_FOR_REVIEW" | "PREPARED_UNSENT";
    if (before.channel === "INTERNAL") {
      nextStatus = "ready_for_review";
      disposition = "READY_FOR_REVIEW";
    } else {
      actionId = randomUUID();
      const sourceMessage = await tx.constructionMessage.create({
        data: {
          workspaceId: before.workspaceId,
          projectId: before.projectId,
          contactId: before.contactId,
          direction: "outbound",
          channel: messageChannel(before.channel),
          idempotencyKey: `r20-follow-up:${before.id}:${attemptNumber}`,
          sender: "ENDVERA_LOCAL",
          recipients: [`contact:${before.contactId}`],
          originalBody: before.body,
          normalizedBody: before.body.normalize("NFKC").replace(/\s+/g, " ").trim(),
          status: "interpreted",
          relatedOpenLoopId: before.openLoopId,
        },
        select: { id: true },
      });
      const payload = {
        schemaVersion: 1,
        disposition: "PREPARED_UNSENT",
        transportAuthorized: false,
        externalTransportPerformed: false,
        followUpId: before.id,
        attemptNumber,
        workspaceId: before.workspaceId,
        projectId: before.projectId,
        contactId: before.contactId,
        channel: before.channel,
        body: before.body,
        dueAt: before.dueAt.toISOString(),
      };
      await tx.constructionAction.create({
        data: {
          id: actionId,
          workspaceId: before.workspaceId,
          projectId: before.projectId,
          contactId: before.contactId,
          openLoopId: before.openLoopId,
          sourceMessageId: sourceMessage.id,
          type: "follow_up",
          status: "proposed",
          dueAt: before.dueAt,
          riskClass: "medium",
          approvalRequired: true,
          version: 1,
          payload: asJson(payload),
          payloadHash: sha256Canonical(payload),
        },
      });
      nextStatus = "awaiting_response";
      disposition = "PREPARED_UNSENT";
    }
    await tx.constructionFollowUpAttempt.create({
      data: {
        id: attemptId,
        workspaceId: before.workspaceId,
        projectId: before.projectId,
        contactId: before.contactId,
        followUpId: before.id,
        attemptNumber,
        status: before.channel === "INTERNAL" ? "ready_for_review" : "prepared_unsent",
        dueAt: before.dueAt,
        body: before.body,
        bodyHash: before.bodyHash,
        actionId,
        preparedAt: now,
      },
    });
    await tx.constructionFollowUp.update({
      where: { id: before.id },
      data: {
        status: nextStatus,
        attempt: attemptNumber,
        lastAttemptAt: now,
        version: nextVersion,
      },
    });
    const after = await authorizedFollowUp(tx, before.workspaceId, before.id);
    const result = resultFor({
      commandId,
      workspaceId: before.workspaceId,
      action: "PROCESS_DUE",
      followUp: after,
      attemptId,
      disposition,
    });
    await insertTransition(tx, {
      workspaceId: before.workspaceId,
      commandId,
      commandHash,
      action: "PROCESS_DUE",
      actorId: before.requestedById,
      followUpId: before.id,
      before,
      after,
      result,
    });
    return result;
}

async function processDueOne(followUpId: string, now: Date) {
  return prisma.$transaction((tx) =>
    processDueManagedFollowUpInTransaction(tx, followUpId, now),
  );
}

export async function prepareDueManagedFollowUps(input?: {
  now?: Date;
  limit?: number;
  workspaceId?: string;
}) {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, Math.min(input?.limit ?? 50, 100));
  const due = await prisma.constructionFollowUp.findMany({
    where: {
      workspaceId: input?.workspaceId,
      policyHash: { not: null },
      status: { in: ["scheduled", "escalated"] },
      dueAt: { lte: now },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });
  const results: FollowUpEngineResult[] = [];
  for (const row of due) {
    const result = await processDueOne(row.id, now);
    if (result) results.push(result);
  }
  return results;
}

function targetProjection(row: FollowUpProjectionRow) {
  if (row.receivableId) return { kind: "RECEIVABLE" as const, targetId: row.receivableId, label: row.receivable?.invoiceReference ?? "Compte à recevoir" };
  if (row.openLoopId) return { kind: "OPEN_LOOP" as const, targetId: row.openLoopId, label: row.openLoop?.desiredOutcome ?? "Dossier ouvert" };
  if (row.jobId) return { kind: "JOB" as const, targetId: row.jobId, label: row.job?.title ?? "Travail" };
  return { kind: "CALENDAR" as const, targetId: row.calendarItemId!, label: row.calendarItem?.title ?? "Rendez-vous" };
}

function safeFieldText(value: string) {
  return /(?:\$|\bCAD\b|\b(?:invoice|facture|paiement|solde)\b|\d+[.,]\d{2})/i.test(value)
    ? "Voir le bureau pour la prochaine étape."
    : value;
}

export async function followUpQueueForUser(input: {
  userId: string;
  workspaceId: string;
  projectId?: string;
}): Promise<FollowUpQueue> {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const rows = await prisma.constructionFollowUp.findMany({
    where: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      policyHash: { not: null },
      ...(membership.role === "member"
        ? {
            ownerKind: "member" as const,
            ownerId: input.userId,
            receivableId: null,
            status: { notIn: ["completed", "cancelled"] as const },
          }
        : {}),
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    select: FOLLOW_UP_PROJECTION_SELECT,
  });
  const generatedAt = new Date().toISOString();
  if (membership.role === "member") {
    const followUps = rows.map((row) => {
      const target = targetProjection(row);
      if (target.kind === "RECEIVABLE") throw new Error("FOLLOW_UP_FIELD_RECEIVABLE_REFUSED");
      return {
        id: row.id,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        contactName: row.contact.displayName,
        targetKind: target.kind,
        status: publicStatus(row.status),
        dueAt: row.dueAt.toISOString(),
        nextDecision: safeFieldText(row.nextDecision!),
        attempt: row.attempt,
      };
    });
    const projection = {
      schemaVersion: 1 as const,
      generatedAt,
      workspaceId: input.workspaceId,
      role: "FIELD_WORKER" as const,
      followUps,
    };
    rejectFieldFollowUpLeaks(projection);
    return fieldFollowUpQueueSchema.parse(projection);
  }

  const memberIds = rows.filter((row) => row.ownerKind === "member").map((row) => row.ownerId!);
  const contactIds = rows.filter((row) => row.ownerKind === "contact").map((row) => row.ownerId!);
  const [members, contacts] = await Promise.all([
    prisma.constructionWorkspaceMember.findMany({
      where: { workspaceId: input.workspaceId, userId: { in: memberIds }, status: "active" },
      select: { userId: true, user: { select: { name: true } } },
    }),
    prisma.constructionContact.findMany({
      where: { workspaceId: input.workspaceId, id: { in: contactIds }, status: "active" },
      select: { id: true, displayName: true },
    }),
  ]);
  const names = new Map<string, string>([
    ...members.map((member) => [member.userId, member.user.name] as const),
    ...contacts.map((contact) => [contact.id, contact.displayName] as const),
  ]);
  return ownerFollowUpQueueSchema.parse({
    schemaVersion: 1,
    generatedAt,
    workspaceId: input.workspaceId,
    role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
    followUps: rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectCode: row.project.code,
      projectName: row.project.name,
      contactId: row.contactId,
      contactName: row.contact.displayName,
      target: targetProjection(row),
      status: publicStatus(row.status),
      dueAt: row.dueAt.toISOString(),
      channel: row.channel,
      body: row.body,
      owner: {
        kind: publicOwnerKind(row.ownerKind!),
        ownerId: row.ownerId!,
        displayName: names.get(row.ownerId!) ?? "Responsable",
      },
      nextDecision: row.nextDecision,
      policy: policyOf(row),
      attempt: row.attempt,
      escalationLevel: row.escalationLevel,
      version: row.version,
      attempts: row.attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status.toUpperCase(),
        dueAt: attempt.dueAt.toISOString(),
        preparedAt: attempt.preparedAt.toISOString(),
        resolvedAt: attempt.resolvedAt?.toISOString() ?? null,
      })),
    })),
  });
}
