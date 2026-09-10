-- Local OFF storage migration. Not activation authority; no provider bridge.
-- No provider bridge, grants, credentials, policy or transport is installed.

ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "PersonalAssistantOperation_kind_check";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_kind_check"
  CHECK (kind IN ('personal_sms_inbound','google_oauth','calendar_write','sms_outbound','voice_outbound','sms_pairing',
    'personal_model_candidate_v1','calendar_confirmation_summary'));
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "calendar_confirmation_summary_off_ck" CHECK (
  kind<>'calendar_confirmation_summary' OR (
    status='pending' AND attempts=0 AND "leaseUntil" IS NULL AND result IS NULL
    AND "externalTransportPerformed"=false AND "budgetId" IS NULL AND "reservedCadMicros" IS NULL
    AND "sourcePersonalOperationId" IS NULL AND "modelGatewayOperationId" IS NULL
  )
);

CREATE TABLE "PersonalCalendarSmsConfirmationNonce" (
  "nonReuseKey" TEXT PRIMARY KEY CHECK ("nonReuseKey" ~ '^[a-f0-9]{64}$'),
  namespace TEXT NOT NULL CHECK (namespace ~ '^[a-f0-9]{64}$'),
  "phraseHash" TEXT NOT NULL CHECK ("phraseHash" ~ '^[a-f0-9]{64}$'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_confirmation_nonce_visible_pair_key" UNIQUE (namespace,"phraseHash")
);
CREATE TABLE "PersonalCalendarSmsConfirmation" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "sourceOperationId" TEXT NOT NULL,
  "modelChildOperationId" TEXT NOT NULL,
  "calendarOperationId" TEXT NOT NULL UNIQUE,
  "summaryOperationId" TEXT NOT NULL UNIQUE,
  "bridgeOutboundOperationId" TEXT UNIQUE,
  "confirmationSourceOperationId" TEXT UNIQUE,
  "reviewActionId" TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'PREPARED',
  prepared JSONB NOT NULL,
  "reviewSnapshot" JSONB NOT NULL,
  "bindingHash" TEXT NOT NULL,
  namespace TEXT NOT NULL,
  "nonReuseKey" TEXT NOT NULL UNIQUE,
  "summaryHash" TEXT NOT NULL,
  "summaryRequestHash" TEXT NOT NULL CHECK ("summaryRequestHash" ~ '^[a-f0-9]{64}$'),
  "acceptedProviderSid" TEXT UNIQUE,
  "acceptedAt" TIMESTAMP(3),
  "confirmationSourceRequestHash" TEXT,
  "confirmationProviderSid" TEXT UNIQUE,
  "confirmationSourceClaim" JSONB,
  "calendarClaim" JSONB,
  "consumedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_confirmation_source_action_key" UNIQUE ("sourceOperationId","reviewActionId"),
  CONSTRAINT "calendar_confirmation_nonce_fkey" FOREIGN KEY ("nonReuseKey") REFERENCES "PersonalCalendarSmsConfirmationNonce"("nonReuseKey") ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Identity revisions are snapshots, NOT composite ownership FKs: re-pairing
  -- and revoking a current identity must remain possible after a challenge.
  CONSTRAINT "calendar_confirmation_identity_fkey" FOREIGN KEY ("identityId") REFERENCES "ConstructionCommunicationIdentity"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_source_fkey" FOREIGN KEY ("sourceOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_child_fkey" FOREIGN KEY ("modelChildOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_calendar_fkey" FOREIGN KEY ("calendarOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_summary_fkey" FOREIGN KEY ("summaryOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_bridge_fkey" FOREIGN KEY ("bridgeOutboundOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_consumption_source_fkey" FOREIGN KEY ("confirmationSourceOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "calendar_confirmation_closed_shape_ck" CHECK ((
    phase IN ('PREPARED','WAITING','CONSUMED','COMPLETED','UNCERTAIN','EXPIRED','REFUSED')
    AND "failedAttempts" BETWEEN 0 AND 5
    AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '10 minutes'
    AND "bindingHash" ~ '^[a-f0-9]{64}$' AND namespace ~ '^[a-f0-9]{64}$' AND "summaryHash" ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(prepared)='object' AND jsonb_typeof("reviewSnapshot")='object'
    AND octet_length(prepared::text)<=131072 AND octet_length("reviewSnapshot"::text)<=131072
    AND ("confirmationSourceClaim" IS NULL OR (jsonb_typeof("confirmationSourceClaim")='object' AND octet_length("confirmationSourceClaim"::text)<=4096))
    AND ("calendarClaim" IS NULL OR (jsonb_typeof("calendarClaim")='object' AND octet_length("calendarClaim"::text)<=32768))
    AND prepared->>'status'='PREPARED_LOCAL_OFF' AND prepared->>'executionAuthorized'='false'
    AND prepared->>'requiresDurableUniqueness'='true'
    AND ("acceptedProviderSid" IS NULL OR "acceptedProviderSid" ~ '^SM[a-f0-9]{32}$')
    AND ("confirmationProviderSid" IS NULL OR "confirmationProviderSid" ~ '^SM[a-f0-9]{32}$')
    AND ("confirmationSourceRequestHash" IS NULL OR "confirmationSourceRequestHash" ~ '^[a-f0-9]{64}$')
    AND (("bridgeOutboundOperationId" IS NULL AND "acceptedProviderSid" IS NULL AND "acceptedAt" IS NULL)
      OR ("bridgeOutboundOperationId" IS NOT NULL AND "acceptedProviderSid" IS NOT NULL AND "acceptedAt" IS NOT NULL
        AND "acceptedAt">="createdAt" AND "acceptedAt"<"expiresAt"))
    AND ((phase IN ('PREPARED','WAITING','EXPIRED','REFUSED') AND "confirmationSourceOperationId" IS NULL AND "confirmationSourceRequestHash" IS NULL
      AND "confirmationProviderSid" IS NULL AND "confirmationSourceClaim" IS NULL AND "calendarClaim" IS NULL AND "consumedAt" IS NULL)
      OR (phase IN ('CONSUMED','COMPLETED','UNCERTAIN') AND "confirmationSourceOperationId" IS NOT NULL AND "confirmationSourceRequestHash" IS NOT NULL
        AND "confirmationProviderSid" IS NOT NULL AND "confirmationSourceClaim" IS NOT NULL AND "calendarClaim" IS NOT NULL AND "consumedAt" IS NOT NULL
        AND "consumedAt">="acceptedAt" AND "consumedAt"<"expiresAt"))
    AND (phase<>'PREPARED' OR "bridgeOutboundOperationId" IS NULL)
    AND (phase NOT IN ('WAITING','CONSUMED','COMPLETED','UNCERTAIN') OR "bridgeOutboundOperationId" IS NOT NULL)
  ) IS TRUE)
);
CREATE UNIQUE INDEX "calendar_confirmation_one_active_visible_pair" ON "PersonalCalendarSmsConfirmation"(namespace)
  WHERE phase IN ('PREPARED','WAITING','CONSUMED');
