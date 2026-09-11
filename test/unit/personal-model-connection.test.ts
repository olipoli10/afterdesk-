import { beforeEach, describe, expect, it, vi } from "vitest";
import { consentPersonalModelConnection, disconnectPersonalModelConnection, personalModelConnectionStatus,
  personalModelCredentialForDispatch, preparePersonalModelConnection, provisionPersonalModelCredential,
  provisionPersonalModelCredentialFromOwnerSession, PERSONAL_MODEL_CONSENT_VERSION,
  PERSONAL_MODEL_CREDENTIAL_CONFIRMATION } from "@/server/personal-assistant/model-connection";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import type { PersonalIntentAdmission } from "@/server/model-gateway/personal-intent/admission";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
const shared = vi.hoisted(() => ({ transaction: vi.fn(), authority: vi.fn(), configuration: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ inspectModelAuthority: shared.authority }));
vi.mock("@/server/model-gateway/personal-intent/configuration", () => ({ loadPersonalModelConfiguration: shared.configuration }));
vi.mock("@/server/model-gateway/personal-subject", () => ({ inspectPersonalGatewaySubject: shared.source }));
const now = new Date("2026-09-10T12:00:00Z");
const input = { userId: "synthetic-owner", workspaceId: "synthetic-workspace" };
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ENDVERA_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
function fixture() {
  const account = { id: "synthetic-account", createdByUserId: input.userId, workspaceId: input.workspaceId, status: "prepared", credentialRef: null as string | null,
    revokedAt: null, grants: [] as Array<{ capability: string; status: string; revokedAt: null; grantedAt: Date; grantedScopes: string[] }> };
  const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ now }]),
    constructionWorkspaceMember: { findFirst: vi.fn().mockResolvedValue({ id: "synthetic-owner-member" }) },
    constructionConnectorAccount: { upsert: vi.fn().mockResolvedValue(account), findUnique: vi.fn().mockResolvedValue(account), findFirst: vi.fn().mockResolvedValue(account), update: vi.fn(async ({ data }) => Object.assign(account, data)) },
    constructionConnectorGrant: { upsert: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    constructionConnectorCredential: { create: vi.fn(async ({ data }) => data), findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  shared.transaction.mockImplementation(work => work(tx)); return { tx, account };
}
beforeEach(() => { vi.clearAllMocks(); shared.configuration.mockReturnValue({ status: "DISABLED" }); });
describe("owner-only personal model connection (synthetic ORM and cipher)", () => {
  it("prepares requested consent without a key or active grant", async () => {
    const { tx } = fixture(); expect(await preparePersonalModelConnection(input)).toEqual({ prepared: true, executionAuthorized: false });
    expect(tx.constructionConnectorGrant.upsert.mock.calls[0][0]).toMatchObject({ create: { capability: "personal_model_inference" }, update: {} });
    expect(tx.constructionConnectorAccount.update).not.toHaveBeenCalled(); expect(tx.constructionConnectorCredential.create).not.toHaveBeenCalled();
    expect(tx.constructionWorkspaceMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ role: "owner",
      workspace: { ownerUserId: input.userId, status: "active" }, user: { role: "CLIENT", emailVerified: true } }) }));
  });
  it("refuses non-owner membership before any provisioning write", async () => {
    const { tx } = fixture(); tx.constructionWorkspaceMember.findFirst.mockResolvedValue(null);
    await expect(preparePersonalModelConnection(input)).rejects.toThrow("OWNER_REQUIRED"); expect(tx.constructionConnectorAccount.upsert).not.toHaveBeenCalled();
  });
  it("does not adopt a previous owner's account", async () => {
    const { tx, account } = fixture(); account.createdByUserId = "other-owner";
    await expect(preparePersonalModelConnection(input)).rejects.toThrow("ACCOUNT_OWNER_MISMATCH"); expect(tx.constructionConnectorGrant.upsert).not.toHaveBeenCalled();
  });
  it("requires affirmative versioned consent, independent of configuration", async () => {
    const { tx } = fixture();
    await expect(consentPersonalModelConnection({ ...input, confirmation: "other" as typeof PERSONAL_MODEL_CONSENT_VERSION }, env)).rejects.toThrow("EXPLICIT_CONSENT");
    expect(shared.transaction).not.toHaveBeenCalled();
    expect(await consentPersonalModelConnection({ ...input, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env)).toMatchObject({ consentGranted: true, executionAuthorized: false });
    expect(tx.constructionConnectorGrant.upsert.mock.calls[0][0]).toMatchObject({ create: { grantedAt: now, status: "active",
      grantedScopes: ["personal_data:inference", `authority:${PERSONAL_MODEL_AUTHORITY}`] } });
    expect(tx.constructionConnectorAccount.update).not.toHaveBeenCalled();
  });
  it("refuses expired pilot consent", async () => {
    const { tx } = fixture(); tx.$queryRawUnsafe.mockResolvedValue([{ now: new Date("2026-10-10T01:18:26Z") }]);
    await expect(consentPersonalModelConnection({ ...input, confirmation: PERSONAL_MODEL_CONSENT_VERSION }, env)).rejects.toThrow("AUTHORITY_INACTIVE");
    expect(tx.constructionConnectorGrant.upsert).not.toHaveBeenCalled();
  });
  it("encrypts internal provisioned material, but never activates consent or verifies provider", async () => {
    const { tx } = fixture(); const apiKey = "synthetic_key_".repeat(4);
    const result = await provisionPersonalModelCredential({ ...input, apiKey }, env);
    expect(result).toEqual({ credentialPrepared: true, providerVerified: false, executionAuthorized: false });
    expect(JSON.stringify(tx.constructionConnectorCredential.create.mock.calls)).not.toContain(apiKey);
    expect(tx.constructionConnectorGrant.upsert).not.toHaveBeenCalled();
    const data = tx.constructionConnectorCredential.create.mock.calls[0][0].data;
    tx.constructionConnectorCredential.findFirst.mockResolvedValue(data);
    const source: PersonalIntentAdmission["source"] = { actorUserId: input.userId, subject: { kind: "personal_assistant_operation", operationId: "synthetic-inbound", workspaceId: input.workspaceId },
      authorityFingerprint: `sha256:${"a".repeat(64)}`, status: "SUBJECT_INSPECTED_NOT_DISPATCH_AUTHORIZED", executionAuthorized: false,
      tenantKey: `construction-workspace:${input.workspaceId}`, timezone: "America/Toronto", receivedAt: now.toISOString(), input: createPersonalIntentInput("synthetic-inbound", "Mon calendrier demain?") };
    shared.source.mockResolvedValue(source);
    const modelAuthority = { accountId: "synthetic-account", grantId: "synthetic-grant", fingerprint: "synthetic-fingerprint" };
    shared.authority.mockResolvedValue(modelAuthority);
    expect(await personalModelCredentialForDispatch({ source, modelAuthority }, env)).toBe(apiKey);
    shared.authority.mockResolvedValue({ ...modelAuthority, fingerprint: "changed" });
    await expect(personalModelCredentialForDispatch({ source, modelAuthority }, env)).rejects.toThrow("BINDING_CHANGED");
    shared.source.mockResolvedValue({ ...source, authorityFingerprint: "revoked-sms-identity" });
    await expect(personalModelCredentialForDispatch({ source, modelAuthority }, env)).rejects.toThrow("SOURCE_AUTHORITY_CHANGED");
  });
  it("accepts a versioned owner-session credential only after current consent and is idempotent by command", async () => {
    const { tx, account } = fixture(); const apiKey = "synthetic_key_".repeat(4);
    account.grants.push({ capability: "personal_model_inference", status: "active", revokedAt: null, grantedAt: now,
      grantedScopes: ["personal_data:inference", `authority:${PERSONAL_MODEL_AUTHORITY}`] });
    const commandId = "12345678-1234-4234-8234-123456789abc";
    const request = { ...input, apiKey, commandId, confirmation: PERSONAL_MODEL_CREDENTIAL_CONFIRMATION } as const;
    expect(await provisionPersonalModelCredentialFromOwnerSession(request, env)).toEqual({ commandId, credentialPrepared: true,
      providerVerified: false, executionAuthorized: false });
    expect(JSON.stringify(tx.constructionConnectorCredential.create.mock.calls)).not.toContain(apiKey);
    const stored = tx.constructionConnectorCredential.create.mock.calls[0][0].data;
    tx.constructionConnectorCredential.findFirst.mockResolvedValue(stored);
    expect(await provisionPersonalModelCredentialFromOwnerSession(request, env)).toMatchObject({ commandId, credentialPrepared: true });
    expect(tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
    await expect(provisionPersonalModelCredentialFromOwnerSession({ ...request, apiKey: "different_synthetic_key_123456789012" }, env))
      .rejects.toThrow("COMMAND_CONFLICT");
    await expect(provisionPersonalModelCredentialFromOwnerSession({ ...request, commandId: "12345678-1234-4234-8234-123456789abd" }, env))
      .rejects.toThrow("ALREADY_CONFIGURED");
    expect(tx.constructionConnectorCredential.create).toHaveBeenCalledTimes(1);
  });
  it("refuses owner-session credential writes without the exact current consent", async () => {
    const { tx } = fixture(); const apiKey = "synthetic_key_".repeat(4);
    await expect(provisionPersonalModelCredentialFromOwnerSession({ ...input, apiKey,
      commandId: "12345678-1234-4234-8234-123456789abc", confirmation: PERSONAL_MODEL_CREDENTIAL_CONFIRMATION }, env))
      .rejects.toThrow("CONSENT_REQUIRED");
    expect(tx.constructionConnectorCredential.create).not.toHaveBeenCalled();
  });
  it("revokes locally while preserving operation evidence and spend holds", async () => {
    const { tx } = fixture(); expect(await disconnectPersonalModelConnection(input)).toEqual({ disconnected: true, providerGrantRevoked: false });
    expect(tx.constructionConnectorCredential.updateMany).toHaveBeenCalledOnce();
    expect(tx.constructionConnectorGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "revoked", grantedScopes: [] }) }));
    expect(tx.constructionConnectorAccount.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ credentialRef: null, externalAccountKeyHash: null }) }));
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
  it("projects no secret/reference and never reports live proof", async () => {
    fixture(); const result = await personalModelConnectionStatus(input.userId, input.workspaceId, env);
    expect(result).toMatchObject({ prepared: true, credentialPrepared: false, consentGranted: false, configured: false, readyForAdmission: false, liveObserved: false });
    expect(JSON.stringify(result)).not.toContain("synthetic-account"); expect(result.executionAuthorized).toBe(false);
  });
});
