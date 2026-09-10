-- Local OFF Project Brain voice subject. No provider route, consent inference,
-- historical source/date update, new operation ledger, or transport activation.
ALTER TABLE "VoiceIntakeSession"
  ALTER COLUMN "clientId" DROP NOT NULL,
  ADD COLUMN "subjectKind" TEXT NOT NULL DEFAULT 'voice_intake',
  ADD COLUMN "requestedByUserId" TEXT,
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "intakeId" TEXT,
  ADD COLUMN "projectBrainSourceId" TEXT,
  ADD COLUMN "requestCommandId" UUID,
  ADD COLUMN "sourceBinding" JSONB,
  ADD COLUMN "sourceBindingHash" TEXT,
  ADD COLUMN "segmentManifest" JSONB,
  ADD COLUMN "segmentManifestHash" TEXT,
  ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "VoiceIntakeSegment" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE UNIQUE INDEX "CPBS_voice_tenant_identity_key" ON "ConstructionProjectBrainSource" (id,"workspaceId","projectId","intakeId");
CREATE UNIQUE INDEX "voice_pb_owner_command_key" ON "VoiceIntakeSession" ("requestedByUserId","workspaceId","requestCommandId");
-- Permanent across terminal states. Deleting/purging a session must not reset a source's budget.
-- Legacy sources are NULL by CHECK; ordinary PostgreSQL UNIQUE permits multiple NULLs.
CREATE UNIQUE INDEX "voice_pb_one_session_per_source_key" ON "VoiceIntakeSession" ("projectBrainSourceId");
ALTER TABLE "VoiceIntakeSession"
  ADD CONSTRAINT "VoiceIntakeSession_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "voice_pb_source_tenant_fkey" FOREIGN KEY ("projectBrainSourceId","workspaceId","projectId","intakeId") REFERENCES "ConstructionProjectBrainSource"(id,"workspaceId","projectId","intakeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "voice_pb_exclusive_subject_ck" CHECK (
    ("subjectKind"='voice_intake' AND "clientId" IS NOT NULL AND "requestedByUserId" IS NULL
      AND "workspaceId" IS NULL AND "projectId" IS NULL AND "intakeId" IS NULL AND "projectBrainSourceId" IS NULL
      AND "requestCommandId" IS NULL AND "sourceBinding" IS NULL AND "sourceBindingHash" IS NULL
      AND "segmentManifest" IS NULL AND "segmentManifestHash" IS NULL)
    OR
    ("subjectKind"='project_brain_voice' AND "clientId" IS NULL AND "requestedByUserId" IS NOT NULL
      AND "workspaceId" IS NOT NULL AND "projectId" IS NOT NULL AND "intakeId" IS NOT NULL AND "projectBrainSourceId" IS NOT NULL
      AND "requestCommandId" IS NOT NULL AND "sourceBinding" IS NOT NULL AND "sourceBindingHash" IS NOT NULL
      AND "segmentManifest" IS NOT NULL AND "segmentManifestHash" IS NOT NULL
      AND "sourceBindingHash" ~ '^[a-f0-9]{64}$' AND "segmentManifestHash" ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof("sourceBinding")='object' AND jsonb_typeof("segmentManifest")='object'
      AND pg_column_size("sourceBinding") <= 16384 AND pg_column_size("segmentManifest") <= 32768)
  );

-- Canonical serialization for this closed JSON contract: string/boolean/null,
-- integer metadata, arrays, and ASCII object keys. Money is stored as a string.
CREATE FUNCTION voice_pb_canonical_json(value JSONB) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE rendered TEXT;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(to_jsonb(key)::text || ':' || voice_pb_canonical_json(child), ',' ORDER BY key COLLATE "C"), '') || '}'
      INTO rendered FROM jsonb_each(value) AS item(key,child);
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(voice_pb_canonical_json(child), ',' ORDER BY ordinal), '') || ']'
      INTO rendered FROM jsonb_array_elements(value) WITH ORDINALITY AS item(child,ordinal);
    ELSE rendered := value::text;
  END CASE;
  RETURN rendered;
END $$;

CREATE FUNCTION voice_pb_exact_keys(value JSONB, allowed_keys TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_typeof(value)='object' AND value ?& allowed_keys AND value - allowed_keys = '{}'::jsonb, false)
$$;