CREATE INDEX "calendar_confirmation_namespace_created_idx" ON "PersonalCalendarSmsConfirmation"(namespace,"createdAt");
CREATE INDEX "calendar_confirmation_owner_phase_expiry_idx" ON "PersonalCalendarSmsConfirmation"("workspaceId","userId",phase,"expiresAt");

CREATE FUNCTION calendar_confirmation_nonce_permanent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'calendar confirmation nonce registry is permanent'; END $$;
CREATE TRIGGER "calendar_confirmation_nonce_no_mutation" BEFORE UPDATE OR DELETE ON "PersonalCalendarSmsConfirmationNonce"
  FOR EACH ROW EXECUTE FUNCTION calendar_confirmation_nonce_permanent();
CREATE TRIGGER "calendar_confirmation_nonce_no_truncate" BEFORE TRUNCATE ON "PersonalCalendarSmsConfirmationNonce"
  FOR EACH STATEMENT EXECUTE FUNCTION calendar_confirmation_nonce_permanent();

CREATE FUNCTION calendar_confirmation_summary_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP='DELETE' AND OLD.kind='calendar_confirmation_summary') OR
     (TG_OP='UPDATE' AND (OLD.kind='calendar_confirmation_summary' OR NEW.kind='calendar_confirmation_summary') AND OLD IS DISTINCT FROM NEW) THEN
    RAISE EXCEPTION 'calendar confirmation summary is immutable and non executable';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "calendar_confirmation_summary_immutable" BEFORE UPDATE OR DELETE ON "PersonalAssistantOperation"
  FOR EACH ROW EXECUTE FUNCTION calendar_confirmation_summary_immutable();

