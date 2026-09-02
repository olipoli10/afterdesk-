-- R32 contractor onboarding and bounded import. Additive and forward-only.

CREATE TABLE "ConstructionOnboardingSession" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'COMPANY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "nextAction" TEXT NOT NULL DEFAULT 'INITIALIZE_WORKSPACE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionOnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionOnboardingCommand" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "resultFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionOnboardingCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "registryVersion" INTEGER NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceByteCount" INTEGER NOT NULL,
    "headerMapping" JSONB NOT NULL,
    "previewFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "rowCount" INTEGER NOT NULL,
    "readyCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "conflictCount" INTEGER NOT NULL,
    "invalidCount" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionImportRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "normalizedProposal" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "reasonCodes" TEXT[] NOT NULL,
    "candidateCanonicalIds" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionImportRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionImportDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "matchedCanonicalId" TEXT,
    "expectedBatchVersion" INTEGER NOT NULL,
    "decisionHash" TEXT NOT NULL,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionImportDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionImportCommit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "previewFingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "resultFingerprint" TEXT NOT NULL,
    "createdProjectIds" TEXT[] NOT NULL,
    "createdContactIds" TEXT[] NOT NULL,
    "reusedCanonicalIds" TEXT[] NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "committedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionImportCommit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionOnboardingSession_ownerUserId_key" ON "ConstructionOnboardingSession"("ownerUserId");
CREATE UNIQUE INDEX "ConstructionOnboardingSession_workspaceId_key" ON "ConstructionOnboardingSession"("workspaceId");
CREATE INDEX "ConstructionOnboardingSession_status_updatedAt_idx" ON "ConstructionOnboardingSession"("status", "updatedAt");
CREATE UNIQUE INDEX "ConstructionOnboardingCommand_ownerUserId_commandId_key" ON "ConstructionOnboardingCommand"("ownerUserId", "commandId");
CREATE INDEX "ConstructionOnboardingCommand_workspaceId_action_createdAt_idx" ON "ConstructionOnboardingCommand"("workspaceId", "action", "createdAt");
CREATE UNIQUE INDEX "ConstructionImportBatch_workspaceId_sourceHash_kind_parserVersion_key" ON "ConstructionImportBatch"("workspaceId", "sourceHash", "kind", "parserVersion");
CREATE INDEX "ConstructionImportBatch_workspaceId_status_createdAt_idx" ON "ConstructionImportBatch"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "ConstructionImportRow_batchId_rowNumber_key" ON "ConstructionImportRow"("batchId", "rowNumber");
CREATE UNIQUE INDEX "ConstructionImportRow_batchId_rowFingerprint_key" ON "ConstructionImportRow"("batchId", "rowFingerprint");
CREATE INDEX "ConstructionImportRow_workspaceId_state_createdAt_idx" ON "ConstructionImportRow"("workspaceId", "state", "createdAt");
CREATE UNIQUE INDEX "ConstructionImportDecision_batchId_rowId_expectedBatchVersion_key" ON "ConstructionImportDecision"("batchId", "rowId", "expectedBatchVersion");
CREATE INDEX "ConstructionImportDecision_workspaceId_batchId_createdAt_idx" ON "ConstructionImportDecision"("workspaceId", "batchId", "createdAt");
CREATE UNIQUE INDEX "ConstructionImportCommit_batchId_key" ON "ConstructionImportCommit"("batchId");
CREATE UNIQUE INDEX "ConstructionImportCommit_workspaceId_commandId_key" ON "ConstructionImportCommit"("workspaceId", "commandId");
CREATE INDEX "ConstructionImportCommit_workspaceId_createdAt_idx" ON "ConstructionImportCommit"("workspaceId", "createdAt");

ALTER TABLE "ConstructionOnboardingSession" ADD CONSTRAINT "ConstructionOnboardingSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionOnboardingCommand" ADD CONSTRAINT "ConstructionOnboardingCommand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionImportBatch" ADD CONSTRAINT "ConstructionImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionImportRow" ADD CONSTRAINT "ConstructionImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ConstructionImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionImportDecision" ADD CONSTRAINT "ConstructionImportDecision_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ConstructionImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionImportDecision" ADD CONSTRAINT "ConstructionImportDecision_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "ConstructionImportRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionImportCommit" ADD CONSTRAINT "ConstructionImportCommit_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ConstructionImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
