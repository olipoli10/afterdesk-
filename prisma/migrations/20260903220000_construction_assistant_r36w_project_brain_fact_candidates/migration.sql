-- R36W Project Brain Fact Candidates. Additive, forward-only and local-only.

CREATE TABLE "ConstructionProjectBrainFactCandidateBatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "confirmedSnapshotId" TEXT NOT NULL,
  "confirmedSnapshotHash" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "adapterSetVersion" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED_LOCAL',
  "candidateCount" INTEGER NOT NULL,
  "candidateSetHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainFactCandidateBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBFCB_shape_check" CHECK (
    "schemaVersion" = 1 AND
    "adapterSetVersion" = 'PROJECT_BRAIN_FACT_CANDIDATES_V1' AND
    "status" = 'COMPLETED_LOCAL' AND
    "candidateCount" BETWEEN 0 AND 146
  ),
  CONSTRAINT "CPBFCB_hashes_check" CHECK (
    "confirmedSnapshotHash" ~ '^[0-9a-f]{64}$' AND
    "commandHash" ~ '^[0-9a-f]{64}$' AND
    "candidateSetHash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE "ConstructionProjectBrainFactCandidate" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "confirmedSnapshotId" TEXT NOT NULL,
  "confirmedSnapshotHash" TEXT NOT NULL,
  "candidateFingerprint" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE_UNCONFIRMED',
  "confidenceClass" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "ownerBriefField" TEXT,
  "rangeUnit" TEXT,
  "rangeStart" INTEGER,
  "rangeEnd" INTEGER,
  "sourceId" TEXT,
  "sourceOrdinal" INTEGER,
  "sourceContentHash" TEXT,
  "metadataField" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainFactCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBFC_hashes_check" CHECK (
    "confirmedSnapshotHash" ~ '^[0-9a-f]{64}$' AND
    "candidateFingerprint" ~ '^[0-9a-f]{64}$' AND
    ("sourceContentHash" IS NULL OR "sourceContentHash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "CPBFC_status_check" CHECK ("status" = 'CANDIDATE_UNCONFIRMED'),
  CONSTRAINT "CPBFC_provenance_shape_check" CHECK (
    (
      "kind" = 'OWNER_TEXT' AND
      "adapter" = 'OWNER_BRIEF_FIELDS_V1' AND
      "confidenceClass" = 'EXACT_OWNER_TEXT' AND
      "ownerBriefField" IN ('summary','scope','importantPeople','importantDates','blockers','nextDecision') AND
      "rangeUnit" = 'UTF16_CODE_UNIT' AND
      "rangeStart" = 0 AND "rangeEnd" > 0 AND
      "sourceId" IS NULL AND "sourceOrdinal" IS NULL AND
      "sourceContentHash" IS NULL AND "metadataField" IS NULL
    ) OR (
      "kind" = 'SOURCE_METADATA' AND
      "adapter" = 'ADMITTED_SOURCE_METADATA_V1' AND
      "confidenceClass" = 'EXACT_CANONICAL_METADATA' AND
      "ownerBriefField" IS NULL AND "rangeUnit" IS NULL AND
      "rangeStart" IS NULL AND "rangeEnd" IS NULL AND
      "sourceId" IS NOT NULL AND "sourceOrdinal" BETWEEN 1 AND 20 AND
      "sourceContentHash" IS NOT NULL AND
      "metadataField" IN ('kind','displayName','mimeType','sizeBytes','durationMs','ordinal','contentHash')
    )
  )
);

CREATE TABLE "ConstructionProjectBrainFactCandidateDecision" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "confirmedSnapshotHash" TEXT NOT NULL,
  "adapterSetVersion" TEXT NOT NULL,
  "candidateSetHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "resultHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainFactCandidateDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBFCD_shape_check" CHECK (
    "decision" = 'GENERATE_FACT_CANDIDATES' AND
    "outcome" IN ('ACCEPTED','REPLAYED') AND
    "adapterSetVersion" = 'PROJECT_BRAIN_FACT_CANDIDATES_V1'
  ),
  CONSTRAINT "CPBFCD_hashes_check" CHECK (
    "commandHash" ~ '^[0-9a-f]{64}$' AND
    "confirmedSnapshotHash" ~ '^[0-9a-f]{64}$' AND
    "candidateSetHash" ~ '^[0-9a-f]{64}$' AND
    "resultHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "CPBFCD_false_effects_check" CHECK (
    "result" @> '{"providerExecutionPerformed":false,"binaryUnderstandingPerformed":false,"externalTransportPerformed":false,"externalWritePerformed":false,"automaticConfirmationPerformed":false}'::jsonb
  )
);

