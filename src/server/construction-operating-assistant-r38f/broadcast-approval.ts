import "server-only";

import { Prisma } from "@prisma-client";
import { z } from "zod";
import {
  approveSecretaryBroadcastCommandSchema,
  secretaryBroadcastApprovalResultSchema,
} from "@/lib/construction-operating-assistant-r38f/contracts";
import { secretaryBroadcastRecipientSchema } from "@/lib/construction-operating-assistant-r38e/contracts";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { prisma } from "@/lib/db";
import { requireActiveConstructionMember, ConstructionAccessDenied } from "@/server/construction-assistant-v1/workspace";

function resultFor(input: {
  commandId: string;
  workspaceId: string;
  draft: {
    id: string;
    status: string;
    version: number;
    payloadHash: string;
    body: string;
    recipientSnapshot: Prisma.JsonValue;
    approvedAt: Date | null;
    externalTransportPerformed: boolean;
  };
  replayed: boolean;
}) {
  const recipients = z.array(secretaryBroadcastRecipientSchema).parse(input.draft.recipientSnapshot);
  return secretaryBroadcastApprovalResultSchema.parse({
    schemaVersion: 1,
    action: "APPROVE_SECRETARY_BROADCAST",
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    draftId: input.draft.id,
    status: input.draft.status,
    version: input.draft.version,
    payloadHash: input.draft.payloadHash,
    recipientCount: recipients.length,
    body: input.draft.body,
    approvedAt: input.draft.approvedAt?.toISOString(),
    replayed: input.replayed,
    externalTransportPerformed: input.draft.externalTransportPerformed,
  });
}

export async function approveSecretaryBroadcast(input: { userId: string; command: unknown }) {
  const command = approveSecretaryBroadcastCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, command.workspaceId);
    if (membership.role !== "owner" && membership.role !== "admin") throw new ConstructionAccessDenied();
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.draftId}:r38f`}, 0))::text AS acquired
    `);
    const draft = await tx.constructionSecretaryBroadcastDraft.findFirst({
      where: { id: command.draftId, workspaceId: command.workspaceId },
    });
    if (!draft) throw new ConstructionAccessDenied();
    if (draft.approvalCommandId) {
      if (draft.approvalCommandId !== command.commandId || draft.approvalCommandHash !== commandHash) {
        throw new Error("R38F_SECOND_APPROVAL_REFUSED");
      }
      return resultFor({ commandId: command.commandId, workspaceId: command.workspaceId, draft, replayed: true });
    }
    if (draft.status !== "PREPARED_UNSENT") throw new Error("R38F_BROADCAST_NOT_PREPARED");
    if (draft.version !== command.expectedVersion || draft.payloadHash !== command.expectedPayloadHash) {
      throw new Error("R38F_EXACT_APPROVAL_MISMATCH");
    }
    const approvedAt = new Date();
    const updated = await tx.constructionSecretaryBroadcastDraft.update({
      where: { id: draft.id },
      data: {
        status: "APPROVED_UNSENT",
        approvalCommandId: command.commandId,
        approvalCommandHash: commandHash,
        approvedVersion: draft.version,
        approvedPayloadHash: draft.payloadHash,
        approvedByUserId: input.userId,
        approvedAt,
      },
    });
    await tx.constructionAuditEvent.create({
      data: {
        workspaceId: command.workspaceId,
        actorUserId: input.userId,
        entityType: "secretary_broadcast_draft",
        entityId: draft.id,
        action: "secretary_broadcast_approved_unsent",
        reasonCode: "R38F_EXACT_LOCAL_APPROVAL",
        metadata: {
          version: draft.version,
          payloadHash: draft.payloadHash,
          externalTransportPerformed: false,
        },
        fingerprint: sha256Canonical({
          action: "secretary_broadcast_approved_unsent",
          commandId: command.commandId,
          draftId: draft.id,
          payloadHash: draft.payloadHash,
        }),
      },
    });
    return resultFor({ commandId: command.commandId, workspaceId: command.workspaceId, draft: updated, replayed: false });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
