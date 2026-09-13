import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  deviceCalendarDirectiveRequestSchema,
  devicePermissionSnapshotSchema,
  personalDeviceDirectiveSchema,
  personalDeviceRegistrationSchema,
  personalDeviceReceiptSchema,
  type PersonalDeviceRegistration,
} from "@/lib/personal-device-bridge";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";
import { openConnectorSecret, requireConnectorKey, sealConnectorSecret } from "./credential-cipher";

const DEVICE_PROVIDER = "endvera_android_device";
const DEVICE_DIRECTIVE_KIND = "device_calendar_write_v1";
const DEVICE_SCOPES = Object.freeze({
  read: "device:calendar:read",
  write: "device:calendar:write",
  wake: "device:push:wake",
});
const credentialSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: z.string().uuid(),
  platform: z.literal("android"),
  pushToken: z.string().min(1).max(512).nullable(),
  appVersion: z.string().min(1).max(40),
  permissions: devicePermissionSnapshotSchema,
}).strict();
const storedCalendarSchema = z.object({
  title: z.string().trim().min(1).max(240),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(80),
  accountVersion: z.number().int().positive(),
  requestId: z.string().uuid(),
}).strict().refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt));
const claimStateSchema = z.object({
  schemaVersion: z.literal(1),
  receiptTokenHash: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough();
const standingAuthoritySchema = z.object({
  kind: z.literal("OWNER_VERIFIED_SMS_STANDING_V1"),
  authorityRef: z.literal("ENDVERA-OWNER-SMS-CALENDAR-AUTOCREATE-20260913-V1"),
  sourceOperationId: z.string().min(1).max(191),
  modelChildOperationId: z.string().min(1).max(191),
  sourceAuthorityFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();
type Db = Prisma.TransactionClient | typeof prisma;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const deviceKeyHash = (deviceId: string, deviceSecret: string) => sha256Canonical({ schemaVersion: 1, deviceId, deviceSecret });
const credentialBinding = (workspaceId: string, accountId: string, credentialId: string) =>
  JSON.stringify(["endvera-android-device-v1", workspaceId, accountId, credentialId]);

function equalHex(left: string | null | undefined, right: string) {
  if (!left || !/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function requireOwner(db: Db, userId: string, workspaceId: string) {
  const membership = await requireActiveConstructionMember(db as Prisma.TransactionClient, userId, workspaceId);
  if (membership.role !== "owner") throw new Error("DEVICE_BRIDGE_OWNER_REQUIRED");
}

function scopesFor(input: PersonalDeviceRegistration) {
  const scopes: string[] = [];
  if (input.permissions.calendar === "GRANTED") scopes.push(DEVICE_SCOPES.read);
  if (input.permissions.calendar === "GRANTED" && input.permissions.selectedWritableCalendar) scopes.push(DEVICE_SCOPES.write);
  if (input.permissions.notifications === "GRANTED" && input.pushToken) scopes.push(DEVICE_SCOPES.wake);
  return scopes;
}

async function activeDevice(db: Db, userId: string, workspaceId: string) {
  await requireOwner(db, userId, workspaceId);
  const account = await db.constructionConnectorAccount.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: DEVICE_PROVIDER } },
    include: { grants: true },
  });
  if (!account || account.createdByUserId !== userId || account.status !== "connected" || account.revokedAt || !account.credentialRef) {
    throw new Error("DEVICE_BRIDGE_NOT_LINKED");
  }
  const credential = await db.constructionConnectorCredential.findFirst({
    where: { id: account.credentialRef, connectorAccountId: account.id, workspaceId, revokedAt: null },
  });
  if (!credential) throw new Error("DEVICE_BRIDGE_NOT_LINKED");
  return { account, credential };
}

function openDeviceCredential(
  row: Awaited<ReturnType<typeof activeDevice>>,
  workspaceId: string,
  env: NodeJS.ProcessEnv,
) {
  const plaintext = openConnectorSecret(
    row.credential.ciphertext,
    credentialBinding(workspaceId, row.account.id, row.credential.id),
    requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY),
  );
  return credentialSchema.parse(JSON.parse(plaintext));
}

async function authenticatedDevice(
  db: Db,
  input: { userId: string; workspaceId: string; deviceId: string; deviceSecret: string },
  env: NodeJS.ProcessEnv,
) {
  const row = await activeDevice(db, input.userId, input.workspaceId);
  const expected = deviceKeyHash(input.deviceId, input.deviceSecret);
  if (!equalHex(row.account.externalAccountKeyHash, expected)) throw new Error("DEVICE_BRIDGE_AUTH_REFUSED");
  const credential = openDeviceCredential(row, input.workspaceId, env);
  if (credential.deviceId !== input.deviceId) throw new Error("DEVICE_BRIDGE_AUTH_REFUSED");
  return { ...row, credentialPayload: credential };
}

export async function registerPersonalAndroidDevice(
  userId: string,
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  const input = personalDeviceRegistrationSchema.parse(raw);
  const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  const scopes = scopesFor(input);
  return prisma.$transaction(async (tx) => {
    await requireOwner(tx, userId, input.workspaceId);
    const current = await tx.constructionConnectorAccount.upsert({
      where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: DEVICE_PROVIDER } },
      create: {
        workspaceId: input.workspaceId, provider: DEVICE_PROVIDER, status: "prepared",
        requestedScopes: Object.values(DEVICE_SCOPES), grantedScopes: [],
        createdByUserId: userId, calendarRef: "primary",
      },
      update: {},
    });
    if (current.createdByUserId !== userId) throw new Error("DEVICE_BRIDGE_OWNER_REQUIRED");
    const credentialId = randomUUID();
    const payload = credentialSchema.parse({
      schemaVersion: 1, deviceId: input.deviceId, platform: input.platform,
      pushToken: input.pushToken, appVersion: input.appVersion, permissions: input.permissions,
    });
    const ciphertext = sealConnectorSecret(
      JSON.stringify(payload),
      credentialBinding(input.workspaceId, current.id, credentialId),
      key,
    );
    await tx.constructionConnectorCredential.updateMany({
      where: { connectorAccountId: current.id, revokedAt: null },
      data: { ciphertext: "revoked", revokedAt: new Date(), version: { increment: 1 } },
    });
    await tx.constructionConnectorCredential.create({
      data: { id: credentialId, workspaceId: input.workspaceId, connectorAccountId: current.id, ciphertext },
    });
    const changed = await tx.constructionConnectorAccount.updateMany({
      where: { id: current.id, workspaceId: input.workspaceId, stateVersion: current.stateVersion },
      data: {
        status: "connected", requestedScopes: Object.values(DEVICE_SCOPES), grantedScopes: scopes,
        externalAccountKeyHash: deviceKeyHash(input.deviceId, input.deviceSecret), credentialRef: credentialId,
        connectedAt: new Date(), revokedAt: null, stateVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new Error("DEVICE_BRIDGE_CHANGED");
    await tx.constructionConnectorGrant.updateMany({
      where: { connectorAccountId: current.id },
      data: { status: "revoked", grantedScopes: [], revokedAt: new Date(), stateVersion: { increment: 1 } },
    });
    for (const [capability, scope] of [["calendar_read", DEVICE_SCOPES.read], ["calendar_write", DEVICE_SCOPES.write], ["device_wake", DEVICE_SCOPES.wake]] as const) {
      const granted = scopes.includes(scope);
      await tx.constructionConnectorGrant.upsert({
        where: { connectorAccountId_capability: { connectorAccountId: current.id, capability } },
        create: {
          connectorAccountId: current.id, capability, status: granted ? "active" : "requested",
          requestedScopes: [scope], grantedScopes: granted ? [scope] : [], grantedAt: granted ? new Date() : null,
        },
        update: {
          status: granted ? "active" : "requested", requestedScopes: [scope], grantedScopes: granted ? [scope] : [],
          grantedAt: granted ? new Date() : null, revokedAt: null, stateVersion: { increment: 1 },
        },
      });
    }
    const account = await tx.constructionConnectorAccount.findUniqueOrThrow({ where: { id: current.id } });
    return Object.freeze({
      schemaVersion: 1 as const, workspaceId: input.workspaceId, status: "LINKED" as const,
      platform: "android" as const, stateVersion: account.stateVersion,
      pushEnabled: scopes.includes(DEVICE_SCOPES.wake), calendarReadEnabled: scopes.includes(DEVICE_SCOPES.read),
      calendarWriteEnabled: scopes.includes(DEVICE_SCOPES.write), permissions: input.permissions,
      pending: [], lastSeenAt: account.updatedAt.toISOString(),
    });
  }, { isolationLevel: "Serializable" });
}

export async function personalDeviceStatus(
  input: { userId: string; workspaceId: string; deviceId: string; deviceSecret: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  const { account, credentialPayload } = await authenticatedDevice(prisma, input, env);
  // A device claim is one-shot. If the device disappears after claiming it,
  // never return the directive to pending: the native side may already have
  // applied it. A later matching receipt can only confirm this terminal state;
  // no background worker is allowed to execute it again.
  const expiredClaims = await prisma.personalAssistantOperation.findMany({
    where: {
      workspaceId: input.workspaceId, createdByUserId: input.userId, connectorAccountId: account.id,
      kind: DEVICE_DIRECTIVE_KIND, status: "processing", attempts: 1,
      leaseUntil: { lte: new Date(Date.now() - 10 * 60_000) },
    },
    orderBy: { createdAt: "asc" }, take: 10,
    select: { id: true, requestHash: true, result: true, sourcePersonalOperationId: true },
  });
  for (const row of expiredClaims) {
    const claim = claimStateSchema.safeParse(row.result);
    if (!claim.success || !row.sourcePersonalOperationId) continue;
    const terminal = {
      schemaVersion: 1, receiptTokenHash: claim.data.receiptTokenHash,
      outcome: "UNCERTAIN", nativeEventIdHash: null, reason: "DEVICE_RECEIPT_TIMEOUT",
      automaticRetry: false,
    };
    await prisma.$transaction(async (tx) => {
      const changed = await tx.personalAssistantOperation.updateMany({
        where: { id: row.id, status: "processing", attempts: 1, requestHash: row.requestHash },
        data: { status: "uncertain", leaseUntil: null, result: terminal },
      });
      if (changed.count !== 1) return;
      const sourceChanged = await tx.personalAssistantOperation.updateMany({
        where: {
          id: row.sourcePersonalOperationId!, workspaceId: input.workspaceId, createdByUserId: input.userId,
          connectorAccountId: account.id, kind: "calendar_write", status: "processing", attempts: 1,
        },
        data: {
          status: "uncertain", attempts: 1, leaseUntil: null,
          result: { route: "ANDROID_DEVICE", reason: "DEVICE_RECEIPT_TIMEOUT", reviewRequired: true, automaticRetry: false },
        },
      });
      if (sourceChanged.count !== 1) throw new Error("DEVICE_RECEIPT_TIMEOUT_CONFLICT");
    }, { isolationLevel: "Serializable" });
  }
  const rows = await prisma.personalAssistantOperation.findMany({
    where: {
      workspaceId: input.workspaceId, createdByUserId: input.userId, connectorAccountId: account.id,
      kind: DEVICE_DIRECTIVE_KIND, status: "pending", leaseUntil: null,
    },
    orderBy: { createdAt: "asc" }, take: 10,
  });
  const pending = rows.flatMap((row) => {
    const request = deviceCalendarDirectiveRequestSchema.safeParse(row.request);
    if (!request.success || row.requestHash !== sha256Canonical(request.data)) return [];
    const expiresAt = new Date(row.createdAt.getTime() + 15 * 60_000).toISOString();
    if (Date.parse(expiresAt) <= Date.now()) return [];
    return [personalDeviceDirectiveSchema.parse({ directiveId: row.id, requestHash: row.requestHash, expiresAt, request: request.data })];
  });
  return Object.freeze({
    schemaVersion: 1 as const, workspaceId: input.workspaceId, status: "LINKED" as const,
    platform: "android" as const, stateVersion: account.stateVersion,
    pushEnabled: account.grantedScopes.includes(DEVICE_SCOPES.wake),
    calendarReadEnabled: account.grantedScopes.includes(DEVICE_SCOPES.read),
    calendarWriteEnabled: account.grantedScopes.includes(DEVICE_SCOPES.write),
    permissions: credentialPayload.permissions, pending, lastSeenAt: account.updatedAt.toISOString(),
  });
}

export async function authorizeDeviceCalendarOperationInTransaction(tx: Prisma.TransactionClient, input: {
  userId: string; workspaceId: string; operationId: string; expectedRequestHash: string;
  standingAuthority?: z.input<typeof standingAuthoritySchema>;
}) {
    const standingAuthority = input.standingAuthority === undefined ? undefined : standingAuthoritySchema.parse(input.standingAuthority);
    await requireOwner(tx, input.userId, input.workspaceId);
    const source = await tx.personalAssistantOperation.findFirst({
      where: {
        id: input.operationId, workspaceId: input.workspaceId, createdByUserId: input.userId,
        kind: "calendar_write", requestHash: input.expectedRequestHash,
      },
      include: { account: true },
    });
    if (!source || source.account.provider !== DEVICE_PROVIDER || source.account.status !== "connected"
      || source.account.revokedAt || source.account.stateVersion !== storedCalendarSchema.parse(source.request).accountVersion) {
      throw new Error("DEVICE_CALENDAR_APPROVAL_REFUSED");
    }
    const draft = storedCalendarSchema.parse(source.request);
    const grant = await tx.constructionConnectorGrant.findFirst({
      where: { connectorAccountId: source.account.id, capability: "calendar_write", status: "active", revokedAt: null },
    });
    if (!grant || !grant.grantedScopes.includes(DEVICE_SCOPES.write)) throw new Error("DEVICE_CALENDAR_APPROVAL_REFUSED");
    if (!source.account.credentialRef) throw new Error("DEVICE_CALENDAR_APPROVAL_REFUSED");
    const member = await tx.constructionWorkspaceMember.findFirst({
      where: { workspaceId: input.workspaceId, userId: input.userId, status: "active", role: "owner", workspace: { status: "active" } },
      include: { workspace: true },
    });
    if (!member) throw new Error("DEVICE_CALENDAR_APPROVAL_REFUSED");
    const request = deviceCalendarDirectiveRequestSchema.parse({
      schemaVersion: 1, title: draft.title, startsAt: draft.startsAt, endsAt: draft.endsAt,
      timezone: draft.timezone, sourceOperationId: source.id, sourceRequestHash: source.requestHash,
    });
    const requestHash = sha256Canonical(request);
    const existing = await tx.personalAssistantOperation.findUnique({
      where: { sourcePersonalOperationId_kind: { sourcePersonalOperationId: source.id, kind: DEVICE_DIRECTIVE_KIND } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash || !["pending", "processing", "completed", "uncertain"].includes(existing.status)) {
        throw new Error("DEVICE_CALENDAR_APPROVAL_CONFLICT");
      }
      const approval = z.object({ approvalToken: z.string().uuid(), writeAuthority: z.record(z.string(), z.unknown()) }).passthrough().safeParse(source.result);
      if (!approval.success) throw new Error("DEVICE_CALENDAR_APPROVAL_CONFLICT");
      return { schemaVersion: 1 as const, userId: input.userId, workspaceId: input.workspaceId,
        operationId: source.id, expectedRequestHash: source.requestHash, request: draft,
        authority: approval.data.writeAuthority, approvalToken: approval.data.approvalToken,
        leaseUntil: source.leaseUntil, directiveId: existing.id, requestHash: existing.requestHash,
        status: existing.status.toUpperCase(), replayed: true };
    }
    if (source.status !== "pending" || source.attempts !== 0 || source.leaseUntil) throw new Error("DEVICE_CALENDAR_APPROVAL_CONFLICT");
    const authority = {
      accountId: source.account.id, accountVersion: source.account.stateVersion,
      credentialId: source.account.credentialRef, writeGrantId: grant.id, writeGrantVersion: grant.stateVersion,
      memberId: member.id, memberRole: "owner", memberUpdatedAt: member.updatedAt.toISOString(),
      workspaceUpdatedAt: member.workspace.updatedAt.toISOString(),
      accountScopes: [...source.account.grantedScopes], grantScopes: [...grant.grantedScopes],
    };
    const approvalToken = randomUUID();
    const leaseUntil = new Date(Date.now() + 15 * 60_000);
    const changed = await tx.personalAssistantOperation.updateMany({
      where: { id: source.id, status: "pending", attempts: 0, leaseUntil: null, requestHash: input.expectedRequestHash },
      data: {
        status: "processing", attempts: 1, leaseUntil,
        result: {
          route: "ANDROID_DEVICE", approvedBy: input.userId, approvedHash: input.expectedRequestHash,
          approvalToken, writeAuthority: authority, dispatchStarted: false, automaticRetry: false,
          ...(standingAuthority ? { standingAuthority } : {}),
        },
      },
    });
    if (changed.count !== 1) throw new Error("DEVICE_CALENDAR_APPROVAL_CONFLICT");
    const directive = await tx.personalAssistantOperation.create({
      data: {
        id: randomUUID(), workspaceId: input.workspaceId, connectorAccountId: source.account.id,
        kind: DEVICE_DIRECTIVE_KIND, status: "pending", idempotencyKey: `device-calendar:${source.id}`,
        request, requestHash, createdByUserId: input.userId, sourcePersonalOperationId: source.id,
      },
    });
    return { schemaVersion: 1 as const, userId: input.userId, workspaceId: input.workspaceId,
      operationId: source.id, expectedRequestHash: source.requestHash, request: draft, authority, approvalToken, leaseUntil,
      directiveId: directive.id, requestHash: directive.requestHash, status: "PENDING" as const, replayed: false };
}

export async function authorizeDeviceCalendarOperation(input: {
  userId: string; workspaceId: string; operationId: string; expectedRequestHash: string;
}) {
  return prisma.$transaction(
    tx => authorizeDeviceCalendarOperationInTransaction(tx, input),
    { isolationLevel: "Serializable" },
  );
}

export async function claimDeviceCalendarDirective(
  identity: { userId: string; workspaceId: string; deviceId: string; deviceSecret: string },
  input: { directiveId: string; expectedRequestHash: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  return prisma.$transaction(async (tx) => {
    const { account } = await authenticatedDevice(tx, identity, env);
    const row = await tx.personalAssistantOperation.findFirst({
      where: {
        id: input.directiveId, workspaceId: identity.workspaceId, createdByUserId: identity.userId,
        connectorAccountId: account.id, kind: DEVICE_DIRECTIVE_KIND, status: "pending",
        attempts: 0, leaseUntil: null, requestHash: input.expectedRequestHash,
      },
    });
    if (!row) throw new Error("DEVICE_DIRECTIVE_CLAIM_REFUSED");
    const request = deviceCalendarDirectiveRequestSchema.parse(row.request);
    if (sha256Canonical(request) !== row.requestHash || Date.now() >= row.createdAt.getTime() + 15 * 60_000) {
      throw new Error("DEVICE_DIRECTIVE_CLAIM_REFUSED");
    }
    const receiptToken = randomBytes(32).toString("base64url");
    const leaseUntil = new Date(Date.now() + 5 * 60_000);
    const changed = await tx.personalAssistantOperation.updateMany({
      where: { id: row.id, status: "pending", attempts: 0, leaseUntil: null, requestHash: row.requestHash },
      data: { status: "processing", attempts: 1, leaseUntil, result: { schemaVersion: 1, receiptTokenHash: digest(receiptToken) } },
    });
    if (changed.count !== 1) throw new Error("DEVICE_DIRECTIVE_CLAIM_REFUSED");
    return Object.freeze({
      schemaVersion: 1 as const, status: "CLAIMED" as const,
      directive: personalDeviceDirectiveSchema.parse({
        directiveId: row.id, requestHash: row.requestHash,
        expiresAt: new Date(row.createdAt.getTime() + 15 * 60_000).toISOString(), request,
      }),
      receiptToken, automaticRetry: false as const,
    });
  }, { isolationLevel: "Serializable" });
}

export async function recordDeviceCalendarReceipt(
  identity: { userId: string; workspaceId: string; deviceId: string; deviceSecret: string },
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
) {
  const receipt = personalDeviceReceiptSchema.parse(raw);
  if (receipt.workspaceId !== identity.workspaceId) throw new Error("DEVICE_RECEIPT_REFUSED");
  return prisma.$transaction(async (tx) => {
    const { account } = await authenticatedDevice(tx, identity, env);
    const row = await tx.personalAssistantOperation.findFirst({
      where: {
        id: receipt.directiveId, workspaceId: identity.workspaceId, createdByUserId: identity.userId,
        connectorAccountId: account.id, kind: DEVICE_DIRECTIVE_KIND, requestHash: receipt.expectedRequestHash,
      },
    });
    if (!row || !row.sourcePersonalOperationId) throw new Error("DEVICE_RECEIPT_REFUSED");
    const claim = claimStateSchema.safeParse(row.result);
    if (!claim.success || !equalHex(claim.data.receiptTokenHash, digest(receipt.receiptToken))) throw new Error("DEVICE_RECEIPT_REFUSED");
    const status = receipt.outcome === "COMPLETED" ? "completed" : "uncertain";
    const nativeEventIdHash = receipt.outcome === "COMPLETED" ? digest(receipt.nativeEventId) : null;
    const terminal = {
      schemaVersion: 1, receiptTokenHash: claim.data.receiptTokenHash,
      outcome: receipt.outcome, nativeEventIdHash,
      reason: receipt.outcome === "UNCERTAIN" ? receipt.reason : null,
      automaticRetry: false,
    };
    if (["completed", "uncertain"].includes(row.status)) {
      const old = z.object({ outcome: z.string(), nativeEventIdHash: z.string().nullable(), receiptTokenHash: z.string() }).passthrough().safeParse(row.result);
      if (!old.success || old.data.outcome !== receipt.outcome || old.data.nativeEventIdHash !== nativeEventIdHash
        || !equalHex(old.data.receiptTokenHash, claim.data.receiptTokenHash)) throw new Error("DEVICE_RECEIPT_CONFLICT");
      return { schemaVersion: 1 as const, directiveId: row.id, status: status.toUpperCase(), automaticRetry: false as const, replayed: true };
    }
    if (row.status !== "processing" || row.attempts !== 1) throw new Error("DEVICE_RECEIPT_REFUSED");
    const updated = await tx.personalAssistantOperation.updateMany({
      where: { id: row.id, status: "processing", attempts: 1, requestHash: row.requestHash },
      data: { status, leaseUntil: null, result: terminal },
    });
    if (updated.count !== 1) throw new Error("DEVICE_RECEIPT_CONFLICT");
    const sourceResult = receipt.outcome === "COMPLETED"
      ? { route: "ANDROID_DEVICE", confirmed: true, nativeEventIdHash, automaticRetry: false }
      : { route: "ANDROID_DEVICE", confirmed: false, reason: receipt.reason, reviewRequired: true, automaticRetry: false };
    const sourceUpdated = await tx.personalAssistantOperation.updateMany({
      where: {
        id: row.sourcePersonalOperationId, workspaceId: identity.workspaceId, createdByUserId: identity.userId,
        connectorAccountId: account.id, kind: "calendar_write", status: "processing", attempts: 1,
      },
      data: { status, result: sourceResult, leaseUntil: null },
    });
    if (sourceUpdated.count !== 1) throw new Error("DEVICE_RECEIPT_CONFLICT");
    return { schemaVersion: 1 as const, directiveId: row.id, status: status.toUpperCase(), automaticRetry: false as const, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function revokePersonalAndroidDevice(
  userId: string,
  workspaceId: string,
  deviceId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return prisma.$transaction(async (tx) => {
    await requireOwner(tx, userId, workspaceId);
    const account = await tx.constructionConnectorAccount.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: DEVICE_PROVIDER } },
    });
    if (!account || account.createdByUserId !== userId) return { schemaVersion: 1 as const, revoked: true, replayed: true };
    if (account.status === "revoked") return { schemaVersion: 1 as const, revoked: true, replayed: true };
    if (account.externalAccountKeyHash && !account.credentialRef) throw new Error("DEVICE_BRIDGE_REVOKE_REFUSED");
    const credential = account.credentialRef ? await tx.constructionConnectorCredential.findFirst({
      where: { id: account.credentialRef, connectorAccountId: account.id, workspaceId, revokedAt: null },
    }) : null;
    if (credential) {
      const payload = credentialSchema.parse(JSON.parse(openConnectorSecret(
        credential.ciphertext,
        credentialBinding(workspaceId, account.id, credential.id),
        requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY),
      )));
      if (payload.deviceId !== deviceId) throw new Error("DEVICE_BRIDGE_REVOKE_REFUSED");
      await tx.constructionConnectorCredential.updateMany({
        where: { connectorAccountId: account.id, revokedAt: null },
        data: { ciphertext: "revoked", revokedAt: new Date(), version: { increment: 1 } },
      });
    }
    const directives = await tx.personalAssistantOperation.findMany({
      where: { connectorAccountId: account.id, kind: DEVICE_DIRECTIVE_KIND, status: { in: ["pending", "processing"] } },
      select: { id: true, status: true, sourcePersonalOperationId: true },
    });
    await tx.personalAssistantOperation.updateMany({
      where: { id: { in: directives.map((row) => row.id) }, status: "pending" },
      data: { status: "refused", result: { reason: "DEVICE_REVOKED", automaticRetry: false }, leaseUntil: null },
    });
    await tx.personalAssistantOperation.updateMany({
      where: { id: { in: directives.map((row) => row.id) }, status: "processing" },
      data: { status: "uncertain", result: { reason: "DEVICE_REVOKED_AFTER_CLAIM", automaticRetry: false }, leaseUntil: null },
    });
    const pendingSources = directives.flatMap(row => row.status === "pending" && row.sourcePersonalOperationId ? [row.sourcePersonalOperationId] : []);
    const processingSources = directives.flatMap(row => row.status === "processing" && row.sourcePersonalOperationId ? [row.sourcePersonalOperationId] : []);
    await tx.personalAssistantOperation.updateMany({
      where: { id: { in: pendingSources }, workspaceId, createdByUserId: userId, connectorAccountId: account.id,
        kind: "calendar_write", status: "processing", attempts: 1 },
      data: { status: "uncertain", leaseUntil: null,
        result: { route: "ANDROID_DEVICE", reason: "DEVICE_REVOKED", reviewRequired: true, automaticRetry: false } },
    });
    await tx.personalAssistantOperation.updateMany({
      where: { id: { in: processingSources }, workspaceId, createdByUserId: userId, connectorAccountId: account.id,
        kind: "calendar_write", status: "processing", attempts: 1 },
      data: { status: "uncertain", leaseUntil: null,
        result: { route: "ANDROID_DEVICE", reason: "DEVICE_REVOKED_AFTER_CLAIM", reviewRequired: true, automaticRetry: false } },
    });
    await tx.constructionConnectorGrant.updateMany({
      where: { connectorAccountId: account.id },
      data: { status: "revoked", grantedScopes: [], revokedAt: new Date(), stateVersion: { increment: 1 } },
    });
    await tx.constructionConnectorAccount.update({
      where: { id: account.id },
      data: {
        status: "revoked", credentialRef: null, externalAccountKeyHash: null, grantedScopes: [],
        revokedAt: new Date(), stateVersion: { increment: 1 },
      },
    });
    return { schemaVersion: 1 as const, revoked: true, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export const personalDeviceBridgeConstants = Object.freeze({ DEVICE_PROVIDER, DEVICE_DIRECTIVE_KIND, DEVICE_SCOPES });
