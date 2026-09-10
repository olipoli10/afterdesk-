-- Local OFF registry only. No worker, provider activation, consent or budget.
CREATE TABLE "PersonalSmsTemporalClarification" (
  id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "identityId" TEXT NOT NULL,
  "sourceOperationId" TEXT NOT NULL, "modelChildOperationId" TEXT NOT NULL, "modelGatewayOperationId" TEXT NOT NULL,
  "reviewActionId" TEXT NOT NULL, "questionOutboundOperationId" TEXT NOT NULL UNIQUE, namespace TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'PREPARED', prepared JSONB NOT NULL, "sourceClaim" JSONB NOT NULL, "reviewSnapshot" JSONB NOT NULL,
  "preparedHash" TEXT NOT NULL, "bindingHash" TEXT NOT NULL, "questionRequestHash" TEXT NOT NULL, "proposalEvidenceRef" TEXT NOT NULL,
  "proposalSerializationVersion" TEXT NOT NULL, "wireTextHash" TEXT NOT NULL, "wireFormatterVersion" TEXT NOT NULL,
  waiting JSONB, "waitingHash" TEXT, "acceptedProviderSid" TEXT UNIQUE, "acceptedAt" TIMESTAMP(3), "consumedReplyId" TEXT UNIQUE,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), "expiresAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE (id,"workspaceId","userId"), UNIQUE ("sourceOperationId","reviewActionId"),
  FOREIGN KEY ("identityId") REFERENCES "ConstructionCommunicationIdentity"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("sourceOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("modelChildOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("questionOutboundOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("modelGatewayOperationId") REFERENCES "ModelGatewayOperation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (phase IN ('PREPARED','WAITING','CONSUMED','EXPIRED','REFUSED') AND "failedAttempts" BETWEEN 0 AND 5),
  CHECK ("expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '10 minutes'
    AND "expiresAt"<=('2026-10-10T01:18:26Z'::timestamptz AT TIME ZONE 'UTC')),
  CHECK (octet_length(prepared::text)<=131072 AND octet_length("reviewSnapshot"::text)<=32768 AND octet_length("sourceClaim"::text)<=4096),
  CHECK (waiting IS NULL OR octet_length(waiting::text)<=150000),
  CHECK (namespace ~ '^[a-f0-9]{64}$' AND "preparedHash" ~ '^[a-f0-9]{64}$' AND "bindingHash" ~ '^[a-f0-9]{64}$'
    AND "questionRequestHash" ~ '^[a-f0-9]{64}$' AND "wireTextHash" ~ '^[a-f0-9]{64}$' AND "proposalEvidenceRef" ~ '^sha256:[a-f0-9]{64}$'),
  CHECK ("acceptedProviderSid" IS NULL OR "acceptedProviderSid" ~ '^SM[a-fA-F0-9]{32}$')
);
CREATE INDEX "PersonalSmsTemporalClarification_workspaceId_userId_phase_expiresAt_idx" ON "PersonalSmsTemporalClarification"("workspaceId","userId",phase,"expiresAt");
CREATE INDEX "PersonalSmsTemporalClarification_namespace_createdAt_idx" ON "PersonalSmsTemporalClarification"(namespace,"createdAt");
CREATE TABLE "PersonalSmsTemporalClarificationReply" (
  id TEXT PRIMARY KEY, "clarificationId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "sourceOperationId" TEXT NOT NULL UNIQUE, "providerSid" TEXT NOT NULL UNIQUE, "requestHash" TEXT NOT NULL,
  "sourceClaim" JSONB NOT NULL, outcome TEXT NOT NULL, packet JSONB NOT NULL, "packetHash" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  FOREIGN KEY ("clarificationId","workspaceId","userId") REFERENCES "PersonalSmsTemporalClarification"(id,"workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("sourceOperationId","workspaceId","userId") REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (outcome IN ('ACCEPTED','REFUSED') AND "providerSid" ~ '^SM[a-fA-F0-9]{32}$' AND "requestHash" ~ '^[a-f0-9]{64}$' AND "packetHash" ~ '^[a-f0-9]{64}$'),
  CHECK (octet_length("sourceClaim"::text)<=4096 AND octet_length(packet::text)<=150000)
);
CREATE INDEX "PersonalSmsTemporalClarificationReply_clarificationId_createdAt_idx" ON "PersonalSmsTemporalClarificationReply"("clarificationId","createdAt");
ALTER TABLE "PersonalSmsTemporalClarification" ADD FOREIGN KEY ("consumedReplyId") REFERENCES "PersonalSmsTemporalClarificationReply"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE "PersonalSmsConversationExpectation" (
  id TEXT PRIMARY KEY, namespace TEXT NOT NULL, kind TEXT NOT NULL, "confirmationId" TEXT UNIQUE, "clarificationId" TEXT UNIQUE,
  active BOOLEAN NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("confirmationId") REFERENCES "PersonalCalendarSmsConfirmation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("clarificationId") REFERENCES "PersonalSmsTemporalClarification"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (namespace ~ '^[a-f0-9]{64}$' AND ((kind='CALENDAR_CONFIRMATION' AND "confirmationId" IS NOT NULL AND "clarificationId" IS NULL)
    OR (kind='TEMPORAL_CLARIFICATION' AND "clarificationId" IS NOT NULL AND "confirmationId" IS NULL)))
);
-- Historical values are copied AS STORED, not reinterpreted, repaired or certified.
INSERT INTO "PersonalSmsConversationExpectation" (id,namespace,kind,"confirmationId",active,"createdAt")
SELECT 'calendar:'||id,namespace,'CALENDAR_CONFIRMATION',id,phase IN ('PREPARED','WAITING','CONSUMED'),"createdAt"
FROM "PersonalCalendarSmsConfirmation";
-- Contradictory active history aborts migration; never silently choose a winner.
CREATE UNIQUE INDEX "sms_conversation_one_active_pair" ON "PersonalSmsConversationExpectation"(namespace) WHERE active;
CREATE INDEX "PersonalSmsConversationExpectation_namespace_createdAt_idx" ON "PersonalSmsConversationExpectation"(namespace,"createdAt");

