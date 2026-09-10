import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { checkedCalendarConfirmationSource } from "./calendar-confirmation-authority";
import { smsTemporalClarificationBindingSchema, type SmsTemporalClarificationSource } from "./sms-temporal-clarification";
import type { ConnectorEnvironment } from "./google-client";

export type TemporalRegistryDB = Prisma.TransactionClient;
const id = z.string().min(1).max(191);
export const temporalActorSchema = z.object({ userId: id, workspaceId: id }).strict();
export const temporalClaimSchema = temporalActorSchema.extend({ operationId: id, attempt: z.literal(1),
  leaseUntil: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()) }).strict();
export type TemporalRegistryActor = z.infer<typeof temporalActorSchema>;
export type TemporalRegistryClaim = z.infer<typeof temporalClaimSchema>;
export type TemporalRegistryContext = Readonly<{ deadlineAt: number; signal?: AbortSignal }>;
export const temporalRegistryEnabled = (env: ConnectorEnvironment) => env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED === "true";
export const temporalRegistryDisabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
export const temporalSha = (value: string) => createHash("sha256").update(value).digest("hex");
export function temporalConversationNamespace(ownerNumber: string, endveraNumber: string) {
  const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
  return temporalSha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", phone.parse(ownerNumber), phone.parse(endveraNumber)]));
}
export function temporalRequireLive(context: TemporalRegistryContext, env: ConnectorEnvironment) {
  if (!temporalRegistryEnabled(env) || !Number.isFinite(context.deadlineAt) || Date.now() >= context.deadlineAt || context.signal?.aborted) throw new Error("TEMPORAL_REGISTRY_DEADLINE_OR_DISABLED");
}
export async function temporalRegistryTransaction(tx: TemporalRegistryDB, context: TemporalRegistryContext, env: ConnectorEnvironment) {
  temporalRequireLive(context, env);
  const [row] = await tx.$queryRawUnsafe<Array<{ isolation: string }>>("SELECT current_setting('transaction_isolation') AS isolation");
  temporalRequireLive(context, env);
  if (row?.isolation !== "serializable") throw new Error("TEMPORAL_REGISTRY_SERIALIZABLE_REQUIRED");
  const ms = Math.max(1, Math.min(2000, Math.floor(context.deadlineAt - Date.now())));
  await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", String(ms));
  temporalRequireLive(context, env);
}
export async function temporalRegistryClock(tx: TemporalRegistryDB): Promise<Date> {
  const [row] = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
  if (!(row?.now instanceof Date) || !Number.isFinite(row.now.getTime())) throw new Error("TEMPORAL_REGISTRY_DB_CLOCK_REQUIRED");
  return row.now;
}
type SourceRow = { id: string; request: unknown; requestHash: string; idempotencyKey: string; createdAt: Date; result: unknown; connectorAccountId: string };
export function temporalCheckedSource(row: SourceRow, actor: TemporalRegistryActor): SmsTemporalClarificationSource {
  const raw = checkedCalendarConfirmationSource(row.request, row.requestHash);
  if (!(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())
    || row.idempotencyKey !== `personal-sms:${temporalSha(`${raw.accountSid}:${raw.messageSid}`)}`) throw new Error("TEMPORAL_REGISTRY_SOURCE_CHANGED");
  return { operationId: row.id, ...actor, identityId: raw.identityId, verifiedIngress: true,
    accountSid: raw.accountSid, messageSid: raw.messageSid, from: raw.from, to: raw.to, body: raw.body, requestHash: row.requestHash, receivedAt: row.createdAt.toISOString() };
}
/** Read the pair without locks, then lock that permanent namespace BEFORE any
 * source/challenge lock. The authoritative locked read below must agree. */
export async function temporalLockSourceNamespace(tx: TemporalRegistryDB, actor: TemporalRegistryActor, sourceId: string) {
  const rows = await tx.$queryRawUnsafe<SourceRow[]>(`SELECT id,request,"requestHash","idempotencyKey","createdAt",result,"connectorAccountId" FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='personal_sms_inbound'`, id.parse(sourceId), actor.workspaceId, actor.userId);
  if (rows.length !== 1) throw new Error("TEMPORAL_REGISTRY_SOURCE_REQUIRED");
  const source = temporalCheckedSource(rows[0], actor), namespace = temporalConversationNamespace(source.from, source.to);
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", namespace);
  return namespace;
}

