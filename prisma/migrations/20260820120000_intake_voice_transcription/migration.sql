-- Intake voice transcription foundation. Additive tables and nullable subject
-- relation only. Existing non-voice AiOperation rows retain their old meaning.
-- Raw audio bytes are intentionally not represented anywhere in this schema.

CREATE TYPE "VoiceIntakeSessionStatus" AS ENUM (
  'open','finishing','transcribing','ready','incomplete','uncertain',
  'cancelled','failed','purged'
);

CREATE TYPE "VoiceIntakeSegmentStatus" AS ENUM (
  'registered','reserved','running','succeeded','failed','uncertain',
  'cancelled','purged'
);

CREATE TYPE "VoiceIntakeLanguage" AS ENUM ('en','fr','es','tl');
CREATE TYPE "VoiceMediaFormat" AS ENUM ('webm','ogg','mp3','wav','m4a','aac','flac');

CREATE TABLE "VoiceIntakeSession" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "status" "VoiceIntakeSessionStatus" NOT NULL DEFAULT 'open',
  "languageHint" "VoiceIntakeLanguage" NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "maxDurationMs" INTEGER NOT NULL,
  "maxSegmentDurationMs" INTEGER NOT NULL,
  "maxSegmentBytes" INTEGER NOT NULL,
  "maxSegments" INTEGER NOT NULL,
  "maxTotalBytes" INTEGER NOT NULL,
  "maxTotalCostMicros" BIGINT NOT NULL,
  "expectedSegmentCount" INTEGER,
  "capturedDurationMs" INTEGER NOT NULL DEFAULT 0,
  "capturedBytes" INTEGER NOT NULL DEFAULT 0,
  "assemblyFingerprint" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceIntakeSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voice_intake_session_bounds_ck" CHECK (
    length("consentVersion") BETWEEN 1 AND 120 AND
    "maxDurationMs" BETWEEN 1 AND 600000 AND
    "maxSegmentDurationMs" BETWEEN 1 AND 45000 AND
    "maxSegmentDurationMs" <= "maxDurationMs" AND
    "maxSegmentBytes" BETWEEN 1 AND 2000000 AND
    "maxSegments" BETWEEN 1 AND 14 AND
    "maxTotalBytes" BETWEEN 1 AND 28000000 AND
    "maxTotalCostMicros" > 0 AND
    ("expectedSegmentCount" IS NULL OR
      "expectedSegmentCount" BETWEEN 1 AND "maxSegments") AND
    "capturedDurationMs" BETWEEN 0 AND "maxDurationMs" AND
    "capturedBytes" BETWEEN 0 AND "maxTotalBytes" AND
    ("assemblyFingerprint" IS NULL OR
      "assemblyFingerprint" ~ '^sha256:[a-f0-9]{64}$') AND
    "expiresAt" <= "createdAt" + interval '24 hours'
  )
);

CREATE TABLE "VoiceIntakeSegment" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "status" "VoiceIntakeSegmentStatus" NOT NULL DEFAULT 'registered',
  "mediaFormat" "VoiceMediaFormat" NOT NULL,
  "mimeType" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "byteCount" INTEGER NOT NULL,
  "audioFingerprint" TEXT NOT NULL,
  "languageHint" "VoiceIntakeLanguage" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VoiceIntakeSegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voice_intake_segment_bounds_ck" CHECK (
    "ordinal" BETWEEN 0 AND 13 AND
    "durationMs" BETWEEN 1 AND 45000 AND
    "byteCount" BETWEEN 1 AND 2000000 AND
    length("mimeType") BETWEEN 1 AND 120 AND
    "audioFingerprint" ~ '^sha256:[a-f0-9]{64}$'
  )
);

CREATE TABLE "VoiceTranscriptSegment" (
  "id" TEXT NOT NULL,
  "segmentId" TEXT NOT NULL,
  "gatewayAttemptId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "textFingerprint" TEXT NOT NULL,
  "characterCount" INTEGER NOT NULL,
  "reportedAudioSeconds" DECIMAL(12,3),
  "measuredCostMicros" BIGINT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "purgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceTranscriptSegment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voice_transcript_shape_ck" CHECK (
    "textFingerprint" ~ '^sha256:[a-f0-9]{64}$' AND
    "characterCount" BETWEEN 1 AND 20000 AND
    ("reportedAudioSeconds" IS NULL OR
      "reportedAudioSeconds" BETWEEN 0 AND 600) AND
    ("measuredCostMicros" IS NULL OR "measuredCostMicros" >= 0) AND
    "expiresAt" <= "createdAt" + interval '24 hours' AND
    (("purgedAt" IS NULL AND length("text") = "characterCount") OR
     ("purgedAt" IS NOT NULL AND "text" = ''))
  )
);