CREATE FUNCTION sms_temporal_canonical_json(v JSONB) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result TEXT;
BEGIN
  IF jsonb_typeof(v)='object' THEN
    SELECT '{'||coalesce(string_agg(to_json(k)::text||':'||sms_temporal_canonical_json(x),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v) AS e(k,x);
  ELSIF jsonb_typeof(v)='array' THEN
    SELECT '['||coalesce(string_agg(sms_temporal_canonical_json(x),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY AS a(x,ord);
  ELSE result:=v::text;
  END IF;
  RETURN result;
END $$;
CREATE FUNCTION sms_temporal_hash(v JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to(sms_temporal_canonical_json(v),'UTF8')),'hex')
$$;
CREATE FUNCTION sms_temporal_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SMS temporal durable evidence cannot be erased or rewritten'; END $$;

CREATE FUNCTION sms_conversation_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_namespace TEXT; expected_active BOOLEAN; creations BIGINT;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'conversation history is permanent'; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.namespace,NEW.kind,NEW."confirmationId",NEW."clarificationId",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id,OLD.namespace,OLD.kind,OLD."confirmationId",OLD."clarificationId",OLD."createdAt") THEN RAISE EXCEPTION 'conversation history is immutable'; END IF;
  IF NEW.kind='CALENDAR_CONFIRMATION' THEN
    SELECT namespace,phase IN ('PREPARED','WAITING','CONSUMED') INTO expected_namespace,expected_active FROM "PersonalCalendarSmsConfirmation" WHERE id=NEW."confirmationId";
    IF NEW.id IS DISTINCT FROM 'calendar:'||NEW."confirmationId" THEN RAISE EXCEPTION 'conversation subject id mismatch'; END IF;
  ELSE
    SELECT namespace,phase IN ('PREPARED','WAITING') INTO expected_namespace,expected_active FROM "PersonalSmsTemporalClarification" WHERE id=NEW."clarificationId";
    IF NEW.id IS DISTINCT FROM 'temporal:'||NEW."clarificationId" THEN RAISE EXCEPTION 'conversation subject id mismatch'; END IF;
  END IF;
  IF NEW.namespace IS DISTINCT FROM expected_namespace OR NEW.active IS DISTINCT FROM expected_active THEN RAISE EXCEPTION 'conversation subject mismatch'; END IF;
  IF TG_OP='INSERT' THEN
    IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'conversation creation requires serializable transaction'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.namespace,0));
    -- Force current DB recording time. Client/source backdating cannot evade cap.
    NEW."createdAt":=(clock_timestamp() AT TIME ZONE 'UTC');
    SELECT count(*) INTO creations FROM "PersonalSmsConversationExpectation" WHERE namespace=NEW.namespace AND "createdAt">NEW."createdAt"-interval '1 hour';
    IF creations>=5 THEN RAISE EXCEPTION 'conversation global creation limit'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_conversation_ledger_guard BEFORE INSERT OR UPDATE OR DELETE ON "PersonalSmsConversationExpectation" FOR EACH ROW EXECUTE FUNCTION sms_conversation_ledger_guard();
CREATE TRIGGER sms_conversation_ledger_no_truncate BEFORE TRUNCATE ON "PersonalSmsConversationExpectation" FOR EACH STATEMENT EXECUTE FUNCTION sms_temporal_no_mutation();

CREATE FUNCTION sms_conversation_sync() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_id TEXT; is_active BOOLEAN;
BEGIN
  IF TG_TABLE_NAME='PersonalCalendarSmsConfirmation' THEN
    row_id:='calendar:'||NEW.id; is_active:=NEW.phase IN ('PREPARED','WAITING','CONSUMED');
    IF TG_OP='INSERT' THEN INSERT INTO "PersonalSmsConversationExpectation" (id,namespace,kind,"confirmationId",active,"createdAt")
      VALUES(row_id,NEW.namespace,'CALENDAR_CONFIRMATION',NEW.id,is_active,(clock_timestamp() AT TIME ZONE 'UTC'));
    ELSE UPDATE "PersonalSmsConversationExpectation" SET active=is_active WHERE id=row_id; END IF;
  ELSE
    row_id:='temporal:'||NEW.id; is_active:=NEW.phase IN ('PREPARED','WAITING');
    IF TG_OP='INSERT' THEN INSERT INTO "PersonalSmsConversationExpectation" (id,namespace,kind,"clarificationId",active,"createdAt")
      VALUES(row_id,NEW.namespace,'TEMPORAL_CLARIFICATION',NEW.id,is_active,(clock_timestamp() AT TIME ZONE 'UTC'));
    ELSE UPDATE "PersonalSmsConversationExpectation" SET active=is_active WHERE id=row_id; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_calendar_conversation_sync AFTER INSERT OR UPDATE OF phase ON "PersonalCalendarSmsConfirmation" FOR EACH ROW EXECUTE FUNCTION sms_conversation_sync();
