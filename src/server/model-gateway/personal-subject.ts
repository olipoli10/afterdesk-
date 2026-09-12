import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { createPersonalIntentInput } from "./personal-intent/contract";
import { appendPersonalSmsClarificationTranscript, inspectPersonalSmsTranscript } from "./personal-intent/sms-transcript";
import type { PersonalGatewayOperationSubject } from "./types";

const envelopeSchema = z.object({
  schemaVersion: z.literal(1), accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  messageSid: z.string().regex(/^SM[0-9a-f]{32}$/i),
  from: z.string().regex(/^\+[1-9][0-9]{7,14}$/), to: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  body: z.string().min(1).max(10_000), contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  identityId: z.string().min(1),
}).strict();
const id = z.string().min(1).max(191);
const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/u);
const outboundSchema = z.object({ to: e164, from: e164, text: z.string().min(1).max(1500), sourceOperationId: id }).strict();
const priorResultSchema = z.object({
  reply: z.string().min(1).max(1500), source: z.literal("MODEL_REVIEW_ONLY"),
  personalModelReview: z.object({
    status: z.literal("REVIEW_PREPARED_NOT_AUTHORIZED"), modelChildOperationId: id,
    source: z.object({ operationId: id, text: z.string().min(1).max(10_000),
      receivedAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100) }).passthrough(),
    actions: z.array(z.object({ actionId: id, kind: z.string().min(1).max(100), status: z.literal("CLARIFY"),
      question: z.string().min(1).max(1500) }).passthrough()).length(1),
  }).passthrough(),
}).passthrough();

