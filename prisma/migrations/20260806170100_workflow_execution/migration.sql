-- PHASE 1B (2/3) — TABLES ET COLONNES D'EXÉCUTION.
--
-- Entièrement additif : quatre tables neuves et des colonnes nullables ou avec
-- défaut sur des tables existantes. Aucun DROP, aucun RENAME, aucune contrainte
-- NOT NULL ajoutée sur une colonne existante — les lignes déjà en base restent
-- valides sans remplissage.
--
-- Les deux DROP INDEX et le RENAME INDEX que `prisma migrate diff` proposait
-- ont été RETIRÉS À LA MAIN : ils sont une dérive préexistante entre le schéma
-- et la base (dont l'index vectoriel HNSW de TaskEmbedding, qui porte la
-- recherche de tâches de référence). Les appliquer casserait le RAG de la
-- Phase 1A pour rien.


-- CreateEnum
CREATE TYPE "WorkflowArtifactVisibility" AS ENUM ('admin_only', 'worker_after_claim', 'deliverable_candidate');

-- CreateEnum
CREATE TYPE "TaskWorkflowRunStatus" AS ENUM ('compiling', 'running', 'awaiting_human', 'paused', 'abandoned', 'done');

-- CreateEnum
CREATE TYPE "TaskWorkflowStepStatus" AS ENUM ('pending', 'ready', 'running', 'done', 'failed', 'handed_to_human');

-- CreateEnum
CREATE TYPE "WorkflowExecutionMode" AS ENUM ('automated', 'human');

-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN     "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "costMicros" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'anthropic',
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'intake',
ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "artifactVisibility" "WorkflowArtifactVisibility",
ADD COLUMN     "workflowRunId" TEXT,
ADD COLUMN     "workflowStepRunId" TEXT;

-- AlterTable
ALTER TABLE "TaskExecutionPlanStep" ADD COLUMN     "fixedMinutes" INTEGER,
ADD COLUMN     "primitiveId" TEXT,
ADD COLUMN     "primitiveVersion" INTEGER,
ADD COLUMN     "secondsPerUnit" INTEGER;

-- CreateTable
CREATE TABLE "TaskWorkflowRun" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "status" "TaskWorkflowRunStatus" NOT NULL DEFAULT 'compiling',
    "automatedStepCount" INTEGER NOT NULL DEFAULT 0,
    "humanStepCount" INTEGER NOT NULL DEFAULT 0,
    "unitsTotal" INTEGER,
    "unitsResolvedAutomatically" INTEGER,
    "actualAiCostMicros" INTEGER NOT NULL DEFAULT 0,
    "actualToolCostMicros" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,
    "compiledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskWorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "planStepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "primitiveId" TEXT,
    "primitiveVersion" INTEGER,
    "executionMode" "WorkflowExecutionMode" NOT NULL,
    "status" "TaskWorkflowStepStatus" NOT NULL DEFAULT 'pending',
    "handoffReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "inputSummary" JSONB,
    "outputSummary" JSONB,
    "actualCostMicros" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskWorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskToolInvocation" (
    "id" TEXT NOT NULL,
    "stepRunId" TEXT NOT NULL,
    "primitiveId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "providerIdempotencyKey" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskToolInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskHumanWorkPackage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "whatIsAlreadyDone" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "checklist" TEXT[],
    "unitsRemaining" INTEGER NOT NULL,
    "unitsTotal" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "computedPayoutCents" INTEGER NOT NULL,
    "reservedBudgetCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHumanWorkPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskWorkflowRun_snapshotId_key" ON "TaskWorkflowRun"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskWorkflowRun_taskId_key" ON "TaskWorkflowRun"("taskId");

-- CreateIndex
CREATE INDEX "TaskWorkflowRun_status_idx" ON "TaskWorkflowRun"("status");

-- CreateIndex
CREATE INDEX "TaskWorkflowRun_taskId_idx" ON "TaskWorkflowRun"("taskId");

-- CreateIndex
CREATE INDEX "TaskWorkflowStepRun_status_nextAttemptAt_idx" ON "TaskWorkflowStepRun"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TaskWorkflowStepRun_leaseExpiresAt_idx" ON "TaskWorkflowStepRun"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskWorkflowStepRun_runId_order_key" ON "TaskWorkflowStepRun"("runId", "order");

-- CreateIndex
CREATE INDEX "TaskToolInvocation_stepRunId_idx" ON "TaskToolInvocation"("stepRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskToolInvocation_stepRunId_operationKey_attempt_key" ON "TaskToolInvocation"("stepRunId", "operationKey", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskHumanWorkPackage_runId_key" ON "TaskHumanWorkPackage"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskHumanWorkPackage_taskId_key" ON "TaskHumanWorkPackage"("taskId");

-- CreateIndex
CREATE INDEX "TaskHumanWorkPackage_taskId_idx" ON "TaskHumanWorkPackage"("taskId");

-- CreateIndex
CREATE INDEX "AiUsage_taskId_idx" ON "AiUsage"("taskId");

-- CreateIndex
CREATE INDEX "File_workflowRunId_idx" ON "File"("workflowRunId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "TaskWorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_workflowStepRunId_fkey" FOREIGN KEY ("workflowStepRunId") REFERENCES "TaskWorkflowStepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkflowRun" ADD CONSTRAINT "TaskWorkflowRun_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TaskAcceptanceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkflowRun" ADD CONSTRAINT "TaskWorkflowRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkflowRun" ADD CONSTRAINT "TaskWorkflowRun_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "TaskExecutionPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkflowStepRun" ADD CONSTRAINT "TaskWorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TaskWorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWorkflowStepRun" ADD CONSTRAINT "TaskWorkflowStepRun_planStepId_fkey" FOREIGN KEY ("planStepId") REFERENCES "TaskExecutionPlanStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskToolInvocation" ADD CONSTRAINT "TaskToolInvocation_stepRunId_fkey" FOREIGN KEY ("stepRunId") REFERENCES "TaskWorkflowStepRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHumanWorkPackage" ADD CONSTRAINT "TaskHumanWorkPackage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TaskWorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHumanWorkPackage" ADD CONSTRAINT "TaskHumanWorkPackage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

