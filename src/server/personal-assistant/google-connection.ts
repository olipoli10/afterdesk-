import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { GoogleCalendarClient, googleTokensSchema, newGoogleConsent, requireGooglePilot, type ConnectorEnvironment } from "./google-client";
import { openConnectorSecret, requireConnectorKey, sealConnectorSecret } from "./credential-cipher";
import type { CalendarConnectionMode } from "@/lib/construction-operating-assistant-r3/connector-contracts";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const payloadSchema = z.object({
  verifier: z.string(), authorizationUrl: z.string().url(), scopes: z.array(z.string()),
  launchHash: z.string(), accountVersion: z.number().int(), mode: z.enum(["READ_ONLY", "READ_WRITE"]),
  expiresAt: z.number().finite(),
}).strict();
const encryptedRequest = z.object({ ciphertext: z.string() }).strict();

async function requireOwner(db: Prisma.TransactionClient | typeof prisma, userId: string, workspaceId: string) {
  const member = await db.constructionWorkspaceMember.findFirst({
    where: { userId, workspaceId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } }, select: { id: true },
  });
  if (!member) throw new Error("CONNECTION_ACCESS_REFUSED");
}
const binding = (workspaceId: string, accountId: string, purpose: string) => JSON.stringify([workspaceId, accountId, purpose]);
const authorityId = z.string().min(1).max(191);
export const googleReadAuthoritySchema = z.object({ schemaVersion: z.literal(1), userId: authorityId, workspaceId: authorityId,
  accountId: authorityId, accountVersion: z.number().int().nonnegative(), credentialId: authorityId,
  readGrantId: authorityId, readGrantVersion: z.number().int().nonnegative() }).strict();
export type GoogleReadAuthority = Readonly<z.infer<typeof googleReadAuthoritySchema>>;

/** Internal read/disclosure receipt, not action authority. A reconnect, credential
 * replacement or read-grant revision invalidates the previously read snapshot. */