CREATE FUNCTION calendar_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p JSONB; b JSONB; scope TEXT; phrase TEXT; valid BOOLEAN;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'calendar confirmation durable evidence cannot be erased'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.phase<>'PREPARED' OR NEW."failedAttempts"<>0 OR NEW."createdAt">clock_timestamp()
      OR NEW."expiresAt"<=clock_timestamp() THEN RAISE EXCEPTION 'calendar confirmation must start prepared with current DB lifetime'; END IF;
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
    IF NEW.phase='EXPIRED' AND OLD.phase<>'EXPIRED' AND NEW."expiresAt">clock_timestamp() THEN RAISE EXCEPTION 'calendar confirmation not expired'; END IF;
    IF NEW.phase IN ('WAITING','CONSUMED') AND NEW.phase IS DISTINCT FROM OLD.phase AND NEW."expiresAt"<=clock_timestamp() THEN RAISE EXCEPTION 'calendar confirmation expired'; END IF;
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
        AND s.kind='personal_sms_inbound' AND s.status='processing' AND s.attempts=1 AND s."leaseUntil">clock_timestamp()
        AND s."leaseUntil"=(NEW."confirmationSourceClaim"->>'leaseUntil')::timestamptz AND s."requestHash"=NEW."confirmationSourceRequestHash"
        AND s.request->>'messageSid'=NEW."confirmationProviderSid" AND s.request->>'body'=NEW.prepared->>'phrase'
        AND s."createdAt">=NEW."acceptedAt" AND s."createdAt"<=clock_timestamp()
        AND d.kind='calendar_write' AND d.status='processing' AND d.attempts=1 AND d."leaseUntil">clock_timestamp()
        AND d."leaseUntil"=(NEW."calendarClaim"->>'leaseUntil')::timestamptz AND d.result->>'approvalToken'=NEW."calendarClaim"->>'approvalToken'
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
      AND (p->>'createdAt')::timestamptz=NEW."createdAt" AND (p->>'expiresAt')::timestamptz=NEW."expiresAt"
      AND phrase ~ '^CONFIRME ENDVERA AGENDA ([a-z]+ ){3}[a-z]+$'
      AND b#>>'{owner,ownerNumber}' ~ '^\+[1-9][0-9]{7,14}$' AND b#>>'{owner,endveraNumber}' ~ '^\+[1-9][0-9]{7,14}$') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'calendar confirmation snapshot mismatch';
  END IF;
  SELECT true INTO valid FROM "PersonalCalendarSmsConfirmationNonce" n WHERE n."nonReuseKey"=NEW."nonReuseKey" AND n.namespace=NEW.namespace
    AND n."phraseHash"=encode(sha256(convert_to(phrase,'UTF8')),'hex');
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation permanent nonce mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "calendar_confirmation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PersonalCalendarSmsConfirmation"
  FOR EACH ROW EXECUTE FUNCTION calendar_confirmation_guard();
CREATE TRIGGER "calendar_confirmation_no_truncate" BEFORE TRUNCATE ON "PersonalCalendarSmsConfirmation"
  FOR EACH STATEMENT EXECUTE FUNCTION calendar_confirmation_guard();

