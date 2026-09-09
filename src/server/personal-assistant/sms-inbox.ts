import "server-only";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { createHash } from "node:crypto";
import type { TwilioSmsEnvelope } from "./twilio-envelope";
import { TwilioIngressRefused } from "./twilio-envelope";

// Reuse the durable connector-operation queue; do not create a second assistant
// database or run a model in the webhook request. The worker consumes this kind.
export async function enqueuePersonalSms(envelope: TwilioSmsEnvelope) {
  const idempotencyKey = `personal-sms:${createHash("sha256")
    .update(`${envelope.accountSid}:${envelope.messageSid}`).digest("hex")}`;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))::text AS acquired`);
    const identities = await tx.constructionCommunicationIdentity.findMany({
      where: {
        channel: "sms", normalizedAddress: envelope.from, status: "active", verified: true,
        permissions: { has: "COMMAND" }, userId: { not: null },
        workspace: { status: "active" },
      },
      select: { id: true, userId: true, workspaceId: true }, take: 2,
    });
    // An actual authenticated account/phone binding is required. A number in an
    // environment variable or a prepared synthetic identity grants no access.
    if (identities.length !== 1 || !identities[0].userId) throw new TwilioIngressRefused("IDENTITY_NOT_BOUND");
    const identity = identities[0];
    const actorId = identity.userId!;
    const member = await tx.constructionWorkspaceMember.findFirst({
      where: { userId: actorId, workspaceId: identity.workspaceId, status: "active", role: { in: ["owner", "admin"] } },
      select: { id: true },
    });
    if (!member) throw new TwilioIngressRefused("IDENTITY_NOT_BOUND");
    const account = await tx.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: identity.workspaceId, provider: "endvera_sms" } },
      select: { id: true, status: true, externalAccountKeyHash: true, grants: { where: { capability: "sms_inbound", status: "active" }, select: { id: true } } },
    });
    const accountHash = createHash("sha256").update(envelope.accountSid).digest("hex");
    if (account?.status !== "connected" || account.externalAccountKeyHash !== accountHash || !account.grants.length) {
      throw new TwilioIngressRefused("CHANNEL_NOT_CONNECTED");
    }
    const prior = await tx.constructionConnectorOperation.findFirst({
      where: { idempotencyKey, kind: "personal_sms_inbound" },
      select: { id: true, workspaceId: true, createdByUserId: true, requestHash: true },
    });
    if (prior) {
      if (prior.workspaceId !== identity.workspaceId || prior.createdByUserId !== actorId || prior.requestHash !== envelope.contentHash) {
        throw new TwilioIngressRefused("REPLAY_CONFLICT");
      }
      return { operationId: prior.id, replayed: true };
    }
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: identity.workspaceId, connectorAccountId: account.id,
        kind: "personal_sms_inbound", status: "received", idempotencyKey,
        request: { schemaVersion: 1, ...envelope, identityId: identity.id },
        requestHash: envelope.contentHash, externalTransportPerformed: true,
        createdByUserId: actorId,
      },
      select: { id: true },
    });
    return { operationId: operation.id, replayed: false };
  }, { isolationLevel: "Serializable" });
}
