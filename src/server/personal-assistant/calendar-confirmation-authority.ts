import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { personalCalendarDraftSchema } from "./calendar-draft-contract";
import { inspectPreparedSmsCalendarConfirmation, SMS_CALENDAR_CONFIRMATION_VERSION, type PreparedSmsCalendarConfirmation, type SmsCalendarConfirmationBinding } from "./calendar-sms-confirmation-contract";
import type { ConnectorEnvironment } from "./google-client";
import type { PersonalSmsSourceClaim } from "./sms-worker";

const id = z.string().min(1).max(191);
const actorSchema = z.object({ userId: id, workspaceId: id }).strict();
const receivedSchema = z.object({ schemaVersion: z.literal(1), accountSid: z.string(), messageSid: z.string().regex(/^SM[a-f0-9]{32}$/),
  from: z.string(), to: z.string(), body: z.string().min(1).max(10000), contentHash: z.string(), identityId: id }).strict();
const storedDraftSchema = personalCalendarDraftSchema.extend({ accountVersion: z.number().int().positive(), requestId: z.string().uuid() }).strict();
const bridgeRequestSchema = z.object({ to: z.string(), from: z.string(), text: z.string(), sourceOperationId: id }).strict();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true";
type Actor = z.infer<typeof actorSchema>;
type DB = Prisma.TransactionClient;

type Stored = { id: string; workspaceId: string; userId: string; sourceOperationId: string; modelChildOperationId: string;
  calendarOperationId: string; summaryOperationId: string; bridgeOutboundOperationId: string | null; reviewActionId: string;
  phase: "PREPARED" | "WAITING" | "CONSUMED" | "COMPLETED" | "UNCERTAIN" | "EXPIRED" | "REFUSED";
  prepared: PreparedSmsCalendarConfirmation; reviewSnapshot: unknown; bindingHash: string; namespace: string; nonReuseKey: string;
  summaryHash: string; summaryRequestHash: string; expiresAt: Date; acceptedAt: Date | null; failedAttempts: number };
type BindingRow = { sourceRequest: unknown; sourceRequestHash: string; sourceResult: unknown; sourceCreatedAt: Date;
  identityId: string; identityRevision: Date; smsAccountId: string; smsAccountVersion: number;
  smsInboundGrantId: string; smsInboundGrantVersion: number;
  memberId: string; memberRevision: Date; workspaceRevision: Date; calendarRequest: unknown; calendarRequestHash: string;
  accountId: string; accountVersion: number; credentialId: string; writeGrantId: string; writeGrantVersion: number;
  calendarProvider: "google_calendar" | "endvera_android_device" };

async function clock(tx: DB) {
  const [row] = await tx.$queryRawUnsafe<Array<{ now: Date }>>('SELECT clock_timestamp() AS now');
  if (!(row?.now instanceof Date) || !Number.isFinite(row.now.getTime())) throw new Error("CONFIRMATION_DB_CLOCK_REQUIRED");
  return row.now;
}
function checkedSource(raw: unknown, requestHash: string) {
  const source = receivedSchema.parse(raw);
  const { accountSid, messageSid, from, to, body } = source;
  if (sha(JSON.stringify({ accountSid, messageSid, from, to, body })) !== requestHash) throw new Error("CONFIRMATION_SOURCE_CHANGED");
  return source;
}
async function lockChallenge(tx: DB, actor: Actor, challengeId: string) {
  const rows = await tx.$queryRawUnsafe<Stored[]>(`SELECT * FROM "PersonalCalendarSmsConfirmation"
    WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 FOR UPDATE`, id.parse(challengeId), actor.workspaceId, actor.userId);
  if (rows.length !== 1) throw new Error("CONFIRMATION_OWNER_OR_CHALLENGE_REQUIRED");
  return rows[0];
}
/** Reuses the canonical stored review proof in prepare, and re-loads current
 * owner, SMS identity and Google write binding here. No credential is decrypted. */
