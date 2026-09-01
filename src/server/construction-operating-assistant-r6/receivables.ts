import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  preparedConstructionFollowUpSchema,
  recordConstructionReceivablePaymentSchema,
  recordConstructionReceivableSchema,
  scheduleConstructionFollowUpSchema,
  type ConstructionReceivableProjectionRole,
} from "@/lib/construction-operating-assistant-r6/contracts";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function lockKey(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  key: string,
) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${workspaceId}:construction-r6:${key}`}, 0)
    )::text AS acquired
  `;
}

async function requireOwnerOrAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
  workspaceId: string,
) {
  const membership = await requireActiveConstructionMember(
    tx,
    actorId,
    workspaceId,
  );
  if (membership.role === "member") throw new ConstructionAccessDenied();
}

export async function recordConstructionReceivable(rawInput: unknown) {
  const input = recordConstructionReceivableSchema.parse(rawInput);
  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, input.workspaceId, `receivable:${input.idempotencyKey}`);
      await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);

      const existing = await tx.constructionReceivable.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: {
          id: true,
          projectId: true,
          contactId: true,
          invoiceReference: true,
          originalAmountMinor: true,
          currency: true,
          issuedAt: true,
          dueAt: true,
          version: true,
          outstandingAmountMinor: true,
          status: true,
        },
      });
      if (existing) {
        const same =
          existing.projectId === input.projectId &&
          existing.contactId === input.contactId &&
          existing.invoiceReference === input.invoiceReference &&
          existing.originalAmountMinor === input.amountMinor &&
          existing.currency === input.currency &&
          existing.issuedAt.toISOString() === input.issuedAt &&
          existing.dueAt.toISOString() === input.dueAt;
        if (!same) throw new Error("CONSTRUCTION_RECEIVABLE_IDEMPOTENCY_CONFLICT");
        return { ...existing, replayed: true };
      }

      const project = await tx.constructionProject.findFirst({
        where: {
          id: input.projectId,
          workspaceId: input.workspaceId,
          status: "active",
        },
        select: { id: true },
      });
      const contact = await tx.constructionContact.findFirst({
        where: {
          id: input.contactId ?? undefined,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          status: "active",
        },
        select: { id: true },
      });
      if (!project || (input.contactId && !contact)) {
        throw new ConstructionAccessDenied();
      }

      const receivable = await tx.constructionReceivable.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          contactId: input.contactId,
          invoiceReference: input.invoiceReference,
          originalAmountMinor: input.amountMinor,
          outstandingAmountMinor: input.amountMinor,
          currency: input.currency,
          issuedAt: new Date(input.issuedAt),
          dueAt: new Date(input.dueAt),
          status: "open",
          version: 1,
          idempotencyKey: input.idempotencyKey,
          createdById: input.actorId,
        },
        select: {
          id: true,
          version: true,
          status: true,
          outstandingAmountMinor: true,
        },
      });
      await tx.constructionReceivableEvent.create({
        data: {
          workspaceId: input.workspaceId,
          receivableId: receivable.id,
          kind: "issued",
          eventKey: `issued:${input.requestId}`,
          amountMinor: input.amountMinor,
          resultingOutstandingMinor: input.amountMinor,
          sourceRef: input.sourceRef,
          actorId: input.actorId,
          occurredAt: new Date(input.issuedAt),
        },
      });
      await appendConstructionAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorId,
        entityType: "receivable",
        entityId: receivable.id,
        action: "construction_receivable_recorded",
        reasonCode: "INVOICE_ISSUED",
        metadata: {
          projectId: input.projectId,
          invoiceReference: input.invoiceReference,
          amountMinor: input.amountMinor,
          currency: input.currency,
        },
      });
      return { ...receivable, replayed: false };
    },
  );
}

