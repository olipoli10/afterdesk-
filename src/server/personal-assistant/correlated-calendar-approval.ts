import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { inspectCorrelatedCalendarApprovalOfferInTransaction } from "./correlated-calendar-approval-gate";
import { correlatedCalendarApprovalCommandSchema, fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalCommand,
  inspectCorrelatedCalendarApprovalClaim, inspectCorrelatedCalendarApprovalState, CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION,
  CORRELATED_CALENDAR_APPROVAL_STATE_VERSION, CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, type CorrelatedCalendarApprovalCommand } from "./correlated-calendar-approval-contract";
import { temporalActorSchema, temporalRegistryClock, temporalRequireLive, type TemporalRegistryActor, type TemporalRegistryContext, type TemporalRegistryDB } from "./sms-temporal-clarification-authority";
import { requireGooglePilot, type ConnectorEnvironment } from "./google-client";
import { prisma } from "@/lib/db";
import { executeClaimedPersonalCalendarWrite } from "./calendar-actions";
import { correlatedCalendarApprovalResultSchema, readCorrelatedCalendarApprovalResult } from "./correlated-calendar-approval-result";
import type { GoogleCalendarClient } from "./google-client";

const instant = z.number().finite(), id = z.string().min(1).max(191);
const budgetSchema = z.object({ startedAt: instant, startedMonotoneAt: instant, deadlineAt: instant, monotoneDeadlineAt: instant,
  claimDeadlineAt: instant, claimMonotoneDeadlineAt: instant, signal: z.instanceof(AbortSignal).optional(),
  transactionOptions: z.object({ isolationLevel: z.literal("Serializable"), maxWait: z.number().int().positive(), timeout: z.number().int().positive() }).strict() }).strict();
