-- AI WORK ENGINE — Phase 1A : moteur de devis et de planification.
--
-- Purement ADDITIF. Aucune table existante n'est modifiée hors l'ajout d'une
-- colonne nullable sur "Task" (quotedPlanVersionId), aucune transition de la
-- machine à états ne change, aucun trigger existant n'est touché.
--
-- Ce que cette migration installe, et pourquoi :
--
-- 1. La lecture structurée du brief (TaskAiClassification) : jusqu'ici la
--    suggestion IA était un seul appel produisant une fourchette de prix ;
--    l'admin décidait sans vue décomposée. La classification est la première
--    marche d'un pipeline en étapes dont chaque sortie est un objet contraint
--    par schéma, pas de la prose.
--
-- 2. Le plan d'exécution VERSIONNÉ (TaskExecutionPlanVersion + Step) :
--    append-only. Une édition admin insère la version N+1 (parentVersionId
--    pointe la version modifiée, editedByAdminId dit qui) — jamais de
--    mutation. L'écart entre ce que l'IA a proposé et ce que l'admin a envoyé
--    devient une donnée, qui servira plus tard à calibrer les estimations.
--
-- 3. La critique conditionnelle (TaskExecutionPlanCritique) : un second
--    passage adversarial, déclenché seulement pour les briefs complexes,
--    coûteux, ambigus, sensibles ou à faible confiance — jamais
--    systématique. `provider` par défaut "anthropic" ; un second fournisseur
--    sera une valeur de colonne, pas une migration.
--
-- 4. LE CONTRAT (TaskAcceptanceSnapshot) : la copie figée de tout ce que le
--    client a vu au moment d'accepter le devis — prix, périmètre, quantité,
--    livrable, hypothèses, exclusions, standard de litige, et les fenêtres de
--    correction EN VIGUEUR À CE MOMENT (l'admin peut changer les settings
--    ensuite ; le contrat du client, non). Immuable par trigger, même
--    mécanique que le grand livre (second_shift_ledger_immutable) : c'est le
--    seul enregistrement de cette migration qui engage quelque chose envers
--    un client, donc le seul qui mérite la protection la plus dure.
--
-- L'enum QuoteTier n'a volontairement PAS de valeur 'auto' : le devis
-- automatique est interdit tant qu'aucun workflow n'a une erreur d'estimation
-- mesurée sur de vraies exécutions. L'interdit est structurel, pas
-- disciplinaire.

-- CreateEnum
CREATE TYPE "AiVerificationLevel" AS ENUM ('light', 'standard', 'rigorous');

-- CreateEnum
CREATE TYPE "QuoteTier" AS ENUM ('assisted', 'manual');

-- CreateEnum
CREATE TYPE "PlanVersionSource" AS ENUM ('ai_generated', 'admin_edited');

-- CreateEnum
CREATE TYPE "PlanStepExecutor" AS ENUM ('ai', 'human', 'deterministic_code');

-- CreateEnum
CREATE TYPE "PlanStepHumanRole" AS ENUM ('worker', 'specialist', 'reviewer', 'admin');

-- CreateEnum
CREATE TYPE "PlanStepRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CritiqueSeverity" AS ENUM ('none', 'minor', 'major', 'blocking');

-- CreateEnum
CREATE TYPE "CostCalibration" AS ENUM ('uncalibrated', 'partial', 'calibrated');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "quotedPlanVersionId" TEXT;