export async function recordConstructionReceivablePayment(rawInput: unknown) {
  const input = recordConstructionReceivablePaymentSchema.parse(rawInput);
  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, input.workspaceId, `payment:${input.receivableId}:${input.eventId}`);
      await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
      await tx.$queryRaw`
        SELECT "id" FROM "ConstructionReceivable"
        WHERE "id" = ${input.receivableId} AND "workspaceId" = ${input.workspaceId}
        FOR UPDATE
      `;

      const existing = await tx.constructionReceivableEvent.findUnique({
        where: {
          receivableId_eventKey: {
            receivableId: input.receivableId,
            eventKey: input.eventId,
          },
        },
        select: {
          amountMinor: true,
          sourceRef: true,
          resultingOutstandingMinor: true,
          receivable: { select: { version: true, status: true } },
        },
      });
      if (existing) {
        if (
          existing.amountMinor !== input.amountMinor ||
          existing.sourceRef !== input.sourceRef
        ) {
          throw new Error("CONSTRUCTION_RECEIVABLE_PAYMENT_IDEMPOTENCY_CONFLICT");
        }
        return {
          version: existing.receivable.version,
          status: existing.receivable.status,
          outstandingAmountMinor: existing.resultingOutstandingMinor,
          replayed: true,
        };
      }

      const receivable = await tx.constructionReceivable.findFirst({
        where: { id: input.receivableId, workspaceId: input.workspaceId },
        select: {
          id: true,
          projectId: true,
          version: true,
          status: true,
          outstandingAmountMinor: true,
        },
      });
      if (!receivable) throw new ConstructionAccessDenied();
      if (receivable.version !== input.expectedVersion) {
        throw new Error("CONSTRUCTION_RECEIVABLE_STALE_VERSION");
      }
      if (["paid", "void"].includes(receivable.status)) {
        throw new Error("CONSTRUCTION_RECEIVABLE_NOT_PAYABLE");
      }
      if (input.amountMinor > receivable.outstandingAmountMinor) {
        throw new Error("CONSTRUCTION_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE");
      }

      const outstandingAmountMinor =
        receivable.outstandingAmountMinor - input.amountMinor;
      const status = outstandingAmountMinor === 0 ? "paid" : "partial";
      const nextVersion = receivable.version + 1;
      await tx.constructionReceivableEvent.create({
        data: {
          workspaceId: input.workspaceId,
          receivableId: receivable.id,
          kind: "payment_received",
          eventKey: input.eventId,
          amountMinor: input.amountMinor,
          resultingOutstandingMinor: outstandingAmountMinor,
          note: input.note,
          sourceRef: input.sourceRef,
          actorId: input.actorId,
          occurredAt: new Date(input.receivedAt),
        },
      });
      await tx.constructionReceivable.update({
        where: { id: receivable.id },
        data: {
          outstandingAmountMinor,
          status,
          version: nextVersion,
          paidAt: status === "paid" ? new Date(input.receivedAt) : null,
        },
      });
      if (status === "paid") {
        await tx.constructionFollowUp.updateMany({
          where: { receivableId: receivable.id, status: "scheduled" },
          data: { status: "cancelled", cancelledAt: new Date() },
        });
      }
      await appendConstructionAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorId,
        entityType: "receivable",
        entityId: receivable.id,
        action: "construction_receivable_payment_recorded",
        reasonCode: status === "paid" ? "PAID_IN_FULL" : "PARTIAL_PAYMENT",
        metadata: {
          amountMinor: input.amountMinor,
          outstandingAmountMinor,
          version: nextVersion,
        },
      });
      return {
        version: nextVersion,
        status,
        outstandingAmountMinor,
        replayed: false,
      };
    },
  );
}

