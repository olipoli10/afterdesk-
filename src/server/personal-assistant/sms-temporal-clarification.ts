import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createPersonalIntentInput, inspectPersonalIntentCandidate } from "@/server/model-gateway/personal-intent/contract";
import { resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";
import { formatPersonalModelReviewMessage, PERSONAL_MODEL_REVIEW_MESSAGE_VERSION } from "./model-review-message";

// Pure correlation only. Every identity, grant, receipt and lifecycle assertion
// must be reloaded by a future authoritative DB adapter; this module cannot verify it.
const id = z.string().min(1).max(191), hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime().refine(value => new Date(value).toISOString() === value);
const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const version = z.number().int().positive();
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
const fingerprint = (value: unknown) => sha(JSON.stringify(canonical(value)));
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export const smsTemporalClarificationBindingSchema = z.object({
  workspaceId: id, userId: id, memberId: id, memberRole: z.literal("owner"), memberRevision: instant, workspaceRevision: instant,
  identityId: id, identityRevision: instant, verifiedIdentity: z.literal(true), ownerNumber: phone, endveraNumber: phone,
  smsAccountId: id, smsAccountVersion: version, smsAccountKeyHash: hash, smsInboundGrantId: id, smsInboundGrantVersion: version,
  modelAccountId: id, modelAccountVersion: version, modelGrantId: id, modelGrantVersion: version,
  calendarAccountId: id, calendarAccountVersion: version, calendarWriteGrantId: id, calendarWriteGrantVersion: version,
  timezone: z.string().min(1).max(100),
}).strict();
export type SmsTemporalClarificationBinding = z.infer<typeof smsTemporalClarificationBindingSchema>;
const sourceSchema = z.object({
  operationId: id, workspaceId: id, userId: id, identityId: id, verifiedIngress: z.literal(true),
  accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i), messageSid: z.string().regex(/^SM[0-9a-f]{32}$/i),
  from: phone, to: phone, body: z.string().min(1).max(10000), requestHash: hash, receivedAt: instant,
}).strict();
export type SmsTemporalClarificationSource = z.infer<typeof sourceSchema>;
const preparationSchema = z.object({
  schemaVersion: z.literal(1), clarificationId: z.string().uuid(), binding: smsTemporalClarificationBindingSchema,
  source: sourceSchema, modelChildOperationId: id, modelGatewayOperationId: id,
  rawProposal: z.string().min(1).max(65536), actionId: id, createdAt: instant, expiresAt: instant,
}).strict();
export type SmsTemporalClarificationPreparation = z.infer<typeof preparationSchema>;
const preparedSchema = preparationSchema.extend({
  phase: z.literal("PREPARED_UNSENT"), reason: z.enum(["AMBIGUOUS_TIME", "MISSING_END_TIME"]),
  question: z.string().min(1).max(500), proposalHash: hash, bindingHash: hash, questionHash: hash, preparedHash: hash,
  wireText: z.string().min(1).max(1500), wireFormatterVersion: z.literal(PERSONAL_MODEL_REVIEW_MESSAGE_VERSION), wireTextHash: hash,
  executionAuthorized: z.literal(false), sourceAuthority: z.literal("NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT"),
}).strict();
export type PreparedSmsTemporalClarification = z.infer<typeof preparedSchema>;
const receiptSchema = z.object({
  outboundOperationId: id, requestHash: hash, acceptedProviderSid: z.string().regex(/^SM[0-9a-f]{32}$/i),
  acceptedAt: instant, acceptedByProvider: z.literal(true), deliveryConfirmed: z.literal(false),
}).strict();
const waitingSchema = z.object({ phase: z.literal("WAITING"), prepared: preparedSchema, questionReceipt: receiptSchema, waitingHash: hash }).strict();
export type WaitingSmsTemporalClarification = z.infer<typeof waitingSchema>;

function inspectSource(value: SmsTemporalClarificationSource, binding: SmsTemporalClarificationBinding) {
  if (value.workspaceId !== binding.workspaceId || value.userId !== binding.userId || value.identityId !== binding.identityId
    || value.from !== binding.ownerNumber || value.to !== binding.endveraNumber || value.from === value.to
    || sha(value.accountSid) !== binding.smsAccountKeyHash) throw new Error("SMS_CLARIFICATION_SOURCE_BINDING_CHANGED");
  const envelope = { accountSid: value.accountSid, messageSid: value.messageSid, from: value.from, to: value.to, body: value.body };
  if (sha(JSON.stringify(envelope)) !== value.requestHash) throw new Error("SMS_CLARIFICATION_SOURCE_HASH_CHANGED");
  // Existing source-input validation also refuses invalid Unicode, without rewriting its text.
  createPersonalIntentInput(value.operationId, value.body);
}

