import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { claimPersonalCalendarWriteInTransaction, type PersonalCalendarExecutionContext } from "./calendar-actions";
import { inspectSmsCalendarConfirmation, prepareSmsCalendarConfirmation } from "./calendar-sms-confirmation-contract";
import type { ConnectorEnvironment } from "./google-client";
import type { PersonalSmsSourceClaim } from "./sms-worker";

import { confirmationDatabaseClock as clock, checkedCalendarConfirmationSource as checkedSource,
  lockCalendarConfirmation as lockChallenge, loadCalendarConfirmationBinding as binding } from "./calendar-confirmation-authority";
export { markCalendarSmsConfirmationWaitingInTransaction } from "./calendar-confirmation-authority";

const id = z.string().min(1).max(191);
const actorSchema = z.object({ userId: id, workspaceId: id }).strict();
const claimSchema = z.object({ operationId: id, userId: id, workspaceId: id, attempt: z.literal(1), leaseUntil: z.string().datetime({ offset: true }) }).strict();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true";
type Actor = z.infer<typeof actorSchema>;
type DB = Prisma.TransactionClient;
/** Caller must use one SERIALIZABLE source-finalization transaction. The deferred
 * constraint requires its exact completed source review at commit. OFF by default.
 * The dedicated summary is intentionally NOT executable by existing outbox APIs. */