async function binding(tx: DB, actor: Actor, input: { sourceOperationId: string; modelChildOperationId: string; calendarOperationId: string; reviewActionId: string }, env: ConnectorEnvironment, sourceClaim?: PersonalSmsSourceClaim) {
  const rows = await tx.$queryRawUnsafe<BindingRow[]>(`SELECT s.request "sourceRequest",s."requestHash" "sourceRequestHash",s.result "sourceResult",s."createdAt" "sourceCreatedAt",
    i.id "identityId",i."updatedAt" "identityRevision",a.id "smsAccountId",a."stateVersion" "smsAccountVersion",
    sg.id "smsInboundGrantId",sg."stateVersion" "smsInboundGrantVersion",
    m.id "memberId",m."updatedAt" "memberRevision",w."updatedAt" "workspaceRevision",
    d.request "calendarRequest",d."requestHash" "calendarRequestHash",g.id "accountId",g."stateVersion" "accountVersion",g.provider "calendarProvider",
    c.id "credentialId",r.id "writeGrantId",r."stateVersion" "writeGrantVersion"
    FROM "PersonalAssistantOperation" s
    JOIN "PersonalAssistantOperation" child ON child.id=$4 AND child."sourcePersonalOperationId"=s.id
      AND child."workspaceId"=s."workspaceId" AND child."createdByUserId"=s."createdByUserId"
    JOIN "PersonalAssistantOperation" d ON d.id=$5 AND d."workspaceId"=s."workspaceId" AND d."createdByUserId"=s."createdByUserId"
    JOIN "ConstructionWorkspace" w ON w.id=s."workspaceId" AND w."ownerUserId"=s."createdByUserId"
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=s."createdByUserId"
    JOIN "ConstructionCommunicationIdentity" i ON i.id=s.request->>'identityId' AND i."workspaceId"=w.id AND i."userId"=s."createdByUserId"
    JOIN "ConstructionConnectorAccount" a ON a.id=s."connectorAccountId" AND a."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" sg ON sg."connectorAccountId"=a.id
    JOIN "ConstructionConnectorAccount" g ON g.id=d."connectorAccountId" AND g."workspaceId"=w.id AND g."createdByUserId"=s."createdByUserId"
    JOIN "ConstructionConnectorCredential" c ON c.id=g."credentialRef" AND c."connectorAccountId"=g.id AND c."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" r ON r."connectorAccountId"=g.id
    WHERE s.id=$1 AND s."workspaceId"=$2 AND s."createdByUserId"=$3 AND s.kind='personal_sms_inbound'
      AND (($6::timestamptz IS NULL AND s.status='completed') OR ($6::timestamptz IS NOT NULL AND s.status='processing' AND s.attempts=1 AND s."leaseUntil"=($6::timestamptz AT TIME ZONE 'UTC') AND s."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')))
      AND child.kind='personal_model_candidate_v1' AND child.status='completed'
      AND d.kind='calendar_write' AND d.status='pending' AND d.attempts=0 AND d."leaseUntil" IS NULL
      AND d."correlatedTemporalReceiptId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" correlated WHERE correlated."calendarOperationId"=d.id)
      AND w.status='active' AND m.status='active' AND m.role='owner'
      AND i.channel='sms' AND i.status='active' AND i.verified=true AND 'COMMAND'=ANY(i.permissions)
      AND i."normalizedAddress"=s.request->>'from'
      AND NOT EXISTS (SELECT 1 FROM "ConstructionCommunicationIdentity" other WHERE other.channel='sms' AND other.status='active'
        AND other.verified=true AND other."normalizedAddress"=i."normalizedAddress" AND other.id<>i.id)
      AND a.provider='endvera_sms' AND a.status='connected' AND a."revokedAt" IS NULL AND a."externalAccountKeyHash"=$7
      AND sg.capability='sms_inbound' AND sg.status='active' AND sg."revokedAt" IS NULL
      AND g.provider IN ('google_calendar','endvera_android_device') AND g.status='connected' AND g."revokedAt" IS NULL AND c."revokedAt" IS NULL
      AND r.capability='calendar_write' AND r.status='active' AND r."revokedAt" IS NULL
      AND ((g.provider='google_calendar' AND $8=ANY(g."grantedScopes") AND $8=ANY(r."grantedScopes"))
        OR (g.provider='endvera_android_device' AND $9=ANY(g."grantedScopes") AND $9=ANY(r."grantedScopes")))
    FOR SHARE OF s,child,d,w,m,i,a,sg,g,c,r`, input.sourceOperationId, actor.workspaceId, actor.userId,
  input.modelChildOperationId, input.calendarOperationId, sourceClaim ? new Date(sourceClaim.leaseUntil) : null, sha(env.TWILIO_ACCOUNT_SID ?? ""),
  GOOGLE_CALENDAR_WRITE_SCOPE, "device:calendar:write");
  if (rows.length !== 1) throw new Error("CONFIRMATION_CURRENT_BINDING_REQUIRED");
  const row = rows[0], source = checkedSource(row.sourceRequest, row.sourceRequestHash), draft = storedDraftSchema.parse(row.calendarRequest);
  if (source.accountSid !== env.TWILIO_ACCOUNT_SID || source.to !== env.TWILIO_PHONE_NUMBER || draft.accountVersion !== row.accountVersion) throw new Error("CONFIRMATION_CURRENT_BINDING_REQUIRED");
  const current: SmsCalendarConfirmationBinding = {
    owner: { ...actor, identityId: row.identityId, identityRevision: row.identityRevision.toISOString(), smsAccountId: row.smsAccountId,
      smsAccountVersion: row.smsAccountVersion, ownerNumber: source.from, endveraNumber: source.to, memberId: row.memberId,
      smsInboundGrantId: row.smsInboundGrantId, smsInboundGrantVersion: row.smsInboundGrantVersion,
      memberRole: "owner", memberRevision: row.memberRevision.toISOString(), workspaceRevision: row.workspaceRevision.toISOString() },
    source: { operationId: input.sourceOperationId, requestHash: row.sourceRequestHash, providerMessageId: source.messageSid,
      modelChildOperationId: input.modelChildOperationId, reviewActionId: input.reviewActionId },
    calendar: { operationId: input.calendarOperationId, requestHash: row.calendarRequestHash, requestId: draft.requestId,
      accountId: row.accountId, accountVersion: row.accountVersion, credentialId: row.credentialId, writeGrantId: row.writeGrantId, writeGrantVersion: row.writeGrantVersion },
    draft: { title: draft.title, startsAt: draft.startsAt, endsAt: draft.endsAt, timezone: draft.timezone }, policyVersion: SMS_CALENDAR_CONFIRMATION_VERSION,
  };
  return { current, row, source, calendarProvider: row.calendarProvider };
}

