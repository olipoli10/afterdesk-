import "server-only";

import {
  CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION,
  constructionMobileAssistantHistorySchema,
  constructionMobileAssistantRequestSchema,
  type ConstructionMobileAssistantRequest,
} from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import { prisma } from "@/lib/db";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

async function requireMobileAssistantRole(userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(prisma, userId, workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ConstructionAccessDenied();
  }
  return membership;
}

export async function processConstructionMobileAssistantRequest(input: {
  userId: string;
  request: ConstructionMobileAssistantRequest | unknown;
}) {
  const request = constructionMobileAssistantRequestSchema.parse(input.request);
  await requireMobileAssistantRole(input.userId, request.workspaceId);
  return processOperatingAssistantCommand({
    userId: input.userId,
    envelope: {
      schemaVersion: 1,
      commandId: request.requestId,
      workspaceId: request.workspaceId,
      channel: "PORTAL",
      body: request.message,
      occurredAt: request.occurredAt,
      senderAddress: `user:${input.userId}`,
    },
  });
}

export async function constructionMobileAssistantHistoryForUser(input: {
  userId: string;
  workspaceId: string;
}) {
  await requireMobileAssistantRole(input.userId, input.workspaceId);
  const portalAddress = `user:${input.userId}`;
  const messages = await prisma.constructionMessage.findMany({
    where: {
      workspaceId: input.workspaceId,
      channel: "portal",
      OR: [
        { direction: "inbound", sender: portalAddress },
        { direction: "outbound", recipients: { has: portalAddress } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      direction: true,
      originalBody: true,
      status: true,
      createdAt: true,
    },
  });

  return constructionMobileAssistantHistorySchema.parse({
    schemaVersion: CONSTRUCTION_MOBILE_ASSISTANT_API_VERSION,
    generatedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    messages: messages.reverse().map((message) => ({
      id: message.id,
      direction: message.direction,
      body: message.originalBody,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    })),
    externalTransportPerformed: false,
  });
}
