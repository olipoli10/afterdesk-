import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { inspectModelAuthority } from "@/server/model-gateway/personal-intent/admission";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { inspectPersonalGatewaySubject } from "@/server/model-gateway/personal-subject";
import { consentPersonalModelConnection, disconnectPersonalModelConnection, personalModelConnectionStatus, personalModelCredentialForDispatch,
  preparePersonalModelConnection, provisionPersonalModelCredential, PERSONAL_MODEL_CONSENT_VERSION } from "@/server/personal-assistant/model-connection";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());

// Every credential and encryption key below is freshly generated synthetic test
// material. No process credential value is consulted, printed, or sent anywhere.
function controls(): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ENDVERA_CONNECTOR_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
}
const fakeKey = () => `synthetic_test_only_${randomUUID().replaceAll("-", "")}`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
async function freshOwner() {
  requirePersonalDisposableDatabase();
  const user = await prisma.user.create({ data: { name: "Synthetic credential owner", email: `credential-${randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic credential store" });
  return { userId: user.id, workspaceId };
}
type Fixture = Awaited<ReturnType<typeof personalModelFixture>>;
async function captured(f: Fixture) {
  return prisma.$transaction(async tx => {
    const source = await inspectPersonalGatewaySubject(tx, f.subject);
    const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>('SELECT CURRENT_TIMESTAMP AS now');
    const modelAuthority = await inspectModelAuthority(tx, source, clock.now);
    return { source, modelAuthority };
  }, { isolationLevel: "Serializable" });
}
async function provisioned() {
  const f = await personalModelFixture(); const env = controls(); const apiKey = fakeKey();
  await provisionPersonalModelCredential({ userId: f.userId, workspaceId: f.workspaceId, apiKey }, env);
  await consentPersonalModelConnection({ userId: f.userId, workspaceId: f.workspaceId, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env);
  return { f, env, apiKey, bound: await captured(f) };
}

describe("owner AI consent and encrypted credentials on disposable PostgreSQL only", () => {
  it("prepares a requested account/grant without consent, key or transport", async () => {
    const owner = await freshOwner();
    expect(await preparePersonalModelConnection(owner)).toEqual({ prepared: true, executionAuthorized: false });
    const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: owner.workspaceId, provider: "openrouter" } }, include: { grants: true } });
    expect(account.credentialRef).toBeNull(); expect(account.status).not.toBe("connected");
    expect(account.grants).toHaveLength(1); expect(account.grants[0].status).toBe("requested"); expect(account.grants[0].grantedAt).toBeNull();
    expect(await prisma.constructionConnectorCredential.count({ where: { workspaceId: owner.workspaceId } })).toBe(0);
  });
  it("provisioning encrypts a fake key but never auto-grants AI consent", async () => {
    const owner = await freshOwner(); const env = controls(); const apiKey = fakeKey();
    await preparePersonalModelConnection(owner);
    const result = await provisionPersonalModelCredential({ ...owner, apiKey }, env);
    expect(result).toEqual({ credentialPrepared: true, providerVerified: false, executionAuthorized: false });
    const status = await personalModelConnectionStatus(owner.userId, owner.workspaceId, env);
    expect(status).toMatchObject({ credentialPrepared: true, credentialStorageConfigured: true, consentGranted: false, readyForAdmission: false, liveObserved: false });
    const credential = await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { workspaceId: owner.workspaceId, revokedAt: null } });
    expect(credential.ciphertext.startsWith("v1.")).toBe(true); expect(credential.ciphertext.includes(apiKey)).toBe(false);
    expect(JSON.stringify(result).includes(apiKey)).toBe(false);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: owner.workspaceId, externalTransportPerformed: true } })).toBe(0);
  });
  it("explicit consent does not manufacture a connected credential", async () => {
    const owner = await freshOwner(); const env = controls();
    await expect(consentPersonalModelConnection({ ...owner, confirmation: "wrong" as typeof PERSONAL_MODEL_CONSENT_VERSION }, env)).rejects.toThrow("EXPLICIT_CONSENT_REQUIRED");
    await consentPersonalModelConnection({ ...owner, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env);
    expect(await personalModelConnectionStatus(owner.userId, owner.workspaceId, env)).toMatchObject({ consentGranted: true, credentialPrepared: false, readyForAdmission: false });
  });
  it("lazy access resolves only the current owner/source/credential binding", async () => {
    const { f, env, apiKey, bound } = await provisioned();
    // Synthetic ingress records its received-SMS transport provenance. Reading
    // a credential must add no new transport, not rewrite that original flag.
    const transportBefore = await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, externalTransportPerformed: true } });
    const resolved = await personalModelCredentialForDispatch(bound, env);
    // Compare booleans/digests, never print even synthetic key values on failure.
    expect(digest(resolved) === digest(apiKey)).toBe(true);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, externalTransportPerformed: true } })).toBe(transportBefore);
  });
  it.each(["revoked", "permissions", "rebound"])("withholds lazy access after SMS identity %s", async mutation => {
    const { f, env, bound } = await provisioned();
    if (mutation === "revoked") await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { status: "revoked" } });
    else if (mutation === "permissions") await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { permissions: [] } });
    else {
      const other = await freshOwner();
      await prisma.constructionCommunicationIdentity.create({ data: { workspaceId: other.workspaceId, userId: other.userId, channel: "sms", normalizedAddress: f.from, status: "active", verified: true, permissions: ["COMMAND"] } });
    }
    await expect(personalModelCredentialForDispatch(bound, env)).rejects.toThrow("IDENTITY_NOT_BOUND");
  });
  it("local revoke invalidates stored consent/key but preserves source evidence", async () => {
    const { f, env, bound } = await provisioned();
    const before = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(await disconnectPersonalModelConnection({ userId: f.userId, workspaceId: f.workspaceId })).toEqual({ disconnected: true, providerGrantRevoked: false });
    await expect(personalModelCredentialForDispatch(bound, env)).rejects.toThrow("OWNER_GRANT_REQUIRED");
    const credential = await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { workspaceId: f.workspaceId } });
    expect(credential.ciphertext).toBe("revoked"); expect(credential.revokedAt).not.toBeNull();
    const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: f.modelAccountId } });
    expect(account.status).toBe("revoked"); expect(account.credentialRef).toBeNull();
    const after = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(after.request).toEqual(before.request); expect(after.status).toBe(before.status);
  });
  it("credential rotation fences old authority and resolves only the replacement", async () => {
    const { f, env, bound } = await provisioned(); const replacement = fakeKey();
    await provisionPersonalModelCredential({ userId: f.userId, workspaceId: f.workspaceId, apiKey: replacement }, env);
    await expect(personalModelCredentialForDispatch(bound, env)).rejects.toThrow("CREDENTIAL_BINDING_CHANGED");
    expect(digest(await personalModelCredentialForDispatch(await captured(f), env)) === digest(replacement)).toBe(true);
    const credentials = await prisma.constructionConnectorCredential.findMany({ where: { workspaceId: f.workspaceId } });
    expect(credentials.filter(row => row.revokedAt === null)).toHaveLength(1);
    expect(credentials.filter(row => row.revokedAt !== null).every(row => row.ciphertext === "revoked")).toBe(true);
  });
  it("AES-GCM binding rejects another workspace's synthetic ciphertext even under the same test encryption key", async () => {
    const first = await provisioned(); const second = await personalModelFixture();
    await provisionPersonalModelCredential({ userId: second.userId, workspaceId: second.workspaceId, apiKey: fakeKey() }, first.env);
    const a = await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { workspaceId: first.f.workspaceId, revokedAt: null } });
    const b = await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { workspaceId: second.workspaceId, revokedAt: null } });
    await prisma.constructionConnectorCredential.update({ where: { id: b.id }, data: { ciphertext: a.ciphertext } });
    await expect(personalModelCredentialForDispatch(await captured(second), first.env)).rejects.toThrow("CREDENTIAL_UNAVAILABLE");
  });
  it("an administrator who is not the actual workspace owner cannot prepare, consent or provision", async () => {
    const owner = await freshOwner(); const other = await freshOwner(); const env = controls();
    await prisma.constructionWorkspaceMember.create({ data: { workspaceId: owner.workspaceId, userId: other.userId, role: "admin", status: "active" } });
    const input = { workspaceId: owner.workspaceId, userId: other.userId };
    await expect(preparePersonalModelConnection(input)).rejects.toThrow("OWNER_REQUIRED");
    await expect(consentPersonalModelConnection({ ...input, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env)).rejects.toThrow("OWNER_REQUIRED");
    await expect(provisionPersonalModelCredential({ ...input, apiKey: fakeKey() }, env)).rejects.toThrow("OWNER_REQUIRED");
  });
  it("unverified owner loses lazy access and consent capability", async () => {
    const { f, env, bound } = await provisioned();
    await prisma.user.update({ where: { id: f.userId }, data: { emailVerified: false } });
    await expect(personalModelCredentialForDispatch(bound, env)).rejects.toThrow("OWNER_REQUIRED");
    await expect(consentPersonalModelConnection({ userId: f.userId, workspaceId: f.workspaceId, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env)).rejects.toThrow("OWNER_REQUIRED");
  });
});
