import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { personalOutboundExecution, personalOutboundSchema, sendPersonalTwilio, twilioDispatchPolicy, type OutboundKind, type PersonalOutbound, type PersonalOutboundExecutionContext } from "./twilio-outbound";
import type { ConnectorEnvironment } from "./google-client";
import { requireGoogleReadAuthority } from "./google-connection";
import { requireCalendarConfirmationOutboundSourceInTransaction, markCalendarSmsConfirmationWaitingInTransaction } from "./calendar-confirmation-authority";
import { isReservedCalendarConfirmationMessage } from "./calendar-confirmation-routing";
import { inspectTemporalOutboundSourceInTransaction, requireTemporalOutboundBridgeEnabled } from "./sms-temporal-outbound-authority";
import { markSmsTemporalClarificationAskedInTransaction } from "./sms-temporal-clarification-store";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type DB = Prisma.TransactionClient | typeof prisma;
async function requireSelfRecipient(db: DB, userId: string, workspaceId: string, to: string) {
  const member = await db.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
  const identity = await db.constructionCommunicationIdentity.findFirst({ where: { workspaceId, userId, channel: "sms", normalizedAddress: to, verified: true, status: "active", permissions: { has: "COMMAND" } } });
  if (!member || !identity) throw new Error("VERIFIED_SELF_RECIPIENT_REQUIRED");
  return { member, identity };
}

type OutboundOwner = { id: string; workspaceId: string; createdByUserId: string; connectorAccountId: string; kind: string; idempotencyKey: string; requestHash: string };
const revisionDate = (value: Date) => { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("OUTBOUND_AUTHORITY_INVALID"); return value.toISOString(); };
async function currentOutboundAuthority(db: DB, row: OutboundOwner, request: PersonalOutbound, env: ConnectorEnvironment) {
  const { member, identity } = await requireSelfRecipient(db, row.createdByUserId, row.workspaceId, request.to);
  const account = await db.constructionConnectorAccount.findUniqueOrThrow({ where: { id: row.connectorAccountId } });
  if (account.workspaceId !== row.workspaceId || account.provider !== "endvera_sms" || account.status !== "connected" || account.revokedAt
    || account.externalAccountKeyHash !== hash(env.TWILIO_ACCOUNT_SID ?? "") || !Number.isSafeInteger(account.stateVersion) || account.stateVersion < 1) throw new Error("SMS_CONNECTION_REVOKED");
  const grant = await db.constructionConnectorGrant.findFirst({ where: { connectorAccountId: account.id,
    capability: row.kind === "sms_outbound" ? "personal_sms_send" : "personal_voice_send", status: "active", revokedAt: null } });
  if (!grant || !Number.isSafeInteger(grant.stateVersion) || grant.stateVersion < 1) throw new Error("OUTBOUND_GRANT_REQUIRED");
  return { member: { id: member.id, role: member.role, updatedAt: revisionDate(member.updatedAt) },
    identity: { id: identity.id, updatedAt: revisionDate(identity.updatedAt), permissions: [...identity.permissions].sort() },
    account: { id: account.id, stateVersion: account.stateVersion, key: account.externalAccountKeyHash },
    grant: { id: grant.id, stateVersion: grant.stateVersion, scopes: [...grant.grantedScopes].sort(), updatedAt: revisionDate(grant.updatedAt) } };
}
function currentOutboundPolicy(row: OutboundOwner, request: PersonalOutbound, env: ConnectorEnvironment) {
  if (request.from !== env.TWILIO_PHONE_NUMBER) throw new Error("OUTBOUND_CONTENT_CHANGED");
  const policy = twilioDispatchPolicy(env, row.kind as OutboundKind, request.text);
  const fingerprint = hash(JSON.stringify({ budgetId: policy.budgetId, ceiling: policy.ceiling.toString(), reservation: policy.reservation.toString(),
    expiresAt: policy.expiresAt.toISOString(), callback: policy.callback, authority: env.ENDVERA_EXTERNAL_AUTHORITY_REF, owner: env.ENDVERA_EXTERNAL_OWNER_REF,
    account: env.TWILIO_ACCOUNT_SID, keyId: env.TWILIO_API_KEY_SID, from: env.TWILIO_PHONE_NUMBER,
    rateRef: env.ENDVERA_TWILIO_RATE_REVIEW_REF, reviewedAt: env.ENDVERA_TWILIO_RATE_REVIEWED_AT }));
  return { policy, fingerprint };
}
type OutboundClaim = Readonly<{ row: OutboundOwner; request: PersonalOutbound; leaseUntil: Date; approvedUntil: number;
  authority: Awaited<ReturnType<typeof currentOutboundAuthority>>; approvalJson: string;
  source: Awaited<ReturnType<typeof requireCurrentOutboundSource>>;
  policyFingerprint: string; credentialFingerprint: string; budgetId: string; reservation: bigint;
  ceiling: bigint; budgetExpiresAt: Date; automatic: boolean }>;
