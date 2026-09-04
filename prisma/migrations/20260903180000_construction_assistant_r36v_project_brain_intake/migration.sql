-- R36V Project Brain Intake. Additive, forward-only and local-only.

ALTER TYPE "ConstructionIntent" ADD VALUE IF NOT EXISTS 'project_brain_query';

-- Required by the tenant-bound composite project relation. The primary key
-- already makes id unique; this redundant key lets PostgreSQL enforce that a
-- supplied project and workspace belong together.
CREATE UNIQUE INDEX "ConstructionProject_id_workspaceId_key"
    ON "ConstructionProject"("id", "workspaceId");

CREATE TABLE "ConstructionProjectBrainIntake" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "intakeSequence" INTEGER NOT NULL,
    "createCommandId" TEXT NOT NULL,
    "createCommandHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "scope" TEXT,
    "importantPeople" TEXT,
    "importantDates" TEXT,
    "blockers" TEXT,
    "nextDecision" TEXT,
    "reviewFingerprint" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionProjectBrainIntake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBI_status_check" CHECK ("status" IN ('DRAFT', 'READY_FOR_REVIEW', 'CONFIRMED', 'REJECTED')),
    CONSTRAINT "CPBI_positive_versions_check" CHECK ("intakeSequence" > 0 AND "stateVersion" > 0),
    CONSTRAINT "CPBI_command_hash_check" CHECK ("createCommandHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "CPBI_review_hash_check" CHECK ("reviewFingerprint" IS NULL OR "reviewFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "CPBI_state_shape_check" CHECK (
        ("status" = 'DRAFT' AND "reviewFingerprint" IS NULL AND "submittedAt" IS NULL AND "confirmedAt" IS NULL AND "rejectedAt" IS NULL) OR
        ("status" = 'READY_FOR_REVIEW' AND "reviewFingerprint" IS NOT NULL AND "submittedAt" IS NOT NULL AND "confirmedAt" IS NULL AND "rejectedAt" IS NULL AND length(btrim(COALESCE("summary", ''))) > 0) OR
        ("status" = 'CONFIRMED' AND "reviewFingerprint" IS NOT NULL AND "submittedAt" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "rejectedAt" IS NULL AND length(btrim(COALESCE("summary", ''))) > 0) OR
        ("status" = 'REJECTED' AND "reviewFingerprint" IS NOT NULL AND "submittedAt" IS NOT NULL AND "confirmedAt" IS NULL AND "rejectedAt" IS NOT NULL AND length(btrim(COALESCE("summary", ''))) > 0)
    )
);

CREATE TABLE "ConstructionProjectBrainSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "ordinal" INTEGER NOT NULL,
    "transcriptionState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED_LOCAL_ONLY',
    "documentUnderstandingState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED_LOCAL_ONLY',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionProjectBrainSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBS_kind_check" CHECK ("kind" IN ('PHOTO', 'DOCUMENT', 'VOICE_NOTE')),
    CONSTRAINT "CPBS_hashes_check" CHECK ("commandHash" ~ '^[0-9a-f]{64}$' AND "contentHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "CPBS_size_ordinal_check" CHECK ("sizeBytes" BETWEEN 1 AND 10485760 AND "ordinal" BETWEEN 1 AND 20),
    CONSTRAINT "CPBS_interpretation_check" CHECK ("transcriptionState" = 'NOT_REQUESTED_LOCAL_ONLY' AND "documentUnderstandingState" = 'NOT_REQUESTED_LOCAL_ONLY'),
    CONSTRAINT "CPBS_duration_check" CHECK (("kind" = 'VOICE_NOTE' AND "durationMs" BETWEEN 1 AND 120000) OR ("kind" <> 'VOICE_NOTE' AND "durationMs" IS NULL)),
    CONSTRAINT "CPBS_kind_mime_check" CHECK (
        ("kind" = 'PHOTO' AND "mimeType" IN ('image/jpeg', 'image/png')) OR
        ("kind" = 'DOCUMENT' AND "mimeType" IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) OR
        ("kind" = 'VOICE_NOTE' AND "mimeType" IN ('audio/mp4', 'audio/m4a', 'audio/x-m4a'))
    )
);

