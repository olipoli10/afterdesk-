import "server-only";

import { Prisma, type ConstructionConnectorAccount } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  calendarConnectorCockpitSchema,
  calendarConnectorCommandResultSchema,
  calendarConnectorCommandSchema,
  calendarConnectorWorkCommandSchema,
  calendarConnectorWorkResultSchema,
  calendarProviderScopes,
  type CalendarConnectorCockpit,
  type CalendarConnectorCommandResult,
  type CalendarConnectorProvider,
  type CalendarConnectorWorkResult,
  type CalendarProviderStatus,
} from "@/lib/construction-operating-assistant-r23/contracts";
import {
  calendarProviderDefinition,
  prepareCalendarConsentPlan,
} from "@/lib/construction-operating-assistant-r23/providers";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

type Db = Prisma.TransactionClient;

function operationKey(input: {
  workspaceId: string;
  provider: CalendarConnectorProvider;
  action: string;
  idempotencyKey: string;
}) {
  return sha256Canonical({
    schemaVersion: 1,
    namespace: "r23_calendar_connectors",
    workspaceId: input.workspaceId,
    provider: input.provider,
    action: input.action,
    idempotencyKey: input.idempotencyKey,
  });
}

async function requireManageAuthority(
  db: Db | typeof prisma,
  userId: string,
  workspaceId: string,
) {
  const membership = await requireActiveConstructionMember(db, userId, workspaceId);
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  }
  return membership;
}

function accountStatus(account: ConstructionConnectorAccount | null) {
  if (!account) return "NOT_CONFIGURED" as const;
  if (account.status === "prepared") return "PREPARED" as const;
  if (account.status === "connected") return "CONNECTED" as const;
  if (account.status === "revoked") return "REVOKED" as const;
  return "ERROR" as const;
}

function providerStatus(
  provider: CalendarConnectorProvider,
  account: (ConstructionConnectorAccount & {
    grants: Array<{ status: string; grantedScopes: string[] }>;
  }) | null,
): CalendarProviderStatus {
  const definition = calendarProviderDefinition(provider);
  const status = accountStatus(account);
  const grantedScopes = [...new Set(
    account?.grants
      .filter((grant) => grant.status === "active")
      .flatMap((grant) => grant.grantedScopes) ?? [],
  )].sort();
  const readScopes = calendarProviderScopes(provider, "READ_ONLY");
  const writeScopes = calendarProviderScopes(provider, "READ_WRITE");
  const writeEnabled = status === "CONNECTED" && writeScopes.every((scope) => grantedScopes.includes(scope));
  const readEnabled = status === "CONNECTED" && (
    writeEnabled || readScopes.every((scope) => grantedScopes.includes(scope))
  );
  const missingConfiguration = status === "CONNECTED"
    ? []
    : [...definition.missingConfiguration];
  const nextAction = status === "NOT_CONFIGURED"
    ? `Choisir l’accès minimal à préparer pour ${definition.label}.`
    : status === "PREPARED"
      ? "L’autorisation externe demeure désactivée; aucune connexion n’a été faite."
      : status === "CONNECTED"
        ? "Le compte de test est autorisé localement; le transport fournisseur demeure désactivé."
        : status === "REVOKED"
          ? "Préparer une nouvelle autorisation explicite pour rétablir l’accès."
          : "Inspecter la configuration locale avant toute nouvelle préparation.";
  return {
    schemaVersion: 1,
    provider,
    label: definition.label,
    status,
    requestedScopes: [...(account?.requestedScopes ?? [])].sort(),
    grantedScopes,
    readEnabled,
    writeEnabled,
    credentialStored: account?.credentialRef !== null && account?.credentialRef !== undefined,
    stateVersion: account?.stateVersion ?? 0,
    revokedAt: account?.revokedAt?.toISOString() ?? null,
    missingConfiguration,
    nextAction,
    externalTransportEnabled: false,
  };
}