export async function prepareCalendarSmsConfirmationInTransaction(tx: DB, input: { actor: Actor; sourceClaim: PersonalSmsSourceClaim;
  modelChildOperationId: string; reviewActionId: string; calendarOperationId: string; ttlMs?: number }, env: NodeJS.ProcessEnv = process.env) {
  if (!enabled(env)) return disabled();
  const actor = actorSchema.parse(input.actor), sourceClaim = claimSchema.parse(input.sourceClaim);
  const ttlMs = z.number().int().min(1).max(600000).parse(input.ttlMs ?? 600000);
  if (sourceClaim.userId !== actor.userId || sourceClaim.workspaceId !== actor.workspaceId) throw new Error("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
  const ids = { sourceOperationId: sourceClaim.operationId, modelChildOperationId: id.parse(input.modelChildOperationId),
    calendarOperationId: id.parse(input.calendarOperationId), reviewActionId: id.parse(input.reviewActionId) };
  const review = await prepareStoredPersonalIntentReview(tx, { enabled: true, ...actor, sourceOperationId: ids.sourceOperationId, modelChildOperationId: ids.modelChildOperationId }, env);
  if (review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED" || review.actions.length !== 1) throw new Error("CONFIRMATION_SINGLE_REVIEW_REQUIRED");
  const action = review.actions[0];
  if (action.kind !== "PREPARE_CALENDAR_EVENT" || action.status !== "PREPARED_UNSENT" || action.operationId !== ids.calendarOperationId || action.actionId !== ids.reviewActionId) throw new Error("CONFIRMATION_EXACT_REVIEW_REQUIRED");
  const loaded = await binding(tx, actor, ids, env, sourceClaim), now = await clock(tx);
  if (loaded.row.calendarRequestHash !== action.requestHash || review.source.text !== loaded.source.body || Date.parse(review.source.receivedAt) !== loaded.row.sourceCreatedAt.getTime()) throw new Error("CONFIRMATION_EXACT_REVIEW_REQUIRED");
  const prepared = prepareSmsCalendarConfirmation({ binding: loaded.current, entropyHex: randomBytes(3).toString("hex"), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString() });
  // Serializes creations for this permanent visible conversation without
  // persisting numbers in the non-reuse registry. Collision is a refusal, never retry.
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text', prepared.namespace);
  const [{ count }] = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "PersonalCalendarSmsConfirmation"
    WHERE namespace=$1 AND "createdAt">clock_timestamp()-interval '1 hour'`, prepared.namespace);
  if (count >= 5n) throw new Error("CONFIRMATION_CREATION_LIMIT");
  const challengeId = randomUUID(), summaryId = randomUUID();
  await tx.$executeRawUnsafe(`INSERT INTO "PersonalCalendarSmsConfirmationNonce" ("nonReuseKey",namespace,"phraseHash","createdAt") VALUES($1,$2,$3,$4)`, prepared.nonReuseKey, prepared.namespace, sha(prepared.phrase), now);
  const summaryRequest = { schemaVersion: 1, challengeId, sourceOperationId: ids.sourceOperationId, modelChildOperationId: ids.modelChildOperationId,
    calendarOperationId: ids.calendarOperationId, bindingHash: prepared.bindingHash, summaryHash: prepared.summaryHash,
    to: loaded.source.from, from: loaded.source.to, text: prepared.summary };
  const summaryRequestHash = sha(JSON.stringify(summaryRequest));
  await tx.$executeRawUnsafe(`INSERT INTO "PersonalAssistantOperation" (id,"workspaceId","connectorAccountId",kind,status,"idempotencyKey",request,"requestHash","createdByUserId","updatedAt")
    VALUES($1,$2,$3,'calendar_confirmation_summary','pending',$4,$5::jsonb,$6,$7,$8)`, summaryId, actor.workspaceId, loaded.current.owner.smsAccountId,
  `calendar-confirmation-summary:${challengeId}`, JSON.stringify(summaryRequest), summaryRequestHash, actor.userId, now);
  await tx.$executeRawUnsafe(`INSERT INTO "PersonalCalendarSmsConfirmation"
    (id,"workspaceId","userId","identityId","sourceOperationId","modelChildOperationId","calendarOperationId","summaryOperationId","reviewActionId",
     phase,prepared,"reviewSnapshot","bindingHash",namespace,"nonReuseKey","summaryHash","summaryRequestHash","createdAt","expiresAt","updatedAt")
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PREPARED',$10::jsonb,$11::jsonb,$12,$13,$14,$15,$18,$16,$17,$16)`,
  challengeId, actor.workspaceId, actor.userId, loaded.current.owner.identityId, ids.sourceOperationId, ids.modelChildOperationId, ids.calendarOperationId, summaryId, ids.reviewActionId,
  JSON.stringify(prepared), JSON.stringify(review), prepared.bindingHash, prepared.namespace, prepared.nonReuseKey, prepared.summaryHash, now, new Date(prepared.expiresAt), summaryRequestHash);
  return Object.freeze({ status: "PREPARED_DURABLE_OFF" as const, executionAuthorized: false as const, challengeId, summaryOperationId: summaryId,
    summary: prepared.summary, expiresAt: prepared.expiresAt, transportReady: false as const, requiredSourceReview: review });
}

/** Consumes only the body reloaded from the exact verified inbound claim. All
 * three CAS writes are in the caller's SERIALIZABLE transaction. Returned claim
 * is not execution; no Google/token/outbound function is called here. */
export async function consumeCalendarSmsConfirmationInTransaction(tx: DB, input: { actor: Actor; challengeId: string; confirmationSourceClaim: PersonalSmsSourceClaim }, env: ConnectorEnvironment = process.env, context: PersonalCalendarExecutionContext = {}) {
  if (!enabled(env)) return disabled();
  const actor = actorSchema.parse(input.actor), sourceClaim = claimSchema.parse(input.confirmationSourceClaim);
  if (sourceClaim.userId !== actor.userId || sourceClaim.workspaceId !== actor.workspaceId) throw new Error("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
  const challenge = await lockChallenge(tx, actor, input.challengeId), now = await clock(tx);
  if (challenge.phase !== "WAITING" || challenge.expiresAt <= now || challenge.failedAttempts >= 5) throw new Error("CONFIRMATION_NOT_WAITING");
  const rows = await tx.$queryRawUnsafe<Array<{ request: unknown; requestHash: string; connectorAccountId: string; createdAt: Date }>>(`SELECT request,"requestHash","connectorAccountId","createdAt" FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='personal_sms_inbound' AND status='processing' AND attempts=1
      AND "leaseUntil"=$4 AND "leaseUntil">clock_timestamp() FOR UPDATE`, sourceClaim.operationId, actor.workspaceId, actor.userId, new Date(sourceClaim.leaseUntil));
  if (rows.length !== 1 || sourceClaim.operationId === challenge.sourceOperationId) throw new Error("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
  if (!(challenge.acceptedAt instanceof Date) || !(rows[0].createdAt instanceof Date)
    || rows[0].createdAt.getTime() < challenge.acceptedAt.getTime() || rows[0].createdAt > now) throw new Error("CONFIRMATION_RECEIVED_BEFORE_SUMMARY");
  const source = checkedSource(rows[0].request, rows[0].requestHash), loaded = await binding(tx, actor, challenge, env);
  if (source.identityId !== loaded.current.owner.identityId || source.from !== loaded.source.from || source.to !== loaded.source.to
    || source.accountSid !== loaded.source.accountSid || rows[0].connectorAccountId !== loaded.current.owner.smsAccountId
    || canonicalFingerprint((loaded.row.sourceResult as { personalModelReview?: unknown })?.personalModelReview) !== canonicalFingerprint(challenge.reviewSnapshot)) throw new Error("CONFIRMATION_SOURCE_CHANGED");
  const [{ count }] = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM "PersonalCalendarSmsConfirmation" WHERE namespace=$1 AND phase IN ('PREPARED','WAITING','CONSUMED')`, challenge.namespace);
  const matched = inspectSmsCalendarConfirmation({ prepared: challenge.prepared, currentBinding: loaded.current, body: source.body, now: now.toISOString(), activeChallengeCount: Number(count), phase: challenge.phase });
  if (matched.status !== "MATCHED_NOT_AUTHORIZED") {
    await tx.$executeRawUnsafe(`UPDATE "PersonalCalendarSmsConfirmation" SET "failedAttempts"="failedAttempts"+1,
      phase=CASE WHEN "failedAttempts"+1>=5 THEN 'REFUSED' ELSE phase END,"updatedAt"=clock_timestamp() WHERE id=$1 AND phase='WAITING'`, challenge.id);
    // One failed source can consume at most one attempt, even if its worker is replayed.
    const refused = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,result=$6::jsonb,"updatedAt"=clock_timestamp()
      WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$4 AND status='processing' AND attempts=1
        AND kind='personal_sms_inbound' AND "leaseUntil"=$5 AND "leaseUntil">clock_timestamp()`, sourceClaim.operationId, actor.workspaceId, actor.userId,
    rows[0].requestHash, new Date(sourceClaim.leaseUntil), JSON.stringify({ source: "CALENDAR_CONFIRMATION", challengeId: challenge.id,
      reply: "Cette confirmation ne correspond pas au rendez-vous en attente. Aucun ajout Google n’est confirmé.", confirmationRefused: true, executionAuthorized: false, automaticRetry: false }));
    if (refused !== 1) throw new Error("CONFIRMATION_SOURCE_CLAIM_LOST");
    return Object.freeze({ status: "REFUSED" as const, executionAuthorized: false as const });
  }
  const calendarClaim = await claimPersonalCalendarWriteInTransaction(tx, { ...actor, operationId: matched.operationId, expectedRequestHash: matched.expectedRequestHash }, env,
    { ...context, deadlineAt: Math.min(context.deadlineAt ?? Infinity, Date.parse(sourceClaim.leaseUntil), challenge.expiresAt.getTime()) });
  const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalCalendarSmsConfirmation" SET phase='CONSUMED',"confirmationSourceOperationId"=$2,
    "confirmationSourceRequestHash"=$3,"confirmationProviderSid"=$4,"confirmationSourceClaim"=$5::jsonb,"calendarClaim"=$6::jsonb,"consumedAt"=clock_timestamp(),"updatedAt"=clock_timestamp()
    WHERE id=$1 AND phase='WAITING' AND "expiresAt">clock_timestamp()`, challenge.id, sourceClaim.operationId, rows[0].requestHash, source.messageSid,
  JSON.stringify(sourceClaim), JSON.stringify(calendarClaim));
  if (changed !== 1) throw new Error("CONFIRMATION_ALREADY_CONSUMED");
  const receipt = { source: "CALENDAR_CONFIRMATION", reply: "Confirmation exacte reçue. L’ajout à Google Agenda n’est pas encore confirmé.", challengeId: challenge.id,
    calendarOperationId: matched.operationId, calendarWriteConfirmed: false, executionAuthorized: false, automaticRetry: false };
  const completed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,result=$6::jsonb,"updatedAt"=clock_timestamp()
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$4 AND kind='personal_sms_inbound'
      AND status='processing' AND attempts=1 AND "leaseUntil"=$5 AND "leaseUntil">clock_timestamp()`, sourceClaim.operationId, actor.workspaceId, actor.userId,
  rows[0].requestHash, new Date(sourceClaim.leaseUntil), JSON.stringify(receipt));
  if (completed !== 1) throw new Error("CONFIRMATION_SOURCE_CLAIM_LOST");
  return Object.freeze({ status: "CONSUMED_NOT_EXECUTED" as const, executionAuthorized: false as const, calendarWriteConfirmed: false as const, calendarClaim, receipt });
}

