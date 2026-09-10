-- DRAFT79: durable explicit-choice binding only; no caller, flags or provider.
-- 78 is unchanged. A review must ALREADY BE COMMITTED before this protocol.
-- Caller order: SERIALIZABLE/timeouts -> canonical namespace/current proof locks
-- -> immutable review -> calendar UPDATE -> approval INSERT -> claim CAS.
-- Triggers acquire NO namespace or mutable-authority row locks. Snapshot checks
-- below prove row consistency, NOT fresh authority or a human tap. Runtime gates
-- must retain canonical caller locks before dispatch and final confirmation.

CREATE UNIQUE INDEX sms_correlated_review_approval_scope_key
  ON "PersonalSmsCorrelatedCalendarReview"(id,"calendarOperationId","workspaceId","userId");
CREATE TABLE "PersonalSmsCorrelatedCalendarApproval" (
  id TEXT PRIMARY KEY, "reviewId" TEXT NOT NULL, "calendarOperationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "approvalToken" TEXT NOT NULL,
  "fingerprintVersion" TEXT NOT NULL, "reviewFingerprint" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC'),
  "approvalExpiresAt" TIMESTAMP(3) NOT NULL, "leaseUntil" TIMESTAMP(3) NOT NULL,
  "writeAuthority" JSONB NOT NULL,
  CONSTRAINT sms_correlated_approval_review_fk FOREIGN KEY ("reviewId","calendarOperationId","workspaceId","userId")
    REFERENCES "PersonalSmsCorrelatedCalendarReview"(id,"calendarOperationId","workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT sms_correlated_approval_shape_check CHECK (
    (id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR id IN ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff'))
    AND ("approvalToken" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR "approvalToken" IN ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff'))
    AND "fingerprintVersion"='personal-correlated-calendar-approval-view-v1'
    AND "reviewFingerprint" ~ '^[a-f0-9]{64}$'
    AND "approvedAt">=TIMESTAMP '2026-09-10 01:18:26'
    AND "approvedAt"<"leaseUntil" AND "leaseUntil"<="approvalExpiresAt"
    AND "leaseUntil"<="approvedAt"+INTERVAL '25 seconds'
    AND "approvalExpiresAt"<=TIMESTAMP '2026-10-10 01:18:26')
);
CREATE UNIQUE INDEX sms_correlated_approval_review_key ON "PersonalSmsCorrelatedCalendarApproval"("reviewId");
CREATE UNIQUE INDEX sms_correlated_approval_operation_key ON "PersonalSmsCorrelatedCalendarApproval"("calendarOperationId");
CREATE UNIQUE INDEX sms_correlated_approval_token_key ON "PersonalSmsCorrelatedCalendarApproval"("approvalToken");
CREATE UNIQUE INDEX sms_correlated_approval_scope_key ON "PersonalSmsCorrelatedCalendarApproval"("reviewId","calendarOperationId","workspaceId","userId");

CREATE FUNCTION sms_correlated_approval_string(v JSONB, max_units INTEGER, trimmed BOOLEAN DEFAULT true)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_typeof(v)='string' AND sms_correlated_calendar_utf16_length(v#>>'{}') BETWEEN 1 AND max_units
    AND (NOT trimmed OR (v#>>'{}')=sms_correlated_calendar_trim(v#>>'{}')),false)
$$;
CREATE FUNCTION sms_correlated_approval_epoch(v JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR coalesce(v#>>'{}','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' THEN RETURN false; END IF;
  RETURN to_char((v#>>'{}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=(v#>>'{}');
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION sms_correlated_approval_revision(v JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  RETURN (v#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric;
END $$;
CREATE FUNCTION sms_correlated_approval_authority_valid(v JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field TEXT; items JSONB; item JSONB;
BEGIN
  IF NOT sms_correlated_calendar_exact_keys(v,ARRAY['accountId','accountVersion','credentialId','writeGrantId','writeGrantVersion','memberId','memberRole','memberUpdatedAt','workspaceUpdatedAt','accountScopes','grantScopes'])
    THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['accountId','credentialId','writeGrantId','memberId'] LOOP
    IF NOT sms_correlated_approval_string(v->field,191) THEN RETURN false; END IF;
  END LOOP;
  IF NOT sms_correlated_approval_revision(v->'accountVersion') OR NOT sms_correlated_approval_revision(v->'writeGrantVersion')
    OR v->'memberRole' IS DISTINCT FROM '"owner"'::jsonb
    OR NOT sms_correlated_approval_epoch(v->'memberUpdatedAt') OR NOT sms_correlated_approval_epoch(v->'workspaceUpdatedAt') THEN RETURN false; END IF;
  FOREACH field IN ARRAY ARRAY['accountScopes','grantScopes'] LOOP
    items:=v->field;
    IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(items) NOT BETWEEN 1 AND 30
      OR NOT (items @> '["https://www.googleapis.com/auth/calendar.events"]'::jsonb)
      OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(items) e(x))<>jsonb_array_length(items) THEN RETURN false; END IF;
    FOR item IN SELECT x FROM jsonb_array_elements(items) e(x) LOOP
      IF NOT sms_correlated_approval_string(item,300,false) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN octet_length(convert_to(sms_temporal_canonical_json(v),'UTF8'))<=32768;
END $$;

-- Exact A descriptor; no SMS copies, volatile timestamp or claimed authority.
CREATE FUNCTION sms_correlated_approval_view(v "PersonalSmsCorrelatedCalendarReview") RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('version','personal-correlated-calendar-approval-view-v1',
    'scope',jsonb_build_object('workspaceId',v."workspaceId",'userId',v."userId"),
    'review',jsonb_build_object('reviewId',v.id,'receiptId',v."receiptId",'reviewVersion',v."reviewVersion",'packetHash',v."packetHash",'proofHash',v."proofHash"),
    'request',jsonb_build_object('calendarRequestId',v."calendarRequestId",'calendarRequestHash',v."calendarRequestHash",'connectorAccountId',v."connectorAccountId",'accountVersion',v."accountVersion"),
    'presentation',jsonb_build_object('itemVersion','personal-correlated-calendar-review-v1','evidenceVersion','personal-correlated-calendar-local-preview-v1',
      'titleNormalization','EXISTING_SCHEMA_TRIM_ONLY','provenance','UNKNOWN'))
$$;
CREATE FUNCTION sms_correlated_approval_view_fingerprint(v JSONB) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE path TEXT[]; normalized JSONB;
BEGIN
  IF NOT sms_correlated_calendar_exact_keys(v,ARRAY['version','scope','review','request','presentation'])
    OR NOT sms_correlated_calendar_exact_keys(v->'scope',ARRAY['workspaceId','userId'])
    OR NOT sms_correlated_calendar_exact_keys(v->'review',ARRAY['reviewId','receiptId','reviewVersion','packetHash','proofHash'])
    OR NOT sms_correlated_calendar_exact_keys(v->'request',ARRAY['calendarRequestId','calendarRequestHash','connectorAccountId','accountVersion'])
    OR v->'version' IS DISTINCT FROM '"personal-correlated-calendar-approval-view-v1"'::jsonb
    OR v#>'{review,reviewVersion}' IS DISTINCT FROM '"personal-sms-correlated-calendar-review-v1"'::jsonb
    OR v->'presentation' IS DISTINCT FROM jsonb_build_object('itemVersion','personal-correlated-calendar-review-v1','evidenceVersion','personal-correlated-calendar-local-preview-v1',
      'titleNormalization','EXISTING_SCHEMA_TRIM_ONLY','provenance','UNKNOWN')
    OR NOT sms_correlated_approval_revision(v#>'{request,accountVersion}') THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_VIEW_INVALID'; END IF;
  FOREACH path SLICE 1 IN ARRAY ARRAY[['scope','workspaceId'],['scope','userId'],['review','reviewId'],['review','receiptId'],['request','connectorAccountId']] LOOP
    IF NOT sms_correlated_approval_string(v#>path,191) THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_VIEW_INVALID'; END IF;
  END LOOP;
  FOREACH path SLICE 1 IN ARRAY ARRAY[['review','packetHash'],['review','proofHash'],['request','calendarRequestHash']] LOOP
    IF jsonb_typeof(v#>path) IS DISTINCT FROM 'string' OR coalesce(v#>>path,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_VIEW_INVALID'; END IF;
  END LOOP;
  IF v#>'{request,calendarRequestId}' IS DISTINCT FROM to_jsonb(sms_correlated_calendar_request_id(v#>>'{review,receiptId}')) THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_VIEW_INVALID'; END IF;
  -- JSONB numeric 1.0 parses as JS number 1: normalize only this known integer.
  normalized:=jsonb_set(v,'{request,accountVersion}',to_jsonb((v#>>'{request,accountVersion}')::numeric::integer));
  RETURN sms_temporal_hash(normalized);
END $$;

CREATE FUNCTION sms_correlated_approval_state_valid(s JSONB, a "PersonalSmsCorrelatedCalendarApproval", v "PersonalSmsCorrelatedCalendarReview")
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE origin JSONB; event_id TEXT;
BEGIN
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->'version' IS DISTINCT FROM '"personal-correlated-calendar-write-state-v1"'::jsonb THEN RETURN false; END IF;
  IF octet_length(convert_to(sms_temporal_canonical_json(s),'UTF8'))>32768 THEN RETURN false; END IF;
  IF a.id IS NULL OR a."approvalToken" IS NULL OR a."reviewId" IS DISTINCT FROM v.id
    OR a."calendarOperationId" IS DISTINCT FROM v."calendarOperationId" OR a."workspaceId" IS DISTINCT FROM v."workspaceId" OR a."userId" IS DISTINCT FROM v."userId"
    OR a."fingerprintVersion" IS DISTINCT FROM 'personal-correlated-calendar-approval-view-v1'
    OR a."reviewFingerprint" IS DISTINCT FROM sms_correlated_approval_view_fingerprint(sms_correlated_approval_view(v)) THEN RETURN false; END IF;
  origin:=jsonb_build_object('kind','personal_sms_temporal_receipt','approvalId',a.id,'reviewId',a."reviewId",'reviewFingerprint',a."reviewFingerprint");
  IF s->'origin' IS DISTINCT FROM origin THEN RETURN false; END IF;
  IF s->>'phase' IN ('CLAIMED','DISPATCH_CLAIMED') THEN
    RETURN sms_correlated_calendar_exact_keys(s,ARRAY['version','origin','phase','approvedBy','approvedHash','approvalToken','writeAuthority','dispatchStarted'])
      AND s->'approvedBy' IS NOT DISTINCT FROM to_jsonb(a."userId") AND s->'approvedHash' IS NOT DISTINCT FROM to_jsonb(v."calendarRequestHash")
      AND s->'approvalToken' IS NOT DISTINCT FROM to_jsonb(a."approvalToken") AND s->'writeAuthority' IS NOT DISTINCT FROM a."writeAuthority"
      AND sms_correlated_approval_authority_valid(s->'writeAuthority')
      AND s->'dispatchStarted' IS NOT DISTINCT FROM to_jsonb(s->>'phase'='DISPATCH_CLAIMED');
  ELSIF s->'phase'='"CONFIRMED"'::jsonb THEN
    -- Same ASCII key order as existing deterministicGoogleEventId's canonical hash.
    event_id:='e'||substring(sms_temporal_hash(jsonb_build_object('schemaVersion',1,'workspaceId',v."workspaceId",'calendarItemId',v."calendarRequestId",'idempotencyKey',v."calendarRequestId")),1,31);
    RETURN sms_correlated_calendar_exact_keys(s,ARRAY['version','origin','phase','receipt','automaticRetry'])
      AND s->'automaticRetry' IS NOT DISTINCT FROM 'false'::jsonb
      AND s->'receipt' IS NOT DISTINCT FROM jsonb_build_object('providerEventId',event_id,'confirmed',true);
  ELSIF s->'phase'='"UNCERTAIN"'::jsonb THEN
    RETURN coalesce(sms_correlated_calendar_exact_keys(s,ARRAY['version','origin','phase','writeConfirmed','reviewRequired','automaticRetry','reason'])
      AND s->'writeConfirmed' IS NOT DISTINCT FROM 'false'::jsonb AND s->'reviewRequired' IS NOT DISTINCT FROM 'true'::jsonb
      AND s->'automaticRetry' IS NOT DISTINCT FROM 'false'::jsonb AND jsonb_typeof(s->'reason')='string'
      AND s->>'reason' IN ('WRITE_OUTCOME_UNKNOWN','CLAIM_LEASE_EXPIRED','CLAIM_COMMIT_OUTCOME_UNKNOWN','DISPATCH_COMMIT_OUTCOME_UNKNOWN','TERMINAL_COMMIT_OUTCOME_UNKNOWN'),false);
  END IF;
  RETURN false;
END $$;

-- READ-ONLY MVCC comparison, not a lock-taking authorization procedure. No
-- ciphertext is selected. No FK to mutable grants/epochs may prevent revocation.
CREATE FUNCTION sms_correlated_approval_authority_current(a "PersonalSmsCorrelatedCalendarApproval", v "PersonalSmsCorrelatedCalendarReview")
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "ConstructionWorkspace" w
    JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=a."userId"
    JOIN "ConstructionConnectorAccount" c ON c.id=v."connectorAccountId" AND c."workspaceId"=w.id
    JOIN "ConstructionConnectorCredential" k ON k.id=c."credentialRef" AND k."connectorAccountId"=c.id AND k."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=c.id AND g.capability='calendar_write'
    WHERE w.id=a."workspaceId" AND w."ownerUserId"=a."userId" AND w.status='active'
      AND m.status='active' AND m.role='owner' AND c.provider='google_calendar' AND c.status='connected'
      AND c."revokedAt" IS NULL AND k."revokedAt" IS NULL AND g.status='active' AND g."revokedAt" IS NULL
      AND c."stateVersion"=v."accountVersion"
      AND a."writeAuthority"=jsonb_build_object('accountId',c.id,'accountVersion',c."stateVersion",'credentialId',k.id,
        'writeGrantId',g.id,'writeGrantVersion',g."stateVersion",'memberId',m.id,'memberRole','owner',
        'memberUpdatedAt',to_char(m."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'workspaceUpdatedAt',to_char(w."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'accountScopes',to_jsonb(c."grantedScopes"),'grantScopes',to_jsonb(g."grantedScopes"))
  )
$$;
CREATE FUNCTION sms_correlated_approval_binding(a "PersonalSmsCorrelatedCalendarApproval", v "PersonalSmsCorrelatedCalendarReview", o "PersonalAssistantOperation")
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN coalesce(a."reviewId"=v.id AND a."calendarOperationId"=v."calendarOperationId" AND a."workspaceId"=v."workspaceId" AND a."userId"=v."userId"
    AND o.id=a."calendarOperationId" AND o."workspaceId"=a."workspaceId" AND o."createdByUserId"=a."userId"
    AND o."correlatedTemporalReceiptId"=v."receiptId" AND o.kind='calendar_write' AND o."connectorAccountId"=v."connectorAccountId"
    AND o."requestHash"=v."calendarRequestHash" AND o."requestHash"=sms_correlated_calendar_request_hash(o.request)
    AND o.request=(v.proof->'draft')||jsonb_build_object('accountVersion',v."accountVersion",'requestId',v."calendarRequestId")
    AND o."idempotencyKey"='personal-calendar:'||v."workspaceId"||':'||v."calendarRequestId"
    AND o."budgetId" IS NULL AND o."reservedCadMicros" IS NULL AND o."sourcePersonalOperationId" IS NULL AND o."modelGatewayOperationId" IS NULL
    AND a."fingerprintVersion"='personal-correlated-calendar-approval-view-v1'
    AND a."reviewFingerprint"=sms_correlated_approval_view_fingerprint(sms_correlated_approval_view(v))
    AND a."approvalExpiresAt"=least(v."preparationExpiresAt",v."pilotExpiresAt")
    AND a."approvedAt">=v."createdAt" AND a."approvedAt">=TIMESTAMP '2026-09-10 01:18:26'
    AND a."approvedAt"<a."leaseUntil" AND a."leaseUntil"<=a."approvalExpiresAt"
    AND a."leaseUntil"<=a."approvedAt"+INTERVAL '25 seconds' AND a."approvalExpiresAt"<=TIMESTAMP '2026-10-10 01:18:26'
    AND sms_correlated_approval_authority_valid(a."writeAuthority")
    AND a."writeAuthority"->'accountId'=to_jsonb(v."connectorAccountId") AND a."writeAuthority"->'accountVersion'=to_jsonb(v."accountVersion")
    AND ((a."writeAuthority"->>'memberUpdatedAt')::timestamptz AT TIME ZONE 'UTC')<=a."approvedAt"
    AND ((a."writeAuthority"->>'workspaceUpdatedAt')::timestamptz AT TIME ZONE 'UTC')<=a."approvedAt",false);
END $$;

-- Only for an actual tuple SELECT-visible in this SERIALIZABLE transaction.
-- Its fixed snapshot predates every own INSERT/UPDATE (including subxids).
-- A visible xmin strictly before snapshot xmax is therefore not our own new
-- tuple. age(xid) uses PostgreSQL's signed/wrap-aware comparison; it is NOT a
-- universal commit oracle for arbitrary XIDs, nor pg_visible_in_snapshot(subxid).
CREATE FUNCTION sms_correlated_approval_pre_snapshot(row_xmin XID) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'serializable' OR row_xmin IS NULL THEN RETURN false; END IF;
  RETURN age(row_xmin)>age(pg_snapshot_xmax(pg_current_snapshot())::xid);
END $$;

CREATE FUNCTION sms_correlated_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v "PersonalSmsCorrelatedCalendarReview"%ROWTYPE; o "PersonalAssistantOperation"%ROWTYPE; review_xmin XID; value TEXT;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_IMMUTABLE'; END IF;
  IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_SERIALIZABLE_REQUIRED'; END IF;
  NEW."approvedAt":=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC');
  FOREACH value IN ARRAY ARRAY[NEW."reviewId",NEW."calendarOperationId",NEW."workspaceId",NEW."userId"] LOOP
    IF NOT sms_correlated_approval_string(to_jsonb(value),191) THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_ID_REQUIRED'; END IF;
  END LOOP;
  SELECT * INTO v FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=NEW."reviewId";
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_REVIEW_REQUIRED'; END IF;
  SELECT xmin INTO review_xmin FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=v.id;
  IF sms_correlated_approval_pre_snapshot(review_xmin) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_COMMITTED_REVIEW_REQUIRED'; END IF;
  SELECT * INTO o FROM "PersonalAssistantOperation" WHERE id=NEW."calendarOperationId";
  IF NOT FOUND OR o.status IS DISTINCT FROM 'pending' OR o.attempts IS DISTINCT FROM 0 OR o."leaseUntil" IS NOT NULL
    OR o.result IS NOT NULL OR o."externalTransportPerformed" IS DISTINCT FROM false THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_PENDING_REQUIRED'; END IF;
  IF sms_correlated_approval_binding(NEW,v,o) IS DISTINCT FROM true OR sms_correlated_approval_authority_current(NEW,v) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_BINDING_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_correlated_approval_guard BEFORE INSERT OR UPDATE OR DELETE ON "PersonalSmsCorrelatedCalendarApproval"
  FOR EACH ROW EXECUTE FUNCTION sms_correlated_approval_guard();
CREATE TRIGGER sms_correlated_approval_no_truncate BEFORE TRUNCATE ON "PersonalSmsCorrelatedCalendarApproval"
  FOR EACH STATEMENT EXECUTE FUNCTION sms_temporal_no_mutation();

CREATE FUNCTION sms_correlated_approval_operation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "PersonalSmsCorrelatedCalendarApproval"%ROWTYPE; v "PersonalSmsCorrelatedCalendarReview"%ROWTYPE;
  target TEXT; approval_xmin XID; operation_xmin XID; phase TEXT; final_clock TIMESTAMP;
BEGIN
  IF TG_OP='DELETE' THEN target:=OLD.id; ELSE target:=NEW.id; END IF;
  -- Global discriminant: any one marker/relation/approval requires typed rules.
  IF TG_OP='DELETE' THEN
    IF OLD."correlatedTemporalReceiptId" IS NOT NULL OR EXISTS(SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" WHERE "calendarOperationId"=target)
      OR EXISTS(SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" WHERE "calendarOperationId"=target) THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_OPERATION_IMMUTABLE'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."correlatedTemporalReceiptId" IS NULL AND (TG_OP='INSERT' OR OLD."correlatedTemporalReceiptId" IS NULL)
    AND NOT EXISTS(SELECT 1 FROM "PersonalSmsCorrelatedCalendarReview" WHERE "calendarOperationId"=target)
    AND NOT EXISTS(SELECT 1 FROM "PersonalSmsCorrelatedCalendarApproval" WHERE "calendarOperationId"=target) THEN RETURN NEW; END IF;
  -- 78 owns the new pending preparation and its mandatory deferred relation.
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','attempts','leaseUntil','result','externalTransportPerformed','updatedAt'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempts','leaseUntil','result','externalTransportPerformed','updatedAt']) THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_OPERATION_IMMUTABLE'; END IF;
  -- No-op metadata timestamps are harmless; existing terminal/corrupt rows cannot
  -- be adopted, repaired or backfilled with a made-up approval.
  IF (to_jsonb(NEW)-'updatedAt') IS NOT DISTINCT FROM (to_jsonb(OLD)-'updatedAt') THEN RETURN NEW; END IF;
  IF OLD.status NOT IN ('pending','processing') THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_TERMINAL_IMMUTABLE'; END IF;
  IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_SERIALIZABLE_REQUIRED'; END IF;
  SELECT * INTO a FROM "PersonalSmsCorrelatedCalendarApproval" WHERE "calendarOperationId"=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_REQUIRED'; END IF;
  SELECT xmin INTO approval_xmin FROM "PersonalSmsCorrelatedCalendarApproval" WHERE id=a.id;
  SELECT * INTO v FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=a."reviewId";
  IF NOT FOUND OR sms_correlated_approval_binding(a,v,NEW) IS DISTINCT FROM true
    OR sms_correlated_approval_state_valid(NEW.result,a,v) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_STATE_REQUIRED'; END IF;
  phase:=NEW.result->>'phase'; final_clock:=clock_timestamp() AT TIME ZONE 'UTC';
  IF NEW.attempts IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_ATTEMPT_REQUIRED'; END IF;
  IF OLD.status='pending' THEN
    IF OLD.attempts IS DISTINCT FROM 0 OR OLD.result IS NOT NULL OR OLD."leaseUntil" IS NOT NULL OR OLD."externalTransportPerformed" IS DISTINCT FROM false
      OR NEW.status IS DISTINCT FROM 'processing' OR phase IS DISTINCT FROM 'CLAIMED' OR NEW."leaseUntil" IS DISTINCT FROM a."leaseUntil"
      OR NEW."externalTransportPerformed" IS DISTINCT FROM false OR sms_correlated_approval_pre_snapshot(approval_xmin) IS DISTINCT FROM false THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_ATOMIC_CLAIM_REQUIRED'; END IF;
  ELSE
    IF OLD.attempts IS DISTINCT FROM 1 OR OLD."leaseUntil" IS DISTINCT FROM a."leaseUntil"
      OR sms_correlated_approval_state_valid(OLD.result,a,v) IS DISTINCT FROM true OR OLD.result->>'phase' NOT IN ('CLAIMED','DISPATCH_CLAIMED')
      OR sms_correlated_approval_pre_snapshot(approval_xmin) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_COMMITTED_CLAIM_REQUIRED'; END IF;
    IF NEW.status='processing' THEN
      IF OLD.result->>'phase' IS DISTINCT FROM 'CLAIMED' OR phase IS DISTINCT FROM 'DISPATCH_CLAIMED'
        OR NEW."leaseUntil" IS DISTINCT FROM OLD."leaseUntil" OR NEW."externalTransportPerformed" IS DISTINCT FROM false THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_DISPATCH_ONCE'; END IF;
    ELSIF NEW.status='completed' THEN
      SELECT xmin INTO operation_xmin FROM "PersonalAssistantOperation" WHERE id=target;
      IF OLD.result->>'phase' IS DISTINCT FROM 'DISPATCH_CLAIMED' OR phase IS DISTINCT FROM 'CONFIRMED'
        OR sms_correlated_approval_pre_snapshot(operation_xmin) IS DISTINCT FROM true OR NEW."leaseUntil" IS NOT NULL OR NEW."externalTransportPerformed" IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_CONFIRMED_REQUIRED'; END IF;
    ELSIF NEW.status='uncertain' THEN
      IF phase IS DISTINCT FROM 'UNCERTAIN' OR NEW."leaseUntil" IS NOT NULL
        OR (OLD.result->>'phase'='CLAIMED' AND NEW."externalTransportPerformed" IS DISTINCT FROM false)
        OR (OLD."externalTransportPerformed" AND NOT NEW."externalTransportPerformed")
        OR (NEW.result->>'reason'='CLAIM_LEASE_EXPIRED' AND final_clock<a."leaseUntil") THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_UNCERTAIN_REQUIRED'; END IF;
      RETURN NEW; -- Bookkeeping after expiry/revocation needs no new authority.
    ELSE RAISE EXCEPTION 'CORRELATED_APPROVAL_TRANSITION_REFUSED'; END IF;
  END IF;
  IF sms_correlated_approval_authority_current(a,v) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_CURRENT_BINDING_REQUIRED'; END IF;
  final_clock:=clock_timestamp() AT TIME ZONE 'UTC';
  IF final_clock<a."approvedAt" OR final_clock>=a."leaseUntil" OR final_clock>=a."approvalExpiresAt" THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_CURRENT_BINDING_REQUIRED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sms_correlated_approval_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON "PersonalAssistantOperation"
  FOR EACH ROW EXECUTE FUNCTION sms_correlated_approval_operation_guard();

CREATE FUNCTION sms_correlated_approval_final_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "PersonalSmsCorrelatedCalendarApproval"%ROWTYPE; v "PersonalSmsCorrelatedCalendarReview"%ROWTYPE;
  o "PersonalAssistantOperation"%ROWTYPE; final_clock TIMESTAMP; inserted BOOLEAN;
BEGIN
  inserted:=TG_TABLE_NAME='PersonalSmsCorrelatedCalendarApproval';
  IF inserted THEN
    SELECT * INTO a FROM "PersonalSmsCorrelatedCalendarApproval" WHERE id=NEW.id;
  ELSIF TG_TABLE_NAME='PersonalAssistantOperation' THEN
    SELECT * INTO a FROM "PersonalSmsCorrelatedCalendarApproval" WHERE "calendarOperationId"=NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- legacy or unchanged pre-79 history
  ELSE RAISE EXCEPTION 'CORRELATED_APPROVAL_TRIGGER_TABLE_REFUSED'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_ROW_REQUIRED'; END IF;
  SELECT * INTO v FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=a."reviewId";
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_ROW_REQUIRED'; END IF;
  SELECT * INTO o FROM "PersonalAssistantOperation" WHERE id=a."calendarOperationId";
  IF NOT FOUND OR sms_correlated_approval_binding(a,v,o) IS DISTINCT FROM true OR sms_correlated_approval_state_valid(o.result,a,v) IS DISTINCT FROM true
    OR o.attempts IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_STATE_REQUIRED'; END IF;
  IF inserted AND (o.status IS DISTINCT FROM 'processing' OR o.result->>'phase' IS DISTINCT FROM 'CLAIMED'
    OR o."externalTransportPerformed" IS DISTINCT FROM false) THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_CLAIM_REQUIRED'; END IF;
  IF o.status='uncertain' AND o.result->>'phase'='UNCERTAIN' AND o."leaseUntil" IS NULL THEN RETURN NEW; END IF;
  IF o.status='processing' THEN
    IF o.result->>'phase' NOT IN ('CLAIMED','DISPATCH_CLAIMED') OR o."leaseUntil" IS DISTINCT FROM a."leaseUntil" THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_STATE_REQUIRED'; END IF;
  ELSIF o.status='completed' THEN
    IF o.result->>'phase' IS DISTINCT FROM 'CONFIRMED' OR o."leaseUntil" IS NOT NULL OR o."externalTransportPerformed" IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_STATE_REQUIRED'; END IF;
  ELSE RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_STATE_REQUIRED'; END IF;
  -- Snapshot authority recheck THEN fresh UTC clock, not a stale event NEW.
  IF sms_correlated_approval_authority_current(a,v) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_AUTHORITY_REQUIRED'; END IF;
  final_clock:=clock_timestamp() AT TIME ZONE 'UTC';
  IF final_clock<a."approvedAt" OR final_clock>=a."leaseUntil" OR final_clock>=a."approvalExpiresAt" THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_FINAL_EXPIRED'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER sms_correlated_approval_final_binding AFTER INSERT ON "PersonalSmsCorrelatedCalendarApproval"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sms_correlated_approval_final_binding();
CREATE CONSTRAINT TRIGGER sms_correlated_approval_operation_final AFTER UPDATE ON "PersonalAssistantOperation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.result IS DISTINCT FROM NEW.result OR OLD."leaseUntil" IS DISTINCT FROM NEW."leaseUntil" OR OLD.attempts IS DISTINCT FROM NEW.attempts OR OLD."externalTransportPerformed" IS DISTINCT FROM NEW."externalTransportPerformed")
  EXECUTE FUNCTION sms_correlated_approval_final_binding();
