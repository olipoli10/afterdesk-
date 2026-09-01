import "server-only";

import { Prisma } from "@prisma-client";
import {
  CONSTRUCTION_PERMISSION_CENTER_VERSION,
  constructionPermissionCenterSchema,
  revokePermissionCommandSchema,
  revokePermissionResultSchema,
  type ConstructionPermissionCenter,
  type RevokePermissionResult,
} from "@/lib/construction-operating-assistant-r16/permissions";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";
import {
  constructionPermissionsForRole,
  constructionProjectionRole,
} from "@/server/construction-operating-assistant-r7/gateway";

function capabilityRows(role: "OWNER" | "OFFICE_MANAGER" | "FIELD_WORKER") {
  const permissions = constructionPermissionsForRole(role);
  const rows = [
    { key: "PROJECT_STATE_READ", label: "Voir l’état des chantiers", effective: true },
    { key: "EVIDENCE_ADD", label: "Ajouter des preuves", effective: permissions.canAddEvidence },
  ];
  if (role === "FIELD_WORKER") {
    return [
      ...rows,
      { key: "FIELD_ASSIGNMENT_READ", label: "Voir son travail assigné", effective: true },
    ].map((row) => ({ ...row, state: "INTERNAL" as const }));
  }
  return [
    ...rows,
    { key: "PROJECT_STATE_WRITE", label: "Mettre à jour les chantiers", effective: true },
    { key: "FINANCIALS_READ", label: "Voir les montants financiers", effective: permissions.financialsVisible },
    { key: "RECEIVABLES_MANAGE", label: "Gérer les comptes à recevoir", effective: permissions.canManageReceivables },
    { key: "FOLLOW_UP_SCHEDULE", label: "Planifier les suivis", effective: permissions.canScheduleFollowUps },
    { key: "PREPARED_ACTION_DECIDE", label: "Décider les actions préparées", effective: permissions.canApprovePreparedActions },
    { key: "MEMBER_ROLE_READ", label: "Voir les rôles de l’équipe", effective: true },
    { key: "CONNECTOR_REVOKE", label: "Révoquer les accès locaux", effective: true },
  ].map((row) => ({ ...row, state: "INTERNAL" as const }));
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    google_calendar: "Google Calendar",
    local_sms: "SMS",
    local_voice: "Appels et messages vocaux",
  };
  return labels[provider] ?? provider.replaceAll("_", " ");
}

function connectorState(status: string) {
  if (status === "revoked") return "REVOKED" as const;
  if (status === "connected") return "GRANTED_LOCAL" as const;
  return "PREPARED_DISABLED" as const;
}

function grantState(status: string) {
  if (status === "revoked") return "REVOKED" as const;
  if (status === "active") return "GRANTED_LOCAL" as const;
  return "PREPARED_DISABLED" as const;
}

export async function constructionPermissionCenterForUser(input: {
  userId: string;
  workspaceId: string;
  generatedAt?: Date;
}): Promise<ConstructionPermissionCenter> {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  const role = constructionProjectionRole(membership.role);
  const workspace = await prisma.constructionWorkspace.findFirstOrThrow({
    where: { id: input.workspaceId, status: "active" },
    select: { id: true, name: true },
  });
  const members = await prisma.constructionWorkspaceMember.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "active",
      ...(role === "FIELD_WORKER" ? { userId: input.userId } : {}),
    },
    orderBy: [{ role: "asc" }, { userId: "asc" }],
    select: {
      userId: true,
      role: true,
      user: { select: { name: true } },
    },
  });
  const connectors = role === "FIELD_WORKER"
    ? []
    : await prisma.constructionConnectorAccount.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ provider: "asc" }, { id: "asc" }],
        select: {
          id: true,
          provider: true,
          status: true,
          stateVersion: true,
          grants: {
            orderBy: [{ capability: "asc" }, { id: "asc" }],
            select: {
              id: true,
              capability: true,
              status: true,
              stateVersion: true,
              requestedScopes: true,
              grantedScopes: true,
            },
          },
        },
      });

  return constructionPermissionCenterSchema.parse({
    schemaVersion: CONSTRUCTION_PERMISSION_CENTER_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    workspace,
    currentUser: { userId: input.userId, role },
    capabilities: capabilityRows(role),
    members: members.map((member) => ({
      userId: member.userId,
      displayName: member.user.name,
      role: constructionProjectionRole(member.role),
      status: "ACTIVE" as const,
      isCurrentUser: member.userId === input.userId,
    })),
    connectors: connectors.map((connector) => ({
      id: connector.id,
      provider: connector.provider,
      label: providerLabel(connector.provider),
      state: connectorState(connector.status),
      stateVersion: connector.stateVersion,
      grants: connector.grants.map((grant) => ({
        id: grant.id,
        capability: grant.capability,
        state: grantState(grant.status),
        stateVersion: grant.stateVersion,
        requestedScopes: [...grant.requestedScopes].sort(),
        grantedScopes: [...grant.grantedScopes].sort(),
        revocable: grant.status !== "revoked",
      })),
      revocable: connector.status !== "revoked",
      externalTransportEnabled: false,
    })),
    canManageConnectors: role !== "FIELD_WORKER",
    externalTransportEnabled: false,
  });
}