export async function calendarConnectorCockpitForUser(input: {
  userId: string;
  workspaceId: string;
}): Promise<CalendarConnectorCockpit> {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  const role = membership.role === "owner"
    ? "owner"
    : membership.role === "admin"
      ? "admin"
      : "field_worker";
  if (role === "field_worker") {
    return calendarConnectorCockpitSchema.parse({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      role,
      providers: [],
      externalTransportEnabled: false,
      secretValuesVisible: false,
    });
  }
  const accounts = await prisma.constructionConnectorAccount.findMany({
    where: {
      workspaceId: input.workspaceId,
      provider: { in: ["google_calendar", "microsoft_calendar"] },
    },
    include: {
      grants: { select: { status: true, grantedScopes: true } },
    },
  });
  const byProvider = new Map(accounts.map((account) => [account.provider, account]));
  return calendarConnectorCockpitSchema.parse({
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    role,
    providers: (["google_calendar", "microsoft_calendar"] as const).map((provider) =>
      providerStatus(provider, byProvider.get(provider) ?? null)),
    externalTransportEnabled: false,
    secretValuesVisible: false,
  });
}

function grantPlans(provider: CalendarConnectorProvider, mode: "READ_ONLY" | "READ_WRITE") {
  const requestedScopes = calendarProviderScopes(provider, mode);
  return mode === "READ_ONLY"
    ? [{ capability: "calendar_read", requestedScopes }]
    : [
        { capability: "calendar_read", requestedScopes },
        { capability: "calendar_write", requestedScopes },
      ];
}

export async function prepareCalendarConnectionR23(input: {
  userId: string;
  command: unknown;
}): Promise<CalendarConnectorCommandResult> {
  const command = calendarConnectorCommandSchema.parse(input.command);
  if (command.action !== "PREPARE_CONNECTION") {
    throw new Error("CALENDAR_CONNECTOR_COMMAND_REFUSED");
  }
  const key = operationKey(command);
  const requestHash = sha256Canonical(command);
  const consent = prepareCalendarConsentPlan(command.provider, command.mode);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.provider}:${key}`}, 0))::text AS acquired
    `);
    await requireManageAuthority(tx, input.userId, command.workspaceId);
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
        throw new Error("CALENDAR_CONNECTOR_IDEMPOTENCY_CONFLICT");
      }
      return calendarConnectorCommandResultSchema.parse({
        ...(existing.result as Record<string, unknown>),
        replayed: true,
      });
    }
    const current = await tx.constructionConnectorAccount.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId: command.workspaceId,
          provider: command.provider,
        },
      },
    });
    if ((current?.stateVersion ?? 0) !== command.expectedStateVersion) {
      throw new Error("CALENDAR_CONNECTOR_STALE_STATE");
    }
    if (current?.status === "connected") throw new Error("CALENDAR_CONNECTOR_ALREADY_CONNECTED");

    const account = await tx.constructionConnectorAccount.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: command.workspaceId,
          provider: command.provider,
        },
      },
      create: {
        workspaceId: command.workspaceId,
        provider: command.provider,
        status: "prepared",
        requestedScopes: consent.requestedScopes,
        grantedScopes: [],
        createdByUserId: input.userId,
      },
      update: {
        status: "prepared",
        requestedScopes: consent.requestedScopes,
        grantedScopes: [],
        externalAccountKeyHash: null,
        credentialRef: null,
        syncCursorRef: null,
        revokedAt: null,
        connectedAt: null,
        stateVersion: { increment: 1 },
      },
    });
    const plans = grantPlans(command.provider, command.mode);
    await tx.constructionConnectorGrant.updateMany({
      where: {
        connectorAccountId: account.id,
        capability: { notIn: plans.map((plan) => plan.capability) },
        status: { not: "revoked" },
      },
      data: {
        status: "revoked",
        grantedScopes: [],
        revokedAt: new Date(),
        stateVersion: { increment: 1 },
      },
    });
    for (const plan of plans) {
      await tx.constructionConnectorGrant.upsert({
        where: {
          connectorAccountId_capability: {
            connectorAccountId: account.id,
            capability: plan.capability,
          },
        },
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

    const responseBase = {
      schemaVersion: 1 as const,
      commandId: command.commandId,
      requestId: command.requestId,
      idempotencyKey: command.idempotencyKey,
      workspaceId: command.workspaceId,
      provider: command.provider,
      accountId: account.id,
      operationId: "SELF",
      status: "PREPARED" as const,
      stateVersion: account.stateVersion,
      requestedScopes: consent.requestedScopes,
      missingConfiguration: consent.missingConfiguration,
      localAccessDisabled: true,
      replayed: false,
      externalTransportPerformed: false as const,
    };
    const safeRequest = {
      ...command,
      authorizationEndpoint: consent.authorizationEndpoint,
      authorizationUrl: null,
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "authorization_prepare",
        status: "prepared",
        idempotencyKey: key,
        request: safeRequest,
        requestHash,
        result: responseBase,
        resultHash: sha256Canonical(responseBase),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
      },
      select: { id: true },
    });
    const result = calendarConnectorCommandResultSchema.parse({
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
      entityType: "connector_account",
      entityId: account.id,
      action: "calendar_connector_authorization_prepared_r23",
      reasonCode: command.provider,
      metadata: {
        operationId: operation.id,
        requestedScopes: consent.requestedScopes,
        externalTransportPerformed: false,
      },
    });
    return result;
  });
}

