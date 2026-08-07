-- PHASE 1D-α0 — FONDATION D'EXÉCUTION : BUDGET, ÉTAT DE DÉPENSE, TAXONOMIE D'ERREUR.
--
-- Strictement additive. Aucun DROP TABLE, aucun DROP COLUMN, aucun RENAME.
--
-- NOTE SUR LA GÉNÉRATION : `prisma migrate diff` produit trois instructions de
-- plus, exactement comme en 1B et en 1C, et elles sont retirées ici pour la
-- même raison. Deux DROP INDEX (StandingCapacityPayment_accountId_periodStart_idx
-- et TaskEmbedding_embedding_hnsw_idx) et un RENAME INDEX décrivent une dérive
-- entre l'introspection de Prisma et des index créés à la main en SQL : l'index
-- HNSW de pgvector n'est pas exprimable dans le schéma Prisma, et le supprimer
-- rendrait la recherche de similarité de tarification lente sans que rien ne le
-- signale. Cette migration ne touche donc à aucun index préexistant.

-- CreateEnum
CREATE TYPE "ProviderErrorClass" AS ENUM ('auth', 'quota', 'rate_limit', 'timeout', 'bad_request', 'provider_5xx', 'unknown');

-- CreateEnum
CREATE TYPE "InvocationDispatchState" AS ENUM ('settled', 'cancelled_before_dispatch', 'dispatched_then_cancelled', 'unaccounted');

-- CreateEnum
CREATE TYPE "WorkflowBudgetHoldStatus" AS ENUM ('held', 'settled', 'released');

-- AlterTable
-- `dispatchState` prend 'settled' par défaut, y compris pour les lignes déjà en
-- base : elles ont toutes une réponse lue et un coût mesuré, donc ce défaut les
-- décrit correctement sans backfill.
ALTER TABLE "TaskToolInvocation" ADD COLUMN     "dispatchState" "InvocationDispatchState" NOT NULL DEFAULT 'settled',
ADD COLUMN     "errorClass" "ProviderErrorClass",
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "httpStatus" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
-- Nullable des deux côtés : un run compilé avant cette migration n'a pas de
-- plafond gelé, et NULL veut dire « aucune dépense autorisée », pas
-- « illimité ». reserveSpend refuse contre NULL.
ALTER TABLE "TaskWorkflowRun" ADD COLUMN     "budgetPolicyVersion" TEXT,
ADD COLUMN     "runAutomationBudgetMicros" INTEGER;

-- CreateTable
CREATE TABLE "WorkflowBudgetHold" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepRunId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "operationKey" TEXT NOT NULL,
    "amountMicros" INTEGER NOT NULL,
    "status" "WorkflowBudgetHoldStatus" NOT NULL DEFAULT 'held',
    "settledMicros" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowBudgetHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowBudgetHold_runId_status_idx" ON "WorkflowBudgetHold"("runId", "status");

-- CreateIndex
-- L'unicité qui rend la réservation idempotente : un rejeu de la même
-- tentative retombe sur le hold existant au lieu d'en empiler un second.
CREATE UNIQUE INDEX "WorkflowBudgetHold_stepRunId_attempt_operationKey_key" ON "WorkflowBudgetHold"("stepRunId", "attempt", "operationKey");

-- CreateIndex
CREATE INDEX "TaskToolInvocation_dispatchState_idx" ON "TaskToolInvocation"("dispatchState");

-- AddForeignKey
ALTER TABLE "WorkflowBudgetHold" ADD CONSTRAINT "WorkflowBudgetHold_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TaskWorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