ALTER TABLE "AiOperation" ADD COLUMN "voiceIntakeSegmentId" TEXT;

CREATE INDEX "VoiceIntakeSession_clientId_status_idx"
  ON "VoiceIntakeSession"("clientId","status");
CREATE INDEX "VoiceIntakeSession_expiresAt_status_idx"
  ON "VoiceIntakeSession"("expiresAt","status");
CREATE UNIQUE INDEX "VoiceIntakeSegment_sessionId_ordinal_key"
  ON "VoiceIntakeSegment"("sessionId","ordinal");
CREATE INDEX "VoiceIntakeSegment_sessionId_status_idx"
  ON "VoiceIntakeSegment"("sessionId","status");
CREATE UNIQUE INDEX "VoiceTranscriptSegment_segmentId_key"
  ON "VoiceTranscriptSegment"("segmentId");
CREATE UNIQUE INDEX "VoiceTranscriptSegment_gatewayAttemptId_key"
  ON "VoiceTranscriptSegment"("gatewayAttemptId");
CREATE INDEX "VoiceTranscriptSegment_expiresAt_purgedAt_idx"
  ON "VoiceTranscriptSegment"("expiresAt","purgedAt");
CREATE UNIQUE INDEX "AiOperation_voiceIntakeSegmentId_key"
  ON "AiOperation"("voiceIntakeSegmentId");

ALTER TABLE "VoiceIntakeSession" ADD CONSTRAINT "VoiceIntakeSession_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoiceIntakeSegment" ADD CONSTRAINT "VoiceIntakeSegment_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "VoiceIntakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceTranscriptSegment" ADD CONSTRAINT "VoiceTranscriptSegment_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "VoiceIntakeSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceTranscriptSegment" ADD CONSTRAINT "VoiceTranscriptSegment_gatewayAttemptId_fkey"
  FOREIGN KEY ("gatewayAttemptId") REFERENCES "ModelGatewayAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_voiceIntakeSegmentId_fkey"
  FOREIGN KEY ("voiceIntakeSegmentId") REFERENCES "VoiceIntakeSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiOperation" ADD CONSTRAINT "ai_operation_voice_subject_ck" CHECK (
  ("purpose" = 'intake_voice_transcription' AND
    "voiceIntakeSegmentId" IS NOT NULL AND "taskId" IS NULL) OR
  ("purpose" <> 'intake_voice_transcription' AND
    "voiceIntakeSegmentId" IS NULL)
);

-- Widen only the closed operation vocabulary. All original bounds remain.
ALTER TABLE "ModelGatewayPolicyVersion" DROP CONSTRAINT "mg_policy_closed_fields";
ALTER TABLE "ModelGatewayPolicyVersion" ADD CONSTRAINT "mg_policy_closed_fields" CHECK (
  "version" > 0 AND
  "operationType" IN ('classification','intake_voice_transcription') AND
  "status" IN ('draft','published','retired') AND "maxAttempts" > 0 AND
  "maxTotalCostMicros" >= 0 AND
  "requiredPrivacyPosture" IN ('standard','no_training','zero_retention','regional_zero_retention') AND
  "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
);

ALTER TABLE "ModelGatewayOperation" DROP CONSTRAINT "mg_operation_closed_fields";
ALTER TABLE "ModelGatewayOperation" ADD CONSTRAINT "mg_operation_closed_fields" CHECK (
  "operationType" IN ('classification','intake_voice_transcription') AND
  "dataClass" IN ('public','business_confidential','personal_data','restricted_sensitive') AND
  "privacyRequirement" IN ('standard','no_training','zero_retention','regional_zero_retention') AND
  "status" IN ('admitted','running','succeeded','failed','uncertain','refused') AND
  "maxTotalCostMicros" >= 0 AND
  "requestFingerprint" ~ '^sha256:[a-f0-9]{64}$' AND
  "outputContractHash" ~ '^sha256:[a-f0-9]{64}$'
);

