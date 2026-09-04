-- R36X Project Brain Understanding Review. Additive, forward-only and local-only.

CREATE TABLE "ConstructionProjectBrainUnderstandingReview" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL, "confirmedIntakeSnapshotId" TEXT NOT NULL,
  "candidateBatchId" TEXT NOT NULL, "candidateSetHash" TEXT NOT NULL,
  "reviewSequence" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "confirmedUnderstandingSequence" INTEGER, "stateVersion" INTEGER NOT NULL DEFAULT 1,
  "reviewFingerprint" TEXT, "createCommandId" TEXT NOT NULL, "createCommandHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL, "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionProjectBrainUnderstandingReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBUR_status_check" CHECK ("status" IN ('DRAFT','READY_FOR_CONFIRMATION','CONFIRMED')),
  CONSTRAINT "CPBUR_versions_check" CHECK ("reviewSequence" > 0 AND "stateVersion" > 0),
  CONSTRAINT "CPBUR_hashes_check" CHECK ("candidateSetHash" ~ '^[0-9a-f]{64}$' AND "createCommandHash" ~ '^[0-9a-f]{64}$' AND ("reviewFingerprint" IS NULL OR "reviewFingerprint" ~ '^[0-9a-f]{64}$')),
  CONSTRAINT "CPBUR_state_shape_check" CHECK (
    ("status" = 'DRAFT' AND "confirmedUnderstandingSequence" IS NULL AND "confirmedAt" IS NULL) OR
    ("status" = 'READY_FOR_CONFIRMATION' AND "reviewFingerprint" IS NOT NULL AND "confirmedUnderstandingSequence" IS NULL AND "confirmedAt" IS NULL) OR
    ("status" = 'CONFIRMED' AND "reviewFingerprint" IS NOT NULL AND "confirmedUnderstandingSequence" > 0 AND "confirmedAt" IS NOT NULL)
  )
);

