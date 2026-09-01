import "server-only";
import { Prisma, type ConstructionConnectorAccount } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  calendarConnectorStatusSchema,
  prepareCalendarConnectorResultSchema,
  prepareCalendarConnectorSchema,
  revokeCalendarConnectorResultSchema,
  revokeCalendarConnectorSchema,
  GOOGLE_CALENDAR_PROVIDER,
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_CALENDAR_WRITE_SCOPE,
  type CalendarConnectorStatus,
  type PrepareCalendarConnectorResult,
  type RevokeCalendarConnectorResult,
} from "@/lib/construction-operating-assistant-r3/connector-contracts";
import {
  googleCalendarConsentPlan,
  googleCalendarScopesForMode,
} from "@/lib/construction-operating-assistant-r3/google-calendar";

type Db = Prisma.TransactionClient;

function operationKey(input: { commandId: string; workspaceId: string; action: string }): string {
  return sha256Canonical({
    schemaVersion: 1,
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    action: input.action,
    provider: GOOGLE_CALENDAR_PROVIDER,
  });
}

async function requireWorkspaceAuthority(
  db: Db | typeof prisma,
  input: { userId: string; workspaceId: string; manage: boolean },
) {
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

function statusFromAccount(
  workspaceId: string,
  account: (ConstructionConnectorAccount & { grants: Array<{ status: string; grantedScopes: string[] }> }) | null,
): CalendarConnectorStatus {
  if (!account) {
    return calendarConnectorStatusSchema.parse({
      schemaVersion: 1,
      workspaceId,
      provider: GOOGLE_CALENDAR_PROVIDER,
      status: "NOT_CONFIGURED",
      requestedScopes: [],
      grantedScopes: [],
      readEnabled: false,
      writeEnabled: false,
      credentialStored: false,
      calendarRef: "primary",
      stateVersion: 0,
      revokedAt: null,
      externalTransportEnabled: false,
      externalActivationReady: false,
      nextStep: "Préparer une autorisation Google Calendar explicite.",
    });
  }
  const activeGrantedScopes = [...new Set(account.grants
    .filter((grant) => grant.status === "active")
    .flatMap((grant) => grant.grantedScopes))].sort();
  const writeEnabled = account.status === "connected" && activeGrantedScopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE);
  const readEnabled = account.status === "connected" && (
    writeEnabled || activeGrantedScopes.includes(GOOGLE_CALENDAR_READ_SCOPE)
  );
  const status = account.status === "prepared"
    ? "PREPARED"
    : account.status === "connected"
      ? "CONNECTED"
      : account.status === "revoked"
        ? "REVOKED"
        : "ERROR";
  return calendarConnectorStatusSchema.parse({
    schemaVersion: 1,
    workspaceId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    status,
    requestedScopes: [...account.requestedScopes].sort(),
    grantedScopes: activeGrantedScopes,
    readEnabled,
    writeEnabled,
    credentialStored: account.credentialRef !== null,
    calendarRef: account.calendarRef,
    stateVersion: account.stateVersion,
    revokedAt: account.revokedAt?.toISOString() ?? null,
    externalTransportEnabled: false,
    externalActivationReady: false,
    nextStep: status === "REVOKED"
      ? "Reconnecter explicitement le compte pour rétablir un accès."
      : status === "PREPARED"
        ? "Configurer OAuth et un coffre chiffré avant d’ouvrir la connexion Google."
        : status === "CONNECTED"
          ? "Activation externe bloquée dans R3; aucune requête ne sera envoyée."
          : "Vérifier la configuration du connecteur.",
  });
}

export async function calendarConnectorStatusForUser(input: {
  userId: string;
  workspaceId: string;
}): Promise<CalendarConnectorStatus> {
  await requireWorkspaceAuthority(prisma, { ...input, manage: false });
  const account = await prisma.constructionConnectorAccount.findUnique({
    where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: GOOGLE_CALENDAR_PROVIDER } },
    include: { grants: { select: { status: true, grantedScopes: true } } },
  });
  return statusFromAccount(input.workspaceId, account);
}

function grantPlans(mode: "READ_ONLY" | "READ_WRITE") {
  const scopes = googleCalendarScopesForMode(mode);
  return mode === "READ_ONLY"
    ? [{ capability: "calendar_read", requestedScopes: scopes }]
    : [
        { capability: "calendar_read", requestedScopes: scopes },
        { capability: "calendar_write", requestedScopes: scopes },
      ];
}

