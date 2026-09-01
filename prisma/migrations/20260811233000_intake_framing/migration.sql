-- LOT C — Intake framing: four additive nullable columns on the classification.
-- Null means "classified before LOT C existed"; no backfill is invented — an
-- old classification never made these distinctions, and pretending it did
-- would fabricate provenance. The closed vocabularies live in code
-- (src/lib/ai-work-engine/intake-framing.ts), same discipline as dataClass.
ALTER TABLE "TaskAiClassification" ADD COLUMN "sourceShape" TEXT;
ALTER TABLE "TaskAiClassification" ADD COLUMN "verificationExpectation" TEXT;
ALTER TABLE "TaskAiClassification" ADD COLUMN "outputFormatCode" TEXT;
ALTER TABLE "TaskAiClassification" ADD COLUMN "recurrence" TEXT;
