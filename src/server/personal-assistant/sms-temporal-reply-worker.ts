import "server-only";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { classifySmsTemporalTimeLiteral } from "./sms-temporal-clarification";
import { temporalClaimSchema, temporalCheckedSource, temporalConversationNamespace, temporalSha } from "./sms-temporal-clarification-authority";
import { consumeSmsTemporalClarificationInTransaction } from "./sms-temporal-clarification-store";
import { isReservedCalendarConfirmationMessage } from "./calendar-confirmation-routing";
import { smsCalendarDay } from "./sms-calendar-routing";
import type { ConnectorEnvironment } from "./google-client";

type Context = Readonly<{ claim: z.infer<typeof temporalClaimSchema>; deadlineAt: number; signal?: AbortSignal }>;
const replyEnabled = (env: ConnectorEnvironment) => env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED === "true"
  && env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED === "true" && env.ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED === "true";
function controls(input: Context, env: ConnectorEnvironment) {
  const claim = Object.freeze(temporalClaimSchema.parse(input.claim));
  if (!Number.isFinite(input.deadlineAt)) throw new Error("TEMPORAL_REPLY_DEADLINE_INVALID");
  const deadlineAt = Math.min(input.deadlineAt, Date.now() + 5000), signal = input.signal, consumeEnabled = replyEnabled(env);
  const live = () => {
    if (env.ENDVERA_PERSONAL_SMS_WORKER_ENABLED !== "true") throw new Error("TEMPORAL_REPLY_SMS_WORKER_DISABLED");
    if (signal?.aborted || Date.now() >= deadlineAt - 1) throw new Error("TEMPORAL_REPLY_DEADLINE_OR_ABORT");
  };
  const consumeLive = () => { live(); if (!consumeEnabled || !replyEnabled(env)) throw new Error("TEMPORAL_REPLY_PROCESSING_DISABLED"); };
  return { claim, deadlineAt, signal, consumeEnabled, live, consumeLive };
}
type SourceRow = { id: string; request: unknown; requestHash: string; idempotencyKey: string; createdAt: Date; result: unknown; connectorAccountId: string };
const expectationSchema = z.object({ id: z.string(), kind: z.enum(["CALENDAR_CONFIRMATION", "TEMPORAL_CLARIFICATION"]),
  clarificationId: z.string().nullable(), confirmationId: z.string().nullable(), questionId: z.string().nullable(),
  questionNamespace: z.string().nullable(), workspaceId: z.string().nullable(), userId: z.string().nullable(), identityId: z.string().nullable(),
  phase: z.string().nullable(), expired: z.boolean().nullable() }).strict();
const frozen = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const unavailable = (reason: "NO_WAITING_QUESTION" | "OTHER_CONTEXT" | "NOT_YET_ASKED" | "EXPIRED" | "PROCESSING_OFF" | "OTHER_MESSAGE") => frozen({
  status: "TEMPORAL_REPLY_FIXED_RESPONSE" as const, reason, sourceCompleted: false as const, executionAuthorized: false as const,
  interpretationPerformed: false as const, attemptConsumed: false as const,
  reply: reason === "OTHER_MESSAGE"
    ? "Une précision d’heure est encore en attente. Ta nouvelle demande n’a pas été exécutée ni comptée comme une réponse. Précise quelle demande tu veux continuer."
    : "Aucune précision d’heure valide ne peut être traitée pour ce texto en ce moment. Reformule ta demande complète dans ENDVERA. Aucun rendez-vous n’est créé ni envoyé à Google." });

/** Purely local scheduling reservation. Processing flags OFF must not erase a
 * durable context; no fixed/bypass result authorizes normal-model fallback. */
