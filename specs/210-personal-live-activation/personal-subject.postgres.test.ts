import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { inspectPersonalGatewaySubject } from "@/server/model-gateway/personal-subject";
import { reservePersonalAiOperation, claimPersonalAiOperation, finishPersonalAiOperation } from "@/server/model-gateway/personal-ai-operations";
import { reserveAccountProviderSpendInTransaction } from "@/server/account-spend";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
const dbName = process.env.ENDVERA_210_DATABASE_NAME ?? "";
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(dbName) || url.pathname !== `/${dbName}`) throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
afterAll(() => prisma.$disconnect());

async function fixture() {
  const user = await prisma.user.create({ data: { name: "Synthetic model owner", email: `model-${randomUUID()}@example.invalid`, role: "CLIENT" } });
  const workspaceId = (await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic model subject" })).workspaceId;
  // Test phone unique within this disposable database; never passed to transport.
  const from = `+1500${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
  const identity = await prisma.constructionCommunicationIdentity.create({ data: { workspaceId, userId: user.id, channel: "sms", normalizedAddress: from, verified: true, permissions: ["COMMAND"], status: "active" } });
  const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
  const account = await prisma.constructionConnectorAccount.create({ data: { workspaceId, provider: "endvera_sms", createdByUserId: user.id, status: "connected", connectedAt: new Date(), credentialRef: "synthetic-only", externalAccountKeyHash: hash(accountSid), grants: { create: { capability: "sms_inbound", status: "active", grantedAt: new Date(), requestedScopes: ["sms_inbound"], grantedScopes: ["sms_inbound"] } } } });
  const base = { accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from, to: "+15005550006", body: "Qu’est-ce que j’ai demain?" };
  const { operationId } = await enqueuePersonalSms({ ...base, contentHash: hash(JSON.stringify(base)) });
  return { workspaceId, userId: user.id, identityId: identity.id, accountId: account.id, operationId,
    subject: { kind: "personal_assistant_operation" as const, workspaceId, operationId } };
}

describe("personal gateway real disposable PostgreSQL subject", () => {
  it("reloads the stored source, rejects cross-workspace lookup and observes revocation", async () => {
    const f = await fixture();
    const inspected = await inspectPersonalGatewaySubject(prisma, f.subject);
    expect(inspected.tenantKey).toBe(`construction-workspace:${f.workspaceId}`);
    expect(inspected.input.source).toBe("Qu’est-ce que j’ai demain?");
    expect(inspected.executionAuthorized).toBe(false);
    await expect(inspectPersonalGatewaySubject(prisma, { ...f.subject, workspaceId: "different-workspace" })).rejects.toThrow("NOT_PENDING");
    await prisma.constructionCommunicationIdentity.update({ where: { id: f.identityId }, data: { status: "revoked" } });
    await expect(inspectPersonalGatewaySubject(prisma, f.subject)).rejects.toThrow("IDENTITY_NOT_BOUND");
  });
  it("changes authority fingerprint when connector version changes and refuses changed source", async () => {
    const f = await fixture(); const before = await inspectPersonalGatewaySubject(prisma, f.subject);
    await prisma.constructionConnectorAccount.update({ where: { id: f.accountId }, data: { stateVersion: { increment: 1 } } });
    expect((await inspectPersonalGatewaySubject(prisma, f.subject)).authorityFingerprint).not.toBe(before.authorityFingerprint);
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.operationId } });
    await prisma.personalAssistantOperation.update({ where: { id: f.operationId }, data: { request: { ...row.request as Record<string, string>, body: "Changed" } } });
    await expect(inspectPersonalGatewaySubject(prisma, f.subject)).rejects.toThrow("SOURCE_CHANGED");
  });
  it("enforces personal purpose, non-null unique FK and immutable binding in PostgreSQL", async () => {
    const f = await fixture(); const other = await fixture(); const id = randomUUID();
    const insert = (aiId: string, purpose: string, operationId: string | null) => prisma.$executeRawUnsafe(
      `INSERT INTO "AiOperation" (id,purpose,"operationKey","personalAssistantOperationId","updatedAt") VALUES ($1,$2,$3,$4,now())`, aiId, purpose, `model:${aiId}`, operationId);
    await expect(insert(id, "personal_intent_candidate_v1", f.operationId)).resolves.toBe(1);
    await expect(insert(randomUUID(), "classification", other.operationId)).rejects.toThrow();
    await expect(insert(randomUUID(), "personal_intent_candidate_v1", null)).rejects.toThrow();
    await expect(insert(randomUUID(), "personal_intent_candidate_v1", f.operationId)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE "AiOperation" SET "personalAssistantOperationId"=$1 WHERE id=$2`, other.operationId, id)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE "AiOperation" SET purpose='classification',"personalAssistantOperationId"=NULL WHERE id=$1`, id)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE "AiOperation" SET "operationKey"='different' WHERE id=$1`, id)).rejects.toThrow();
  });
  it("fences one personal attempt across real concurrent transactions and rejects replay", async () => {
    const f = await fixture();
    const reserved = await prisma.$transaction(tx => reservePersonalAiOperation(tx, f.subject));
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => prisma.$transaction(tx => claimPersonalAiOperation(tx, f.subject), { isolationLevel: "Serializable" })));
    const claims = results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
    expect(claims).toHaveLength(1);
    const claim = claims[0]; expect(claim.operationId).toBe(reserved.operationId);
    expect(await prisma.$transaction(tx => claimPersonalAiOperation(tx, f.subject))).toBeNull();
    await prisma.$transaction(tx => finishPersonalAiOperation(tx, { claim, outcome: "PROPOSAL_INSPECTED", resultId: "synthetic-proposal" }));
    await expect(prisma.$transaction(tx => finishPersonalAiOperation(tx, { claim, outcome: "PROPOSAL_INSPECTED", resultId: "synthetic-proposal" }))).rejects.toThrow("EXPIRED_OR_SUPERSEDED");
    expect(await prisma.$transaction(tx => claimPersonalAiOperation(tx, f.subject))).toBeNull();
  });
  it("rolls back account USD exposure with its parent transaction and serializes competing holds", async () => {
    const env = { NODE_ENV: "test" as const, ACCOUNT_PROVIDER_SPEND_CEILING_OPENROUTER_MICROS: "10" };
    const operationKey = `rollback:${randomUUID()}`;
    await expect(prisma.$transaction(async tx => {
      const hold = await reserveAccountProviderSpendInTransaction(tx, { operationKey, attempt: 1, worstCaseMicros: 7n, provider: "openrouter", now: new Date("2026-09-10T00:00:00Z") }, env);
      expect(hold.ok).toBe(true); throw new Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect(await prisma.accountProviderSpendHold.count({ where: { operationKey } })).toBe(0);
    const keys = [randomUUID(), randomUUID()];
    const competing = await Promise.allSettled(keys.map(key => prisma.$transaction(tx => reserveAccountProviderSpendInTransaction(tx,
      { operationKey: key, attempt: 1, worstCaseMicros: 7n, provider: "openrouter", now: new Date("2026-09-11T00:00:00Z") }, env), { isolationLevel: "Serializable" })));
    expect(competing.filter(result => result.status === "fulfilled" && result.value.ok)).toHaveLength(1);
    const held = await prisma.accountProviderSpendHold.aggregate({ where: { operationKey: { in: keys } }, _sum: { amountMicros: true } });
    expect(held._sum.amountMicros).toBe(7n);
  });
});
