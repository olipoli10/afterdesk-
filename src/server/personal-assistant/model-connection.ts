import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inspectModelAuthority, type PersonalIntentAdmission, type PersonalModelAuthority } from "@/server/model-gateway/personal-intent/admission";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { loadPersonalModelConfiguration } from "@/server/model-gateway/personal-intent/configuration";
import { inspectPersonalGatewaySubject } from "@/server/model-gateway/personal-subject";
import { openConnectorSecret, requireConnectorKey, sealConnectorSecret } from "./credential-cipher";

const scopes = ["personal_data:inference", `authority:${PERSONAL_MODEL_AUTHORITY}`];
export const PERSONAL_MODEL_CONSENT_VERSION = "personal-model-consent-v1";
export const PERSONAL_MODEL_CREDENTIAL_CONFIRMATION = "personal-model-credential-v1";
const secretSchema = z.object({ apiKey: z.string().regex(/^[A-Za-z0-9_-]{24,512}$/) }).strict();
const binding = (workspaceId: string, accountId: string, credentialId: string) => JSON.stringify([workspaceId, accountId, `openrouter-api-key:${credentialId}`]);
type Tx = Prisma.TransactionClient;
type OwnerInput = Readonly<{ userId: string; workspaceId: string }>;

async function requireOwner(tx: Tx, input: OwnerInput) {
  const owner = await tx.constructionWorkspaceMember.findFirst({ where: {
    workspaceId: input.workspaceId, userId: input.userId, status: "active", role: "owner",
    workspace: { ownerUserId: input.userId, status: "active" }, user: { role: "CLIENT", emailVerified: true },
  }, select: { id: true } });
  if (!owner) throw new Error("PERSONAL_MODEL_OWNER_REQUIRED");
}
async function databaseNow(tx: Tx) {
  const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>('SELECT CURRENT_TIMESTAMP AS now');
  if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime())) throw new Error("PERSONAL_MODEL_CLOCK_REQUIRED");
  return clock.now;
}
function requireCurrentAuthority(env: NodeJS.ProcessEnv, now: Date) {
  if (env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z"
    || now.getTime() < Date.parse("2026-09-10T01:18:26Z") || now.getTime() >= Date.parse("2026-10-10T01:18:26Z")) throw new Error("PERSONAL_MODEL_AUTHORITY_INACTIVE");
}
async function preparedAccount(tx: Tx, input: OwnerInput) {
  const account = await tx.constructionConnectorAccount.upsert({
    where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "openrouter" } },
    create: { workspaceId: input.workspaceId, createdByUserId: input.userId, provider: "openrouter", requestedScopes: scopes }, update: {},
  });
  if (account.createdByUserId !== input.userId) throw new Error("PERSONAL_MODEL_ACCOUNT_OWNER_MISMATCH");
  return account;
}

/** Preparation is not consent, credential provisioning or transport activation. */
export async function preparePersonalModelConnection(input: OwnerInput) {
  return prisma.$transaction(async tx => {
    await requireOwner(tx, input);
    const account = await preparedAccount(tx, input);
    await tx.constructionConnectorGrant.upsert({ where: { connectorAccountId_capability: { connectorAccountId: account.id, capability: "personal_model_inference" } },
      create: { connectorAccountId: account.id, capability: "personal_model_inference", requestedScopes: scopes }, update: {} });
    return { prepared: true as const, executionAuthorized: false as const };
  }, { isolationLevel: "Serializable" });
}

/** Only the verified workspace owner can explicitly consent. Client prices,
 * credential material and administrator authority are never accepted here. */
export async function consentPersonalModelConnection(input: OwnerInput & { confirmation: typeof PERSONAL_MODEL_CONSENT_VERSION }, env: NodeJS.ProcessEnv = process.env) {
  if (input.confirmation !== PERSONAL_MODEL_CONSENT_VERSION) throw new Error("PERSONAL_MODEL_EXPLICIT_CONSENT_REQUIRED");
  return prisma.$transaction(async tx => {
    await requireOwner(tx, input); const now = await databaseNow(tx); requireCurrentAuthority(env, now);
    const account = await preparedAccount(tx, input);
    await tx.constructionConnectorGrant.upsert({ where: { connectorAccountId_capability: { connectorAccountId: account.id, capability: "personal_model_inference" } },
      create: { connectorAccountId: account.id, capability: "personal_model_inference", status: "active", requestedScopes: scopes, grantedScopes: scopes, grantedAt: now },
      update: { status: "active", requestedScopes: scopes, grantedScopes: scopes, grantedAt: now, revokedAt: null, stateVersion: { increment: 1 } } });
    // No account status/credential change: consent does not prove a working key.
    return { consentGranted: true as const, executionAuthorized: false as const, consentVersion: PERSONAL_MODEL_CONSENT_VERSION };
  }, { isolationLevel: "Serializable" });
}