/** Pending bridge preparation is not acceptance. The actual outbox must first
 * persist its accepted source/challenge-bound receipt; a supplied SID is never enough. */
export async function markCalendarSmsConfirmationWaitingInTransaction(tx: DB, input: { actor: Actor; challengeId: string; bridgeOutboundOperationId: string }, env: ConnectorEnvironment = process.env) {
  if (!enabled(env)) return disabled();
  const actor = actorSchema.parse(input.actor), challenge = await lockChallenge(tx, actor, input.challengeId), now = await clock(tx);
  if (challenge.phase !== "PREPARED" || challenge.expiresAt <= now) throw new Error("CONFIRMATION_NOT_PREPARED");
  const rows = await tx.$queryRawUnsafe<Array<{ providerSid: string; request: unknown; requestHash: string }>>(`SELECT o.result->>'providerSid' "providerSid",o.request,o."requestHash" FROM "PersonalAssistantOperation" o
    JOIN "PersonalAssistantOperation" s ON s.id=$4 AND s.kind='calendar_confirmation_summary'
    WHERE o.id=$1 AND o."workspaceId"=$2 AND o."createdByUserId"=$3 AND o.kind='sms_outbound' AND o.status='completed' AND o.attempts=1
      AND o."idempotencyKey"=$5 AND o.result->>'acceptedByProvider'='true' AND o.request->>'text'=s.request->>'text'
      AND o.request->>'to'=s.request->>'to' AND o.request->>'from'=s.request->>'from' AND o.request->>'sourceOperationId'=$6
      AND o.result->>'approvalHash'=o."requestHash" AND s.request->>'challengeId'=$7 AND s.request->>'summaryHash'=$8
    FOR SHARE OF o,s`, id.parse(input.bridgeOutboundOperationId), actor.workspaceId, actor.userId, challenge.summaryOperationId,
  `calendar-confirmation:${challenge.id}`, challenge.sourceOperationId, challenge.id, challenge.summaryHash);
  if (rows.length !== 1 || !/^SM[a-f0-9]{32}$/.test(rows[0].providerSid)) throw new Error("CONFIRMATION_DURABLE_OUTBOX_BRIDGE_REQUIRED");
  if (sha(JSON.stringify(bridgeRequestSchema.parse(rows[0].request))) !== rows[0].requestHash) throw new Error("CONFIRMATION_OUTBOX_BRIDGE_CHANGED");
  const current = await binding(tx, actor, challenge, env);
  if (canonicalFingerprint(current.current) !== canonicalFingerprint(challenge.prepared.binding)) throw new Error("CONFIRMATION_BINDING_CHANGED");
  const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalCalendarSmsConfirmation" SET phase='WAITING',"bridgeOutboundOperationId"=$2,"acceptedProviderSid"=$3,"acceptedAt"=(clock_timestamp() AT TIME ZONE 'UTC'),"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
    WHERE id=$1 AND phase='PREPARED' AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')`, challenge.id, input.bridgeOutboundOperationId, rows[0].providerSid);
  if (changed !== 1) throw new Error("CONFIRMATION_NOT_PREPARED");
  return Object.freeze({ status: "WAITING_FOR_EXACT_CONFIRMATION" as const, executionAuthorized: false as const, deliveryConfirmed: false as const });
}