export function prepareSmsTemporalClarification(untrusted: SmsTemporalClarificationPreparation): Readonly<PreparedSmsTemporalClarification> {
  const input = preparationSchema.parse(untrusted), { source, binding } = input;
  inspectSource(source, binding);
  const lifetime = Date.parse(input.expiresAt) - Date.parse(input.createdAt);
  if (lifetime <= 0 || lifetime > 600000 || Date.parse(source.receivedAt) > Date.parse(input.createdAt)) throw new Error("SMS_CLARIFICATION_LIFETIME_INVALID");
  const modelInput = createPersonalIntentInput(source.operationId, source.body);
  const inspected = inspectPersonalIntentCandidate(input.rawProposal, modelInput);
  if (inspected.proposal.actions.length !== 1 || inspected.proposal.actions[0].id !== input.actionId || inspected.proposal.actions[0].dependsOn.length) {
    throw new Error("SMS_CLARIFICATION_SINGLE_ACTION_REQUIRED");
  }
  const temporal = resolvePersonalCalendarTemporal(modelInput, input.rawProposal, input.actionId, { receivedAt: source.receivedAt, timezone: binding.timezone });
  if (temporal.status !== "CLARIFY" || !["AMBIGUOUS_TIME", "MISSING_END_TIME"].includes(temporal.reason)) throw new Error("SMS_CLARIFICATION_TEMPORAL_QUESTION_REQUIRED");
  const wireText = formatPersonalModelReviewMessage({ status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [{ status: "CLARIFY", question: temporal.question }] });
  const base = { ...input, phase: "PREPARED_UNSENT" as const, reason: temporal.reason as "AMBIGUOUS_TIME" | "MISSING_END_TIME",
    question: temporal.question, proposalHash: sha(input.rawProposal), bindingHash: fingerprint(binding),
    questionHash: fingerprint({ sourceOperationId: source.operationId, actionId: input.actionId, question: temporal.question }),
    wireText, wireFormatterVersion: PERSONAL_MODEL_REVIEW_MESSAGE_VERSION as typeof PERSONAL_MODEL_REVIEW_MESSAGE_VERSION, wireTextHash: sha(wireText),
    executionAuthorized: false as const, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const };
  return freeze({ ...base, preparedHash: fingerprint(base) });
}
function reinspectPrepared(untrusted: PreparedSmsTemporalClarification) {
  const value = preparedSchema.parse(untrusted);
  const fresh = prepareSmsTemporalClarification({ schemaVersion: value.schemaVersion, clarificationId: value.clarificationId,
    binding: value.binding, source: value.source, modelChildOperationId: value.modelChildOperationId, modelGatewayOperationId: value.modelGatewayOperationId,
    rawProposal: value.rawProposal, actionId: value.actionId, createdAt: value.createdAt, expiresAt: value.expiresAt });
  if (fingerprint(value) !== fingerprint(fresh)) throw new Error("SMS_CLARIFICATION_PREPARED_CHANGED");
  return fresh;
}
/** Exact outbound request for a FUTURE existing-outbox adapter. Calling this sends nothing. */
export function smsTemporalClarificationQuestionRequest(prepared: PreparedSmsTemporalClarification) {
  const p = reinspectPrepared(prepared);
  return freeze({ to: p.binding.ownerNumber, from: p.binding.endveraNumber, text: p.wireText, sourceOperationId: p.source.operationId });
}
/** Receipt data is asserted by the future DB reader, not authenticated here. */
export function markSmsTemporalClarificationAsked(prepared: PreparedSmsTemporalClarification, untrustedReceipt: z.infer<typeof receiptSchema>, now: string): Readonly<WaitingSmsTemporalClarification> {
  const p = reinspectPrepared(prepared), receipt = receiptSchema.parse(untrustedReceipt), clock = Date.parse(instant.parse(now));
  if (receipt.requestHash !== sha(JSON.stringify(smsTemporalClarificationQuestionRequest(p))) || receipt.outboundOperationId === p.source.operationId
    || receipt.acceptedProviderSid === p.source.messageSid || Date.parse(receipt.acceptedAt) < Date.parse(p.createdAt)
    || Date.parse(receipt.acceptedAt) > clock || clock >= Date.parse(p.expiresAt)) throw new Error("SMS_CLARIFICATION_QUESTION_RECEIPT_INVALID");
  const base = { phase: "WAITING" as const, prepared: p, questionReceipt: receipt };
  return freeze({ ...base, waitingHash: fingerprint(base) });
}
const replySchema = z.object({ source: sourceSchema, attempt: z.literal(1), status: z.literal("processing"), leaseUntil: instant, alreadyConsumed: z.literal(false) }).strict();
export type SmsTemporalClarificationReply = z.infer<typeof replySchema>;
const correlationSchema = z.object({
  waiting: waitingSchema, currentBinding: smsTemporalClarificationBindingSchema,
  currentPhase: z.enum(["WAITING", "CONSUMED", "EXPIRED", "REFUSED"]), activeQuestionCount: z.number().int().nonnegative().max(25),
  reply: replySchema, now: instant,
}).strict();
/** Shared closed routing grammar, never a date resolver or action authority.
 * Keep the original normalization/regex/bounds identical to the correlator. */
