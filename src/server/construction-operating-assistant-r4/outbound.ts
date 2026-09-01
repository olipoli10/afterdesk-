import "server-only";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  boundOutboundActionSchema,
  verifyExactApproval,
} from "@/lib/construction-assistant-v1/outbound";
import {
  approveOutboundMessageSchema,
  outboundApprovalResultSchema,
  preparedSmsDispatchResultSchema,
  prepareSmsDispatchSchema,
  SMS_CONNECTOR_PROVIDER,
  SMS_OUTBOUND_PREPARE_CAPABILITY,
} from "@/lib/construction-operating-assistant-r4/communication-contracts";
import {
  communicationOperationKey,
  maskCommunicationRecipient,
} from "@/lib/construction-operating-assistant-r4/communications";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { requireCommunicationAuthority } from "./connectors";

export async function approveOutboundWithoutDispatch(input: { userId: string; command: unknown }) {
  const command = approveOutboundMessageSchema.parse(input.command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.actionId}`}, 0))::text AS acquired
    `);
    await requireCommunicationAuthority(tx, { userId: input.userId, workspaceId: command.workspaceId, manage: true });
    const action = await tx.constructionAction.findFirst({
      where: { id: command.actionId, workspaceId: command.workspaceId, type: "outbound_message" },
      select: {
        id: true,
        version: true,
        payload: true,
        payloadHash: true,
        status: true,
        approvedVersion: true,
        approvedPayloadHash: true,
        simulatedDeliveryCount: true,
      },
    });
    if (!action) throw new Error("OUTBOUND_ACTION_NOT_FOUND");
    if (action.simulatedDeliveryCount !== 0 || action.status === "simulated_delivered") {
      throw new Error("OUTBOUND_ALREADY_DELIVERED");
    }
    if (
      action.status === "approved" &&
      action.approvedVersion === command.expectedVersion &&
      action.approvedPayloadHash === command.expectedPayloadHash
    ) {
      return outboundApprovalResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        actionId: action.id,
        status: "APPROVED_UNSENT",
        approvedVersion: command.expectedVersion,
        approvedPayloadHash: command.expectedPayloadHash,
        replayed: true,
        externalTransportPerformed: false,
      });
    }
    const payload = boundOutboundActionSchema.parse(action.payload);
    const verification = verifyExactApproval(payload, {
      version: command.expectedVersion,
      fingerprint: command.expectedPayloadHash,
    });
    if (!verification.valid || action.payloadHash !== command.expectedPayloadHash) {
      throw new Error(verification.valid ? "PAYLOAD_CHANGED" : verification.reason);
    }
    const updated = await tx.constructionAction.updateMany({
      where: {
        id: action.id,
        workspaceId: command.workspaceId,
        status: "proposed",
        version: command.expectedVersion,
        payloadHash: command.expectedPayloadHash,
        simulatedDeliveryCount: 0,
      },
      data: {
        status: "approved",
        approvedVersion: command.expectedVersion,
        approvedPayloadHash: command.expectedPayloadHash,
        approvedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("CONCURRENT_OR_STALE");
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "action",
      entityId: action.id,
      action: "construction_outbound_approved_unsent",
      metadata: {
        commandId: command.commandId,
        version: command.expectedVersion,
        payloadHash: command.expectedPayloadHash,
        externalTransportPerformed: false,
      },
    });
    return outboundApprovalResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      actionId: action.id,
      status: "APPROVED_UNSENT",
      approvedVersion: command.expectedVersion,
      approvedPayloadHash: command.expectedPayloadHash,
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: "Serializable" });
}

export async function prepareApprovedSmsDispatch(input: { userId: string; command: unknown }) {
  const command = prepareSmsDispatchSchema.parse(input.command);
  const key = communicationOperationKey({
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    channel: "SMS",
    action: command.action,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireCommunicationAuthority(tx, { userId: input.userId, workspaceId: command.workspaceId, manage: true });
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: command.workspaceId, idempotencyKey: key } },
      select: { id: true, request: true },
    });
    const action = await tx.constructionAction.findFirst({
      where: { id: command.actionId, workspaceId: command.workspaceId, type: "outbound_message" },
      select: {
        id: true,
        version: true,
        payload: true,
        payloadHash: true,
        status: true,
        approvedVersion: true,
        approvedPayloadHash: true,
      },
    });
    if (!action) throw new Error("OUTBOUND_ACTION_NOT_FOUND");
    const payload = boundOutboundActionSchema.parse(action.payload);
    if (payload.channel !== "SMS") throw new Error("SMS_ACTION_REQUIRED");
    if (
      action.status !== "approved" ||
      action.version !== command.expectedVersion ||
      action.payloadHash !== command.expectedPayloadHash ||
      action.approvedVersion !== command.expectedVersion ||
      action.approvedPayloadHash !== command.expectedPayloadHash
    ) {
      throw new Error("EXACT_APPROVAL_REQUIRED");
    }
    if (existing) {
      const request = existing.request as { actionId?: string; version?: number; payloadHash?: string };
      if (
        request.actionId !== command.actionId ||
        request.version !== command.expectedVersion ||
        request.payloadHash !== command.expectedPayloadHash
      ) {
        throw new Error("CONNECTOR_IDEMPOTENCY_INPUT_MISMATCH");
      }
      return preparedSmsDispatchResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        actionId: action.id,
        operationId: existing.id,
        status: "PREPARED_UNSENT",
        channel: "SMS",
        maskedRecipient: maskCommunicationRecipient(payload.normalizedRecipient),
        body: payload.body,
        version: action.version,
        payloadHash: action.payloadHash,
        replayed: true,
        externalTransportPerformed: false,
      });
    }
    const account = await tx.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: command.workspaceId, provider: SMS_CONNECTOR_PROVIDER } },
      select: {
        id: true,
        status: true,
        grants: {
          where: { capability: SMS_OUTBOUND_PREPARE_CAPABILITY },
          select: { status: true },
          take: 1,
        },
      },
    });
    if (
      account?.status !== "prepared" ||
      !["requested", "active"].includes(account.grants[0]?.status ?? "")
    ) {
      throw new Error("SMS_CONNECTOR_NOT_PREPARED");
    }
    const request = {
      schemaVersion: 1,
      actionId: action.id,
      version: action.version,
      payloadHash: action.payloadHash,
      recipientRef: `ref_${sha256Canonical({
        purpose: "sms-recipient-r4",
        workspaceId: command.workspaceId,
        recipient: payload.normalizedRecipient,
      })}`,
      maskedRecipient: maskCommunicationRecipient(payload.normalizedRecipient),
      bodyHash: sha256Canonical({ body: payload.body }),
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "sms_dispatch_prepare",
        status: "prepared",
        idempotencyKey: key,
        request,
        requestHash: sha256Canonical(request),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "connector_operation",
      entityId: operation.id,
      action: "sms_dispatch_prepared_unsent",
      metadata: {
        actionId: action.id,
        version: action.version,
        payloadHash: action.payloadHash,
        externalTransportPerformed: false,
      },
    });
    return preparedSmsDispatchResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      actionId: action.id,
      operationId: operation.id,
      status: "PREPARED_UNSENT",
      channel: "SMS",
      maskedRecipient: request.maskedRecipient,
      body: payload.body,
      version: action.version,
      payloadHash: action.payloadHash,
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: "Serializable" });
}
