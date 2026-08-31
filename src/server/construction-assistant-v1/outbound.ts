import "server-only";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import {
  boundOutboundActionSchema,
  buildActionFingerprint,
  verifyExactApproval,
} from "@/lib/construction-assistant-v1/outbound";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { appendConstructionAudit } from "./audit";
import { requireActiveConstructionMember } from "./workspace";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function editOutboundDraft(input: {
  userId: string;
  workspaceId: string;
  actionId: string;
  body: string;
}) {
  return prisma.$transaction(async (tx) => {
    await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const action = await tx.constructionAction.findFirst({
      where: { id: input.actionId, workspaceId: input.workspaceId, type: "outbound_message", status: { in: ["proposed", "approved"] } },
      select: { id: true, version: true, payload: true },
    });
    if (!action) throw new Error("OUTBOUND_ACTION_NOT_FOUND");
    const prior = boundOutboundActionSchema.parse(action.payload);
    const next = { ...prior, version: action.version + 1, body: input.body };
    const payloadHash = buildActionFingerprint(next);
    const updated = await tx.constructionAction.update({
      where: { id: action.id },
      data: {
        version: next.version,
        payload: json(next),
        payloadHash,
        status: "proposed",
        approvedVersion: null,
        approvedPayloadHash: null,
        approvedAt: null,
      },
      select: { version: true, payloadHash: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      entityType: "action",
      entityId: action.id,
      action: "construction_outbound_draft_edited",
      metadata: { version: updated.version, payloadHash: updated.payloadHash, priorApprovalInvalidated: true },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveAndSimulateOutbound(input: {
  userId: string;
  workspaceId: string;
  actionId: string;
  expectedVersion: number;
  expectedPayloadHash: string;
}) {
  return prisma.$transaction(async (tx) => {
    await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const action = await tx.constructionAction.findFirst({
      where: { id: input.actionId, workspaceId: input.workspaceId, type: "outbound_message" },
      select: {
        id: true,
        sourceMessageId: true,
        version: true,
        payload: true,
        payloadHash: true,
        status: true,
        simulatedDeliveryCount: true,
      },
    });
    if (!action) throw new Error("OUTBOUND_ACTION_NOT_FOUND");
    if (action.simulatedDeliveryCount !== 0 || action.status === "simulated_delivered") {
      return { delivered: false as const, reason: "REPLAY_REFUSED" as const };
    }
    const payload = boundOutboundActionSchema.parse(action.payload);
    const verification = verifyExactApproval(payload, {
      version: input.expectedVersion,
      fingerprint: input.expectedPayloadHash,
    });
    if (!verification.valid || action.payloadHash !== input.expectedPayloadHash) {
      return { delivered: false as const, reason: verification.valid ? "PAYLOAD_CHANGED" as const : verification.reason };
    }

    const updated = await tx.constructionAction.updateMany({
      where: {
        id: action.id,
        workspaceId: input.workspaceId,
        version: input.expectedVersion,
        payloadHash: input.expectedPayloadHash,
        simulatedDeliveryCount: 0,
        status: "proposed",
      },
      data: {
        status: "simulated_delivered",
        approvedVersion: input.expectedVersion,
        approvedPayloadHash: input.expectedPayloadHash,
        approvedAt: new Date(),
        simulatedDeliveryCount: 1,
        simulatedDeliveredAt: new Date(),
      },
    });
    if (updated.count !== 1) return { delivered: false as const, reason: "CONCURRENT_OR_STALE" as const };
    const deliveryIdempotencyKey = sha256Canonical({
      workspaceId: input.workspaceId,
      actionId: action.id,
      version: input.expectedVersion,
      payloadHash: input.expectedPayloadHash,
      delivery: "ENDVERA_LOCAL_SIMULATOR",
    });
    await tx.constructionMessage.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: payload.contactId,
        direction: "outbound",
        channel: payload.channel.toLocaleLowerCase("en-CA") as "sms" | "email",
        provider: "ENDVERA_LOCAL_SIMULATOR",
        providerMessageId: `delivery:${action.id}:${input.expectedVersion}`,
        idempotencyKey: deliveryIdempotencyKey,
        sender: "ENDVERA",
        recipients: [payload.normalizedRecipient],
        originalBody: payload.body,
        normalizedBody: payload.body.normalize("NFKC").replace(/\s+/g, " ").trim(),
        status: "simulated_delivered",
        sentAt: new Date(),
      },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      entityType: "action",
      entityId: action.id,
      action: "construction_outbound_simulated_delivery",
      metadata: {
        version: input.expectedVersion,
        payloadHash: input.expectedPayloadHash,
        provider: "ENDVERA_LOCAL_SIMULATOR",
        externalTransport: false,
      },
    });
    return { delivered: true as const, provider: "ENDVERA_LOCAL_SIMULATOR" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