CREATE UNIQUE INDEX "CPBFCB_workspace_command_key" ON "ConstructionProjectBrainFactCandidateBatch"("workspaceId", "commandId");
CREATE UNIQUE INDEX "CPBFCB_input_adapter_key" ON "ConstructionProjectBrainFactCandidateBatch"("intakeId", "confirmedSnapshotId", "adapterSetVersion");
CREATE INDEX "CPBFCB_project_created_idx" ON "ConstructionProjectBrainFactCandidateBatch"("workspaceId", "projectId", "createdAt");
CREATE INDEX "CPBFCB_intake_created_idx" ON "ConstructionProjectBrainFactCandidateBatch"("intakeId", "createdAt");

CREATE UNIQUE INDEX "CPBFC_batch_fingerprint_key" ON "ConstructionProjectBrainFactCandidate"("batchId", "candidateFingerprint");
CREATE INDEX "CPBFC_tenant_intake_idx" ON "ConstructionProjectBrainFactCandidate"("workspaceId", "projectId", "intakeId");
CREATE INDEX "CPBFC_source_idx" ON "ConstructionProjectBrainFactCandidate"("sourceId");

CREATE UNIQUE INDEX "CPBFCD_workspace_command_key" ON "ConstructionProjectBrainFactCandidateDecision"("workspaceId", "commandId");
CREATE INDEX "CPBFCD_batch_outcome_idx" ON "ConstructionProjectBrainFactCandidateDecision"("batchId", "outcome");
CREATE INDEX "CPBFCD_tenant_created_idx" ON "ConstructionProjectBrainFactCandidateDecision"("workspaceId", "projectId", "intakeId", "createdAt");

ALTER TABLE "ConstructionProjectBrainFactCandidateBatch" ADD CONSTRAINT "CPBFCB_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainFactCandidateBatch" ADD CONSTRAINT "CPBFCB_project_tenant_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "ConstructionProject"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainFactCandidateBatch" ADD CONSTRAINT "CPBFCB_intake_tenant_fkey" FOREIGN KEY ("intakeId", "workspaceId", "projectId") REFERENCES "ConstructionProjectBrainIntake"("id", "workspaceId", "projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainFactCandidateBatch" ADD CONSTRAINT "CPBFCB_snapshot_fkey" FOREIGN KEY ("confirmedSnapshotId") REFERENCES "ConstructionProjectBrainSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainFactCandidateBatch" ADD CONSTRAINT "CPBFCB_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ConstructionProjectBrainFactCandidate" ADD CONSTRAINT "CPBFC_batch_fkey" FOREIGN KEY ("batchId") REFERENCES "ConstructionProjectBrainFactCandidateBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainFactCandidate" ADD CONSTRAINT "CPBFC_source_fkey" FOREIGN KEY ("sourceId") REFERENCES "ConstructionProjectBrainSource"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ConstructionProjectBrainFactCandidateDecision" ADD CONSTRAINT "CPBFCD_batch_fkey" FOREIGN KEY ("batchId") REFERENCES "ConstructionProjectBrainFactCandidateBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainFactCandidateDecision" ADD CONSTRAINT "CPBFCD_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainFactCandidate_batch_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ConstructionProjectBrainIntake" intake
    INNER JOIN "ConstructionProjectBrainSnapshot" snapshot
      ON snapshot."id" = NEW."confirmedSnapshotId"
     AND snapshot."intakeId" = intake."id"
     AND snapshot."workspaceId" = intake."workspaceId"
     AND snapshot."projectId" = intake."projectId"
    WHERE intake."id" = NEW."intakeId"
      AND intake."workspaceId" = NEW."workspaceId"
      AND intake."projectId" = NEW."projectId"
      AND intake."status" = 'CONFIRMED'
      AND snapshot."status" = 'CONFIRMED'
      AND snapshot."canonicalHash" = NEW."confirmedSnapshotHash"
      AND intake."reviewFingerprint" = NEW."confirmedSnapshotHash"
  ) THEN
    RAISE EXCEPTION 'Fact candidate batch requires its exact confirmed intake snapshot';
  END IF;
  IF (SELECT count(*) FROM "ConstructionProjectBrainFactCandidate" candidate WHERE candidate."batchId" = NEW."id") <> NEW."candidateCount" THEN
    RAISE EXCEPTION 'Fact candidate batch count is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainFactCandidateDecision" decision
    WHERE decision."batchId" = NEW."id"
      AND decision."workspaceId" = NEW."workspaceId"
      AND decision."projectId" = NEW."projectId"
      AND decision."intakeId" = NEW."intakeId"
      AND decision."commandId" = NEW."commandId"
      AND decision."commandHash" = NEW."commandHash"
      AND decision."candidateSetHash" = NEW."candidateSetHash"
      AND decision."confirmedSnapshotHash" = NEW."confirmedSnapshotHash"
  ) THEN
    RAISE EXCEPTION 'Fact candidate batch requires its atomic decision receipt';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBFCB_atomic_guard" AFTER INSERT ON "ConstructionProjectBrainFactCandidateBatch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainFactCandidate_batch_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainFactCandidate_candidate_guard"()