CREATE TRIGGER sms_temporal_conversation_sync AFTER INSERT OR UPDATE OF phase ON "PersonalSmsTemporalClarification" FOR EACH ROW EXECUTE FUNCTION sms_conversation_sync();
CREATE FUNCTION sms_conversation_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "PersonalSmsConversationExpectation"%ROWTYPE; expected_namespace TEXT; expected_active BOOLEAN;
BEGIN
  SELECT * INTO r FROM "PersonalSmsConversationExpectation" WHERE id=NEW.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation history missing'; END IF;
  IF r.kind='CALENDAR_CONFIRMATION' THEN SELECT namespace,phase IN ('PREPARED','WAITING','CONSUMED') INTO expected_namespace,expected_active FROM "PersonalCalendarSmsConfirmation" WHERE id=r."confirmationId";
  ELSE SELECT namespace,phase IN ('PREPARED','WAITING') INTO expected_namespace,expected_active FROM "PersonalSmsTemporalClarification" WHERE id=r."clarificationId"; END IF;
  IF r.namespace IS DISTINCT FROM expected_namespace OR r.active IS DISTINCT FROM expected_active THEN RAISE EXCEPTION 'conversation final subject mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER sms_conversation_final_binding AFTER INSERT OR UPDATE ON "PersonalSmsConversationExpectation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sms_conversation_final_binding();

CREATE FUNCTION sms_temporal_sms_hash(v JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to('{"accountSid":'||to_json(v->>'accountSid')::text||',"messageSid":'||to_json(v->>'messageSid')::text||
    ',"from":'||to_json(v->>'from')::text||',"to":'||to_json(v->>'to')::text||',"body":'||to_json(v->>'body')::text||'}','UTF8')),'hex')
$$;
CREATE FUNCTION sms_temporal_question_hash(v JSONB) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to('{"to":'||to_json(v->>'to')::text||',"from":'||to_json(v->>'from')::text||
    ',"text":'||to_json(v->>'text')::text||',"sourceOperationId":'||to_json(v->>'sourceOperationId')::text||'}','UTF8')),'hex')
