import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { checkedCalendarConfirmationSource } from "./calendar-confirmation-authority";
import { isReservedCalendarConfirmationMessage } from "./calendar-confirmation-routing";
import { consumeCalendarSmsConfirmationInTransaction, reconcileCalendarSmsConfirmationInTransaction } from "./calendar-sms-confirmation-store";
import { executeClaimedPersonalCalendarWrite } from "./calendar-actions";
import type { ConnectorEnvironment } from "./google-client";
import type { PersonalSmsExecutionContext } from "./sms-worker";

export function calendarConfirmationWorkerEnabled(env: ConnectorEnvironment) {
  return env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true"
    && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED === "true"
    && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED === "true";
}

/** A verified inbound claim is the only input. Text, recipient, challenge and
 * effect claims are reloaded, never accepted from model/tool-call arguments.
 * Consumption commits before the existing one-use executor. No automatic retry. */
export async function processCalendarConfirmationSms(context: PersonalSmsExecutionContext, env: ConnectorEnvironment = process.env) {
  if (!calendarConfirmationWorkerEnabled(env)) return { status: "DISABLED" as const };
  const { claim } = context;
  const actor = { userId: claim.userId, workspaceId: claim.workspaceId };
  if (!Number.isFinite(context.deadlineAt)) throw new Error("CONFIRMATION_WORKER_DEADLINE_INVALID");
  const live = () => {
    if (!calendarConfirmationWorkerEnabled(env)) throw new Error("CONFIRMATION_WORKER_DISABLED");
    if (context.signal.aborted || Date.now() >= context.deadlineAt) throw new Error("CONFIRMATION_WORKER_DEADLINE");
  };
  live();
  const consumed = await prisma.$transaction(async tx => {
    live();
    // Read only here: challenge-first lock order is enforced by the consumer.
    const rows = await tx.$queryRawUnsafe<Array<{ request: unknown; requestHash: string; connectorAccountId: string }>>(`SELECT request,"requestHash","connectorAccountId"
      FROM "PersonalAssistantOperation" WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3
      AND kind='personal_sms_inbound' AND status='processing' AND attempts=$4 AND "leaseUntil"=($5::timestamptz AT TIME ZONE 'UTC') AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')`,
    claim.operationId, claim.workspaceId, claim.userId, claim.attempt, new Date(claim.leaseUntil));
    live();
    if (rows.length !== 1 || claim.attempt !== 1) throw new Error("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
    const source = checkedCalendarConfirmationSource(rows[0].request, rows[0].requestHash);
    if (!isReservedCalendarConfirmationMessage(source.body)) return { status: "NOT_RESERVED" as const };
    // More than one candidate is an ambiguity, not permission to guess. Exact
    // number/account/binding/phrase/time/permissions are checked again in consume.
    const candidates = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalCalendarSmsConfirmation"
      WHERE "workspaceId"=$1 AND "userId"=$2 AND "identityId"=$3 AND phase='WAITING'
      AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') ORDER BY id LIMIT 2`, actor.workspaceId, actor.userId, source.identityId);
    live();
    if (candidates.length !== 1) return { status: "NO_UNIQUE_PENDING_CONFIRMATION" as const };
    const challengeId = candidates[0].id;
    const result = await consumeCalendarSmsConfirmationInTransaction(tx, { actor, challengeId, confirmationSourceClaim: claim }, env, context);
    live();
    if (result.status !== "CONSUMED_NOT_EXECUTED" && result.status !== "REFUSED") throw new Error("CONFIRMATION_CONSUMPTION_DISABLED");
    // This is an acknowledgement only. Never disclose the reserved challenge
    // through reply: authority, or infer Google success from model/executor text.
    const text = result.status === "REFUSED"
      ? "Cette confirmation ne correspond pas au rendez-vous en attente. Aucun ajout Google n’est confirmé."
      : result.receipt.reply;
    const request = { to: source.from, from: source.to, text, sourceOperationId: claim.operationId };
    await tx.personalAssistantOperation.create({ data: { workspaceId: actor.workspaceId, createdByUserId: actor.userId,
      connectorAccountId: rows[0].connectorAccountId, kind: "sms_outbound", status: "pending", idempotencyKey: `reply:${claim.operationId}`,
      request, requestHash: createHash("sha256").update(JSON.stringify(request)).digest("hex") } });
    live();
    return { ...result, challengeId };
  }, { isolationLevel: "Serializable", maxWait: 500, timeout: Math.max(1, Math.min(5000, context.deadlineAt - Date.now() - 500)) });
  if (consumed.status !== "CONSUMED_NOT_EXECUTED") return consumed;
  // After commit no error may return this source to model interpretation or
  // consumption. Recovery handles a process death before/after dispatch.
  let executionReturned = false;
  try {
    live();
    await executeClaimedPersonalCalendarWrite(consumed.calendarClaim, env, undefined, context);
    executionReturned = true;
  } catch { /* Existing executor/recovery retains uncertainty; never retry. */ }
  let observedCalendarState: string | null = null;
  try {
    live();
    const reconciled = await prisma.$transaction(async tx => {
      live();
      const result = await reconcileCalendarSmsConfirmationInTransaction(tx, { actor, challengeId: consumed.challengeId }, env);
      live(); return result;
    }, { isolationLevel: "Serializable", maxWait: 500, timeout: Math.max(1, Math.min(2000, context.deadlineAt - Date.now() - 500)) });
    if ("observedCalendarState" in reconciled) observedCalendarState = reconciled.observedCalendarState;
  } catch { /* A later bookkeeping pass can inspect the durable result, not execute. */ }
  return { status: "CONFIRMATION_HANDLED" as const, acknowledgementPrepared: true, executionReturned,
    observedCalendarState, automaticRetry: false as const };
}