export async function prepareCalendarConnector(input: {
  userId: string;
  command: unknown;
}): Promise<PrepareCalendarConnectorResult> {
  const command = prepareCalendarConnectorSchema.parse(input.command);
  const key = operationKey(command);
  const consent = googleCalendarConsentPlan(command.mode);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireWorkspaceAuthority(tx, { userId: input.userId, workspaceId: command.workspaceId, manage: true });
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: command.workspaceId, idempotencyKey: key } },
      select: { id: true, connectorAccountId: true, request: true },
    });
    if (existing) {
      const request = existing.request as { mode?: "READ_ONLY" | "READ_WRITE"; requestedScopes?: string[] };
      if (request.mode !== command.mode) throw new Error("CONNECTOR_IDEMPOTENCY_INPUT_MISMATCH");
      return prepareCalendarConnectorResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        accountId: existing.connectorAccountId,
        operationId: existing.id,
        status: "PREPARED",
        mode: request.mode,
        requestedScopes: request.requestedScopes,
        authorizationUrl: null,
        missingConfiguration: consent.missingConfiguration,
        replayed: true,
        externalTransportPerformed: false,
      });
    }

    const prior = await tx.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: command.workspaceId, provider: GOOGLE_CALENDAR_PROVIDER } },
      select: { status: true },
    });
    if (prior?.status === "connected") throw new Error("CONNECTOR_ALREADY_CONNECTED");
    const account = await tx.constructionConnectorAccount.upsert({
      where: { workspaceId_provider: { workspaceId: command.workspaceId, provider: GOOGLE_CALENDAR_PROVIDER } },
      create: {
        workspaceId: command.workspaceId,
        provider: GOOGLE_CALENDAR_PROVIDER,
        status: "prepared",
        requestedScopes: consent.scopes,
        grantedScopes: [],
        createdByUserId: input.userId,
      },
      update: {
        status: "prepared",
        requestedScopes: consent.scopes,
        grantedScopes: [],
        externalAccountKeyHash: null,
        credentialRef: null,
        syncCursorRef: null,
        revokedAt: null,
        stateVersion: { increment: 1 },
      },
      select: { id: true },
    });

    const plans = grantPlans(command.mode);
    const plannedCapabilities = plans.map((plan) => plan.capability);
    await tx.constructionConnectorGrant.updateMany({
      where: { connectorAccountId: account.id, capability: { notIn: plannedCapabilities }, status: { not: "revoked" } },
      data: { status: "revoked", grantedScopes: [], revokedAt: new Date(), stateVersion: { increment: 1 } },
    });
    for (const plan of plans) {
      await tx.constructionConnectorGrant.upsert({
        where: { connectorAccountId_capability: { connectorAccountId: account.id, capability: plan.capability } },
        create: {
          connectorAccountId: account.id,
          capability: plan.capability,
          status: "requested",
          requestedScopes: plan.requestedScopes,
          grantedScopes: [],
        },
        update: {
          status: "requested",
          requestedScopes: plan.requestedScopes,
          grantedScopes: [],
          grantedAt: null,
          revokedAt: null,
          stateVersion: { increment: 1 },
        },
      });
    }

    const request = {
      schemaVersion: 1,
      provider: GOOGLE_CALENDAR_PROVIDER,
      mode: command.mode,
      requestedScopes: consent.scopes,
      authorizationEndpoint: consent.authorizationEndpoint,
      authorizationUrl: null,
      missingConfiguration: consent.missingConfiguration,
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "authorization_prepare",
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
      action: "connector_authorization_prepared",
      reasonCode: command.mode,
      metadata: {
        operationId: operation.id,
        requestedScopes: consent.scopes,
        externalTransportPerformed: false,
      },
    });
    return prepareCalendarConnectorResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      accountId: account.id,
      operationId: operation.id,
      status: "PREPARED",
      mode: command.mode,
      requestedScopes: consent.scopes,
      authorizationUrl: null,
      missingConfiguration: consent.missingConfiguration,
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: "Serializable" });
}

export async function revokeCalendarConnector(input: {
  userId: string;
  command: unknown;
}): Promise<RevokeCalendarConnectorResult> {
  const command = revokeCalendarConnectorSchema.parse(input.command);
  const key = operationKey(command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireWorkspaceAuthority(tx, { userId: input.userId, workspaceId: command.workspaceId, manage: true });
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: command.workspaceId, idempotencyKey: key } },
      select: { id: true, connectorAccountId: true, result: true },
    });
    if (existing) {
      const result = existing.result as Record<string, unknown>;
      return revokeCalendarConnectorResultSchema.parse({ ...result, replayed: true });
    }
    const account = await tx.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId: command.workspaceId, provider: GOOGLE_CALENDAR_PROVIDER } },
      select: { id: true, status: true, credentialRef: true },
    });
    if (!account) throw new Error("CONNECTOR_NOT_FOUND");
    const providerRevocationRequired = account.credentialRef !== null;
    if (account.status !== "revoked") {
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
      await tx.constructionConnectorOperation.updateMany({
        where: { connectorAccountId: account.id, status: "prepared" },
        data: { status: "refused", refusedAt: new Date() },
      });
    }
    const responseBase = {
      schemaVersion: 1 as const,
      commandId: command.commandId,
      accountId: account.id,
      operationId: "pending",
      status: "REVOKED" as const,
      localAccessDisabled: true as const,
      providerRevocationRequired,
      providerRevocationPerformed: false as const,
      replayed: false,
      externalTransportPerformed: false as const,
    };
    const request = {
      schemaVersion: 1,
      provider: GOOGLE_CALENDAR_PROVIDER,
      localOnly: true,
      providerRevocationRequired,
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "local_revoke",
        status: "applied",
        idempotencyKey: key,
        request,
        requestHash: sha256Canonical(request),
        result: { ...responseBase, operationId: "SELF" },
        resultHash: sha256Canonical({ ...responseBase, operationId: "SELF" }),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
        appliedAt: new Date(),
      },
      select: { id: true },
    });
    const result = revokeCalendarConnectorResultSchema.parse({ ...responseBase, operationId: operation.id });
    await tx.constructionConnectorOperation.update({
      where: { id: operation.id },
      data: { result, resultHash: sha256Canonical(result) },
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "connector_account",
      entityId: account.id,
      action: "connector_access_revoked_locally",
      metadata: {
        operationId: operation.id,
        providerRevocationRequired,
        providerRevocationPerformed: false,
        externalTransportPerformed: false,
      },
    });
    return result;
  }, { isolationLevel: "Serializable" });
}