export async function requireGoogleReadAuthority(db: Prisma.TransactionClient | typeof prisma, userId: string, workspaceId: string,
  untrusted: unknown, env: ConnectorEnvironment = process.env): Promise<GoogleReadAuthority> {
  requireGooglePilot(env);
  const authority = googleReadAuthoritySchema.parse(untrusted);
  if (authority.userId !== userId || authority.workspaceId !== workspaceId) throw new Error("GOOGLE_READ_ACCESS_REFUSED");
  const current = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT a.id FROM "ConstructionConnectorAccount" a
    JOIN "ConstructionWorkspace" w ON w.id=a."workspaceId"
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
    JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
    JOIN "ConstructionConnectorCredential" c ON c.id=a."credentialRef" AND c."connectorAccountId"=a.id AND c."workspaceId"=w.id
    WHERE w.id=$1 AND w.status='active' AND m.status='active' AND m.role IN ('owner','admin')
      AND a.id=$3 AND a.provider='google_calendar' AND a.status='connected' AND a."revokedAt" IS NULL AND a."stateVersion"=$4
      AND c.id=$5 AND c."revokedAt" IS NULL
      AND g.id=$6 AND g."stateVersion"=$7 AND g.capability='calendar_read' AND g.status='active' AND g."revokedAt" IS NULL
    FOR SHARE OF w,m,a,g,c`, workspaceId, userId, authority.accountId, authority.accountVersion, authority.credentialId,
    authority.readGrantId, authority.readGrantVersion);
  if (current.length !== 1) throw new Error("GOOGLE_READ_ACCESS_REFUSED");
  return Object.freeze(authority);
}

export async function beginGoogleConnection(input: { userId: string; workspaceId: string; mode: CalendarConnectionMode }, env: ConnectorEnvironment = process.env) {
  const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  const consent = newGoogleConsent(env, input.mode);
  const launchToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await prisma.$transaction(async tx => {
    await requireOwner(tx, input.userId, input.workspaceId);
    const account = await tx.constructionConnectorAccount.upsert({
      where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "google_calendar" } },
      create: { workspaceId: input.workspaceId, provider: "google_calendar", createdByUserId: input.userId, requestedScopes: consent.scopes },
      update: {}, select: { id: true, stateVersion: true },
    });
    const payload = { verifier: consent.verifier, authorizationUrl: consent.authorizationUrl, scopes: consent.scopes, launchHash: digest(launchToken), accountVersion: account.stateVersion, mode: input.mode, expiresAt: consent.expiresAt };
    await tx.personalAssistantOperation.create({ data: {
      id, workspaceId: input.workspaceId, connectorAccountId: account.id, kind: "google_oauth", status: "pending",
      idempotencyKey: `google-oauth:${digest(consent.state)}`, requestHash: digest(consent.state),
      request: { ciphertext: sealConnectorSecret(JSON.stringify(payload), binding(input.workspaceId, account.id, `oauth:${id}`), key) },
      createdByUserId: input.userId,
    } });
  });
  const url = new URL("/api/endvera/v1/personal/google/launch", env.BETTER_AUTH_URL);
  url.search = new URLSearchParams({ attempt: id, token: launchToken }).toString();
  return { launchUrl: url.href, expiresAt: new Date(consent.expiresAt).toISOString() };
}

function readAttempt(row: { id: string; workspaceId: string; connectorAccountId: string; request: unknown }, env: ConnectorEnvironment) {
  const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  const { ciphertext } = encryptedRequest.parse(row.request);
  const payload = payloadSchema.parse(JSON.parse(openConnectorSecret(ciphertext, binding(row.workspaceId, row.connectorAccountId, `oauth:${row.id}`), key)));
  if (payload.expiresAt <= Date.now()) throw new Error("GOOGLE_CONSENT_EXPIRED");
  return payload;
}

export async function launchGoogleConnection(attemptId: string, launchToken: string, env: ConnectorEnvironment = process.env) {
  requireGooglePilot(env);
  if (!/^[A-Za-z0-9_-]{43}$/.test(launchToken)) throw new Error("GOOGLE_CONSENT_REFUSED");
  const row = await prisma.personalAssistantOperation.findFirst({ where: { id: attemptId, kind: "google_oauth", status: "pending" } });
  if (!row) throw new Error("GOOGLE_CONSENT_REFUSED");
  const payload = readAttempt(row, env);
  if (payload.launchHash !== digest(launchToken)) throw new Error("GOOGLE_CONSENT_REFUSED");
  await requireOwner(prisma, row.createdByUserId, row.workspaceId);
  const nonce = randomBytes(32).toString("base64url");
  const update = await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "launched", result: { cookieHash: digest(nonce) } } });
  if (update.count !== 1) throw new Error("GOOGLE_CONSENT_ALREADY_USED");
  return { authorizationUrl: payload.authorizationUrl, cookieNonce: nonce };
}

export async function finishGoogleConnection(input: { state: string; cookieNonce: string; code: string }, env: ConnectorEnvironment = process.env, client = new GoogleCalendarClient(env)) {
  requireGooglePilot(env);
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state) || !/^[A-Za-z0-9_-]{43}$/.test(input.cookieNonce)) throw new Error("GOOGLE_CONSENT_REFUSED");
  const row = await prisma.personalAssistantOperation.findUnique({ where: { idempotencyKey: `google-oauth:${digest(input.state)}` } });
  if (!row || row.kind !== "google_oauth" || row.status !== "launched") throw new Error("GOOGLE_CONSENT_REFUSED");
  const correlation = z.object({ cookieHash: z.string() }).strict().parse(row.result);
  if (correlation.cookieHash !== digest(input.cookieNonce)) throw new Error("GOOGLE_CONSENT_REFUSED");
  const payload = readAttempt(row, env);
  await requireOwner(prisma, row.createdByUserId, row.workspaceId);
  const consumed = await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "launched" }, data: { status: "consuming", attempts: { increment: 1 } } });
  if (consumed.count !== 1) throw new Error("GOOGLE_CONSENT_ALREADY_USED");
  try {
    const tokens = await client.exchange(input.code, payload.verifier, payload.scopes);
    const secretId = randomUUID();
    const ciphertext = sealConnectorSecret(JSON.stringify(tokens), binding(row.workspaceId, row.connectorAccountId, `tokens:${secretId}`), requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY));
    await prisma.$transaction(async tx => {
      await requireOwner(tx, row.createdByUserId, row.workspaceId);
      const current = await tx.constructionConnectorAccount.findUnique({ where: { id: row.connectorAccountId } });
      if (!current || current.stateVersion !== payload.accountVersion) throw new Error("GOOGLE_CONNECTION_CHANGED");
      await tx.constructionConnectorCredential.updateMany({ where: { connectorAccountId: current.id, revokedAt: null }, data: { revokedAt: new Date(), ciphertext: "revoked" } });
      await tx.constructionConnectorCredential.create({ data: { id: secretId, connectorAccountId: current.id, workspaceId: row.workspaceId, ciphertext } });
      const changed = await tx.constructionConnectorAccount.updateMany({ where: { id: current.id, stateVersion: payload.accountVersion }, data: {
        status: "connected", credentialRef: secretId, grantedScopes: tokens.scopes, requestedScopes: payload.scopes,
        externalAccountKeyHash: digest(tokens.subject), connectedAt: new Date(), revokedAt: null, stateVersion: { increment: 1 },
      } });
      if (changed.count !== 1) throw new Error("GOOGLE_CONNECTION_CHANGED");
      const capabilities = payload.mode === "READ_WRITE" ? ["calendar_read", "calendar_write"] : ["calendar_read"];
      await tx.constructionConnectorGrant.updateMany({ where: { connectorAccountId: current.id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
      for (const capability of capabilities) await tx.constructionConnectorGrant.upsert({
        where: { connectorAccountId_capability: { connectorAccountId: current.id, capability } },
        create: { connectorAccountId: current.id, capability, status: "active", grantedAt: new Date(), requestedScopes: payload.scopes, grantedScopes: tokens.scopes },
        update: { status: "active", grantedAt: new Date(), revokedAt: null, requestedScopes: payload.scopes, grantedScopes: tokens.scopes, stateVersion: { increment: 1 } },
      });
      await tx.personalAssistantOperation.update({ where: { id: row.id }, data: { status: "completed", request: { consumed: true }, result: { connected: true }, externalTransportPerformed: true } });
    }, { isolationLevel: "Serializable" });
    return { connected: true as const };
  } catch {
    await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "consuming" }, data: { status: "refused", request: { consumed: true }, result: { reconnectRequired: true } } });
    throw new Error("GOOGLE_CONNECTION_NOT_COMPLETED");
  }
}

export async function googleTokensForOwner(userId: string, workspaceId: string, env: ConnectorEnvironment = process.env, client = new GoogleCalendarClient(env)) {
  requireGooglePilot(env);
  await requireOwner(prisma, userId, workspaceId);
  const account = await prisma.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "google_calendar" } } });
  if (!account || account.status !== "connected" || account.revokedAt || !account.credentialRef) throw new Error("GOOGLE_NOT_CONNECTED");
  const grant = await prisma.constructionConnectorGrant.findFirst({ where: { connectorAccountId: account.id, capability: "calendar_read", status: "active", revokedAt: null } });
  if (!grant) throw new Error("GOOGLE_READ_ACCESS_REFUSED");
  const credential = await prisma.constructionConnectorCredential.findFirst({ where: { id: account.credentialRef, connectorAccountId: account.id, workspaceId, revokedAt: null } });
  if (!credential) throw new Error("GOOGLE_NOT_CONNECTED");
  const readAuthority = await requireGoogleReadAuthority(prisma, userId, workspaceId, { schemaVersion: 1, userId, workspaceId,
    accountId: account.id, accountVersion: account.stateVersion, credentialId: credential.id, readGrantId: grant.id, readGrantVersion: grant.stateVersion }, env);
  const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  const aad = binding(workspaceId, account.id, `tokens:${credential.id}`);
  let tokens = googleTokensSchema.parse(JSON.parse(openConnectorSecret(credential.ciphertext, aad, key)));
  if (tokens.expiresAt <= Date.now() + 60_000) {
    tokens = await client.refresh(tokens);
    await prisma.$transaction(async tx => {
      await requireGoogleReadAuthority(tx, userId, workspaceId, readAuthority, env);
      await requireOwner(tx, userId, workspaceId);
      const active = await tx.constructionConnectorAccount.findFirst({ where: { id: account.id, stateVersion: account.stateVersion, status: "connected", credentialRef: credential.id } });
      if (!active) throw new Error("GOOGLE_CONNECTION_CHANGED");
      const updated = await tx.constructionConnectorCredential.updateMany({ where: { id: credential.id, version: credential.version, revokedAt: null }, data: { ciphertext: sealConnectorSecret(JSON.stringify(tokens), aad, key), version: { increment: 1 } } });
      if (updated.count !== 1) throw new Error("GOOGLE_CONNECTION_CHANGED");
    }, { isolationLevel: "Serializable" });
  }
  return { accountId: account.id, accountVersion: account.stateVersion, tokens, readAuthority };
}

export async function googleConnectionStatus(userId: string, workspaceId: string, env: ConnectorEnvironment = process.env) {
  await requireOwner(prisma, userId, workspaceId);
  let configured = true;
  try { requireGooglePilot(env); requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY); } catch { configured = false; }
  const account = await prisma.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "google_calendar" } }, include: { grants: true } });
  const connected = Boolean(account?.status === "connected" && account.credentialRef && !account.revokedAt);
  return { configured, connected, readEnabled: configured && connected && Boolean(account?.grants.some(g => g.capability === "calendar_read" && g.status === "active" && !g.revokedAt)), writeConsentGranted: connected && Boolean(account?.grants.some(g => g.capability === "calendar_write" && g.status === "active" && !g.revokedAt)) };
}

export async function readGoogleCalendar(userId: string, workspaceId: string, start: string, end: string, env: ConnectorEnvironment = process.env, client = new GoogleCalendarClient(env)) {
  return (await readGoogleCalendarWithAuthority(userId, workspaceId, start, end, env, client)).result;
}

/** Internal worker variant; public API retains its original result-only shape. */
export async function readGoogleCalendarWithAuthority(userId: string, workspaceId: string, start: string, end: string, env: ConnectorEnvironment = process.env, client = new GoogleCalendarClient(env)) {
  const { tokens, readAuthority } = await googleTokensForOwner(userId, workspaceId, env, client);
  await requireGoogleReadAuthority(prisma, userId, workspaceId, readAuthority, env);
  const result = await client.listEvents(tokens, start, end);
  // Withhold results if any bound authority changed while Google answered.
  await requireGoogleReadAuthority(prisma, userId, workspaceId, readAuthority, env);
  return { result, authority: readAuthority };
}

export async function disconnectGoogleLocally(userId: string, workspaceId: string) {
  return prisma.$transaction(async tx => {
    await requireOwner(tx, userId, workspaceId);
    const account = await tx.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "google_calendar" } } });
    if (!account) return { disconnected: true as const, googleGrantRevoked: false as const };
    await tx.constructionConnectorCredential.updateMany({ where: { connectorAccountId: account.id }, data: { ciphertext: "revoked", revokedAt: new Date(), version: { increment: 1 } } });
    await tx.constructionConnectorGrant.updateMany({ where: { connectorAccountId: account.id }, data: { status: "revoked", grantedScopes: [], revokedAt: new Date(), stateVersion: { increment: 1 } } });
    await tx.constructionConnectorAccount.update({ where: { id: account.id }, data: { status: "revoked", credentialRef: null, externalAccountKeyHash: null, syncCursorRef: null, grantedScopes: [], revokedAt: new Date(), stateVersion: { increment: 1 } } });
    await tx.personalAssistantOperation.updateMany({ where: { connectorAccountId: account.id, kind: "google_oauth", status: { in: ["pending", "launched"] } }, data: { status: "refused", request: { revoked: true } } });
    return { disconnected: true as const, googleGrantRevoked: false as const };
  }, { isolationLevel: "Serializable" });
}