-- Zod/JavaScript string bounds count UTF-16 units, not PostgreSQL code points.
CREATE FUNCTION voice_pb_utf16_length(value TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT COALESCE(sum(CASE WHEN ascii(character)>65535 THEN 2 ELSE 1 END),0)::integer
  FROM regexp_split_to_table(value,'') AS characters(character) WHERE character<>''
$$;

CREATE FUNCTION voice_pb_guard_session() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE s JSONB; consent JSONB; manifest JSONB; source_row RECORD; now_utc TIMESTAMP(3);
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."subjectKind"='project_brain_voice' THEN RAISE EXCEPTION 'voice_pb_session_delete_refused'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW."subjectKind",NEW."requestedByUserId",NEW."workspaceId",NEW."projectId",NEW."intakeId",NEW."projectBrainSourceId",
      NEW."requestCommandId",NEW."sourceBinding",NEW."sourceBindingHash",NEW."segmentManifest",NEW."segmentManifestHash") IS DISTINCT FROM
      ROW(OLD."subjectKind",OLD."requestedByUserId",OLD."workspaceId",OLD."projectId",OLD."intakeId",OLD."projectBrainSourceId",
      OLD."requestCommandId",OLD."sourceBinding",OLD."sourceBindingHash",OLD."segmentManifest",OLD."segmentManifestHash") THEN
      RAISE EXCEPTION 'voice_pb_subject_immutable';
    END IF;
    -- Existing voice trigger still enforces frozen consent/limits and transitions.
    -- Do not enforce current member/grant epochs forever: revocation must remain possible.
    RETURN NEW;
  END IF;
  IF NEW."subjectKind" <> 'project_brain_voice' THEN RETURN NEW; END IF;
  s := NEW."sourceBinding"->'subject'; consent := NEW."sourceBinding"->'consent'; manifest := NEW."segmentManifest";
  now_utc := clock_timestamp() AT TIME ZONE 'UTC';
  IF jsonb_typeof(manifest#>'{transformer,id}') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest#>'{transformer,version}') IS DISTINCT FROM 'string'
    OR jsonb_typeof(manifest#>'{transformer,encodingProfile}') IS DISTINCT FROM 'string'
    OR voice_pb_utf16_length(manifest#>>'{transformer,id}') NOT BETWEEN 1 AND 160
    OR voice_pb_utf16_length(manifest#>>'{transformer,version}') NOT BETWEEN 1 AND 160
    OR voice_pb_utf16_length(manifest#>>'{transformer,encodingProfile}') NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'voice_pb_transformer_refused';
  END IF;
  IF NOT voice_pb_exact_keys(NEW."sourceBinding", ARRAY['schemaVersion','commandId','subject','subjectFingerprint','consent'])
    OR NOT voice_pb_exact_keys(s, ARRAY['kind','actorUserId','workspaceId','projectId','intakeId','sourceId','fileId','memberId','memberRevision','workspaceRevision','projectRevision','intakeStateVersion','intakeRevision','intakeStatus','sourceContentHash','sourceMimeType','sourceSizeBytes','sourceDurationMs'])
    OR NOT voice_pb_exact_keys(consent, ARRAY['schemaVersion','purpose','accepted','externalProcessingAllowed','version','actorUserId','workspaceId','projectId','intakeId','sourceId','sourceContentHash','acceptedAt','expiresAt','languageHint','maxTotalCostMicros','retentionHours'])
    OR NOT voice_pb_exact_keys(manifest, ARRAY['schemaVersion','subject','subjectFingerprint','transformer','segments','totalBytes','totalDurationMs','mediaDecodingVerified'])
    OR NOT voice_pb_exact_keys(manifest->'transformer', ARRAY['id','version','encodingProfile','mode'])
    OR NEW."sourceBinding"->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR (NEW."sourceBinding"->>'commandId') IS DISTINCT FROM NEW."requestCommandId"::text
    OR (s->>'kind') IS DISTINCT FROM 'project_brain_voice_source'
    OR (s->>'actorUserId') IS DISTINCT FROM NEW."requestedByUserId"
    OR (s->>'workspaceId') IS DISTINCT FROM NEW."workspaceId" OR (s->>'projectId') IS DISTINCT FROM NEW."projectId"
    OR (s->>'intakeId') IS DISTINCT FROM NEW."intakeId" OR (s->>'sourceId') IS DISTINCT FROM NEW."projectBrainSourceId"
    OR manifest->'subject' IS DISTINCT FROM s
    OR (manifest->>'subjectFingerprint') IS DISTINCT FROM (NEW."sourceBinding"->>'subjectFingerprint')
    OR (NEW."sourceBinding"->>'subjectFingerprint') IS DISTINCT FROM encode(sha256(convert_to(voice_pb_canonical_json(s),'UTF8')),'hex')
    OR NEW."sourceBindingHash" IS DISTINCT FROM encode(sha256(convert_to(voice_pb_canonical_json(NEW."sourceBinding"),'UTF8')),'hex')
    OR NEW."segmentManifestHash" IS DISTINCT FROM encode(sha256(convert_to(voice_pb_canonical_json(manifest),'UTF8')),'hex')
    OR manifest->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR (manifest#>>'{transformer,mode}') IS DISTINCT FROM 'SYNTHETIC_LOCAL'
    OR manifest->'mediaDecodingVerified' IS DISTINCT FROM 'false'::jsonb
    OR jsonb_typeof(manifest->'segments') IS DISTINCT FROM 'array'
    OR consent->'schemaVersion' IS DISTINCT FROM '1'::jsonb
    OR (consent->>'purpose') IS DISTINCT FROM 'PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC'
    OR consent->'accepted' IS DISTINCT FROM 'true'::jsonb OR consent->'externalProcessingAllowed' IS DISTINCT FROM 'false'::jsonb
    OR (consent->>'actorUserId') IS DISTINCT FROM NEW."requestedByUserId"
    OR (consent->>'workspaceId') IS DISTINCT FROM NEW."workspaceId" OR (consent->>'projectId') IS DISTINCT FROM NEW."projectId"
    OR (consent->>'intakeId') IS DISTINCT FROM NEW."intakeId" OR (consent->>'sourceId') IS DISTINCT FROM NEW."projectBrainSourceId"
    OR (consent->>'sourceContentHash') IS DISTINCT FROM (s->>'sourceContentHash')
    OR (consent->>'version') IS DISTINCT FROM NEW."consentVersion"
    OR (consent->>'languageHint') IS DISTINCT FROM NEW."languageHint"::text
    OR (consent->>'maxTotalCostMicros') IS DISTINCT FROM NEW."maxTotalCostMicros"::text
    OR (consent->>'retentionHours') IS DISTINCT FROM '24'
    OR ((consent->>'acceptedAt')::timestamptz AT TIME ZONE 'UTC') IS DISTINCT FROM NEW."consentedAt"
    OR ((consent->>'expiresAt')::timestamptz AT TIME ZONE 'UTC') IS DISTINCT FROM NEW."expiresAt"
    OR NEW."consentedAt" > now_utc OR NEW."consentedAt" < now_utc - interval '15 minutes'
    OR NEW."expiresAt" <= now_utc OR NEW."expiresAt" > NEW."consentedAt" + interval '24 hours'
    OR NEW.status <> 'finishing' OR NEW."expectedSegmentCount" IS NULL
    OR NEW."expectedSegmentCount" NOT BETWEEN 1 AND 14
    OR NEW."maxDurationMs" <> 600000 OR NEW."maxSegmentDurationMs" <> 45000
    OR NEW."maxSegmentBytes" <> 2000000 OR NEW."maxSegments" <> 14 OR NEW."maxTotalBytes" <> 28000000
    OR NEW."expectedSegmentCount" <> jsonb_array_length(manifest->'segments')
    OR NEW."capturedDurationMs" IS DISTINCT FROM (s->>'sourceDurationMs')::integer
    OR NEW."capturedDurationMs" IS DISTINCT FROM (manifest->>'totalDurationMs')::integer
    OR NEW."capturedBytes" IS DISTINCT FROM (manifest->>'totalBytes')::integer THEN
    RAISE EXCEPTION 'voice_pb_binding_or_consent_refused';
  END IF;
  SELECT src.*, f."uploaderId", f.sha256, f."detectedMime", f."sizeBytes" AS file_size,
    f."purgedAt", f."taskId", f."submissionId", f."scanDetails", i."createdByUserId" AS intake_owner,
    i.status AS intake_status,i."stateVersion",i."updatedAt" AS intake_revision,
    m.id AS member_id,m."updatedAt" AS member_revision,w."updatedAt" AS workspace_revision,p."updatedAt" AS project_revision
  INTO source_row FROM "ConstructionProjectBrainSource" src
  JOIN "File" f ON f.id=src."fileId"
  JOIN "ConstructionProjectBrainIntake" i ON i.id=src."intakeId" AND i."workspaceId"=src."workspaceId" AND i."projectId"=src."projectId"
  JOIN "ConstructionWorkspace" w ON w.id=src."workspaceId" AND w.status='active' AND w."ownerUserId"=NEW."requestedByUserId"
  JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=NEW."requestedByUserId" AND m.status='active' AND m.role='owner'
  JOIN "ConstructionProject" p ON p.id=src."projectId" AND p."workspaceId"=w.id AND p.status='active'
  WHERE src.id=NEW."projectBrainSourceId" AND src."workspaceId"=NEW."workspaceId" AND src."projectId"=NEW."projectId" AND src."intakeId"=NEW."intakeId"
  FOR SHARE OF src,f,i,w,m,p;
  IF NOT FOUND OR source_row.kind<>'VOICE_NOTE' OR source_row."createdByUserId"<>NEW."requestedByUserId"
    OR source_row."uploaderId"<>NEW."requestedByUserId" OR source_row.intake_owner<>NEW."requestedByUserId"
    OR source_row.intake_status NOT IN ('DRAFT','READY_FOR_REVIEW','CONFIRMED')
    OR source_row."purgedAt" IS NOT NULL OR source_row."taskId" IS NOT NULL OR source_row."submissionId" IS NOT NULL
    OR COALESCE(source_row."scanDetails",'') NOT LIKE 'LOCAL_SIGNATURE_SANITIZATION;%'
    OR source_row."fileId" IS DISTINCT FROM (s->>'fileId')
    OR source_row."contentHash" IS DISTINCT FROM (s->>'sourceContentHash') OR source_row."contentHash" IS DISTINCT FROM source_row.sha256
    OR source_row."mimeType" IS DISTINCT FROM (s->>'sourceMimeType') OR source_row."mimeType" IS DISTINCT FROM source_row."detectedMime"
    OR source_row."mimeType" NOT IN ('audio/mp4','audio/m4a','audio/x-m4a')
    OR source_row."sizeBytes" IS DISTINCT FROM (s->>'sourceSizeBytes')::integer OR source_row."sizeBytes" IS DISTINCT FROM source_row.file_size
    OR source_row."sizeBytes" NOT BETWEEN 1 AND 10485760
    OR source_row."durationMs" IS DISTINCT FROM (s->>'sourceDurationMs')::integer OR source_row."durationMs" NOT BETWEEN 1 AND 600000
    OR source_row."transcriptionState"<>'NOT_REQUESTED_LOCAL_ONLY' OR source_row."documentUnderstandingState"<>'NOT_REQUESTED_LOCAL_ONLY'
    OR source_row.member_id IS DISTINCT FROM (s->>'memberId')
    OR source_row.member_revision IS DISTINCT FROM ((s->>'memberRevision')::timestamptz AT TIME ZONE 'UTC')
    OR source_row.workspace_revision IS DISTINCT FROM ((s->>'workspaceRevision')::timestamptz AT TIME ZONE 'UTC')
    OR source_row.project_revision IS DISTINCT FROM ((s->>'projectRevision')::timestamptz AT TIME ZONE 'UTC')
    OR source_row.intake_revision IS DISTINCT FROM ((s->>'intakeRevision')::timestamptz AT TIME ZONE 'UTC')
    OR source_row."stateVersion" IS DISTINCT FROM (s->>'intakeStateVersion')::integer OR source_row.intake_status IS DISTINCT FROM (s->>'intakeStatus') THEN
    RAISE EXCEPTION 'voice_pb_source_authority_refused';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER voice_pb_session_guard BEFORE INSERT OR UPDATE OR DELETE ON "VoiceIntakeSession" FOR EACH ROW EXECUTE FUNCTION voice_pb_guard_session();

-- Query current rows at COMMIT, not the queued NEW snapshot. All registrations
-- are atomic; later valid segment status changes do not alter the manifest.
CREATE FUNCTION voice_pb_verify_manifest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE session_id TEXT; current_session RECORD; expected JSONB; item JSONB; segment RECORD; expected_ordinal INTEGER := 0; next_start INTEGER := 0; total_bytes INTEGER := 0;
BEGIN
  IF TG_TABLE_NAME='VoiceIntakeSession' THEN session_id := COALESCE(NEW.id,OLD.id);
  ELSE session_id := COALESCE(NEW."sessionId",OLD."sessionId"); END IF;
  SELECT * INTO current_session FROM "VoiceIntakeSession" WHERE id=session_id;
  IF NOT FOUND OR current_session."subjectKind"<>'project_brain_voice' THEN RETURN NULL; END IF;
  expected := current_session."segmentManifest"->'segments';
  IF (SELECT count(*) FROM "VoiceIntakeSegment" WHERE "sessionId"=session_id) <> jsonb_array_length(expected) THEN
    RAISE EXCEPTION 'voice_pb_manifest_incomplete';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(expected) LOOP
    SELECT * INTO segment FROM "VoiceIntakeSegment" WHERE "sessionId"=session_id AND "ordinal"=expected_ordinal;
    IF NOT FOUND OR NOT voice_pb_exact_keys(item, ARRAY['ordinal','startMs','endMs','durationMs','mediaFormat','mimeType','contentHash','byteCount'])
      OR (item->>'ordinal')::integer IS DISTINCT FROM expected_ordinal
      OR (item->>'startMs')::integer IS DISTINCT FROM next_start
      OR (item->>'endMs')::integer - (item->>'startMs')::integer IS DISTINCT FROM segment."durationMs"
      OR (item->>'durationMs')::integer IS DISTINCT FROM segment."durationMs"
      OR (item->>'byteCount')::integer IS DISTINCT FROM segment."byteCount"
      OR (item->>'mediaFormat') IS DISTINCT FROM segment."mediaFormat"::text
      OR (item->>'mimeType') IS DISTINCT FROM segment."mimeType"
      OR ('sha256:' || (item->>'contentHash')) IS DISTINCT FROM segment."audioFingerprint"
      OR segment."languageHint" IS DISTINCT FROM current_session."languageHint" THEN
      RAISE EXCEPTION 'voice_pb_manifest_segment_mismatch';
    END IF;
    IF NOT (CASE segment."mediaFormat"::text
      WHEN 'm4a' THEN segment."mimeType" IN ('audio/mp4','audio/m4a','audio/x-m4a')
      WHEN 'aac' THEN segment."mimeType"='audio/aac'
      WHEN 'wav' THEN segment."mimeType" IN ('audio/wav','audio/x-wav')
      WHEN 'mp3' THEN segment."mimeType"='audio/mpeg'
      WHEN 'ogg' THEN segment."mimeType"='audio/ogg'
      WHEN 'webm' THEN segment."mimeType"='audio/webm'
      WHEN 'flac' THEN segment."mimeType" IN ('audio/flac','audio/x-flac') ELSE false END) THEN
      RAISE EXCEPTION 'voice_pb_manifest_media_refused';
    END IF;
    expected_ordinal := expected_ordinal + 1; next_start := (item->>'endMs')::integer; total_bytes := total_bytes + segment."byteCount";
  END LOOP;
  IF next_start IS DISTINCT FROM current_session."capturedDurationMs" OR total_bytes IS DISTINCT FROM current_session."capturedBytes"
    OR expected_ordinal IS DISTINCT FROM current_session."expectedSegmentCount" THEN RAISE EXCEPTION 'voice_pb_manifest_coverage_refused'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER voice_pb_session_manifest_complete AFTER INSERT OR UPDATE ON "VoiceIntakeSession" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION voice_pb_verify_manifest();
CREATE CONSTRAINT TRIGGER voice_pb_segment_manifest_complete AFTER INSERT OR UPDATE OR DELETE ON "VoiceIntakeSegment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION voice_pb_verify_manifest();

CREATE FUNCTION voice_pb_reject_evidence_truncate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "VoiceIntakeSession" WHERE "subjectKind"='project_brain_voice') THEN RAISE EXCEPTION 'voice_pb_evidence_truncate_refused'; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER voice_pb_session_no_truncate BEFORE TRUNCATE ON "VoiceIntakeSession" FOR EACH STATEMENT EXECUTE FUNCTION voice_pb_reject_evidence_truncate();
CREATE TRIGGER voice_pb_segment_no_truncate BEFORE TRUNCATE ON "VoiceIntakeSegment" FOR EACH STATEMENT EXECUTE FUNCTION voice_pb_reject_evidence_truncate();