export { clock as confirmationDatabaseClock, checkedSource as checkedCalendarConfirmationSource,
  lockChallenge as lockCalendarConfirmation, binding as loadCalendarConfirmationBinding };

const bridgeEnabled = (env: ConnectorEnvironment) => enabled(env) && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED === "true";
const bridgeInputSchema = z.object({ actor: actorSchema, challengeId: id }).strict();
const reviewSchema = z.object({ status: z.literal("REVIEW_PREPARED_NOT_AUTHORIZED"), executionAuthorized: z.literal(false),
  semanticIntentVerified: z.literal(false), modelChildOperationId: id,
  source: z.object({ operationId: id, text: z.string(), receivedAt: z.string().datetime({ offset: true }) }).passthrough(),
  actions: z.array(z.object({ actionId: id, kind: z.literal("PREPARE_CALENDAR_EVENT"), status: z.literal("PREPARED_UNSENT"),
    operationId: id, requestHash: z.string(), draft: personalCalendarDraftSchema }).strict()).length(1) }).passthrough();
function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") { for (const child of Object.values(value)) immutable(child); Object.freeze(value); }
  return value;
}
/** Current locked preparation proof only. No dispatch, approval, credential
 * decryption or source reinterpretation. Caller must retain the transaction. */
export async function inspectCalendarConfirmationBridgePreparationInTransaction(tx: DB, supplied: { actor: Actor; challengeId: string }, env: ConnectorEnvironment = process.env) {
  if (!bridgeEnabled(env)) return disabled();
  const input = bridgeInputSchema.parse(supplied);
  const challenge = await lockChallenge(tx, input.actor, input.challengeId);
  const current = await binding(tx, input.actor, challenge, env), now = await clock(tx);
  if (challenge.phase !== "PREPARED" || challenge.bridgeOutboundOperationId !== null || challenge.acceptedAt !== null
    || challenge.failedAttempts !== 0 || !(challenge.expiresAt instanceof Date) || challenge.expiresAt <= now) throw new Error("CONFIRMATION_NOT_PREPARED");
  const inspected = inspectPreparedSmsCalendarConfirmation({ prepared: challenge.prepared, currentBinding: current.current, now: now.toISOString() });
  if (inspected.status !== "PREPARED_SNAPSHOT_VERIFIED_NOT_AUTHORIZED") throw new Error("CONFIRMATION_BINDING_CHANGED");
  const { prepared } = inspected;
  if (prepared.bindingHash !== challenge.bindingHash || prepared.summaryHash !== challenge.summaryHash || prepared.namespace !== challenge.namespace
    || prepared.nonReuseKey !== challenge.nonReuseKey || Date.parse(prepared.expiresAt) !== challenge.expiresAt.getTime()) throw new Error("CONFIRMATION_SNAPSHOT_CHANGED");
  const sourceResult = z.object({ personalModelReview: z.unknown() }).passthrough().parse(current.row.sourceResult);
  if (canonicalFingerprint(sourceResult.personalModelReview) !== canonicalFingerprint(challenge.reviewSnapshot)) throw new Error("CONFIRMATION_REVIEW_CHANGED");
  const review = reviewSchema.parse(challenge.reviewSnapshot), action = review.actions[0];
  if (review.modelChildOperationId !== challenge.modelChildOperationId || review.source.operationId !== challenge.sourceOperationId
    || review.source.text !== current.source.body || Date.parse(review.source.receivedAt) !== current.row.sourceCreatedAt.getTime()
    || action.actionId !== challenge.reviewActionId || action.operationId !== challenge.calendarOperationId || action.requestHash !== current.row.calendarRequestHash
    || canonicalFingerprint(action.draft) !== canonicalFingerprint(prepared.binding.draft)) throw new Error("CONFIRMATION_REVIEW_CHANGED");
  const summaryRequest = { schemaVersion: 1, challengeId: challenge.id, sourceOperationId: challenge.sourceOperationId, modelChildOperationId: challenge.modelChildOperationId,
    calendarOperationId: challenge.calendarOperationId, bindingHash: prepared.bindingHash, summaryHash: prepared.summaryHash,
    to: prepared.binding.owner.ownerNumber, from: prepared.binding.owner.endveraNumber, text: prepared.summary };
  if (sha(JSON.stringify(summaryRequest)) !== challenge.summaryRequestHash) throw new Error("CONFIRMATION_SUMMARY_CHANGED");
  const rows = await tx.$queryRawUnsafe<Array<{ grantId: string; grantVersion: number; grantRevision: Date; grantScopes: string[] }>>(`
    SELECT g.id "grantId",g."stateVersion" "grantVersion",g."updatedAt" "grantRevision",g."grantedScopes" "grantScopes"
    FROM "PersonalAssistantOperation" s
    JOIN "PersonalCalendarSmsConfirmationNonce" n ON n."nonReuseKey"=$6
    JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=s."connectorAccountId"
    WHERE s.id=$1 AND s."workspaceId"=$2 AND s."createdByUserId"=$3 AND s."connectorAccountId"=$4
      AND s.kind='calendar_confirmation_summary' AND s.status='pending' AND s.attempts=0 AND s."leaseUntil" IS NULL
      AND s.result IS NULL AND s."externalTransportPerformed"=false AND s."budgetId" IS NULL AND s."reservedCadMicros" IS NULL
      AND s."idempotencyKey"=$5 AND s.request=$7::jsonb AND s."requestHash"=$8
      AND n.namespace=$9 AND n."phraseHash"=$10
      AND g.capability='personal_sms_send' AND g.status='active' AND g."revokedAt" IS NULL
      AND (SELECT count(*) FROM "PersonalCalendarSmsConfirmation" c WHERE c.namespace=$9 AND c.phase IN ('PREPARED','WAITING','CONSUMED'))=1
    FOR SHARE OF s,n,g`, challenge.summaryOperationId, input.actor.workspaceId, input.actor.userId, prepared.binding.owner.smsAccountId,
  `calendar-confirmation-summary:${challenge.id}`, prepared.nonReuseKey, JSON.stringify(summaryRequest), challenge.summaryRequestHash,
  prepared.namespace, sha(prepared.phrase));
  if (rows.length !== 1 || !Number.isSafeInteger(rows[0].grantVersion) || rows[0].grantVersion < 1
    || !(rows[0].grantRevision instanceof Date) || !Number.isFinite(rows[0].grantRevision.getTime())) throw new Error("CONFIRMATION_SUMMARY_OR_SMS_SEND_GRANT_REQUIRED");
  if (!bridgeEnabled(env)) throw new Error("CONFIRMATION_BRIDGE_DISABLED");
  const request = bridgeRequestSchema.parse({ to: current.source.from, from: current.source.to, text: prepared.summary, sourceOperationId: challenge.sourceOperationId });
  const requestHash = sha(JSON.stringify(request)), idempotencyKey = `calendar-confirmation:${challenge.id}`;
  const fingerprint = canonicalFingerprint({ challengeId: challenge.id, summaryOperationId: challenge.summaryOperationId,
    summaryRequestHash: challenge.summaryRequestHash, prepared, reviewSnapshot: challenge.reviewSnapshot,
    request, requestHash, idempotencyKey, grant: { id: rows[0].grantId, version: rows[0].grantVersion,
      revision: rows[0].grantRevision.toISOString(), scopes: [...rows[0].grantScopes].sort() } });
  return immutable({ status: "BRIDGE_PREPARATION_VERIFIED_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
    actor: input.actor, challengeId: challenge.id, connectorAccountId: prepared.binding.owner.smsAccountId, request, requestHash, idempotencyKey,
    fingerprint, expiresAt: prepared.expiresAt, source: { operationId: challenge.sourceOperationId, text: current.source.body } });
}