RETURNS TRIGGER AS $$
DECLARE
  expected_value TEXT;
  expected_utf16_units INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainFactCandidateBatch" batch
    WHERE batch."id" = NEW."batchId"
      AND batch."workspaceId" = NEW."workspaceId"
      AND batch."projectId" = NEW."projectId"
      AND batch."intakeId" = NEW."intakeId"
      AND batch."confirmedSnapshotId" = NEW."confirmedSnapshotId"
      AND batch."confirmedSnapshotHash" = NEW."confirmedSnapshotHash"
  ) THEN
    RAISE EXCEPTION 'Fact candidate tenant or snapshot binding mismatch';
  END IF;
  IF NEW."kind" = 'OWNER_TEXT' THEN
    SELECT snapshot."snapshot"->'ownerBrief'->>NEW."ownerBriefField" INTO expected_value
    FROM "ConstructionProjectBrainSnapshot" snapshot
    WHERE snapshot."id" = NEW."confirmedSnapshotId" AND snapshot."status" = 'CONFIRMED';
    SELECT COALESCE(sum(CASE WHEN ascii(character) > 65535 THEN 2 ELSE 1 END), 0)::INTEGER
      INTO expected_utf16_units
      FROM regexp_split_to_table(expected_value, '') AS characters(character);
    IF expected_value IS NULL OR NEW."rangeEnd" <> expected_utf16_units OR NEW."value" IS DISTINCT FROM expected_value THEN
      RAISE EXCEPTION 'Fact candidate text range does not reconstruct its exact value';
    END IF;
  ELSE
    SELECT CASE NEW."metadataField"
      WHEN 'kind' THEN source."kind"
      WHEN 'displayName' THEN source."displayName"
      WHEN 'mimeType' THEN source."mimeType"
      WHEN 'sizeBytes' THEN source."sizeBytes"::TEXT
      WHEN 'durationMs' THEN source."durationMs"::TEXT
      WHEN 'ordinal' THEN source."ordinal"::TEXT
      WHEN 'contentHash' THEN source."contentHash"
    END INTO expected_value
    FROM "ConstructionProjectBrainSource" source
    WHERE source."id" = NEW."sourceId"
      AND source."workspaceId" = NEW."workspaceId"
      AND source."projectId" = NEW."projectId"
      AND source."intakeId" = NEW."intakeId"
      AND source."ordinal" = NEW."sourceOrdinal"
      AND source."contentHash" = NEW."sourceContentHash";
    IF expected_value IS NULL OR NEW."value" IS DISTINCT FROM expected_value THEN
      RAISE EXCEPTION 'Fact candidate metadata does not equal its canonical source';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBFC_canonical_guard" AFTER INSERT ON "ConstructionProjectBrainFactCandidate" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainFactCandidate_candidate_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainFactCandidate_decision_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainFactCandidateBatch" batch
    WHERE batch."id" = NEW."batchId"
      AND batch."workspaceId" = NEW."workspaceId"
      AND batch."projectId" = NEW."projectId"
      AND batch."intakeId" = NEW."intakeId"
      AND batch."confirmedSnapshotHash" = NEW."confirmedSnapshotHash"
      AND batch."adapterSetVersion" = NEW."adapterSetVersion"
      AND batch."candidateSetHash" = NEW."candidateSetHash"
      AND (
        (NEW."outcome" = 'ACCEPTED' AND batch."commandId" = NEW."commandId" AND batch."commandHash" = NEW."commandHash")
        OR NEW."outcome" = 'REPLAYED'
      )
  ) THEN
    RAISE EXCEPTION 'Fact candidate decision does not match its batch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBFCD_atomic_guard" AFTER INSERT ON "ConstructionProjectBrainFactCandidateDecision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainFactCandidate_decision_guard"();

CREATE TRIGGER "ConstructionProjectBrainFactCandidateBatch_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainFactCandidateBatch" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainFactCandidateBatch_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainFactCandidateBatch" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainFactCandidate_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainFactCandidate" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainFactCandidate_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainFactCandidate" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainFactCandidateDecision_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainFactCandidateDecision" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "ConstructionProjectBrainFactCandidateDecision_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainFactCandidateDecision" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
