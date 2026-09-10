import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { personalOutboundSchema, sendPersonalTwilio, twilioDispatchPolicy, type OutboundKind } from "./twilio-outbound";
import type { ConnectorEnvironment } from "./google-client";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type DB = Prisma.TransactionClient | typeof prisma;
async function requireSelfRecipient(db: DB, userId: string, workspaceId: string, to: string) {
  const member = await db.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
  const identity = await db.constructionCommunicationIdentity.findFirst({ where: { workspaceId, userId, channel: "sms", normalizedAddress: to, verified: true, status: "active", permissions: { has: "COMMAND" } } });
  if (!member || !identity) throw new Error("VERIFIED_SELF_RECIPIENT_REQUIRED");
}
export async function preparePersonalOutbound(input: { userId: string; workspaceId: string; kind: OutboundKind; to: string; text: string; requestId: string }, env: ConnectorEnvironment = process.env) {
  return prisma.$transaction(tx => preparePersonalOutboundInTransaction(tx, input, env), { isolationLevel: "Serializable" });
}
/** Preparation only: does not approve, reserve transport spend or send. */
export async function preparePersonalOutboundInTransaction(tx: Prisma.TransactionClient, input: { userId: string; workspaceId: string; kind: OutboundKind; to: string; text: string; requestId: string }, env: ConnectorEnvironment = process.env) {
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error("REQUEST_ID_REQUIRED");
  const request = personalOutboundSchema.parse({ to: input.to, from: env.TWILIO_PHONE_NUMBER, text: input.kind === "voice_outbound" ? `Bonjour, ici l’assistant ENDVERA. ${input.text}` : input.text });
  if (!["sms_outbound", "voice_outbound"].includes(input.kind) || input.kind === "voice_outbound" && request.text.length > 600) throw new Error("OUTBOUND_REQUEST_REFUSED");
  const requestHash = hash(JSON.stringify(request));
  await requireSelfRecipient(tx, input.userId, input.workspaceId, request.to);
  const account = await tx.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "endvera_sms" } } });
  const idempotencyKey = `personal-outbound:${input.workspaceId}:${input.requestId}`;
  const existing = await tx.personalAssistantOperation.findUnique({ where: { idempotencyKey } });
  if (existing) { if (existing.requestHash !== requestHash || existing.createdByUserId !== input.userId || existing.kind !== input.kind) throw new Error("OUTBOUND_REPLAY_CONFLICT"); return { operationId: existing.id, requestHash, status: existing.status }; }
  const row = await tx.personalAssistantOperation.create({ data: { id: randomUUID(), workspaceId: input.workspaceId, connectorAccountId: account.id, kind: input.kind, status: "pending", request, requestHash, idempotencyKey, createdByUserId: input.userId } });
  return { operationId: row.id, requestHash, status: row.status };
}
export async function approvePersonalOutbound(input: { userId: string; workspaceId: string; operationId: string; expectedRequestHash: string }, env: ConnectorEnvironment = process.env) {
  return prisma.$transaction(async tx => {
    const row = await tx.personalAssistantOperation.findFirst({ where: { id: input.operationId, workspaceId: input.workspaceId, createdByUserId: input.userId, kind: { in: ["sms_outbound", "voice_outbound"] } } });
    if (!row || row.status !== "pending" || row.requestHash !== input.expectedRequestHash) throw new Error("APPROVAL_REFUSED_OR_ALREADY_USED");
    const request = personalOutboundSchema.parse(row.request);
    if (hash(JSON.stringify(request)) !== row.requestHash) throw new Error("OUTBOUND_CONTENT_CHANGED");
    await requireSelfRecipient(tx, input.userId, input.workspaceId, request.to);
    const policy = twilioDispatchPolicy(env, row.kind as OutboundKind, request.text);
    const update = await tx.personalAssistantOperation.updateMany({ where: { id: row.id, status: "pending", requestHash: input.expectedRequestHash }, data: { status: "approved", result: { approvedBy: input.userId, approvedHash: row.requestHash, approvedUntil: new Date(Math.min(Date.now() + 600000, policy.expiresAt.getTime())).toISOString() } } });
    if (update.count !== 1) throw new Error("APPROVAL_REFUSED_OR_ALREADY_USED");
    return { approved: true as const, operationId: row.id };
  }, { isolationLevel: "Serializable" });
}
export async function dispatchPersonalOutbound(operationId: string, env: ConnectorEnvironment = process.env, transport: typeof fetch = fetch) {
  const claimed = await prisma.$transaction(async tx => {
    const row = await tx.personalAssistantOperation.findUnique({ where: { id: operationId } });
    if (!row || row.status !== "approved" || !["sms_outbound", "voice_outbound"].includes(row.kind)) throw new Error("APPROVAL_REQUIRED");
    const approval = row.result as { approvedBy?: string; approvedHash?: string; approvedUntil?: string } | null;
    if (approval?.approvedBy !== row.createdByUserId || approval.approvedHash !== row.requestHash || !(Date.parse(approval.approvedUntil ?? "") > Date.now())) throw new Error("APPROVAL_EXPIRED_OR_CHANGED");
    const request = personalOutboundSchema.parse(row.request);
    if (hash(JSON.stringify(request)) !== row.requestHash || request.from !== env.TWILIO_PHONE_NUMBER) throw new Error("OUTBOUND_CONTENT_CHANGED");
    await requireSelfRecipient(tx, row.createdByUserId, row.workspaceId, request.to);
    const account = await tx.constructionConnectorAccount.findUniqueOrThrow({ where: { id: row.connectorAccountId } });
    if (account.status !== "connected" || account.revokedAt || account.externalAccountKeyHash !== hash(env.TWILIO_ACCOUNT_SID ?? "")) throw new Error("SMS_CONNECTION_REVOKED");
    const grant = await tx.constructionConnectorGrant.findFirst({ where: { connectorAccountId: account.id, capability: row.kind === "sms_outbound" ? "personal_sms_send" : "personal_voice_send", status: "active", revokedAt: null } });
    if (!grant) throw new Error("OUTBOUND_GRANT_REQUIRED");
    const policy = twilioDispatchPolicy(env, row.kind as OutboundKind, request.text);
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${policy.budgetId}, 0))::text AS acquired`);
    const budget = await tx.personalAssistantBudget.upsert({ where: { id: policy.budgetId }, create: { id: policy.budgetId, ceilingCadMicros: policy.ceiling, expiresAt: policy.expiresAt }, update: {} });
    if (budget.ceilingCadMicros !== policy.ceiling || budget.expiresAt.getTime() !== policy.expiresAt.getTime() || budget.reservedCadMicros + policy.reservation > budget.ceilingCadMicros) throw new Error("BUDGET_EXHAUSTED_OR_CHANGED");
    await tx.personalAssistantBudget.update({ where: { id: budget.id }, data: { reservedCadMicros: { increment: policy.reservation } } });
    const changed = await tx.personalAssistantOperation.updateMany({ where: { id: row.id, status: "approved", requestHash: row.requestHash }, data: { status: "processing", budgetId: budget.id, reservedCadMicros: policy.reservation, attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 120000) } });
    if (changed.count !== 1) throw new Error("APPROVAL_ALREADY_CONSUMED");
    return { row, request };
  }, { isolationLevel: "Serializable" });
  let transportAttempted = false;
  try {
    const result = await sendPersonalTwilio(claimed.row.kind as OutboundKind, claimed.request, env, (...args) => { transportAttempted = true; return transport(...args); }, operationId);
    await prisma.personalAssistantOperation.update({ where: { id: operationId }, data: { status: "completed", externalTransportPerformed: true, leaseUntil: null, result: { ...result, acceptedByProvider: true, approvalHash: claimed.row.requestHash } } });
    return result;
  } catch {
    // Retain the whole reservation, including on timeout. No automatic retry.
    await prisma.personalAssistantOperation.updateMany({ where: { id: operationId, status: "processing" }, data: { status: "uncertain", externalTransportPerformed: transportAttempted, leaseUntil: null, result: { reviewRequired: true, automaticRetry: false, deliveryConfirmed: false } } });
    throw new Error("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
  }
}
export async function personalOutboxForOwner(userId: string, workspaceId: string) {
  const member = await prisma.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
  if (!member) throw new Error("OUTBOX_ACCESS_REFUSED");
  const rows = await prisma.personalAssistantOperation.findMany({ where: { workspaceId, createdByUserId: userId, kind: { in: ["sms_outbound", "voice_outbound"] } }, orderBy: { createdAt: "desc" }, take: 30, include: { deliveryReceipts: true } });
  return { operations: rows.map(row => {
    const providerSid = (row.result as { providerSid?: string } | null)?.providerSid;
    // A callback can arrive before the REST response. Conflicting message IDs
    // must never be merged into a single successful-delivery claim.
    const receiptIds = new Set(row.deliveryReceipts.map(receipt => receipt.providerSid));
    const consistent = receiptIds.size === 1 && (!providerSid || receiptIds.has(providerSid));
    return { id: row.id, kind: row.kind, status: row.status, requestHash: row.requestHash, request: personalOutboundSchema.parse(row.request), deliveryConfirmed: consistent && row.kind === "sms_outbound" && row.deliveryReceipts.some(receipt => receipt.status === "delivered") && !row.deliveryReceipts.some(receipt => ["failed", "undelivered", "canceled"].includes(receipt.status)), receiptStates: row.deliveryReceipts.map(receipt => receipt.status), createdAt: row.createdAt.toISOString() };
  }) };
}

export async function sendAutomaticPersonalReply(operationId: string, env: ConnectorEnvironment = process.env, transport: typeof fetch = fetch) {
  if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("AUTOMATIC_REPLIES_DISABLED");
  const row = await prisma.personalAssistantOperation.findUnique({ where: { id: operationId } });
  if (!row || row.kind !== "sms_outbound" || !["pending", "approved"].includes(row.status)) throw new Error("AUTOMATIC_REPLY_REFUSED");
  const request = personalOutboundSchema.parse(row.request);
  if (!request.sourceOperationId || row.idempotencyKey !== `reply:${request.sourceOperationId}`) throw new Error("AUTOMATIC_REPLY_REFUSED");
  const source = await prisma.personalAssistantOperation.findFirst({ where: { id: request.sourceOperationId, workspaceId: row.workspaceId, createdByUserId: row.createdByUserId, kind: "personal_sms_inbound", status: "completed" } });
  const inbound = source?.request as { from?: string; to?: string } | undefined;
  const answer = source?.result as { reply?: string } | undefined;
  if (!source || inbound?.from !== request.to || inbound.to !== request.from || answer?.reply !== request.text) throw new Error("AUTOMATIC_REPLY_REFUSED");
  const grant = await prisma.constructionConnectorGrant.findFirst({ where: { connectorAccountId: row.connectorAccountId, capability: "personal_sms_send", status: "active", revokedAt: null } });
  if (!grant) throw new Error("AUTOMATIC_REPLY_CONSENT_REQUIRED");
  if (row.status === "pending") await approvePersonalOutbound({ userId: row.createdByUserId, workspaceId: row.workspaceId, operationId: row.id, expectedRequestHash: row.requestHash }, env);
  return dispatchPersonalOutbound(row.id, env, transport);
}
