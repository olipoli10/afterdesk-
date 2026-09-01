import "server-only";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  communicationChannelStatusSchema,
  prepareCommunicationChannelResultSchema,
  prepareCommunicationChannelSchema,
  revokeCommunicationChannelResultSchema,
  revokeCommunicationChannelSchema,
  type CommunicationChannel,
  type CommunicationChannelStatus,
} from "@/lib/construction-operating-assistant-r4/communication-contracts";
import {
  communicationCapabilities,
  communicationMissingConfiguration,
  communicationOperationKey,
  communicationProvider,
  opaqueCommunicationIdentityRef,
} from "@/lib/construction-operating-assistant-r4/communications";

type Db = Prisma.TransactionClient | typeof prisma;

async function requireCommunicationAuthority(db: Db, input: {
  userId: string;
  workspaceId: string;
  manage: boolean;
}) {
  const membership = await db.constructionWorkspaceMember.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: "active",
      workspace: { status: "active" },
    },
    select: { role: true },
  });
  if (!membership || (input.manage && !["owner", "admin"].includes(membership.role))) {
    throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  }
  return membership;
}

function dbChannel(channel: CommunicationChannel) {
  return channel === "SMS" ? "sms" as const : "voice" as const;
}

export async function communicationChannelStatusForUser(input: {
  userId: string;
  workspaceId: string;
  channel: CommunicationChannel;
}): Promise<CommunicationChannelStatus> {
  await requireCommunicationAuthority(prisma, { ...input, manage: false });
  const provider = communicationProvider(input.channel);
  const subjectRef = opaqueCommunicationIdentityRef(input);
  const [account, identity] = await Promise.all([
    prisma.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: input.workspaceId, provider } },
      include: { grants: { select: { capability: true, status: true } } },
    }),
    prisma.constructionCommunicationIdentity.findUnique({
      where: {
        workspaceId_channel_normalizedAddress: {
          workspaceId: input.workspaceId,
          channel: dbChannel(input.channel),
          normalizedAddress: subjectRef,
        },
      },
      select: { status: true, verified: true },
    }),
  ]);
  if (!account) {
    return communicationChannelStatusSchema.parse({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      channel: input.channel,
      status: "NOT_CONFIGURED",
      capabilities: [],
      senderIdentityRef: null,
      localAdapterReady: false,
      credentialStored: false,
      externalTransportEnabled: false,
      externalActivationReady: false,
      nextStep: `Préparer le canal ${input.channel} local.`,
    });
  }
  const activeCapabilities = account.grants
    .filter((grant) => ["requested", "active"].includes(grant.status))
    .map((grant) => grant.capability)
    .sort();
  const status = account.status === "prepared"
    ? "PREPARED"
    : account.status === "revoked"
      ? "REVOKED"
      : "ERROR";
  const localAdapterReady = status === "PREPARED" && identity?.status === "active" && identity.verified;
  return communicationChannelStatusSchema.parse({
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    channel: input.channel,
    status,
    capabilities: activeCapabilities,
    senderIdentityRef: localAdapterReady ? subjectRef : null,
    localAdapterReady,
    credentialStored: false,
    externalTransportEnabled: false,
    externalActivationReady: false,
    nextStep: status === "REVOKED"
      ? "Reconnecter explicitement le canal pour rétablir l’adaptateur local."
      : `Adaptateur ${input.channel} local prêt; le fournisseur externe demeure désactivé.`,
  });
}