$$;
CREATE FUNCTION sms_temporal_registry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p JSONB; b JSONB; r JSONB; expected_scope TEXT; valid BOOLEAN; clock_now TIMESTAMP;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'temporal clarification evidence is permanent'; END IF;
  clock_now:=(clock_timestamp() AT TIME ZONE 'UTC'); p:=NEW.prepared; b:=p->'binding'; r:=NEW."reviewSnapshot";
  IF TG_OP='INSERT' THEN
    IF current_setting('transaction_isolation')<>'serializable' OR NEW.phase<>'PREPARED' OR NEW."failedAttempts"<>0
      OR NEW."createdAt">clock_now OR NEW."expiresAt"<=clock_now OR NEW.waiting IS NOT NULL OR NEW."waitingHash" IS NOT NULL
      OR NEW."acceptedAt" IS NOT NULL OR NEW."acceptedProviderSid" IS NOT NULL OR NEW."consumedReplyId" IS NOT NULL THEN RAISE EXCEPTION 'temporal initial state refused'; END IF;
    SELECT true INTO valid FROM "PersonalAssistantOperation" s WHERE s.id=NEW."sourceOperationId" AND s."workspaceId"=NEW."workspaceId" AND s."createdByUserId"=NEW."userId"
      AND s.kind='personal_sms_inbound' AND s.status='processing' AND s.attempts=1 AND s."leaseUntil">clock_now
      AND s."leaseUntil"=((NEW."sourceClaim"->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC') FOR SHARE;
    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal live original source claim required'; END IF;
  ELSE
    IF ROW(NEW.id,NEW."workspaceId",NEW."userId",NEW."identityId",NEW."sourceOperationId",NEW."modelChildOperationId",NEW."modelGatewayOperationId",NEW."reviewActionId",NEW."questionOutboundOperationId",NEW.namespace,
      NEW.prepared,NEW."sourceClaim",NEW."reviewSnapshot",NEW."preparedHash",NEW."bindingHash",NEW."questionRequestHash",NEW."proposalEvidenceRef",NEW."proposalSerializationVersion",NEW."wireTextHash",NEW."wireFormatterVersion",NEW."createdAt",NEW."expiresAt")
      IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."userId",OLD."identityId",OLD."sourceOperationId",OLD."modelChildOperationId",OLD."modelGatewayOperationId",OLD."reviewActionId",OLD."questionOutboundOperationId",OLD.namespace,
      OLD.prepared,OLD."sourceClaim",OLD."reviewSnapshot",OLD."preparedHash",OLD."bindingHash",OLD."questionRequestHash",OLD."proposalEvidenceRef",OLD."proposalSerializationVersion",OLD."wireTextHash",OLD."wireFormatterVersion",OLD."createdAt",OLD."expiresAt") THEN RAISE EXCEPTION 'temporal prepared bindings immutable'; END IF;
    IF OLD.phase IN ('CONSUMED','EXPIRED','REFUSED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'temporal terminal state immutable'; END IF;
    IF NEW.phase IS DISTINCT FROM OLD.phase AND NOT ((OLD.phase='PREPARED' AND NEW.phase IN ('WAITING','EXPIRED','REFUSED'))
      OR (OLD.phase='WAITING' AND NEW.phase IN ('CONSUMED','EXPIRED','REFUSED'))) THEN RAISE EXCEPTION 'temporal transition refused'; END IF;
    IF NEW.phase='EXPIRED' AND NEW."expiresAt">clock_now THEN RAISE EXCEPTION 'temporal not expired'; END IF;
    IF NEW.phase IN ('WAITING','CONSUMED') AND NEW.phase IS DISTINCT FROM OLD.phase AND NEW."expiresAt"<=clock_now THEN RAISE EXCEPTION 'temporal expired'; END IF;
    IF ROW(NEW.waiting,NEW."waitingHash",NEW."acceptedAt",NEW."acceptedProviderSid") IS DISTINCT FROM ROW(OLD.waiting,OLD."waitingHash",OLD."acceptedAt",OLD."acceptedProviderSid")
      AND NOT (OLD.phase='PREPARED' AND NEW.phase='WAITING') THEN RAISE EXCEPTION 'temporal acceptance receipt immutable'; END IF;
    IF NEW."consumedReplyId" IS DISTINCT FROM OLD."consumedReplyId" AND NOT (OLD.phase='WAITING' AND NEW.phase='CONSUMED') THEN RAISE EXCEPTION 'temporal consumed reply immutable'; END IF;
    IF NEW."failedAttempts" IS DISTINCT FROM OLD."failedAttempts" AND NOT (OLD.phase='WAITING' AND NEW.phase IN ('WAITING','REFUSED')
      AND NEW."failedAttempts"=OLD."failedAttempts"+1 AND NEW."failedAttempts"<=5) THEN RAISE EXCEPTION 'temporal rejection increment refused'; END IF;
  END IF;
  expected_scope:=encode(sha256(convert_to('["ENDVERA_CALENDAR_CONFIRMATION","'||(b->>'ownerNumber')||'","'||(b->>'endveraNumber')||'"]','UTF8')),'hex');
  IF (p->>'phase'='PREPARED_UNSENT' AND p->>'schemaVersion'='1' AND p->>'executionAuthorized'='false'
    AND p->>'sourceAuthority'='NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT' AND p->>'clarificationId'=NEW.id
    AND b->>'workspaceId'=NEW."workspaceId" AND b->>'userId'=NEW."userId" AND b->>'identityId'=NEW."identityId" AND b->>'memberRole'='owner'
    AND b->>'verifiedIdentity'='true' AND b->>'ownerNumber' ~ '^\+[1-9][0-9]{7,14}$' AND b->>'endveraNumber' ~ '^\+[1-9][0-9]{7,14}$'
    AND b->>'ownerNumber'<>b->>'endveraNumber' AND expected_scope=NEW.namespace
    AND p#>>'{source,operationId}'=NEW."sourceOperationId" AND p#>>'{source,workspaceId}'=NEW."workspaceId" AND p#>>'{source,userId}'=NEW."userId"
    AND p#>>'{source,identityId}'=NEW."identityId" AND p#>>'{source,verifiedIngress}'='true'
    AND p->>'modelChildOperationId'=NEW."modelChildOperationId" AND p->>'modelGatewayOperationId'=NEW."modelGatewayOperationId" AND p->>'actionId'=NEW."reviewActionId"
    AND NEW."sourceClaim"->>'operationId'=NEW."sourceOperationId" AND NEW."sourceClaim"->>'workspaceId'=NEW."workspaceId" AND NEW."sourceClaim"->>'userId'=NEW."userId" AND NEW."sourceClaim"->>'attempt'='1'
    AND p->>'preparedHash'=NEW."preparedHash" AND sms_temporal_hash(p-'preparedHash')=NEW."preparedHash"
    AND p->>'bindingHash'=NEW."bindingHash" AND sms_temporal_hash(b)=NEW."bindingHash"
    AND p->>'proposalHash'=encode(sha256(convert_to(p->>'rawProposal','UTF8')),'hex')
    AND NEW."proposalSerializationVersion"='personal-inspected-proposal-canonical-v1'
    AND p->>'wireFormatterVersion'=NEW."wireFormatterVersion" AND NEW."wireFormatterVersion"='personal-model-review-fr-v1'
    AND p->>'wireTextHash'=NEW."wireTextHash" AND NEW."wireTextHash"=encode(sha256(convert_to(p->>'wireText','UTF8')),'hex')
    AND p->>'wireText'=E'Ta demande est conservée dans ENDVERA.\n'||(p->>'question')||E'\nAucun rendez-vous modifié ni message/appel exécuté par ces propositions.'
    AND p->>'question'=CASE p->>'reason' WHEN 'AMBIGUOUS_TIME' THEN 'Est-ce le matin ou l’après-midi? Précise l’heure au format 24 heures, par exemple 02:00 ou 14:00.'
      WHEN 'MISSING_END_TIME' THEN 'À quelle heure le rendez-vous se termine-t-il? Aucune durée par défaut n’a été ajoutée.' ELSE NULL END
    AND p->>'questionHash'=sms_temporal_hash(jsonb_build_object('sourceOperationId',NEW."sourceOperationId",'actionId',NEW."reviewActionId",'question',p->>'question'))
    AND ((p->>'createdAt')::timestamptz AT TIME ZONE 'UTC')=NEW."createdAt" AND ((p->>'expiresAt')::timestamptz AT TIME ZONE 'UTC')=NEW."expiresAt"
    AND r->>'status'='REVIEW_PREPARED_NOT_AUTHORIZED' AND r->>'executionAuthorized'='false' AND r->>'semanticIntentVerified'='false'
    AND jsonb_array_length(r->'actions')=1 AND r#>>'{actions,0,status}'='CLARIFY' AND r#>>'{actions,0,actionId}'=NEW."reviewActionId"
    AND r#>>'{actions,0,question}'=p->>'question' AND r->>'modelChildOperationId'=NEW."modelChildOperationId"
    AND r#>>'{source,operationId}'=NEW."sourceOperationId" AND r#>>'{source,text}'=p#>>'{source,body}' AND r#>>'{source,timezone}'=b->>'timezone'
    AND r#>>'{source,receivedAt}'=p#>>'{source,receivedAt}') IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal strict snapshot mismatch'; END IF;
  IF NEW.phase IN ('WAITING','CONSUMED') AND (NEW.waiting IS NULL OR NEW."waitingHash" IS NULL OR NEW."acceptedAt" IS NULL OR NEW."acceptedProviderSid" IS NULL OR NEW."failedAttempts">=5) THEN RAISE EXCEPTION 'temporal waiting receipt missing'; END IF;
  IF NEW.phase='CONSUMED' AND NEW."consumedReplyId" IS NULL THEN RAISE EXCEPTION 'temporal consumed receipt missing'; END IF;
  IF NEW.waiting IS NOT NULL AND (NEW.waiting->>'phase'='WAITING' AND NEW.waiting->'prepared'=p AND NEW.waiting->>'waitingHash'=NEW."waitingHash"
    AND sms_temporal_hash(NEW.waiting-'waitingHash')=NEW."waitingHash" AND NEW.waiting#>>'{questionReceipt,outboundOperationId}'=NEW."questionOutboundOperationId"
    AND NEW.waiting#>>'{questionReceipt,requestHash}'=NEW."questionRequestHash" AND NEW.waiting#>>'{questionReceipt,acceptedProviderSid}'=NEW."acceptedProviderSid"
    AND ((NEW.waiting#>>'{questionReceipt,acceptedAt}')::timestamptz AT TIME ZONE 'UTC')=NEW."acceptedAt"
    AND NEW.waiting#>>'{questionReceipt,acceptedByProvider}'='true' AND NEW.waiting#>>'{questionReceipt,deliveryConfirmed}'='false'
    AND NEW."acceptedAt">=NEW."createdAt" AND NEW."acceptedAt"<NEW."expiresAt" AND NEW."acceptedAt"<=clock_now) IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal waiting snapshot mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_temporal_registry_guard BEFORE INSERT OR UPDATE OR DELETE ON "PersonalSmsTemporalClarification" FOR EACH ROW EXECUTE FUNCTION sms_temporal_registry_guard();
CREATE TRIGGER sms_temporal_registry_no_truncate BEFORE TRUNCATE ON "PersonalSmsTemporalClarification" FOR EACH STATEMENT EXECUTE FUNCTION sms_temporal_no_mutation();

CREATE FUNCTION sms_temporal_reply_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q "PersonalSmsTemporalClarification"%ROWTYPE; valid BOOLEAN; correlation JSONB; source_request JSONB;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'temporal reply receipts are immutable'; END IF;
  SELECT * INTO q FROM "PersonalSmsTemporalClarification" WHERE id=NEW."clarificationId" AND "workspaceId"=NEW."workspaceId" AND "userId"=NEW."userId" FOR UPDATE;
  IF NOT FOUND OR q.phase<>'WAITING' OR q."failedAttempts">=5 OR q."expiresAt"<=(clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'temporal reply requires active question'; END IF;
  SELECT true INTO valid FROM "PersonalAssistantOperation" s WHERE s.id=NEW."sourceOperationId" AND s."workspaceId"=NEW."workspaceId" AND s."createdByUserId"=NEW."userId"
    AND s.kind='personal_sms_inbound' AND s.status='processing' AND s.attempts=1 AND s."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')
    AND s."leaseUntil"=((NEW."sourceClaim"->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC') AND s."requestHash"=NEW."requestHash"
    AND NEW."sourceClaim"->>'operationId'=s.id AND NEW."sourceClaim"->>'workspaceId'=s."workspaceId" AND NEW."sourceClaim"->>'userId'=s."createdByUserId" AND NEW."sourceClaim"->>'attempt'='1'
    AND s.request->>'messageSid'=NEW."providerSid" AND s.request->>'contentHash'=NEW."requestHash" AND sms_temporal_sms_hash(s.request)=NEW."requestHash"
    AND s.request->>'accountSid'=q.prepared#>>'{source,accountSid}' AND s.request->>'identityId'=q."identityId"
    AND s.request->>'from'=q.prepared#>>'{binding,ownerNumber}' AND s.request->>'to'=q.prepared#>>'{binding,endveraNumber}'
    AND s.id<>q."sourceOperationId" AND s.id<>q."questionOutboundOperationId" AND NEW."providerSid"<>q.prepared#>>'{source,messageSid}' AND NEW."providerSid"<>q."acceptedProviderSid"
    AND s."createdAt"=NEW."receivedAt" AND s."createdAt">q."acceptedAt" AND s."createdAt"<q."expiresAt" AND s."createdAt"<=(clock_timestamp() AT TIME ZONE 'UTC') FOR SHARE;
  IF valid IS DISTINCT FROM true OR NEW."packetHash"<>sms_temporal_hash(NEW.packet) OR NEW.packet->>'executionAuthorized' IS DISTINCT FROM 'false'
    OR NEW.packet->>'persistencePerformed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'temporal exact reply proof required'; END IF;
  IF NEW.outcome='ACCEPTED' THEN
    IF (NEW.packet->>'status'='RESOLVED_NOT_AUTHORIZED' AND NEW.packet->>'version'='personal-correlated-temporal-resolution-v1'
      AND NEW.packet->>'schemaVersion'='1' AND NEW.packet->>'temporalResolutionPerformed'='true'
      AND NEW.packet->>'providerExecutionPerformed'='false' AND NEW.packet->'preview'='null'::jsonb
      AND NEW.packet->>'resolutionHash'=sms_temporal_hash(NEW.packet-'resolutionHash')
      AND NEW.packet->>'timezone'=q.prepared#>>'{binding,timezone}' AND NEW.packet->>'anchorReceivedAt'=q.prepared#>>'{source,receivedAt}'
      AND NEW.packet->>'actionId'=q."reviewActionId" AND NEW.packet->>'startsAtUtc' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
      AND NEW.packet->>'endsAtUtc' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
      AND (NEW.packet->>'endsAtUtc')::timestamptz>(NEW.packet->>'startsAtUtc')::timestamptz) IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal accepted packet must be a bound resolution'; END IF;
  ELSIF NEW.outcome='REFUSED' THEN
    IF (NEW.packet->>'status' IN ('CLARIFY','INSUFFICIENT_ORIGINAL_TEMPLATE','REFUSED')) IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal refusal packet status invalid'; END IF;
    IF NEW.packet->>'status'='REFUSED' AND NEW.packet IS DISTINCT FROM '{"status":"REFUSED","reason":"EXPLICIT_TIME_REQUIRED","executionAuthorized":false,"persistencePerformed":false}'::jsonb THEN RAISE EXCEPTION 'temporal fixed refusal packet required'; END IF;
  END IF;
  IF NEW.packet->>'status'<>'REFUSED' THEN
    correlation:=CASE WHEN NEW.packet->>'status'='INSUFFICIENT_ORIGINAL_TEMPLATE' THEN NEW.packet->'correlation' ELSE NEW.packet#>'{evidence,correlation}' END;
    SELECT request INTO source_request FROM "PersonalAssistantOperation" WHERE id=NEW."sourceOperationId";
    IF (correlation->>'status'='CORRELATED_NOT_RESOLVED_NOT_AUTHORIZED' AND correlation->>'clarificationId'=q.id
      AND correlation->>'waitingHash'=q."waitingHash" AND correlation->>'proposalHash'=q.prepared->>'proposalHash'
      AND correlation->>'questionHash'=q.prepared->>'questionHash' AND correlation->>'actionId'=q."reviewActionId"
      AND correlation->>'anchorReceivedAt'=q.prepared#>>'{source,receivedAt}' AND correlation->>'timezone'=q.prepared#>>'{binding,timezone}'
      AND jsonb_array_length(correlation->'sources')=2 AND correlation#>'{sources,0}'=q.prepared->'source'
      AND correlation#>>'{sources,1,operationId}'=NEW."sourceOperationId" AND correlation#>>'{sources,1,workspaceId}'=NEW."workspaceId"
      AND correlation#>>'{sources,1,userId}'=NEW."userId" AND correlation#>>'{sources,1,identityId}'=q."identityId"
      AND correlation#>>'{sources,1,requestHash}'=NEW."requestHash" AND correlation#>>'{sources,1,messageSid}'=NEW."providerSid"
      AND correlation#>>'{sources,1,body}'=source_request->>'body' AND correlation#>>'{sources,1,from}'=source_request->>'from'
      AND correlation#>>'{sources,1,to}'=source_request->>'to' AND correlation#>>'{sources,1,accountSid}'=source_request->>'accountSid'
      AND ((correlation#>>'{sources,1,receivedAt}')::timestamptz AT TIME ZONE 'UTC')=NEW."receivedAt"
      AND correlation#>>'{requiredAtomicTransition,replyLeaseUntil}'=NEW."sourceClaim"->>'leaseUntil') IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal two original sources required'; END IF;
    IF NEW.outcome='ACCEPTED' AND (NEW.packet->'sources' IS DISTINCT FROM correlation->'sources'
      OR NEW.packet#>>'{evidence,correlationHash}' IS DISTINCT FROM sms_temporal_hash(correlation)
      OR NEW.packet#>>'{evidence,evidenceHash}' IS DISTINCT FROM sms_temporal_hash((NEW.packet->'evidence')-'evidenceHash')) THEN RAISE EXCEPTION 'temporal evidence integrity mismatch'; END IF;
  END IF;
  NEW."createdAt":=(clock_timestamp() AT TIME ZONE 'UTC');
  RETURN NEW;
END $$;
CREATE TRIGGER sms_temporal_reply_guard BEFORE INSERT OR UPDATE OR DELETE ON "PersonalSmsTemporalClarificationReply" FOR EACH ROW EXECUTE FUNCTION sms_temporal_reply_guard();
CREATE TRIGGER sms_temporal_reply_no_truncate BEFORE TRUNCATE ON "PersonalSmsTemporalClarificationReply" FOR EACH STATEMENT EXECUTE FUNCTION sms_temporal_no_mutation();

CREATE FUNCTION sms_temporal_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q "PersonalSmsTemporalClarification"%ROWTYPE; target TEXT; valid BOOLEAN; failures BIGINT; accepted BIGINT;
BEGIN
  target:=CASE WHEN TG_TABLE_NAME='PersonalSmsTemporalClarification' THEN NEW.id ELSE NEW."clarificationId" END;
  SELECT * INTO q FROM "PersonalSmsTemporalClarification" WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'temporal final row missing'; END IF;
  -- Re-read CURRENT rows: original processing -> completed CAS must commit
  -- with the exact review and full ordinary question, not a partial snapshot.
  SELECT true INTO valid FROM "PersonalAssistantOperation" s JOIN "PersonalAssistantOperation" c ON c.id=q."modelChildOperationId"
    JOIN "PersonalAssistantOperation" o ON o.id=q."questionOutboundOperationId"
    JOIN "ModelGatewayOperation" g ON g.id=q."modelGatewayOperationId"
    JOIN "AiOperation" ai ON ai.id=g."aiOperationId" JOIN "ModelGatewayAttempt" a ON a.id=g."finalAttemptId"
    JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" AND d."gatewayOperationId"=g.id
  WHERE s.id=q."sourceOperationId" AND s."workspaceId"=q."workspaceId" AND s."createdByUserId"=q."userId" AND s.kind='personal_sms_inbound'
    AND s.status='completed' AND s.attempts=1 AND s."leaseUntil" IS NULL AND s.result->'personalModelReview'=q."reviewSnapshot"
    AND s.result->>'reply'=q.prepared->>'wireText' AND s."requestHash"=q.prepared#>>'{source,requestHash}'
    AND sms_temporal_sms_hash(s.request)=s."requestHash" AND s.request->>'contentHash'=s."requestHash"
    AND s.request->>'body'=q.prepared#>>'{source,body}' AND s.request->>'from'=q.prepared#>>'{binding,ownerNumber}' AND s.request->>'to'=q.prepared#>>'{binding,endveraNumber}'
    AND s.request->>'identityId'=q."identityId" AND s.request->>'accountSid'=q.prepared#>>'{source,accountSid}' AND s.request->>'messageSid'=q.prepared#>>'{source,messageSid}'
    AND s."createdAt"=((q.prepared#>>'{source,receivedAt}')::timestamptz AT TIME ZONE 'UTC')
    AND c."workspaceId"=q."workspaceId" AND c."createdByUserId"=q."userId" AND c."sourcePersonalOperationId"=s.id
    AND c.kind='personal_model_candidate_v1' AND c.status='completed' AND c.attempts=1 AND c."modelGatewayOperationId"=g.id
    AND c.result->>'status'='PROPOSAL_STORED_NOT_AUTHORIZED' AND c.result->>'executionAuthorized'='false'
    AND 'sha256:'||sms_temporal_hash(c.result)=q."proposalEvidenceRef" AND g."resultEvidenceRef"=q."proposalEvidenceRef" AND a."responseEvidenceRef"=q."proposalEvidenceRef"
    AND c.result->'proposal'=(q.prepared->>'rawProposal')::jsonb AND sms_temporal_canonical_json(c.result->'proposal')=q.prepared->>'rawProposal'
    AND c.request->>'sourceOperationId'=s.id AND c.request->>'gatewayOperationId'=g.id AND c.request->>'requestFingerprint'=g."requestFingerprint"
    AND (q.prepared->>'rawProposal')::jsonb->>'requestFingerprint'=g."requestFingerprint"
    AND g."tenantId"='construction-workspace:'||q."workspaceId" AND g."operationType"='personal_intent_candidate_v1'
    AND ai."personalAssistantOperationId"=s.id AND ai.purpose='personal_intent_candidate_v1' AND ai.status='succeeded' AND ai.attempts=1
    AND ai."resultId"=c.id AND ai."resultKind"='personal_model_proposal_inspected' AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
    AND a."resultContractStatus"='valid' AND d.disposition='route_authorized' AND d.attempt=1
    AND o."workspaceId"=q."workspaceId" AND o."createdByUserId"=q."userId" AND o.kind='sms_outbound' AND o."idempotencyKey"='reply:'||s.id
    AND o."connectorAccountId"=q.prepared#>>'{binding,smsAccountId}' AND o.request=jsonb_build_object('to',s.request->>'from','from',s.request->>'to','text',q.prepared->>'wireText','sourceOperationId',s.id)
    AND o."requestHash"=q."questionRequestHash" AND sms_temporal_question_hash(o.request)=q."questionRequestHash";
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal final source candidate question binding mismatch'; END IF;
  IF q.waiting IS NOT NULL THEN
    valid:=false;
    SELECT true INTO valid FROM "PersonalAssistantOperation" o WHERE o.id=q."questionOutboundOperationId" AND o.kind='sms_outbound'
      AND o.status='completed' AND o.attempts=1 AND o."externalTransportPerformed"=true AND o.result->>'acceptedByProvider'='true'
      AND o.result->>'providerSid'=q."acceptedProviderSid" AND o.result->>'approvalHash'=q."questionRequestHash" AND o.result->>'delivered'='false'
      AND ((o.result->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC')=q."acceptedAt";
    IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal immutable recorded acceptance required'; END IF;
  END IF;
  SELECT count(*) FILTER (WHERE outcome='REFUSED'),count(*) FILTER (WHERE outcome='ACCEPTED') INTO failures,accepted
    FROM "PersonalSmsTemporalClarificationReply" WHERE "clarificationId"=q.id;
  IF failures<>q."failedAttempts" OR accepted>1 OR (q.phase='CONSUMED') IS DISTINCT FROM (accepted=1) THEN RAISE EXCEPTION 'temporal exact reply counts mismatch'; END IF;
  IF accepted=1 AND NOT EXISTS (SELECT 1 FROM "PersonalSmsTemporalClarificationReply" WHERE id=q."consumedReplyId" AND "clarificationId"=q.id
      AND "workspaceId"=q."workspaceId" AND "userId"=q."userId" AND outcome='ACCEPTED') THEN RAISE EXCEPTION 'temporal accepted reply mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "PersonalSmsConversationExpectation" WHERE id='temporal:'||q.id AND "clarificationId"=q.id AND namespace=q.namespace
      AND active=(q.phase IN ('PREPARED','WAITING'))) THEN RAISE EXCEPTION 'temporal shared namespace mirror missing'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER sms_temporal_final_binding AFTER INSERT OR UPDATE ON "PersonalSmsTemporalClarification" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sms_temporal_final_binding();
CREATE CONSTRAINT TRIGGER sms_temporal_reply_question_binding AFTER INSERT ON "PersonalSmsTemporalClarificationReply" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sms_temporal_final_binding();

CREATE FUNCTION sms_temporal_reply_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "PersonalSmsTemporalClarificationReply"%ROWTYPE; valid BOOLEAN;
BEGIN
  SELECT * INTO r FROM "PersonalSmsTemporalClarificationReply" WHERE id=NEW.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'temporal reply receipt missing'; END IF;
  SELECT true INTO valid FROM "PersonalAssistantOperation" s WHERE s.id=r."sourceOperationId" AND s."workspaceId"=r."workspaceId" AND s."createdByUserId"=r."userId"
    AND s.kind='personal_sms_inbound' AND s.status='completed' AND s.attempts=1 AND s."leaseUntil" IS NULL AND s."requestHash"=r."requestHash"
    AND s.request->>'messageSid'=r."providerSid" AND s.result->>'source'='TEMPORAL_CLARIFICATION'
    AND s.result->>'temporalClarificationReceiptId'=r.id AND s.result->>'packetHash'=r."packetHash"
    AND s.result->>'executionAuthorized'='false' AND s.result->>'externalTransportPerformed'='false' AND s.result->>'automaticRetry'='false';
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'temporal reply final source CAS required'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER sms_temporal_reply_final_binding AFTER INSERT ON "PersonalSmsTemporalClarificationReply" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sms_temporal_reply_final_binding();

CREATE FUNCTION sms_temporal_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE referenced BOOLEAN; question BOOLEAN; claim JSONB;
BEGIN
  SELECT EXISTS(SELECT 1 FROM "PersonalSmsTemporalClarification" WHERE OLD.id IN ("sourceOperationId","modelChildOperationId","questionOutboundOperationId"))
    OR EXISTS(SELECT 1 FROM "PersonalSmsTemporalClarificationReply" WHERE "sourceOperationId"=OLD.id) INTO referenced;
  IF NOT referenced THEN RETURN NEW; END IF;
  IF ROW(NEW.id,NEW."workspaceId",NEW."createdByUserId",NEW.kind,NEW."connectorAccountId",NEW.request,NEW."requestHash",NEW."idempotencyKey",NEW."createdAt",NEW."sourcePersonalOperationId",NEW."modelGatewayOperationId")
    IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."createdByUserId",OLD.kind,OLD."connectorAccountId",OLD.request,OLD."requestHash",OLD."idempotencyKey",OLD."createdAt",OLD."sourcePersonalOperationId",OLD."modelGatewayOperationId") THEN RAISE EXCEPTION 'temporal referenced operation binding immutable'; END IF;
  IF OLD.kind IN ('personal_model_candidate_v1','personal_sms_inbound') AND OLD.status='completed'
    AND ROW(NEW.status,NEW.result,NEW.attempts,NEW."leaseUntil") IS DISTINCT FROM ROW(OLD.status,OLD.result,OLD.attempts,OLD."leaseUntil") THEN RAISE EXCEPTION 'temporal completed source proof immutable'; END IF;
  IF OLD.kind='personal_sms_inbound' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.status='completed' THEN
    FOR claim IN SELECT "sourceClaim" FROM "PersonalSmsTemporalClarification" WHERE "sourceOperationId"=OLD.id
      UNION ALL SELECT "sourceClaim" FROM "PersonalSmsTemporalClarificationReply" WHERE "sourceOperationId"=OLD.id LOOP
      IF OLD.status IS DISTINCT FROM 'processing' OR OLD.attempts IS DISTINCT FROM 1 OR NEW.attempts IS DISTINCT FROM 1 OR NEW."leaseUntil" IS NOT NULL
        OR claim->>'operationId' IS DISTINCT FROM OLD.id OR claim->>'workspaceId' IS DISTINCT FROM OLD."workspaceId" OR claim->>'userId' IS DISTINCT FROM OLD."createdByUserId"
        OR claim->>'attempt' IS DISTINCT FROM '1' OR OLD."leaseUntil" IS DISTINCT FROM ((claim->>'leaseUntil')::timestamptz AT TIME ZONE 'UTC')
        OR OLD."leaseUntil" IS NULL OR OLD."leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'temporal original live source claim required at completion'; END IF;
    END LOOP;
  END IF;
  SELECT EXISTS(SELECT 1 FROM "PersonalSmsTemporalClarification" WHERE "questionOutboundOperationId"=OLD.id) INTO question;
  IF question THEN
    IF OLD.status='completed' AND ROW(NEW.status,NEW.attempts,NEW.result->'acceptedAt',NEW.result->'acceptedByProvider',NEW.result->'approvalHash',NEW.result->'providerSid',NEW.result->'delivered')
      IS DISTINCT FROM ROW(OLD.status,OLD.attempts,OLD.result->'acceptedAt',OLD.result->'acceptedByProvider',OLD.result->'approvalHash',OLD.result->'providerSid',OLD.result->'delivered') THEN RAISE EXCEPTION 'temporal acceptance fields immutable'; END IF;
    IF NEW.result->>'acceptedAt' IS NOT NULL AND OLD.result->>'acceptedAt' IS NULL THEN
      IF OLD.status<>'processing' OR NEW.status<>'completed' OR NEW.attempts<>1
        OR ((NEW.result->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC')<date_trunc('milliseconds',transaction_timestamp() AT TIME ZONE 'UTC')
        OR ((NEW.result->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC')>(clock_timestamp() AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'temporal receipt time must be DB recording time'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_temporal_operation_guard BEFORE UPDATE ON "PersonalAssistantOperation" FOR EACH ROW EXECUTE FUNCTION sms_temporal_operation_guard();