/** Internal operator provisioning only; this function has no HTTP caller and
 * performs no provider verification. Never log its input or return the key. */
export async function provisionPersonalModelCredential(input: OwnerInput & { apiKey: string }, env: NodeJS.ProcessEnv = process.env) {
  const parsed = secretSchema.safeParse({ apiKey: input.apiKey });
  if (!parsed.success) throw new Error("PERSONAL_MODEL_CREDENTIAL_INVALID");
  const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  return prisma.$transaction(async tx => {
    await requireOwner(tx, input); const now = await databaseNow(tx); requireCurrentAuthority(env, now);
    const account = await preparedAccount(tx, input); const id = randomUUID();
    await tx.constructionConnectorCredential.updateMany({ where: { connectorAccountId: account.id, workspaceId: input.workspaceId, revokedAt: null },
      data: { ciphertext: "revoked", revokedAt: now, version: { increment: 1 } } });
    await writeModelCredential(tx, input.workspaceId, account.id, id, parsed.data, key, now);
    return { credentialPrepared: true as const, providerVerified: false as const, executionAuthorized: false as const };
  }, { isolationLevel: "Serializable" });
}

/** Authenticated owner self-service provisioning for the native app. The key is
 * transient request material: it is encrypted inside this transaction and is
 * never returned. A command UUID makes a lost-response retry idempotent. */
export async function provisionPersonalModelCredentialFromOwnerSession(input: OwnerInput & {
  apiKey: string;
  commandId: string;
  confirmation: typeof PERSONAL_MODEL_CREDENTIAL_CONFIRMATION;
}, env: NodeJS.ProcessEnv = process.env) {
  if (input.confirmation !== PERSONAL_MODEL_CREDENTIAL_CONFIRMATION) throw new Error("PERSONAL_MODEL_CREDENTIAL_CONFIRMATION_REQUIRED");
  const parsed = secretSchema.safeParse({ apiKey: input.apiKey });
  if (!parsed.success || !z.string().uuid().safeParse(input.commandId).success) throw new Error("PERSONAL_MODEL_CREDENTIAL_INVALID");
  const key = requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY);
  try {
    return await prisma.$transaction(async tx => {
      await requireOwner(tx, input); const now = await databaseNow(tx); requireCurrentAuthority(env, now);
      const account = await tx.constructionConnectorAccount.findUnique({
        where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "openrouter" } },
        include: { grants: true },
      });
      if (!account || account.createdByUserId !== input.userId || account.revokedAt) throw new Error("PERSONAL_MODEL_ACCOUNT_OWNER_MISMATCH");
      const grant = account.grants.find(candidate => candidate.capability === "personal_model_inference");
      const consentCurrent = grant?.status === "active" && !grant.revokedAt && grant.grantedAt
        && grant.grantedAt.getTime() >= Date.parse("2026-09-10T01:18:26Z") && grant.grantedAt.getTime() <= now.getTime()
        && scopes.every(scope => grant.grantedScopes.includes(scope));
      if (!consentCurrent) throw new Error("PERSONAL_MODEL_CONSENT_REQUIRED");
      const current = account.credentialRef ? await tx.constructionConnectorCredential.findFirst({
        where: { id: account.credentialRef, connectorAccountId: account.id, workspaceId: input.workspaceId, revokedAt: null },
        select: { id: true, ciphertext: true },
      }) : null;
      if (current?.id === input.commandId) {
        let storedApiKey: string;
        try { storedApiKey = secretSchema.parse(JSON.parse(openConnectorSecret(current.ciphertext,
          binding(input.workspaceId, account.id, current.id), key))).apiKey; }
        catch { throw new Error("PERSONAL_MODEL_CREDENTIAL_STATE_INVALID"); }
        const storedDigest = createHash("sha256").update(storedApiKey, "utf8").digest();
        const submittedDigest = createHash("sha256").update(parsed.data.apiKey, "utf8").digest();
        const matchesStoredCredential = timingSafeEqual(storedDigest, submittedDigest);
        storedDigest.fill(0); submittedDigest.fill(0);
        if (!matchesStoredCredential) throw new Error("PERSONAL_MODEL_CREDENTIAL_COMMAND_CONFLICT");
        return { commandId: input.commandId, credentialPrepared: true as const,
          providerVerified: false as const, executionAuthorized: false as const };
      }
      if (account.credentialRef && !current) throw new Error("PERSONAL_MODEL_CREDENTIAL_STATE_INVALID");
      if (current) {
        await tx.constructionConnectorCredential.updateMany({
          where: { id: current.id, connectorAccountId: account.id, workspaceId: input.workspaceId, revokedAt: null },
          data: { ciphertext: "revoked", revokedAt: now, version: { increment: 1 } },
        });
      }
      await writeModelCredential(tx, input.workspaceId, account.id, input.commandId, parsed.data, key, now);
      return { commandId: input.commandId, credentialPrepared: true as const, providerVerified: false as const, executionAuthorized: false as const };
    }, { isolationLevel: "Serializable" });
  } finally { key.fill(0); }
}