-- CreateTable
CREATE TABLE "TaskAiClassification" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "categorySlugGuess" TEXT,
    "objective" TEXT NOT NULL,
    "deliverableFormat" TEXT NOT NULL,
    "requiredFields" TEXT[],
    "quantityInterpreted" INTEGER,
    "geography" TEXT[],
    "verificationLevel" "AiVerificationLevel" NOT NULL,
    "sourceRequirements" TEXT[],
    "sensitiveData" BOOLEAN NOT NULL,
    "requiredAccess" TEXT[],
    "missingInformation" TEXT[],
    "assumptions" TEXT[],
    "quoteTier" "QuoteTier" NOT NULL,
    "confidence" "AiConfidence" NOT NULL,
    "model" TEXT NOT NULL,
    "rawOutput" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAiClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExecutionPlanVersion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "PlanVersionSource" NOT NULL,
    "parentVersionId" TEXT,
    "editedByAdminId" TEXT,
    "editNote" TEXT,
    "deliverableDescription" TEXT NOT NULL,
    "assumptions" TEXT[],
    "exclusions" TEXT[],
    "internalCostLikelyCents" INTEGER NOT NULL,
    "internalCostConservativeCents" INTEGER NOT NULL,
    "suggestedPriceCents" INTEGER NOT NULL,
    "suggestedVaPayoutCents" INTEGER NOT NULL,
    "calibration" "CostCalibration" NOT NULL,
    "model" TEXT,
    "rawOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExecutionPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExecutionPlanStep" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "executor" "PlanStepExecutor" NOT NULL,
    "humanRole" "PlanStepHumanRole",
    "tool" TEXT,
    "estimatedMinutesOptimistic" INTEGER NOT NULL,
    "estimatedMinutesLikely" INTEGER NOT NULL,
    "estimatedMinutesConservative" INTEGER NOT NULL,
    "estimatedAiCostCents" INTEGER NOT NULL DEFAULT 0,
    "estimatedToolUnits" INTEGER NOT NULL DEFAULT 0,
    "verificationMethod" TEXT NOT NULL,
    "acceptanceCriteria" TEXT[],
    "riskLevel" "PlanStepRiskLevel" NOT NULL,
    "riskNote" TEXT,
    "dependsOnOrder" INTEGER[],

    CONSTRAINT "TaskExecutionPlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExecutionPlanCritique" (
    "id" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL,
    "missingSteps" TEXT[],
    "wrongToolFlags" TEXT[],
    "timeRiskFlags" TEXT[],
    "securityRiskFlags" TEXT[],
    "overallAssessment" TEXT NOT NULL,
    "severity" "CritiqueSeverity" NOT NULL,
    "rawOutput" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExecutionPlanCritique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAcceptanceSnapshot" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "planVersionId" TEXT,
    "clientPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" TEXT,
    "clientDeadlineUtc" TIMESTAMP(3),
    "deliverableDescription" TEXT,
    "assumptions" TEXT[],
    "exclusions" TEXT[],
    "disputeCriteria" TEXT,
    "revisionWindowHours" INTEGER NOT NULL,
    "maxRevisionRounds" INTEGER NOT NULL,
    "disputeWindowHours" INTEGER NOT NULL,
    "acceptedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAcceptanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskAiClassification_taskId_key" ON "TaskAiClassification"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExecutionPlanVersion_taskId_version_key" ON "TaskExecutionPlanVersion"("taskId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExecutionPlanStep_planVersionId_order_key" ON "TaskExecutionPlanStep"("planVersionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExecutionPlanCritique_planVersionId_key" ON "TaskExecutionPlanCritique"("planVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAcceptanceSnapshot_taskId_key" ON "TaskAcceptanceSnapshot"("taskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_quotedPlanVersionId_fkey" FOREIGN KEY ("quotedPlanVersionId") REFERENCES "TaskExecutionPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAiClassification" ADD CONSTRAINT "TaskAiClassification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecutionPlanVersion" ADD CONSTRAINT "TaskExecutionPlanVersion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecutionPlanVersion" ADD CONSTRAINT "TaskExecutionPlanVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "TaskExecutionPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecutionPlanStep" ADD CONSTRAINT "TaskExecutionPlanStep_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "TaskExecutionPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecutionPlanCritique" ADD CONSTRAINT "TaskExecutionPlanCritique_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "TaskExecutionPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAcceptanceSnapshot" ADD CONSTRAINT "TaskAcceptanceSnapshot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAcceptanceSnapshot" ADD CONSTRAINT "TaskAcceptanceSnapshot_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "TaskExecutionPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- Immutabilité du contrat d'acceptation.
--
-- Le snapshot est ce que le client a accepté ; s'il pouvait être modifié
-- après coup, il ne prouverait rien. UPDATE, DELETE et TRUNCATE sont refusés
-- au niveau de la base — pas seulement par convention applicative — parce
-- qu'un contrat qu'une requête SQL directe peut réécrire n'est pas un
-- contrat. Même patron exact que LedgerEntry_no_update_or_delete.
--
-- Effet assumé : la FK Task -> snapshot étant en RESTRICT et ce trigger
-- bloquant le DELETE, une tâche porteuse d'un snapshot devient effectivement
-- insupprimable. C'est voulu : les tâches ne sont jamais supprimées dans ce
-- produit (la relation client est déjà en RESTRICT), et un mandat accepté
-- encore moins.
CREATE OR REPLACE FUNCTION second_shift_acceptance_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TaskAcceptanceSnapshot is immutable — it is the record of what the client accepted';
END;
$$;

CREATE TRIGGER "TaskAcceptanceSnapshot_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "TaskAcceptanceSnapshot"
FOR EACH ROW EXECUTE FUNCTION second_shift_acceptance_snapshot_immutable();

CREATE TRIGGER "TaskAcceptanceSnapshot_no_truncate"
BEFORE TRUNCATE ON "TaskAcceptanceSnapshot"
FOR EACH STATEMENT EXECUTE FUNCTION second_shift_acceptance_snapshot_immutable();
