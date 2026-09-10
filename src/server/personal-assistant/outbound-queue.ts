import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import type { ConnectorEnvironment } from "./google-client";

type Input = Readonly<{ enabled?: boolean; limit?: number; includeConfirmations?: boolean; deadlineAt?: number; signal?: AbortSignal }>;
const candidateSchema = z.object({ id: z.string().min(1).max(191), idempotencyKey: z.string().min(1).max(512) }).strict();
function enabled(input: Input, env: ConnectorEnvironment) {
  return input.enabled === true && externalCapabilityDecision("SMS", env).enabled
    && env.ENDVERA_PERSONAL_SMS_WORKER_ENABLED === "true" && env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED === "true"
    && Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "") > Date.now();
}
/** Read-only scheduling hints, NEVER approval or action authority. Invalidated
 * retained summaries cannot monopolize oldest-first selection. Transient budget,
 * rate/provider failures remain pending; this does not promise global fairness
 * across every transient refusal. No retry of any already-claimed operation. */
export async function selectPersonalAutomaticOutboundCandidates(input: Input = {}, env: ConnectorEnvironment = process.env) {
  if (!enabled(input, env)) return Object.freeze({ status: "DISABLED" as const, candidates: Object.freeze([]), executionAuthorized: false as const });
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("OUTBOUND_QUEUE_LIMIT_INVALID");
  if (input.deadlineAt !== undefined && !Number.isFinite(input.deadlineAt)) throw new Error("OUTBOUND_QUEUE_DEADLINE_INVALID");
  const deadlineAt = Math.min(input.deadlineAt ?? Infinity, Date.now() + 2500);
  const confirmations = () => input.includeConfirmations === true && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true"
    && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED === "true" && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED === "true";
  const withConfirmations = confirmations();
  const remaining = () => {
    if (!enabled(input, env) || confirmations() !== withConfirmations) throw new Error("OUTBOUND_QUEUE_DISABLED");
    if (input.signal?.aborted) throw new Error("OUTBOUND_QUEUE_ABORTED");
    const value = Math.floor(deadlineAt - Date.now()); if (value < 2) throw new Error("OUTBOUND_QUEUE_DEADLINE"); return value;
  };
  const time = remaining(), maxWait = Math.min(500, Math.max(1, Math.floor(time / 4)));
  const rows = await prisma.$transaction(async tx => {
    const budget = Math.min(2000, remaining() - 1);
    await tx.$executeRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", String(budget), String(Math.min(250, budget)));
    remaining();
    const candidates = await tx.$queryRawUnsafe<Array<{ id: string; idempotencyKey: string }>>(`
      SELECT o.id,o."idempotencyKey" FROM "PersonalAssistantOperation" o
      JOIN "PersonalAssistantOperation" s ON s.id=o.request->>'sourceOperationId'
        AND s."workspaceId"=o."workspaceId" AND s."createdByUserId"=o."createdByUserId" AND s."connectorAccountId"=o."connectorAccountId"
      JOIN "ConstructionWorkspace" w ON w.id=o."workspaceId" AND w.status='active'
      JOIN "ConstructionConnectorAccount" a ON a.id=o."connectorAccountId" AND a."workspaceId"=w.id
      WHERE o.kind='sms_outbound' AND o.status IN ('pending','approved') AND o.attempts=0 AND o."leaseUntil" IS NULL
        AND s.kind='personal_sms_inbound' AND s.status='completed'
        AND o.request->>'to'=s.request->>'from' AND o.request->>'from'=s.request->>'to' AND o.request->>'from'=$2
        AND a.provider='endvera_sms' AND a.status='connected' AND a."revokedAt" IS NULL AND a."externalAccountKeyHash"=$3
        AND EXISTS (SELECT 1 FROM "ConstructionWorkspaceMember" m WHERE m."workspaceId"=w.id AND m."userId"=o."createdByUserId"
          AND m.status='active' AND m.role IN ('owner','admin'))
        AND EXISTS (SELECT 1 FROM "ConstructionCommunicationIdentity" i WHERE i."workspaceId"=w.id AND i."userId"=o."createdByUserId"
          AND i.channel='sms' AND i.status='active' AND i.verified=true AND 'COMMAND'=ANY(i.permissions) AND i."normalizedAddress"=o.request->>'to')
        AND EXISTS (SELECT 1 FROM "ConstructionConnectorGrant" send WHERE send."connectorAccountId"=a.id
          AND send.capability='personal_sms_send' AND send.status='active' AND send."revokedAt" IS NULL)
        AND ((o."idempotencyKey"='reply:'||s.id AND o.request->>'text'=s.result->>'reply')
          OR ($4 AND EXISTS (SELECT 1 FROM "PersonalCalendarSmsConfirmation" c
            JOIN "PersonalAssistantOperation" d ON d.id=c."calendarOperationId" AND d."workspaceId"=c."workspaceId" AND d."createdByUserId"=c."userId"
            JOIN "PersonalAssistantOperation" summary ON summary.id=c."summaryOperationId" AND summary."workspaceId"=c."workspaceId" AND summary."createdByUserId"=c."userId"
            JOIN "ConstructionConnectorAccount" g ON g.id=d."connectorAccountId" AND g."workspaceId"=c."workspaceId" AND g."createdByUserId"=c."userId"
            JOIN "ConstructionConnectorCredential" credential ON credential.id=g."credentialRef" AND credential."connectorAccountId"=g.id AND credential."workspaceId"=c."workspaceId"
            JOIN "ConstructionConnectorGrant" write ON write.id=c.prepared#>>'{binding,calendar,writeGrantId}' AND write."connectorAccountId"=g.id
            JOIN "ConstructionConnectorGrant" inbound ON inbound.id=c.prepared#>>'{binding,owner,smsInboundGrantId}' AND inbound."connectorAccountId"=a.id
            WHERE c."workspaceId"=o."workspaceId" AND c."userId"=o."createdByUserId" AND c."sourceOperationId"=s.id
              AND o."idempotencyKey"='calendar-confirmation:'||c.id AND c.phase='PREPARED' AND c."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')
              AND c."bridgeOutboundOperationId" IS NULL AND c."acceptedAt" IS NULL AND c."failedAttempts"=0
              AND w."ownerUserId"=c."userId" AND s.result->'personalModelReview'=c."reviewSnapshot"
              AND to_char(w."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=c.prepared#>>'{binding,owner,workspaceRevision}'
              AND EXISTS (SELECT 1 FROM "ConstructionWorkspaceMember" owner
                WHERE owner.id=c.prepared#>>'{binding,owner,memberId}' AND owner."workspaceId"=w.id AND owner."userId"=c."userId"
                  AND owner.status='active' AND owner.role='owner'
                  AND to_char(owner."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=c.prepared#>>'{binding,owner,memberRevision}')
              AND EXISTS (SELECT 1 FROM "ConstructionCommunicationIdentity" identity
                WHERE identity.id=c.prepared#>>'{binding,owner,identityId}' AND identity."workspaceId"=w.id AND identity."userId"=c."userId"
                  AND identity.channel='sms' AND identity.status='active' AND identity.verified=true AND 'COMMAND'=ANY(identity.permissions)
                  AND identity."normalizedAddress"=o.request->>'to'
                  AND to_char(identity."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=c.prepared#>>'{binding,owner,identityRevision}')
              AND summary.kind='calendar_confirmation_summary' AND summary.status='pending' AND summary."requestHash"=c."summaryRequestHash"
              AND summary.request->>'challengeId'=c.id AND o.request->>'text'=summary.request->>'text'
              AND d.kind='calendar_write' AND d.status='pending' AND d.attempts=0 AND d."leaseUntil" IS NULL
              AND d."requestHash"=c.prepared#>>'{binding,calendar,requestHash}'
              AND g.provider='google_calendar' AND g.status='connected' AND g."revokedAt" IS NULL AND credential."revokedAt" IS NULL
              AND g.id=c.prepared#>>'{binding,calendar,accountId}' AND g."stateVersion"::text=c.prepared#>>'{binding,calendar,accountVersion}'
              AND credential.id=c.prepared#>>'{binding,calendar,credentialId}'
              AND write.capability='calendar_write' AND write.status='active' AND write."revokedAt" IS NULL
              AND write."stateVersion"::text=c.prepared#>>'{binding,calendar,writeGrantVersion}' AND $5=ANY(g."grantedScopes") AND $5=ANY(write."grantedScopes")
              AND inbound.capability='sms_inbound' AND inbound.status='active' AND inbound."revokedAt" IS NULL
              AND inbound."stateVersion"::text=c.prepared#>>'{binding,owner,smsInboundGrantVersion}'
              AND a.id=c.prepared#>>'{binding,owner,smsAccountId}' AND a."stateVersion"::text=c.prepared#>>'{binding,owner,smsAccountVersion}')))
      ORDER BY o."createdAt",o.id LIMIT $1`, limit, env.TWILIO_PHONE_NUMBER,
    createHash("sha256").update(env.TWILIO_ACCOUNT_SID ?? "").digest("hex"), withConfirmations, GOOGLE_CALENDAR_WRITE_SCOPE);
    remaining(); return candidates;
  }, { isolationLevel: "Serializable", maxWait, timeout: Math.min(2000, time - maxWait) });
  remaining();
  if (rows.length > limit) throw new Error("OUTBOUND_QUEUE_RESULT_INVALID");
  const candidates = rows.map(row => {
    const candidate = candidateSchema.parse(row);
    if (!candidate.idempotencyKey.startsWith("reply:") && !(withConfirmations && candidate.idempotencyKey.startsWith("calendar-confirmation:"))) throw new Error("OUTBOUND_QUEUE_RESULT_INVALID");
    return Object.freeze(candidate);
  });
  return Object.freeze({ status: "CANDIDATES_NOT_AUTHORIZED" as const, candidates: Object.freeze(candidates), executionAuthorized: false as const });
}