async function writeModelCredential(tx: Tx, workspaceId: string, accountId: string, id: string,
  secret: z.infer<typeof secretSchema>, key: Buffer, now: Date) {
  const ciphertext = sealConnectorSecret(JSON.stringify(secret), binding(workspaceId, accountId, id), key);
  await tx.constructionConnectorCredential.create({ data: { id, connectorAccountId: accountId, workspaceId, ciphertext } });
  await tx.constructionConnectorAccount.update({ where: { id: accountId }, data: { status: "connected", credentialRef: id,
    externalAccountKeyHash: createHash("sha256").update(`openrouter-credential:${id}`).digest("hex"),
    connectedAt: now, revokedAt: null, stateVersion: { increment: 1 } } });
  return ciphertext;
}

/** Strict initial-only transaction seam. Never rotates, prepares an account or
 * manufactures consent. The legacy provisioning wrapper above is unchanged in scope.
 * No production caller; possession of these inputs is not operator authorization.
 */
export async function provisionInitialPersonalModelCredentialInTransaction(tx: Tx,
  raw: OwnerInput & { apiKey: string; credentialId: string }, env: NodeJS.ProcessEnv,
  context: Readonly<{ deadlineAt: number; monotoneDeadlineAt: number; signal?: AbortSignal }>) {
  const fail = (): never => { throw new Error("PERSONAL_MODEL_INITIAL_SETUP_REFUSED"); };
  if (!tx || "$transaction" in tx || typeof tx.$queryRawUnsafe !== "function") fail();
  const { signal } = context;
  let lastWall = Date.now(), lastMono = performance.now();
  const deadlineAt = Math.min(context.deadlineAt, lastWall + 10000);
  const monotoneDeadlineAt = Math.min(context.monotoneDeadlineAt, lastMono + 10000);
  const input = { ...raw };
  const secret = secretSchema.safeParse({ apiKey: input.apiKey });
  if (!secret.success || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.credentialId)
    || !input.userId || input.userId.length > 191 || !input.workspaceId || input.workspaceId.length > 160) return fail();
  const authority = env.ENDVERA_EXTERNAL_AUTHORITY_REF, expiry = env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT;
  const encodedKey = env.ENDVERA_CONNECTOR_ENCRYPTION_KEY;
  const key = requireConnectorKey(encodedKey);
  const live = () => {
    const currentWall = Date.now(), currentMono = performance.now();
    if (!Number.isFinite(deadlineAt) || !Number.isFinite(monotoneDeadlineAt) || !Number.isFinite(currentWall) || !Number.isFinite(currentMono)
      || currentWall < lastWall || currentMono < lastMono || signal?.aborted || currentWall >= deadlineAt || currentMono >= monotoneDeadlineAt
      || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== authority || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== expiry
      || env.ENDVERA_CONNECTOR_ENCRYPTION_KEY !== encodedKey) fail();
    lastWall = currentWall; lastMono = currentMono;
  };
  try {
    live();
    const isolation = await tx.$queryRawUnsafe<Array<{ transaction_isolation: string }>>("SHOW transaction_isolation"); live();
    if (isolation.length !== 1 || isolation[0].transaction_isolation !== "serializable") fail();
    const timeout = Math.floor(Math.min(10000, deadlineAt - lastWall, monotoneDeadlineAt - lastMono));
    if (timeout < 1) fail();
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", `${timeout}ms`); live();
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS acquired", `personal-model-setup:workspace:${input.workspaceId}`); live();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; grantId: string; grantVersion: number }>>(`SELECT a.id,g.id AS "grantId",g."stateVersion" AS "grantVersion" FROM "ConstructionConnectorAccount" a
      JOIN "ConstructionWorkspace" w ON w.id=a."workspaceId"
      JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
      JOIN "User" u ON u.id=m."userId"
      JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
      WHERE w.id=$1 AND w.status='active' AND w."ownerUserId"=$2 AND m.role='owner' AND m.status='active'
        AND u.role='CLIENT' AND u."emailVerified"=true AND a.provider='openrouter' AND a."createdByUserId"=$2
        AND a."credentialRef" IS NULL AND a."revokedAt" IS NULL
        AND g.capability='personal_model_inference' AND g.status='active' AND g."revokedAt" IS NULL
        AND g."grantedScopes" @> ARRAY['personal_data:inference',$3]::text[]
        AND g."grantedAt">=('2026-09-10T01:18:26Z'::timestamptz AT TIME ZONE 'UTC')
        AND g."grantedAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
      FOR SHARE OF w,m,u,g`, input.workspaceId, input.userId, `authority:${PERSONAL_MODEL_AUTHORITY}`); live();
    if (rows.length !== 1) fail();
    const accountId = rows[0].id;
    const grantId = rows[0].grantId, grantVersion = rows[0].grantVersion;
    if (typeof accountId !== "string" || typeof grantId !== "string" || !Number.isSafeInteger(grantVersion) || grantVersion < 1) fail();
    const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "ConstructionConnectorAccount"
      WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND provider='openrouter'
        AND "credentialRef" IS NULL AND "revokedAt" IS NULL FOR UPDATE`, accountId, input.workspaceId, input.userId); live();
    if (locked.length !== 1) fail();
    const previous = await tx.constructionConnectorCredential.findFirst({ where: { connectorAccountId: accountId }, select: { id: true } }); live();
    if (previous) fail();
    const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now"); live();
    if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime())) fail();
    const now = new Date(clock.now.getTime()); requireCurrentAuthority(env, now);
    const ciphertext = await writeModelCredential(tx, input.workspaceId, accountId, input.credentialId, secret.data, key, now); live();
    const verified = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT a.id FROM "ConstructionConnectorAccount" a
      JOIN "ConstructionConnectorCredential" c ON c.id=a."credentialRef" AND c."connectorAccountId"=a.id AND c."workspaceId"=a."workspaceId"
      JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
      WHERE a.id=$1 AND a."workspaceId"=$2 AND a."createdByUserId"=$3 AND a.provider='openrouter'
        AND a.status='connected' AND a."revokedAt" IS NULL AND c.id=$4 AND c.ciphertext=$5 AND c."revokedAt" IS NULL AND c.version=1
        AND g.id=$6 AND g."stateVersion"=$7 AND g.status='active' AND g."revokedAt" IS NULL
      FOR SHARE OF c`, accountId, input.workspaceId, input.userId, input.credentialId, ciphertext, grantId, grantVersion); live();
    if (verified.length !== 1 || verified[0].id !== accountId) fail();
    const finalClock = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now"); live();
    if (finalClock.length !== 1 || !(finalClock[0].now instanceof Date) || !Number.isFinite(finalClock[0].now.getTime()) || finalClock[0].now < now) fail();
    requireCurrentAuthority(env, new Date(finalClock[0].now.getTime()));
    return Object.freeze({ credentialPrepared: true as const, providerVerified: false as const, executionAuthorized: false as const });
  } catch { return fail(); } finally { key.fill(0); }
}

/** Lazy server-only access after dispatch CAS. Re-read consent and encrypted
 * row bindings; possession of an admission object never suffices. */
export async function personalModelCredentialForDispatch(input: {
  source: PersonalIntentAdmission["source"]; modelAuthority: PersonalModelAuthority;
}, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return prisma.$transaction(async tx => {
    await requireOwner(tx, { userId: input.source.actorUserId, workspaceId: input.source.subject.workspaceId });
    const now = await databaseNow(tx); requireCurrentAuthority(env, now);
    const currentSource = await inspectPersonalGatewaySubject(tx, input.source.subject, true);
    if (currentSource.authorityFingerprint !== input.source.authorityFingerprint) throw new Error("PERSONAL_MODEL_SOURCE_AUTHORITY_CHANGED");
    const current = await inspectModelAuthority(tx, currentSource, now);
    if (current.accountId !== input.modelAuthority.accountId || current.fingerprint !== input.modelAuthority.fingerprint) throw new Error("PERSONAL_MODEL_CREDENTIAL_BINDING_CHANGED");
    const account = await tx.constructionConnectorAccount.findFirst({ where: { id: current.accountId, workspaceId: input.source.subject.workspaceId,
      createdByUserId: input.source.actorUserId, provider: "openrouter", status: "connected", revokedAt: null } });
    if (!account?.credentialRef) throw new Error("PERSONAL_MODEL_CREDENTIAL_UNAVAILABLE");
    const credential = await tx.constructionConnectorCredential.findFirst({ where: { id: account.credentialRef, connectorAccountId: account.id,
      workspaceId: input.source.subject.workspaceId, revokedAt: null } });
    if (!credential) throw new Error("PERSONAL_MODEL_CREDENTIAL_UNAVAILABLE");
    try {
      return secretSchema.parse(JSON.parse(openConnectorSecret(credential.ciphertext, binding(credential.workspaceId, account.id, credential.id),
        requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY)))).apiKey;
    } catch { throw new Error("PERSONAL_MODEL_CREDENTIAL_UNAVAILABLE"); }
  }, { isolationLevel: "Serializable" });
}

export async function personalModelConnectionStatus(userId: string, workspaceId: string, env: NodeJS.ProcessEnv = process.env) {
  return prisma.$transaction(async tx => {
    await requireOwner(tx, { userId, workspaceId }); const now = await databaseNow(tx);
    const account = await tx.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "openrouter" } }, include: { grants: true } });
    const owned = account?.createdByUserId === userId;
    const grant = owned ? account.grants.find(g => g.capability === "personal_model_inference") : undefined;
    const configuration = loadPersonalModelConfiguration(env, now);
    const configured = configuration.status === "CONFIGURED_NOT_AUTHORIZED";
    let authorityCurrent = false; try { requireCurrentAuthority(env, now); authorityCurrent = true; } catch { /* Display disabled. */ }
    const consentGranted = Boolean(authorityCurrent && grant?.status === "active" && !grant.revokedAt && grant.grantedAt
      && grant.grantedAt.getTime() >= Date.parse("2026-09-10T01:18:26Z") && grant.grantedAt.getTime() <= now.getTime()
      && scopes.every(scope => grant.grantedScopes.includes(scope)));
    const credential = owned && account.status === "connected" && !account.revokedAt && account.credentialRef
      ? await tx.constructionConnectorCredential.findFirst({ where: { id: account.credentialRef, workspaceId, connectorAccountId: account.id, revokedAt: null }, select: { id: true } }) : null;
    const credentialPrepared = Boolean(credential);
    let credentialStorageConfigured = false;
    try { requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY); credentialStorageConfigured = true; } catch { /* No usable encryption configuration. */ }
    const transportConfigured = configured && env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED === "ENABLED"
      && env.ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED === "true";
    return { prepared: Boolean(owned), credentialPrepared, credentialStorageConfigured, consentGranted, configured, transportConfigured,
      readyForAdmission: configured && credentialPrepared && credentialStorageConfigured && consentGranted,
      liveObserved: false as const, executionAuthorized: false as const, consentVersion: PERSONAL_MODEL_CONSENT_VERSION };
  }, { isolationLevel: "Serializable" });
}

export async function disconnectPersonalModelConnection(input: OwnerInput) {
  return prisma.$transaction(async tx => {
    await requireOwner(tx, input); const now = await databaseNow(tx);
    const account = await tx.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "openrouter" } } });
    if (!account) return { disconnected: true as const, providerGrantRevoked: false as const };
    if (account.createdByUserId !== input.userId) throw new Error("PERSONAL_MODEL_ACCOUNT_OWNER_MISMATCH");
    await tx.constructionConnectorCredential.updateMany({ where: { connectorAccountId: account.id, workspaceId: input.workspaceId },
      data: { ciphertext: "revoked", revokedAt: now, version: { increment: 1 } } });
    await tx.constructionConnectorGrant.updateMany({ where: { connectorAccountId: account.id },
      data: { status: "revoked", grantedScopes: [], revokedAt: now, stateVersion: { increment: 1 } } });
    await tx.constructionConnectorAccount.update({ where: { id: account.id }, data: { status: "revoked", credentialRef: null,
      externalAccountKeyHash: null, syncCursorRef: null, grantedScopes: [], revokedAt: now, stateVersion: { increment: 1 } } });
    // Never erase model evidence or release uncertain budgets. Recovery sees
    // revoked current authority and closes only the appropriate fenced attempt.
    return { disconnected: true as const, providerGrantRevoked: false as const };
  }, { isolationLevel: "Serializable" });
}
