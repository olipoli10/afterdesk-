-- Compatibility bridge for databases created from the pre-migration schema.
-- Every statement is idempotent: a fresh database already received these
-- objects from the baseline, while an adopted legacy database receives only
-- what it is missing.

DO $$
BEGIN
  CREATE TYPE "FileScanStatus" AS ENUM ('pending', 'clean', 'rejected', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'chargeback';

ALTER TABLE "File"
  ADD COLUMN IF NOT EXISTS "detectedMime" TEXT,
  ADD COLUMN IF NOT EXISTS "scanDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sha256" TEXT;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "emailAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailError" TEXT,
  ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3);

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "checkoutSessionId" TEXT;

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "revisionInstructions" TEXT;

ALTER TABLE "VaProfile"
  ADD COLUMN IF NOT EXISTS "applicationSubmittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "experienceSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "portfolioUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "specialties" TEXT,
  ADD COLUMN IF NOT EXISTS "weeklyAvailability" TEXT;

CREATE TABLE IF NOT EXISTS "ExamAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseSlug" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "answers" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Certification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseSlug" TEXT NOT NULL,
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamAttempt_userId_courseSlug_createdAt_idx"
  ON "ExamAttempt"("userId", "courseSlug", "createdAt");
CREATE INDEX IF NOT EXISTS "Certification_userId_idx"
  ON "Certification"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Certification_userId_courseSlug_key"
  ON "Certification"("userId", "courseSlug");
CREATE INDEX IF NOT EXISTS "File_scanStatus_idx"
  ON "File"("scanStatus");
CREATE INDEX IF NOT EXISTS "Notification_emailedAt_createdAt_idx"
  ON "Notification"("emailedAt", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_checkoutSessionId_key"
  ON "Payment"("checkoutSessionId");

DO $$
BEGIN
  ALTER TABLE "ExamAttempt"
    ADD CONSTRAINT "ExamAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "Certification"
    ADD CONSTRAINT "Certification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
