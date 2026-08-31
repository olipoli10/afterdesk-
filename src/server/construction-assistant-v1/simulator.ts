import "server-only";
import { prisma } from "@/lib/db";
import { admitLocalEnvelope, type LocalInboundEnvelope } from "@/lib/construction-assistant-v1/messaging";
import { processConstructionMessage, type ConstructionIntakeResult } from "./intake";

type SimulationResult =
  | { admitted: false; reason: "SIGNATURE_INVALID" | "IDENTITY_UNVERIFIED" }
  | { admitted: true; result: ConstructionIntakeResult };

export async function simulateInboundMessage(input: {
  workspaceId: string;
  envelope: LocalInboundEnvelope;
}): Promise<SimulationResult> {
  const identity = await prisma.constructionCommunicationIdentity.findUnique({
    where: {
      workspaceId_channel_normalizedAddress: {
        workspaceId: input.workspaceId,
        channel: input.envelope.channel.toLocaleLowerCase("en-CA") as "sms" | "email",
        normalizedAddress: input.envelope.normalizedSender,
      },
    },
    select: { userId: true, verified: true, status: true, permissions: true },
  });
  const admission = admitLocalEnvelope({
    envelope: input.envelope,
    identityVerified: Boolean(identity?.verified && identity.status === "active" && identity.permissions.includes("COMMAND")),
  });
  if (!admission.admitted) return admission;
  if (!identity?.userId) return { admitted: false, reason: "IDENTITY_UNVERIFIED" };
  const result = await processConstructionMessage({
    userId: identity.userId,
    workspaceId: input.workspaceId,
    channel: input.envelope.channel.toLocaleLowerCase("en-CA") as "sms" | "email",
    body: input.envelope.body,
    idempotencyKey: admission.idempotencyKey,
    provider: input.envelope.provider,
    providerMessageId: input.envelope.providerMessageId,
    sender: input.envelope.normalizedSender,
    receivedAt: new Date(input.envelope.receivedAt),
    referenceNow: new Date(input.envelope.receivedAt),
  });
  return { admitted: true as const, result };
}