const credentialFingerprint = (env: ConnectorEnvironment) => hash(JSON.stringify([env.TWILIO_API_KEY_SID, env.TWILIO_API_KEY_SECRET]));
function requireConfirmationBridgeEnabled(env: ConnectorEnvironment) {
  if (env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED !== "true" || env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED !== "true") throw new Error("CONFIRMATION_BRIDGE_DISABLED");
}
function confirmationSourceDeadline(source: Awaited<ReturnType<typeof requireCurrentOutboundSource>>) {
  if (source?.kind !== "CALENDAR_CONFIRMATION" && source?.kind !== "TEMPORAL_CLARIFICATION") return Infinity;
  const expiresAt = Date.parse(source.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error(source.kind === "TEMPORAL_CLARIFICATION" ? "TEMPORAL_OUTBOUND_EXPIRED" : "CONFIRMATION_EXPIRED");
  return expiresAt;
}
function requireOrdinaryOutboundText(text: string) {
  // Routing refusal only; normalization never authorizes a confirmation.
  if (isReservedCalendarConfirmationMessage(text)) throw new Error("CONFIRMATION_RESERVED_OUTBOUND_TEXT");
}
async function withOutboundClaim<T>(claim: OutboundClaim, env: ConnectorEnvironment, execution: ReturnType<typeof personalOutboundExecution>, work: (tx: Prisma.TransactionClient) => T) {
  const requireLive = execution.requireLive;
  requireLive();
  return prisma.$transaction(async tx => {
    const a = claim.authority;
    // Confirmation lifecycle consistently locks its challenge before related
    // source/calendar/outbound rows, matching preparation and consumption.
    if (claim.source?.kind === "CALENDAR_CONFIRMATION") {
      const current = await requireCalendarConfirmationOutboundSourceInTransaction(tx, claim.row, claim.request, env);
      if (current.challengeId !== claim.source.challengeId || current.fingerprint !== claim.source.fingerprint
        || current.expiresAt !== claim.source.expiresAt) throw new Error("CONFIRMATION_BINDING_CHANGED");
      confirmationSourceDeadline(claim.source);
      requireLive();
    }
    if (claim.source?.kind !== "CALENDAR_CONFIRMATION") {
      const current = await inspectTemporalOutboundSourceInTransaction(tx, claim.row, claim.request, env,
        { deadlineAt: execution.deadlineAt, signal: execution.signal });
      if (claim.source?.kind === "TEMPORAL_CLARIFICATION") {
        if (!current || current.fingerprint !== claim.source.fingerprint) throw new Error("TEMPORAL_OUTBOUND_BINDING_CHANGED");
      } else if (current) {
        // A claim cannot gain a new meaning while waiting; never upgrade or
        // ignore an attachment discovered after the original claim.
        throw new Error("TEMPORAL_OUTBOUND_ATTACHMENT_CHANGED");
      }
      confirmationSourceDeadline(claim.source);
      requireLive();
    }
    // Prisma stores DateTime as UTC-naive timestamp(3); raw Date parameters are
    // instants. Normalize explicitly, never using the connection's TimeZone.
    // One locked authority snapshot; later source checks cannot let a concurrent
    // membership/grant/budget revocation slip between validation and invocation.
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT p.id FROM "PersonalAssistantOperation" p
      JOIN "ConstructionWorkspace" w ON w.id=p."workspaceId"
      JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=p."createdByUserId"
      JOIN "ConstructionCommunicationIdentity" i ON i."workspaceId"=w.id AND i."userId"=p."createdByUserId"
      JOIN "ConstructionConnectorAccount" a ON a.id=p."connectorAccountId"
      JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
      JOIN "PersonalAssistantBudget" b ON b.id=p."budgetId"
      WHERE p.id=$1 AND p."workspaceId"=$2 AND p."createdByUserId"=$3 AND p."connectorAccountId"=$4
        AND p.kind=$5 AND p."idempotencyKey"=$6 AND p."requestHash"=$7 AND p.request=$8::jsonb AND p.result=$9::jsonb
        AND p.status='processing' AND p.attempts=1 AND p."leaseUntil"=($10::timestamptz AT TIME ZONE 'UTC') AND p."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')
        AND p."budgetId"=$11 AND p."reservedCadMicros"=$12 AND w.status='active'
        AND m.id=$13 AND m.role::text=$14 AND m.role::text IN ('owner','admin') AND m.status='active' AND m."updatedAt"=($15::timestamptz AT TIME ZONE 'UTC')
        AND i.id=$16 AND i.channel='sms' AND i."normalizedAddress"=$17 AND i.verified=true AND i.status='active'
        AND 'COMMAND'=ANY(i.permissions) AND i."updatedAt"=($18::timestamptz AT TIME ZONE 'UTC') AND i.permissions @> $19::text[] AND i.permissions <@ $19::text[]
        AND a."workspaceId"=w.id AND a.provider='endvera_sms' AND a.status='connected' AND a."revokedAt" IS NULL
        AND a."stateVersion"=$20 AND a."externalAccountKeyHash"=$21
        AND g.id=$22 AND g.capability=$23 AND g.status='active' AND g."revokedAt" IS NULL AND g."stateVersion"=$24
        AND g."updatedAt"=($25::timestamptz AT TIME ZONE 'UTC') AND g."grantedScopes" @> $26::text[] AND g."grantedScopes" <@ $26::text[]
        AND b."ceilingCadMicros"=$27 AND b."expiresAt"=($28::timestamptz AT TIME ZONE 'UTC') AND b."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')
        AND b."reservedCadMicros">=$12 AND b."reservedCadMicros"<=b."ceilingCadMicros"
      FOR SHARE OF p,w,m,i,a,g,b`, claim.row.id, claim.row.workspaceId, claim.row.createdByUserId, claim.row.connectorAccountId,
    claim.row.kind, claim.row.idempotencyKey, claim.row.requestHash, JSON.stringify(claim.request), claim.approvalJson,
    claim.leaseUntil, claim.budgetId, claim.reservation, a.member.id, a.member.role, new Date(a.member.updatedAt),
    a.identity.id, claim.request.to, new Date(a.identity.updatedAt), a.identity.permissions, a.account.stateVersion, a.account.key,
    a.grant.id, claim.row.kind === "sms_outbound" ? "personal_sms_send" : "personal_voice_send", a.grant.stateVersion,
    new Date(a.grant.updatedAt), a.grant.scopes, claim.ceiling, claim.budgetExpiresAt);
    if (rows.length !== 1 || claim.approvedUntil <= Date.now()) throw new Error("OUTBOUND_CLAIM_OR_AUTHORITY_CHANGED");
    requireLive();
    if (claim.source?.kind === "ORDINARY_REPLY" || claim.source?.kind === "TEMPORAL_CLARIFICATION") {
      const original = claim.source.kind === "TEMPORAL_CLARIFICATION" ? claim.source.ordinarySource : claim.source;
      const sources = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalAssistantOperation"
        WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='personal_sms_inbound' AND status='completed'
          AND "requestHash"=$4 AND request=$5::jsonb AND result=$6::jsonb FOR SHARE`,
      original.id, claim.row.workspaceId, claim.row.createdByUserId, original.requestHash, original.requestJson, original.resultJson);
      if (sources.length !== 1) throw new Error("AUTOMATIC_REPLY_REFUSED");
      await requireCurrentReplySource(tx, claim.row, claim.request, env);
    }
    requireLive();
    confirmationSourceDeadline(claim.source);
    if (claim.source?.kind === "CALENDAR_CONFIRMATION") requireConfirmationBridgeEnabled(env);
    if (claim.source?.kind === "TEMPORAL_CLARIFICATION") requireTemporalOutboundBridgeEnabled(env);
    if (claim.automatic && env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("AUTOMATIC_REPLIES_DISABLED");
    if (currentOutboundPolicy(claim.row, claim.request, env).fingerprint !== claim.policyFingerprint
      || credentialFingerprint(env) !== claim.credentialFingerprint) throw new Error("OUTBOUND_POLICY_CHANGED");
    // Callers wrap network promises in an object: initiate under row locks,
    // release locks on commit, then await I/O. Never retry serialization errors.
    return work(tx);
  }, { isolationLevel: "Serializable", maxWait: 1000, timeout: Math.max(1, Math.min(5000, execution.deadlineAt - Date.now())) });
}
/** Source-derived replies retain their disclosure authority even when somebody
 * uses the ordinary approval endpoint instead of the automatic-reply worker. */
