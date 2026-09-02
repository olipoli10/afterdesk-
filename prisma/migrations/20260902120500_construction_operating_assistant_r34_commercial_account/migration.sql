-- R34 Construction commercial account. Additive and forward-only.

CREATE TABLE "ConstructionCommercialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "planHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARED',
    "periodStartsAt" TIMESTAMP(3) NOT NULL,
    "periodEndsAt" TIMESTAMP(3) NOT NULL,
    "accountVersion" INTEGER NOT NULL DEFAULT 1,
    "featureSnapshot" JSONB NOT NULL,
    "usageMetricSnapshot" JSONB NOT NULL,
    "priceState" TEXT NOT NULL DEFAULT 'PRICE_NOT_SET',
    "monthlyPriceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "billingProvider" TEXT NOT NULL DEFAULT 'DISABLED_LOCAL',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionCommercialAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionCommercialDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expectedAccountVersion" INTEGER NOT NULL,
    "resultingAccountVersion" INTEGER NOT NULL,
    "priorSnapshot" JSONB,
    "nextSnapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "decisionFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionCommercialDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionCommercialAccount_workspaceId_key" ON "ConstructionCommercialAccount"("workspaceId");
CREATE INDEX "ConstructionCommercialAccount_state_updatedAt_idx" ON "ConstructionCommercialAccount"("state", "updatedAt");
CREATE INDEX "ConstructionCommercialAccount_planKey_planVersion_idx" ON "ConstructionCommercialAccount"("planKey", "planVersion");
CREATE UNIQUE INDEX "ConstructionCommercialDecision_workspaceId_commandId_key" ON "ConstructionCommercialDecision"("workspaceId", "commandId");
CREATE INDEX "ConstructionCommercialDecision_workspaceId_createdAt_idx" ON "ConstructionCommercialDecision"("workspaceId", "createdAt");
CREATE INDEX "ConstructionCommercialDecision_accountId_resultingAccountVersion_idx" ON "ConstructionCommercialDecision"("accountId", "resultingAccountVersion");

ALTER TABLE "ConstructionCommercialAccount" ADD CONSTRAINT "ConstructionCommercialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommercialAccount" ADD CONSTRAINT "ConstructionCommercialAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommercialDecision" ADD CONSTRAINT "ConstructionCommercialDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommercialDecision" ADD CONSTRAINT "ConstructionCommercialDecision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConstructionCommercialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCommercialDecision" ADD CONSTRAINT "ConstructionCommercialDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
