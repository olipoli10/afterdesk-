import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { prepareGoogleCalendarInsert } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { GoogleCalendarClient, requireGooglePilot, type ConnectorEnvironment } from "./google-client";
import { googleTokensForOwner } from "./google-connection";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";

export const personalCalendarDraftSchema = z.object({ title: z.string().trim().min(1).max(240), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80) }).strict();
const storedSchema = personalCalendarDraftSchema.extend({ accountVersion: z.number().int(), requestId: z.string().uuid() }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function requireCalendarOwner(userId: string, workspaceId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (!await db.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } })) throw new Error("CALENDAR_OWNER_REQUIRED");
}
export async function preparePersonalCalendar(input: { userId: string; workspaceId: string; requestId: string; draft: unknown }) {
  return preparePersonalCalendarInTransaction(prisma, input);
}
/** Preparation only. Caller can include this in its serializable source CAS. */
export async function preparePersonalCalendarInTransaction(db: Prisma.TransactionClient | typeof prisma, input: { userId: string; workspaceId: string; requestId: string; draft: unknown }) {
  await requireCalendarOwner(input.userId, input.workspaceId, db);
  const draft = personalCalendarDraftSchema.parse(input.draft);
  const requestId = z.string().uuid().parse(input.requestId);
  const account = await db.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "google_calendar" } } });
  const request = { ...draft, accountVersion: account.stateVersion, requestId };
  const key = `personal-calendar:${input.workspaceId}:${requestId}`;
  prepareGoogleCalendarInsert({ ...draft, authority: { accountStatus: account.status as "connected", revokedAt: account.revokedAt as null, grantedScopes: account.grantedScopes }, workspaceId: input.workspaceId, calendarItemId: requestId, idempotencyKey: requestId });
  const existing = await db.personalAssistantOperation.findUnique({ where: { idempotencyKey: key } });
  const requestHash = hash(JSON.stringify(request));
  if (existing) { if (existing.createdByUserId !== input.userId || existing.requestHash !== requestHash) throw new Error("CALENDAR_REPLAY_CONFLICT"); return { operationId: existing.id, requestHash, status: existing.status }; }
  const row = await db.personalAssistantOperation.create({ data: { id: randomUUID(), workspaceId: input.workspaceId, connectorAccountId: account.id, createdByUserId: input.userId, kind: "calendar_write", status: "pending", request, requestHash, idempotencyKey: key } });
  return { operationId: row.id, requestHash, status: row.status };
}
export type PersonalCalendarApproval = { userId: string; workspaceId: string; operationId: string; expectedRequestHash: string };
export type PersonalCalendarExecutionContext = { deadlineAt?: number; signal?: AbortSignal };
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
      AND w.status='active' AND m.status='active' AND m.role IN ('owner','admin')
      AND a.provider='google_calendar' AND a.status='connected' AND a."revokedAt" IS NULL AND c."revokedAt" IS NULL
      AND g.capability='calendar_write' AND g.status='active' AND g."revokedAt" IS NULL
      AND $5=ANY(a."grantedScopes") AND $5=ANY(g."grantedScopes")
      AND (($6::timestamptz IS NULL AND o.status='pending' AND o.attempts=0 AND o."leaseUntil" IS NULL)
        OR ($6::timestamptz IS NOT NULL AND o.status='processing' AND o.attempts=1 AND o."leaseUntil"=$6 AND o."leaseUntil">clock_timestamp()))
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
export async function executeClaimedPersonalCalendarWrite(suppliedClaim: PersonalCalendarWriteClaim, env: ConnectorEnvironment = process.env, suppliedClient?: GoogleCalendarClient, context: PersonalCalendarExecutionContext = {}) {
  const claim = snapshotClaim(suppliedClaim);
  const deadlineAt = deadline({ ...context, deadlineAt: Math.min(context.deadlineAt ?? Infinity, claim.leaseUntil.getTime()) });
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(context.signal ? [context.signal] : [])]);
  const client = suppliedClient ?? new GoogleCalendarClient(env, undefined, undefined, signal);
  let ownsDispatch = false; let writeTransportStarted = false;
  let rejectDeadline!: (reason: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const stop = () => { controller.abort(); rejectDeadline(new Error("CALENDAR_WRITE_DEADLINE_EXCEEDED")); };
  const timer = setTimeout(stop, Math.max(1, deadlineAt - Date.now()));
  context.signal?.addEventListener("abort", stop, { once: true });
  const txOptions = { isolationLevel: "Serializable" as const, maxWait: 1000, timeout: 2000 };
  try {
    const work = (async () => {
      requireGooglePilot(env); requireLive(deadlineAt, signal);
      // Commit the one-use marker BEFORE network work. A duplicate executor cannot steal or close the winner.
      await prisma.$transaction(async db => {
        await lockWrite(db, claim, claim); requireLive(deadlineAt, signal);
        const marked = await db.personalAssistantOperation.updateMany({ where: { ...ownedWhere(claim), result: { equals: approvalRecord(claim, false) } }, data: { result: approvalRecord(claim, true) } });
        if (marked.count !== 1) throw new Error("CALENDAR_DISPATCH_ALREADY_USED");
      }, txOptions);
      ownsDispatch = true; requireLive(deadlineAt, signal);
      const loaded = await googleTokensForOwner(claim.userId, claim.workspaceId, env, client); requireLive(deadlineAt, signal);
      if (loaded.accountId !== claim.authority.accountId || loaded.accountVersion !== claim.authority.accountVersion || loaded.readAuthority.credentialId !== claim.authority.credentialId) throw new Error("CALENDAR_CONNECTION_CHANGED");
      const dispatched = await prisma.$transaction(async db => {
        const row = await lockWrite(db, claim, claim); requireGooglePilot(env); requireLive(deadlineAt, signal);
        if (JSON.stringify(row.result) !== JSON.stringify(approvalRecord(claim, true))) {
          // JSONB key order is not stable; use the database equality predicate below instead.
          const recorded = await db.personalAssistantOperation.findFirst({ where: { ...ownedWhere(claim), result: { equals: approvalRecord(claim, true) } } });
          if (!recorded) throw new Error("CALENDAR_APPROVAL_CHANGED");
        }
        requireGooglePilot(env); requireLive(deadlineAt, signal);
        const before = client.transportAttempts;
        // GoogleCalendarClient starts fetch synchronously before its first await. Locks cover dispatch admission,
        // NOT network latency: boxing the promise lets this transaction commit while the request is pending.
        const pending = client.insertEvent(loaded.tokens, { ...claim.request, workspaceId: claim.workspaceId, calendarItemId: claim.request.requestId, idempotencyKey: claim.request.requestId })
          .then(value => ({ ok: true as const, value }), () => ({ ok: false as const }));
        writeTransportStarted = client.transportAttempts > before;
        return { pending };
      }, txOptions);
      const outcome = await dispatched.pending; requireLive(deadlineAt, signal);
      if (!outcome.ok) throw new Error("CALENDAR_WRITE_UNCONFIRMED");
      await prisma.$transaction(async db => {
        await lockWrite(db, claim, claim); requireGooglePilot(env); requireLive(deadlineAt, signal);
        const completed = await db.personalAssistantOperation.updateMany({ where: { ...ownedWhere(claim), result: { equals: approvalRecord(claim, true) } }, data: { status: "completed", result: outcome.value, externalTransportPerformed: writeTransportStarted, leaseUntil: null } });
        if (completed.count !== 1) throw new Error("CALENDAR_WRITE_CLAIM_LOST");
        requireLive(deadlineAt, signal);
      }, txOptions);
      return outcome.value;
    })();
    return await Promise.race([work, stopped]);
  } catch {
    controller.abort();
    if (ownsDispatch) {
      // Never overwrite recovery or another terminal state. A late continuation cannot satisfy requireLive.
      await prisma.$transaction(async db => {
        await db.personalAssistantOperation.updateMany({ where: { ...ownedWhere(claim), result: { equals: approvalRecord(claim, true) } }, data: { status: "uncertain", externalTransportPerformed: writeTransportStarted, result: { automaticRetry: false, reviewRequired: true, writeConfirmed: false }, leaseUntil: null } });
      }, txOptions).catch(() => undefined);
    }
    throw new Error("CALENDAR_WRITE_OUTCOME_UNKNOWN");
  } finally { clearTimeout(timer); context.signal?.removeEventListener("abort", stop); }
}
export async function approveAndInsertPersonalCalendar(input: PersonalCalendarApproval, env: ConnectorEnvironment = process.env, client?: GoogleCalendarClient, context: PersonalCalendarExecutionContext = {}) {
  const deadlineAt = deadline(context);
  const claim = await prisma.$transaction(db => claimPersonalCalendarWriteInTransaction(db, input, env, { ...context, deadlineAt }), { isolationLevel: "Serializable", maxWait: 1000, timeout: 2000 });
  return executeClaimedPersonalCalendarWrite(claim, env, client, { ...context, deadlineAt });
}
export async function personalCalendarActions(userId: string, workspaceId: string) {
  await requireCalendarOwner(userId, workspaceId);
  const rows = await prisma.personalAssistantOperation.findMany({ where: { workspaceId, createdByUserId: userId, kind: "calendar_write" }, take: 30, orderBy: { createdAt: "desc" } });
  return { operations: rows.map(row => { const request = storedSchema.parse(row.request); return { id: row.id, requestHash: row.requestHash, status: row.status, draft: { title: request.title, startsAt: request.startsAt, endsAt: request.endsAt, timezone: request.timezone } }; }) };
}
