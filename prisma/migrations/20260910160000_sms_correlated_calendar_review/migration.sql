-- Local OFF preparation provenance only. No backfill, activation, new budget,
-- action authority, source rewrite or change to applied migrations 76/77.
ALTER TABLE "PersonalSmsTemporalClarificationReply" ADD CONSTRAINT "PersonalSmsTemporalClarificationReply_id_workspaceId_userId_key" UNIQUE (id,"workspaceId","userId");
ALTER TABLE "PersonalAssistantOperation" ADD COLUMN "correlatedTemporalReceiptId" TEXT;
CREATE UNIQUE INDEX "PersonalAssistantOperation_correlatedTemporalReceiptId_key" ON "PersonalAssistantOperation"("correlatedTemporalReceiptId");
CREATE UNIQUE INDEX sms_correlated_calendar_marker_scope_key ON "PersonalAssistantOperation"("correlatedTemporalReceiptId","workspaceId","createdByUserId");
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT personal_correlated_calendar_operation_receipt_fk
  FOREIGN KEY ("correlatedTemporalReceiptId","workspaceId","createdByUserId") REFERENCES "PersonalSmsTemporalClarificationReply"(id,"workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT personal_correlated_calendar_marker_kind_check
  CHECK ("correlatedTemporalReceiptId" IS NULL OR (kind='calendar_write' AND "sourcePersonalOperationId" IS NULL AND "modelGatewayOperationId" IS NULL));

CREATE TABLE "PersonalSmsCorrelatedCalendarReview" (
  id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "receiptId" TEXT NOT NULL,
  "clarificationId" TEXT NOT NULL, "originalSourceOperationId" TEXT NOT NULL, "replySourceOperationId" TEXT NOT NULL,
  "modelChildOperationId" TEXT NOT NULL, "modelGatewayOperationId" TEXT NOT NULL, "reviewActionId" TEXT NOT NULL,
  "calendarOperationId" TEXT NOT NULL, "calendarRequestId" TEXT NOT NULL, "calendarRequestHash" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL, "accountVersion" INTEGER NOT NULL, "packetHash" TEXT NOT NULL,
  "reviewVersion" TEXT NOT NULL, proof JSONB NOT NULL, "proofHash" TEXT NOT NULL,
  "authorityRef" TEXT NOT NULL, "pilotExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC'),
  "preparationExpiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT personal_correlated_calendar_review_receipt_fk FOREIGN KEY ("receiptId","workspaceId","userId") REFERENCES "PersonalSmsTemporalClarificationReply"(id,"workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_question_fk FOREIGN KEY ("clarificationId","workspaceId","userId") REFERENCES "PersonalSmsTemporalClarification"(id,"workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_original_fk FOREIGN KEY ("originalSourceOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_reply_fk FOREIGN KEY ("replySourceOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_child_fk FOREIGN KEY ("modelChildOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_calendar_fk FOREIGN KEY ("calendarOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_gateway_fk FOREIGN KEY ("modelGatewayOperationId") REFERENCES "ModelGatewayOperation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_account_fk FOREIGN KEY ("connectorAccountId","workspaceId") REFERENCES "ConstructionConnectorAccount"(id,"workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT personal_correlated_calendar_review_shape_check CHECK (
    "accountVersion">0 AND "originalSourceOperationId"<>"replySourceOperationId"
    AND "reviewVersion"='personal-sms-correlated-calendar-review-v1'
    AND "calendarRequestHash" ~ '^[a-f0-9]{64}$' AND "packetHash" ~ '^[a-f0-9]{64}$' AND "proofHash" ~ '^[a-f0-9]{64}$'
    AND "calendarRequestId" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND "authorityRef"='ENDVERA-PERSONAL-20260910-100CAD'
    AND "pilotExpiresAt"=TIMESTAMP '2026-10-10 01:18:26' AND "createdAt"<"preparationExpiresAt")
);
CREATE UNIQUE INDEX "PersonalSmsCorrelatedCalendarReview_receiptId_key" ON "PersonalSmsCorrelatedCalendarReview"("receiptId");
CREATE UNIQUE INDEX "PersonalSmsCorrelatedCalendarReview_calendarOperationId_key" ON "PersonalSmsCorrelatedCalendarReview"("calendarOperationId");
CREATE UNIQUE INDEX sms_correlated_calendar_receipt_scope_key ON "PersonalSmsCorrelatedCalendarReview"("receiptId","workspaceId","userId");
CREATE UNIQUE INDEX sms_correlated_calendar_draft_scope_key ON "PersonalSmsCorrelatedCalendarReview"("calendarOperationId","workspaceId","userId");
CREATE INDEX sms_correlated_calendar_owner_created_idx ON "PersonalSmsCorrelatedCalendarReview"("workspaceId","userId","createdAt",id);

CREATE FUNCTION sms_correlated_calendar_exact_keys(v JSONB, keys TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_typeof(v)='object' AND v ?& keys AND (v-keys)='{}'::jsonb,false)
$$;
CREATE FUNCTION sms_correlated_calendar_utf16_length(value TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT coalesce(sum(CASE WHEN ascii(character)>65535 THEN 2 ELSE 1 END),0)::integer
  FROM regexp_split_to_table(value,'') AS characters(character) WHERE character<>''
$$;
-- Full ECMAScript TrimString set. Not PostgreSQL's ASCII-space-only btrim.
CREATE FUNCTION sms_correlated_calendar_trim(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)
    ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)
    ||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;
-- Exact six-field legacy JS stringify order, validated natively under three
-- session timezones before promotion from the controller's pg_temp probe.
CREATE FUNCTION sms_correlated_calendar_request_json(v JSONB) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF NOT sms_correlated_calendar_exact_keys(v,ARRAY['title','startsAt','endsAt','timezone','accountVersion','requestId'])
    OR jsonb_typeof(v->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'startsAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v->'endsAt') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'timezone') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v->'requestId') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'accountVersion') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'CORRELATED_CALENDAR_REQUEST_SHAPE_REQUIRED';
  END IF;
  IF (v->>'accountVersion')::numeric < 1 OR (v->>'accountVersion')::numeric > 2147483647
    OR trunc((v->>'accountVersion')::numeric) <> (v->>'accountVersion')::numeric THEN
    RAISE EXCEPTION 'CORRELATED_CALENDAR_ACCOUNT_VERSION_REQUIRED';
  END IF;
  RETURN '{"title":'||to_json(v->>'title')::text||',"startsAt":'||to_json(v->>'startsAt')::text
    ||',"endsAt":'||to_json(v->>'endsAt')::text||',"timezone":'||to_json(v->>'timezone')::text
    ||',"accountVersion":'||((v->>'accountVersion')::numeric)::integer::text||',"requestId":'||to_json(v->>'requestId')::text||'}';
END $$;
CREATE FUNCTION sms_correlated_calendar_request_hash(v JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to(sms_correlated_calendar_request_json(v),'UTF8')),'hex')
$$;
CREATE FUNCTION sms_correlated_calendar_request_id(receipt TEXT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE bytes BYTEA; hex TEXT;
BEGIN
  IF sms_correlated_calendar_utf16_length(receipt) NOT BETWEEN 1 AND 191 THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_RECEIPT_ID_REQUIRED'; END IF;
  bytes:=substring(sha256(convert_to('personal-sms-correlated-calendar:v1','UTF8')||decode('00','hex')||convert_to(receipt,'UTF8')) FROM 1 FOR 16);
  bytes:=set_byte(bytes,6,(get_byte(bytes,6) & 15) | 128);
  bytes:=set_byte(bytes,8,(get_byte(bytes,8) & 63) | 128);
  hex:=encode(bytes,'hex');
  RETURN substring(hex,1,8)||'-'||substring(hex,9,4)||'-'||substring(hex,13,4)||'-'||substring(hex,17,4)||'-'||substring(hex,21,12);
END $$;

CREATE FUNCTION sms_correlated_calendar_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE value TEXT; d JSONB;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_REVIEW_IMMUTABLE'; END IF;
  NEW."createdAt":=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC');
  FOREACH value IN ARRAY ARRAY[NEW.id,NEW."workspaceId",NEW."userId",NEW."receiptId",NEW."clarificationId",NEW."originalSourceOperationId",
    NEW."replySourceOperationId",NEW."modelChildOperationId",NEW."modelGatewayOperationId",NEW."reviewActionId",NEW."calendarOperationId",NEW."connectorAccountId"] LOOP
    IF value IS NULL OR sms_correlated_calendar_utf16_length(value) NOT BETWEEN 1 AND 191 THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_REVIEW_ID_REQUIRED'; END IF;
  END LOOP;
  IF NOT sms_correlated_calendar_exact_keys(NEW.proof,ARRAY['version','receiptProofVersion','inspectedReceiptProofHash','titleNormalization','draft','executionAuthorized','semanticInterpretationVerified','sourceAuthority'])
    OR octet_length(convert_to(sms_temporal_canonical_json(NEW.proof),'UTF8'))>16384
    OR NEW.proof->>'version' IS DISTINCT FROM 'personal-sms-correlated-calendar-reference-v1'
    OR NEW.proof->>'receiptProofVersion' IS DISTINCT FROM 'personal-correlated-receipt-proof-v1'
    OR jsonb_typeof(NEW.proof->'inspectedReceiptProofHash') IS DISTINCT FROM 'string'
    OR coalesce(NEW.proof->>'inspectedReceiptProofHash','') !~ '^[a-f0-9]{64}$'
    OR NEW.proof->>'titleNormalization' IS DISTINCT FROM 'EXISTING_SCHEMA_TRIM_ONLY'
    OR NEW.proof->'executionAuthorized' IS DISTINCT FROM 'false'::jsonb
    OR NEW.proof->'semanticInterpretationVerified' IS DISTINCT FROM 'false'::jsonb
    OR NEW.proof->>'sourceAuthority' IS DISTINCT FROM 'NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT'
    OR sms_temporal_hash(NEW.proof) IS DISTINCT FROM NEW."proofHash" THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_PROOF_REQUIRED'; END IF;
  d:=NEW.proof->'draft';
  IF NOT sms_correlated_calendar_exact_keys(d,ARRAY['title','startsAt','endsAt','timezone'])
    OR jsonb_typeof(d->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(d->'startsAt') IS DISTINCT FROM 'string'
    OR jsonb_typeof(d->'endsAt') IS DISTINCT FROM 'string' OR jsonb_typeof(d->'timezone') IS DISTINCT FROM 'string'
    OR sms_correlated_calendar_utf16_length(d->>'title') NOT BETWEEN 1 AND 240
    OR sms_correlated_calendar_utf16_length(d->>'timezone') NOT BETWEEN 1 AND 80
    OR d->>'title' IS DISTINCT FROM sms_correlated_calendar_trim(d->>'title')
    OR coalesce(d->>'startsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    OR coalesce(d->>'endsAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_DRAFT_REQUIRED'; END IF;
  IF (d->>'startsAt')::timestamptz >= (d->>'endsAt')::timestamptz THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_DRAFT_RANGE_REQUIRED'; END IF;
  IF NEW."calendarRequestId" IS DISTINCT FROM sms_correlated_calendar_request_id(NEW."receiptId") THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_REQUEST_ID_CHANGED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_correlated_calendar_review_guard BEFORE INSERT OR UPDATE OR DELETE ON "PersonalSmsCorrelatedCalendarReview" FOR EACH ROW EXECUTE FUNCTION sms_correlated_calendar_review_guard();
CREATE TRIGGER sms_correlated_calendar_review_no_truncate BEFORE TRUNCATE ON "PersonalSmsCorrelatedCalendarReview" FOR EACH STATEMENT EXECUTE FUNCTION sms_temporal_no_mutation();

CREATE FUNCTION sms_correlated_calendar_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW."correlatedTemporalReceiptId" IS DISTINCT FROM OLD."correlatedTemporalReceiptId" THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_MARKER_IMMUTABLE'; END IF;
    IF OLD."correlatedTemporalReceiptId" IS NOT NULL AND ROW(NEW.id,NEW."workspaceId",NEW."createdByUserId",NEW."connectorAccountId",NEW.kind,
        NEW.request,NEW."requestHash",NEW."idempotencyKey",NEW."createdAt",NEW."sourcePersonalOperationId",NEW."modelGatewayOperationId")
      IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."createdByUserId",OLD."connectorAccountId",OLD.kind,
        OLD.request,OLD."requestHash",OLD."idempotencyKey",OLD."createdAt",OLD."sourcePersonalOperationId",OLD."modelGatewayOperationId") THEN
      RAISE EXCEPTION 'CORRELATED_CALENDAR_OPERATION_BINDING_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."correlatedTemporalReceiptId" IS NULL THEN RETURN NEW; END IF;
  IF NEW.kind IS DISTINCT FROM 'calendar_write' OR NEW.status IS DISTINCT FROM 'pending' OR NEW.attempts IS DISTINCT FROM 0
    OR NEW."leaseUntil" IS NOT NULL OR NEW.result IS NOT NULL OR NEW."externalTransportPerformed" IS DISTINCT FROM false
    OR NEW."budgetId" IS NOT NULL OR NEW."reservedCadMicros" IS NOT NULL
    OR NEW."sourcePersonalOperationId" IS NOT NULL OR NEW."modelGatewayOperationId" IS NOT NULL
    OR NEW.request->>'requestId' IS DISTINCT FROM sms_correlated_calendar_request_id(NEW."correlatedTemporalReceiptId")
    OR NEW."idempotencyKey" IS DISTINCT FROM 'personal-calendar:'||NEW."workspaceId"||':'||(NEW.request->>'requestId')
    OR NEW."requestHash" IS DISTINCT FROM sms_correlated_calendar_request_hash(NEW.request) THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_NEW_PENDING_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_correlated_calendar_operation_guard BEFORE INSERT OR UPDATE ON "PersonalAssistantOperation" FOR EACH ROW EXECUTE FUNCTION sms_correlated_calendar_operation_guard();

CREATE FUNCTION sms_correlated_calendar_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v "PersonalSmsCorrelatedCalendarReview"%ROWTYPE; q "PersonalSmsTemporalClarification"%ROWTYPE;
  r "PersonalSmsTemporalClarificationReply"%ROWTYPE; o "PersonalAssistantOperation"%ROWTYPE; valid BOOLEAN; expected_proof_hash TEXT; final_clock TIMESTAMP;
BEGIN
  IF TG_TABLE_NAME='PersonalSmsCorrelatedCalendarReview' THEN
    SELECT * INTO v FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=NEW.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_FINAL_REVIEW_MISSING'; END IF;
  ELSIF TG_TABLE_NAME='PersonalAssistantOperation' THEN
    SELECT * INTO v FROM "PersonalSmsCorrelatedCalendarReview" WHERE "calendarOperationId"=NEW.id;
    IF NOT FOUND OR v."calendarOperationId" IS DISTINCT FROM NEW.id OR v."receiptId" IS DISTINCT FROM NEW."correlatedTemporalReceiptId" THEN
      RAISE EXCEPTION 'CORRELATED_CALENDAR_FINAL_REVIEW_MISSING';
    END IF;
  ELSE RAISE EXCEPTION 'CORRELATED_CALENDAR_TRIGGER_TABLE_REFUSED'; END IF;
  SELECT * INTO q FROM "PersonalSmsTemporalClarification" WHERE id=v."clarificationId" AND "workspaceId"=v."workspaceId" AND "userId"=v."userId";
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_QUESTION_MISSING'; END IF;
  SELECT * INTO r FROM "PersonalSmsTemporalClarificationReply" WHERE id=v."receiptId" AND "clarificationId"=q.id AND "workspaceId"=v."workspaceId" AND "userId"=v."userId";
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_RECEIPT_MISSING'; END IF;
  SELECT * INTO o FROM "PersonalAssistantOperation" WHERE id=v."calendarOperationId" AND "workspaceId"=v."workspaceId" AND "createdByUserId"=v."userId";
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_DRAFT_MISSING'; END IF;
  IF q.phase IS DISTINCT FROM 'CONSUMED' OR q."consumedReplyId" IS DISTINCT FROM r.id OR r.outcome IS DISTINCT FROM 'ACCEPTED'
    OR q.waiting IS NULL OR q."waitingHash" IS NULL OR q."acceptedAt" IS NULL OR q."acceptedProviderSid" IS NULL
    OR r."receivedAt"<=q."acceptedAt" OR r."createdAt"<r."receivedAt" OR r."createdAt">v."createdAt" OR r."createdAt">=q."expiresAt"
    OR r."packetHash" IS DISTINCT FROM v."packetHash" OR sms_temporal_hash(r.packet) IS DISTINCT FROM r."packetHash"
    OR q."sourceOperationId" IS DISTINCT FROM v."originalSourceOperationId" OR r."sourceOperationId" IS DISTINCT FROM v."replySourceOperationId"
    OR q."modelChildOperationId" IS DISTINCT FROM v."modelChildOperationId" OR q."modelGatewayOperationId" IS DISTINCT FROM v."modelGatewayOperationId"
    OR q."reviewActionId" IS DISTINCT FROM v."reviewActionId" OR r.packet->>'status' IS DISTINCT FROM 'RESOLVED_NOT_AUTHORIZED'
    OR r.packet->>'actionId' IS DISTINCT FROM v."reviewActionId" OR r.packet->'executionAuthorized' IS DISTINCT FROM 'false'::jsonb
    OR r.packet->'persistencePerformed' IS DISTINCT FROM 'false'::jsonb
    OR r.packet#>>'{evidence,correlation,clarificationId}' IS DISTINCT FROM q.id
    OR r.packet#>>'{evidence,correlation,waitingHash}' IS DISTINCT FROM q."waitingHash"
    OR r.packet#>>'{evidence,proposalHash}' IS DISTINCT FROM q.prepared->>'proposalHash'
    OR jsonb_typeof(r.packet->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(r.packet->'sources')<>2
    OR r.packet#>'{sources,0}' IS DISTINCT FROM q.prepared->'source'
    OR r.packet#>'{evidence,correlation,sources}' IS DISTINCT FROM r.packet->'sources'
    OR r.packet#>'{evidence,citations}' IS DISTINCT FROM r.packet->'citations'
    OR v."connectorAccountId" IS DISTINCT FROM q.prepared#>>'{binding,calendarAccountId}'
    OR v."accountVersion"::text IS DISTINCT FROM q.prepared#>>'{binding,calendarAccountVersion}' THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_LINEAGE_CHANGED'; END IF;
  expected_proof_hash:=sms_temporal_hash(jsonb_build_object('status','CORRELATED_RECEIPT_PROOF_INSPECTED_NOT_AUTHORIZED',
    'version','personal-correlated-receipt-proof-v1','subject',jsonb_build_object('kind','personal_sms_temporal_receipt','receiptId',r.id),
    'packetHash',r."packetHash",'originalPacket',r.packet,'resolution',r.packet,'executionAuthorized',false,'providerExecutionPerformed',false,
    'persistencePerformed',false,'sourceAuthority','NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT','draft',NULL));
  -- Comparison to exact producer bytes is not evidence that a DB loader ran.
  IF v.proof->>'inspectedReceiptProofHash' IS DISTINCT FROM expected_proof_hash
    OR v.proof#>>'{draft,title}' IS DISTINCT FROM sms_correlated_calendar_trim(r.packet#>>'{citations,title,quote}')
    OR v.proof#>>'{draft,startsAt}' IS DISTINCT FROM r.packet->>'startsAtUtc'
    OR v.proof#>>'{draft,endsAt}' IS DISTINCT FROM r.packet->>'endsAtUtc'
    OR v.proof#>>'{draft,timezone}' IS DISTINCT FROM r.packet->>'timezone'
    OR r.packet->>'anchorReceivedAt' IS DISTINCT FROM q.prepared#>>'{source,receivedAt}' THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_PROOF_PACKET_CHANGED'; END IF;
  IF jsonb_array_length((q.prepared->>'rawProposal')::jsonb->'actions')<>1
    OR (q.prepared->>'rawProposal')::jsonb#>>'{actions,0,id}' IS DISTINCT FROM v."reviewActionId"
    OR (q.prepared->>'rawProposal')::jsonb#>>'{actions,0,kind}' IS DISTINCT FROM 'PREPARE_CALENDAR_EVENT'
    OR (q.prepared->>'rawProposal')::jsonb#>'{actions,0,dependsOn}' IS DISTINCT FROM '[]'::jsonb
    OR r.packet#>'{citations,title}' IS DISTINCT FROM ((q.prepared->>'rawProposal')::jsonb#>'{actions,0,title}')||jsonb_build_object('sourceOperationId',q."sourceOperationId",'requestHash',q.prepared#>>'{source,requestHash}')
    OR r.packet#>'{citations,originalStart}' IS DISTINCT FROM ((q.prepared->>'rawProposal')::jsonb#>'{actions,0,starts}')||jsonb_build_object('sourceOperationId',q."sourceOperationId",'requestHash',q.prepared#>>'{source,requestHash}')
    OR r.packet#>'{citations,originalEnd}' IS DISTINCT FROM ((q.prepared->>'rawProposal')::jsonb#>'{actions,0,ends}')||jsonb_build_object('sourceOperationId',q."sourceOperationId",'requestHash',q.prepared#>>'{source,requestHash}')
    OR r.packet->>'timezone' IS DISTINCT FROM q.prepared#>>'{binding,timezone}' THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_CITATIONS_CHANGED'; END IF;
  IF o."correlatedTemporalReceiptId" IS DISTINCT FROM r.id OR o.kind IS DISTINCT FROM 'calendar_write' OR o.status IS DISTINCT FROM 'pending'
    OR o.attempts IS DISTINCT FROM 0 OR o."leaseUntil" IS NOT NULL OR o.result IS NOT NULL OR o."externalTransportPerformed" IS DISTINCT FROM false
    OR o."budgetId" IS NOT NULL OR o."reservedCadMicros" IS NOT NULL OR o."sourcePersonalOperationId" IS NOT NULL OR o."modelGatewayOperationId" IS NOT NULL
    OR o."connectorAccountId" IS DISTINCT FROM v."connectorAccountId" OR o."requestHash" IS DISTINCT FROM v."calendarRequestHash"
    OR o.request IS DISTINCT FROM (v.proof->'draft')||jsonb_build_object('accountVersion',v."accountVersion",'requestId',v."calendarRequestId")
    OR o."requestHash" IS DISTINCT FROM sms_correlated_calendar_request_hash(o.request)
    OR o."idempotencyKey" IS DISTINCT FROM 'personal-calendar:'||v."workspaceId"||':'||v."calendarRequestId" THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_FINAL_PENDING_CHANGED'; END IF;
  SELECT true INTO valid FROM "PersonalAssistantOperation" s JOIN "PersonalAssistantOperation" answer ON answer.id=r."sourceOperationId"
    JOIN "PersonalAssistantOperation" child ON child.id=q."modelChildOperationId"
    JOIN "ModelGatewayOperation" g ON g.id=q."modelGatewayOperationId" JOIN "AiOperation" ai ON ai.id=g."aiOperationId"
    JOIN "ModelGatewayAttempt" a ON a.id=g."finalAttemptId" JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" AND d."gatewayOperationId"=g.id
  WHERE s.id=q."sourceOperationId" AND s."workspaceId"=v."workspaceId" AND s."createdByUserId"=v."userId" AND s.kind='personal_sms_inbound'
    AND s.status='completed' AND s.attempts=1 AND s."leaseUntil" IS NULL AND s.result->'personalModelReview'=q."reviewSnapshot"
    AND s."requestHash"=q.prepared#>>'{source,requestHash}' AND sms_temporal_sms_hash(s.request)=s."requestHash"
    AND s.request->>'contentHash'=s."requestHash" AND s.request->>'body'=q.prepared#>>'{source,body}'
    AND s.request->>'identityId'=q."identityId" AND s.request->>'accountSid'=q.prepared#>>'{source,accountSid}'
    AND s.request->>'messageSid'=q.prepared#>>'{source,messageSid}' AND s.request->>'from'=q.prepared#>>'{binding,ownerNumber}' AND s.request->>'to'=q.prepared#>>'{binding,endveraNumber}'
    AND s."createdAt"=((q.prepared#>>'{source,receivedAt}')::timestamptz AT TIME ZONE 'UTC')
    AND answer."workspaceId"=v."workspaceId" AND answer."createdByUserId"=v."userId" AND answer.kind='personal_sms_inbound'
    AND answer.status='completed' AND answer.attempts=1 AND answer."leaseUntil" IS NULL AND answer.id<>s.id
    AND answer."requestHash"=r."requestHash" AND sms_temporal_sms_hash(answer.request)=r."requestHash" AND answer.request->>'contentHash'=r."requestHash"
    AND answer.request->>'messageSid'=r."providerSid" AND answer.request->>'body'=r.packet#>>'{sources,1,body}'
    AND answer.request->>'from'=s.request->>'from' AND answer.request->>'to'=s.request->>'to' AND answer.request->>'identityId'=q."identityId"
    AND answer."connectorAccountId"=s."connectorAccountId" AND s."connectorAccountId"=q.prepared#>>'{binding,smsAccountId}'
    AND answer."createdAt"=r."receivedAt" AND answer.result->>'temporalClarificationReceiptId'=r.id AND answer.result->>'packetHash'=r."packetHash"
    AND r.packet#>'{sources,1}'=jsonb_build_object('operationId',answer.id,'workspaceId',answer."workspaceId",'userId',answer."createdByUserId",'identityId',q."identityId",
      'verifiedIngress',true,'accountSid',answer.request->>'accountSid','messageSid',answer.request->>'messageSid','from',answer.request->>'from','to',answer.request->>'to',
      'body',answer.request->>'body','requestHash',answer."requestHash",'receivedAt',to_char(answer."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    AND r.packet#>'{citations,answer}'=jsonb_build_object('sourceOperationId',answer.id,'requestHash',answer."requestHash",'start',0,
      'end',sms_correlated_calendar_utf16_length(answer.request->>'body'),'quote',answer.request->>'body')
    AND answer.result->>'source'='TEMPORAL_CLARIFICATION' AND answer.result->'executionAuthorized'='false'::jsonb
    AND answer.result->'externalTransportPerformed'='false'::jsonb AND answer.result->'automaticRetry'='false'::jsonb
    AND child."workspaceId"=v."workspaceId" AND child."createdByUserId"=v."userId" AND child.kind='personal_model_candidate_v1'
    AND child."sourcePersonalOperationId"=s.id AND child."modelGatewayOperationId"=g.id AND child.status='completed' AND child.attempts=1
    AND child.result->>'status'='PROPOSAL_STORED_NOT_AUTHORIZED' AND child.result->'executionAuthorized'='false'::jsonb
    AND 'sha256:'||sms_temporal_hash(child.result)=q."proposalEvidenceRef" AND g."resultEvidenceRef"=q."proposalEvidenceRef" AND a."responseEvidenceRef"=q."proposalEvidenceRef"
    AND child.result->'proposal'=(q.prepared->>'rawProposal')::jsonb AND sms_temporal_canonical_json(child.result->'proposal')=q.prepared->>'rawProposal'
    AND child.request->>'sourceOperationId'=s.id AND child.request->>'gatewayOperationId'=g.id AND child.request->>'requestFingerprint'=g."requestFingerprint"
    AND (q.prepared->>'rawProposal')::jsonb->>'requestFingerprint'=g."requestFingerprint"
    AND g."tenantId"='construction-workspace:'||v."workspaceId" AND g."operationType"='personal_intent_candidate_v1'
    AND ai."personalAssistantOperationId"=s.id AND ai.purpose='personal_intent_candidate_v1' AND ai.status='succeeded' AND ai.attempts=1
    AND ai."resultId"=child.id AND ai."resultKind"='personal_model_proposal_inspected' AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
    AND a."resultContractStatus"='valid' AND d.disposition='route_authorized' AND d.attempt=1;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_FINAL_SOURCE_CHANGED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "PersonalSmsConversationExpectation" WHERE id='temporal:'||q.id AND "clarificationId"=q.id
      AND namespace=q.namespace AND kind='TEMPORAL_CLARIFICATION' AND "confirmationId" IS NULL AND active=false) THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_LEDGER_CHANGED'; END IF;
  final_clock:=clock_timestamp() AT TIME ZONE 'UTC';
  IF v."createdAt">final_clock OR final_clock>=v."preparationExpiresAt"
    OR v."preparationExpiresAt" IS DISTINCT FROM least(q."expiresAt",v."pilotExpiresAt") THEN RAISE EXCEPTION 'CORRELATED_CALENDAR_PREPARATION_EXPIRED'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER sms_correlated_calendar_review_final_binding AFTER INSERT ON "PersonalSmsCorrelatedCalendarReview"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sms_correlated_calendar_final_binding();
CREATE CONSTRAINT TRIGGER sms_correlated_calendar_operation_final_binding AFTER INSERT ON "PersonalAssistantOperation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."correlatedTemporalReceiptId" IS NOT NULL) EXECUTE FUNCTION sms_correlated_calendar_final_binding();