export type CorrelatedCalendarApprovalClaimBudget = Readonly<z.infer<typeof budgetSchema>>;
export type CorrelatedCalendarApprovalContext = TemporalRegistryContext & { monotoneDeadlineAt?: number };
function refused(): never { throw new Error("CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED"); }
function freeze<T>(value: T): T {
  // AbortSignal is a live cancellation channel, not mutable request data to freeze.
  if (value && typeof value === "object" && !(value instanceof AbortSignal)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Create ONCE before opening the claim transaction. maxWait is included in the
 * five-second phase budget. C2c must retain both original total deadlines. */
export function createCorrelatedCalendarApprovalClaimBudget(context: CorrelatedCalendarApprovalContext): CorrelatedCalendarApprovalClaimBudget {
  const { deadlineAt, monotoneDeadlineAt, signal } = context;
  const startedAt = Date.now(), startedMonotoneAt = performance.now();
  if (!Number.isFinite(deadlineAt) || (monotoneDeadlineAt !== undefined && !Number.isFinite(monotoneDeadlineAt)) || signal?.aborted) refused();
  const total = Math.floor(Math.min(25000, deadlineAt - startedAt, (monotoneDeadlineAt ?? Infinity) - startedMonotoneAt)), phase = Math.min(5000, total);
  if (phase < 2) refused();
  const maxWait = Math.min(500, Math.max(1, Math.floor(phase / 4)));
  return freeze({ startedAt, startedMonotoneAt, deadlineAt: startedAt + total, monotoneDeadlineAt: startedMonotoneAt + total,
    claimDeadlineAt: startedAt + phase, claimMonotoneDeadlineAt: startedMonotoneAt + phase, signal,
    transactionOptions: { isolationLevel: "Serializable" as const, maxWait, timeout: phase - maxWait } });
}
function snapshotBudget(raw: CorrelatedCalendarApprovalClaimBudget) {
  const b = budgetSchema.parse(raw), total = b.deadlineAt - b.startedAt, phase = b.claimDeadlineAt - b.startedAt;
  if (total < 2 || total > 25000 || phase < 2 || phase > Math.min(5000, total)
    || Math.abs(b.monotoneDeadlineAt - b.startedMonotoneAt - total) > 0.001 || Math.abs(b.claimMonotoneDeadlineAt - b.startedMonotoneAt - phase) > 0.001
    || b.transactionOptions.maxWait + b.transactionOptions.timeout > phase
    || b.startedMonotoneAt > performance.now()) refused();
  return freeze(b);
}
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED === "true";
function live(b: CorrelatedCalendarApprovalClaimBudget, env: ConnectorEnvironment) {
  if (!enabled(env) || env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED !== "true" || b.signal?.aborted
    || Date.now() >= b.claimDeadlineAt || performance.now() >= b.claimMonotoneDeadlineAt) refused();
}
function liveNew(b: CorrelatedCalendarApprovalClaimBudget, env: ConnectorEnvironment) {
  live(b, env); temporalRequireLive({ deadlineAt: b.claimDeadlineAt, signal: b.signal }, env);
  if (env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") refused();
  requireGooglePilot(env);
}
const discoverySchema = z.object({ view: z.unknown(), approvalPresent: z.boolean(), reviewCommitted: z.literal(true), operationCommitted: z.literal(true),
  approvalCommitted: z.boolean().nullable(), binding: z.boolean().nullable(), stateValid: z.boolean().nullable(),
  status: z.enum(["pending", "processing", "completed", "uncertain", "refused"]), phase: z.string().nullable(),
  attempts: z.number().int().nonnegative(), leaseMatches: z.boolean().nullable(), leaseIsNull: z.boolean(), resultIsNull: z.boolean(), externalTransportPerformed: z.boolean() }).strict();

/** Transaction-only mutation. Its return is NOT a commit acknowledgement and
 * cannot be sent to an executor until the caller's transaction resolves. No retry,
 * history reader, provider, token loader or calendar executor is invoked here. */
export async function claimCorrelatedCalendarApprovalInTransaction(tx: TemporalRegistryDB, rawCommand: CorrelatedCalendarApprovalCommand,
  rawActor: TemporalRegistryActor, env: ConnectorEnvironment, rawBudget: CorrelatedCalendarApprovalClaimBudget) {
  if (!enabled(env)) return Object.freeze({ status: "DISABLED" as const, committed: false as const, executionAuthorized: false as const });
  const command = correlatedCalendarApprovalCommandSchema.parse(rawCommand), actor = temporalActorSchema.parse(rawActor), budget = snapshotBudget(rawBudget);
  if (command.workspaceId !== actor.workspaceId || "$transaction" in tx) refused();
  live(budget, env);
  const isolation = await tx.$queryRawUnsafe<Array<{ isolation: string }>>("SELECT current_setting('transaction_isolation') AS isolation"); live(budget, env);
  if (isolation.length !== 1 || isolation[0].isolation !== "serializable") refused();
  const queryMs = Math.max(1, Math.min(2000, Math.floor(budget.claimDeadlineAt - Date.now()), Math.floor(budget.claimMonotoneDeadlineAt - performance.now())));
  await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", String(queryMs)); live(budget, env);
  // This lookup has no row locks and discloses no handle. It only distinguishes
  // an exact prior immutable choice from an unclaimed review. C3 must authorize
  // the current owner AFTER this transaction, without ever re-executing a claim.
  const discoveries = await tx.$queryRawUnsafe<unknown[]>(`SELECT sms_correlated_approval_view(r) AS view,
    (a.id IS NOT NULL) AS "approvalPresent",sms_correlated_approval_pre_snapshot(r.xmin) AS "reviewCommitted",
    sms_correlated_approval_pre_snapshot(o.xmin) AS "operationCommitted",
    CASE WHEN a.id IS NOT NULL THEN sms_correlated_approval_pre_snapshot(a.xmin) END AS "approvalCommitted",
    CASE WHEN a.id IS NOT NULL THEN sms_correlated_approval_binding(a,r,o) END AS binding,
    CASE WHEN a.id IS NOT NULL THEN sms_correlated_approval_state_valid(o.result,a,r) END AS "stateValid",
    o.status,o.result->>'phase' AS phase,o.attempts,(o."leaseUntil"=a."leaseUntil") AS "leaseMatches",
    (o."leaseUntil" IS NULL) AS "leaseIsNull",(o.result IS NULL) AS "resultIsNull",o."externalTransportPerformed"
    FROM "PersonalSmsCorrelatedCalendarReview" r JOIN "PersonalAssistantOperation" o ON o.id=r."calendarOperationId"
    LEFT JOIN "PersonalSmsCorrelatedCalendarApproval" a ON a."reviewId"=r.id OR a."calendarOperationId"=o.id
    WHERE r.id=$1 AND r."workspaceId"=$2 AND r."userId"=$3`, command.reviewId, actor.workspaceId, actor.userId); live(budget, env);
  if (discoveries.length !== 1) refused();
  const discovered = discoverySchema.parse(discoveries[0]);
  // A's bounded parser snapshots JSON immediately, before another await.
  const expected = fingerprintCorrelatedCalendarApprovalView(discovered.view);
  inspectCorrelatedCalendarApprovalCommand(command, expected.view);
  if (expected.view.scope.userId !== actor.userId || expected.view.scope.workspaceId !== actor.workspaceId) refused();
  if (discovered.approvalPresent) {
    if (discovered.approvalCommitted !== true || discovered.binding !== true || discovered.stateValid !== true || discovered.attempts !== 1) refused();
    if (discovered.status === "processing") {
      if (!["CLAIMED", "DISPATCH_CLAIMED"].includes(discovered.phase ?? "") || discovered.leaseMatches !== true || discovered.externalTransportPerformed) refused();
    } else if (discovered.status === "completed") {
      if (discovered.phase !== "CONFIRMED" || !discovered.leaseIsNull || !discovered.externalTransportPerformed) refused();
    } else if (discovered.status === "uncertain") {
      if (discovered.phase !== "UNCERTAIN" || !discovered.leaseIsNull) refused();
    } else refused();
    live(budget, env);
    return Object.freeze({ status: "ALREADY_ATTEMPTED" as const, committed: false as const, executionAuthorized: false as const });
  }
  if (discovered.approvalCommitted !== null || discovered.binding !== null || discovered.stateValid !== null || discovered.status !== "pending"
    || discovered.attempts !== 0 || !discovered.leaseIsNull || !discovered.resultIsNull || discovered.externalTransportPerformed) refused();
  liveNew(budget, env);
  const gate = await inspectCorrelatedCalendarApprovalOfferInTransaction(tx, { enabled: true, actor, reviewId: command.reviewId }, env,
    { deadlineAt: Math.min(budget.claimDeadlineAt, Date.now() + Math.floor(budget.claimMonotoneDeadlineAt - performance.now())), signal: budget.signal }); liveNew(budget, env);
  if (gate.status !== "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED" || gate.committed !== false || gate.executionAuthorized !== false) refused();
  const view = fingerprintCorrelatedCalendarApprovalView(gate.view);
  inspectCorrelatedCalendarApprovalCommand(command, view.view);
  if (view.fingerprint !== expected.fingerprint || gate.fingerprint !== view.fingerprint || gate.actor.userId !== actor.userId || gate.actor.workspaceId !== actor.workspaceId) refused();
  const operationId = id.parse(gate.operationId), request = structuredClone(gate.request), authority = structuredClone(gate.authority);
  const inspectedAt = Date.parse(gate.inspectedAt), expiresAt = Date.parse(gate.approvalExpiresAt);
  if (!Number.isFinite(inspectedAt) || !Number.isFinite(expiresAt) || inspectedAt >= expiresAt) refused();
  // The offer holds SHARE, not UPDATE. Upgrade explicitly under the namespace,
  // BEFORE inserting the immutable approval. A competing claim never gets adopted.
  const locked = await tx.$queryRawUnsafe<unknown[]>(`SELECT o.id FROM "PersonalAssistantOperation" o
    JOIN "PersonalSmsCorrelatedCalendarReview" r ON r."calendarOperationId"=o.id
    WHERE o.id=$1 AND o."workspaceId"=$2 AND o."createdByUserId"=$3 AND o."connectorAccountId"=$4 AND o.kind='calendar_write'
      AND o.status='pending' AND o.attempts=0 AND o."leaseUntil" IS NULL AND o.result IS NULL AND o."externalTransportPerformed"=false
      AND o."requestHash"=$5 AND o.request=$6::jsonb AND o."correlatedTemporalReceiptId"=$7
      AND r.id=$8 AND r."workspaceId"=$2 AND r."userId"=$3 AND r."receiptId"=$7 AND r."calendarRequestHash"=$5
      AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" a WHERE a."reviewId"=r.id OR a."calendarOperationId"=o.id)
    FOR UPDATE OF o`, operationId, actor.workspaceId, actor.userId, view.view.request.connectorAccountId, command.expectedRequestHash,
  JSON.stringify(request), view.view.review.receiptId, command.reviewId); liveNew(budget, env);
  if (locked.length !== 1 || z.object({ id }).strict().parse(locked[0]).id !== operationId) refused();
  const remainingExecutionMs = Math.floor(Math.min(budget.deadlineAt - Date.now(), budget.monotoneDeadlineAt - performance.now()));
  if (remainingExecutionMs < 1 || remainingExecutionMs > 25000) refused();
  // Anchor to the already observed DB clock, never INSERT's later clock. Queue or
  // query latency can shorten this lease, not add time to the original budget.
  const fixedDbDeadline = new Date(inspectedAt + remainingExecutionMs).toISOString();
  const approvalId = randomUUID(), token = randomUUID();
  const inserted = await tx.$queryRawUnsafe<unknown[]>(`INSERT INTO "PersonalSmsCorrelatedCalendarApproval"
    (id,"reviewId","calendarOperationId","workspaceId","userId","approvalToken","fingerprintVersion","reviewFingerprint","approvalExpiresAt","leaseUntil","writeAuthority")
    SELECT $1,r.id,$3,$4,$5,$6,$7,$8,least(r."preparationExpiresAt",r."pilotExpiresAt"),
      least(r."preparationExpiresAt",r."pilotExpiresAt",($10::timestamptz AT TIME ZONE 'UTC')),$9::jsonb
    FROM "PersonalSmsCorrelatedCalendarReview" r WHERE r.id=$2 AND r."calendarOperationId"=$3 AND r."workspaceId"=$4 AND r."userId"=$5
    RETURNING id,("approvedAt" AT TIME ZONE 'UTC') AS "approvedAt",("approvalExpiresAt" AT TIME ZONE 'UTC') AS "approvalExpiresAt",("leaseUntil" AT TIME ZONE 'UTC') AS "leaseUntil"`,
  approvalId, command.reviewId, operationId, actor.workspaceId, actor.userId, token, CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, view.fingerprint, JSON.stringify(authority), fixedDbDeadline); liveNew(budget, env);
  if (inserted.length !== 1) refused();
  const epoch = z.date().transform(value => value.toISOString());
  const insertedRow = z.object({ id: z.string().uuid(), approvedAt: epoch, approvalExpiresAt: epoch, leaseUntil: epoch }).strict().parse(inserted[0]);
  if (insertedRow.id !== approvalId || Date.parse(insertedRow.approvedAt) < inspectedAt || Date.parse(insertedRow.approvalExpiresAt) !== expiresAt
    || Date.parse(insertedRow.leaseUntil) > Date.parse(fixedDbDeadline)
    || Date.parse(insertedRow.leaseUntil) - Date.parse(insertedRow.approvedAt) > remainingExecutionMs) refused();
  const claim = inspectCorrelatedCalendarApprovalClaim({ version: CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION,
    origin: { kind: "personal_sms_temporal_receipt", approvalId, reviewId: command.reviewId, reviewFingerprint: view.fingerprint },
    ...actor, operationId, expectedRequestHash: command.expectedRequestHash, request, authority, approvalToken: token,
    approvedAt: insertedRow.approvedAt, approvalExpiresAt: insertedRow.approvalExpiresAt, leaseUntil: insertedRow.leaseUntil }, view.view).claim;
  const state = inspectCorrelatedCalendarApprovalState({ version: CORRELATED_CALENDAR_APPROVAL_STATE_VERSION, origin: claim.origin,
    phase: "CLAIMED", approvedBy: actor.userId, approvedHash: command.expectedRequestHash, approvalToken: token, writeAuthority: claim.authority, dispatchStarted: false }, claim, view.view).state;
  const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='processing',attempts=1,
    "leaseUntil"=($6::timestamptz AT TIME ZONE 'UTC'),result=$7::jsonb
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "connectorAccountId"=$4 AND kind='calendar_write'
      AND status='pending' AND attempts=0 AND "leaseUntil" IS NULL AND result IS NULL AND "externalTransportPerformed"=false
      AND "requestHash"=$5 AND request=$8::jsonb AND "correlatedTemporalReceiptId"=$9
      AND "sourcePersonalOperationId" IS NULL AND "modelGatewayOperationId" IS NULL AND "budgetId" IS NULL AND "reservedCadMicros" IS NULL`,
  operationId, actor.workspaceId, actor.userId, claim.authority.accountId, claim.expectedRequestHash, claim.leaseUntil, JSON.stringify(state), JSON.stringify(claim.request), view.view.review.receiptId); liveNew(budget, env);
  if (changed !== 1) refused();
  const finalNow = (await temporalRegistryClock(tx)).getTime(); liveNew(budget, env);
  if (finalNow < Date.parse(claim.approvedAt) || finalNow >= Date.parse(claim.leaseUntil) || finalNow >= Date.parse(claim.approvalExpiresAt)) refused();
  return freeze({ status: "CLAIM_CREATED_NOT_COMMITTED" as const, committed: false as const, executionAuthorized: false as const,
    claim, view: view.view, inspectedAt: new Date(finalNow).toISOString() });
}

const responseCommon = { version: z.literal("personal-correlated-calendar-approval-response-v1"), workspaceId: id, reviewId: id,
  expectedReviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/), expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/),
  automaticRetry: z.literal(false), executionAuthorized: z.literal(false), providerStateVerified: z.literal(false) };
/** Closed, scoped wire shape. A confirmed receipt is a recorded outcome, not a
 * reusable authority token or a claim about the provider's present state. */
export const correlatedCalendarApprovalResponseSchema = z.discriminatedUnion("status", [
  z.object({ ...responseCommon, status: z.literal("CONFIRMED"), receipt: z.object({ confirmed: z.literal(true), providerEventId: z.string().regex(/^e[a-f0-9]{31}$/) }).strict() }).strict(),
  z.object({ ...responseCommon, status: z.literal("ALREADY_ATTEMPTED"), result: correlatedCalendarApprovalResultSchema }).strict(),
]).superRefine((value, ctx) => {
  if (value.status === "ALREADY_ATTEMPTED" && (value.result.workspaceId !== value.workspaceId || value.result.reviewId !== value.reviewId)) ctx.addIssue({ code: "custom", message: "Result scope mismatch" });
});
export type CorrelatedCalendarApprovalResponse = z.infer<typeof correlatedCalendarApprovalResponseSchema>;

/** Explicit command only. The original budget includes queueing, claim, token
 * loading and the one existing executor. No retry after any ambiguous commit. */
export async function approveCorrelatedCalendarReview(rawCommand: CorrelatedCalendarApprovalCommand, rawActor: TemporalRegistryActor,
  env: ConnectorEnvironment = process.env, context: CorrelatedCalendarApprovalContext = { deadlineAt: Date.now() + 25000 }, client?: GoogleCalendarClient) {
  if (!enabled(env)) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const command = correlatedCalendarApprovalCommandSchema.parse(rawCommand), actor = temporalActorSchema.parse(rawActor);
  if (command.workspaceId !== actor.workspaceId) refused();
  const budget = createCorrelatedCalendarApprovalClaimBudget({ deadlineAt: context.deadlineAt, monotoneDeadlineAt: context.monotoneDeadlineAt, signal: context.signal });
  let claimed: Awaited<ReturnType<typeof claimCorrelatedCalendarApprovalInTransaction>>;
  try {
    claimed = await prisma.$transaction(tx => claimCorrelatedCalendarApprovalInTransaction(tx, command, actor, env, budget), budget.transactionOptions);
  } catch {
    // Prisma errors are not universal proof of rollback. Do not execute or retry.
    throw new Error("CORRELATED_CALENDAR_APPROVAL_COMMIT_OUTCOME_UNKNOWN");
  }
  if (claimed.status === "DISABLED") return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const base = { version: "personal-correlated-calendar-approval-response-v1", workspaceId: actor.workspaceId, reviewId: command.reviewId,
    expectedReviewFingerprint: command.expectedReviewFingerprint, expectedRequestHash: command.expectedRequestHash,
    automaticRetry: false, executionAuthorized: false, providerStateVerified: false };
  const remaining = Math.floor(Math.min(budget.deadlineAt - Date.now(), budget.monotoneDeadlineAt - performance.now()));
  if (budget.signal?.aborted || remaining < 2) throw new Error("CORRELATED_CALENDAR_APPROVAL_OUTCOME_UNKNOWN");
  if (claimed.status === "ALREADY_ATTEMPTED") {
    // No locks from the claim transaction survive this boundary. C3 authorizes
    // the current owner without restoring expired preparation/provider authority.
    const result = await readCorrelatedCalendarApprovalResult({ enabled: true, actor, reviewId: command.reviewId }, env,
      { deadlineAt: Math.min(budget.deadlineAt, Date.now() + remaining), signal: budget.signal });
    return freeze(correlatedCalendarApprovalResponseSchema.parse({ ...base, status: "ALREADY_ATTEMPTED", result }));
  }
  inspectCorrelatedCalendarApprovalCommand(command, claimed.view);
  const receipt = await executeClaimedPersonalCalendarWrite(claimed.claim, env, client,
    { deadlineAt: budget.deadlineAt, monotoneDeadlineAt: budget.monotoneDeadlineAt, signal: budget.signal });
  // No post-commit live check: a known successful terminal commit stays a fact
  // even when the response arrives after the local timer. No fresh permit leaks.
  return freeze(correlatedCalendarApprovalResponseSchema.parse({ ...base, status: "CONFIRMED", receipt }));
}
