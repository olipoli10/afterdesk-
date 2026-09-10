import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { prepareGoogleCalendarInsert } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { GoogleCalendarClient, requireGooglePilot, type ConnectorEnvironment } from "./google-client";
import { googleTokensForOwner } from "./google-connection";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { personalCalendarDraftSchema } from "./calendar-draft-contract";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { lockCorrelatedCalendarApprovalWriteInTransaction } from "./correlated-calendar-approval-gate";
import { correlatedCalendarApprovalClaimSchema, correlatedCalendarApprovalStateSchema, fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalClaim,
  inspectCorrelatedCalendarApprovalState, CORRELATED_CALENDAR_APPROVAL_STATE_VERSION,
  type CorrelatedCalendarApprovalClaim, type CorrelatedCalendarApprovalView } from "./correlated-calendar-approval-contract";
export { personalCalendarDraftSchema } from "./calendar-draft-contract";

const storedSchema = personalCalendarDraftSchema.extend({ accountVersion: z.number().int(), requestId: z.string().uuid() }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function requireCalendarOwner(userId: string, workspaceId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (!await db.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } })) throw new Error("CALENDAR_OWNER_REQUIRED");
}
export async function preparePersonalCalendar(input: { userId: string; workspaceId: string; requestId: string; draft: unknown }) {
  return preparePersonalCalendarInTransaction(prisma, input);
}
const calendarOriginSchema = z.object({ kind: z.literal("personal_sms_temporal_receipt"), receiptId: z.string().min(1).max(191) }).strict();
export type PersonalCalendarPreparationOrigin = Readonly<z.infer<typeof calendarOriginSchema>>;
/** Preparation only. Internal origin requires the caller's SERIALIZABLE transaction;
 * its mandatory provenance relation must commit atomically under the database guards. */
export async function preparePersonalCalendarInTransaction(db: Prisma.TransactionClient | typeof prisma,
  suppliedInput: { userId: string; workspaceId: string; requestId: string; draft: unknown }, suppliedOrigin?: PersonalCalendarPreparationOrigin) {
  const origin = suppliedOrigin === undefined ? undefined : Object.freeze(calendarOriginSchema.parse(suppliedOrigin));
  const input = origin ? { ...suppliedInput, draft: personalCalendarDraftSchema.parse(suppliedInput.draft) } : suppliedInput;
  if (origin) {
    if ("$transaction" in db) throw new Error("CALENDAR_CORRELATED_TRANSACTION_REQUIRED");
    if (input.requestId !== personalCorrelatedCalendarRequestId(origin.receiptId)) throw new Error("CALENDAR_CORRELATED_REQUEST_ID_REQUIRED");
    const isolation = await db.$queryRawUnsafe<Array<{ isolation: string }>>("SELECT current_setting('transaction_isolation') AS isolation");
    if (isolation.length !== 1 || isolation[0].isolation !== "serializable") throw new Error("CALENDAR_CORRELATED_SERIALIZABLE_REQUIRED");
  }
  await requireCalendarOwner(input.userId, input.workspaceId, db);
  const draft = personalCalendarDraftSchema.parse(input.draft);
  const requestId = z.string().uuid().parse(input.requestId);
  const account = await db.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "google_calendar" } } });
  const request = { ...draft, accountVersion: account.stateVersion, requestId };
  const key = `personal-calendar:${input.workspaceId}:${requestId}`;
  prepareGoogleCalendarInsert({ ...draft, authority: { accountStatus: account.status as "connected", revokedAt: account.revokedAt as null, grantedScopes: account.grantedScopes }, workspaceId: input.workspaceId, calendarItemId: requestId, idempotencyKey: requestId });
  const existing = await db.personalAssistantOperation.findUnique({ where: { idempotencyKey: key } });
  const requestHash = hash(JSON.stringify(request));
  if (existing) {
    if (existing.createdByUserId !== input.userId || existing.requestHash !== requestHash) throw new Error("CALENDAR_REPLAY_CONFLICT");
    // No generic replay/adoption of a two-source draft, including a malformed foreign relation.
    // The reverse Prisma relation is composite/scoped; use the globally unique scalar instead.
    const review = await db.personalSmsCorrelatedCalendarReview.findUnique({ where: { calendarOperationId: existing.id },
      select: { id: true, receiptId: true, calendarOperationId: true, workspaceId: true, userId: true, calendarRequestHash: true } });
    if (origin) {
      const replayRequest = storedSchema.safeParse(existing.request);
      if (existing.kind !== "calendar_write" || existing.workspaceId !== input.workspaceId || existing.connectorAccountId !== account.id
        || !replayRequest.success || hash(JSON.stringify(replayRequest.data)) !== requestHash
        || existing.correlatedTemporalReceiptId !== origin.receiptId || !review || review.receiptId !== origin.receiptId
        || review.calendarOperationId !== existing.id || review.workspaceId !== input.workspaceId || review.userId !== input.userId
        || review.calendarRequestHash !== requestHash) throw new Error("CALENDAR_CORRELATED_REPLAY_CONFLICT");
    } else {
      const approval = await db.personalSmsCorrelatedCalendarApproval.findUnique({ where: { calendarOperationId: existing.id }, select: { id: true } });
      if (existing.correlatedTemporalReceiptId !== null || review !== null || approval !== null) throw new Error("CALENDAR_CORRELATED_REVIEW_UNAVAILABLE");
    }
    return { operationId: existing.id, requestHash, status: existing.status };
  }
  const row = await db.personalAssistantOperation.create({ data: { id: randomUUID(), workspaceId: input.workspaceId, connectorAccountId: account.id, createdByUserId: input.userId, kind: "calendar_write", status: "pending", request, requestHash, idempotencyKey: key,
    ...(origin ? { correlatedTemporalReceiptId: origin.receiptId } : {}) } });
  return { operationId: row.id, requestHash, status: row.status };
}
export type PersonalCalendarApproval = { userId: string; workspaceId: string; operationId: string; expectedRequestHash: string };
export type PersonalCalendarExecutionContext = { deadlineAt?: number; monotoneDeadlineAt?: number; signal?: AbortSignal };
const writeAuthoritySchema = z.object({ accountId: z.string().min(1), accountVersion: z.number().int(), credentialId: z.string().min(1),
  writeGrantId: z.string().min(1), writeGrantVersion: z.number().int(), memberId: z.string().min(1), memberRole: z.enum(["owner", "admin"]),
  memberUpdatedAt: z.string().datetime(), workspaceUpdatedAt: z.string().datetime(), accountScopes: z.array(z.string()), grantScopes: z.array(z.string()) }).strict();
