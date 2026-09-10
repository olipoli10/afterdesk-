import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalJson } from "../evidence";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { loadCorrelatedPersonalReceiptSubject } from "./correlated-receipt-subject";
import { inspectCorrelatedCalendarReferenceProof } from "./correlated-calendar-proof";
import { personalCorrelatedCalendarRequestId } from "./correlated-calendar-id";
import { personalCalendarDraftSchema } from "@/server/personal-assistant/calendar-actions";
import { temporalActorSchema, temporalRegistryClock, temporalRegistryTransaction, temporalRequireLive, type TemporalRegistryContext, type TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "@/server/personal-assistant/google-client";

const id = z.string().min(1).max(191), hex = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = z.object({ enabled: z.literal(true), actor: temporalActorSchema, reviewId: id }).strict();
export type CorrelatedPersonalCalendarReviewInput = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const storedInstant = z.date().transform(value => value.toISOString()); // Copy the epoch before any later await.
const currentStatus = z.enum(["pending", "processing", "completed", "uncertain", "refused"]);
const recordSchema = z.object({ id, workspaceId: id, userId: id, receiptId: id, clarificationId: id,
  originalSourceOperationId: id, replySourceOperationId: id, modelChildOperationId: id, modelGatewayOperationId: id, reviewActionId: id,
  calendarOperationId: id, calendarRequestId: z.string().uuid(), calendarRequestHash: hex, connectorAccountId: id, accountVersion: z.number().int().positive(),
  packetHash: hex, reviewVersion: z.literal("personal-sms-correlated-calendar-review-v1"), proof: z.unknown(), proofHash: hex,
  authorityRef: z.literal(PERSONAL_MODEL_AUTHORITY), pilotExpiresAt: storedInstant, preparationExpiresAt: storedInstant, createdAt: storedInstant }).strict();
const requestSchema = personalCalendarDraftSchema.extend({ accountVersion: z.number().int().positive(), requestId: z.string().uuid() }).strict();
const operationSchema = z.object({ id, workspaceId: id, createdByUserId: id, connectorAccountId: id, kind: z.literal("calendar_write"), status: currentStatus,
  request: z.unknown(), requestHash: hex, idempotencyKey: z.string().max(450), correlatedTemporalReceiptId: id,
  sourcePersonalOperationId: z.null(), modelGatewayOperationId: z.null(), budgetId: z.null(), reservedCadMicros: z.null(),
  linkedReviewId: id, linkedReceiptId: id, linkedWorkspaceId: id, linkedUserId: id }).strict();
const sourceId = id.refine(value => value.trim() === value);
const sourceSchema = z.object({ operationId: sourceId, requestHash: hex, text: z.string().min(1).max(10_000), receivedAt: instant }).strict();
const citationSchema = z.object({ sourceOperationId: sourceId, requestHash: hex, start: z.number().int().min(0).max(10_000),
  end: z.number().int().min(1).max(10_000), quote: z.string().min(1).max(10_000) }).strict();
const evidenceSchema = z.object({ version: z.literal("personal-correlated-calendar-local-preview-v1"), approvalAvailable: z.literal(false), provenance: z.literal("UNKNOWN"),
  sources: z.tuple([sourceSchema.extend({ role: z.literal("ORIGINAL_REQUEST") }).strict(), sourceSchema.extend({ role: z.literal("CLARIFICATION_REPLY") }).strict()]),
  citations: z.object({ title: citationSchema, originalStart: citationSchema, originalEnd: citationSchema, answer: citationSchema }).strict(),
  anchorReceivedAt: instant, clarifiedSlot: z.enum(["START", "END"]),
  draft: z.object({ title: z.string().min(1).max(240).refine(value => value.trim() === value), startsAt: instant, endsAt: instant, timezone: z.string().min(1).max(80) }).strict(),
}).strict();
const columns = `id,"workspaceId","userId","receiptId","clarificationId","originalSourceOperationId","replySourceOperationId",
  "modelChildOperationId","modelGatewayOperationId","reviewActionId","calendarOperationId","calendarRequestId","calendarRequestHash",
  "connectorAccountId","accountVersion","packetHash","reviewVersion",proof,"proofHash","authorityRef",
  ("pilotExpiresAt" AT TIME ZONE 'UTC') AS "pilotExpiresAt",("preparationExpiresAt" AT TIME ZONE 'UTC') AS "preparationExpiresAt",
  ("createdAt" AT TIME ZONE 'UTC') AS "createdAt"`;
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function snapshot(context: TemporalRegistryContext) {
  if (!Number.isFinite(context.deadlineAt)) throw new Error("CORRELATED_CALENDAR_READ_DEADLINE_REQUIRED");
  return Object.freeze({ deadlineAt: Math.min(context.deadlineAt, Date.now() + 5000), signal: context.signal });
}
function live(env: ConnectorEnvironment, context: TemporalRegistryContext) {
  temporalRequireLive(context, env);
  if (!enabled(env) || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z")
    throw new Error("CORRELATED_CALENDAR_READ_DISABLED_OR_PILOT_CHANGED");
}
function refused(): never { throw new Error("CORRELATED_CALENDAR_READ_CHANGED_OR_UNAVAILABLE"); }
function wholeBoundary(text: string, offset: number) {
  return offset <= 0 || offset >= text.length || !(text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff
    && text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff);
}
function checkEvidence(value: z.infer<typeof evidenceSchema>) {
  const [original, answer] = value.sources;
  if (original.operationId === answer.operationId || value.anchorReceivedAt !== original.receivedAt || answer.receivedAt <= original.receivedAt
    || value.draft.endsAt <= value.draft.startsAt || value.draft.title !== value.citations.title.quote.trim()) refused();
  for (const key of ["title", "originalStart", "originalEnd", "answer"] as const) {
    const source = key === "answer" ? answer : original, quote = value.citations[key];
    if (quote.sourceOperationId !== source.operationId || quote.requestHash !== source.requestHash || quote.start >= quote.end || quote.end > source.text.length
      || !wholeBoundary(source.text, quote.start) || !wholeBoundary(source.text, quote.end) || source.text.slice(quote.start, quote.end) !== quote.quote) refused();
  }
}

/** One item, read-only. The caller owns a bounded SERIALIZABLE transaction.
 * The unchanged receipt loader deliberately refuses expired/revoked evidence.
 * No preparer, producer, approval, credential or transport is invoked. */
export async function loadCorrelatedPersonalCalendarReviewInTransaction(tx: TemporalRegistryDB, raw: CorrelatedPersonalCalendarReviewInput,
  env: ConnectorEnvironment, context: TemporalRegistryContext) {
  if (!enabled(env) || raw.enabled !== true) return disabled();
  const input = inputSchema.parse(raw), c = snapshot(context);
  if ("$transaction" in tx) throw new Error("CORRELATED_CALENDAR_READ_CALLER_TRANSACTION_REQUIRED");
  live(env, c);
  // Bound even discovery under a caller-owned transaction with a longer timeout.
  await temporalRegistryTransaction(tx, c, env); live(env, c);
  const discoveries = await tx.$queryRawUnsafe<unknown[]>(`SELECT "receiptId" FROM "PersonalSmsCorrelatedCalendarReview"
    WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3`, input.reviewId, input.actor.workspaceId, input.actor.userId); live(env, c);
  if (discoveries.length !== 1) refused();
  const discovered = z.object({ receiptId: id }).strict().parse(discoveries[0]);
  // No calendar/relation row lock is acquired ahead of the canonical namespace.
  const subject = await loadCorrelatedPersonalReceiptSubject(tx, { enabled: true, actor: input.actor,
    subject: { kind: "personal_sms_temporal_receipt", receiptId: discovered.receiptId } }, env, c); live(env, c);
  if (subject.status !== "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED"
    || subject.actor.userId !== input.actor.userId || subject.actor.workspaceId !== input.actor.workspaceId
    || subject.subject.receiptId !== discovered.receiptId) refused();
  const reference = subject.reference, pins = subject.preparationContext;
  const inspectedAt = instant.parse(subject.inspectedAt), expiry = Math.min(Date.parse(pins.questionExpiresAt), Date.parse(pins.pilotExpiresAt));
  if (!Number.isFinite(expiry) || Date.parse(inspectedAt) >= expiry || reference.receiptId !== discovered.receiptId
    || reference.requestId !== personalCorrelatedCalendarRequestId(discovered.receiptId)
    || reference.packetHash !== subject.proof.packetHash || reference.proof.inspectedReceiptProofHash !== subject.proof.proofHash) refused();
  const freshProof = inspectCorrelatedCalendarReferenceProof(reference.proof, reference.proofHash);
  const request = requestSchema.parse({ ...freshProof.proof.draft, accountVersion: pins.accountVersion, requestId: reference.requestId });
  const requestHash = sha(JSON.stringify(request));
  const rows = await tx.$queryRawUnsafe<unknown[]>(`SELECT ${columns} FROM "PersonalSmsCorrelatedCalendarReview"
    WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 FOR SHARE`, input.reviewId, input.actor.workspaceId, input.actor.userId); live(env, c);
  if (rows.length !== 1) refused();
  const row = recordSchema.parse(rows[0]);
  inspectCorrelatedCalendarReferenceProof(row.proof, row.proofHash);
  const expected = { workspaceId: input.actor.workspaceId, userId: input.actor.userId, receiptId: discovered.receiptId,
    clarificationId: pins.clarificationId, originalSourceOperationId: pins.originalSourceOperationId, replySourceOperationId: pins.replySourceOperationId,
    modelChildOperationId: pins.modelChildOperationId, modelGatewayOperationId: pins.modelGatewayOperationId, reviewActionId: pins.reviewActionId,
    calendarRequestId: reference.requestId, calendarRequestHash: requestHash, connectorAccountId: pins.connectorAccountId, accountVersion: pins.accountVersion,
    packetHash: reference.packetHash, reviewVersion: "personal-sms-correlated-calendar-review-v1", proof: freshProof.proof, proofHash: freshProof.proofHash,
    authorityRef: pins.authorityRef, pilotExpiresAt: pins.pilotExpiresAt, preparationExpiresAt: new Date(expiry).toISOString() };
  const { id: reviewId, calendarOperationId, createdAt, ...recorded } = row;
  if (reviewId !== input.reviewId || canonicalJson(recorded) !== canonicalJson(expected) || Date.parse(createdAt) >= expiry) refused();
  const operations = await tx.$queryRawUnsafe<unknown[]>(`SELECT o.id,o."workspaceId",o."createdByUserId",o."connectorAccountId",o.kind,o.status,
    o.request,o."requestHash",o."idempotencyKey",o."correlatedTemporalReceiptId",o."sourcePersonalOperationId",o."modelGatewayOperationId",o."budgetId",o."reservedCadMicros",
    r.id AS "linkedReviewId",r."receiptId" AS "linkedReceiptId",r."workspaceId" AS "linkedWorkspaceId",r."userId" AS "linkedUserId"
    FROM "PersonalAssistantOperation" o JOIN "PersonalSmsCorrelatedCalendarReview" r ON r."calendarOperationId"=o.id
    WHERE o.id=$1 FOR SHARE OF o,r`, calendarOperationId); live(env, c);
  if (operations.length !== 1) refused();
  const operation = operationSchema.parse(operations[0]);
  const currentRequest = requestSchema.parse(operation.request);
  if (operation.id !== calendarOperationId || operation.workspaceId !== input.actor.workspaceId || operation.createdByUserId !== input.actor.userId
    || operation.connectorAccountId !== pins.connectorAccountId || operation.correlatedTemporalReceiptId !== discovered.receiptId
    || operation.linkedReviewId !== reviewId || operation.linkedReceiptId !== discovered.receiptId
    || operation.linkedWorkspaceId !== input.actor.workspaceId || operation.linkedUserId !== input.actor.userId
    || operation.idempotencyKey !== `personal-calendar:${input.actor.workspaceId}:${reference.requestId}`
    || operation.requestHash !== requestHash || sha(JSON.stringify(currentRequest)) !== requestHash
    || canonicalJson(operation.request) !== canonicalJson(request)) refused();
  const resolution = subject.proof.resolution;
  const evidence = evidenceSchema.parse({ version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
    sources: resolution.sources.map((source, index) => ({ role: index === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY",
      operationId: source.operationId, requestHash: source.requestHash, text: source.body, receivedAt: source.receivedAt })),
    citations: resolution.citations, anchorReceivedAt: resolution.anchorReceivedAt, clarifiedSlot: resolution.evidence.slot, draft: freshProof.proof.draft });
  checkEvidence(evidence);
  if (Date.parse(createdAt) < Date.parse(evidence.sources[1].receivedAt)) refused();
  const finalNow = await temporalRegistryClock(tx); live(env, c);
  if (finalNow.getTime() < Date.parse(inspectedAt) || Date.parse(createdAt) > finalNow.getTime() || finalNow.getTime() >= expiry) refused();
  return freeze({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED" as const, committed: false as const,
    review: { version: "personal-correlated-calendar-review-v1" as const, reviewId, inspectedAt: finalNow.toISOString(), preparedAt: createdAt,
      preparationExpiresAt: row.preparationExpiresAt, currentStatus: operation.status, readOnly: true as const, approvalAvailable: false as const,
      executionAuthorized: false as const, semanticInterpretationVerified: false as const, evidence } });
}

/** Only a resolved transaction reports a known successful read. No retry. */
export async function readCorrelatedPersonalCalendarReview(raw: CorrelatedPersonalCalendarReviewInput, env: ConnectorEnvironment = process.env,
  context: TemporalRegistryContext = { deadlineAt: Date.now() + 5000 }) {
  if (!enabled(env) || raw.enabled !== true) return disabled();
  const input = inputSchema.parse(raw), c = snapshot(context); live(env, c);
  const provisional = await prisma.$transaction(tx => loadCorrelatedPersonalCalendarReviewInTransaction(tx, input, env, c),
    { isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
  live(env, c);
  if (provisional.status === "DISABLED") return provisional;
  return freeze({ ...provisional, committed: true as const });
}