export type CalendarConfirmationOutboundRow = Readonly<{ id: string; workspaceId: string; createdByUserId: string;
  connectorAccountId: string; kind: string; idempotencyKey: string; requestHash: string }>;
/** Reinspects actual durable source and outbound row. A supplied proof or a
 * caller's recipient/text never confers authority. Used inside locked outbox gates. */
export async function requireCalendarConfirmationOutboundSourceInTransaction(tx: DB, row: CalendarConfirmationOutboundRow,
  suppliedRequest: unknown, env: ConnectorEnvironment = process.env) {
  if (!bridgeEnabled(env)) throw new Error("CONFIRMATION_BRIDGE_DISABLED");
  if (row.kind !== "sms_outbound" || !row.idempotencyKey.startsWith("calendar-confirmation:")) throw new Error("CONFIRMATION_OUTBOUND_CHANGED");
  const checked = await inspectCalendarConfirmationBridgePreparationInTransaction(tx, { actor: { userId: row.createdByUserId, workspaceId: row.workspaceId },
    challengeId: row.idempotencyKey.slice("calendar-confirmation:".length) }, env);
  if (checked.status !== "BRIDGE_PREPARATION_VERIFIED_NOT_AUTHORIZED") throw new Error("CONFIRMATION_BRIDGE_DISABLED");
  if (row.connectorAccountId !== checked.connectorAccountId || row.idempotencyKey !== checked.idempotencyKey || row.requestHash !== checked.requestHash
    || canonicalFingerprint(bridgeRequestSchema.parse(suppliedRequest)) !== canonicalFingerprint(checked.request)) throw new Error("CONFIRMATION_OUTBOUND_CHANGED");
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "connectorAccountId"=$4 AND kind='sms_outbound'
      AND "idempotencyKey"=$5 AND "requestHash"=$6 AND request=$7::jsonb
      AND ((status IN ('pending','approved') AND attempts=0 AND "leaseUntil" IS NULL)
        OR (status='processing' AND attempts=1 AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')))
    FOR SHARE`, id.parse(row.id), row.workspaceId, row.createdByUserId, row.connectorAccountId, row.idempotencyKey, row.requestHash, JSON.stringify(checked.request));
  if (rows.length !== 1) throw new Error("CONFIRMATION_OUTBOUND_CHANGED");
  if (!bridgeEnabled(env)) throw new Error("CONFIRMATION_BRIDGE_DISABLED");
  return Object.freeze({ kind: "CALENDAR_CONFIRMATION" as const, challengeId: checked.challengeId, fingerprint: checked.fingerprint,
    expiresAt: checked.expiresAt, executionAuthorized: false as const });
}