type WriteAuthority = z.infer<typeof writeAuthoritySchema>;
const claimSchema = z.object({ userId: z.string().min(1), workspaceId: z.string().min(1), operationId: z.string().min(1), expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/),
  request: storedSchema, authority: writeAuthoritySchema, approvalToken: z.string().uuid(), leaseUntil: z.date() }).strict();
export type PersonalCalendarWriteClaim = Readonly<PersonalCalendarApproval & {
  request: z.infer<typeof storedSchema>; authority: WriteAuthority; approvalToken: string; leaseUntil: Date;
}>;
type LockedWrite = Omit<WriteAuthority, "memberUpdatedAt" | "workspaceUpdatedAt"> & { memberUpdatedAt: Date; workspaceUpdatedAt: Date; request: unknown; result: unknown };
const WRITE_LIMIT_MS = 25000;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
function snapshotClaim(untrusted: PersonalCalendarWriteClaim): PersonalCalendarWriteClaim {
  const parsed = claimSchema.parse(untrusted);
  // Object.freeze does not freeze Date's internal epoch. Copy it too; execution never retains a caller's Date.
  return freeze({ ...parsed, leaseUntil: new Date(parsed.leaseUntil.getTime()) });
}
function writeAuthority(row: LockedWrite): WriteAuthority {
  return { accountId: row.accountId, accountVersion: row.accountVersion, credentialId: row.credentialId,
    writeGrantId: row.writeGrantId, writeGrantVersion: row.writeGrantVersion, memberId: row.memberId,
    memberRole: row.memberRole, memberUpdatedAt: row.memberUpdatedAt.toISOString(), workspaceUpdatedAt: row.workspaceUpdatedAt.toISOString(),
    accountScopes: [...row.accountScopes], grantScopes: [...row.grantScopes] };
}
function deadline(context: PersonalCalendarExecutionContext = {}) {
  const value = Math.min(context.deadlineAt ?? Infinity, Date.now() + WRITE_LIMIT_MS);
  if (!Number.isFinite(value) || value <= Date.now() || context.signal?.aborted) throw new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED");
  return value;
}
function requireLive(deadlineAt: number, signal?: AbortSignal) {
  if (signal?.aborted || Date.now() >= deadlineAt) throw new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED");
}
function approvalRecord(claim: PersonalCalendarWriteClaim, dispatchStarted: boolean) {
  return { approvedBy: claim.userId, approvedHash: claim.expectedRequestHash, approvalToken: claim.approvalToken, writeAuthority: claim.authority, dispatchStarted };
}
function ownedWhere(claim: PersonalCalendarWriteClaim) {
  return { id: claim.operationId, workspaceId: claim.workspaceId, createdByUserId: claim.userId, connectorAccountId: claim.authority.accountId,
    kind: "calendar_write", status: "processing", attempts: 1, requestHash: claim.expectedRequestHash, leaseUntil: claim.leaseUntil };
}
/** All mutable write authority is locked together. calendar_read can never stand in for calendar_write. */
async function lockWrite(db: Prisma.TransactionClient, input: PersonalCalendarApproval, claim?: PersonalCalendarWriteClaim): Promise<LockedWrite> {
  const rows = await db.$queryRawUnsafe<LockedWrite[]>(`
    SELECT o.request, o.result, a.id AS "accountId", a."stateVersion" AS "accountVersion", c.id AS "credentialId",
      g.id AS "writeGrantId", g."stateVersion" AS "writeGrantVersion", m.id AS "memberId", m.role AS "memberRole",
      m."updatedAt" AS "memberUpdatedAt", w."updatedAt" AS "workspaceUpdatedAt",
      a."grantedScopes" AS "accountScopes", g."grantedScopes" AS "grantScopes"
    FROM "PersonalAssistantOperation" o
    JOIN "ConstructionWorkspace" w ON w.id=o."workspaceId"
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=o."createdByUserId"
    JOIN "ConstructionConnectorAccount" a ON a.id=o."connectorAccountId" AND a."workspaceId"=w.id
    JOIN "ConstructionConnectorCredential" c ON c.id=a."credentialRef" AND c."connectorAccountId"=a.id AND c."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
    WHERE o.id=$1 AND o."workspaceId"=$2 AND o."createdByUserId"=$3 AND o.kind='calendar_write' AND o."requestHash"=$4
      AND o."correlatedTemporalReceiptId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" correlated WHERE correlated."calendarOperationId"=o.id)
      AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" approved WHERE approved."calendarOperationId"=o.id)
      AND w.status='active' AND m.status='active' AND m.role IN ('owner','admin')
      AND a.provider='google_calendar' AND a.status='connected' AND a."revokedAt" IS NULL AND c."revokedAt" IS NULL
      AND g.capability='calendar_write' AND g.status='active' AND g."revokedAt" IS NULL
      AND $5=ANY(a."grantedScopes") AND $5=ANY(g."grantedScopes")
      AND (($6::timestamptz IS NULL AND o.status='pending' AND o.attempts=0 AND o."leaseUntil" IS NULL)
        OR ($6::timestamptz IS NOT NULL AND o.status='processing' AND o.attempts=1
          AND o."leaseUntil"=($6::timestamptz AT TIME ZONE 'UTC')
          AND o."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')))
    ORDER BY g.id LIMIT 1 FOR UPDATE OF o FOR SHARE OF w,m,a,c,g`,
  input.operationId, input.workspaceId, input.userId, input.expectedRequestHash, GOOGLE_CALENDAR_WRITE_SCOPE, claim?.leaseUntil ?? null);
  if (rows.length !== 1) throw new Error("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED");
  const row = rows[0]; const request = storedSchema.parse(row.request);
  if (hash(JSON.stringify(request)) !== input.expectedRequestHash || request.accountVersion !== row.accountVersion) throw new Error("CALENDAR_CONTENT_CHANGED");
  if (claim) {
    const authority = writeAuthority(row);
    if (JSON.stringify(authority) !== JSON.stringify(claim.authority) || JSON.stringify(request) !== JSON.stringify(claim.request)) throw new Error("CALENDAR_CONNECTION_CHANGED");
  }
  return row;
}
/** No credential decryption or transport. A future explicit SMS challenge can be consumed in this SAME serializable transaction. */
export async function claimPersonalCalendarWriteInTransaction(db: Prisma.TransactionClient, input: PersonalCalendarApproval, env: ConnectorEnvironment = process.env, context: PersonalCalendarExecutionContext = {}): Promise<PersonalCalendarWriteClaim> {
  const deadlineAt = deadline(context); requireGooglePilot(env);
  const row = await lockWrite(db, input); requireLive(deadlineAt, context.signal);
  const authority = writeAuthority(row);
  const request = storedSchema.parse(row.request);
  prepareGoogleCalendarInsert({ ...request, authority: { accountStatus: "connected", revokedAt: null, grantedScopes: authority.accountScopes }, workspaceId: input.workspaceId, calendarItemId: request.requestId, idempotencyKey: request.requestId });
  const claim = { ...input, request, authority, approvalToken: randomUUID(), leaseUntil: new Date(deadlineAt) };
  const changed = await db.personalAssistantOperation.updateMany({ where: { id: input.operationId, workspaceId: input.workspaceId, createdByUserId: input.userId, connectorAccountId: authority.accountId, kind: "calendar_write", status: "pending", attempts: 0, leaseUntil: null, requestHash: input.expectedRequestHash },
    data: { status: "processing", attempts: 1, leaseUntil: claim.leaseUntil, result: approvalRecord(claim, false) } });
  if (changed.count !== 1) throw new Error("CALENDAR_APPROVAL_ALREADY_USED");
  requireLive(deadlineAt, context.signal); return snapshotClaim(claim);
}
/** One-use execution; caller-supplied claims are reloaded and matched to durable approval material. No retry. */
export async function executeClaimedPersonalCalendarWrite(suppliedClaim: PersonalCalendarWriteClaim | CorrelatedCalendarApprovalClaim, env: ConnectorEnvironment = process.env, suppliedClient?: GoogleCalendarClient, context: PersonalCalendarExecutionContext = {}) {
  // A malformed typed handle never falls through to the permissive legacy shape.
  const typed = "version" in suppliedClaim || "origin" in suppliedClaim ? correlatedCalendarApprovalClaimSchema.parse(suppliedClaim) : null;
  const legacy = typed ? null : snapshotClaim(suppliedClaim as PersonalCalendarWriteClaim);
  const claim = typed ?? legacy!;
  const originalSignal = context.signal;
  const deadlineAt = deadline({ deadlineAt: Math.min(context.deadlineAt ?? Infinity, legacy?.leaseUntil.getTime() ?? Infinity), signal: originalSignal });
  let monotoneDeadlineAt = typed ? Math.min(context.monotoneDeadlineAt ?? Infinity, performance.now() + Math.min(WRITE_LIMIT_MS, deadlineAt - Date.now())) : Infinity;
  if (typed && !Number.isFinite(monotoneDeadlineAt)) throw new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED");
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(originalSignal ? [originalSignal] : [])]);
  const client = suppliedClient ?? new GoogleCalendarClient(env, undefined, undefined, signal);
  let ownsDispatch = false; let writeTransportStarted = false;
  let view: CorrelatedCalendarApprovalView | undefined;
  let knownCompleted: Awaited<ReturnType<GoogleCalendarClient["insertEvent"]>> | undefined;
  let unknownReason: "WRITE_OUTCOME_UNKNOWN" | "DISPATCH_COMMIT_OUTCOME_UNKNOWN" | "TERMINAL_COMMIT_OUTCOME_UNKNOWN" = "DISPATCH_COMMIT_OUTCOME_UNKNOWN";
  const remaining = () => Math.floor(Math.min(deadlineAt - Date.now(), monotoneDeadlineAt - performance.now()));
  const live = () => {
    requireGooglePilot(env); requireLive(deadlineAt, signal);
    if (typed && (remaining() < 2 || env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED !== "true"
      || env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED !== "true" || env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED !== "true"
      || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z")) throw new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED");
  };
  const owned = () => typed ? { id: typed.operationId, workspaceId: typed.workspaceId, createdByUserId: typed.userId,
    connectorAccountId: typed.authority.accountId, kind: "calendar_write", status: "processing", attempts: 1,
    requestHash: typed.expectedRequestHash, leaseUntil: new Date(typed.leaseUntil) } : ownedWhere(legacy!);
  const record = (dispatchStarted: boolean) => typed ? correlatedCalendarApprovalStateSchema.parse({ version: CORRELATED_CALENDAR_APPROVAL_STATE_VERSION,
    origin: typed.origin, phase: dispatchStarted ? "DISPATCH_CLAIMED" : "CLAIMED", approvedBy: typed.userId, approvedHash: typed.expectedRequestHash,
    approvalToken: typed.approvalToken, writeAuthority: typed.authority, dispatchStarted }) : approvalRecord(legacy!, dispatchStarted);
  let rejectDeadline!: (reason: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const stop = () => { controller.abort(); rejectDeadline(new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED")); };
  let timer = setTimeout(stop, Math.max(1, remaining()));
  originalSignal?.addEventListener("abort", stop, { once: true });
  const txOptions = { isolationLevel: "Serializable" as const, maxWait: 1000, timeout: 2000 };
  const executionTxOptions = () => {
    if (!typed) return txOptions;
    live(); const ms = Math.min(5000, remaining()), maxWait = Math.min(500, Math.max(1, Math.floor(ms / 4)));
    return { isolationLevel: "Serializable" as const, maxWait, timeout: ms - maxWait };
  };
  const lock = async (db: Prisma.TransactionClient, phase: "CLAIMED" | "DISPATCH_CLAIMED") => {
    if (!typed) return { legacy: await lockWrite(db, legacy!, legacy!), read: undefined };
    live(); const started = performance.now();
    const gate = await lockCorrelatedCalendarApprovalWriteInTransaction(db, typed, env,
      { deadlineAt: Math.min(deadlineAt, Date.now() + remaining()), signal }, phase);
    live();
    if (gate.status !== "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED" || gate.committed !== false || gate.executionAuthorized !== false) throw new Error("CALENDAR_APPROVAL_CHANGED");
    view = fingerprintCorrelatedCalendarApprovalView(gate.view).view;
    inspectCorrelatedCalendarApprovalClaim(typed, view);
    // Gate time is DB UTC. Conservatively account for the entire gate latency;
    // neither an app clock offset nor another invocation renews the durable lease.
    const dbRemaining = Date.parse(typed.leaseUntil) - Date.parse(gate.inspectedAt);
    if (!Number.isFinite(dbRemaining) || dbRemaining <= 0) throw new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED");
    monotoneDeadlineAt = Math.min(monotoneDeadlineAt, started + dbRemaining);
    clearTimeout(timer); timer = setTimeout(stop, Math.max(1, remaining())); live();
    return { legacy: undefined, read: { ...gate.readPrerequisite } };
  };
  try {
    const work = (async () => {
      live();
      // Commit the one-use marker BEFORE network work. A duplicate executor cannot steal or close the winner.
      await prisma.$transaction(async db => {
        await lock(db, "CLAIMED"); live();
        const marked = await db.personalAssistantOperation.updateMany({ where: { ...owned(), result: { equals: record(false) } }, data: { result: record(true) } });
        if (marked.count !== 1) throw new Error("CALENDAR_DISPATCH_ALREADY_USED");
        if (typed) live();
      }, executionTxOptions());
      ownsDispatch = true; unknownReason = "WRITE_OUTCOME_UNKNOWN"; live();
      const loaded = await googleTokensForOwner(claim.userId, claim.workspaceId, env, client); live();
      const readAuthority = { ...loaded.readAuthority };
      if (loaded.accountId !== claim.authority.accountId || loaded.accountVersion !== claim.authority.accountVersion || loaded.readAuthority.credentialId !== claim.authority.credentialId) throw new Error("CALENDAR_CONNECTION_CHANGED");
      const requireLoadedRead = (read: { readGrantId: string; readGrantVersion: number } | undefined) => {
        if (typed && (!read || readAuthority.schemaVersion !== 1 || readAuthority.userId !== typed.userId || readAuthority.workspaceId !== typed.workspaceId
          || readAuthority.accountId !== typed.authority.accountId || readAuthority.accountVersion !== typed.authority.accountVersion || readAuthority.credentialId !== typed.authority.credentialId
          || readAuthority.readGrantId !== read.readGrantId || readAuthority.readGrantVersion !== read.readGrantVersion)) throw new Error("CALENDAR_CONNECTION_CHANGED");
      };
      const dispatched = await prisma.$transaction(async db => {
        const locked = await lock(db, "DISPATCH_CLAIMED"); live();
        requireLoadedRead(locked.read);
        if (!typed && JSON.stringify(locked.legacy!.result) !== JSON.stringify(record(true))) {
          // JSONB key order is not stable; use the database equality predicate below instead.
          const recorded = await db.personalAssistantOperation.findFirst({ where: { ...owned(), result: { equals: record(true) } } });
          if (!recorded) throw new Error("CALENDAR_APPROVAL_CHANGED");
        }
        live();
        const before = client.transportAttempts;
        // GoogleCalendarClient starts fetch synchronously before its first await. Locks cover dispatch admission,
        // NOT network latency: boxing the promise lets this transaction commit while the request is pending.
        let pending: Promise<{ ok: true; value: Awaited<ReturnType<GoogleCalendarClient["insertEvent"]>> } | { ok: false }>;
        try {
          pending = client.insertEvent(loaded.tokens, { ...claim.request, workspaceId: claim.workspaceId, calendarItemId: claim.request.requestId, idempotencyKey: claim.request.requestId })
            .then(value => ({ ok: true as const, value }), () => ({ ok: false as const }));
        } finally { writeTransportStarted = client.transportAttempts > before; }
        return { pending };
      }, executionTxOptions());
      const outcome = await dispatched.pending; live();
      if (!outcome.ok) throw new Error("CALENDAR_WRITE_UNCONFIRMED");
      const terminal = typed ? inspectCorrelatedCalendarApprovalState({ version: CORRELATED_CALENDAR_APPROVAL_STATE_VERSION, origin: typed.origin,
        phase: "CONFIRMED", receipt: outcome.value, automaticRetry: false }, typed, view!).state : outcome.value;
      if (typed && !writeTransportStarted) throw new Error("CALENDAR_WRITE_UNCONFIRMED");
      unknownReason = "TERMINAL_COMMIT_OUTCOME_UNKNOWN";
      await prisma.$transaction(async db => {
        const locked = await lock(db, "DISPATCH_CLAIMED"); live(); requireLoadedRead(locked.read);
        const completed = await db.personalAssistantOperation.updateMany({ where: { ...owned(), result: { equals: record(true) } }, data: { status: "completed", result: terminal, externalTransportPerformed: writeTransportStarted, leaseUntil: null } });
        if (completed.count !== 1) throw new Error("CALENDAR_WRITE_CLAIM_LOST");
        live();
      }, executionTxOptions());
      // This is a factual commit acknowledgement, not a fresh execution permit.
      knownCompleted = outcome.value;
      return outcome.value;
    })();
    return await Promise.race([work, stopped]);
  } catch {
    controller.abort();
    if (knownCompleted) return knownCompleted;
    if (ownsDispatch) {
      // Never overwrite recovery or another terminal state. A late continuation cannot satisfy requireLive.
      await prisma.$transaction(async db => {
        const uncertain = typed ? correlatedCalendarApprovalStateSchema.parse({ version: CORRELATED_CALENDAR_APPROVAL_STATE_VERSION, origin: typed.origin,
          phase: "UNCERTAIN", writeConfirmed: false, reviewRequired: true, automaticRetry: false, reason: unknownReason }) : { automaticRetry: false, reviewRequired: true, writeConfirmed: false };
        await db.personalAssistantOperation.updateMany({ where: { ...owned(), result: { equals: record(true) } }, data: { status: "uncertain", externalTransportPerformed: writeTransportStarted, result: uncertain, leaseUntil: null } });
      }, txOptions).catch(() => undefined);
    }
    if (knownCompleted) return knownCompleted;
    throw new Error("CALENDAR_WRITE_OUTCOME_UNKNOWN");
  } finally { clearTimeout(timer); originalSignal?.removeEventListener("abort", stop); }
}
export async function approveAndInsertPersonalCalendar(input: PersonalCalendarApproval, env: ConnectorEnvironment = process.env, client?: GoogleCalendarClient, context: PersonalCalendarExecutionContext = {}) {
  const deadlineAt = deadline(context);
  const claim = await prisma.$transaction(db => claimPersonalCalendarWriteInTransaction(db, input, env, { ...context, deadlineAt }), { isolationLevel: "Serializable", maxWait: 1000, timeout: 2000 });
  return executeClaimedPersonalCalendarWrite(claim, env, client, { ...context, deadlineAt });
}
export async function personalCalendarActions(userId: string, workspaceId: string) {
  await requireCalendarOwner(userId, workspaceId);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; requestHash: string; status: string; request: unknown }>>(`
    SELECT o.id,o."requestHash",o.status,o.request FROM "PersonalAssistantOperation" o
    WHERE o."workspaceId"=$1 AND o."createdByUserId"=$2 AND o.kind='calendar_write'
      AND o."correlatedTemporalReceiptId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" correlated WHERE correlated."calendarOperationId"=o.id)
      AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" approved WHERE approved."calendarOperationId"=o.id)
    ORDER BY o."createdAt" DESC LIMIT 30`, workspaceId, userId);
  return { operations: rows.map(row => { const request = storedSchema.parse(row.request); return { id: row.id, requestHash: row.requestHash, status: row.status, draft: { title: request.title, startsAt: request.startsAt, endsAt: request.endsAt, timezone: request.timezone } }; }) };
}
