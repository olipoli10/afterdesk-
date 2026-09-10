-- Forward-only UTC-naive datetime repair. Existing timestamp(3) types, rows,
-- hashes, claims, grants, one-use transitions and evidence are unchanged.
-- Prisma stores absolute instants as UTC-naive columns. Never let the SQL
-- session TimeZone reinterpret those values. No activation or provider action.
-- Shared Construction* defaults are inventoried separately, not altered here.

ALTER TABLE "AiUsage" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "AccountProviderSpendHold" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "AiOperation" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayPolicyVersion" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayRouteProfile" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayOperation" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayDecision" ALTER COLUMN "decidedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayAttempt" ALTER COLUMN "startedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayBreaker" ALTER COLUMN "changedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayBreakerEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "ModelGatewayAuditEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PersonalAssistantOperation" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PersonalCalendarSmsConfirmationNonce" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PersonalCalendarSmsConfirmation" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PersonalAssistantBudget" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PersonalAssistantDeliveryReceipt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- Replace only the two datetime-bearing guard functions. Their existing
-- triggers, deferrability, immutable bindings and ownership checks remain.
CREATE OR REPLACE FUNCTION calendar_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p JSONB; b JSONB; scope TEXT; phrase TEXT; valid BOOLEAN;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'calendar confirmation durable evidence cannot be erased'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.phase<>'PREPARED' OR NEW."failedAttempts"<>0 OR NEW."createdAt">(clock_timestamp() AT TIME ZONE 'UTC')
      OR NEW."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'calendar confirmation must start prepared with current DB lifetime'; END IF;
  ELSE
    IF ROW(NEW.id,NEW."workspaceId",NEW."userId",NEW."identityId",NEW."sourceOperationId",NEW."modelChildOperationId",NEW."calendarOperationId",
      NEW."summaryOperationId",NEW."reviewActionId",NEW.prepared,NEW."reviewSnapshot",NEW."bindingHash",NEW.namespace,NEW."nonReuseKey",NEW."summaryHash",NEW."summaryRequestHash",NEW."createdAt",NEW."expiresAt")
      IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."userId",OLD."identityId",OLD."sourceOperationId",OLD."modelChildOperationId",OLD."calendarOperationId",
      OLD."summaryOperationId",OLD."reviewActionId",OLD.prepared,OLD."reviewSnapshot",OLD."bindingHash",OLD.namespace,OLD."nonReuseKey",OLD."summaryHash",OLD."summaryRequestHash",OLD."createdAt",OLD."expiresAt") THEN
      RAISE EXCEPTION 'calendar confirmation binding and lifetime are immutable';
    END IF;
    IF OLD.phase IN ('COMPLETED','UNCERTAIN','EXPIRED','REFUSED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'calendar confirmation terminal evidence is immutable'; END IF;
    IF NEW.phase IS DISTINCT FROM OLD.phase AND NOT ((OLD.phase='PREPARED' AND NEW.phase IN ('WAITING','EXPIRED','REFUSED'))
      OR (OLD.phase='WAITING' AND NEW.phase IN ('CONSUMED','EXPIRED','REFUSED')) OR (OLD.phase='CONSUMED' AND NEW.phase IN ('COMPLETED','UNCERTAIN'))) THEN
      RAISE EXCEPTION 'calendar confirmation transition refused';
    END IF;
    IF NEW.phase='EXPIRED' AND OLD.phase<>'EXPIRED' AND NEW."expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'calendar confirmation not expired'; END IF;
    IF NEW.phase IN ('WAITING','CONSUMED') AND NEW.phase IS DISTINCT FROM OLD.phase AND NEW."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'calendar confirmation expired'; END IF;
    IF NEW."failedAttempts" IS DISTINCT FROM OLD."failedAttempts" AND NOT (OLD.phase='WAITING' AND NEW.phase IN ('WAITING','REFUSED')
      AND NEW."failedAttempts"=OLD."failedAttempts"+1 AND NEW."failedAttempts"<=5) THEN RAISE EXCEPTION 'calendar confirmation failure counter refused'; END IF;
    IF NEW."failedAttempts"=5 AND NEW.phase='WAITING' THEN RAISE EXCEPTION 'calendar confirmation attempts exhausted'; END IF;
    IF ROW(NEW."bridgeOutboundOperationId",NEW."acceptedProviderSid",NEW."acceptedAt") IS DISTINCT FROM ROW(OLD."bridgeOutboundOperationId",OLD."acceptedProviderSid",OLD."acceptedAt")
      AND NOT (OLD.phase='PREPARED' AND NEW.phase='WAITING') THEN RAISE EXCEPTION 'calendar confirmation bridge is immutable'; END IF;
    IF ROW(NEW."confirmationSourceOperationId",NEW."confirmationSourceRequestHash",NEW."confirmationProviderSid",NEW."confirmationSourceClaim",NEW."calendarClaim",NEW."consumedAt")
      IS DISTINCT FROM ROW(OLD."confirmationSourceOperationId",OLD."confirmationSourceRequestHash",OLD."confirmationProviderSid",OLD."confirmationSourceClaim",OLD."calendarClaim",OLD."consumedAt")
      AND NOT (OLD.phase='WAITING' AND NEW.phase='CONSUMED') THEN RAISE EXCEPTION 'calendar confirmation consumption is immutable'; END IF;
    IF OLD.phase='WAITING' AND NEW.phase='CONSUMED' THEN
      -- At transition both live claims must already exist. The source final CAS
      -- follows in the same transaction and is checked by the deferred guard.
      SELECT true INTO valid FROM "PersonalAssistantOperation" s JOIN "PersonalAssistantOperation" d ON d.id=NEW."calendarOperationId"
      WHERE s.id=NEW."confirmationSourceOperationId" AND s."workspaceId"=NEW."workspaceId" AND s."createdByUserId"=NEW."userId"
        AND s.kind='personal_sms_inbound' AND s.status='processing' AND s.attempts=1 AND s."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')
        AND s."leaseUntil"=((NEW."confirmationSourceClaim"->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC') AND s."requestHash"=NEW."confirmationSourceRequestHash"
        AND s.request->>'messageSid'=NEW."confirmationProviderSid" AND s.request->>'body'=NEW.prepared->>'phrase'
        AND s."createdAt">=NEW."acceptedAt" AND s."createdAt"<=(clock_timestamp() AT TIME ZONE 'UTC')
        AND d.kind='calendar_write' AND d.status='processing' AND d.attempts=1 AND d."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')
        AND d."leaseUntil"=((NEW."calendarClaim"->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC') AND d.result->>'approvalToken'=NEW."calendarClaim"->>'approvalToken'
        AND d."requestHash"=NEW."calendarClaim"->>'expectedRequestHash' AND d.request=NEW."calendarClaim"->'request';
      IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation requires simultaneous live source and calendar claims'; END IF;
    END IF;
  END IF;
  p:=NEW.prepared; b:=p->'binding'; phrase:=p->>'phrase';
  scope:=encode(sha256(convert_to('["ENDVERA_CALENDAR_CONFIRMATION","'||(b#>>'{owner,ownerNumber}')||'","'||(b#>>'{owner,endveraNumber}')||'"]','UTF8')),'hex');
  IF (jsonb_typeof(b)='object' AND b->>'policyVersion'='ENDVERA_CALENDAR_CONFIRM_V1' AND b#>>'{owner,memberRole}'='owner'
      AND length(b#>>'{owner,memberId}')>0 AND length(b#>>'{owner,smsInboundGrantId}')>0 AND (b#>>'{owner,smsInboundGrantVersion}')::integer>0
      AND (b#>>'{owner,memberRevision}')::timestamptz IS NOT NULL AND (b#>>'{owner,workspaceRevision}')::timestamptz IS NOT NULL
      AND b#>>'{owner,workspaceId}'=NEW."workspaceId" AND b#>>'{owner,userId}'=NEW."userId" AND b#>>'{owner,identityId}'=NEW."identityId"
      AND b#>>'{source,operationId}'=NEW."sourceOperationId" AND b#>>'{source,modelChildOperationId}'=NEW."modelChildOperationId"
      AND b#>>'{source,reviewActionId}'=NEW."reviewActionId" AND b#>>'{calendar,operationId}'=NEW."calendarOperationId"
      AND p->>'bindingHash'=NEW."bindingHash" AND p->>'summaryHash'=NEW."summaryHash" AND p->>'namespace'=NEW.namespace AND scope=NEW.namespace
      AND p->>'nonReuseKey'=NEW."nonReuseKey" AND NEW."nonReuseKey"=encode(sha256(convert_to('["'||scope||'","'||phrase||'"]','UTF8')),'hex')
      AND NEW."summaryHash"=encode(sha256(convert_to(p->>'summary','UTF8')),'hex') AND length(p->>'summary') BETWEEN 1 AND 1500
      AND ((p->>'createdAt')::timestamptz AT TIME ZONE 'UTC')=NEW."createdAt" AND ((p->>'expiresAt')::timestamptz AT TIME ZONE 'UTC')=NEW."expiresAt"
      AND phrase ~ '^CONFIRME ENDVERA AGENDA ([a-z]+ ){3}[a-z]+$'
      AND b#>>'{owner,ownerNumber}' ~ '^\+[1-9][0-9]{7,14}$' AND b#>>'{owner,endveraNumber}' ~ '^\+[1-9][0-9]{7,14}$') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'calendar confirmation snapshot mismatch';
  END IF;
  SELECT true INTO valid FROM "PersonalCalendarSmsConfirmationNonce" n WHERE n."nonReuseKey"=NEW."nonReuseKey" AND n.namespace=NEW.namespace
    AND n."phraseHash"=encode(sha256(convert_to(phrase,'UTF8')),'hex');
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation permanent nonce mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION calendar_confirmation_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "PersonalCalendarSmsConfirmation"%ROWTYPE; b JSONB; valid BOOLEAN; target TEXT;
BEGIN
  IF TG_TABLE_NAME='PersonalAssistantOperation' THEN
    IF NEW.kind<>'calendar_confirmation_summary' THEN RETURN NULL; END IF;
    target:=NEW.request->>'challengeId';
  ELSE target:=NEW.id; END IF;
  SELECT * INTO c FROM "PersonalCalendarSmsConfirmation" WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar confirmation summary requires durable challenge'; END IF;
  IF TG_TABLE_NAME='PersonalAssistantOperation' AND NEW.id IS DISTINCT FROM c."summaryOperationId" THEN
    RAISE EXCEPTION 'calendar confirmation summary row is not the exact bound summary';
  END IF;
  b:=c.prepared->'binding';
  SELECT true INTO valid FROM "PersonalAssistantOperation" s
    JOIN "PersonalAssistantOperation" child ON child.id=c."modelChildOperationId" AND child."sourcePersonalOperationId"=s.id
      AND child."workspaceId"=s."workspaceId" AND child."createdByUserId"=s."createdByUserId"
    JOIN "PersonalAssistantOperation" d ON d.id=c."calendarOperationId" AND d."workspaceId"=s."workspaceId" AND d."createdByUserId"=s."createdByUserId"
    JOIN "PersonalAssistantOperation" summary ON summary.id=c."summaryOperationId" AND summary."workspaceId"=s."workspaceId" AND summary."createdByUserId"=s."createdByUserId"
    WHERE s.id=c."sourceOperationId" AND s."workspaceId"=c."workspaceId" AND s."createdByUserId"=c."userId" AND s.kind='personal_sms_inbound' AND s.status='completed'
      AND s."requestHash"=b#>>'{source,requestHash}' AND s.request->>'messageSid'=b#>>'{source,providerMessageId}'
      AND s.request->>'from'=b#>>'{owner,ownerNumber}' AND s.request->>'to'=b#>>'{owner,endveraNumber}' AND s.request->>'identityId'=c."identityId"
      AND s."connectorAccountId"=b#>>'{owner,smsAccountId}' AND s.result->'personalModelReview'=c."reviewSnapshot"
      AND c."reviewSnapshot"->>'status'='REVIEW_PREPARED_NOT_AUTHORIZED' AND c."reviewSnapshot"->>'executionAuthorized'='false'
      AND c."reviewSnapshot"->>'modelChildOperationId'=child.id AND c."reviewSnapshot"#>>'{source,operationId}'=s.id
      AND c."reviewSnapshot"#>>'{source,text}'=s.request->>'body' AND ((c."reviewSnapshot"#>>'{source,receivedAt}')::timestamptz AT TIME ZONE 'UTC')=s."createdAt"
      AND jsonb_array_length(c."reviewSnapshot"->'actions')=1 AND c."reviewSnapshot"#>>'{actions,0,actionId}'=c."reviewActionId"
      AND c."reviewSnapshot"#>>'{actions,0,kind}'='PREPARE_CALENDAR_EVENT' AND c."reviewSnapshot"#>>'{actions,0,status}'='PREPARED_UNSENT'
      AND c."reviewSnapshot"#>>'{actions,0,operationId}'=d.id AND c."reviewSnapshot"#>>'{actions,0,requestHash}'=d."requestHash"
      AND c."reviewSnapshot"#>'{actions,0,draft}'=b->'draft'
      AND child.kind='personal_model_candidate_v1' AND child.status='completed' AND child."modelGatewayOperationId" IS NOT NULL
      AND d.kind='calendar_write' AND d."requestHash"=b#>>'{calendar,requestHash}' AND d."connectorAccountId"=b#>>'{calendar,accountId}'
      AND d.request=(b->'draft')||jsonb_build_object('accountVersion',(b#>>'{calendar,accountVersion}')::integer,'requestId',b#>>'{calendar,requestId}')
      AND summary.kind='calendar_confirmation_summary' AND summary.status='pending' AND summary."externalTransportPerformed"=false AND summary.attempts=0
      AND summary."requestHash"=c."summaryRequestHash" AND summary."idempotencyKey"='calendar-confirmation-summary:'||c.id
      AND summary.request=jsonb_build_object('schemaVersion',1,'challengeId',c.id,'sourceOperationId',s.id,'modelChildOperationId',child.id,
        'calendarOperationId',d.id,'bindingHash',c."bindingHash",'summaryHash',c."summaryHash",'to',b#>>'{owner,ownerNumber}',
        'from',b#>>'{owner,endveraNumber}','text',c.prepared->>'summary');
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation requires exact final source review and dedicated summary'; END IF;
  IF c."bridgeOutboundOperationId" IS NOT NULL THEN
    valid:=NULL;
    SELECT true INTO valid FROM "PersonalAssistantOperation" o WHERE o.id=c."bridgeOutboundOperationId" AND o."workspaceId"=c."workspaceId" AND o."createdByUserId"=c."userId"
      AND o.kind='sms_outbound' AND o.status='completed' AND o.attempts=1 AND o."idempotencyKey"='calendar-confirmation:'||c.id
      AND o.request=jsonb_build_object('to',b#>>'{owner,ownerNumber}','from',b#>>'{owner,endveraNumber}','text',c.prepared->>'summary','sourceOperationId',c."sourceOperationId")
      AND o.result->>'acceptedByProvider'='true' AND o.result->>'providerSid'=c."acceptedProviderSid" AND o.result->>'approvalHash'=o."requestHash";
    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation accepted summary bridge required'; END IF;
  END IF;
  IF c.phase IN ('CONSUMED','COMPLETED','UNCERTAIN') THEN
    valid:=NULL;
    SELECT true INTO valid FROM "PersonalAssistantOperation" s JOIN "PersonalAssistantOperation" d ON d.id=c."calendarOperationId"
      WHERE s.id=c."confirmationSourceOperationId" AND s.id<>c."sourceOperationId" AND s."workspaceId"=c."workspaceId" AND s."createdByUserId"=c."userId"
        AND s.kind='personal_sms_inbound' AND s.status='completed' AND s.attempts=1 AND s."leaseUntil" IS NULL
        AND s."requestHash"=c."confirmationSourceRequestHash" AND s.request->>'messageSid'=c."confirmationProviderSid"
        AND s.request->>'body'=c.prepared->>'phrase' AND s.request->>'from'=b#>>'{owner,ownerNumber}' AND s.request->>'to'=b#>>'{owner,endveraNumber}'
        AND s.request->>'identityId'=c."identityId" AND s."connectorAccountId"=b#>>'{owner,smsAccountId}'
        AND s."createdAt">=c."acceptedAt" AND s."createdAt"<=c."consumedAt" AND s.result->>'challengeId'=c.id
        AND s.result->>'calendarOperationId'=d.id AND s.result->>'calendarWriteConfirmed'='false' AND s.result->>'executionAuthorized'='false'
        AND c."confirmationSourceClaim"->>'operationId'=s.id AND c."confirmationSourceClaim"->>'userId'=c."userId"
        AND c."confirmationSourceClaim"->>'workspaceId'=c."workspaceId" AND c."confirmationSourceClaim"->>'attempt'='1'
        AND ((c."confirmationSourceClaim"->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC')>c."consumedAt"
        AND c."calendarClaim"->>'operationId'=d.id AND c."calendarClaim"->>'expectedRequestHash'=d."requestHash"
        AND c."calendarClaim"->>'userId'=c."userId" AND c."calendarClaim"->>'workspaceId'=c."workspaceId" AND c."calendarClaim"->'request'=d.request
        AND c."calendarClaim"#>>'{authority,accountId}'=b#>>'{calendar,accountId}' AND c."calendarClaim"#>>'{authority,accountVersion}'=b#>>'{calendar,accountVersion}'
        AND c."calendarClaim"#>>'{authority,credentialId}'=b#>>'{calendar,credentialId}' AND c."calendarClaim"#>>'{authority,writeGrantId}'=b#>>'{calendar,writeGrantId}'
        AND c."calendarClaim"#>>'{authority,writeGrantVersion}'=b#>>'{calendar,writeGrantVersion}' AND c."calendarClaim"#>>'{authority,memberId}'=b#>>'{owner,memberId}'
        AND c."calendarClaim"#>>'{authority,memberRole}'='owner' AND (c."calendarClaim"#>>'{authority,memberUpdatedAt}')::timestamptz=(b#>>'{owner,memberRevision}')::timestamptz
        AND (c."calendarClaim"#>>'{authority,workspaceUpdatedAt}')::timestamptz=(b#>>'{owner,workspaceRevision}')::timestamptz
        AND d.kind='calendar_write' AND d.attempts=1 AND ((c.phase='CONSUMED' AND d.status IN ('processing','completed','uncertain'))
          OR (c.phase='COMPLETED' AND d.status='completed') OR (c.phase='UNCERTAIN' AND d.status='uncertain'))
        AND (d.status<>'processing' OR (d.result->>'approvalToken'=c."calendarClaim"->>'approvalToken' AND d."leaseUntil"=((c."calendarClaim"->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC')));
    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation must consume exact source and calendar claim atomically'; END IF;
  END IF;
  RETURN NULL;
END $$;
