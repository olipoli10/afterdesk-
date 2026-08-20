-- R5 — le disjoncteur de dépense fournisseur au niveau compte.
-- Purement additif : une nouvelle table autonome, aucune FK vers une table
-- existante, aucun enum nouveau (réutilise WorkflowBudgetHoldStatus), aucune
-- colonne touchée sur une table existante. Rien à recalculer pour les
-- contrats déjà acceptés.

-- CreateTable
CREATE TABLE "AccountProviderSpendHold" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "status" "WorkflowBudgetHoldStatus" NOT NULL DEFAULT 'held',
    "settledMicros" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProviderSpendHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- L'unicité qui rend la réservation idempotente : un rejeu de la même
-- tentative retombe sur le hold existant au lieu d'en empiler un second —
-- même idiome que WorkflowBudgetHold_stepRunId_attempt_operationKey_key.
CREATE UNIQUE INDEX "AccountProviderSpendHold_provider_operationKey_attempt_key" ON "AccountProviderSpendHold"("provider", "operationKey", "attempt");

-- CreateIndex
-- Sert l'agrégat "committed" (held+settled) borné à (provider, periodKey),
-- exécuté sous le verrou consultatif à chaque réservation.
CREATE INDEX "AccountProviderSpendHold_provider_periodKey_status_idx" ON "AccountProviderSpendHold"("provider", "periodKey", "status");
