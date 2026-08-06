-- PHASE 1C (1/2) — INTELLIGENCE OPERATIONNELLE : tables, enums, colonnes.
--
-- Entierement additif. Genere par `prisma migrate diff` puis NETTOYE DE LA
-- DERIVE CONNUE, exactement comme 20260806170100 : le diff proposait de
-- supprimer l'index HNSW de TaskEmbedding (non representable dans le schema
-- Prisma — piege documente) et de renommer/supprimer les index Standing
-- Capacity. Ces trois instructions ont ete RETIREES ; rien ici ne detruit
-- quoi que ce soit.
--
-- Les INDEX PARTIELS en fin de fichier sont SQL-only (Prisma ne sait pas les
-- exprimer) :
--  - une seule session OUVERTE par (task, user, role) ;
--  - unicite (operationId, attempt) sur AiUsage UNIQUEMENT quand operationId
--    est non nul — les lignes d'intake historiques restent hors contrainte.

-- CreateEnum
CREATE TYPE "AiOperationStatus" AS ENUM ('reserved', 'running', 'succeeded', 'failed', 'abandoned');

-- CreateEnum
CREATE TYPE "WorkSessionRole" AS ENUM ('worker', 'reviewer', 'admin_operator');

-- CreateEnum
CREATE TYPE "WorkSessionPhase" AS ENUM ('residual_work', 'qc', 'revision', 'manual_fallback');