export async function revokeCalendarConnectionR23(input: {
  userId: string;
  command: unknown;
}): Promise<CalendarConnectorCommandResult> {
  const command = calendarConnectorCommandSchema.parse(input.command);
  if (command.action !== "REVOKE_LOCAL") {
    throw new Error("CALENDAR_CONNECTOR_COMMAND_REFUSED");
  }
  const key = operationKey(command);
  const requestHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.provider}:${key}`}, 0))::text AS acquired
    `);
    await requireManageAuthority(tx, input.userId, command.workspaceId);
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
        throw new Error("CALENDAR_CONNECTOR_IDEMPOTENCY_CONFLICT");
      }
      return calendarConnectorCommandResultSchema.parse({
        ...(existing.result as Record<string, unknown>),
        replayed: true,
      });
    }
    const account = await tx.constructionConnectorAccount.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId: command.workspaceId,
          provider: command.provider,
        },
      },
    });
    if (!account) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (account.stateVersion !== command.expectedStateVersion) {
      throw new Error("CALENDAR_CONNECTOR_STALE_STATE");
    }
    let stateVersion = account.stateVersion;
    if (account.status !== "revoked") {
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
      });
      stateVersion = updated.stateVersion;
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
    }
    const responseBase = {
      schemaVersion: 1 as const,
      commandId: command.commandId,
      requestId: command.requestId,
      idempotencyKey: command.idempotencyKey,
      workspaceId: command.workspaceId,
      provider: command.provider,
      accountId: account.id,
      operationId: "SELF",
      status: "REVOKED" as const,
      stateVersion,
      requestedScopes: [],
      missingConfiguration: [...calendarProviderDefinition(command.provider).missingConfiguration],
      localAccessDisabled: true,
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
    const result = calendarConnectorCommandResultSchema.parse({
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
      entityType: "connector_account",
      entityId: account.id,
      action: "calendar_connector_revoked_locally_r23",
      reasonCode: command.provider,
      metadata: { operationId: operation.id, externalTransportPerformed: false },
    });
    return result;
  });
}

export function canonicalCalendarItemFingerprint(item: {
  id: string;
  workspaceId: string;
  projectId: string | null;
  contactId: string | null;
  type: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  allDay: boolean;
  status: string;
  verificationState: string;
}) {
  return sha256Canonical({
    schemaVersion: 1,
    calendarItemId: item.id,
    workspaceId: item.workspaceId,
    projectId: item.projectId,
    contactId: item.contactId,
    type: item.type,
    title: item.title,
    description: item.description,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    timezone: item.timezone,
    allDay: item.allDay,
    status: item.status,
    verificationState: item.verificationState,
  });
}

function workRequiredScope(
  provider: CalendarConnectorProvider,
  action: "PREPARE_SYNC" | "PREPARE_WRITE",
) {
  return calendarProviderScopes(provider, action === "PREPARE_SYNC" ? "READ_ONLY" : "READ_WRITE")[0]!;
}

