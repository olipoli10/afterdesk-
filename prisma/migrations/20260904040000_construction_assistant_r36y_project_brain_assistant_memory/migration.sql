-- R36Y Project Brain Assistant Memory. Additive, forward-only and local-only.

CREATE TABLE "ConstructionProjectBrainRecallReceipt" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "understandingReviewId" TEXT NOT NULL, "confirmedUnderstandingSnapshotId" TEXT NOT NULL,
  "confirmedUnderstandingSequence" INTEGER NOT NULL, "memoryCanonicalHash" TEXT NOT NULL,
  "questionKind" TEXT NOT NULL, "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1, "result" JSONB NOT NULL, "resultHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainRecallReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBRR_question_check" CHECK ("questionKind" IN ('PROJECT_SUMMARY','PROJECT_SCOPE','IMPORTANT_PEOPLE','IMPORTANT_DATES','BLOCKERS','NEXT_DECISION','REVIEWED_SOURCE_INVENTORY','RESOLVED_CONTRADICTION_HISTORY')),
  CONSTRAINT "CPBRR_shape_check" CHECK ("confirmedUnderstandingSequence" > 0 AND "schemaVersion" = 1 AND "memoryCanonicalHash" ~ '^[0-9a-f]{64}$' AND "commandHash" ~ '^[0-9a-f]{64}$' AND "resultHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainPreparedActionBinding" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "understandingReviewId" TEXT NOT NULL, "confirmedUnderstandingSnapshotId" TEXT NOT NULL,
  "confirmedUnderstandingSequence" INTEGER NOT NULL, "memoryCanonicalHash" TEXT NOT NULL,
  "family" TEXT NOT NULL, "familyEntityId" TEXT NOT NULL, "familyEntityVersion" INTEGER NOT NULL,
  "payloadFingerprint" TEXT NOT NULL, "recipientContactId" TEXT NOT NULL,
  "recipientDisplayName" TEXT NOT NULL, "recipientRef" TEXT NOT NULL, "channel" TEXT NOT NULL,
  "subject" TEXT, "body" TEXT NOT NULL, "frozenContentHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREPARED_UNSENT', "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  "requiredApprovingRole" TEXT NOT NULL, "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainPreparedActionBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBPAB_family_check" CHECK ("family" IN ('OPEN_LOOP_EVIDENCE_REQUEST','SMS_MMS','VOICE_CALL','EMAIL')),
  CONSTRAINT "CPBPAB_channel_check" CHECK ("channel" IN ('SMS','MMS','VOICE','EMAIL')),
  CONSTRAINT "CPBPAB_state_check" CHECK ("confirmedUnderstandingSequence" > 0 AND "familyEntityVersion" > 0 AND "status" = 'PREPARED_UNSENT' AND "approvalRequired"),
  CONSTRAINT "CPBPAB_hash_check" CHECK ("memoryCanonicalHash" ~ '^[0-9a-f]{64}$' AND "payloadFingerprint" ~ '^[0-9a-f]{64}$' AND "frozenContentHash" ~ '^[0-9a-f]{64}$' AND "commandHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainMemoryCitation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "recallReceiptId" TEXT, "preparedActionBindingId" TEXT, "ordinal" INTEGER NOT NULL,
  "citationKind" TEXT NOT NULL, "understandingReviewId" TEXT NOT NULL,
  "confirmedUnderstandingSnapshotId" TEXT NOT NULL, "confirmationDecisionId" TEXT NOT NULL,
  "dispositionId" TEXT, "resolutionId" TEXT, "candidateId" TEXT,
  "candidateBatchId" TEXT NOT NULL, "intakeId" TEXT NOT NULL,
  "confirmedIntakeSnapshotId" TEXT, "sourceId" TEXT, "provenanceFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainMemoryCitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBMC_parent_check" CHECK (("recallReceiptId" IS NOT NULL)::int + ("preparedActionBindingId" IS NOT NULL)::int = 1),
  CONSTRAINT "CPBMC_kind_check" CHECK ("citationKind" IN ('REVIEWED_CANDIDATE','OWNER_RESOLUTION','SOURCE_METADATA')),
  CONSTRAINT "CPBMC_shape_check" CHECK ("ordinal" > 0 AND "provenanceFingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ConstructionProjectBrainAssistantDecision" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL, "commandHash" TEXT NOT NULL, "action" TEXT NOT NULL,
  "questionKind" TEXT, "family" TEXT, "confirmedUnderstandingSequence" INTEGER NOT NULL,
  "memoryCanonicalHash" TEXT NOT NULL, "entityId" TEXT NOT NULL, "resultHash" TEXT NOT NULL,
  "outcome" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionProjectBrainAssistantDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CPBAD_action_check" CHECK ("action" IN ('RECALL_CONFIRMED_PROJECT_MEMORY','PREPARE_CONFIRMED_MEMORY_PROJECT_ACTION')),
  CONSTRAINT "CPBAD_outcome_check" CHECK ("outcome" IN ('ANSWERED_FROM_CONFIRMED_MEMORY','PREPARED_UNSENT')),
  CONSTRAINT "CPBAD_hash_check" CHECK ("confirmedUnderstandingSequence" > 0 AND "memoryCanonicalHash" ~ '^[0-9a-f]{64}$' AND "commandHash" ~ '^[0-9a-f]{64}$' AND "resultHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "CPBRR_workspace_command_key" ON "ConstructionProjectBrainRecallReceipt"("workspaceId","commandId");
CREATE UNIQUE INDEX "CPBRR_tenant_identity_key" ON "ConstructionProjectBrainRecallReceipt"("id","workspaceId","projectId");
CREATE INDEX "CPBRR_project_created_idx" ON "ConstructionProjectBrainRecallReceipt"("workspaceId","projectId","createdAt");
CREATE UNIQUE INDEX "CPBPAB_workspace_command_key" ON "ConstructionProjectBrainPreparedActionBinding"("workspaceId","commandId");
CREATE UNIQUE INDEX "CPBPAB_tenant_identity_key" ON "ConstructionProjectBrainPreparedActionBinding"("id","workspaceId","projectId");
CREATE UNIQUE INDEX "CPBPAB_family_entity_key" ON "ConstructionProjectBrainPreparedActionBinding"("family","familyEntityId");
CREATE INDEX "CPBPAB_project_created_idx" ON "ConstructionProjectBrainPreparedActionBinding"("workspaceId","projectId","createdAt");
CREATE UNIQUE INDEX "CPBMC_recall_ordinal_key" ON "ConstructionProjectBrainMemoryCitation"("recallReceiptId","ordinal");
CREATE UNIQUE INDEX "CPBMC_binding_ordinal_key" ON "ConstructionProjectBrainMemoryCitation"("preparedActionBindingId","ordinal");
CREATE INDEX "CPBMC_memory_idx" ON "ConstructionProjectBrainMemoryCitation"("workspaceId","projectId","confirmedUnderstandingSnapshotId");
CREATE UNIQUE INDEX "CPBAD_workspace_command_key" ON "ConstructionProjectBrainAssistantDecision"("workspaceId","commandId");
CREATE INDEX "CPBAD_project_created_idx" ON "ConstructionProjectBrainAssistantDecision"("workspaceId","projectId","createdAt");

ALTER TABLE "ConstructionProjectBrainRecallReceipt" ADD CONSTRAINT "CPBRR_memory_fkey" FOREIGN KEY ("confirmedUnderstandingSnapshotId") REFERENCES "ConstructionProjectBrainUnderstandingSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainRecallReceipt" ADD CONSTRAINT "CPBRR_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainPreparedActionBinding" ADD CONSTRAINT "CPBPAB_memory_fkey" FOREIGN KEY ("confirmedUnderstandingSnapshotId") REFERENCES "ConstructionProjectBrainUnderstandingSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainPreparedActionBinding" ADD CONSTRAINT "CPBPAB_contact_fkey" FOREIGN KEY ("recipientContactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainPreparedActionBinding" ADD CONSTRAINT "CPBPAB_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainMemoryCitation" ADD CONSTRAINT "CPBMC_recall_tenant_fkey" FOREIGN KEY ("recallReceiptId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainRecallReceipt"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainMemoryCitation" ADD CONSTRAINT "CPBMC_binding_tenant_fkey" FOREIGN KEY ("preparedActionBindingId","workspaceId","projectId") REFERENCES "ConstructionProjectBrainPreparedActionBinding"("id","workspaceId","projectId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainMemoryCitation" ADD CONSTRAINT "CPBMC_memory_fkey" FOREIGN KEY ("confirmedUnderstandingSnapshotId") REFERENCES "ConstructionProjectBrainUnderstandingSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainMemoryCitation" ADD CONSTRAINT "CPBMC_decision_fkey" FOREIGN KEY ("confirmationDecisionId") REFERENCES "ConstructionProjectBrainUnderstandingDecision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ConstructionProjectBrainAssistantDecision" ADD CONSTRAINT "CPBAD_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainAssistantMemory_binding_guard"() RETURNS TRIGGER AS $$
DECLARE review_status TEXT; review_sequence INTEGER; review_hash TEXT; snapshot_status TEXT; snapshot_hash TEXT; snapshot_review TEXT;
BEGIN
  SELECT r."status", r."confirmedUnderstandingSequence", r."reviewFingerprint", s."status", s."canonicalHash", s."reviewId"
  INTO review_status, review_sequence, review_hash, snapshot_status, snapshot_hash, snapshot_review
  FROM "ConstructionProjectBrainUnderstandingReview" r
  JOIN "ConstructionProjectBrainUnderstandingSnapshot" s ON s."id" = NEW."confirmedUnderstandingSnapshotId"
  WHERE r."id" = NEW."understandingReviewId" AND r."workspaceId" = NEW."workspaceId" AND r."projectId" = NEW."projectId";
  IF review_status IS DISTINCT FROM 'CONFIRMED' OR snapshot_status IS DISTINCT FROM 'CONFIRMED'
     OR snapshot_review IS DISTINCT FROM NEW."understandingReviewId"
     OR review_sequence IS DISTINCT FROM NEW."confirmedUnderstandingSequence"
     OR review_hash IS DISTINCT FROM NEW."memoryCanonicalHash" OR snapshot_hash IS DISTINCT FROM NEW."memoryCanonicalHash"
  THEN RAISE EXCEPTION 'R36Y confirmed memory binding is invalid'; END IF;
  IF TG_TABLE_NAME = 'ConstructionProjectBrainPreparedActionBinding' THEN
    IF NEW."family" IN ('OPEN_LOOP_EVIDENCE_REQUEST','SMS_MMS') AND NOT EXISTS (
      SELECT 1 FROM "ConstructionAction" a
      WHERE a."id" = NEW."familyEntityId" AND a."workspaceId" = NEW."workspaceId"
        AND a."projectId" = NEW."projectId" AND a."contactId" = NEW."recipientContactId"
        AND a."version" = NEW."familyEntityVersion" AND a."payloadHash" = NEW."payloadFingerprint"
        AND a."status" = 'proposed' AND a."approvalRequired"
        AND a."payload"->>'channel' = NEW."channel" AND a."payload"->>'body' = NEW."body"
        AND a."payload"->>'normalizedRecipient' = NEW."recipientRef"
    ) THEN RAISE EXCEPTION 'R36Y prepared action reciprocity is invalid'; END IF;
    IF NEW."family" = 'VOICE_CALL' AND NOT EXISTS (
      SELECT 1 FROM "ConstructionCallWork" c
      WHERE c."id" = NEW."familyEntityId" AND c."workspaceId" = NEW."workspaceId"
        AND c."projectId" = NEW."projectId" AND c."contactId" = NEW."recipientContactId"
        AND c."recipientRef" = NEW."recipientRef" AND c."objective" = NEW."body"
        AND c."status" = 'PREPARED_UNSENT' AND NOT c."externalTransportPerformed" AND NEW."familyEntityVersion" = 1
    ) THEN RAISE EXCEPTION 'R36Y prepared voice reciprocity is invalid'; END IF;
    IF NEW."family" = 'EMAIL' AND NOT EXISTS (
      SELECT 1 FROM "ConstructionEmailDraft" e
      WHERE e."id" = NEW."familyEntityId" AND e."workspaceId" = NEW."workspaceId"
        AND e."projectId" = NEW."projectId" AND e."contactId" = NEW."recipientContactId"
        AND e."toRef" = NEW."recipientRef" AND e."subject" = NEW."subject" AND e."body" = NEW."body"
        AND e."version" = NEW."familyEntityVersion" AND e."payloadHash" = NEW."payloadFingerprint"
        AND e."status" = 'PREPARED_UNSENT' AND NOT e."externalTransportPerformed"
    ) THEN RAISE EXCEPTION 'R36Y prepared email reciprocity is invalid'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CPBRR_memory_guard" AFTER INSERT ON "ConstructionProjectBrainRecallReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_binding_guard"();
CREATE CONSTRAINT TRIGGER "CPBPAB_memory_guard" AFTER INSERT ON "ConstructionProjectBrainPreparedActionBinding" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_binding_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainMemoryCitation_guard"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainRecallReceipt" p
    WHERE p."id" = NEW."recallReceiptId" AND p."understandingReviewId" = NEW."understandingReviewId"
      AND p."confirmedUnderstandingSnapshotId" = NEW."confirmedUnderstandingSnapshotId"
      AND p."workspaceId" = NEW."workspaceId" AND p."projectId" = NEW."projectId"
    UNION ALL
    SELECT 1 FROM "ConstructionProjectBrainPreparedActionBinding" p
    WHERE p."id" = NEW."preparedActionBindingId" AND p."understandingReviewId" = NEW."understandingReviewId"
      AND p."confirmedUnderstandingSnapshotId" = NEW."confirmedUnderstandingSnapshotId"
      AND p."workspaceId" = NEW."workspaceId" AND p."projectId" = NEW."projectId"
  ) THEN RAISE EXCEPTION 'R36Y citation parent memory is mismatched'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainUnderstandingSnapshot" s
    JOIN "ConstructionProjectBrainUnderstandingReview" r ON r."id" = s."reviewId"
    JOIN "ConstructionProjectBrainUnderstandingDecision" d ON d."id" = NEW."confirmationDecisionId" AND d."reviewId" = r."id" AND d."decision" = 'CONFIRM_EXACT_UNDERSTANDING' AND d."snapshotHash" = s."canonicalHash"
    WHERE s."id" = NEW."confirmedUnderstandingSnapshotId" AND s."status" = 'CONFIRMED'
      AND s."workspaceId" = NEW."workspaceId" AND s."projectId" = NEW."projectId"
      AND r."id" = NEW."understandingReviewId" AND r."status" = 'CONFIRMED'
      AND r."candidateBatchId" = NEW."candidateBatchId" AND r."intakeId" = NEW."intakeId"
  ) THEN RAISE EXCEPTION 'R36Y citation is outside confirmed memory'; END IF;
  IF NEW."citationKind" IN ('REVIEWED_CANDIDATE','SOURCE_METADATA') AND NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainCandidateDisposition" p
    JOIN "ConstructionProjectBrainFactCandidate" c ON c."id" = p."candidateId"
    WHERE p."id" = NEW."dispositionId" AND p."reviewId" = NEW."understandingReviewId"
      AND p."candidateId" = NEW."candidateId" AND p."disposition" = 'ACCEPT_AS_REVIEWED'
      AND c."batchId" = NEW."candidateBatchId" AND (NEW."sourceId" IS NULL OR c."sourceId" = NEW."sourceId")
  ) THEN RAISE EXCEPTION 'R36Y reviewed candidate citation is invalid'; END IF;
  IF NEW."citationKind" = 'OWNER_RESOLUTION' AND NOT EXISTS (
    SELECT 1 FROM "ConstructionProjectBrainContradictionResolution" x
    WHERE x."id" = NEW."resolutionId" AND x."reviewId" = NEW."understandingReviewId"
      AND x."mode" = 'OWNER_RESOLUTION' AND x."provenance" = 'OWNER_RESOLUTION'
  ) THEN RAISE EXCEPTION 'R36Y owner resolution citation is invalid'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "CPBMC_provenance_guard" AFTER INSERT ON "ConstructionProjectBrainMemoryCitation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainMemoryCitation_guard"();

CREATE OR REPLACE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'R36Y history is immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CPBRR_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainRecallReceipt" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBRR_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainRecallReceipt" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBPAB_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainPreparedActionBinding" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBPAB_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainPreparedActionBinding" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBMC_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainMemoryCitation" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBMC_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainMemoryCitation" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBAD_immutable" BEFORE UPDATE OR DELETE ON "ConstructionProjectBrainAssistantDecision" FOR EACH ROW EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
CREATE TRIGGER "CPBAD_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainAssistantDecision" FOR EACH STATEMENT EXECUTE FUNCTION "ConstructionProjectBrainAssistantMemory_immutable_guard"();