export function classifySmsTemporalTimeLiteral(body: string) {
  if (typeof body !== "string") return Object.freeze({ status: "NOT_TIME_LITERAL" as const });
  const normalized = body.trim().replace(/[\u00a0\u202f]/g, " ");
  const colon = /^(\d{2}):(\d{2})$/.exec(normalized);
  const french = /^(\d{1,2})\s*h(?:\s*(\d{2}))?$/.exec(normalized);
  if (!colon && !french) return Object.freeze({ status: "NOT_TIME_LITERAL" as const });
  const hour = Number((colon ?? french)![1]), minute = Number((colon ?? french)![2] ?? 0);
  if (hour > 23 || minute > 59 || !colon && hour >= 1 && hour <= 12) return Object.freeze({ status: "AMBIGUOUS_OR_INVALID_TIME_LITERAL" as const });
  return Object.freeze({ status: "EXACT_TIME_LITERAL" as const, hour, minute });
}
/** Preserve the existing correlator's return shape and exact refusal codes. */
function explicitTimeLiteral(body: string) {
  const classified = classifySmsTemporalTimeLiteral(body);
  if (classified.status === "NOT_TIME_LITERAL") throw new Error("SMS_CLARIFICATION_EXPLICIT_TIME_REQUIRED");
  if (classified.status === "AMBIGUOUS_OR_INVALID_TIME_LITERAL") throw new Error("SMS_CLARIFICATION_AMBIGUOUS_OR_INVALID_TIME");
  return { hour: classified.hour, minute: classified.minute };
}

export function correlateSmsTemporalClarification(untrusted: z.infer<typeof correlationSchema>) {
  const input = correlationSchema.parse(untrusted), { waiting, currentBinding, reply } = input;
  const p = reinspectPrepared(waiting.prepared), clock = Date.parse(input.now);
  const expected = markSmsTemporalClarificationAsked(p, waiting.questionReceipt, input.now);
  if (fingerprint(waiting) !== fingerprint(expected)) throw new Error("SMS_CLARIFICATION_WAITING_CHANGED");
  if (input.currentPhase !== "WAITING" || input.activeQuestionCount !== 1) throw new Error("SMS_CLARIFICATION_NO_UNIQUE_PENDING_QUESTION");
  if (fingerprint(currentBinding) !== p.bindingHash) throw new Error("SMS_CLARIFICATION_CONTEXT_CHANGED");
  inspectSource(reply.source, currentBinding);
  if (reply.source.operationId === p.source.operationId || reply.source.operationId === waiting.questionReceipt.outboundOperationId
    || reply.source.messageSid === p.source.messageSid || reply.source.messageSid === waiting.questionReceipt.acceptedProviderSid) throw new Error("SMS_CLARIFICATION_NEW_SOURCE_REQUIRED");
  const received = Date.parse(reply.source.receivedAt);
  if (received <= Date.parse(waiting.questionReceipt.acceptedAt) || received > clock || received >= Date.parse(p.expiresAt)
    || Date.parse(reply.leaseUntil) <= clock) throw new Error("SMS_CLARIFICATION_REPLY_TIME_INVALID");
  return temporalCorrelationEvidence(waiting, p, reply.source, reply.leaseUntil);
}

