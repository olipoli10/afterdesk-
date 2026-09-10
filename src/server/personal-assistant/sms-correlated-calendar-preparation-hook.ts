import "server-only";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { prepareCorrelatedPersonalCalendarReviewInTransaction } from "@/server/model-gateway/personal-intent/correlated-calendar-review";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { temporalCheckedSource, temporalClaimSchema, temporalRegistryTransaction, temporalRequireLive, temporalSha,
  type TemporalRegistryContext, type TemporalRegistryDB } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";

const id = z.string().min(1).max(191), hex = z.string().regex(/^[a-f0-9]{64}$/);
const handledSchema = z.object({ status: z.literal("TEMPORAL_REPLY_HANDLED_NOT_EXECUTED"),
  outcome: z.enum(["CORRELATED_NOT_EXECUTED", "REFUSED"]), receiptId: id, packetHash: hex,
  acknowledgementOperationId: id, sourceCompleted: z.literal(true), acknowledgmentPrepared: z.literal(true),
  executionAuthorized: z.literal(false), providerExecutionPerformed: z.literal(false), automaticRetry: z.literal(false), committed: z.literal(true) }).strict();
const inputSchema = z.object({ enabledAtSourceStart: z.literal(true), claim: temporalClaimSchema,
  sourceRequestHash: hex, result: handledSchema }).strict();
type Input = { enabledAtSourceStart: boolean; claim: z.input<typeof temporalClaimSchema>; sourceRequestHash: string; result: unknown;
  deadlineAt: number; signal?: AbortSignal };
type Parsed = z.infer<typeof inputSchema>;
const sourceResultSchema = z.object({ source: z.literal("TEMPORAL_CLARIFICATION"), reply: z.string().min(1).max(1500),
  temporalClarificationReceiptId: id, packetHash: hex, executionAuthorized: z.literal(false), externalTransportPerformed: z.literal(false), automaticRetry: z.literal(false) });
const ackRequestSchema = z.object({ to: z.string(), from: z.string(), text: z.string().min(1).max(1500), sourceOperationId: id }).strict();
const bindingSchema = z.object({ receiptId: id, receiptWorkspaceId: id, receiptUserId: id, receiptSourceId: id,
  receiptRequestHash: hex, receiptPacketHash: hex, receiptProviderSid: z.string(), outcome: z.literal("ACCEPTED"), sourceClaim: temporalClaimSchema,
  sourceId: id, sourceWorkspaceId: id, sourceUserId: id, sourceKind: z.literal("personal_sms_inbound"), sourceStatus: z.literal("completed"),
  sourceAttempts: z.literal(1), sourceLease: z.null(), sourceRequest: z.unknown(), sourceRequestHash: hex, sourceIdempotencyKey: z.string(),
  sourceCreatedAt: z.date(), sourceResult: sourceResultSchema, sourceAccountId: id,
  ackId: id, ackWorkspaceId: id, ackUserId: id, ackKind: z.literal("sms_outbound"), ackAccountId: id,
  ackIdempotencyKey: z.string(), ackRequest: ackRequestSchema, ackRequestHash: hex }).strict();
const preparedSchema = z.object({ status: z.enum(["CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT", "CORRELATED_CALENDAR_REVIEW_REPLAYED"]),
  reviewId: id, receiptId: id, replay: z.boolean(), committed: z.literal(false), executionAuthorized: z.literal(false),
  approvalAvailable: z.literal(false), preparationProviderCalls: z.literal(0), newBudgetReservations: z.literal(0) });
const base = Object.freeze({ sourceStateChanged: false as const, acknowledgementChanged: false as const,
  executionAuthorized: false as const, approvalAvailable: false as const, providerExecutionPerformed: false as const, automaticRetry: false as const,
  actionable: false as const, freshnessVerified: false as const });
const flags = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED === "true"
  && env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED === "true"
  && env.ENDVERA_EXTERNAL_AUTHORITY_REF === PERSONAL_MODEL_AUTHORITY
  && env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT === "2026-10-10T01:18:26Z";
const unavailable = () => Object.freeze({ ...base, status: "UNAVAILABLE" as const });