CREATE TABLE "ConstructionProjectBrainSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "canonicalHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionProjectBrainSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBSnapshot_status_check" CHECK ("status" IN ('PROPOSED', 'CONFIRMED')),
    CONSTRAINT "CPBSnapshot_version_check" CHECK ("stateVersion" > 0),
    CONSTRAINT "CPBSnapshot_hash_check" CHECK ("canonicalHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "priorStateVersion" INTEGER NOT NULL,
    "nextStateVersion" INTEGER NOT NULL,
    "snapshotHash" TEXT,
    "result" JSONB NOT NULL,
    "resultHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionProjectBrainDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CPBD_decision_check" CHECK ("decision" IN ('CREATE', 'ADD_OWNER_BRIEF', 'ADMIT_SOURCE', 'SUBMIT_FOR_REVIEW', 'CONFIRM_EXACT', 'REJECT')),
    CONSTRAINT "CPBD_versions_check" CHECK ("priorStateVersion" >= 0 AND "nextStateVersion" = "priorStateVersion" + 1),
    CONSTRAINT "CPBD_hashes_check" CHECK ("commandHash" ~ '^[0-9a-f]{64}$' AND "resultHash" ~ '^[0-9a-f]{64}$' AND ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$')),
    CONSTRAINT "CPBD_snapshot_binding_check" CHECK ((("decision" IN ('SUBMIT_FOR_REVIEW', 'CONFIRM_EXACT')) AND "snapshotHash" IS NOT NULL) OR (("decision" NOT IN ('SUBMIT_FOR_REVIEW', 'CONFIRM_EXACT')) AND "snapshotHash" IS NULL))
);

CREATE UNIQUE INDEX "CPBI_workspace_command_key"
    ON "ConstructionProjectBrainIntake"("workspaceId", "createCommandId");
CREATE UNIQUE INDEX "CPBI_project_sequence_key"
    ON "ConstructionProjectBrainIntake"("workspaceId", "projectId", "intakeSequence");
CREATE UNIQUE INDEX "CPBI_tenant_identity_key"
    ON "ConstructionProjectBrainIntake"("id", "workspaceId", "projectId");
CREATE INDEX "CPBI_project_created_idx"
    ON "ConstructionProjectBrainIntake"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CPBI_status_updated_idx"
    ON "ConstructionProjectBrainIntake"("workspaceId", "status", "updatedAt");
CREATE UNIQUE INDEX "CPBI_one_active_project_key"
    ON "ConstructionProjectBrainIntake"("workspaceId", "projectId")
    WHERE "status" IN ('DRAFT', 'READY_FOR_REVIEW');

CREATE UNIQUE INDEX "CPBS_workspace_command_key"
    ON "ConstructionProjectBrainSource"("workspaceId", "commandId");
CREATE UNIQUE INDEX "CPBS_intake_ordinal_key"
    ON "ConstructionProjectBrainSource"("intakeId", "ordinal");
CREATE UNIQUE INDEX "CPBS_one_voice_note_per_intake_key"
    ON "ConstructionProjectBrainSource"("intakeId")
    WHERE "kind" = 'VOICE_NOTE';
CREATE INDEX "CPBS_project_created_idx"
    ON "ConstructionProjectBrainSource"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CPBS_file_idx"
    ON "ConstructionProjectBrainSource"("fileId");

CREATE UNIQUE INDEX "CPBSnapshot_version_status_key"
    ON "ConstructionProjectBrainSnapshot"("intakeId", "stateVersion", "status");
CREATE INDEX "CPBSnapshot_project_created_idx"
    ON "ConstructionProjectBrainSnapshot"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CPBSnapshot_status_created_idx"
    ON "ConstructionProjectBrainSnapshot"("intakeId", "status", "createdAt");

CREATE UNIQUE INDEX "CPBD_workspace_command_key"
    ON "ConstructionProjectBrainDecision"("workspaceId", "commandId");
CREATE UNIQUE INDEX "CPBD_intake_next_version_key"
    ON "ConstructionProjectBrainDecision"("intakeId", "nextStateVersion");
CREATE INDEX "CPBD_project_created_idx"
    ON "ConstructionProjectBrainDecision"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CPBD_intake_created_idx"
    ON "ConstructionProjectBrainDecision"("intakeId", "createdAt");

ALTER TABLE "ConstructionProjectBrainIntake"
    ADD CONSTRAINT "CPBI_workspace_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainIntake"
    ADD CONSTRAINT "CPBI_project_tenant_fkey"
    FOREIGN KEY ("projectId", "workspaceId") REFERENCES "ConstructionProject"("id", "workspaceId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainIntake"
    ADD CONSTRAINT "CPBI_creator_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ConstructionProjectBrainSource"
    ADD CONSTRAINT "CPBS_intake_tenant_fkey"
    FOREIGN KEY ("intakeId", "workspaceId", "projectId") REFERENCES "ConstructionProjectBrainIntake"("id", "workspaceId", "projectId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainSource"
    ADD CONSTRAINT "CPBS_creator_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainSource"
    ADD CONSTRAINT "CPBS_file_fkey"
    FOREIGN KEY ("fileId") REFERENCES "File"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ConstructionProjectBrainSnapshot"
    ADD CONSTRAINT "CPBSnapshot_intake_tenant_fkey"
    FOREIGN KEY ("intakeId", "workspaceId", "projectId") REFERENCES "ConstructionProjectBrainIntake"("id", "workspaceId", "projectId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainSnapshot"
    ADD CONSTRAINT "CPBSnapshot_creator_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ConstructionProjectBrainDecision"
    ADD CONSTRAINT "CPBD_intake_tenant_fkey"
    FOREIGN KEY ("intakeId", "workspaceId", "projectId") REFERENCES "ConstructionProjectBrainIntake"("id", "workspaceId", "projectId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainDecision"
    ADD CONSTRAINT "CPBD_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A Project Brain source reuses the historical File table only as an opaque
-- byte envelope. Once a source references that row, generic task claims,
-- submission claims, retention and scanner maintenance must not repurpose or
-- rewrite it. Application filters avoid those paths before storage I/O; this
-- trigger is the database backstop for every metadata mutation path.
CREATE OR REPLACE FUNCTION "ConstructionProjectBrainFile_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ConstructionProjectBrainSource"
    WHERE "fileId" = OLD."id"
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Construction Project Brain source File is immutable';
  END IF;

  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Construction Project Brain source File is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConstructionProjectBrainFile_guard_update_delete"
  BEFORE UPDATE OR DELETE ON "File"
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainFile_guard"();

-- The intake is a mutable aggregate, but its identity/provenance cannot be
-- rewritten and every accepted mutation must advance exactly one legal state
-- version. Direct SQL therefore obeys the same state machine as the service.
CREATE OR REPLACE FUNCTION "ConstructionProjectBrainIntake_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake history cannot be removed';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId"
     OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
     OR NEW."intakeSequence" IS DISTINCT FROM OLD."intakeSequence"
     OR NEW."createCommandId" IS DISTINCT FROM OLD."createCommandId"
     OR NEW."createCommandHash" IS DISTINCT FROM OLD."createCommandHash"
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake identity and provenance are immutable';
  END IF;

  IF NEW."stateVersion" <> OLD."stateVersion" + 1 THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake must advance exactly one state version';
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'READY_FOR_REVIEW')) OR
    (OLD."status" = 'READY_FOR_REVIEW' AND NEW."status" IN ('CONFIRMED', 'REJECTED'))
  ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake state transition is refused';
  END IF;

  IF OLD."status" = 'DRAFT' AND NEW."status" = 'READY_FOR_REVIEW'
     AND ROW(
       NEW."summary", NEW."scope", NEW."importantPeople",
       NEW."importantDates", NEW."blockers", NEW."nextDecision"
     ) IS DISTINCT FROM ROW(
       OLD."summary", OLD."scope", OLD."importantPeople",
       OLD."importantDates", OLD."blockers", OLD."nextDecision"
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake owner brief must be frozen before review';
  END IF;

  IF OLD."status" = 'READY_FOR_REVIEW'
     AND ROW(
       NEW."summary", NEW."scope", NEW."importantPeople",
       NEW."importantDates", NEW."blockers", NEW."nextDecision",
       NEW."reviewFingerprint", NEW."submittedAt"
     ) IS DISTINCT FROM ROW(
       OLD."summary", OLD."scope", OLD."importantPeople",
       OLD."importantDates", OLD."blockers", OLD."nextDecision",
       OLD."reviewFingerprint", OLD."submittedAt"
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake reviewed state is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConstructionProjectBrainIntake_guard_update_delete"
  BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainIntake"
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainIntake_guard"();
CREATE TRIGGER "ConstructionProjectBrainIntake_no_truncate"
  BEFORE TRUNCATE ON "ConstructionProjectBrainIntake"
  FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainIntake_guard"();

-- An intake row is only the current projection of an immutable decision log.
-- The service writes the projection before its decision/snapshot sidecars in
-- one transaction, so this constraint is deferred until COMMIT. Direct SQL
-- cannot publish a new version or reviewed state without the exact immutable
-- evidence required for that transition.
CREATE OR REPLACE FUNCTION "ConstructionProjectBrainIntake_atomic_evidence_guard"()
RETURNS TRIGGER AS $$
DECLARE
  expected_decisions TEXT[];
  matching_decision "ConstructionProjectBrainDecision"%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."stateVersion" <> 1 THEN
      RAISE EXCEPTION 'ConstructionProjectBrainIntake must start as DRAFT version 1';
    END IF;
    IF NEW."summary" IS NOT NULL
       OR NEW."scope" IS NOT NULL
       OR NEW."importantPeople" IS NOT NULL
       OR NEW."importantDates" IS NOT NULL
       OR NEW."blockers" IS NOT NULL
       OR NEW."nextDecision" IS NOT NULL
       OR NEW."reviewFingerprint" IS NOT NULL
       OR NEW."submittedAt" IS NOT NULL
       OR NEW."confirmedAt" IS NOT NULL
       OR NEW."rejectedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'ConstructionProjectBrainIntake CREATE projection must be empty';
    END IF;
    expected_decisions := ARRAY['CREATE'];
  ELSIF OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    expected_decisions := ARRAY['ADD_OWNER_BRIEF', 'ADMIT_SOURCE'];
  ELSIF OLD."status" = 'DRAFT' AND NEW."status" = 'READY_FOR_REVIEW' THEN
    expected_decisions := ARRAY['SUBMIT_FOR_REVIEW'];
  ELSIF OLD."status" = 'READY_FOR_REVIEW' AND NEW."status" = 'CONFIRMED' THEN
    expected_decisions := ARRAY['CONFIRM_EXACT'];
  ELSIF OLD."status" = 'READY_FOR_REVIEW' AND NEW."status" = 'REJECTED' THEN
    expected_decisions := ARRAY['REJECT'];
  ELSE
    RAISE EXCEPTION 'ConstructionProjectBrainIntake has no atomic evidence contract for transition';
  END IF;

  SELECT decision.*
  INTO matching_decision
  FROM "ConstructionProjectBrainDecision" AS decision
  WHERE decision."intakeId" = NEW."id"
    AND decision."workspaceId" = NEW."workspaceId"
    AND decision."projectId" = NEW."projectId"
    AND decision."priorStateVersion" = NEW."stateVersion" - 1
    AND decision."nextStateVersion" = NEW."stateVersion"
    AND decision."decision" = ANY(expected_decisions)
  LIMIT 1;

  IF matching_decision."id" IS NULL THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake version requires one matching immutable decision';
  END IF;

  IF TG_OP = 'UPDATE'
     AND matching_decision."decision" = 'ADMIT_SOURCE'
     AND ROW(
       NEW."summary", NEW."scope", NEW."importantPeople",
       NEW."importantDates", NEW."blockers", NEW."nextDecision"
     ) IS DISTINCT FROM ROW(
       OLD."summary", OLD."scope", OLD."importantPeople",
       OLD."importantDates", OLD."blockers", OLD."nextDecision"
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake ADMIT_SOURCE cannot modify owner-brief fields';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT'
     AND ROW(
       NEW."reviewFingerprint", NEW."submittedAt", NEW."confirmedAt", NEW."rejectedAt"
     ) IS DISTINCT FROM ROW(
       OLD."reviewFingerprint", OLD."submittedAt", OLD."confirmedAt", OLD."rejectedAt"
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake draft transition cannot modify review lifecycle fields';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'DRAFT' AND NEW."status" = 'READY_FOR_REVIEW'
     AND (
       OLD."reviewFingerprint" IS NOT NULL
       OR OLD."submittedAt" IS NOT NULL
       OR OLD."confirmedAt" IS NOT NULL
       OR OLD."rejectedAt" IS NOT NULL
       OR NEW."reviewFingerprint" IS NULL
       OR NEW."submittedAt" IS NULL
       OR NEW."confirmedAt" IS NOT NULL
       OR NEW."rejectedAt" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake review lifecycle projection mismatch';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'READY_FOR_REVIEW' AND NEW."status" = 'CONFIRMED'
     AND (
       OLD."confirmedAt" IS NOT NULL
       OR OLD."rejectedAt" IS NOT NULL
       OR NEW."confirmedAt" IS NULL
       OR NEW."rejectedAt" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake confirmation lifecycle projection mismatch';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'READY_FOR_REVIEW' AND NEW."status" = 'REJECTED'
     AND (
       OLD."confirmedAt" IS NOT NULL
       OR OLD."rejectedAt" IS NOT NULL
       OR NEW."confirmedAt" IS NOT NULL
       OR NEW."rejectedAt" IS NULL
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake rejection lifecycle projection mismatch';
  END IF;

  IF TG_OP = 'INSERT' AND (
    matching_decision."commandId" <> NEW."createCommandId"
    OR matching_decision."commandHash" <> NEW."createCommandHash"
    OR matching_decision."actorUserId" <> NEW."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake CREATE decision provenance mismatch';
  END IF;

  IF matching_decision."decision" = 'ADMIT_SOURCE' AND NOT EXISTS (
    SELECT 1
    FROM "ConstructionProjectBrainSource" AS source
    WHERE source."intakeId" = NEW."id"
      AND source."workspaceId" = NEW."workspaceId"
      AND source."projectId" = NEW."projectId"
      AND source."commandId" = matching_decision."commandId"
      AND source."commandHash" = matching_decision."commandHash"
  ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake ADMIT_SOURCE decision requires its immutable source';
  END IF;

  IF NEW."status" IN ('READY_FOR_REVIEW', 'CONFIRMED') AND NOT EXISTS (
    SELECT 1
    FROM "ConstructionProjectBrainSource" AS required_source
    WHERE required_source."intakeId" = NEW."id"
      AND required_source."workspaceId" = NEW."workspaceId"
      AND required_source."projectId" = NEW."projectId"
  ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainIntake review requires at least one immutable source';
  END IF;

  IF NEW."status" = 'READY_FOR_REVIEW' THEN
    IF matching_decision."snapshotHash" IS DISTINCT FROM NEW."reviewFingerprint"
       OR NOT EXISTS (
         SELECT 1
         FROM "ConstructionProjectBrainSnapshot" AS snapshot
         WHERE snapshot."intakeId" = NEW."id"
           AND snapshot."workspaceId" = NEW."workspaceId"
           AND snapshot."projectId" = NEW."projectId"
           AND snapshot."stateVersion" = NEW."stateVersion"
           AND snapshot."status" = 'PROPOSED'
           AND snapshot."canonicalHash" = NEW."reviewFingerprint"
       ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainIntake review transition requires its immutable proposed snapshot';
    END IF;
  ELSIF NEW."status" = 'CONFIRMED' THEN
    IF matching_decision."snapshotHash" IS DISTINCT FROM NEW."reviewFingerprint"
       OR NOT EXISTS (
         SELECT 1
         FROM "ConstructionProjectBrainSnapshot" AS confirmed_snapshot
         WHERE confirmed_snapshot."intakeId" = NEW."id"
           AND confirmed_snapshot."workspaceId" = NEW."workspaceId"
           AND confirmed_snapshot."projectId" = NEW."projectId"
           AND confirmed_snapshot."stateVersion" = NEW."stateVersion"
           AND confirmed_snapshot."status" = 'CONFIRMED'
           AND confirmed_snapshot."canonicalHash" = NEW."reviewFingerprint"
       ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainIntake confirmation requires its immutable confirmed snapshot';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "ConstructionProjectBrainSnapshot" AS confirmed_snapshot
      INNER JOIN "ConstructionProjectBrainSnapshot" AS proposed_snapshot
        ON proposed_snapshot."intakeId" = confirmed_snapshot."intakeId"
       AND proposed_snapshot."workspaceId" = confirmed_snapshot."workspaceId"
       AND proposed_snapshot."projectId" = confirmed_snapshot."projectId"
       AND proposed_snapshot."stateVersion" = confirmed_snapshot."stateVersion" - 1
       AND proposed_snapshot."status" = 'PROPOSED'
       AND proposed_snapshot."canonicalHash" = confirmed_snapshot."canonicalHash"
      WHERE confirmed_snapshot."intakeId" = NEW."id"
        AND confirmed_snapshot."workspaceId" = NEW."workspaceId"
        AND confirmed_snapshot."projectId" = NEW."projectId"
        AND confirmed_snapshot."stateVersion" = NEW."stateVersion"
        AND confirmed_snapshot."status" = 'CONFIRMED'
        AND confirmed_snapshot."canonicalHash" = NEW."reviewFingerprint"
        AND confirmed_snapshot."snapshot" IS NOT DISTINCT FROM proposed_snapshot."snapshot"
    ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainIntake CONFIRMED snapshot must exactly match its bound PROPOSED snapshot';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ConstructionProjectBrainIntake_atomic_evidence"
  AFTER INSERT OR UPDATE ON "ConstructionProjectBrainIntake"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainIntake_atomic_evidence_guard"();

-- Atomicity is reciprocal: immutable sidecars cannot be committed early and
-- later used to bless a separate projection mutation. Each INSERT is accepted
-- only while the intake's current projection is the exact version/status that
-- the sidecar records. Deferral preserves the service's projection-first write
-- order while making separately pre-seeded evidence fail at COMMIT.
CREATE OR REPLACE FUNCTION "ConstructionProjectBrainDecision_atomic_projection_guard"()
RETURNS TRIGGER AS $$
DECLARE
  matching_intake "ConstructionProjectBrainIntake"%ROWTYPE;
BEGIN
  SELECT intake.*
  INTO matching_intake
  FROM "ConstructionProjectBrainIntake" AS intake
  WHERE intake."id" = NEW."intakeId"
    AND intake."workspaceId" = NEW."workspaceId"
    AND intake."projectId" = NEW."projectId"
  LIMIT 1;

  IF matching_intake."id" IS NULL
     OR matching_intake."stateVersion" <> NEW."nextStateVersion" THEN
    RAISE EXCEPTION 'ConstructionProjectBrainDecision must commit with its matching intake projection';
  END IF;

  IF NEW."decision" = 'CREATE' THEN
    IF matching_intake."status" <> 'DRAFT'
       OR NEW."priorStateVersion" <> 0
       OR NEW."nextStateVersion" <> 1
       OR NEW."commandId" <> matching_intake."createCommandId"
       OR NEW."commandHash" <> matching_intake."createCommandHash"
       OR NEW."actorUserId" <> matching_intake."createdByUserId" THEN
      RAISE EXCEPTION 'ConstructionProjectBrainDecision CREATE projection mismatch';
    END IF;
  ELSIF NEW."decision" = 'ADD_OWNER_BRIEF' THEN
    IF matching_intake."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'ConstructionProjectBrainDecision owner-brief projection mismatch';
    END IF;
  ELSIF NEW."decision" = 'ADMIT_SOURCE' THEN
    IF matching_intake."status" <> 'DRAFT'
       OR NOT EXISTS (
         SELECT 1
         FROM "ConstructionProjectBrainSource" AS source
         WHERE source."intakeId" = NEW."intakeId"
           AND source."workspaceId" = NEW."workspaceId"
           AND source."projectId" = NEW."projectId"
           AND source."commandId" = NEW."commandId"
           AND source."commandHash" = NEW."commandHash"
           AND source."createdByUserId" = NEW."actorUserId"
       ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainDecision ADMIT_SOURCE projection mismatch';
    END IF;
  ELSIF NEW."decision" = 'SUBMIT_FOR_REVIEW' THEN
    IF matching_intake."status" <> 'READY_FOR_REVIEW'
       OR matching_intake."reviewFingerprint" IS DISTINCT FROM NEW."snapshotHash"
       OR NOT EXISTS (
         SELECT 1
         FROM "ConstructionProjectBrainSnapshot" AS snapshot
         WHERE snapshot."intakeId" = NEW."intakeId"
           AND snapshot."workspaceId" = NEW."workspaceId"
           AND snapshot."projectId" = NEW."projectId"
           AND snapshot."stateVersion" = NEW."nextStateVersion"
           AND snapshot."status" = 'PROPOSED'
           AND snapshot."canonicalHash" = NEW."snapshotHash"
           AND snapshot."createdByUserId" = NEW."actorUserId"
       ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainDecision review projection mismatch';
    END IF;
  ELSIF NEW."decision" = 'CONFIRM_EXACT' THEN
    IF matching_intake."status" <> 'CONFIRMED'
       OR matching_intake."reviewFingerprint" IS DISTINCT FROM NEW."snapshotHash"
       OR NOT EXISTS (
         SELECT 1
         FROM "ConstructionProjectBrainSnapshot" AS confirmed_snapshot
         INNER JOIN "ConstructionProjectBrainSnapshot" AS proposed_snapshot
           ON proposed_snapshot."intakeId" = confirmed_snapshot."intakeId"
          AND proposed_snapshot."workspaceId" = confirmed_snapshot."workspaceId"
          AND proposed_snapshot."projectId" = confirmed_snapshot."projectId"
          AND proposed_snapshot."stateVersion" = NEW."priorStateVersion"
          AND proposed_snapshot."status" = 'PROPOSED'
          AND proposed_snapshot."canonicalHash" = confirmed_snapshot."canonicalHash"
         WHERE confirmed_snapshot."intakeId" = NEW."intakeId"
           AND confirmed_snapshot."workspaceId" = NEW."workspaceId"
           AND confirmed_snapshot."projectId" = NEW."projectId"
           AND confirmed_snapshot."stateVersion" = NEW."nextStateVersion"
           AND confirmed_snapshot."status" = 'CONFIRMED'
           AND confirmed_snapshot."canonicalHash" = NEW."snapshotHash"
           AND confirmed_snapshot."createdByUserId" = NEW."actorUserId"
           AND confirmed_snapshot."snapshot" IS NOT DISTINCT FROM proposed_snapshot."snapshot"
       ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainDecision confirmation projection mismatch';
    END IF;
  ELSIF NEW."decision" = 'REJECT' THEN
    IF matching_intake."status" <> 'REJECTED' THEN
      RAISE EXCEPTION 'ConstructionProjectBrainDecision rejection projection mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'ConstructionProjectBrainDecision has no atomic projection contract';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ConstructionProjectBrainDecision_atomic_projection"
  AFTER INSERT ON "ConstructionProjectBrainDecision"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainDecision_atomic_projection_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainSource_atomic_projection_guard"()
RETURNS TRIGGER AS $$
DECLARE
  matching_file "File"%ROWTYPE;
  expected_storage_prefix TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ConstructionProjectBrainIntake" AS intake
    INNER JOIN "ConstructionProjectBrainDecision" AS decision
      ON decision."intakeId" = intake."id"
     AND decision."workspaceId" = intake."workspaceId"
     AND decision."projectId" = intake."projectId"
     AND decision."nextStateVersion" = intake."stateVersion"
    WHERE intake."id" = NEW."intakeId"
      AND intake."workspaceId" = NEW."workspaceId"
      AND intake."projectId" = NEW."projectId"
      AND intake."status" = 'DRAFT'
      AND decision."decision" = 'ADMIT_SOURCE'
      AND decision."commandId" = NEW."commandId"
      AND decision."commandHash" = NEW."commandHash"
      AND decision."actorUserId" = NEW."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainSource must commit with its matching ADMIT_SOURCE projection and decision';
  END IF;

  SELECT file.*
  INTO matching_file
  FROM "File" AS file
  WHERE file."id" = NEW."fileId"
  LIMIT 1;
  expected_storage_prefix := 'project-brain-intake/' || NEW."workspaceId" || '/' || NEW."projectId" || '/' || NEW."intakeId" || '/';

  IF matching_file."id" IS NULL
     OR (
       matching_file."uploaderId" <> NEW."createdByUserId"
       AND NOT EXISTS (
         SELECT 1
         FROM "ConstructionProjectBrainSource" AS canonical_source
         WHERE canonical_source."fileId" = NEW."fileId"
           AND canonical_source."workspaceId" = NEW."workspaceId"
           AND canonical_source."projectId" = NEW."projectId"
           AND canonical_source."intakeId" = NEW."intakeId"
           AND canonical_source."id" <> NEW."id"
       )
     )
     OR matching_file."kind"::TEXT <> 'input'
     OR matching_file."taskId" IS NOT NULL
     OR matching_file."submissionId" IS NOT NULL
     OR matching_file."workflowRunId" IS NOT NULL
     OR matching_file."workflowStepRunId" IS NOT NULL
     OR matching_file."artifactVisibility" IS NOT NULL
     OR matching_file."purgedAt" IS NOT NULL
     OR LEFT(matching_file."storageKey", LENGTH(expected_storage_prefix)) <> expected_storage_prefix
     OR matching_file."sha256" IS DISTINCT FROM NEW."contentHash"
     OR matching_file."detectedMime" IS DISTINCT FROM NEW."mimeType"
     OR matching_file."mime" IS DISTINCT FROM NEW."mimeType"
     OR matching_file."sizeBytes" <> NEW."sizeBytes"
     OR matching_file."scanStatus"::TEXT <> 'pending'
     OR matching_file."scanDetails" IS NULL
     OR LEFT(matching_file."scanDetails", LENGTH('LOCAL_SIGNATURE_SANITIZATION;')) <> 'LOCAL_SIGNATURE_SANITIZATION;'
     OR EXISTS (
       SELECT 1
       FROM "ConstructionProjectBrainSource" AS existing_source
       WHERE existing_source."fileId" = NEW."fileId"
         AND existing_source."id" <> NEW."id"
         AND (
           existing_source."workspaceId" <> NEW."workspaceId"
           OR existing_source."projectId" <> NEW."projectId"
           OR existing_source."intakeId" <> NEW."intakeId"
         )
     ) THEN
    RAISE EXCEPTION 'ConstructionProjectBrainSource File provenance mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ConstructionProjectBrainSource_atomic_projection"
  AFTER INSERT ON "ConstructionProjectBrainSource"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainSource_atomic_projection_guard"();

-- Match the application's recursive key-sorted JSON.stringify contract so an
-- immutable snapshot cannot carry an arbitrary 64-hex fingerprint. The R36V
-- snapshot contains only JSON primitives, arrays and objects; object keys are
-- ASCII contract keys and therefore use deterministic C ordering here.
CREATE OR REPLACE FUNCTION "ConstructionProjectBrainCanonicalJson"(value JSONB)
RETURNS TEXT AS $$
DECLARE
  rendered TEXT;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(
        to_json(key)::TEXT || ':' || "ConstructionProjectBrainCanonicalJson"(child),
        ',' ORDER BY key COLLATE "C"
      ), '') || '}'
      INTO rendered
      FROM jsonb_each(value) AS entry(key, child);
      RETURN rendered;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(
        "ConstructionProjectBrainCanonicalJson"(child),
        ',' ORDER BY ordinal
      ), '') || ']'
      INTO rendered
      FROM jsonb_array_elements(value) WITH ORDINALITY AS entry(child, ordinal);
      RETURN rendered;
    ELSE
      RETURN value::TEXT;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainSnapshot_atomic_projection_guard"()
RETURNS TRIGGER AS $$
DECLARE
  expected_snapshot JSONB;
  has_voice BOOLEAN;
  has_document_like BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainSource"
    WHERE "intakeId" = NEW."intakeId" AND "kind" = 'VOICE_NOTE'
  ), EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainSource"
    WHERE "intakeId" = NEW."intakeId" AND "kind" <> 'VOICE_NOTE'
  ) INTO has_voice, has_document_like;

  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'project', jsonb_build_object(
      'id', project."id",
      'code', project."code",
      'name', project."name"
    ),
    'ownerBrief', jsonb_build_object(
      'summary', intake."summary",
      'scope', intake."scope",
      'importantPeople', intake."importantPeople",
      'importantDates', intake."importantDates",
      'blockers', intake."blockers",
      'nextDecision', intake."nextDecision",
      'provenance', 'OWNER_CONFIRMED'
    ),
    'sources', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sourceId', source."id",
        'kind', source."kind",
        'displayName', source."displayName",
        'contentHash', source."contentHash",
        'transcriptionState', source."transcriptionState",
        'documentUnderstandingState', source."documentUnderstandingState"
      ) ORDER BY source."ordinal", source."id"), '[]'::JSONB)
      FROM "ConstructionProjectBrainSource" AS source
      WHERE source."intakeId" = intake."id"
        AND source."workspaceId" = intake."workspaceId"
        AND source."projectId" = intake."projectId"
    ),
    'limitations', CASE
      WHEN has_voice AND has_document_like THEN '["VOICE_NOT_TRANSCRIBED","DOCUMENT_CONTENT_NOT_INTERPRETED"]'::JSONB
      WHEN has_voice THEN '["VOICE_NOT_TRANSCRIBED"]'::JSONB
      WHEN has_document_like THEN '["DOCUMENT_CONTENT_NOT_INTERPRETED"]'::JSONB
      ELSE '[]'::JSONB
    END
  )
  INTO expected_snapshot
  FROM "ConstructionProjectBrainIntake" AS intake
  INNER JOIN "ConstructionProject" AS project
    ON project."id" = intake."projectId"
   AND project."workspaceId" = intake."workspaceId"
  WHERE intake."id" = NEW."intakeId"
    AND intake."workspaceId" = NEW."workspaceId"
    AND intake."projectId" = NEW."projectId";

  IF expected_snapshot IS NULL OR NEW."snapshot" IS DISTINCT FROM expected_snapshot THEN
    RAISE EXCEPTION 'ConstructionProjectBrainSnapshot must exactly match its relational intake and sources';
  END IF;
  IF encode(sha256(convert_to(
       "ConstructionProjectBrainCanonicalJson"(NEW."snapshot"),
       'UTF8'
     )), 'hex') <> NEW."canonicalHash" THEN
    RAISE EXCEPTION 'ConstructionProjectBrainSnapshot canonical fingerprint mismatch';
  END IF;

  IF NEW."status" = 'PROPOSED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "ConstructionProjectBrainIntake" AS intake
      INNER JOIN "ConstructionProjectBrainDecision" AS decision
        ON decision."intakeId" = intake."id"
       AND decision."workspaceId" = intake."workspaceId"
       AND decision."projectId" = intake."projectId"
       AND decision."nextStateVersion" = intake."stateVersion"
      WHERE intake."id" = NEW."intakeId"
        AND intake."workspaceId" = NEW."workspaceId"
        AND intake."projectId" = NEW."projectId"
        AND intake."status" = 'READY_FOR_REVIEW'
        AND intake."stateVersion" = NEW."stateVersion"
        AND intake."reviewFingerprint" = NEW."canonicalHash"
        AND decision."decision" = 'SUBMIT_FOR_REVIEW'
        AND decision."snapshotHash" = NEW."canonicalHash"
        AND decision."actorUserId" = NEW."createdByUserId"
    ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainSnapshot must commit with its matching intake projection and decision';
    END IF;
  ELSIF NEW."status" = 'CONFIRMED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "ConstructionProjectBrainIntake" AS intake
      INNER JOIN "ConstructionProjectBrainDecision" AS decision
        ON decision."intakeId" = intake."id"
       AND decision."workspaceId" = intake."workspaceId"
       AND decision."projectId" = intake."projectId"
       AND decision."nextStateVersion" = intake."stateVersion"
      INNER JOIN "ConstructionProjectBrainSnapshot" AS proposed_snapshot
        ON proposed_snapshot."intakeId" = intake."id"
       AND proposed_snapshot."workspaceId" = intake."workspaceId"
       AND proposed_snapshot."projectId" = intake."projectId"
       AND proposed_snapshot."stateVersion" = decision."priorStateVersion"
       AND proposed_snapshot."status" = 'PROPOSED'
       AND proposed_snapshot."canonicalHash" = NEW."canonicalHash"
      WHERE intake."id" = NEW."intakeId"
        AND intake."workspaceId" = NEW."workspaceId"
        AND intake."projectId" = NEW."projectId"
        AND intake."status" = 'CONFIRMED'
        AND intake."stateVersion" = NEW."stateVersion"
        AND intake."reviewFingerprint" = NEW."canonicalHash"
        AND decision."decision" = 'CONFIRM_EXACT'
        AND decision."snapshotHash" = NEW."canonicalHash"
        AND decision."actorUserId" = NEW."createdByUserId"
        AND NEW."snapshot" IS NOT DISTINCT FROM proposed_snapshot."snapshot"
    ) THEN
      RAISE EXCEPTION 'ConstructionProjectBrainIntake CONFIRMED snapshot must exactly match its bound PROPOSED snapshot';
    END IF;
  ELSE
    RAISE EXCEPTION 'ConstructionProjectBrainSnapshot has no atomic projection contract';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ConstructionProjectBrainSnapshot_atomic_projection"
  AFTER INSERT ON "ConstructionProjectBrainSnapshot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainSnapshot_atomic_projection_guard"();

-- Sources, snapshots and decisions are retained evidence, not mutable current
-- state. Protect them against every SQL mutation path, including TRUNCATE.
CREATE OR REPLACE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is immutable and append-only', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConstructionProjectBrainSource_immutable"
  BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainSource"
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainSource_no_truncate"
  BEFORE TRUNCATE ON "ConstructionProjectBrainSource"
  FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();

CREATE TRIGGER "ConstructionProjectBrainSnapshot_immutable"
  BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainSnapshot"
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainSnapshot_no_truncate"
  BEFORE TRUNCATE ON "ConstructionProjectBrainSnapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();

CREATE TRIGGER "ConstructionProjectBrainDecision_immutable"
  BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainDecision"
  FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainDecision_no_truncate"
  BEFORE TRUNCATE ON "ConstructionProjectBrainDecision"
  FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
