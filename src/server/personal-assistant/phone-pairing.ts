import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { enqueuePersonalSms } from "./sms-inbox";
import { TwilioIngressRefused, type TwilioSmsEnvelope } from "./twilio-envelope";
import type { ConnectorEnvironment } from "./google-client";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function personalPhoneStatus(userId: string, workspaceId: string, env: ConnectorEnvironment = process.env) {
  const owner = await prisma.constructionWorkspaceMember.findFirst({ where: { userId, workspaceId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
  if (!owner) throw new Error("SMS_PAIRING_ACCESS_REFUSED");
  let configured = true; try { requirePairingConfig(env); } catch { configured = false; }
  const identities = await prisma.constructionCommunicationIdentity.findMany({ where: { userId, workspaceId, channel: "sms", normalizedAddress: { startsWith: "+" }, verified: true, status: "active", permissions: { has: "COMMAND" } }, select: { normalizedAddress: true }, take: 2 });
  const account = await prisma.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "endvera_sms" } } });
  return { configured, number: configured ? env.TWILIO_PHONE_NUMBER! : null, boundPhone: identities.length === 1 && account?.status === "connected" && account.externalAccountKeyHash === hash(env.TWILIO_ACCOUNT_SID ?? "") ? identities[0].normalizedAddress : null };
}
export async function disconnectPersonalPhone(userId: string, workspaceId: string) {
  await personalPhoneStatus(userId, workspaceId);
  await prisma.$transaction(async tx => {
    await tx.constructionCommunicationIdentity.updateMany({ where: { workspaceId, userId, channel: "sms" }, data: { verified: false, permissions: [], status: "revoked" } });
    const account = await tx.constructionConnectorAccount.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "endvera_sms" } } });
    if (!account) return;
    await tx.constructionConnectorGrant.updateMany({ where: { connectorAccountId: account.id }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    await tx.constructionConnectorAccount.update({ where: { id: account.id }, data: { status: "revoked", revokedAt: new Date(), credentialRef: null, externalAccountKeyHash: null, grantedScopes: [], stateVersion: { increment: 1 } } });
    // A dedicated confirmation summary is immutable historical evidence, not an
    // executable pending send. Mutating it would roll back the grant revocation.
    await tx.personalAssistantOperation.updateMany({ where: { connectorAccountId: account.id, kind: { not: "calendar_confirmation_summary" }, status: { in: ["pending", "approved", "received"] } }, data: { status: "refused", result: { reason: "PHONE_DISCONNECTED" } } });
  }, { isolationLevel: "Serializable" });
  return { disconnected: true as const };
}
function requirePairingConfig(env: ConnectorEnvironment) {
  if (!externalCapabilityDecision("SMS", env).enabled || env.ENDVERA_PERSONAL_SMS_INGRESS_ENABLED !== "true" || !(Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "") > Date.now()) || !/^\+[1-9]\d{7,14}$/.test(env.TWILIO_PHONE_NUMBER ?? "")) throw new Error("SMS_PAIRING_NOT_CONFIGURED");
}
export async function startPhonePairing(input: { userId: string; workspaceId: string; allowSelfSms: boolean; allowSelfVoice: boolean }, env: ConnectorEnvironment = process.env) {
  requirePairingConfig(env);
  const token = randomBytes(16).toString("hex"); const id = randomUUID();
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  await prisma.$transaction(async tx => {
    const member = await tx.constructionWorkspaceMember.findFirst({ where: { userId: input.userId, workspaceId: input.workspaceId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
    if (!member) throw new Error("SMS_PAIRING_ACCESS_REFUSED");
    const account = await tx.constructionConnectorAccount.upsert({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "endvera_sms" } }, create: { workspaceId: input.workspaceId, provider: "endvera_sms", createdByUserId: input.userId }, update: {} });
    await tx.personalAssistantOperation.updateMany({ where: { connectorAccountId: account.id, createdByUserId: input.userId, kind: "sms_pairing", status: "pending" }, data: { status: "refused", request: { superseded: true } } });
    await tx.personalAssistantOperation.create({ data: { id, workspaceId: input.workspaceId, connectorAccountId: account.id, createdByUserId: input.userId, kind: "sms_pairing", status: "pending", idempotencyKey: `sms-pair:${hash(token)}`, requestHash: hash(token), request: { expiresAt, allowSelfSms: input.allowSelfSms, allowSelfVoice: input.allowSelfVoice, accountHash: hash(env.TWILIO_ACCOUNT_SID!), number: env.TWILIO_PHONE_NUMBER } } });
  }, { isolationLevel: "Serializable" });
  return { number: env.TWILIO_PHONE_NUMBER!, text: `CONNECTER ENDVERA ${token}`, expiresAt };
}
export async function acceptPersonalSms(envelope: TwilioSmsEnvelope, env: ConnectorEnvironment = process.env) {
  const match = /^CONNECTER ENDVERA ([0-9a-f]{32})$/i.exec(envelope.body.trim());
  if (!match) return enqueuePersonalSms(envelope);
  requirePairingConfig(env);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-phone:${envelope.from}`}, 0))::text AS acquired`);
    const row = await tx.personalAssistantOperation.findUnique({ where: { idempotencyKey: `sms-pair:${hash(match[1].toLowerCase())}` } });
    if (!row || row.kind !== "sms_pairing") throw new TwilioIngressRefused("PAIRING_REFUSED");
    if (row.status === "completed") {
      const prior = row.result as { messageSid?: string; from?: string } | null;
      if (prior?.messageSid === envelope.messageSid && prior.from === envelope.from) return { operationId: row.id, replayed: true };
      throw new TwilioIngressRefused("PAIRING_ALREADY_USED");
    }
    const request = row.request as { expiresAt?: string; allowSelfSms?: boolean; allowSelfVoice?: boolean; accountHash?: string; number?: string };
    if (row.status !== "pending" || !(Date.parse(request.expiresAt ?? "") > Date.now()) || request.accountHash !== hash(envelope.accountSid) || request.number !== envelope.to) throw new TwilioIngressRefused("PAIRING_REFUSED");
    const member = await tx.constructionWorkspaceMember.findFirst({ where: { userId: row.createdByUserId, workspaceId: row.workspaceId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
    if (!member) throw new TwilioIngressRefused("PAIRING_REFUSED");
    const priorBindings = await tx.constructionCommunicationIdentity.findMany({ where: { channel: "sms", normalizedAddress: envelope.from, status: "active", verified: true, permissions: { has: "COMMAND" } }, take: 2 });
    if (priorBindings.some(identity => identity.workspaceId !== row.workspaceId || identity.userId !== row.createdByUserId)) throw new TwilioIngressRefused("PHONE_ALREADY_BOUND");
    await tx.constructionCommunicationIdentity.updateMany({ where: { workspaceId: row.workspaceId, userId: row.createdByUserId, channel: "sms", normalizedAddress: { startsWith: "+", not: envelope.from } }, data: { status: "revoked", verified: false, permissions: [] } });
    await tx.constructionCommunicationIdentity.upsert({ where: { workspaceId_channel_normalizedAddress: { workspaceId: row.workspaceId, channel: "sms", normalizedAddress: envelope.from } }, create: { workspaceId: row.workspaceId, userId: row.createdByUserId, channel: "sms", normalizedAddress: envelope.from, verified: true, permissions: ["COMMAND"], status: "active" }, update: { userId: row.createdByUserId, contactId: null, verified: true, permissions: ["COMMAND"], status: "active" } });
    await tx.constructionConnectorAccount.update({ where: { id: row.connectorAccountId }, data: { status: "connected", connectedAt: new Date(), revokedAt: null, credentialRef: "server:twilio-api-key", externalAccountKeyHash: hash(envelope.accountSid), stateVersion: { increment: 1 } } });
    const capabilities = ["sms_inbound", ...(request.allowSelfSms ? ["personal_sms_send"] : []), ...(request.allowSelfVoice ? ["personal_voice_send"] : [])];
    await tx.constructionConnectorGrant.updateMany({ where: { connectorAccountId: row.connectorAccountId, capability: { in: ["sms_inbound", "personal_sms_send", "personal_voice_send"] } }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    for (const capability of capabilities) await tx.constructionConnectorGrant.upsert({ where: { connectorAccountId_capability: { connectorAccountId: row.connectorAccountId, capability } }, create: { connectorAccountId: row.connectorAccountId, capability, status: "active", requestedScopes: [capability], grantedScopes: [capability], grantedAt: new Date() }, update: { status: "active", requestedScopes: [capability], grantedScopes: [capability], grantedAt: new Date(), revokedAt: null, stateVersion: { increment: 1 } } });
    const consumed = await tx.personalAssistantOperation.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "completed", request: { consumed: true }, result: { messageSid: envelope.messageSid, from: envelope.from }, externalTransportPerformed: true } });
    if (consumed.count !== 1) throw new TwilioIngressRefused("PAIRING_ALREADY_USED");
    return { operationId: row.id, replayed: false };
  }, { isolationLevel: "Serializable" });
}
