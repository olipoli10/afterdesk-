CREATE TABLE "ConstructionAccountingAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "tenantRef" TEXT NOT NULL,
    "capabilities" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PREPARED_DISABLED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "cursorRef" TEXT,
    "cursorVersion" INTEGER NOT NULL DEFAULT 0,
    "credentialStored" BOOLEAN NOT NULL DEFAULT false,
    "externalWriteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preparedByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionAccountingAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAccountingAccount_local_only" CHECK ("credentialStored" = false AND "externalWriteEnabled" = false),
    CONSTRAINT "ConstructionAccountingAccount_provider" CHECK ("provider" IN ('QUICKBOOKS_ONLINE', 'XERO')),
    CONSTRAINT "ConstructionAccountingAccount_status" CHECK ("status" IN ('PREPARED_DISABLED', 'SYNC_REQUIRED', 'REVOKED'))
);

CREATE TABLE "ConstructionAccountingObservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entityRef" TEXT NOT NULL,
    "cursorRef" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT,
    "contactId" TEXT,
    "receivableId" TEXT,
    "documentNumberHash" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "observedStatus" TEXT NOT NULL,
    "suppliedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "adapterFingerprint" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchReason" TEXT NOT NULL,
    "canonicalEffectApplied" BOOLEAN NOT NULL DEFAULT false,
    "externalWritePerformed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionAccountingObservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAccountingObservation_amount" CHECK ("amountMinor" > 0),
    CONSTRAINT "ConstructionAccountingObservation_kind" CHECK ("kind" IN ('INVOICE', 'PAYMENT')),
    CONSTRAINT "ConstructionAccountingObservation_match" CHECK ("matchStatus" IN ('EXACT', 'PARTIAL', 'UNMATCHED', 'AMBIGUOUS', 'OVERPAYMENT', 'CONFLICT_REQUIRES_REVIEW', 'REFUSED')),
    CONSTRAINT "ConstructionAccountingObservation_no_external_write" CHECK ("externalWritePerformed" = false)
);

CREATE TABLE "ConstructionAccountingDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT,
    "receivableId" TEXT NOT NULL,
    "observationId" TEXT,
    "expectedReceivableVersion" INTEGER NOT NULL,
    "selectedEvidenceIds" TEXT[],
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED_UNPOSTED',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "canonicalEffectApplied" BOOLEAN NOT NULL DEFAULT false,
    "canonicalEffectId" TEXT,
    "externalEffectCount" INTEGER NOT NULL DEFAULT 0,
    "externalWritePerformed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionAccountingDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAccountingDraft_kind" CHECK ("kind" IN ('INVOICE', 'RECONCILIATION')),
    CONSTRAINT "ConstructionAccountingDraft_status" CHECK ("status" IN ('PREPARED_UNPOSTED', 'APPROVED_UNPOSTED')),
    CONSTRAINT "ConstructionAccountingDraft_no_external_write" CHECK ("externalEffectCount" = 0 AND "externalWritePerformed" = false)
);

CREATE TABLE "ConstructionAccountingDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "stateBefore" TEXT,
    "stateAfter" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionAccountingDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionAccountingRefusal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "refusalCode" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionAccountingRefusal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAccountingRefusal_hash" CHECK ("inputHash" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "ConstructionAccountingAccount_workspaceId_provider_accountRef_key" ON "ConstructionAccountingAccount"("workspaceId", "provider", "accountRef");
CREATE INDEX "ConstructionAccountingAccount_workspaceId_status_createdAt_idx" ON "ConstructionAccountingAccount"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "ConstructionAccountingObservation_workspaceId_observationId_key" ON "ConstructionAccountingObservation"("workspaceId", "observationId");
CREATE UNIQUE INDEX "ConstructionAccountingObservation_accountId_entityRef_key" ON "ConstructionAccountingObservation"("accountId", "entityRef");
CREATE INDEX "ConstructionAccountingObservation_workspaceId_matchStatus_suppliedAt_idx" ON "ConstructionAccountingObservation"("workspaceId", "matchStatus", "suppliedAt");
CREATE INDEX "ConstructionAccountingObservation_receivableId_suppliedAt_idx" ON "ConstructionAccountingObservation"("receivableId", "suppliedAt");
CREATE UNIQUE INDEX "ConstructionAccountingDraft_workspaceId_commandId_key" ON "ConstructionAccountingDraft"("workspaceId", "commandId");
CREATE INDEX "ConstructionAccountingDraft_workspaceId_status_createdAt_idx" ON "ConstructionAccountingDraft"("workspaceId", "status", "createdAt");
CREATE INDEX "ConstructionAccountingDraft_receivableId_kind_createdAt_idx" ON "ConstructionAccountingDraft"("receivableId", "kind", "createdAt");
CREATE UNIQUE INDEX "ConstructionAccountingDecision_workspaceId_commandId_key" ON "ConstructionAccountingDecision"("workspaceId", "commandId");
CREATE INDEX "ConstructionAccountingDecision_workspaceId_entityType_entityId_createdAt_idx" ON "ConstructionAccountingDecision"("workspaceId", "entityType", "entityId", "createdAt");
CREATE INDEX "ConstructionAccountingRefusal_workspaceId_operationKind_createdAt_idx" ON "ConstructionAccountingRefusal"("workspaceId", "operationKind", "createdAt");
CREATE INDEX "ConstructionAccountingRefusal_workspaceId_operationId_createdAt_idx" ON "ConstructionAccountingRefusal"("workspaceId", "operationId", "createdAt");

ALTER TABLE "ConstructionAccountingAccount" ADD CONSTRAINT "ConstructionAccountingAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAccountingObservation" ADD CONSTRAINT "ConstructionAccountingObservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAccountingObservation" ADD CONSTRAINT "ConstructionAccountingObservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConstructionAccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionAccountingDraft" ADD CONSTRAINT "ConstructionAccountingDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAccountingDraft" ADD CONSTRAINT "ConstructionAccountingDraft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConstructionAccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionAccountingRefusal" ADD CONSTRAINT "ConstructionAccountingRefusal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
