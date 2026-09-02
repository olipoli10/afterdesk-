-- ENDVERA Construction Operating Assistant R25 — provider-neutral call
-- memory, immutable transitions, selected foreground voice-note references and
-- prepared outbound call work. Forward-only; zero provider transport.

CREATE TABLE "ConstructionCallSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "contactId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "callerIdentityRef" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "lifecycleState" TEXT NOT NULL DEFAULT 'RECEIVED',
  "disclosureVersion" TEXT NOT NULL,
  "disclosureStatus" TEXT NOT NULL,
  "recordingConsentStatus" TEXT NOT NULL,
  "transcriptionConsentStatus" TEXT NOT NULL,
  "transcript" TEXT NOT NULL,
  "transcriptHash" TEXT NOT NULL,
  "transcriptProofLevel" TEXT NOT NULL,
  "result" JSONB,
  "nextOwnerUserId" TEXT,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCallSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionCallTransition" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "callSessionId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "stateBefore" TEXT,
  "stateAfter" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionCallTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionVoiceNoteReference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "transcriptionState" TEXT NOT NULL DEFAULT 'TRANSCRIPTION_PREPARED',
  "createdByUserId" TEXT NOT NULL,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionVoiceNoteReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionCallWork" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "recipientRef" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "objectiveHash" TEXT NOT NULL,
  "disclosureVersion" TEXT NOT NULL,
  "disclosureScript" TEXT NOT NULL,
  "resultSchema" TEXT[],
  "policyVersion" TEXT NOT NULL,
  "policyDecision" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREPARED_UNSENT',
  "nextOwnerRole" TEXT NOT NULL DEFAULT 'HUMAN_CALLER',
  "createdByUserId" TEXT NOT NULL,
  "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCallWork_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionCallSession_workspaceId_callId_key"
  ON "ConstructionCallSession"("workspaceId", "callId");
CREATE UNIQUE INDEX "ConstructionCallSession_workspaceId_eventId_key"
  ON "ConstructionCallSession"("workspaceId", "eventId");
CREATE INDEX "ConstructionCallSession_workspaceId_lifecycleState_createdAt_idx"
  ON "ConstructionCallSession"("workspaceId", "lifecycleState", "createdAt");
CREATE INDEX "ConstructionCallSession_projectId_createdAt_idx"
  ON "ConstructionCallSession"("projectId", "createdAt");
CREATE INDEX "ConstructionCallSession_contactId_createdAt_idx"
  ON "ConstructionCallSession"("contactId", "createdAt");

CREATE UNIQUE INDEX "ConstructionCallTransition_workspaceId_commandId_key"
  ON "ConstructionCallTransition"("workspaceId", "commandId");
CREATE INDEX "ConstructionCallTransition_callSessionId_createdAt_idx"
  ON "ConstructionCallTransition"("callSessionId", "createdAt");
CREATE INDEX "ConstructionCallTransition_workspaceId_createdAt_idx"
  ON "ConstructionCallTransition"("workspaceId", "createdAt");

CREATE UNIQUE INDEX "ConstructionVoiceNoteReference_workspaceId_commandId_key"
  ON "ConstructionVoiceNoteReference"("workspaceId", "commandId");
CREATE UNIQUE INDEX "ConstructionVoiceNoteReference_workspaceId_fileId_key"
  ON "ConstructionVoiceNoteReference"("workspaceId", "fileId");
CREATE INDEX "ConstructionVoiceNoteReference_workspaceId_projectId_createdAt_idx"
  ON "ConstructionVoiceNoteReference"("workspaceId", "projectId", "createdAt");
CREATE INDEX "ConstructionVoiceNoteReference_createdByUserId_createdAt_idx"
  ON "ConstructionVoiceNoteReference"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "ConstructionCallWork_workspaceId_commandId_key"
  ON "ConstructionCallWork"("workspaceId", "commandId");
CREATE INDEX "ConstructionCallWork_workspaceId_status_createdAt_idx"
  ON "ConstructionCallWork"("workspaceId", "status", "createdAt");
CREATE INDEX "ConstructionCallWork_projectId_status_idx"
  ON "ConstructionCallWork"("projectId", "status");