function operationKey(input: { workspaceId: string; commandId: string }) {
  return sha256Canonical({
    schemaVersion: 1,
    namespace: "permission_center_local_revoke",
    workspaceId: input.workspaceId,
    commandId: input.commandId,
  });
}

export async function revokeConstructionPermission(input: {
  userId: string;
  command: unknown;
}): Promise<RevokePermissionResult> {
  const command = revokePermissionCommandSchema.parse(input.command);
  const key = operationKey(command);
  const requestHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    const membership = await requireActiveConstructionMember(
      tx,
      input.userId,
      command.workspaceId,
    );
    if (membership.role === "member") throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: command.workspaceId,
          idempotencyKey: key,
        },
      },
      select: { requestHash: true, result: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new Error("PERMISSION_REVOCATION_IDEMPOTENCY_CONFLICT");
      }
      return revokePermissionResultSchema.parse({
        ...(existing.result as Record<string, unknown>),
        replayed: true,
      });
    }

    const account = await tx.constructionConnectorAccount.findFirst({
      where: { id: command.accountId, workspaceId: command.workspaceId },
      select: { id: true, status: true, stateVersion: true },
    });
    if (!account) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");

    let stateVersion: number;
    let grantId: string | null = null;
    if (command.action === "REVOKE_ACCOUNT_LOCAL") {
      if (account.stateVersion !== command.expectedStateVersion) {
        throw new Error("PERMISSION_REVOCATION_STALE_STATE");
      }
      const updated = await tx.constructionConnectorAccount.update({
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
        select: { stateVersion: true },
      });
      await tx.constructionConnectorGrant.updateMany({
        where: { connectorAccountId: account.id, status: { not: "revoked" } },
        data: {
          status: "revoked",
          grantedScopes: [],
          revokedAt: new Date(),
          stateVersion: { increment: 1 },
        },
      });
      await tx.constructionConnectorOperation.updateMany({
        where: { connectorAccountId: account.id, status: "prepared" },
        data: { status: "refused", refusedAt: new Date() },
      });
      stateVersion = updated.stateVersion;
    } else {
      const grant = await tx.constructionConnectorGrant.findFirst({
        where: { id: command.grantId, connectorAccountId: account.id },
        select: { id: true, stateVersion: true },
      });
      if (!grant) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      if (grant.stateVersion !== command.expectedStateVersion) {
        throw new Error("PERMISSION_REVOCATION_STALE_STATE");
      }
      const updated = await tx.constructionConnectorGrant.update({
        where: { id: grant.id },
        data: {
          status: "revoked",
          grantedScopes: [],
          revokedAt: new Date(),
          stateVersion: { increment: 1 },
        },
        select: { stateVersion: true },
      });
      grantId = grant.id;
      stateVersion = updated.stateVersion;
    }

    const responseBase = {
      schemaVersion: CONSTRUCTION_PERMISSION_CENTER_VERSION,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      accountId: account.id,
      grantId,
      target: command.action === "REVOKE_ACCOUNT_LOCAL" ? "ACCOUNT" as const : "GRANT" as const,
      state: "REVOKED" as const,
      stateVersion,
      operationId: "SELF",
      replayed: false,
      externalTransportPerformed: false as const,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "local_revoke",
        status: "applied",
        idempotencyKey: key,
        request: command,
        requestHash,
        result: responseBase,
        resultHash: sha256Canonical(responseBase),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
        appliedAt: new Date(),
      },
      select: { id: true },
    });
    const result = revokePermissionResultSchema.parse({
      ...responseBase,
      operationId: operation.id,
    });
    await tx.constructionConnectorOperation.update({
      where: { id: operation.id },
      data: { result, resultHash: sha256Canonical(result) },
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: grantId ? "connector_grant" : "connector_account",
      entityId: grantId ?? account.id,
      action: grantId ? "connector_grant_revoked_locally" : "connector_account_revoked_locally",
      metadata: {
        operationId: operation.id,
        externalTransportPerformed: false,
      },
    });
    return result;
  }, { isolationLevel: "Serializable" });
}
