import "server-only";

import { Prisma, type ConstructionChannel, type ConstructionMessageStatus } from "@prisma-client";
import type { ConstructionMobileAssistantRequest } from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import {
  deferredAssistantSnapshotSchema,
  unifiedAssistantResultSchema,
  type ClientAssistantRoutingProjection,
  type UnifiedAssistantResult,
} from "@/lib/construction-operating-assistant-r36c/contracts";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { prisma } from "@/lib/db";

export type DeferredAssistantReply = Readonly<{
  intent: "CLARIFICATION_REQUIRED" | "UNSUPPORTED";
  status: "CLARIFICATION_REQUIRED" | "REFUSED";
  reply: string;
}>;

function databaseChannel(channel: "PORTAL" | "MOBILE_APP" | "SMS" | "VOICE_TRANSCRIPT" | "EMAIL"): ConstructionChannel {
  if (channel === "VOICE_TRANSCRIPT") return "voice";
  if (channel === "MOBILE_APP") return "portal";
  return channel.toLocaleLowerCase("en-CA") as ConstructionChannel;
}

function inboundKey(workspaceId: string, requestId: string) {
  return sha256Canonical({ source: "endvera-unified-assistant-r36c", workspaceId, requestId });
}

function replyKey(workspaceId: string, requestId: string) {
  return sha256Canonical({ source: "endvera-unified-assistant-r36c-reply", workspaceId, requestId });
}

function messageStatus(reply: DeferredAssistantReply): ConstructionMessageStatus {
  return reply.status === "CLARIFICATION_REQUIRED" ? "needs_clarification" : "refused";
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sameAcceptedRequest(input: {
  existing: {
    originalBody: string;
    sender: string | null;
    channel: ConstructionChannel;
    receivedAt: Date | null;
  };
  userId: string;
  request: ConstructionMobileAssistantRequest;
  channel: "PORTAL" | "MOBILE_APP" | "SMS" | "VOICE_TRANSCRIPT" | "EMAIL";
}) {
  return input.existing.originalBody === input.request.message
    && input.existing.sender === `user:${input.userId}`
    && input.existing.channel === databaseChannel(input.channel)
    && input.existing.receivedAt?.toISOString() === new Date(input.request.occurredAt).toISOString();
}

export async function persistDeferredAssistantExchange(input: {
  userId: string;
  request: ConstructionMobileAssistantRequest;
  channel: "PORTAL" | "MOBILE_APP" | "SMS" | "VOICE_TRANSCRIPT" | "EMAIL";
  deferred: DeferredAssistantReply;
  routing: ClientAssistantRoutingProjection;
}): Promise<UnifiedAssistantResult> {
  return prisma.$transaction(async (tx) => {
    const lockKey = `${input.request.workspaceId}:${input.request.requestId}:r36c`;
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS acquired
    `);

    const requestKey = inboundKey(input.request.workspaceId, input.request.requestId);
    const responseKey = replyKey(input.request.workspaceId, input.request.requestId);
    const existing = await tx.constructionMessage.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: input.request.workspaceId,
          idempotencyKey: requestKey,
        },
      },
      select: {
        id: true,
        originalBody: true,
        sender: true,
        channel: true,
        receivedAt: true,
        interpretation: { select: { structuredResult: true } },
      },
    });

    if (existing) {
      if (!sameAcceptedRequest({
        existing,
        userId: input.userId,
        request: input.request,
        channel: input.channel,
      })) {
        throw new Error("ASSISTANT_ROUTING_REPLAY_MISMATCH");
      }
      const response = await tx.constructionMessage.findUniqueOrThrow({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.request.workspaceId,
            idempotencyKey: responseKey,
          },
        },
        select: { id: true, originalBody: true },
      });
      const snapshot = deferredAssistantSnapshotSchema.parse(existing.interpretation?.structuredResult);
      return unifiedAssistantResultSchema.parse({
        schemaVersion: 1,
        commandId: input.request.requestId,
        messageId: existing.id,
        assistantMessageId: response.id,
        intent: snapshot.result.intent,
        status: snapshot.result.status,
        reply: response.originalBody,
        canonicalEffectId: null,
        replayed: true,
        externalTransportPerformed: false,
        routing: snapshot.routing,
      });
    }

    const channel = databaseChannel(input.channel);
    const status = messageStatus(input.deferred);
    const inbound = await tx.constructionMessage.create({
      data: {
        workspaceId: input.request.workspaceId,
        direction: "inbound",
        channel,
        provider: "ENDVERA_ROUTING_R36C",
        providerMessageId: `request:${input.request.workspaceId}:${input.request.requestId}`,
        idempotencyKey: requestKey,
        sender: `user:${input.userId}`,
        recipients: [],
        originalBody: input.request.message,
        normalizedBody: input.request.message.normalize("NFKC").trim().toLocaleLowerCase("fr-CA"),
        status,
        receivedAt: new Date(input.request.occurredAt),
      },
      select: { id: true },
    });
    const snapshot = deferredAssistantSnapshotSchema.parse({
      schemaVersion: 1,
      kind: "R36C_DEFERRED_ROUTING",
      routing: input.routing,
      result: input.deferred,
    });
    await tx.constructionInterpretation.create({
      data: {
        workspaceId: input.request.workspaceId,
        messageId: inbound.id,
        intent: input.deferred.intent === "CLARIFICATION_REQUIRED" ? "clarification_required" : "unsupported",
        confidence: 1,
        language: "fr-CA",
        structuredResult: asJson(snapshot),
        interpreterVersion: "endvera-unified-assistant-r36c-v1",
      },
    });
    const response = await tx.constructionMessage.create({
      data: {
        workspaceId: input.request.workspaceId,
        direction: "outbound",
        channel,
        provider: "ENDVERA_ROUTING_R36C",
        providerMessageId: `reply:${input.request.workspaceId}:${input.request.requestId}`,
        idempotencyKey: responseKey,
        sender: "ENDVERA",
        recipients: [`user:${input.userId}`],
        originalBody: input.deferred.reply,
        normalizedBody: input.deferred.reply.normalize("NFKC").trim().toLocaleLowerCase("fr-CA"),
        status,
        sentAt: new Date(input.request.occurredAt),
      },
      select: { id: true },
    });

    return unifiedAssistantResultSchema.parse({
      schemaVersion: 1,
      commandId: input.request.requestId,
      messageId: inbound.id,
      assistantMessageId: response.id,
      intent: input.deferred.intent,
      status: input.deferred.status,
      reply: input.deferred.reply,
      canonicalEffectId: null,
      replayed: false,
      externalTransportPerformed: false,
      routing: input.routing,
    });
  });
}