CREATE INDEX "ConstructionCallWork_contactId_status_idx"
  ON "ConstructionCallWork"("contactId", "status");

ALTER TABLE "ConstructionCallSession"
  ADD CONSTRAINT "ConstructionCallSession_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallSession"
  ADD CONSTRAINT "ConstructionCallSession_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallSession"
  ADD CONSTRAINT "ConstructionCallSession_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallTransition"
  ADD CONSTRAINT "ConstructionCallTransition_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallTransition"
  ADD CONSTRAINT "ConstructionCallTransition_callSessionId_fkey"
  FOREIGN KEY ("callSessionId") REFERENCES "ConstructionCallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionVoiceNoteReference"
  ADD CONSTRAINT "ConstructionVoiceNoteReference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionVoiceNoteReference"
  ADD CONSTRAINT "ConstructionVoiceNoteReference_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionVoiceNoteReference"
  ADD CONSTRAINT "ConstructionVoiceNoteReference_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallWork"
  ADD CONSTRAINT "ConstructionCallWork_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallWork"
  ADD CONSTRAINT "ConstructionCallWork_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCallWork"
  ADD CONSTRAINT "ConstructionCallWork_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_direction_check"
  CHECK ("direction" IN ('inbound', 'outbound'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_purpose_check"
  CHECK ("purpose" IN ('internal', 'service', 'commercial'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_lifecycle_check"
  CHECK ("lifecycleState" IN ('RECEIVED', 'PROCESSING', 'CLARIFICATION_REQUIRED', 'COMPLETED', 'REFUSED'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_disclosure_check"
  CHECK ("disclosureStatus" IN ('acknowledged', 'refused'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_recording_consent_check"
  CHECK ("recordingConsentStatus" IN ('unknown', 'granted', 'denied', 'not_recorded'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_transcription_consent_check"
  CHECK ("transcriptionConsentStatus" IN ('unknown', 'granted', 'denied'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_proof_check"
  CHECK ("transcriptProofLevel" IN ('SYNTHETIC_LOCAL', 'HUMAN_TRANSCRIBED'));
ALTER TABLE "ConstructionCallSession" ADD CONSTRAINT "ConstructionCallSession_transport_check"
  CHECK ("externalTransportPerformed" = false);
ALTER TABLE "ConstructionVoiceNoteReference" ADD CONSTRAINT "ConstructionVoiceNoteReference_duration_check"
  CHECK ("durationMs" > 0 AND "durationMs" <= 120000);
ALTER TABLE "ConstructionVoiceNoteReference" ADD CONSTRAINT "ConstructionVoiceNoteReference_size_check"
  CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760);
ALTER TABLE "ConstructionVoiceNoteReference" ADD CONSTRAINT "ConstructionVoiceNoteReference_state_check"
  CHECK ("transcriptionState" = 'TRANSCRIPTION_PREPARED');
ALTER TABLE "ConstructionVoiceNoteReference" ADD CONSTRAINT "ConstructionVoiceNoteReference_mime_check"
  CHECK ("mimeType" = 'audio/mp4');
ALTER TABLE "ConstructionVoiceNoteReference" ADD CONSTRAINT "ConstructionVoiceNoteReference_transport_check"
  CHECK ("externalTransportPerformed" = false);
ALTER TABLE "ConstructionCallWork" ADD CONSTRAINT "ConstructionCallWork_purpose_check"
  CHECK ("purpose" IN ('internal', 'service'));
ALTER TABLE "ConstructionCallWork" ADD CONSTRAINT "ConstructionCallWork_status_check"
  CHECK ("status" = 'PREPARED_UNSENT');
ALTER TABLE "ConstructionCallWork" ADD CONSTRAINT "ConstructionCallWork_transport_check"
  CHECK ("externalTransportPerformed" = false);

CREATE OR REPLACE FUNCTION "ConstructionCallTransition_immutable_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR (TG_OP = 'DELETE' AND pg_trigger_depth() = 0) THEN
    RAISE EXCEPTION 'ConstructionCallTransition is immutable';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConstructionCallTransition_immutable"
  BEFORE UPDATE OR DELETE ON "ConstructionCallTransition"
  FOR EACH ROW EXECUTE FUNCTION "ConstructionCallTransition_immutable_guard"();
