-- SYNTHETIC ONLY. No actual provider acceptance, credential, authority or audio.
-- This fixed seed targets actual migration70, never the generated client79.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';
INSERT INTO "User" (id,name,email,"updatedAt")
VALUES ('rehearsal-owner','Synthetic migration owner','migration-rehearsal@example.invalid','2026-09-10 00:00:00');
INSERT INTO "ConstructionWorkspace" (id,"ownerUserId",name,"updatedAt")
VALUES ('rehearsal-workspace','rehearsal-owner','Synthetic upgrade workspace','2026-09-10 00:00:00');
INSERT INTO "ConstructionWorkspaceMember" (id,"workspaceId","userId",role,"updatedAt")
VALUES ('rehearsal-member','rehearsal-workspace','rehearsal-owner','owner','2026-09-10 00:00:00');
INSERT INTO "ConstructionConnectorAccount" (id,"workspaceId",provider,status,"createdByUserId","revokedAt","updatedAt") VALUES
('rehearsal-sms','rehearsal-workspace','endvera_sms','revoked','rehearsal-owner','2026-09-10 00:00:00','2026-09-10 00:00:00'),
('rehearsal-google','rehearsal-workspace','google_calendar','revoked','rehearsal-owner','2026-09-10 00:00:00','2026-09-10 00:00:00');
INSERT INTO "PersonalAssistantBudget" (id,"ceilingCadMicros","reservedCadMicros","expiresAt","updatedAt")
VALUES ('rehearsal-budget',10000000,250000,'2026-09-11 00:00:00','2026-09-10 00:00:00');
INSERT INTO "PersonalAssistantOperation" (id,"workspaceId","connectorAccountId",kind,status,"idempotencyKey",request,"requestHash",result,
 "createdByUserId","leaseUntil",attempts,"budgetId","reservedCadMicros","createdAt","updatedAt")
SELECT v.id,'rehearsal-workspace',v.account,v.kind,v.status,'synthetic-rehearsal:'||v.id,v.request,
 encode(sha256(convert_to(v.request::text,'UTF8')),'hex'),v.result,'rehearsal-owner',v.lease,v.attempts,
 v.budget,v.reserved,'2026-03-08 02:30:00'::timestamp,'2026-09-10 00:00:00'::timestamp
FROM (VALUES
 ('rehearsal-inbound','rehearsal-sms','personal_sms_inbound','received','{"synthetic":true,"text":"Demande conservée é 🏗️"}'::jsonb,NULL::jsonb,NULL::timestamp,0,NULL::text,NULL::bigint),
 ('rehearsal-completed','rehearsal-sms','sms_outbound','completed','{"synthetic":true,"text":"Réponse historique"}'::jsonb,'{"synthetic":true,"receiptObserved":false,"nested":{"proof":"retain exactly"}}'::jsonb,NULL::timestamp,1,NULL::text,NULL::bigint),
 ('rehearsal-calendar','rehearsal-google','calendar_write','pending','{"synthetic":true,"title":"Brouillon historique"}'::jsonb,NULL::jsonb,NULL::timestamp,0,NULL::text,NULL::bigint),
 ('rehearsal-processing','rehearsal-sms','sms_outbound','processing','{"synthetic":true,"text":"Claim expiré"}'::jsonb,'{"synthetic":true,"claim":"retain old claim","automaticRetry":false}'::jsonb,'2026-01-01 00:00:00'::timestamp,1,'rehearsal-budget',250000::bigint)
) AS v(id,account,kind,status,request,result,lease,attempts,budget,reserved);
INSERT INTO "PersonalAssistantDeliveryReceipt" (id,"operationId","providerSid",status,"createdAt")
VALUES ('rehearsal-receipt','rehearsal-completed','SYNTHETIC_NOT_A_PROVIDER_SID','synthetic_not_delivered','2026-03-08 02:30:00');
INSERT INTO "VoiceIntakeSession" (id,"clientId","languageHint","consentVersion","consentedAt","maxDurationMs","maxSegmentDurationMs",
 "maxSegmentBytes","maxSegments","maxTotalBytes","maxTotalCostMicros","expiresAt","createdAt","updatedAt")
VALUES ('rehearsal-voice','rehearsal-owner','fr','SYNTHETIC_NOT_REAL_CONSENT','2026-03-08 02:30:00',600000,45000,2000000,14,28000000,100000,
 '2026-03-08 03:30:00','2026-03-08 02:30:00','2026-03-08 02:30:00');
INSERT INTO "VoiceIntakeSegment" (id,"sessionId",ordinal,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint","createdAt","updatedAt")
VALUES ('rehearsal-segment','rehearsal-voice',0,'m4a','audio/mp4',1000,128,'sha256:'||repeat('a',64),'fr','2026-03-08 02:30:00','2026-03-08 02:30:00');
INSERT INTO "AiOperation" (id,"voiceIntakeSegmentId",purpose,"operationKey","createdAt","updatedAt")
VALUES ('rehearsal-ai','rehearsal-segment','intake_voice_transcription','synthetic-rehearsal-ai','2026-03-08 02:30:00','2026-03-08 02:30:00');
COMMIT;