CREATE TABLE "ConstructionProjectBrainCandidateDisposition" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "candidateId" TEXT NOT NULL, "disposition" TEXT NOT NULL,
  "priorStateVersion" INTEGER NOT NULL, "nextStateVersion" INTEGER NOT NULL,
  "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainCandidateDisposition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBUDisp_disposition_check" CHECK ("disposition" IN ('ACCEPT_AS_REVIEWED','REJECT_AS_UNSUPPORTED','RETAIN_FOR_CONTRADICTION')),
  CONSTRAINT "CPBUDisp_version_check" CHECK ("priorStateVersion" > 0 AND "nextStateVersion" = "priorStateVersion" + 1),
  CONSTRAINT "CPBUDisp_hash_check" CHECK ("commandHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainContradiction" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "groupSequence" INTEGER NOT NULL,
  "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainContradiction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBUContr_sequence_check" CHECK ("groupSequence" > 0),
  CONSTRAINT "CPBUContr_hash_check" CHECK ("commandHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainContradictionMember" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "contradictionId" TEXT NOT NULL, "candidateId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainContradictionMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBUCM_ordinal_check" CHECK ("ordinal" > 0)
);

CREATE TABLE "ConstructionProjectBrainContradictionResolution" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "contradictionId" TEXT NOT NULL, "mode" TEXT NOT NULL,
  "selectedCandidateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "ownerResolutionText" TEXT,
  "provenance" TEXT NOT NULL, "priorStateVersion" INTEGER NOT NULL, "nextStateVersion" INTEGER NOT NULL,
  "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainContradictionResolution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBURes_version_check" CHECK ("priorStateVersion" > 0 AND "nextStateVersion" = "priorStateVersion" + 1),
  CONSTRAINT "CPBURes_hash_check" CHECK ("commandHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CPBURes_shape_check" CHECK (
    ("mode" = 'SELECT_SUPPORTED_CANDIDATES' AND cardinality("selectedCandidateIds") > 0 AND "ownerResolutionText" IS NULL AND "provenance" = 'OWNER_DECISION') OR
    ("mode" = 'REJECT_ALL_UNSUPPORTED' AND cardinality("selectedCandidateIds") = 0 AND "ownerResolutionText" IS NULL AND "provenance" = 'OWNER_DECISION') OR
    ("mode" = 'OWNER_RESOLUTION' AND cardinality("selectedCandidateIds") = 0 AND length(btrim(COALESCE("ownerResolutionText",''))) BETWEEN 1 AND 4000 AND "provenance" = 'OWNER_RESOLUTION')
  )
);

CREATE TABLE "ConstructionProjectBrainUnderstandingSnapshot" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "intakeId" TEXT NOT NULL, "confirmedIntakeSnapshotId" TEXT NOT NULL,
  "candidateBatchId" TEXT NOT NULL, "stateVersion" INTEGER NOT NULL, "status" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL, "canonicalHash" TEXT NOT NULL, "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainUnderstandingSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBUSnap_status_check" CHECK ("status" IN ('PROPOSED','CONFIRMED')),
  CONSTRAINT "CPBUSnap_version_check" CHECK ("stateVersion" > 0),
  CONSTRAINT "CPBUSnap_hash_check" CHECK ("canonicalHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainUnderstandingDecision" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL, "priorStateVersion" INTEGER NOT NULL, "nextStateVersion" INTEGER NOT NULL,
  "snapshotHash" TEXT, "result" JSONB NOT NULL, "resultHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainUnderstandingDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBUDec_decision_check" CHECK ("decision" IN ('CREATE_REVIEW','DISPOSITION_CANDIDATE','DECLARE_CONTRADICTION','RESOLVE_CONTRADICTION','PREPARE_UNDERSTANDING','CONFIRM_EXACT_UNDERSTANDING')),
  CONSTRAINT "CPBUDec_version_check" CHECK ("priorStateVersion" >= 0 AND "nextStateVersion" = "priorStateVersion" + 1),
  CONSTRAINT "CPBUDec_hash_check" CHECK ("commandHash" ~ '^[0-9a-f]{64}$' AND "resultHash" ~ '^[0-9a-f]{64}$' AND ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$')),
  CONSTRAINT "CPBUDec_false_effects_check" CHECK ("result" @> '{"falseEffects":{"providerExecutionPerformed":false,"binaryUnderstandingPerformed":false,"externalTransportPerformed":false,"externalWritePerformed":false,"automaticResolutionPerformed":false,"automaticConfirmationPerformed":false}}'::jsonb)
);

CREATE UNIQUE INDEX "CPBUR_candidate_batch_key" ON "ConstructionProjectBrainUnderstandingReview"("candidateBatchId");
CREATE UNIQUE INDEX "CPBUR_workspace_command_key" ON "ConstructionProjectBrainUnderstandingReview"("workspaceId","createCommandId");
CREATE UNIQUE INDEX "CPBUR_project_sequence_key" ON "ConstructionProjectBrainUnderstandingReview"("workspaceId","projectId","reviewSequence");
CREATE UNIQUE INDEX "CPBUR_tenant_identity_key" ON "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId");
CREATE UNIQUE INDEX "CPBUR_confirmed_sequence_key" ON "ConstructionProjectBrainUnderstandingReview"("projectId","confirmedUnderstandingSequence");
CREATE INDEX "CPBUR_project_status_idx" ON "ConstructionProjectBrainUnderstandingReview"("workspaceId","projectId","status");
CREATE UNIQUE INDEX "CPBUDisp_review_version_key" ON "ConstructionProjectBrainCandidateDisposition"("reviewId","nextStateVersion");
CREATE INDEX "CPBUDisp_current_idx" ON "ConstructionProjectBrainCandidateDisposition"("reviewId","candidateId","nextStateVersion");
CREATE UNIQUE INDEX "CPBUContr_review_sequence_key" ON "ConstructionProjectBrainContradiction"("reviewId","groupSequence");
CREATE UNIQUE INDEX "CPBUContr_review_identity_key" ON "ConstructionProjectBrainContradiction"("id","reviewId");
CREATE UNIQUE INDEX "CPBUCM_contradiction_candidate_key" ON "ConstructionProjectBrainContradictionMember"("contradictionId","candidateId");
CREATE UNIQUE INDEX "CPBUCM_contradiction_ordinal_key" ON "ConstructionProjectBrainContradictionMember"("contradictionId","ordinal");
CREATE INDEX "CPBUCM_review_candidate_idx" ON "ConstructionProjectBrainContradictionMember"("reviewId","candidateId");
CREATE UNIQUE INDEX "CPBURes_review_version_key" ON "ConstructionProjectBrainContradictionResolution"("reviewId","nextStateVersion");
CREATE INDEX "CPBURes_current_idx" ON "ConstructionProjectBrainContradictionResolution"("contradictionId","nextStateVersion");
CREATE UNIQUE INDEX "CPBUSnap_version_status_key" ON "ConstructionProjectBrainUnderstandingSnapshot"("reviewId","stateVersion","status");
CREATE INDEX "CPBUSnap_project_status_idx" ON "ConstructionProjectBrainUnderstandingSnapshot"("workspaceId","projectId","status");
CREATE UNIQUE INDEX "CPBUDec_workspace_command_key" ON "ConstructionProjectBrainUnderstandingDecision"("workspaceId","commandId");
CREATE UNIQUE INDEX "CPBUDec_review_version_key" ON "ConstructionProjectBrainUnderstandingDecision"("reviewId","nextStateVersion");
CREATE INDEX "CPBUDec_project_created_idx" ON "ConstructionProjectBrainUnderstandingDecision"("workspaceId","projectId","createdAt");

ALTER TABLE "ConstructionProjectBrainUnderstandingReview" ADD CONSTRAINT "CPBUR_workspace_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingReview" ADD CONSTRAINT "CPBUR_project_tenant_fkey" FOREIGN KEY ("projectId","workspaceId") REFERENCES "ConstructionProject"("id","workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingReview" ADD CONSTRAINT "CPBUR_intake_tenant_fkey" FOREIGN KEY ("intakeId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainIntake"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingReview" ADD CONSTRAINT "CPBUR_snapshot_fkey" FOREIGN KEY ("confirmedIntakeSnapshotId") REFERENCES "ConstructionProjectBrainSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingReview" ADD CONSTRAINT "CPBUR_batch_fkey" FOREIGN KEY ("candidateBatchId") REFERENCES "ConstructionProjectBrainFactCandidateBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingReview" ADD CONSTRAINT "CPBUR_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainCandidateDisposition" ADD CONSTRAINT "CPBUDisp_review_tenant_fkey" FOREIGN KEY ("reviewId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainCandidateDisposition" ADD CONSTRAINT "CPBUDisp_candidate_fkey" FOREIGN KEY ("candidateId") REFERENCES "ConstructionProjectBrainFactCandidate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainCandidateDisposition" ADD CONSTRAINT "CPBUDisp_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradiction" ADD CONSTRAINT "CPBUContr_review_tenant_fkey" FOREIGN KEY ("reviewId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradiction" ADD CONSTRAINT "CPBUContr_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradictionMember" ADD CONSTRAINT "CPBUCM_review_tenant_fkey" FOREIGN KEY ("reviewId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradictionMember" ADD CONSTRAINT "CPBUCM_contradiction_review_fkey" FOREIGN KEY ("contradictionId","reviewId") REFERENCES "ConstructionProjectBrainContradiction"("id","reviewId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradictionMember" ADD CONSTRAINT "CPBUCM_candidate_fkey" FOREIGN KEY ("candidateId") REFERENCES "ConstructionProjectBrainFactCandidate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradictionResolution" ADD CONSTRAINT "CPBURes_review_tenant_fkey" FOREIGN KEY ("reviewId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradictionResolution" ADD CONSTRAINT "CPBURes_contradiction_review_fkey" FOREIGN KEY ("contradictionId","reviewId") REFERENCES "ConstructionProjectBrainContradiction"("id","reviewId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainContradictionResolution" ADD CONSTRAINT "CPBURes_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingSnapshot" ADD CONSTRAINT "CPBUSnap_review_tenant_fkey" FOREIGN KEY ("reviewId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingSnapshot" ADD CONSTRAINT "CPBUSnap_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingDecision" ADD CONSTRAINT "CPBUDec_review_tenant_fkey" FOREIGN KEY ("reviewId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainUnderstandingReview"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainUnderstandingDecision" ADD CONSTRAINT "CPBUDec_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainUnderstanding_member_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainUnderstandingReview" review
    JOIN "ConstructionProjectBrainFactCandidate" candidate ON candidate."id" = NEW."candidateId" AND candidate."batchId" = review."candidateBatchId"
    WHERE review."id" = NEW."reviewId" AND review."workspaceId" = NEW."workspaceId" AND review."projectId" = NEW."projectId"
  ) THEN RAISE EXCEPTION 'Understanding member candidate is outside the exact review batch'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBUCM_candidate_guard" AFTER INSERT ON "ConstructionProjectBrainContradictionMember" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainUnderstanding_member_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainUnderstanding_contradiction_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM "ConstructionProjectBrainContradictionMember" WHERE "contradictionId" = NEW."id") < 2 THEN
    RAISE EXCEPTION 'Understanding contradiction requires at least two members';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBUContr_completeness_guard" AFTER INSERT ON "ConstructionProjectBrainContradiction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainUnderstanding_contradiction_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainUnderstanding_resolution_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."mode" = 'SELECT_SUPPORTED_CANDIDATES' AND EXISTS (
    SELECT 1 FROM unnest(NEW."selectedCandidateIds") selected("candidateId")
    WHERE NOT EXISTS (SELECT 1 FROM "ConstructionProjectBrainContradictionMember" member WHERE member."contradictionId" = NEW."contradictionId" AND member."candidateId" = selected."candidateId")
  ) THEN RAISE EXCEPTION 'Understanding resolution selected a non-member'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBURes_member_guard" AFTER INSERT ON "ConstructionProjectBrainContradictionResolution" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainUnderstanding_resolution_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainUnderstanding_review_update_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'CONFIRMED' THEN RAISE EXCEPTION 'Confirmed understanding review is immutable'; END IF;
  IF NEW."stateVersion" <> OLD."stateVersion" + 1 THEN RAISE EXCEPTION 'Understanding review version must advance exactly once'; END IF;
  IF ROW(NEW."id",NEW."workspaceId",NEW."projectId",NEW."intakeId",NEW."confirmedIntakeSnapshotId",NEW."candidateBatchId",NEW."candidateSetHash",NEW."reviewSequence",NEW."createCommandId",NEW."createCommandHash",NEW."createdByUserId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."workspaceId",OLD."projectId",OLD."intakeId",OLD."confirmedIntakeSnapshotId",OLD."candidateBatchId",OLD."candidateSetHash",OLD."reviewSequence",OLD."createCommandId",OLD."createCommandHash",OLD."createdByUserId",OLD."createdAt") THEN
    RAISE EXCEPTION 'Understanding review identity is immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CPBUR_update_guard" BEFORE UPDATE ON "ConstructionProjectBrainUnderstandingReview" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainUnderstanding_review_update_guard"();
CREATE TRIGGER "CPBUR_no_delete" BEFORE DELETE ON "ConstructionProjectBrainUnderstandingReview" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUR_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainUnderstandingReview" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();

CREATE TRIGGER "CPBUDisp_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainCandidateDisposition" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUDisp_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainCandidateDisposition" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUContr_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainContradiction" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUContr_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainContradiction" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUCM_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainContradictionMember" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUCM_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainContradictionMember" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBURes_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainContradictionResolution" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBURes_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainContradictionResolution" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUSnap_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainUnderstandingSnapshot" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUSnap_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainUnderstandingSnapshot" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUDec_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainUnderstandingDecision" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
CREATE TRIGGER "CPBUDec_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainUnderstandingDecision" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainHistory_immutable_guard"();