-- CreateEnum
CREATE TYPE "WorkSessionStatus" AS ENUM ('active', 'paused', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "WorkSessionSource" AS ENUM ('timer', 'manual_correction', 'system_recovery');

-- CreateEnum
CREATE TYPE "QualityReviewOutcome" AS ENUM ('approved', 'revision_required', 'rejected');

-- CreateEnum
CREATE TYPE "CalibrationLevel" AS ENUM ('uncalibrated', 'early_signal', 'partially_calibrated', 'calibrated');

-- CreateEnum
CREATE TYPE "TaskOutcomeClass" AS ENUM ('disputed', 'payment_failure', 'client_cancelled', 'admin_cancelled', 'worker_failure', 'provider_failure', 'workflow_failure', 'workflow_success');

-- CreateEnum
CREATE TYPE "CalibrationStratumDimension" AS ENUM ('pricing', 'quality');

-- DropIndex

-- DropIndex

-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "attempt" INTEGER,
ADD COLUMN     "operationId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "capturedAmountCents" INTEGER;

-- AlterTable
ALTER TABLE "TaskWorkflowRun" ADD COLUMN     "unitsPrefilled" INTEGER,
ADD COLUMN     "unitsVerifiedByMachine" INTEGER;

-- CreateTable
CREATE TABLE "AiOperation" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "purpose" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "status" "AiOperationStatus" NOT NULL DEFAULT 'reserved',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "resultKind" TEXT,
    "resultId" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOperationalBaseline" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "planVersionId" TEXT,
    "clientId" TEXT NOT NULL,
    "executionWorkflowKey" TEXT,
    "executionWorkflowHash" TEXT,
    "executionKeyVersion" INTEGER NOT NULL,
    "pricingPolicyVersion" TEXT NOT NULL,
    "qualityPolicyVersion" TEXT NOT NULL,
    "costCatalogVersion" TEXT NOT NULL,
    "categoryId" TEXT,
    "unitsRequested" INTEGER,
    "verificationLevel" TEXT,
    "sensitiveData" BOOLEAN,
    "requiredAccessCount" INTEGER,
    "plannedWorkerMinutes" INTEGER,
    "plannedReviewerMinutes" INTEGER,
    "plannedAutomatedStepCount" INTEGER,
    "plannedHumanStepCount" INTEGER,
    "estimatedInternalCostLikelyCents" INTEGER,
    "estimatedInternalCostConservativeCents" INTEGER,
    "estimatedWorkerPayoutCents" INTEGER,
    "estimatedWorkerMinutesAtQuote" INTEGER,
    "clientPriceCents" INTEGER NOT NULL,
    "modeledReviewerMinutesAtQuote" INTEGER NOT NULL,
    "modeledReworkReservePctBps" INTEGER NOT NULL,
    "modeledStripeFeePctBps" INTEGER NOT NULL,
    "modeledStripeFeeFixedCents" INTEGER NOT NULL,
    "modeledTargetMarginBps" INTEGER NOT NULL,
    "calibrationLevelAtQuote" TEXT,
    "clientPriorCompletedTaskCount" INTEGER NOT NULL,
    "repeatWindowEndsAt" TIMESTAMP(3) NOT NULL,
    "dataQualityFlags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskOperationalBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskWorkSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "userId" TEXT NOT NULL,
    "role" "WorkSessionRole" NOT NULL,
    "phase" "WorkSessionPhase" NOT NULL,
    "status" "WorkSessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastResumedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
    "source" "WorkSessionSource" NOT NULL DEFAULT 'timer',
    "attemptNo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskWorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskQualityReview" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "submissionId" TEXT NOT NULL,
    "reviewSequence" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "outcome" "QualityReviewOutcome" NOT NULL,
    "totalUnits" INTEGER,
    "unitsChecked" INTEGER,
    "unitsCorrect" INTEGER,
    "unitsIncomplete" INTEGER,
    "unitsUnverifiable" INTEGER,
    "criticalErrorCount" INTEGER NOT NULL DEFAULT 0,
    "majorErrorCount" INTEGER NOT NULL DEFAULT 0,
    "minorErrorCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "invalidSourceCount" INTEGER NOT NULL DEFAULT 0,
    "missingSourceCount" INTEGER NOT NULL DEFAULT 0,
    "formattingErrorCount" INTEGER NOT NULL DEFAULT 0,
    "correctedByReviewerCount" INTEGER NOT NULL DEFAULT 0,
    "categoryMetrics" JSONB,
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskQualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOperationalActual" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "workflowRunId" TEXT,
    "executionWorkflowKey" TEXT,
    "executionWorkflowHash" TEXT,
    "pricingPolicyVersion" TEXT,
    "qualityPolicyVersion" TEXT,
    "outcomeClass" "TaskOutcomeClass",
    "deliveredAt" TIMESTAMP(3),
    "executionStartedAt" TIMESTAMP(3),
    "executionFinishedAt" TIMESTAMP(3),
    "automatedElapsedSeconds" INTEGER,
    "workerActiveSeconds" INTEGER,
    "reviewerActiveSeconds" INTEGER,
    "revisionActiveSeconds" INTEGER,
    "unitsRequested" INTEGER,
    "unitsDiscovered" INTEGER,
    "unitsPrefilled" INTEGER,
    "unitsResolvedAutomatically" INTEGER,
    "unitsSentToHuman" INTEGER,
    "unitsResolvedByHuman" INTEGER,
    "unitsUnresolved" INTEGER,
    "unitsCorrectedByReviewer" INTEGER,
    "automatedUnitRateBps" INTEGER,
    "exceptionRateBps" INTEGER,
    "aiCostMeteredMicros" BIGINT NOT NULL DEFAULT 0,
    "toolCostMeteredMicros" BIGINT NOT NULL DEFAULT 0,
    "reviewerLaborModeledFromMeasuredTimeMicros" BIGINT,
    "paymentFeeModeledMicros" BIGINT,
    "workerPayoutCurrentLiabilityCents" INTEGER NOT NULL DEFAULT 0,
    "workerPayoutPaidCents" INTEGER NOT NULL DEFAULT 0,
    "workerPayoutVoidedCents" INTEGER NOT NULL DEFAULT 0,
    "workerPayoutNetIncurredCents" INTEGER NOT NULL DEFAULT 0,
    "bookedAndMeteredCostMicros" BIGINT NOT NULL DEFAULT 0,
    "modeledCostAddonMicros" BIGINT NOT NULL DEFAULT 0,
    "allInCostWithModeledMicros" BIGINT NOT NULL DEFAULT 0,
    "recognizedRevenueMicros" BIGINT,
    "grossMarginBookedMeteredMicros" BIGINT,
    "grossMarginBookedMeteredBps" INTEGER,
    "grossMarginAllInModeledMicros" BIGINT,
    "grossMarginAllInModeledBps" INTEGER,
    "costVarianceMicros" BIGINT,
    "revisionRounds" INTEGER,
    "passedQcFirstAttempt" BOOLEAN,
    "criticalErrorCount" INTEGER,
    "totalErrorCount" INTEGER,
    "disputeOpened" BOOLEAN NOT NULL DEFAULT false,
    "clientRevisionRequested" BOOLEAN NOT NULL DEFAULT false,
    "clientAcceptedWithoutCorrection" BOOLEAN,
    "repeatWithin90Days" BOOLEAN,
    "eligibleForReliabilityStatistics" BOOLEAN NOT NULL DEFAULT false,
    "eligibleForCostAndPerformanceCalibration" BOOLEAN NOT NULL DEFAULT false,
    "eligibleForMarginStatistics" BOOLEAN NOT NULL DEFAULT false,
    "metricsCompletenessBps" INTEGER NOT NULL DEFAULT 0,
    "dataQualityFlags" TEXT[],
    "inputFingerprint" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "computationVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOperationalActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowCalibrationProfile" (
    "id" TEXT NOT NULL,
    "executionWorkflowKey" TEXT NOT NULL,
    "executionWorkflowHash" TEXT NOT NULL,
    "executionKeyVersion" INTEGER NOT NULL,
    "categoryId" TEXT,
    "primitiveSignature" TEXT NOT NULL,
    "sampleSizeReliability" INTEGER NOT NULL DEFAULT 0,
    "sampleSizeCostPerf" INTEGER NOT NULL DEFAULT 0,
    "sampleSizeMargin" INTEGER NOT NULL DEFAULT 0,
    "sampleSizeRepeatResolved" INTEGER NOT NULL DEFAULT 0,
    "sampleSizeRecent" INTEGER NOT NULL DEFAULT 0,
    "calibrationLevel" "CalibrationLevel" NOT NULL DEFAULT 'uncalibrated',
    "metricsCompletenessBps" INTEGER,
    "commercialSuccessRateBps" INTEGER,
    "technicalReliabilityRateBps" INTEGER,
    "firstPassQcRateBps" INTEGER,
    "disputeRateBps" INTEGER,
    "revisionRateBps" INTEGER,
    "criticalErrorRateBps" INTEGER,
    "noCorrectionRateBps" INTEGER,
    "repeatWithin90dRateBps" INTEGER,
    "medianAutomatedUnitRateBps" INTEGER,
    "p25AutomatedUnitRateBps" INTEGER,
    "p75AutomatedUnitRateBps" INTEGER,
    "medianExceptionRateBps" INTEGER,
    "medianAiCostPerUnitMicros" BIGINT,
    "p75AiCostPerUnitMicros" BIGINT,
    "medianToolCostPerUnitMicros" BIGINT,
    "medianWorkerSecondsPerException" INTEGER,
    "p75WorkerSecondsPerException" INTEGER,
    "medianReviewerSecondsPerUnit" INTEGER,
    "medianAllInCostMicros" BIGINT,
    "p25AllInCostMicros" BIGINT,
    "p75AllInCostMicros" BIGINT,
    "p90AllInCostMicros" BIGINT,
    "medianGrossMarginAllInBps" INTEGER,
    "p25GrossMarginAllInBps" INTEGER,
    "outcomeCounts" JSONB,
    "pricingPolicyVersions" TEXT[],
    "qualityPolicyVersions" TEXT[],
    "driftFlags" TEXT[],
    "recommendation" JSONB,
    "recommendationGeneratedAt" TIMESTAMP(3),
    "lastExecutionAt" TIMESTAMP(3),
    "lastComputedAt" TIMESTAMP(3) NOT NULL,
    "computationVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowCalibrationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowCalibrationStratum" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "dimension" "CalibrationStratumDimension" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "firstPassQcRateBps" INTEGER,
    "criticalErrorRateBps" INTEGER,
    "revisionRateBps" INTEGER,
    "errorCountsBySeverity" JSONB,
    "medianCostVarianceBps" INTEGER,
    "medianPayoutVarianceBps" INTEGER,
    "allInCostP75Micros" BIGINT,
    "allInCostP90Micros" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowCalibrationStratum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiOperation_operationKey_key" ON "AiOperation"("operationKey");

-- CreateIndex
CREATE INDEX "AiOperation_taskId_idx" ON "AiOperation"("taskId");

-- CreateIndex
CREATE INDEX "AiOperation_status_nextAttemptAt_idx" ON "AiOperation"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOperationalBaseline_taskId_key" ON "TaskOperationalBaseline"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOperationalBaseline_snapshotId_key" ON "TaskOperationalBaseline"("snapshotId");

-- CreateIndex
CREATE INDEX "TaskOperationalBaseline_clientId_repeatWindowEndsAt_idx" ON "TaskOperationalBaseline"("clientId", "repeatWindowEndsAt");

-- CreateIndex
CREATE INDEX "TaskOperationalBaseline_executionWorkflowKey_idx" ON "TaskOperationalBaseline"("executionWorkflowKey");

-- CreateIndex
CREATE INDEX "TaskWorkSession_taskId_idx" ON "TaskWorkSession"("taskId");

-- CreateIndex
CREATE INDEX "TaskWorkSession_userId_status_idx" ON "TaskWorkSession"("userId", "status");

-- CreateIndex
CREATE INDEX "TaskQualityReview_taskId_idx" ON "TaskQualityReview"("taskId");

-- CreateIndex
CREATE INDEX "TaskQualityReview_reviewerId_idx" ON "TaskQualityReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskQualityReview_submissionId_reviewSequence_key" ON "TaskQualityReview"("submissionId", "reviewSequence");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOperationalActual_taskId_key" ON "TaskOperationalActual"("taskId");

-- CreateIndex
CREATE INDEX "TaskOperationalActual_executionWorkflowKey_idx" ON "TaskOperationalActual"("executionWorkflowKey");

-- CreateIndex
CREATE INDEX "TaskOperationalActual_outcomeClass_idx" ON "TaskOperationalActual"("outcomeClass");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowCalibrationProfile_executionWorkflowKey_key" ON "WorkflowCalibrationProfile"("executionWorkflowKey");

-- CreateIndex
CREATE INDEX "WorkflowCalibrationProfile_calibrationLevel_idx" ON "WorkflowCalibrationProfile"("calibrationLevel");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowCalibrationStratum_profileId_dimension_policyVersio_key" ON "WorkflowCalibrationStratum"("profileId", "dimension", "policyVersion");

-- CreateIndex
CREATE INDEX "AiUsage_operationId_idx" ON "AiUsage"("operationId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOperationalBaseline" ADD CONSTRAINT "TaskOperationalBaseline_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOperationalBaseline" ADD CONSTRAINT "TaskOperationalBaseline_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TaskAcceptanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkSession" ADD CONSTRAINT "TaskWorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskQualityReview" ADD CONSTRAINT "TaskQualityReview_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskQualityReview" ADD CONSTRAINT "TaskQualityReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOperationalActual" ADD CONSTRAINT "TaskOperationalActual_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowCalibrationStratum" ADD CONSTRAINT "WorkflowCalibrationStratum_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "WorkflowCalibrationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex


-- ─────────────────────────────────────────────────────────────────────────
-- INDEX PARTIELS (SQL-only)

-- Une seule session ouverte par (task, user, role). C'est la garantie de
-- non-concurrence des timers : deux starts paralleles -> un P2002.
CREATE UNIQUE INDEX "TaskWorkSession_one_open_per_actor"
  ON "TaskWorkSession"("taskId", "userId", "role")
  WHERE "status" IN ('active', 'paused');

-- Une tentative comptabilisee UNE FOIS. Un P2002 ici est un BUG (compteur de
-- tentative non incremente), jamais une condition normale a avaler. Partiel :
-- les lignes d'intake (operationId NULL) restent libres.
CREATE UNIQUE INDEX "AiUsage_operation_attempt_key"
  ON "AiUsage"("operationId", "attempt")
  WHERE "operationId" IS NOT NULL;
