import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { prepareGoogleCalendarInsert } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { GoogleCalendarClient, requireGooglePilot, type ConnectorEnvironment } from "./google-client";
import { googleTokensForOwner } from "./google-connection";

export const personalCalendarDraftSchema = z.object({ title: z.string().trim().min(1).max(240), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80) }).strict();
const storedSchema = personalCalendarDraftSchema.extend({ accountVersion: z.number().int(), requestId: z.string().uuid() }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function requireCalendarOwner(userId: string, workspaceId: string) {
  if (!await prisma.constructionWorkspaceMember.findFirst({ where: { workspaceId, userId, status: "active", role: { in: ["owner", "admin"] }, workspace: { status: "active" } } })) throw new Error("CALENDAR_OWNER_REQUIRED");
}
export async function preparePersonalCalendar(input: { userId: string; workspaceId: string; requestId: string; draft: unknown }) {
  await requireCalendarOwner(input.userId, input.workspaceId);
  const draft = personalCalendarDraftSchema.parse(input.draft);
  const requestId = z.string().uuid().parse(input.requestId);
  const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: input.workspaceId, provider: "google_calendar" } } });
  const request = { ...draft, accountVersion: account.stateVersion, requestId };
  const key = `personal-calendar:${input.workspaceId}:${requestId}`;
  prepareGoogleCalendarInsert({ ...draft, authority: { accountStatus: account.status as "connected", revokedAt: account.revokedAt as null, grantedScopes: account.grantedScopes }, workspaceId: input.workspaceId, calendarItemId: requestId, idempotencyKey: requestId });
  const existing = await prisma.personalAssistantOperation.findUnique({ where: { idempotencyKey: key } });
  const requestHash = hash(JSON.stringify(request));
  if (existing) { if (existing.createdByUserId !== input.userId || existing.requestHash !== requestHash) throw new Error("CALENDAR_REPLAY_CONFLICT"); return { operationId: existing.id, requestHash, status: existing.status }; }
  const row = await prisma.personalAssistantOperation.create({ data: { id: randomUUID(), workspaceId: input.workspaceId, connectorAccountId: account.id, createdByUserId: input.userId, kind: "calendar_write", status: "pending", request, requestHash, idempotencyKey: key } });
  return { operationId: row.id, requestHash, status: row.status };
}
export async function approveAndInsertPersonalCalendar(input: { userId: string; workspaceId: string; operationId: string; expectedRequestHash: string }, env: ConnectorEnvironment = process.env, client = new GoogleCalendarClient(env)) {
  requireGooglePilot(env); await requireCalendarOwner(input.userId, input.workspaceId);
  const row = await prisma.personalAssistantOperation.findFirst({ where: { id: input.operationId, workspaceId: input.workspaceId, createdByUserId: input.userId, kind: "calendar_write", status: "pending", requestHash: input.expectedRequestHash } });
  if (!row) throw new Error("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED");
  const request = storedSchema.parse(row.request);
  if (hash(JSON.stringify(request)) !== row.requestHash) throw new Error("CALENDAR_CONTENT_CHANGED");
  const account = await prisma.constructionConnectorAccount.findFirst({ where: { id: row.connectorAccountId, status: "connected", stateVersion: request.accountVersion, revokedAt: null, grants: { some: { capability: "calendar_write", status: "active", revokedAt: null } } } });
  if (!account) throw new Error("CALENDAR_WRITE_GRANT_REQUIRED");
  const { tokens } = await googleTokensForOwner(input.userId, input.workspaceId, env, client);
  await requireCalendarOwner(input.userId, input.workspaceId);
  const current = await prisma.constructionConnectorAccount.findFirst({ where: { id: account.id, stateVersion: account.stateVersion, status: "connected", revokedAt: null, grants: { some: { capability: "calendar_write", status: "active", revokedAt: null } } } });
  if (!current) throw new Error("CALENDAR_CONNECTION_CHANGED");
  const claimed = await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "pending", requestHash: row.requestHash }, data: { status: "processing", attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 120000), result: { approvedBy: input.userId, approvedHash: row.requestHash } } });
  if (claimed.count !== 1) throw new Error("CALENDAR_APPROVAL_ALREADY_USED");
  const attemptsBeforeInsert = client.transportAttempts;
  try {
    const result = await client.insertEvent(tokens, { ...request, workspaceId: row.workspaceId, calendarItemId: request.requestId, idempotencyKey: request.requestId });
    await prisma.personalAssistantOperation.update({ where: { id: row.id }, data: { status: "completed", result, externalTransportPerformed: true, leaseUntil: null } });
    return result;
  } catch {
    await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "processing" }, data: { status: "uncertain", externalTransportPerformed: client.transportAttempts > attemptsBeforeInsert, result: { automaticRetry: false, reviewRequired: true, writeConfirmed: false }, leaseUntil: null } });
    throw new Error("CALENDAR_WRITE_OUTCOME_UNKNOWN");
  }
}
export async function personalCalendarActions(userId: string, workspaceId: string) {
  await requireCalendarOwner(userId, workspaceId);
  const rows = await prisma.personalAssistantOperation.findMany({ where: { workspaceId, createdByUserId: userId, kind: "calendar_write" }, take: 30, orderBy: { createdAt: "desc" } });
  return { operations: rows.map(row => { const request = storedSchema.parse(row.request); return { id: row.id, requestHash: row.requestHash, status: row.status, draft: { title: request.title, startsAt: request.startsAt, endsAt: request.endsAt, timezone: request.timezone } }; }) };
}