/** Read-only binding of an acknowledged consumption. The old lease is an
 * immutable identity pin, never a live processing claim. First lookup MUST NOT
 * lock source/ACK ahead of the producer's canonical conversation namespace. */
async function binding(tx: TemporalRegistryDB, input: Parsed, locked: boolean) {
  const rows = await tx.$queryRawUnsafe<unknown[]>(`SELECT r.id AS "receiptId",r."workspaceId" AS "receiptWorkspaceId",r."userId" AS "receiptUserId",
    r."sourceOperationId" AS "receiptSourceId",r."requestHash" AS "receiptRequestHash",r."packetHash" AS "receiptPacketHash",
    r."providerSid" AS "receiptProviderSid",r.outcome,r."sourceClaim",
    s.id AS "sourceId",s."workspaceId" AS "sourceWorkspaceId",s."createdByUserId" AS "sourceUserId",s.kind AS "sourceKind",s.status AS "sourceStatus",
    s.attempts AS "sourceAttempts",s."leaseUntil" AS "sourceLease",s.request AS "sourceRequest",s."requestHash" AS "sourceRequestHash",
    s."idempotencyKey" AS "sourceIdempotencyKey",(s."createdAt" AT TIME ZONE 'UTC') AS "sourceCreatedAt",s.result AS "sourceResult",s."connectorAccountId" AS "sourceAccountId",
    a.id AS "ackId",a."workspaceId" AS "ackWorkspaceId",a."createdByUserId" AS "ackUserId",a.kind AS "ackKind",a."connectorAccountId" AS "ackAccountId",
    a."idempotencyKey" AS "ackIdempotencyKey",a.request AS "ackRequest",a."requestHash" AS "ackRequestHash"
    FROM "PersonalSmsTemporalClarificationReply" r
    JOIN "PersonalAssistantOperation" s ON s.id=r."sourceOperationId" AND s."workspaceId"=r."workspaceId" AND s."createdByUserId"=r."userId"
    JOIN "PersonalAssistantOperation" a ON a.id=$5 AND a."workspaceId"=r."workspaceId" AND a."createdByUserId"=r."userId"
    WHERE r.id=$1 AND r."workspaceId"=$2 AND r."userId"=$3 AND r."sourceOperationId"=$4
    ${locked ? "FOR SHARE OF r,s,a" : ""}`, input.result.receiptId, input.claim.workspaceId, input.claim.userId, input.claim.operationId, input.result.acknowledgementOperationId);
  if (rows.length !== 1) throw new Error("CORRELATED_CALENDAR_HOOK_BINDING_REQUIRED");
  const row = bindingSchema.parse(rows[0]), actor = { workspaceId: input.claim.workspaceId, userId: input.claim.userId };
  const source = temporalCheckedSource({ id: row.sourceId, request: row.sourceRequest, requestHash: row.sourceRequestHash,
    idempotencyKey: row.sourceIdempotencyKey, createdAt: row.sourceCreatedAt, result: row.sourceResult, connectorAccountId: row.sourceAccountId }, actor);
  const expectedAck = { to: source.from, from: source.to, text: row.sourceResult.reply, sourceOperationId: input.claim.operationId };
  if (row.receiptId !== input.result.receiptId || row.receiptSourceId !== input.claim.operationId || row.sourceId !== input.claim.operationId
    || row.receiptWorkspaceId !== actor.workspaceId || row.sourceWorkspaceId !== actor.workspaceId || row.ackWorkspaceId !== actor.workspaceId
    || row.receiptUserId !== actor.userId || row.sourceUserId !== actor.userId || row.ackUserId !== actor.userId
    || row.receiptRequestHash !== input.sourceRequestHash || row.sourceRequestHash !== input.sourceRequestHash
    || row.receiptPacketHash !== input.result.packetHash || row.receiptProviderSid !== source.messageSid
    || canonicalJson(row.sourceClaim) !== canonicalJson(input.claim)
    || row.sourceResult.temporalClarificationReceiptId !== input.result.receiptId || row.sourceResult.packetHash !== input.result.packetHash
    || row.ackId !== input.result.acknowledgementOperationId || row.ackAccountId !== row.sourceAccountId
    || row.ackIdempotencyKey !== `reply:${input.claim.operationId}` || canonicalJson(row.ackRequest) !== canonicalJson(expectedAck)
    || row.ackRequestHash !== temporalSha(JSON.stringify(expectedAck))) throw new Error("CORRELATED_CALENDAR_HOOK_BINDING_CHANGED");
  // Snapshot primitives now; no caller/DB object or mutable Date crosses an await.
  return canonicalJson({ receiptId: row.receiptId, claim: row.sourceClaim, packetHash: row.receiptPacketHash,
    sourceRequestHash: row.sourceRequestHash, receivedAt: source.receivedAt, sourceAccountId: row.sourceAccountId,
    sourceResult: row.sourceResult, ackId: row.ackId, ackRequestHash: row.ackRequestHash });
}

