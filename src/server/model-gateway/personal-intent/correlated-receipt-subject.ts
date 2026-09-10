import "server-only";
import { z } from "zod";
import { canonicalJson } from "../evidence";
import { temporalActorSchema, temporalClaimSchema, temporalCheckedSource, temporalRegistryClock, temporalRegistryTransaction, temporalRequireLive,
  type TemporalRegistryContext, type TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { temporalRegistryLockProof, temporalRegistryCurrentProof } from "@/server/personal-assistant/sms-temporal-clarification-proof";
import { inspectCorrelatedPersonalReceiptProof } from "./correlated-receipt-proof";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import type { ConnectorEnvironment } from "@/server/personal-assistant/google-client";

const id = z.string().min(1).max(191), hex = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = z.object({ enabled: z.literal(true), actor: temporalActorSchema,
  subject: z.object({ kind: z.literal("personal_sms_temporal_receipt"), receiptId: id }).strict() }).strict();
export type CorrelatedPersonalReceiptSubjectInput = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
const receiptSchema = z.object({ id, clarificationId: id, workspaceId: id, userId: id, sourceOperationId: id,
  providerSid: z.string().regex(/^SM[0-9a-f]{32}$/i), requestHash: hex, sourceClaim: temporalClaimSchema,
  outcome: z.literal("ACCEPTED"), packet: z.unknown(), packetHash: hex, receivedAt: z.date(), createdAt: z.date() }).strict();
const sourceSchema = z.object({ id, workspaceId: id, createdByUserId: id, connectorAccountId: id, kind: z.literal("personal_sms_inbound"),
  status: z.literal("completed"), attempts: z.literal(1), leaseUntil: z.null(), request: z.unknown(), result: z.unknown(),
  requestHash: hex, idempotencyKey: z.string(), createdAt: z.date() }).strict();
const receiptColumns = `id,"clarificationId","workspaceId","userId","sourceOperationId","providerSid","requestHash","sourceClaim",outcome,packet,"packetHash",
  ("receivedAt" AT TIME ZONE 'UTC') AS "receivedAt",("createdAt" AT TIME ZONE 'UTC') AS "createdAt"`;
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Explicit OFF read-only subject loader. Caller owns a bounded SERIALIZABLE
 * transaction. No source phase changes, draft, budget or model/provider call. */
export async function loadCorrelatedPersonalReceiptSubject(tx: TemporalRegistryDB, untrusted: CorrelatedPersonalReceiptSubjectInput,
  env: ConnectorEnvironment, context: TemporalRegistryContext) {
  if (untrusted.enabled !== true) return freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const input = inputSchema.parse(untrusted);
  if (!Number.isFinite(context.deadlineAt)) throw new Error("CORRELATED_RECEIPT_DEADLINE_INVALID");
  const c = Object.freeze({ deadlineAt: Math.min(context.deadlineAt, Date.now() + 5000), signal: context.signal });
  const live = () => {
    temporalRequireLive(c, env);
    if (env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z")
      throw new Error("CORRELATED_RECEIPT_PILOT_CHANGED");
  };
  live(); await temporalRegistryTransaction(tx, c, env); live();
  const discovered = await tx.$queryRawUnsafe<Array<{ clarificationId: string }>>(`SELECT "clarificationId" FROM "PersonalSmsTemporalClarificationReply"
    WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3`, input.subject.receiptId, input.actor.workspaceId, input.actor.userId); live();
  if (discovered.length !== 1) throw new Error("CORRELATED_RECEIPT_OWNER_REQUIRED");
  const clarificationId = id.parse(discovered[0].clarificationId);
  const row = structuredClone(await temporalRegistryLockProof(tx, input.actor, clarificationId, c, env)); live();
  const terminal = z.object({ id, phase: z.literal("CONSUMED"), consumedReplyId: id }).parse(row);
  if (terminal.id !== clarificationId || terminal.consumedReplyId !== input.subject.receiptId || !row.waiting
    || !row.acceptedAt || !row.acceptedProviderSid) throw new Error("CORRELATED_RECEIPT_CONSUMED_BINDING_REQUIRED");
  const receipts = await tx.$queryRawUnsafe<unknown[]>(`SELECT ${receiptColumns} FROM "PersonalSmsTemporalClarificationReply"
    WHERE id=$1 AND "clarificationId"=$2 AND "workspaceId"=$3 AND "userId"=$4 FOR SHARE`, input.subject.receiptId, row.id, input.actor.workspaceId, input.actor.userId); live();
  if (receipts.length !== 1) throw new Error("CORRELATED_RECEIPT_REQUIRED");
  const receipt = receiptSchema.parse(receipts[0]);
  if (receipt.id !== input.subject.receiptId || receipt.clarificationId !== row.id || receipt.workspaceId !== input.actor.workspaceId
    || receipt.userId !== input.actor.userId) throw new Error("CORRELATED_RECEIPT_SCOPE_CHANGED");
  const loaded = await temporalRegistryCurrentProof(tx, row, input.actor, env); live();
  if (!(loaded.now instanceof Date) || !Number.isFinite(loaded.now.getTime())) throw new Error("CORRELATED_RECEIPT_CURRENT_CLOCK_REQUIRED");
  const currentInspectedAtMs = loaded.now.getTime();
  const sourceRows = await tx.$queryRawUnsafe<unknown[]>(`SELECT id,"workspaceId","createdByUserId","connectorAccountId",kind,status,attempts,"leaseUntil",request,result,
    "requestHash","idempotencyKey",("createdAt" AT TIME ZONE 'UTC') AS "createdAt" FROM "PersonalAssistantOperation"
    WHERE id IN ($1,$2) AND "workspaceId"=$3 AND "createdByUserId"=$4 ORDER BY id FOR SHARE`, row.sourceOperationId, receipt.sourceOperationId, input.actor.workspaceId, input.actor.userId); live();
  if (sourceRows.length !== 2 || row.sourceOperationId === receipt.sourceOperationId) throw new Error("CORRELATED_RECEIPT_TWO_COMPLETED_SOURCES_REQUIRED");
  const parsedSources = sourceRows.map(value => sourceSchema.parse(value));
  const originalRow = parsedSources.find(value => value.id === row.sourceOperationId), answerRow = parsedSources.find(value => value.id === receipt.sourceOperationId);
  if (!originalRow || !answerRow || parsedSources.some(value => value.workspaceId !== input.actor.workspaceId || value.createdByUserId !== input.actor.userId
    || value.connectorAccountId !== loaded.binding.smsAccountId)) throw new Error("CORRELATED_RECEIPT_SOURCE_SCOPE_CHANGED");
  const original = temporalCheckedSource(originalRow, input.actor), answer = temporalCheckedSource(answerRow, input.actor);
  if (canonicalJson(original) !== canonicalJson(loaded.source) || receipt.providerSid !== answer.messageSid || receipt.requestHash !== answer.requestHash
    || receipt.receivedAt.toISOString() !== answer.receivedAt) throw new Error("CORRELATED_RECEIPT_SOURCE_CHANGED");
  const result = z.object({ source: z.literal("TEMPORAL_CLARIFICATION"), temporalClarificationReceiptId: id, packetHash: hex,
    executionAuthorized: z.literal(false), externalTransportPerformed: z.literal(false), automaticRetry: z.literal(false) }).parse(answerRow.result);
  if (result.temporalClarificationReceiptId !== receipt.id || result.packetHash !== receipt.packetHash) throw new Error("CORRELATED_RECEIPT_SOURCE_RESULT_CHANGED");
  const ledgers = await tx.$queryRawUnsafe<Array<{ id: string; namespace: string; kind: string; clarificationId: string; confirmationId: string | null; active: boolean }>>(`SELECT id,namespace,kind,"clarificationId","confirmationId",active
    FROM "PersonalSmsConversationExpectation" WHERE id=$1 FOR SHARE`, `temporal:${row.id}`); live();
  if (ledgers.length !== 1 || ledgers[0].id !== `temporal:${row.id}` || ledgers[0].namespace !== row.namespace || ledgers[0].kind !== "TEMPORAL_CLARIFICATION"
    || ledgers[0].clarificationId !== row.id || ledgers[0].confirmationId !== null || ledgers[0].active !== false) throw new Error("CORRELATED_RECEIPT_LEDGER_CHANGED");
  const now = await temporalRegistryClock(tx); live();
  if (now.getTime() < currentInspectedAtMs) throw new Error("CORRELATED_RECEIPT_CLOCK_MOVED_BACKWARD");
  if (now >= row.expiresAt || now >= new Date(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "")
    || row.waiting.questionReceipt.acceptedAt !== row.acceptedAt.toISOString() || row.waiting.questionReceipt.acceptedProviderSid !== row.acceptedProviderSid)
    throw new Error("CORRELATED_RECEIPT_EXPIRED_OR_ACCEPTANCE_CHANGED");
  const proof = inspectCorrelatedPersonalReceiptProof({ waiting: row.waiting, currentBinding: loaded.binding, questionPhase: "CONSUMED", consumedReplyId: terminal.consumedReplyId,
    receipt: { id: receipt.id, outcome: receipt.outcome, receivedAt: receipt.receivedAt.toISOString(), createdAt: receipt.createdAt.toISOString(), sourceClaim: receipt.sourceClaim },
    original: { source: original, status: originalRow.status, attempt: originalRow.attempts, leaseUntil: originalRow.leaseUntil },
    answer: { source: answer, status: answerRow.status, attempt: answerRow.attempts, leaseUntil: answerRow.leaseUntil }, now: now.toISOString() },
  { packet: receipt.packet, packetHash: receipt.packetHash });
  live();
  const finalNow = await temporalRegistryClock(tx); live();
  if (finalNow < now) throw new Error("CORRELATED_RECEIPT_CLOCK_MOVED_BACKWARD");
  if (finalNow >= row.expiresAt || finalNow >= new Date(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT!)) throw new Error("CORRELATED_RECEIPT_EXPIRED");
  return freeze({ status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED" as const, actor: input.actor, subject: input.subject,
    proof, inspectedAt: finalNow.toISOString(), executionAuthorized: false as const, providerExecutionPerformed: false as const,
    persistencePerformed: false as const, committed: false as const, draft: null });
}