export async function scheduleConstructionFollowUp(rawInput: unknown) {
  const input = scheduleConstructionFollowUpSchema.parse(rawInput);
  const bodyHash = sha256Canonical({ body: input.body });
  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, input.workspaceId, `follow-up:${input.idempotencyKey}`);
      await requireOwnerOrAdmin(tx, input.actorId, input.workspaceId);
      const existing = await tx.constructionFollowUp.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.workspaceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: {
          id: true,
          projectId: true,
          contactId: true,
          receivableId: true,
          openLoopId: true,
          dueAt: true,
          channel: true,
          bodyHash: true,
          status: true,
        },
      });
      const receivableId =
        input.target.kind === "RECEIVABLE_PAYMENT"
          ? input.target.receivableId
          : null;
      const openLoopId =
        input.target.kind === "MISSING_EVIDENCE"
          ? input.target.openLoopId
          : null;
      if (existing) {
        const same =
          existing.projectId === input.projectId &&
          existing.contactId === input.contactId &&
          existing.receivableId === receivableId &&
          existing.openLoopId === openLoopId &&
          existing.dueAt.toISOString() === input.dueAt &&
          existing.channel === input.channel &&
          existing.bodyHash === bodyHash;
        if (!same) throw new Error("CONSTRUCTION_FOLLOW_UP_IDEMPOTENCY_CONFLICT");
        return { ...existing, replayed: true };
      }

      const contact = await tx.constructionContact.findFirst({
        where: {
          id: input.contactId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          status: "active",
        },
        select: { id: true },
      });
      if (!contact) throw new ConstructionAccessDenied();
      if (receivableId) {
        const target = await tx.constructionReceivable.findFirst({
          where: {
            id: receivableId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            status: { in: ["open", "partial", "disputed"] },
          },
          select: { id: true },
        });
        if (!target) throw new ConstructionAccessDenied();
      } else {
        const target = await tx.constructionOpenLoop.findFirst({
          where: {
            id: openLoopId ?? undefined,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            status: { notIn: ["closed", "revoked", "ready_to_invoice"] },
          },
          select: { id: true },
        });
        if (!target) throw new ConstructionAccessDenied();
      }

      const followUp = await tx.constructionFollowUp.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          contactId: input.contactId,
          receivableId,
          openLoopId,
          kind:
            input.target.kind === "RECEIVABLE_PAYMENT"
              ? "receivable_payment"
              : "missing_evidence",
          dueAt: new Date(input.dueAt),
          channel: input.channel,
          body: input.body,
          bodyHash,
          idempotencyKey: input.idempotencyKey,
          requestedById: input.actorId,
        },
        select: { id: true, status: true, dueAt: true },
      });
      await appendConstructionAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorId,
        entityType: "follow_up",
        entityId: followUp.id,
        action: "construction_follow_up_scheduled",
        reasonCode: input.target.kind,
        metadata: {
          projectId: input.projectId,
          dueAt: input.dueAt,
          transportAuthorized: false,
        },
      });
      return { ...followUp, replayed: false };
    },
  );
}

function messageChannel(channel: "SMS" | "EMAIL" | "HUMAN_CALL") {
  return channel === "SMS" ? "sms" : channel === "EMAIL" ? "email" : "voice";
}