ALTER TABLE "ModelGatewayAuditEvent" DROP CONSTRAINT "mg_audit_event_closed_fields";
ALTER TABLE "ModelGatewayAuditEvent" ADD CONSTRAINT "mg_audit_event_closed_fields" CHECK (
  "eventType" IN (
    'model_gateway.admission.accepted','model_gateway.admission.refused',
    'model_gateway.policy.published','model_gateway.policy.retired',
    'model_gateway.route.certified','model_gateway.route.revoked',
    'model_gateway.decision.authorized','model_gateway.decision.refused',
    'model_gateway.attempt.prepared','model_gateway.attempt.dispatched',
    'model_gateway.attempt.settled','model_gateway.attempt.failed','model_gateway.attempt.uncertain',
    'model_gateway.breaker.opened','model_gateway.breaker.closed',
    'model_gateway.spend.held','model_gateway.spend.released','model_gateway.spend.settled',
    'model_gateway.replay.converged',
    'voice_intake.session.created','voice_intake.session.finishing',
    'voice_intake.session.cancelled','voice_intake.session.ready',
    'voice_intake.session.incomplete','voice_intake.session.uncertain',
    'voice_intake.session.purged','voice_intake.segment.registered',
    'voice_intake.segment.replayed','voice_intake.segment.refused',
    'voice_intake.segment.succeeded','voice_intake.segment.failed',
    'voice_intake.segment.uncertain','voice_intake.transcript.purged'
  ) AND "correlationId" ~ '^[A-Za-z0-9_.:@/-]{1,240}$' AND
  ("policyHash" IS NULL OR "policyHash" ~ '^sha256:[a-f0-9]{64}$') AND
  ("routeHash" IS NULL OR "routeHash" ~ '^sha256:[a-f0-9]{64}$') AND
  ("evidenceRef" IS NULL OR "evidenceRef" ~ '^sha256:[a-f0-9]{64}$') AND
  ("amountMicros" IS NULL OR "amountMicros" >= 0)
);

CREATE OR REPLACE FUNCTION voice_reject_session_frozen_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."clientId",NEW."languageHint",NEW."consentVersion",NEW."consentedAt",
         NEW."maxDurationMs",NEW."maxSegmentDurationMs",NEW."maxSegmentBytes",
         NEW."maxSegments",NEW."maxTotalBytes",NEW."maxTotalCostMicros",
         NEW."expiresAt",NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."clientId",OLD."languageHint",OLD."consentVersion",OLD."consentedAt",
         OLD."maxDurationMs",OLD."maxSegmentDurationMs",OLD."maxSegmentBytes",
         OLD."maxSegments",OLD."maxTotalBytes",OLD."maxTotalCostMicros",
         OLD."expiresAt",OLD."createdAt") THEN
    RAISE EXCEPTION 'VoiceIntakeSession frozen authorization fields are immutable';
  END IF;
  IF OLD."expectedSegmentCount" IS NOT NULL AND
     NEW."expectedSegmentCount" IS DISTINCT FROM OLD."expectedSegmentCount" THEN
    RAISE EXCEPTION 'VoiceIntakeSession expected segment count is frozen';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='open' AND NEW.status IN ('finishing','cancelled','failed')) OR
    (OLD.status='finishing' AND NEW.status IN ('transcribing','cancelled','failed')) OR
    (OLD.status='transcribing' AND NEW.status IN ('ready','incomplete','uncertain','cancelled','failed')) OR
    (OLD.status IN ('ready','incomplete','uncertain','cancelled','failed') AND NEW.status='purged')
  ) THEN
    RAISE EXCEPTION 'invalid VoiceIntakeSession status transition';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "voice_intake_session_immutable"
BEFORE UPDATE ON "VoiceIntakeSession"
FOR EACH ROW EXECUTE FUNCTION voice_reject_session_frozen_mutation();

CREATE OR REPLACE FUNCTION voice_reject_segment_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."sessionId",NEW."ordinal",NEW."mediaFormat",NEW."mimeType",
         NEW."durationMs",NEW."byteCount",NEW."audioFingerprint",
         NEW."languageHint",NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."sessionId",OLD."ordinal",OLD."mediaFormat",OLD."mimeType",
         OLD."durationMs",OLD."byteCount",OLD."audioFingerprint",
         OLD."languageHint",OLD."createdAt") THEN
    RAISE EXCEPTION 'VoiceIntakeSegment identity and captured metadata are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "voice_intake_segment_immutable"
BEFORE UPDATE ON "VoiceIntakeSegment"
FOR EACH ROW EXECUTE FUNCTION voice_reject_segment_identity_mutation();

CREATE OR REPLACE FUNCTION voice_guard_transcript_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."purgedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'purged voice transcript content cannot be restored';
  END IF;
  IF ROW(NEW."segmentId",NEW."gatewayAttemptId",NEW."textFingerprint",
         NEW."characterCount",NEW."reportedAudioSeconds",NEW."measuredCostMicros",
         NEW."expiresAt",NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."segmentId",OLD."gatewayAttemptId",OLD."textFingerprint",
         OLD."characterCount",OLD."reportedAudioSeconds",OLD."measuredCostMicros",
         OLD."expiresAt",OLD."createdAt") THEN
    RAISE EXCEPTION 'VoiceTranscriptSegment evidence is immutable';
  END IF;
  IF NEW."purgedAt" IS NULL OR NEW."text" <> '' THEN
    RAISE EXCEPTION 'VoiceTranscriptSegment content may only transition atomically to purged';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "voice_transcript_content_guard"
BEFORE UPDATE ON "VoiceTranscriptSegment"
FOR EACH ROW EXECUTE FUNCTION voice_guard_transcript_content();