type SubjectRow = {
  id: string; workspaceId: string; createdByUserId: string; kind: string; status: string;
  request: unknown; requestHash: string; idempotencyKey: string; createdAt: Date;
  workspaceStatus: string; ownerUserId: string; defaultTimezone: string;
  memberStatus: string | null; memberRole: string | null;
  identityId: string | null; identityUserId: string | null; identityStatus: string | null;
  identityAddress: string | null; identityVerified: boolean | null; identityPermissions: string[] | null;
  identityBindingCount: bigint; accountId: string; accountProvider: string;
  accountStatus: string; accountRevokedAt: Date | null; accountHash: string | null;
  accountVersion: number; grantId: string | null; grantStatus: string | null;
  grantRevokedAt: Date | null; grantVersion: number | null;
  contextOperationId?: string | null; contextRequest?: unknown; contextRequestHash?: string | null;
  contextIdempotencyKey?: string | null; contextReceivedAt?: Date | null; contextResult?: unknown;
  contextOutboundId?: string | null; contextOutboundRequest?: unknown; contextOutboundRequestHash?: string | null;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Authoritative database inspection of the stored inbound subject, not a model
 * supplied permission snapshot. Caller must use its authenticated workspace.
 * This is NOT dispatch admission: no policy, pilot expiry, budget, claim or
 * provider authority is granted here. Repeat this read after model latency;
 * compare authorityFingerprint before preparing anything, then separately check
 * current action-specific grants. The SMS grant never grants Calendar access.
 */
async function inspectSubject(
  tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
  expected: PersonalGatewayOperationSubject,
  allowedStatuses: readonly string[],
  includeClarificationContext = false,
) {
  if (expected.kind !== "personal_assistant_operation" || !expected.operationId || !expected.workspaceId) {
    throw new Error("PERSONAL_GATEWAY_INVALID_SUBJECT");
  }
  const rows = await tx.$queryRawUnsafe<SubjectRow[]>(
    `SELECT p.id,p."workspaceId",p."createdByUserId",p.kind,p.status,p.request,p."requestHash",p."idempotencyKey",p."createdAt",
      w.status::text "workspaceStatus",w."ownerUserId",w."defaultTimezone",
      m.status::text "memberStatus",m.role::text "memberRole",
      i.id "identityId",i."userId" "identityUserId",i.status::text "identityStatus",
      i."normalizedAddress" "identityAddress",i.verified "identityVerified",i.permissions "identityPermissions",
      (SELECT count(*) FROM "ConstructionCommunicationIdentity" i2 JOIN "ConstructionWorkspace" w2 ON w2.id=i2."workspaceId"
        WHERE i2.channel='sms' AND i2."normalizedAddress"=p.request->>'from' AND i2.status='active'
        AND i2.verified=true AND i2."userId" IS NOT NULL AND 'COMMAND'=ANY(i2.permissions) AND w2.status='active') "identityBindingCount",
      a.id "accountId",a.provider "accountProvider",a.status "accountStatus",a."revokedAt" "accountRevokedAt",
      a."externalAccountKeyHash" "accountHash",a."stateVersion" "accountVersion",
      g.id "grantId",g.status "grantStatus",g."revokedAt" "grantRevokedAt",g."stateVersion" "grantVersion",
      context.id "contextOperationId",context.request "contextRequest",context."requestHash" "contextRequestHash",
      context."idempotencyKey" "contextIdempotencyKey",context."createdAt" "contextReceivedAt",context.result "contextResult",
      context."outboundId" "contextOutboundId",context."outboundRequest" "contextOutboundRequest",
      context."outboundRequestHash" "contextOutboundRequestHash"
    FROM "PersonalAssistantOperation" p
    JOIN "ConstructionWorkspace" w ON w.id=p."workspaceId"
    JOIN "ConstructionConnectorAccount" a ON a.id=p."connectorAccountId" AND a."workspaceId"=p."workspaceId"
    LEFT JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=p."workspaceId" AND m."userId"=p."createdByUserId"
    LEFT JOIN "ConstructionCommunicationIdentity" i ON i.id=p.request->>'identityId' AND i."workspaceId"=p."workspaceId" AND i.channel='sms'
    LEFT JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id AND g.capability='sms_inbound'
    LEFT JOIN LATERAL (
      SELECT prior.id,prior.request,prior."requestHash",prior."idempotencyKey",prior."createdAt",prior.result,
        outbound.id "outboundId",outbound.request "outboundRequest",outbound."requestHash" "outboundRequestHash"
      FROM "PersonalAssistantOperation" prior
      JOIN "PersonalAssistantOperation" outbound ON outbound."workspaceId"=prior."workspaceId"
        AND outbound."createdByUserId"=prior."createdByUserId" AND outbound."connectorAccountId"=prior."connectorAccountId"
        AND outbound.kind='sms_outbound' AND outbound.status='completed' AND outbound.attempts=1
        AND outbound."externalTransportPerformed"=true AND outbound."idempotencyKey"='reply:'||prior.id
        AND outbound.request->>'sourceOperationId'=prior.id AND outbound.request->>'to'=prior.request->>'from'
        AND outbound.request->>'from'=prior.request->>'to' AND outbound.result->>'acceptedByProvider'='true'
      WHERE prior."workspaceId"=p."workspaceId" AND prior."createdByUserId"=p."createdByUserId"
        AND prior."connectorAccountId"=p."connectorAccountId" AND prior.request->>'identityId'=p.request->>'identityId'
        AND prior.request->>'accountSid'=p.request->>'accountSid' AND prior.request->>'from'=p.request->>'from'
        AND prior.request->>'to'=p.request->>'to' AND prior."createdAt"<p."createdAt"
        AND prior."createdAt">=p."createdAt"-interval '15 minutes' AND prior.kind='personal_sms_inbound'
        AND prior.status='completed' AND prior.attempts=1 AND prior."leaseUntil" IS NULL
        AND prior.result->>'source'='MODEL_REVIEW_ONLY'
        AND prior.result#>>'{personalModelReview,status}'='REVIEW_PREPARED_NOT_AUTHORIZED'
        AND jsonb_typeof(prior.result->'personalModelReview'->'actions')='array'
        AND jsonb_array_length(prior.result->'personalModelReview'->'actions')=1
        AND prior.result#>>'{personalModelReview,actions,0,status}'='CLARIFY'
        AND NOT EXISTS (SELECT 1 FROM "PersonalAssistantOperation" between_source
          WHERE between_source."workspaceId"=p."workspaceId" AND between_source."createdByUserId"=p."createdByUserId"
            AND between_source.kind='personal_sms_inbound' AND between_source.request->>'identityId'=p.request->>'identityId'
            AND between_source."createdAt">prior."createdAt" AND between_source."createdAt"<p."createdAt")
      ORDER BY prior."createdAt" DESC,prior.id DESC LIMIT 2
    ) context ON TRUE
    WHERE p.id=$1 AND p."workspaceId"=$2`,
    expected.operationId, expected.workspaceId,
  );
  const row = rows[0];
  if (rows.length !== 1 || !row || row.id !== expected.operationId || row.workspaceId !== expected.workspaceId ||
    row.kind !== "personal_sms_inbound" || !allowedStatuses.includes(row.status)) {
    throw new Error("PERSONAL_GATEWAY_SUBJECT_NOT_PENDING");
  }
  const received = envelopeSchema.parse(row.request);
  if (!(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())) throw new Error("PERSONAL_GATEWAY_RECEIPT_TIME_INVALID");
  const receivedAt = row.createdAt.toISOString();
  const { accountSid, messageSid, from, to, body } = received;
  const contentHash = hash(JSON.stringify({ accountSid, messageSid, from, to, body }));
  if (contentHash !== received.contentHash || contentHash !== row.requestHash ||
      row.idempotencyKey !== `personal-sms:${hash(`${accountSid}:${messageSid}`)}`) {
    throw new Error("PERSONAL_GATEWAY_SOURCE_CHANGED");
  }
  if (row.workspaceStatus !== "active" || row.ownerUserId !== row.createdByUserId ||
      row.memberStatus !== "active" || row.memberRole !== "owner" ||
      row.identityId !== received.identityId || row.identityUserId !== row.createdByUserId ||
      row.identityStatus !== "active" || row.identityVerified !== true ||
      row.identityAddress !== from || !row.identityPermissions?.includes("COMMAND") ||
      row.identityBindingCount !== 1n) {
    throw new Error("PERSONAL_GATEWAY_IDENTITY_NOT_BOUND");
  }
  if (row.accountProvider !== "endvera_sms" || row.accountStatus !== "connected" || row.accountRevokedAt !== null ||
      row.accountHash !== hash(accountSid) || !row.grantId || row.grantStatus !== "active" || row.grantRevokedAt !== null) {
    throw new Error("PERSONAL_GATEWAY_CHANNEL_NOT_CONNECTED");
  }
  let source = body;
  let conversationContext: Readonly<Record<string, string>> | null = null;
  if (includeClarificationContext && row.contextOperationId !== undefined && row.contextOperationId !== null) {
    try {
      if (!row.contextRequestHash || !row.contextIdempotencyKey || !row.contextReceivedAt || !row.contextOutboundId
        || !row.contextOutboundRequestHash) throw new Error();
      const prior = envelopeSchema.parse(row.contextRequest);
      const priorHash = hash(JSON.stringify({ accountSid: prior.accountSid, messageSid: prior.messageSid,
        from: prior.from, to: prior.to, body: prior.body }));
      if (priorHash !== prior.contentHash || priorHash !== row.contextRequestHash
        || row.contextIdempotencyKey !== `personal-sms:${hash(`${prior.accountSid}:${prior.messageSid}`)}`
        || !(row.contextReceivedAt instanceof Date) || !Number.isFinite(row.contextReceivedAt.getTime())) throw new Error();
      const result = priorResultSchema.parse(row.contextResult);
      const review = result.personalModelReview, action = review.actions[0];
      const outbound = outboundSchema.parse(row.contextOutboundRequest);
      const outboundHash = hash(JSON.stringify({ to: outbound.to, from: outbound.from, text: outbound.text,
        sourceOperationId: outbound.sourceOperationId }));
      const previousTranscript = inspectPersonalSmsTranscript(review.source.text);
      if (review.source.operationId !== row.contextOperationId || review.source.receivedAt !== row.contextReceivedAt.toISOString()
        || review.source.timezone !== row.defaultTimezone || previousTranscript?.latestUserText !== prior.body
        || result.reply !== outbound.text || !result.reply.includes(action.question)
        || outbound.sourceOperationId !== row.contextOperationId || outbound.to !== prior.from || outbound.from !== prior.to
        || outboundHash !== row.contextOutboundRequestHash) throw new Error();
      const combined = appendPersonalSmsClarificationTranscript(review.source.text, action.question, body);
      if (combined) {
        source = combined.source;
        conversationContext = Object.freeze({ sourceOperationId: row.contextOperationId,
          sourceRequestHash: row.contextRequestHash, modelChildOperationId: review.modelChildOperationId,
          outboundOperationId: row.contextOutboundId, outboundRequestHash: row.contextOutboundRequestHash,
          transcriptHash: hash(combined.source) });
      }
    } catch { throw new Error("PERSONAL_GATEWAY_CONTEXT_CHANGED"); }
  }
  const input = createPersonalIntentInput(row.id, source);
  // Explicit namespace: ConstructionWorkspace identifiers are NOT Client ids.
  const tenantKey = `construction-workspace:${row.workspaceId}` as const;
  return Object.freeze({
    status: "SUBJECT_INSPECTED_NOT_DISPATCH_AUTHORIZED" as const,
    executionAuthorized: false as const,
    tenantKey,
    subject: Object.freeze({ ...expected }),
    actorUserId: row.createdByUserId,
    timezone: row.defaultTimezone,
    receivedAt,
    input,
    authorityFingerprint: `sha256:${hash(JSON.stringify({
      tenantKey, actorId: row.createdByUserId, identityId: row.identityId,
      accountId: row.accountId, accountVersion: row.accountVersion,
      grantId: row.grantId, grantVersion: row.grantVersion,
      sourceHash: contentHash, timezone: row.defaultTimezone, receivedAt,
      ...(conversationContext ? { conversationContext } : {}),
    }))}` as const,
    conversationContext,
  });
}

export async function inspectPersonalGatewaySubject(tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">, expected: PersonalGatewayOperationSubject,
  includeClarificationContext = false) {
  return inspectSubject(tx, expected, ["received", "processing"], includeClarificationContext);
}

/** Separate read-only job lineage inspection. Never accepted by model admission
 * or action dispatch, which keep the pending-only inspector above. */
export async function inspectPersonalResearchSource(tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">, expected: PersonalGatewayOperationSubject) {
  return inspectSubject(tx, expected, ["received", "processing", "completed"]);
}