async function requireCurrentReplySource(db: DB, row: { workspaceId: string; createdByUserId: string; idempotencyKey: string },
  request: PersonalOutbound, env: ConnectorEnvironment) {
  requireOrdinaryOutboundText(request.text);
  if (!request.sourceOperationId && !row.idempotencyKey.startsWith("reply:")) return null;
  if (!request.sourceOperationId || row.idempotencyKey !== `reply:${request.sourceOperationId}`) throw new Error("AUTOMATIC_REPLY_REFUSED");
  const source = await db.personalAssistantOperation.findFirst({ where: { id: request.sourceOperationId, workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId, kind: "personal_sms_inbound", status: "completed" } });
  const inbound = source?.request as { from?: string; to?: string } | undefined;
  const answer = source?.result as { reply?: string; source?: string; googleReadAuthority?: unknown } | undefined;
  if (!source || inbound?.from !== request.to || inbound.to !== request.from || answer?.reply !== request.text) throw new Error("AUTOMATIC_REPLY_REFUSED");
  if (answer.source === "GOOGLE_CALENDAR") await requireGoogleReadAuthority(db, row.createdByUserId, row.workspaceId, answer.googleReadAuthority, env);
  return Object.freeze({ id: source.id, requestHash: source.requestHash, requestJson: JSON.stringify(source.request), resultJson: JSON.stringify(source.result) });
}
/** Explicitly separated sources: confirmation summaries never inherit the ordinary
 * reply's authority, and the existing reply grammar/disclosure checks stay strict. */
