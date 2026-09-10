import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
const dbName = process.env.ENDVERA_210_DATABASE_NAME ?? "";
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(dbName) || url.pathname !== `/${dbName}`) throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");

let workspaceId: string; let userId: string;
const envelope = { accountSid: `AC${"a".repeat(32)}`, messageSid: `SM${"b".repeat(32)}`, from: "+15005550001", to: "+15005550006", body: "Qu'ai-je demain?", contentHash: "a".repeat(64) };
const workerEnv = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: envelope.accountSid, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: envelope.to, ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() };
beforeAll(async () => {
  const user = await prisma.user.create({ data: { name: "Synthetic pilot", email: `personal-210-${randomUUID()}@example.invalid`, role: "CLIENT" } });
  userId = user.id;
  workspaceId = (await initializeConstructionWorkspace({ userId, name: "Synthetic personal pilot" })).workspaceId;
  await prisma.constructionCommunicationIdentity.create({ data: { workspaceId, userId, channel: "sms", normalizedAddress: envelope.from, verified: true, permissions: ["COMMAND"], status: "active" } });
  await prisma.constructionConnectorAccount.create({ data: { workspaceId, provider: "endvera_sms", createdByUserId: userId, status: "connected", connectedAt: new Date(), credentialRef: "synthetic-local-credential-reference", externalAccountKeyHash: createHash("sha256").update(envelope.accountSid).digest("hex"), grants: { create: { capability: "sms_inbound", status: "active", grantedAt: new Date(), requestedScopes: ["sms_inbound"], grantedScopes: ["sms_inbound"] } } } });
});
afterAll(() => prisma.$disconnect());

describe("real local PostgreSQL personal SMS queue", () => {
  it("processes through the guarded engine once and durably prepares one unsent reply", async () => {
    const message = { ...envelope, messageSid: `SM${"d".repeat(32)}`, body: "Note le suivi de chantier", contentHash: "d".repeat(64) };
    const { operationId } = await enqueuePersonalSms(message);
    const engine = vi.fn().mockResolvedValue({ reply: "Suivi préparé." });
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => processPersonalSms(operationId, workerEnv, { engine })));
    expect(results.some(result => result.status === "fulfilled" && result.value.status === "COMPLETED_REPLY_PREPARED")).toBe(true);
    expect(engine).toHaveBeenCalledOnce(); expect(engine.mock.calls[0][0]).toMatchObject({ userId, channel: "SMS", admittedSource: { senderAddress: envelope.from, providerMessageId: message.messageSid } });
    const reply = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { idempotencyKey: `reply:${operationId}` } });
    expect(reply.status).toBe("pending"); expect(reply.externalTransportPerformed).toBe(false);
    expect(reply.request).toMatchObject({ to: envelope.from, sourceOperationId: operationId });
    await expect(processPersonalSms(operationId, workerEnv, { engine })).resolves.toEqual({ status: "NOT_PENDING" });
  });
  it("holds an uncertain engine outcome without silently retrying it", async () => {
    const message = { ...envelope, messageSid: `SM${"e".repeat(32)}`, body: "Note ce chantier", contentHash: "e".repeat(64) };
    const { operationId } = await enqueuePersonalSms(message); const engine = vi.fn().mockRejectedValue(new Error("synthetic-uncertain-outcome"));
    expect(await processPersonalSms(operationId, workerEnv, { engine })).toEqual({ status: "REVIEW_REQUIRED" });
    expect(await processPersonalSms(operationId, workerEnv, { engine })).toEqual({ status: "NOT_PENDING" });
    expect(engine).toHaveBeenCalledOnce();
    expect(await prisma.personalAssistantOperation.count({ where: { idempotencyKey: `reply:${operationId}` } })).toBe(0);
  });
  it("retains exactly one durable operation across concurrent deliveries and reconnect", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => enqueuePersonalSms(envelope)));
    expect(attempts.some(attempt => attempt.status === "fulfilled")).toBe(true);
    // A serialization abort may request provider retry; replay must then recover.
    const replay = await enqueuePersonalSms(envelope);
    expect(replay.replayed).toBe(true);
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId, kind: "personal_sms_inbound", requestHash: envelope.contentHash } })).toBe(1);
    await prisma.$disconnect();
    const afterReconnect = await enqueuePersonalSms(envelope);
    expect(afterReconnect).toEqual(replay);
  });
  it("refuses changed payload under the same provider message id", async () => {
    await expect(enqueuePersonalSms({ ...envelope, body: "Changed", contentHash: "c".repeat(64) })).rejects.toThrow("REPLAY_CONFLICT");
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId, kind: "personal_sms_inbound", requestHash: envelope.contentHash } })).toBe(1);
  });
  it("refuses a revoked owner even when the original message was received", async () => {
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { status: "revoked" } });
    await expect(enqueuePersonalSms(envelope)).rejects.toThrow("IDENTITY_NOT_BOUND");
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { status: "active" } });
  });
  it("creates and cascades only encrypted credential storage", async () => {
    const account = await prisma.constructionConnectorAccount.create({ data: { workspaceId, provider: "google_calendar", createdByUserId: userId } });
    const credential = await prisma.constructionConnectorCredential.create({ data: { connectorAccountId: account.id, workspaceId, ciphertext: "synthetic-ciphertext" } });
    expect((await prisma.constructionConnectorCredential.findUnique({ where: { id: credential.id } }))?.ciphertext).toBe("synthetic-ciphertext");
    await prisma.constructionConnectorAccount.delete({ where: { id: account.id } });
    expect(await prisma.constructionConnectorCredential.findUnique({ where: { id: credential.id } })).toBeNull();
  });
});