export async function prepareCommunicationChannel(input: { userId: string; command: unknown }) {
  const command = prepareCommunicationChannelSchema.parse(input.command);
  const provider = communicationProvider(command.channel);
  const capabilities = communicationCapabilities(command.channel);
  const subjectRef = opaqueCommunicationIdentityRef({
    userId: input.userId,
    workspaceId: command.workspaceId,
    channel: command.channel,
  });
  const key = communicationOperationKey({ ...command, action: command.action });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireCommunicationAuthority(tx, { userId: input.userId, workspaceId: command.workspaceId, manage: true });
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: command.workspaceId, idempotencyKey: key } },
      select: { id: true, connectorAccountId: true, request: true },
    });
    if (existing) {
      const request = existing.request as { channel?: string; senderIdentityRef?: string; capabilities?: string[] };
      if (request.channel !== command.channel || request.senderIdentityRef !== subjectRef) {
        throw new Error("CONNECTOR_IDEMPOTENCY_INPUT_MISMATCH");
      }
      return prepareCommunicationChannelResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        channel: command.channel,
        accountId: existing.connectorAccountId,
        operationId: existing.id,
        senderIdentityRef: subjectRef,
        status: "PREPARED",
        capabilities: request.capabilities,
        missingConfiguration: communicationMissingConfiguration(command.channel),
        replayed: true,
        externalTransportPerformed: false,
      });
    }

    const account = await tx.constructionConnectorAccount.upsert({
      where: { workspaceId_provider: { workspaceId: command.workspaceId, provider } },
      create: {
        workspaceId: command.workspaceId,
        provider,
        status: "prepared",
        requestedScopes: capabilities,
        grantedScopes: [],
        createdByUserId: input.userId,
      },
      update: {
        status: "prepared",
        requestedScopes: capabilities,
        grantedScopes: [],
        externalAccountKeyHash: null,
        credentialRef: null,
        syncCursorRef: null,
        revokedAt: null,
        stateVersion: { increment: 1 },
      },
      select: { id: true },
    });
    for (const capability of capabilities) {
      await tx.constructionConnectorGrant.upsert({
        where: { connectorAccountId_capability: { connectorAccountId: account.id, capability } },
        create: {
          connectorAccountId: account.id,
          capability,
          status: "requested",
          requestedScopes: [capability],
          grantedScopes: [],
        },
        update: {
          status: "requested",
          requestedScopes: [capability],
          grantedScopes: [],
          grantedAt: null,
          revokedAt: null,
          stateVersion: { increment: 1 },
        },
      });
    }
    await tx.constructionCommunicationIdentity.upsert({
      where: {
        workspaceId_channel_normalizedAddress: {
          workspaceId: command.workspaceId,
          channel: dbChannel(command.channel),
          normalizedAddress: subjectRef,
        },
      },
      create: {
        workspaceId: command.workspaceId,
        userId: input.userId,
        channel: dbChannel(command.channel),
        normalizedAddress: subjectRef,
        verified: true,
        permissions: ["REPORT", "ASK", "COMMAND"],
        status: "active",
      },
      update: {
        userId: input.userId,
        verified: true,
        permissions: ["REPORT", "ASK", "COMMAND"],
        status: "active",
      },
    });
    const request = {
      schemaVersion: 1,
      provider,
      channel: command.channel,
      senderIdentityRef: subjectRef,
      capabilities,
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "communication_channel_prepare",
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
      entityType: "connector_account",
      entityId: account.id,
      action: "communication_channel_prepared",
      reasonCode: command.channel,
      metadata: { operationId: operation.id, capabilities, externalTransportPerformed: false },
    });
    return prepareCommunicationChannelResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      channel: command.channel,
      accountId: account.id,
      operationId: operation.id,
      senderIdentityRef: subjectRef,
      status: "PREPARED",
      capabilities,
      missingConfiguration: communicationMissingConfiguration(command.channel),
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: "Serializable" });
}

export async function revokeCommunicationChannel(input: { userId: string; command: unknown }) {
  const command = revokeCommunicationChannelSchema.parse(input.command);
  const provider = communicationProvider(command.channel);
  const key = communicationOperationKey({ ...command, action: command.action });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireCommunicationAuthority(tx, { userId: input.userId, workspaceId: command.workspaceId, manage: true });
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: command.workspaceId, idempotencyKey: key } },
      select: { id: true, connectorAccountId: true },
    });
    if (existing) {
      return revokeCommunicationChannelResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        channel: command.channel,
        accountId: existing.connectorAccountId,
        operationId: existing.id,
        status: "REVOKED",
        localAccessDisabled: true,
        replayed: true,
        externalTransportPerformed: false,
      });
    }
    const account = await tx.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: command.workspaceId, provider } },
      select: { id: true },
    });
    if (!account) throw new Error("CONNECTOR_NOT_FOUND");
    await tx.constructionConnectorAccount.update({
      where: { id: account.id },
      data: {
        status: "revoked",
        requestedScopes: [],
        grantedScopes: [],
        externalAccountKeyHash: null,
        credentialRef: null,
        syncCursorRef: null,
        revokedAt: new Date(),
        stateVersion: { increment: 1 },
      },
    });
    await tx.constructionConnectorGrant.updateMany({
      where: { connectorAccountId: account.id, status: { not: "revoked" } },
      data: { status: "revoked", grantedScopes: [], revokedAt: new Date(), stateVersion: { increment: 1 } },
    });
    await tx.constructionCommunicationIdentity.updateMany({
      where: {
        workspaceId: command.workspaceId,
        channel: dbChannel(command.channel),
        normalizedAddress: { startsWith: "ref_" },
      },
      data: { status: "revoked", verified: false, permissions: [] },
    });
    await tx.constructionConnectorOperation.updateMany({
      where: { connectorAccountId: account.id, status: "prepared" },
      data: { status: "refused", refusedAt: new Date() },
    });
    const request = {
      schemaVersion: 1,
      provider,
      channel: command.channel,
      localOnly: true,
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "communication_channel_revoke",
        status: "applied",
        idempotencyKey: key,
        request,
        requestHash: sha256Canonical(request),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
        appliedAt: new Date(),
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "connector_account",
      entityId: account.id,
      action: "communication_channel_revoked_locally",
      reasonCode: command.channel,
      metadata: { operationId: operation.id, externalTransportPerformed: false },
    });
    return revokeCommunicationChannelResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      channel: command.channel,
      accountId: account.id,
      operationId: operation.id,
      status: "REVOKED",
      localAccessDisabled: true,
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: "Serializable" });
}

export { requireCommunicationAuthority };
