import "server-only";
import { prisma } from "@/lib/db";
import {
  communicationInboundResultSchema,
  type CommunicationInboundResult,
  type CommunicationInboundEvent,
  type TrustedCommunicationAdapterAssertion,
} from "@/lib/construction-operating-assistant-r4/communication-contracts";
import {
  admitCommunicationEvent,
  communicationCapabilities,
  communicationProvider,
} from "@/lib/construction-operating-assistant-r4/communications";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";

const inboundInFlight = new Map<string, Promise<CommunicationInboundResult>>();

async function applyAdmittedCommunication(input: {
  event: CommunicationInboundEvent;
  providerMessageId: string;
}): Promise<CommunicationInboundResult> {
  const { event, providerMessageId } = input;
  const provider = communicationProvider(event.channel);
  const capability = communicationCapabilities(event.channel)[0];
  const [account, identity] = await Promise.all([
    prisma.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: event.workspaceId, provider } },
      select: {
        status: true,
        grants: { where: { capability }, select: { status: true }, take: 1 },
      },
    }),
    prisma.constructionCommunicationIdentity.findUnique({
      where: {
        workspaceId_channel_normalizedAddress: {
          workspaceId: event.workspaceId,
          channel: event.channel === "SMS" ? "sms" : "voice",
          normalizedAddress: event.senderIdentityRef,
        },
      },
      select: { userId: true, verified: true, permissions: true, status: true },
    }),
  ]);
  if (
    account?.status !== "prepared" ||
    !["requested", "active"].includes(account.grants[0]?.status ?? "") ||
    identity?.status !== "active" ||
    !identity.userId ||
    !identity.verified ||
    !identity.permissions.includes("COMMAND")
  ) {
    throw new Error("COMMUNICATION_INBOUND_REFUSED");
  }
  const result = await processOperatingAssistantCommand({
    userId: identity.userId,
    envelope: {
      schemaVersion: 1,
      commandId: event.eventId,
      workspaceId: event.workspaceId,
      channel: event.channel === "SMS" ? "SMS" : "VOICE_TRANSCRIPT",
      body: event.body,
      occurredAt: event.occurredAt,
      senderAddress: event.senderIdentityRef,
      provider,
      providerMessageId,
    },
  });
  return communicationInboundResultSchema.parse({
    schemaVersion: 1,
    channel: event.channel,
    eventId: event.eventId,
    status: result.status,
    commandId: result.commandId,
    messageId: result.messageId,
    canonicalEffectId: result.canonicalEffectId,
    reply: result.reply,
    replayed: result.replayed,
    sourceAudioPersisted: false,
    externalTransportPerformed: false,
  });
}

export async function processCommunicationInbound(input: {
  event: unknown;
  assertion: TrustedCommunicationAdapterAssertion;
}): Promise<CommunicationInboundResult> {
  const admission = admitCommunicationEvent(input);
  if (!admission.admitted) throw new Error(admission.reason);
  const { event, providerMessageId } = admission;
  const inFlightKey = `${event.workspaceId}:${event.channel}:${event.eventId}`;
  const existing = inboundInFlight.get(inFlightKey);
  if (existing) {
    const result = await existing;
    return communicationInboundResultSchema.parse({ ...result, replayed: true });
  }
  const operation = applyAdmittedCommunication({ event, providerMessageId });
  inboundInFlight.set(inFlightKey, operation);
  try {
    return await operation;
  } finally {
    inboundInFlight.delete(inFlightKey);
  }
}