export async function inspectSmsTemporalReplyReservationInTransaction(tx: Prisma.TransactionClient, input: Context, env: ConnectorEnvironment = process.env) {
  const c = controls(input, env); c.live();
  const [isolation] = await tx.$queryRawUnsafe<Array<{ isolation: string }>>("SELECT current_setting('transaction_isolation') AS isolation"); c.live();
  if (isolation?.isolation !== "serializable") throw new Error("TEMPORAL_REPLY_SERIALIZABLE_REQUIRED");
  const remaining = Math.min(2000, Math.floor(c.deadlineAt - Date.now() - 1));
  await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", String(remaining), String(Math.min(250, remaining))); c.live();
  const rows = await tx.$queryRawUnsafe<SourceRow[]>(`SELECT id,request,"requestHash","idempotencyKey","createdAt",result,"connectorAccountId" FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='personal_sms_inbound' AND status='processing' AND attempts=1
      AND "leaseUntil"=($4::timestamptz AT TIME ZONE 'UTC') AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')`,
  c.claim.operationId, c.claim.workspaceId, c.claim.userId, new Date(c.claim.leaseUntil)); c.live();
  if (rows.length !== 1) throw new Error("TEMPORAL_REPLY_SOURCE_CLAIM_REQUIRED");
  const source = temporalCheckedSource(rows[0], { workspaceId: c.claim.workspaceId, userId: c.claim.userId });
  if (source.operationId !== c.claim.operationId || source.accountSid !== env.TWILIO_ACCOUNT_SID || source.to !== env.TWILIO_PHONE_NUMBER) throw new Error("TEMPORAL_REPLY_SOURCE_CHANGED");
  if (isReservedCalendarConfirmationMessage(source.body)) return frozen({ status: "RESERVED_CALENDAR_CONFIRMATION" as const, sourceCompleted: false as const, executionAuthorized: false as const });
  const day = smsCalendarDay(source.body);
  if (day) return frozen({ status: "INDEPENDENT_CALENDAR_DAY_READ" as const, day, sourceCompleted: false as const, executionAuthorized: false as const });
  const time = classifySmsTemporalTimeLiteral(source.body), namespace = temporalConversationNamespace(source.from, source.to);
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", namespace); c.live();
  // No ledger row lock before the concrete question. Consumer retains the
  // established namespace→question→current bindings→reply source→ledger order.
  const raw = await tx.$queryRawUnsafe<unknown[]>(`SELECT e.id,e.kind,e."clarificationId",e."confirmationId",q.id "questionId",q.namespace "questionNamespace",
      q."workspaceId",q."userId",q."identityId",q.phase,(q."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC')) AS expired
    FROM "PersonalSmsConversationExpectation" e LEFT JOIN "PersonalSmsTemporalClarification" q ON q.id=e."clarificationId"
    WHERE e.namespace=$1 AND e.active ORDER BY e.id LIMIT 2`, namespace); c.live();
  if (raw.length > 1) throw new Error("TEMPORAL_REPLY_EXPECTATION_NOT_UNIQUE");
  if (!raw.length) return time.status === "NOT_TIME_LITERAL"
    ? frozen({ status: "NOT_TEMPORAL_CONTEXT" as const, sourceCompleted: false as const, executionAuthorized: false as const }) : unavailable("NO_WAITING_QUESTION");
  const expected = expectationSchema.parse(raw[0]);
  if (expected.kind === "CALENDAR_CONFIRMATION") {
    if (!expected.confirmationId || expected.clarificationId !== null || expected.id !== `calendar:${expected.confirmationId}`) throw new Error("TEMPORAL_REPLY_EXPECTATION_INVALID");
    return unavailable("OTHER_CONTEXT");
  }
  if (!expected.clarificationId || expected.confirmationId !== null || expected.questionId !== expected.clarificationId
    || expected.questionNamespace !== namespace || expected.id !== `temporal:${expected.clarificationId}` || typeof expected.expired !== "boolean"
    || !["PREPARED", "WAITING"].includes(expected.phase ?? "")) throw new Error("TEMPORAL_REPLY_EXPECTATION_INVALID");
  if (expected.workspaceId !== c.claim.workspaceId || expected.userId !== c.claim.userId || expected.identityId !== source.identityId) return unavailable("OTHER_CONTEXT");
  if (expected.expired) return unavailable("EXPIRED");
  if (expected.phase !== "WAITING") return unavailable("NOT_YET_ASKED");
  if (time.status === "NOT_TIME_LITERAL") return unavailable("OTHER_MESSAGE");
  if (!c.consumeEnabled) return unavailable("PROCESSING_OFF");
  c.consumeLive();
  return frozen({ status: "TEMPORAL_REPLY_RESERVED_NOT_AUTHORIZED" as const, clarificationId: expected.clarificationId,
    source, connectorAccountId: rows[0].connectorAccountId, claim: c.claim, sourceCompleted: false as const, executionAuthorized: false as const });
}

/** Default-OFF consumption+acknowledgment, called by the existing SMS worker.
 * The existing store owns receipt, question transition and exact source CAS. */
export async function processSmsTemporalReply(input: Context, env: ConnectorEnvironment = process.env) {
  const c = controls(input, env); c.live();
  const remaining = Math.floor(c.deadlineAt - Date.now()), maxWait = Math.min(500, Math.max(1, Math.floor(remaining / 4)));
  const result = await prisma.$transaction(async tx => {
    c.live();
    const reservation = await inspectSmsTemporalReplyReservationInTransaction(tx, { claim: c.claim, deadlineAt: c.deadlineAt, signal: c.signal }, env); c.live();
    if (reservation.status !== "TEMPORAL_REPLY_RESERVED_NOT_AUTHORIZED") return reservation;
    c.consumeLive();
    const consumed = await consumeSmsTemporalClarificationInTransaction(tx, { actor: { userId: c.claim.userId, workspaceId: c.claim.workspaceId },
      clarificationId: reservation.clarificationId, replySourceClaim: c.claim }, env, { deadlineAt: c.deadlineAt, signal: c.signal }); c.consumeLive();
    if (consumed.status !== "CORRELATED_NOT_EXECUTED" && consumed.status !== "REFUSED") throw new Error("TEMPORAL_REPLY_CONSUMER_DISABLED");
    const text = z.string().min(1).max(1500).parse(consumed.reply);
    const request = { to: reservation.source.from, from: reservation.source.to, text, sourceOperationId: c.claim.operationId };
    const outbound = await tx.personalAssistantOperation.create({ data: { workspaceId: c.claim.workspaceId, createdByUserId: c.claim.userId,
      connectorAccountId: reservation.connectorAccountId, kind: "sms_outbound", status: "pending", attempts: 0,
      idempotencyKey: `reply:${c.claim.operationId}`, request, requestHash: temporalSha(JSON.stringify(request)) } }); c.consumeLive();
    return frozen({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED" as const, outcome: consumed.status, receiptId: consumed.receiptId, packetHash: consumed.packetHash,
      acknowledgementOperationId: outbound.id, sourceCompleted: true as const, acknowledgmentPrepared: true as const, executionAuthorized: false as const,
      providerExecutionPerformed: false as const, automaticRetry: false as const });
  }, { isolationLevel: "Serializable", maxWait, timeout: Math.min(4500, remaining - maxWait) });
  // A known commit is not undone by a later switch change. No provider call or
  // fallback follows this result; unknown commit errors propagate without retry.
  return frozen({ ...result, committed: true as const });
}