export async function prepareCalendarWorkR23(input: {
  userId: string;
  command: unknown;
}): Promise<CalendarConnectorWorkResult> {
  const command = calendarConnectorWorkCommandSchema.parse(input.command);
  const key = operationKey(command);
  const requestHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.provider}:${key}`}, 0))::text AS acquired
    `);
    await requireManageAuthority(tx, input.userId, command.workspaceId);
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
        throw new Error("CALENDAR_CONNECTOR_IDEMPOTENCY_CONFLICT");
      }
      return calendarConnectorWorkResultSchema.parse({
        ...(existing.result as Record<string, unknown>),
        replayed: true,
      });
    }
    const account = await tx.constructionConnectorAccount.findFirst({
      where: {
        id: command.accountId,
        workspaceId: command.workspaceId,
        provider: command.provider,
      },
      include: {
        grants: { where: { status: "active" }, select: { grantedScopes: true } },
      },
    });
    if (!account) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (account.stateVersion !== command.expectedStateVersion) {
      throw new Error("CALENDAR_CONNECTOR_STALE_STATE");
    }
    if (
      account.status !== "connected" ||
      account.revokedAt !== null ||
      account.credentialRef === null ||
      account.externalAccountKeyHash === null
    ) {
      throw new Error("CALENDAR_CONNECTOR_CONNECTED_AUTHORITY_REQUIRED");
    }
    const grantedScopes = new Set(account.grants.flatMap((grant) => grant.grantedScopes));
    const requiredScope = workRequiredScope(command.provider, command.action);
    const writeScope = calendarProviderScopes(command.provider, "READ_WRITE")[0]!;
    if (!grantedScopes.has(requiredScope) && !(command.action === "PREPARE_SYNC" && grantedScopes.has(writeScope))) {
      throw new Error("CALENDAR_CONNECTOR_SCOPE_REQUIRED");
    }

    let canonicalFingerprint: string | null = null;
    let kind: "SYNC_READ" | "CREATE_EVENT" | "UPDATE_EVENT";
    let operationKind: "full_sync" | "incremental_sync" | "calendar_insert" | "calendar_patch";
    if (command.action === "PREPARE_SYNC") {
      const startsAt = Date.parse(command.rangeStartsAt);
      const endsAt = Date.parse(command.rangeEndsAt);
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
        throw new Error("INVALID_CALENDAR_TIME_RANGE");
      }
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone: command.timezone }).format(new Date(0));
      } catch {
        throw new Error("INVALID_IANA_TIMEZONE");
      }
      kind = "SYNC_READ";
      operationKind = account.syncCursorRef ? "incremental_sync" : "full_sync";
    } else {
      const item = await tx.constructionCalendarItem.findFirst({
        where: { id: command.calendarItemId, workspaceId: command.workspaceId },
      });
      if (!item) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      canonicalFingerprint = canonicalCalendarItemFingerprint(item);
      if (canonicalFingerprint !== command.canonicalFingerprint) {
        throw new Error("CALENDAR_CANONICAL_FINGERPRINT_MISMATCH");
      }
      if (item.endsAt === null) throw new Error("CALENDAR_END_TIME_REQUIRED");
      kind = command.operation === "CREATE" ? "CREATE_EVENT" : "UPDATE_EVENT";
      operationKind = command.operation === "CREATE" ? "calendar_insert" : "calendar_patch";
    }

    const responseBase = {
      schemaVersion: 1 as const,
      commandId: command.commandId,
      requestId: command.requestId,
      idempotencyKey: command.idempotencyKey,
      workspaceId: command.workspaceId,
      provider: command.provider,
      accountId: account.id,
      operationId: "SELF",
      kind,
      requiredScope,
      canonicalFingerprint,
      remotePreconditionRequired:
        command.action === "PREPARE_WRITE" && command.operation === "UPDATE",
      cursorReferencePresent: account.syncCursorRef !== null,
      providerExecutionAvailable: false as const,
      replayed: false,
      externalTransportPerformed: false as const,
    };
    const safeRequest = {
      ...command,
      credentialReferencePresent: true,
      cursorReferencePresent: account.syncCursorRef !== null,
      providerExecutionAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: operationKind,
        status: "prepared",
        idempotencyKey: key,
        request: safeRequest,
        requestHash,
        result: responseBase,
        resultHash: sha256Canonical(responseBase),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
      },
      select: { id: true },
    });
    const result = calendarConnectorWorkResultSchema.parse({
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
      entityType: "connector_operation",
      entityId: operation.id,
      action: "calendar_provider_work_prepared_r23",
      reasonCode: kind,
      metadata: {
        provider: command.provider,
        canonicalFingerprint,
        externalTransportPerformed: false,
      },
    });
    return result;
  });
}
