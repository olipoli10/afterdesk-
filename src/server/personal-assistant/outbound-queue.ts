import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
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
  const temporalQuestions = () => env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED === "true"
    && env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED === "true"
    && env.ENDVERA_EXTERNAL_AUTHORITY_REF === PERSONAL_MODEL_AUTHORITY && env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT === "2026-10-10T01:18:26Z";
  const withTemporalQuestions = temporalQuestions();
  const remaining = () => {
    if (!enabled(input, env) || confirmations() !== withConfirmations || temporalQuestions() !== withTemporalQuestions) throw new Error("OUTBOUND_QUEUE_DISABLED");
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
        AND ((o."idempotencyKey"='reply:'||s.id AND o.request->>'text'=s.result->>'reply'
          AND (NOT EXISTS (SELECT 1 FROM "PersonalSmsTemporalClarification" attached WHERE attached."questionOutboundOperationId"=o.id)
            OR ($6 AND EXISTS (SELECT 1 FROM "PersonalSmsTemporalClarification" q
              JOIN "ConstructionWorkspaceMember" qm ON qm.id=q.prepared#>>'{binding,memberId}' AND qm."workspaceId"=q."workspaceId" AND qm."userId"=q."userId"
              JOIN "ConstructionCommunicationIdentity" qi ON qi.id=q."identityId" AND qi."workspaceId"=q."workspaceId" AND qi."userId"=q."userId"
              JOIN "ConstructionConnectorGrant" qs ON qs.id=q.prepared#>>'{binding,smsInboundGrantId}' AND qs."connectorAccountId"=a.id
              JOIN "PersonalAssistantOperation" qc ON qc.id=q."modelChildOperationId" AND qc."workspaceId"=q."workspaceId" AND qc."createdByUserId"=q."userId" AND qc."sourcePersonalOperationId"=s.id
              JOIN "ConstructionConnectorAccount" qa ON qa.id=qc."connectorAccountId" AND qa.id=q.prepared#>>'{binding,modelAccountId}' AND qa."workspaceId"=q."workspaceId" AND qa."createdByUserId"=q."userId"
              JOIN "ConstructionConnectorCredential" qac ON qac.id=qa."credentialRef" AND qac."connectorAccountId"=qa.id AND qac."workspaceId"=q."workspaceId"
              JOIN "ConstructionConnectorGrant" qag ON qag.id=q.prepared#>>'{binding,modelGrantId}' AND qag."connectorAccountId"=qa.id
              JOIN "ConstructionConnectorAccount" qg ON qg.id=q.prepared#>>'{binding,calendarAccountId}' AND qg."workspaceId"=q."workspaceId" AND qg."createdByUserId"=q."userId"
              JOIN "ConstructionConnectorCredential" qgc ON qgc.id=qg."credentialRef" AND qgc."connectorAccountId"=qg.id AND qgc."workspaceId"=q."workspaceId"
              JOIN "ConstructionConnectorGrant" qgg ON qgg.id=q.prepared#>>'{binding,calendarWriteGrantId}' AND qgg."connectorAccountId"=qg.id
              WHERE q."questionOutboundOperationId"=o.id AND q."workspaceId"=o."workspaceId" AND q."userId"=o."createdByUserId" AND q."sourceOperationId"=s.id
                AND q.phase='PREPARED' AND q."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AND q."acceptedAt" IS NULL AND q."failedAttempts"=0
                AND q."questionRequestHash"=o."requestHash" AND o.request->>'text'=q.prepared->>'wireText' AND s.result->'personalModelReview'=q."reviewSnapshot"
                AND s."requestHash"=q.prepared#>>'{source,requestHash}' AND s.request->>'body'=q.prepared#>>'{source,body}'
                AND w."ownerUserId"=q."userId" AND w."defaultTimezone"=q.prepared#>>'{binding,timezone}'
                AND to_char(w."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=q.prepared#>>'{binding,workspaceRevision}'
                AND qm.status='active' AND qm.role='owner' AND to_char(qm."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=q.prepared#>>'{binding,memberRevision}'
                AND qi.status='active' AND qi.channel='sms' AND qi.verified=true AND 'COMMAND'=ANY(qi.permissions)
                AND qi.id=s.request->>'identityId' AND qi."normalizedAddress"=o.request->>'to'
                AND to_char(qi."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=q.prepared#>>'{binding,identityRevision}'
                AND NOT EXISTS (SELECT 1 FROM "ConstructionCommunicationIdentity" other_identity JOIN "ConstructionWorkspace" other_workspace ON other_workspace.id=other_identity."workspaceId"
                  WHERE other_identity.id<>qi.id AND other_identity.channel='sms' AND other_identity.status='active' AND other_identity.verified=true
                    AND 'COMMAND'=ANY(other_identity.permissions) AND other_workspace.status='active' AND other_identity."normalizedAddress"=qi."normalizedAddress")
                AND a.id=q.prepared#>>'{binding,smsAccountId}' AND a."stateVersion"::text=q.prepared#>>'{binding,smsAccountVersion}'
                AND qs.capability='sms_inbound' AND qs.status='active' AND qs."revokedAt" IS NULL AND qs."stateVersion"::text=q.prepared#>>'{binding,smsInboundGrantVersion}'
                AND qc.kind='personal_model_candidate_v1' AND qc.status='completed' AND qc.attempts=1 AND qc."modelGatewayOperationId"=q."modelGatewayOperationId"
                AND qa.provider='openrouter' AND qa.status='connected' AND qa."revokedAt" IS NULL AND qac."revokedAt" IS NULL
                AND qa."stateVersion"::text=q.prepared#>>'{binding,modelAccountVersion}'
                AND qag.capability='personal_model_inference' AND qag.status='active' AND qag."revokedAt" IS NULL
                AND qag."stateVersion"::text=q.prepared#>>'{binding,modelGrantVersion}' AND 'personal_data:inference'=ANY(qag."grantedScopes") AND $7=ANY(qag."grantedScopes")
                AND qag."grantedAt">=('2026-09-10T01:18:26Z'::timestamptz AT TIME ZONE 'UTC') AND qag."grantedAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
                AND qg.provider='google_calendar' AND qg.status='connected' AND qg."revokedAt" IS NULL AND qgc."revokedAt" IS NULL
                AND qg."stateVersion"::text=q.prepared#>>'{binding,calendarAccountVersion}' AND $5=ANY(qg."grantedScopes")
                AND qgg.capability='calendar_write' AND qgg.status='active' AND qgg."revokedAt" IS NULL AND $5=ANY(qgg."grantedScopes")
                AND qgg."stateVersion"::text=q.prepared#>>'{binding,calendarWriteGrantVersion}'
                AND EXISTS (SELECT 1 FROM "PersonalSmsConversationExpectation" qe WHERE qe.id='temporal:'||q.id AND qe."clarificationId"=q.id
                  AND qe.kind='TEMPORAL_CLARIFICATION' AND qe.namespace=q.namespace AND qe.active)))))
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
              AND d."correlatedTemporalReceiptId" IS NULL
              AND NOT EXISTS (SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" correlated WHERE correlated."calendarOperationId"=d.id)
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
    createHash("sha256").update(env.TWILIO_ACCOUNT_SID ?? "").digest("hex"), withConfirmations, GOOGLE_CALENDAR_WRITE_SCOPE, withTemporalQuestions, `authority:${PERSONAL_MODEL_AUTHORITY}`);
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