type BindingRow = SourceRow & { now: Date; memberId: string; memberRevision: Date; workspaceRevision: Date; identityId: string; identityRevision: Date;
  smsAccountId: string; smsAccountVersion: number; smsInboundGrantId: string; smsInboundGrantVersion: number; timezone: string;
  modelAccountId: string; modelAccountVersion: number; modelGrantId: string; modelGrantVersion: number;
  calendarAccountId: string; calendarAccountVersion: number; calendarWriteGrantId: string; calendarWriteGrantVersion: number };
/** Current owner/phone/model/calendar consent only; no credential bytes, budget,
 * provider call or action admission. Model candidate lineage is separately
 * inspected by the canonical review-proof loader on creation and pinned later. */
export async function temporalCurrentBinding(tx: TemporalRegistryDB, actor: TemporalRegistryActor, sourceId: string,
  modelChildId: string, env: ConnectorEnvironment, sourceClaim?: TemporalRegistryClaim) {
  const rows = await tx.$queryRawUnsafe<BindingRow[]>(`SELECT s.id,s.request,s."requestHash",s."idempotencyKey",s."createdAt",s.result,s."connectorAccountId",clock_timestamp() AS now,
    m.id "memberId",m."updatedAt" "memberRevision",w."updatedAt" "workspaceRevision",w."defaultTimezone" timezone,
    i.id "identityId",i."updatedAt" "identityRevision",a.id "smsAccountId",a."stateVersion" "smsAccountVersion",sg.id "smsInboundGrantId",sg."stateVersion" "smsInboundGrantVersion",
    ma.id "modelAccountId",ma."stateVersion" "modelAccountVersion",mg.id "modelGrantId",mg."stateVersion" "modelGrantVersion",
    ga.id "calendarAccountId",ga."stateVersion" "calendarAccountVersion",gg.id "calendarWriteGrantId",gg."stateVersion" "calendarWriteGrantVersion"
    FROM "PersonalAssistantOperation" s JOIN "ConstructionWorkspace" w ON w.id=s."workspaceId" AND w."ownerUserId"=s."createdByUserId"
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=s."createdByUserId"
    JOIN "ConstructionCommunicationIdentity" i ON i.id=s.request->>'identityId' AND i."workspaceId"=w.id AND i."userId"=s."createdByUserId"
    JOIN "ConstructionConnectorAccount" a ON a.id=s."connectorAccountId" AND a."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" sg ON sg."connectorAccountId"=a.id
    JOIN "PersonalAssistantOperation" child ON child.id=$4 AND child."sourcePersonalOperationId"=s.id AND child."workspaceId"=w.id AND child."createdByUserId"=s."createdByUserId"
    JOIN "ConstructionConnectorAccount" ma ON ma.id=child."connectorAccountId" AND ma."workspaceId"=w.id AND ma."createdByUserId"=s."createdByUserId"
    JOIN "ConstructionConnectorCredential" mc ON mc.id=ma."credentialRef" AND mc."connectorAccountId"=ma.id AND mc."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" mg ON mg."connectorAccountId"=ma.id
    JOIN "ConstructionConnectorAccount" ga ON ga."workspaceId"=w.id AND ga."createdByUserId"=s."createdByUserId"
    JOIN "ConstructionConnectorCredential" gc ON gc.id=ga."credentialRef" AND gc."connectorAccountId"=ga.id AND gc."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" gg ON gg."connectorAccountId"=ga.id
    WHERE s.id=$1 AND s."workspaceId"=$2 AND s."createdByUserId"=$3 AND s.kind='personal_sms_inbound'
      AND (($5::timestamptz IS NULL AND s.status='completed') OR ($5::timestamptz IS NOT NULL AND s.status='processing' AND s.attempts=1
        AND s."leaseUntil"=($5::timestamptz AT TIME ZONE 'UTC') AND s."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')))
      AND w.status='active' AND m.status='active' AND m.role='owner' AND i.channel='sms' AND i.status='active' AND i.verified=true AND 'COMMAND'=ANY(i.permissions)
      AND i."normalizedAddress"=s.request->>'from' AND NOT EXISTS (SELECT 1 FROM "ConstructionCommunicationIdentity" oi JOIN "ConstructionWorkspace" ow ON ow.id=oi."workspaceId"
        WHERE oi.id<>i.id AND oi.channel='sms' AND oi.status='active' AND oi.verified=true AND 'COMMAND'=ANY(oi.permissions) AND ow.status='active' AND oi."normalizedAddress"=i."normalizedAddress")
      AND a.provider='endvera_sms' AND a.status='connected' AND a."revokedAt" IS NULL AND a."externalAccountKeyHash"=$6
      AND sg.capability='sms_inbound' AND sg.status='active' AND sg."revokedAt" IS NULL
      AND child.kind='personal_model_candidate_v1' AND child.status='completed' AND child.attempts=1
      AND ma.provider='openrouter' AND ma.status='connected' AND ma."revokedAt" IS NULL AND mc."revokedAt" IS NULL
      AND mg.capability='personal_model_inference' AND mg.status='active' AND mg."revokedAt" IS NULL AND 'personal_data:inference'=ANY(mg."grantedScopes")
      AND $8=ANY(mg."grantedScopes") AND mg."grantedAt">=('2026-09-10T01:18:26Z'::timestamptz AT TIME ZONE 'UTC') AND mg."grantedAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
      AND ga.provider='google_calendar' AND ga.status='connected' AND ga."revokedAt" IS NULL AND gc."revokedAt" IS NULL
      AND gg.capability='calendar_write' AND gg.status='active' AND gg."revokedAt" IS NULL AND $7=ANY(ga."grantedScopes") AND $7=ANY(gg."grantedScopes")
    FOR SHARE OF s,w,m,i,a,sg,child,ma,mc,mg,ga,gc,gg`, sourceId, actor.workspaceId, actor.userId, modelChildId,
  sourceClaim ? new Date(sourceClaim.leaseUntil) : null, temporalSha(env.TWILIO_ACCOUNT_SID ?? ""), GOOGLE_CALENDAR_WRITE_SCOPE, `authority:${PERSONAL_MODEL_AUTHORITY}`);
  if (rows.length !== 1) throw new Error("TEMPORAL_REGISTRY_CURRENT_BINDING_REQUIRED");
  const row = rows[0], source = temporalCheckedSource(row, actor);
  if (!(row.now instanceof Date) || !Number.isFinite(row.now.getTime()) || row.now.getTime() < Date.parse("2026-09-10T01:18:26Z")
    || row.now.getTime() >= Date.parse("2026-10-10T01:18:26Z") || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY
    || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") throw new Error("TEMPORAL_REGISTRY_PILOT_INACTIVE");
  if (source.accountSid !== env.TWILIO_ACCOUNT_SID || source.to !== env.TWILIO_PHONE_NUMBER) throw new Error("TEMPORAL_REGISTRY_SMS_BINDING_CHANGED");
  const binding = smsTemporalClarificationBindingSchema.parse({ ...actor, memberId: row.memberId, memberRole: "owner", memberRevision: row.memberRevision.toISOString(),
    workspaceRevision: row.workspaceRevision.toISOString(), identityId: row.identityId, identityRevision: row.identityRevision.toISOString(), verifiedIdentity: true,
    ownerNumber: source.from, endveraNumber: source.to, smsAccountId: row.smsAccountId, smsAccountVersion: row.smsAccountVersion, smsAccountKeyHash: temporalSha(source.accountSid),
    smsInboundGrantId: row.smsInboundGrantId, smsInboundGrantVersion: row.smsInboundGrantVersion,
    modelAccountId: row.modelAccountId, modelAccountVersion: row.modelAccountVersion, modelGrantId: row.modelGrantId, modelGrantVersion: row.modelGrantVersion,
    calendarAccountId: row.calendarAccountId, calendarAccountVersion: row.calendarAccountVersion,
    calendarWriteGrantId: row.calendarWriteGrantId, calendarWriteGrantVersion: row.calendarWriteGrantVersion, timezone: row.timezone });
  return { source, binding, sourceResult: row.result, now: row.now };
}