// Phase-independent evidence serialization. A historical receipt can reproduce
// these bytes without representing its already completed source as processing.
function temporalCorrelationEvidence(waiting: WaitingSmsTemporalClarification, p: PreparedSmsTemporalClarification,
  replySource: SmsTemporalClarificationSource, historicalLeaseUntil: string) {
  const literal = explicitTimeLiteral(replySource.body);
  return freeze({ status: "CORRELATED_NOT_RESOLVED_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
    providerExecutionPerformed: false as const, preview: null, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const,
    clarificationId: p.clarificationId, waitingHash: waiting.waitingHash, proposalHash: p.proposalHash, questionHash: p.questionHash,
    wireTextHash: p.wireTextHash, wireFormatterVersion: p.wireFormatterVersion,
    question: p.question, reason: p.reason, actionId: p.actionId,
    anchorReceivedAt: p.source.receivedAt, timezone: p.binding.timezone,
    sources: [p.source, replySource],
    citations: [{ sourceOperationId: p.source.operationId, start: 0, end: p.source.body.length, quote: p.source.body },
      { sourceOperationId: replySource.operationId, start: 0, end: replySource.body.length, quote: replySource.body }],
    explicitReplyTime: literal,
    requiredAtomicTransition: { fromPhase: "WAITING" as const, toPhase: "CONSUMED" as const, expectedWaitingHash: waiting.waitingHash,
      replyOperationId: replySource.operationId, replyMessageSid: replySource.messageSid, replyRequestHash: replySource.requestHash,
      replyAttempt: 1 as const, replyLeaseUntil: historicalLeaseUntil },
    persistencePerformed: false as const, temporalResolutionPerformed: false as const,
  });
}

const completedSourceSchema = z.object({ source: sourceSchema, status: z.literal("completed"), attempt: z.literal(1), leaseUntil: z.null() }).strict();
const historicalClaimSchema = z.object({ operationId: id, workspaceId: id, userId: id, attempt: z.literal(1), leaseUntil: instant }).strict();
const durableCorrelationSchema = z.object({
  waiting: waitingSchema, currentBinding: smsTemporalClarificationBindingSchema, questionPhase: z.literal("CONSUMED"), consumedReplyId: id,
  receipt: z.object({ id, outcome: z.literal("ACCEPTED"), receivedAt: instant, createdAt: instant, sourceClaim: historicalClaimSchema }).strict(),
  original: completedSourceSchema, answer: completedSourceSchema, now: instant,
}).strict();
export type DurableSmsTemporalCorrelationInput = z.infer<typeof durableCorrelationSchema>;

/** Inspects asserted durable facts, not DB authentication. Neither live phase,
 * processing status nor a fresh lease is manufactured. Historical transition
 * fields are reproduced only as evidence for comparison to the stored packet. */
export function inspectDurableSmsTemporalCorrelation(untrusted: DurableSmsTemporalCorrelationInput) {
  const input = durableCorrelationSchema.parse(untrusted), { waiting, currentBinding, receipt, original, answer } = input;
  const p = reinspectPrepared(waiting.prepared), clock = Date.parse(input.now);
  const expected = markSmsTemporalClarificationAsked(p, waiting.questionReceipt, input.now);
  if (fingerprint(waiting) !== fingerprint(expected)) throw new Error("SMS_CLARIFICATION_WAITING_CHANGED");
  if (fingerprint(currentBinding) !== p.bindingHash) throw new Error("SMS_CLARIFICATION_CONTEXT_CHANGED");
  if (receipt.id !== input.consumedReplyId || fingerprint(original.source) !== fingerprint(p.source)) throw new Error("SMS_DURABLE_RECEIPT_SOURCE_CHANGED");
  inspectSource(answer.source, currentBinding);
  if (answer.source.operationId === p.source.operationId || answer.source.operationId === waiting.questionReceipt.outboundOperationId
    || answer.source.messageSid === p.source.messageSid || answer.source.messageSid === waiting.questionReceipt.acceptedProviderSid) throw new Error("SMS_CLARIFICATION_NEW_SOURCE_REQUIRED");
  if (receipt.sourceClaim.operationId !== answer.source.operationId || receipt.sourceClaim.userId !== answer.source.userId
    || receipt.sourceClaim.workspaceId !== answer.source.workspaceId || receipt.receivedAt !== answer.source.receivedAt) throw new Error("SMS_DURABLE_RECEIPT_CLAIM_CHANGED");
  const received = Date.parse(receipt.receivedAt), recorded = Date.parse(receipt.createdAt);
  if (received <= Date.parse(waiting.questionReceipt.acceptedAt) || recorded < received || recorded > clock
    || recorded >= Date.parse(p.expiresAt) || Date.parse(receipt.sourceClaim.leaseUntil) <= recorded) throw new Error("SMS_DURABLE_RECEIPT_TIME_INVALID");
  const historicalCorrelation = temporalCorrelationEvidence(waiting, p, answer.source, receipt.sourceClaim.leaseUntil);
  return freeze({ status: "DURABLE_RECEIPT_CORRELATION_INSPECTED_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
    persistencePerformed: false as const, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const,
    prepared: p, receiptId: receipt.id, historicalCorrelation });
}