/** Trusted worker seam only, not a public receipt preparation API. It never
 * changes a completed source or ACK. No retry, recovery scan or detached work.
 * Producer exceptions can include an unknown commit outcome: do not infer a
 * rollback from a generic Prisma rejection. */
export async function prepareCorrelatedCalendarAfterCommittedSms(raw: Input, env: ConnectorEnvironment = process.env) {
  if (raw.enabledAtSourceStart !== true || !flags(env)) return Object.freeze({ ...base, status: "SKIPPED" as const });
  let input: Parsed, c: TemporalRegistryContext;
  const startedAt = performance.now();
  try {
    if (!Number.isFinite(raw.deadlineAt)) return unavailable();
    c = Object.freeze({ deadlineAt: Math.min(raw.deadlineAt, Date.now() + 5000), signal: raw.signal });
    input = inputSchema.parse({ enabledAtSourceStart: raw.enabledAtSourceStart, claim: raw.claim, sourceRequestHash: raw.sourceRequestHash, result: raw.result });
    if (input.result.outcome === "REFUSED") return Object.freeze({ ...base, status: "SKIPPED" as const });
  } catch { return unavailable(); }
  const current = () => flags(env) && !c.signal?.aborted && Date.now() < c.deadlineAt && performance.now() - startedAt < 5000;
  const live = () => { temporalRequireLive(c, env); if (!current()) throw new Error("CORRELATED_CALENDAR_HOOK_UNAVAILABLE"); };
  let producerEntered = false;
  try {
    live();
    const prepared = await prisma.$transaction(async tx => {
      await temporalRegistryTransaction(tx, c, env); live();
      const before = await binding(tx, input, false); live();
      producerEntered = true;
      const result = preparedSchema.parse(await prepareCorrelatedPersonalCalendarReviewInTransaction(tx, { enabled: true,
        actor: { workspaceId: input.claim.workspaceId, userId: input.claim.userId },
        subject: { kind: "personal_sms_temporal_receipt", receiptId: input.result.receiptId } }, env, c)); live();
      if (result.receiptId !== input.result.receiptId || result.replay !== (result.status === "CORRELATED_CALENDAR_REVIEW_REPLAYED"))
        throw new Error("CORRELATED_CALENDAR_HOOK_PREPARATION_CHANGED");
      const after = await binding(tx, input, true); live();
      if (before !== after) throw new Error("CORRELATED_CALENDAR_HOOK_BINDING_CHANGED");
      return Object.freeze({ reviewId: result.reviewId, replay: result.replay });
    }, { isolationLevel: "Serializable", maxWait: Math.max(1, Math.min(500, c.deadlineAt - Date.now())),
      timeout: Math.max(1, Math.min(5000, c.deadlineAt - Date.now())) });
    // An acknowledged DB commit remains a fact after deadline/abort/revocation.
    // This metadata is internal; never expose it as fresh approval or validity.
    // expiredNotActionable is a local deadline/flag signal only. Its false value
    // does NOT re-certify question TTL or authority after commit.
    return Object.freeze({ ...base, status: "COMMITTED" as const, committed: true as const,
      reviewId: prepared.reviewId, replay: prepared.replay, expiredNotActionable: !current() });
  } catch {
    return producerEntered ? Object.freeze({ ...base, status: "OUTCOME_UNKNOWN" as const }) : unavailable();
  }
}