async function requireCurrentOutboundSource(tx: Prisma.TransactionClient, row: OutboundOwner, request: PersonalOutbound, env: ConnectorEnvironment,
  context: PersonalOutboundExecutionContext = { deadlineAt: Date.now() + 5000 }) {
  if (row.idempotencyKey.startsWith("calendar-confirmation:")) {
    requireConfirmationBridgeEnabled(env);
    if (row.kind !== "sms_outbound" || !request.sourceOperationId) throw new Error("CONFIRMATION_OUTBOX_BRIDGE_CHANGED");
    return requireCalendarConfirmationOutboundSourceInTransaction(tx, row, request, env);
  }
  const temporal = await inspectTemporalOutboundSourceInTransaction(tx, row, request, env,
    { deadlineAt: context.deadlineAt ?? Date.now() + 5000, signal: context.signal });
  const source = await requireCurrentReplySource(tx, row, request, env);
  if (temporal) {
    if (!source || source.id !== temporal.sourceOperationId) throw new Error("TEMPORAL_OUTBOUND_SOURCE_CHANGED");
    return Object.freeze({ kind: "TEMPORAL_CLARIFICATION" as const, ...temporal, ordinarySource: source });
  }
  return source ? Object.freeze({ kind: "ORDINARY_REPLY" as const, ...source }) : null;
}
export async function preparePersonalOutbound(input: { userId: string; workspaceId: string; kind: OutboundKind; to: string; text: string; requestId: string }, env: ConnectorEnvironment = process.env) {
  return prisma.$transaction(tx => preparePersonalOutboundInTransaction(tx, input, env), { isolationLevel: "Serializable" });
}
/** Preparation only: does not approve, reserve transport spend or send. */
export async function preparePersonalOutboundInTransaction(tx: Prisma.TransactionClient, input: { userId: string; workspaceId: string; kind: OutboundKind; to: string; text: string; requestId: string }, env: ConnectorEnvironment = process.env) {
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error("REQUEST_ID_REQUIRED");
  const request = personalOutboundSchema.parse({ to: input.to, from: env.TWILIO_PHONE_NUMBER, text: input.kind === "voice_outbound" ? `Bonjour, ici l’assistant ENDVERA. ${input.text}` : input.text });
  requireOrdinaryOutboundText(request.text);
  if (!["sms_outbound", "voice_outbound"].includes(input.kind) || input.kind === "voice_outbound" && request.text.length > 600) throw new Error("OUTBOUND_REQUEST_REFUSED");
  const requestHash = hash(JSON.stringify(request));
  await requireSelfRecipient(tx, input.userId, input.workspaceId, request.to);
  const account = await tx.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "endvera_sms" } } });
  const idempotencyKey = `personal-outbound:${input.workspaceId}:${input.requestId}`;
  const existing = await tx.personalAssistantOperation.findUnique({ where: { idempotencyKey } });
  if (existing) { if (existing.requestHash !== requestHash || existing.createdByUserId !== input.userId || existing.kind !== input.kind) throw new Error("OUTBOUND_REPLAY_CONFLICT"); return { operationId: existing.id, requestHash, status: existing.status }; }
  const row = await tx.personalAssistantOperation.create({ data: { id: randomUUID(), workspaceId: input.workspaceId, connectorAccountId: account.id, kind: input.kind, status: "pending", request, requestHash, idempotencyKey, createdByUserId: input.userId } });
  return { operationId: row.id, requestHash, status: row.status };
}
export async function approvePersonalOutbound(input: { userId: string; workspaceId: string; operationId: string; expectedRequestHash: string }, env: ConnectorEnvironment = process.env) {
  return prisma.$transaction(async tx => {
    const row = await tx.personalAssistantOperation.findFirst({ where: { id: input.operationId, workspaceId: input.workspaceId, createdByUserId: input.userId, kind: { in: ["sms_outbound", "voice_outbound"] } } });
    if (!row || row.status !== "pending" || row.requestHash !== input.expectedRequestHash) throw new Error("APPROVAL_REFUSED_OR_ALREADY_USED");
    const request = personalOutboundSchema.parse(row.request);
    if (hash(JSON.stringify(request)) !== row.requestHash) throw new Error("OUTBOUND_CONTENT_CHANGED");
    await requireSelfRecipient(tx, input.userId, input.workspaceId, request.to);
    await requireCurrentOutboundSource(tx, row, request, env);
    const policy = twilioDispatchPolicy(env, row.kind as OutboundKind, request.text);
    const update = await tx.personalAssistantOperation.updateMany({ where: { id: row.id, status: "pending", requestHash: input.expectedRequestHash }, data: { status: "approved", result: { approvedBy: input.userId, approvedHash: row.requestHash, approvedUntil: new Date(Math.min(Date.now() + 600000, policy.expiresAt.getTime())).toISOString() } } });
    if (update.count !== 1) throw new Error("APPROVAL_REFUSED_OR_ALREADY_USED");
    return { approved: true as const, operationId: row.id };
  }, { isolationLevel: "Serializable" });
}
export async function dispatchPersonalOutbound(operationId: string, env: ConnectorEnvironment = process.env, transport: typeof fetch = fetch, context: PersonalOutboundExecutionContext = {}) {
  return dispatchOutbound(operationId, env, transport, context, false);
}
async function dispatchOutbound(operationId: string, env: ConnectorEnvironment, transport: typeof fetch, context: PersonalOutboundExecutionContext, automatic: boolean) {
  const execution = personalOutboundExecution(context);
  let claimed: OutboundClaim | undefined;
  let transportAttempted = false;
  try {
  execution.requireLive();
  await execution.wait(() => prisma.$transaction(async tx => {
    execution.requireLive();
    const row = await tx.personalAssistantOperation.findUnique({ where: { id: operationId } });
    if (!row || row.status !== "approved" || row.attempts !== 0 || !["sms_outbound", "voice_outbound"].includes(row.kind)) throw new Error("APPROVAL_REQUIRED");
    const approval = row.result as { approvedBy?: string; approvedHash?: string; approvedUntil?: string } | null;
    if (approval?.approvedBy !== row.createdByUserId || approval.approvedHash !== row.requestHash || !(Date.parse(approval.approvedUntil ?? "") > Date.now())) throw new Error("APPROVAL_EXPIRED_OR_CHANGED");
    const request = personalOutboundSchema.parse(row.request);
    if (hash(JSON.stringify(request)) !== row.requestHash || request.from !== env.TWILIO_PHONE_NUMBER) throw new Error("OUTBOUND_CONTENT_CHANGED");
    const source = await requireCurrentOutboundSource(tx, row, request, env, { deadlineAt: execution.deadlineAt, signal: execution.signal });
    execution.requireLive();
    const authority = await currentOutboundAuthority(tx, row, request, env);
    execution.requireLive();
    const sourceDeadline = confirmationSourceDeadline(source);
    const { policy, fingerprint: policyFingerprint } = currentOutboundPolicy(row, request, env);
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${policy.budgetId}, 0))::text AS acquired`);
    const budget = await tx.personalAssistantBudget.upsert({ where: { id: policy.budgetId }, create: { id: policy.budgetId, ceilingCadMicros: policy.ceiling, expiresAt: policy.expiresAt }, update: {} });
    if (budget.ceilingCadMicros !== policy.ceiling || budget.expiresAt.getTime() !== policy.expiresAt.getTime() || budget.reservedCadMicros + policy.reservation > budget.ceilingCadMicros) throw new Error("BUDGET_EXHAUSTED_OR_CHANGED");
    execution.requireLive();
    await tx.personalAssistantBudget.update({ where: { id: budget.id }, data: { reservedCadMicros: { increment: policy.reservation } } });
    execution.requireLive();
    claimed = Object.freeze({ row: Object.freeze({ id: row.id, workspaceId: row.workspaceId, createdByUserId: row.createdByUserId,
      connectorAccountId: row.connectorAccountId, kind: row.kind, idempotencyKey: row.idempotencyKey, requestHash: row.requestHash }),
      request: Object.freeze(request), leaseUntil: new Date(Math.min(execution.deadlineAt, Date.parse(approval.approvedUntil!), sourceDeadline)), approvedUntil: Date.parse(approval.approvedUntil!),
      // Unique attempt ownership also fences ambiguous commit outcomes. Equal
      // millisecond leases never let a losing claimant terminalize its winner.
      authority, source, approvalJson: JSON.stringify({ ...(row.result as Prisma.JsonObject), outboundClaimToken: randomUUID() }), automatic, ceiling: policy.ceiling, budgetExpiresAt: policy.expiresAt,
      policyFingerprint, credentialFingerprint: credentialFingerprint(env), budgetId: budget.id, reservation: policy.reservation });
    const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='processing',"budgetId"=$5,"reservedCadMicros"=$6,attempts=1,"leaseUntil"=($7::timestamptz AT TIME ZONE 'UTC'),result=$8::jsonb,"updatedAt"=(now() AT TIME ZONE 'UTC')
      WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$4 AND status='approved' AND attempts=0
        AND $7::timestamptz>clock_timestamp() AND result=$9::jsonb`, row.id, row.workspaceId, row.createdByUserId, row.requestHash, budget.id, policy.reservation, claimed.leaseUntil, claimed.approvalJson, JSON.stringify(row.result));
    if (changed !== 1) throw new Error("APPROVAL_ALREADY_CONSUMED");
    execution.requireLive();
  }, { isolationLevel: "Serializable", maxWait: 1000, timeout: Math.max(1, Math.min(5000, execution.deadlineAt - Date.now())) }));
    if (!claimed) throw new Error("OUTBOUND_CLAIM_LOST");
    const owned = claimed;
    const result = await sendPersonalTwilio(owned.row.kind as OutboundKind, owned.request, env, async (...args) => {
      const started = await execution.wait(() => withOutboundClaim(owned, env, execution, () => {
        if (args[1]?.signal?.aborted) throw new Error("OUTBOUND_DEADLINE_REACHED");
        transportAttempted = true;
        // Attach both handlers immediately, including when DB commit subsequently
        // fails after invocation. Unknown outcome retains its complete hold.
        const pending = transport(...args).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
        return { pending };
      }));
      const outcome = await started.pending;
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    }, operationId, { deadlineAt: execution.deadlineAt, signal: execution.signal });
    const finished = await execution.wait(() => withOutboundClaim(owned, env, execution, async tx => {
      // acceptedAt is the database's observation of this validated REST receipt,
      // not Twilio's own acceptance instant, delivery, or a timestamp from input.
      // It is persisted atomically with the exact claimed one-attempt completion.
      const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"externalTransportPerformed"=true,"leaseUntil"=NULL,result=$9::jsonb || jsonb_build_object('acceptedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),"updatedAt"=(now() AT TIME ZONE 'UTC')
      WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$4 AND status='processing' AND attempts=1
        AND "leaseUntil"=($5::timestamptz AT TIME ZONE 'UTC') AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC') AND "budgetId"=$6 AND "reservedCadMicros"=$7 AND kind=$8 AND result=$10::jsonb`,
    owned.row.id, owned.row.workspaceId, owned.row.createdByUserId, owned.row.requestHash, owned.leaseUntil, owned.budgetId, owned.reservation, owned.row.kind,
    JSON.stringify({ ...result, acceptedByProvider: true, approvalHash: owned.row.requestHash }), owned.approvalJson);
      if (changed !== 1) throw new Error("OUTBOUND_CLAIM_LOST");
      if (owned.source?.kind === "CALENDAR_CONFIRMATION") {
        const waiting = await markCalendarSmsConfirmationWaitingInTransaction(tx, { actor: { userId: owned.row.createdByUserId, workspaceId: owned.row.workspaceId },
          challengeId: owned.source.challengeId, bridgeOutboundOperationId: owned.row.id }, env);
        if (waiting.status !== "WAITING_FOR_EXACT_CONFIRMATION") throw new Error("CONFIRMATION_NOT_PREPARED");
        requireConfirmationBridgeEnabled(env);
        confirmationSourceDeadline(owned.source);
      }
      if (owned.source?.kind === "TEMPORAL_CLARIFICATION") {
        const waiting = await markSmsTemporalClarificationAskedInTransaction(tx,
          { actor: { userId: owned.row.createdByUserId, workspaceId: owned.row.workspaceId }, clarificationId: owned.source.clarificationId,
            questionOutboundOperationId: owned.row.id }, env, { deadlineAt: execution.deadlineAt, signal: execution.signal });
        if (waiting.status !== "WAITING_FOR_TEMPORAL_REPLY") throw new Error("TEMPORAL_OUTBOUND_WAITING_REQUIRED");
        requireTemporalOutboundBridgeEnabled(env);
        confirmationSourceDeadline(owned.source);
      }
      execution.requireLive();
      return changed;
    }));
    if (finished !== 1) throw new Error("OUTBOUND_CLAIM_LOST");
    return result;
  } catch (error) {
    if (!claimed) throw error;
    // Retain the whole reservation, including on timeout. No automatic retry.
    const owned = claimed;
    const cleanup = personalOutboundExecution({}, 2_000);
    try { await cleanup.wait(() => prisma.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='uncertain',"externalTransportPerformed"=$9,"leaseUntil"=NULL,result=$10::jsonb,"updatedAt"=(now() AT TIME ZONE 'UTC')
      WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$4 AND status='processing' AND attempts=1
        AND "leaseUntil"=($5::timestamptz AT TIME ZONE 'UTC') AND "budgetId"=$6 AND "reservedCadMicros"=$7 AND kind=$8 AND result=$11::jsonb`,
    owned.row.id, owned.row.workspaceId, owned.row.createdByUserId, owned.row.requestHash, owned.leaseUntil, owned.budgetId, owned.reservation, owned.row.kind,
    transportAttempted, JSON.stringify({ reviewRequired: true, automaticRetry: false, deliveryConfirmed: false }), owned.approvalJson)); } catch { /* No claim that uncertain bookkeeping was persisted. */ }
    finally { cleanup.dispose(); }
    throw new Error("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
  } finally { execution.dispose(); }
}
export async function personalOutboxForOwner(userId: string, workspaceId: string) {
  const member = await prisma.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } });
  if (!member) throw new Error("OUTBOX_ACCESS_REFUSED");
  const rows = await prisma.personalAssistantOperation.findMany({ where: { workspaceId, createdByUserId: userId, kind: { in: ["sms_outbound", "voice_outbound"] } }, orderBy: { createdAt: "desc" }, take: 30, include: { deliveryReceipts: true } });
  return { operations: rows.map(row => {
    const providerSid = (row.result as { providerSid?: string } | null)?.providerSid;
    // A callback can arrive before the REST response. Conflicting message IDs
    // must never be merged into a single successful-delivery claim.
    const receiptIds = new Set(row.deliveryReceipts.map(receipt => receipt.providerSid));
    const consistent = receiptIds.size === 1 && (!providerSid || receiptIds.has(providerSid));
    return { id: row.id, kind: row.kind, status: row.status, requestHash: row.requestHash, request: personalOutboundSchema.parse(row.request), deliveryConfirmed: consistent && row.kind === "sms_outbound" && row.deliveryReceipts.some(receipt => receipt.status === "delivered") && !row.deliveryReceipts.some(receipt => ["failed", "undelivered", "canceled"].includes(receipt.status)), receiptStates: row.deliveryReceipts.map(receipt => receipt.status), createdAt: row.createdAt.toISOString() };
  }) };
}

export async function sendAutomaticPersonalReply(operationId: string, env: ConnectorEnvironment = process.env, transport: typeof fetch = fetch, context: PersonalOutboundExecutionContext = {}) {
  const execution = personalOutboundExecution(context);
  try {
  execution.requireLive();
  return await execution.wait(async () => {
  if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("AUTOMATIC_REPLIES_DISABLED");
  const row = await prisma.personalAssistantOperation.findUnique({ where: { id: operationId } });
  if (!row || row.kind !== "sms_outbound" || !["pending", "approved"].includes(row.status)) throw new Error("AUTOMATIC_REPLY_REFUSED");
  const request = personalOutboundSchema.parse(row.request);
  if (!request.sourceOperationId || row.idempotencyKey !== `reply:${request.sourceOperationId}`) throw new Error("AUTOMATIC_REPLY_REFUSED");
  await requireCurrentReplySource(prisma, row, request, env);
  execution.requireLive();
  const grant = await prisma.constructionConnectorGrant.findFirst({ where: { connectorAccountId: row.connectorAccountId, capability: "personal_sms_send", status: "active", revokedAt: null } });
  if (!grant) throw new Error("AUTOMATIC_REPLY_CONSENT_REQUIRED");
  execution.requireLive();
  if (row.status === "pending") await approvePersonalOutbound({ userId: row.createdByUserId, workspaceId: row.workspaceId, operationId: row.id, expectedRequestHash: row.requestHash }, env);
  execution.requireLive();
  if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("AUTOMATIC_REPLIES_DISABLED");
  return dispatchOutbound(row.id, env, transport, { deadlineAt: execution.deadlineAt, signal: execution.signal }, true);
  });
  } finally { execution.dispose(); }
}

/** Only the immutable confirmation summary purpose is accepted here. Existing
 * automatic-reply policy and SMS-send consent are still required; nothing grants consent. */
export async function sendAutomaticCalendarConfirmationSummary(operationId: string, env: ConnectorEnvironment = process.env, transport: typeof fetch = fetch, context: PersonalOutboundExecutionContext = {}) {
  const execution = personalOutboundExecution(context);
  try {
    execution.requireLive();
    return await execution.wait(async () => {
      if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("AUTOMATIC_REPLIES_DISABLED");
      const row = await prisma.personalAssistantOperation.findUnique({ where: { id: operationId } });
      if (!row || row.kind !== "sms_outbound" || !["pending", "approved"].includes(row.status)
        || !row.idempotencyKey.startsWith("calendar-confirmation:")) throw new Error("CONFIRMATION_OUTBOX_BRIDGE_CHANGED");
      const request = personalOutboundSchema.parse(row.request);
      const source = await prisma.$transaction(tx => requireCurrentOutboundSource(tx, row, request, env),
        { isolationLevel: "Serializable", maxWait: 1000, timeout: Math.max(1, Math.min(5000, execution.deadlineAt - Date.now())) });
      if (source?.kind !== "CALENDAR_CONFIRMATION") throw new Error("CONFIRMATION_OUTBOX_BRIDGE_CHANGED");
      execution.requireLive();
      const grant = await prisma.constructionConnectorGrant.findFirst({ where: { connectorAccountId: row.connectorAccountId, capability: "personal_sms_send", status: "active", revokedAt: null } });
      if (!grant) throw new Error("AUTOMATIC_REPLY_CONSENT_REQUIRED");
      execution.requireLive();
      if (row.status === "pending") await approvePersonalOutbound({ userId: row.createdByUserId, workspaceId: row.workspaceId, operationId: row.id, expectedRequestHash: row.requestHash }, env);
      execution.requireLive();
      if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("AUTOMATIC_REPLIES_DISABLED");
      return dispatchOutbound(row.id, env, transport, { deadlineAt: execution.deadlineAt, signal: execution.signal }, true);
    });
  } finally { execution.dispose(); }
}