/** Only mirrors an already durable calendar terminal state; never retries or
 * declares a write from a supplied result. Expired consumed work is NOT reusable. */
export async function reconcileCalendarSmsConfirmationInTransaction(tx: DB, input: { actor: Actor; challengeId: string }, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const actor = actorSchema.parse(input.actor), challenge = await lockChallenge(tx, actor, input.challengeId);
  if (challenge.phase !== "CONSUMED") throw new Error("CONFIRMATION_NOT_CONSUMED");
  const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(`SELECT status FROM "PersonalAssistantOperation" WHERE id=$1
    AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='calendar_write' AND attempts=1 AND "requestHash"=$4
    AND status IN ('completed','uncertain') FOR SHARE`, challenge.calendarOperationId, actor.workspaceId, actor.userId, challenge.prepared.binding.calendar.requestHash);
  if (rows.length !== 1) return Object.freeze({ status: "WAITING_FOR_DURABLE_CALENDAR_RESULT" as const, executionAuthorized: false as const });
  const phase = rows[0].status === "completed" ? "COMPLETED" : "UNCERTAIN";
  await tx.$executeRawUnsafe(`UPDATE "PersonalCalendarSmsConfirmation" SET phase=$2,"updatedAt"=clock_timestamp() WHERE id=$1 AND phase='CONSUMED'`, challenge.id, phase);
  return Object.freeze({ status: phase, executionAuthorized: false as const, observedCalendarState: rows[0].status, providerDeliveryInferred: false as const });
}

/** Bounded bookkeeping only. Never releases or deletes the permanent nonce. */
export async function expireCalendarSmsConfirmationsInTransaction(tx: DB, actorInput: Actor, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const actor = actorSchema.parse(actorInput);
  const count = await tx.$executeRawUnsafe(`WITH expired AS (SELECT id FROM "PersonalCalendarSmsConfirmation"
    WHERE "workspaceId"=$1 AND "userId"=$2 AND phase IN ('PREPARED','WAITING') AND "expiresAt"<=clock_timestamp()
    ORDER BY "expiresAt",id LIMIT 25 FOR UPDATE SKIP LOCKED)
    UPDATE "PersonalCalendarSmsConfirmation" c SET phase='EXPIRED',"updatedAt"=clock_timestamp() FROM expired WHERE c.id=expired.id`, actor.workspaceId, actor.userId);
  return Object.freeze({ status: "EXPIRED_BOOKKEEPING_ONLY" as const, executionAuthorized: false as const, count });
}