-- Deferred checks inspect the FINAL CURRENT row, not the stale NEW snapshot
-- queued at preparation. No triggers are added to permissions/member updates:
-- revocation remains possible and current epochs are rechecked at consumption.
CREATE FUNCTION calendar_confirmation_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
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
      AND c."reviewSnapshot"#>>'{source,text}'=s.request->>'body' AND (c."reviewSnapshot"#>>'{source,receivedAt}')::timestamptz=s."createdAt"
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
        AND (c."confirmationSourceClaim"->>'leaseUntil')::timestamptz>c."consumedAt"
        AND c."calendarClaim"->>'operationId'=d.id AND c."calendarClaim"->>'expectedRequestHash'=d."requestHash"
        AND c."calendarClaim"->>'userId'=c."userId" AND c."calendarClaim"->>'workspaceId'=c."workspaceId" AND c."calendarClaim"->'request'=d.request
        AND c."calendarClaim"#>>'{authority,accountId}'=b#>>'{calendar,accountId}' AND c."calendarClaim"#>>'{authority,accountVersion}'=b#>>'{calendar,accountVersion}'
        AND c."calendarClaim"#>>'{authority,credentialId}'=b#>>'{calendar,credentialId}' AND c."calendarClaim"#>>'{authority,writeGrantId}'=b#>>'{calendar,writeGrantId}'
        AND c."calendarClaim"#>>'{authority,writeGrantVersion}'=b#>>'{calendar,writeGrantVersion}' AND c."calendarClaim"#>>'{authority,memberId}'=b#>>'{owner,memberId}'
        AND c."calendarClaim"#>>'{authority,memberRole}'='owner' AND (c."calendarClaim"#>>'{authority,memberUpdatedAt}')::timestamptz=(b#>>'{owner,memberRevision}')::timestamptz
        AND (c."calendarClaim"#>>'{authority,workspaceUpdatedAt}')::timestamptz=(b#>>'{owner,workspaceRevision}')::timestamptz
        AND d.kind='calendar_write' AND d.attempts=1 AND ((c.phase='CONSUMED' AND d.status IN ('processing','completed','uncertain'))
          OR (c.phase='COMPLETED' AND d.status='completed') OR (c.phase='UNCERTAIN' AND d.status='uncertain'))
        AND (d.status<>'processing' OR (d.result->>'approvalToken'=c."calendarClaim"->>'approvalToken' AND d."leaseUntil"=(c."calendarClaim"->>'leaseUntil')::timestamptz));
    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'calendar confirmation must consume exact source and calendar claim atomically'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "calendar_confirmation_final_binding" AFTER INSERT OR UPDATE ON "PersonalCalendarSmsConfirmation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION calendar_confirmation_final_binding();
CREATE CONSTRAINT TRIGGER "calendar_confirmation_summary_final_binding" AFTER INSERT ON "PersonalAssistantOperation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.kind='calendar_confirmation_summary') EXECUTE FUNCTION calendar_confirmation_final_binding();

-- Freeze only referenced operation evidence, not live account/member/grant rows.
-- The first exact final source CAS is permitted; later evidence replacement is not.
CREATE FUNCTION calendar_confirmation_operation_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "PersonalCalendarSmsConfirmation"%ROWTYPE;
BEGIN
  FOR c IN SELECT * FROM "PersonalCalendarSmsConfirmation" WHERE "sourceOperationId"=OLD.id OR "calendarOperationId"=OLD.id
    OR "confirmationSourceOperationId"=OLD.id OR "bridgeOutboundOperationId"=OLD.id LOOP
    IF ROW(NEW.id,NEW."workspaceId",NEW."createdByUserId",NEW."connectorAccountId",NEW.kind,NEW."idempotencyKey",NEW.request,NEW."requestHash",NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."createdByUserId",OLD."connectorAccountId",OLD.kind,OLD."idempotencyKey",OLD.request,OLD."requestHash",OLD."createdAt") THEN
      RAISE EXCEPTION 'calendar confirmation referenced operation binding is immutable';
    END IF;
    IF c."sourceOperationId"=OLD.id THEN
      IF OLD.status='completed' AND (NEW.status<>'completed' OR NEW.result->'personalModelReview' IS DISTINCT FROM OLD.result->'personalModelReview') THEN
        RAISE EXCEPTION 'calendar confirmation source review is immutable';
      END IF;
      IF OLD.status<>'completed' AND (OLD.status<>'processing' OR NEW.status<>'completed' OR NEW.result->'personalModelReview' IS DISTINCT FROM c."reviewSnapshot") THEN
        RAISE EXCEPTION 'calendar confirmation requires its exact final source CAS';
      END IF;
    END IF;
    IF c."confirmationSourceOperationId"=OLD.id AND OLD.status='completed' AND (NEW.status<>'completed' OR NEW.result IS DISTINCT FROM OLD.result) THEN
      RAISE EXCEPTION 'calendar confirmation consumption receipt is immutable';
    END IF;
    IF c."bridgeOutboundOperationId"=OLD.id AND (NEW.status<>'completed'
      OR ROW(NEW.result->>'providerSid',NEW.result->>'acceptedByProvider',NEW.result->>'approvalHash')
      IS DISTINCT FROM ROW(OLD.result->>'providerSid',OLD.result->>'acceptedByProvider',OLD.result->>'approvalHash')) THEN
      RAISE EXCEPTION 'calendar confirmation accepted bridge is immutable';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER "calendar_confirmation_operation_binding_guard" BEFORE UPDATE ON "PersonalAssistantOperation"
  FOR EACH ROW EXECUTE FUNCTION calendar_confirmation_operation_binding_guard();