async function prepareOneFollowUp(followUpId: string, now: Date) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "ConstructionFollowUp"
        WHERE "id" = ${followUpId}
        FOR UPDATE
      `;
      const followUp = await tx.constructionFollowUp.findUnique({
        where: { id: followUpId },
        select: {
          id: true,
          workspaceId: true,
          projectId: true,
          contactId: true,
          receivableId: true,
          openLoopId: true,
          kind: true,
          status: true,
          dueAt: true,
          channel: true,
          body: true,
          bodyHash: true,
          requestedById: true,
          attempt: true,
          receivable: { select: { status: true } },
          openLoop: { select: { status: true } },
        },
      });
      if (
        !followUp ||
        followUp.status !== "scheduled" ||
        followUp.dueAt.getTime() > now.getTime()
      ) {
        return null;
      }
      const targetClosed =
        (followUp.receivable && ["paid", "void"].includes(followUp.receivable.status)) ||
        (followUp.openLoop &&
          ["closed", "revoked", "ready_to_invoice"].includes(
            followUp.openLoop.status,
          ));
      if (targetClosed) {
        await tx.constructionFollowUp.update({
          where: { id: followUp.id },
          data: { status: "cancelled", cancelledAt: now },
        });
        return { followUpId: followUp.id, disposition: "CANCELLED" as const };
      }

      const actionId = randomUUID();
      const payload = preparedConstructionFollowUpSchema.parse({
        schemaVersion: 1,
        disposition: "PREPARED_UNSENT",
        transportAuthorized: false,
        followUpId: followUp.id,
        workspaceId: followUp.workspaceId,
        projectId: followUp.projectId,
        contactId: followUp.contactId,
        channel: followUp.channel,
        body: followUp.body,
        dueAt: followUp.dueAt.toISOString(),
      });
      const payloadHash = sha256Canonical(payload);
      const sourceMessage = await tx.constructionMessage.create({
        data: {
          workspaceId: followUp.workspaceId,
          projectId: followUp.projectId,
          contactId: followUp.contactId,
          direction: "outbound",
          channel: messageChannel(followUp.channel),
          idempotencyKey: `follow-up-source:${followUp.id}:1`,
          sender: "ENDVERA_LOCAL",
          recipients: [`contact:${followUp.contactId}`],
          originalBody: followUp.body,
          normalizedBody: followUp.body.normalize("NFKC").replace(/\s+/g, " ").trim(),
          status: "interpreted",
          relatedOpenLoopId: followUp.openLoopId,
        },
        select: { id: true },
      });
      await tx.constructionAction.create({
        data: {
          id: actionId,
          workspaceId: followUp.workspaceId,
          projectId: followUp.projectId,
          contactId: followUp.contactId,
          openLoopId: followUp.openLoopId,
          sourceMessageId: sourceMessage.id,
          type: "follow_up",
          status: "proposed",
          dueAt: followUp.dueAt,
          riskClass: "medium",
          approvalRequired: true,
          version: 1,
          payload: json(payload),
          payloadHash,
        },
      });
      await tx.constructionFollowUp.update({
        where: { id: followUp.id },
        data: {
          status: "prepared_unsent",
          actionId,
          attempt: followUp.attempt + 1,
          preparedAt: now,
        },
      });
      await appendConstructionAudit(tx, {
        workspaceId: followUp.workspaceId,
        actorUserId: followUp.requestedById,
        entityType: "follow_up",
        entityId: followUp.id,
        action: "construction_follow_up_prepared_unsent",
        reasonCode: followUp.kind,
        metadata: {
          actionId,
          payloadHash,
          transportAuthorized: false,
          externalTransportPerformed: false,
        },
      });
      return {
        followUpId: followUp.id,
        actionId,
        disposition: "PREPARED_UNSENT" as const,
      };
    },
  );
}

export async function prepareDueConstructionFollowUps(input?: {
  now?: Date;
  limit?: number;
}) {
  const now = input?.now ?? new Date();
  const limit = Math.max(1, Math.min(input?.limit ?? 50, 100));
  const due = await prisma.constructionFollowUp.findMany({
    where: { status: "scheduled", dueAt: { lte: now } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });
  const results = [];
  for (const row of due) {
    const result = await prepareOneFollowUp(row.id, now);
    if (result) results.push(result);
  }
  return results;
}

export async function constructionReceivablesForRole(input: {
  userId: string;
  workspaceId: string;
  role: ConstructionReceivableProjectionRole;
}) {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  if (membership.role === "member" && input.role !== "FIELD_WORKER") {
    throw new ConstructionAccessDenied();
  }
  if (input.role === "FIELD_WORKER") {
    return prisma.constructionReceivable.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        project: { select: { code: true, name: true } },
        status: true,
        dueAt: true,
        followUps: {
          select: { kind: true, status: true, dueAt: true },
          orderBy: { dueAt: "asc" },
        },
      },
    });
  }
  return prisma.constructionReceivable.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: { dueAt: "asc" },
    select: {
      id: true,
      project: { select: { code: true, name: true } },
      contact: { select: { id: true, displayName: true } },
      invoiceReference: true,
      originalAmountMinor: true,
      outstandingAmountMinor: true,
      currency: true,
      issuedAt: true,
      dueAt: true,
      status: true,
      version: true,
      events: {
        select: {
          kind: true,
          amountMinor: true,
          resultingOutstandingMinor: true,
          occurredAt: true,
          sourceRef: true,
        },
        orderBy: { createdAt: "asc" },
      },
      followUps: {
        select: {
          kind: true,
          status: true,
          dueAt: true,
          channel: true,
          actionId: true,
        },
        orderBy: { dueAt: "asc" },
      },
    },
  });
}
