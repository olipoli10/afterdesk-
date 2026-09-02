-- R30 tenant privacy control plane: forward-only policy and adjudication state.
CREATE TABLE "ConstructionPrivacyPolicySet" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "policyHash" TEXT NOT NULL,
    "sourcePolicySetId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "activatedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionPrivacyPolicySet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionPrivacyRetentionRule" (
    "id" TEXT NOT NULL,
    "policySetId" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "deletionMode" TEXT NOT NULL,
    "holdBehavior" TEXT NOT NULL,
    "ruleHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionPrivacyRetentionRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionPrivacyRetentionRule_retention_positive" CHECK ("retentionDays" > 0)
);

CREATE TABLE "ConstructionPrivacyOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionPrivacyOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionPrivacyRefusal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "refusalCode" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionPrivacyRefusal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionPrivacyDeletionRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policySetId" TEXT NOT NULL,
    "policySetVersion" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "eligibilityFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reasonCodes" TEXT[] NOT NULL,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionPrivacyDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionPrivacyTombstone" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deletionRequestId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "externalDeletionState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "tombstonedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionPrivacyTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionPrivacyPolicySet_workspaceId_version_key" ON "ConstructionPrivacyPolicySet"("workspaceId", "version");
CREATE UNIQUE INDEX "ConstructionPrivacyPolicySet_id_workspaceId_key" ON "ConstructionPrivacyPolicySet"("id", "workspaceId");
CREATE INDEX "ConstructionPrivacyPolicySet_workspaceId_status_version_idx" ON "ConstructionPrivacyPolicySet"("workspaceId", "status", "version");
CREATE UNIQUE INDEX "ConstructionPrivacyPolicySet_one_active" ON "ConstructionPrivacyPolicySet"("workspaceId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "ConstructionPrivacyRetentionRule_policySetId_dataClass_key" ON "ConstructionPrivacyRetentionRule"("policySetId", "dataClass");
CREATE INDEX "ConstructionPrivacyRetentionRule_dataClass_retentionDays_idx" ON "ConstructionPrivacyRetentionRule"("dataClass", "retentionDays");
CREATE UNIQUE INDEX "ConstructionPrivacyOperation_workspaceId_commandId_key" ON "ConstructionPrivacyOperation"("workspaceId", "commandId");
CREATE INDEX "ConstructionPrivacyOperation_workspaceId_operationKind_createdAt_idx" ON "ConstructionPrivacyOperation"("workspaceId", "operationKind", "createdAt");
CREATE INDEX "ConstructionPrivacyRefusal_workspaceId_operationKind_createdAt_idx" ON "ConstructionPrivacyRefusal"("workspaceId", "operationKind", "createdAt");
CREATE INDEX "ConstructionPrivacyRefusal_operationId_createdAt_idx" ON "ConstructionPrivacyRefusal"("operationId", "createdAt");
CREATE INDEX "ConstructionPrivacyDeletionRequest_workspaceId_status_requestedAt_idx" ON "ConstructionPrivacyDeletionRequest"("workspaceId", "status", "requestedAt");
CREATE INDEX "ConstructionPrivacyDeletionRequest_workspaceId_targetType_targetId_idx" ON "ConstructionPrivacyDeletionRequest"("workspaceId", "targetType", "targetId");
CREATE UNIQUE INDEX "ConstructionPrivacyDeletionRequest_one_active_target" ON "ConstructionPrivacyDeletionRequest"("workspaceId", "targetType", "targetId") WHERE "status" IN ('REQUESTED','BLOCKED','ELIGIBLE','APPROVED');
CREATE UNIQUE INDEX "ConstructionPrivacyTombstone_deletionRequestId_key" ON "ConstructionPrivacyTombstone"("deletionRequestId");
CREATE UNIQUE INDEX "ConstructionPrivacyTombstone_workspaceId_targetType_targetId_key" ON "ConstructionPrivacyTombstone"("workspaceId", "targetType", "targetId");
CREATE INDEX "ConstructionPrivacyTombstone_workspaceId_tombstonedAt_idx" ON "ConstructionPrivacyTombstone"("workspaceId", "tombstonedAt");

ALTER TABLE "ConstructionPrivacyPolicySet" ADD CONSTRAINT "ConstructionPrivacyPolicySet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyRetentionRule" ADD CONSTRAINT "ConstructionPrivacyRetentionRule_policySetId_fkey" FOREIGN KEY ("policySetId") REFERENCES "ConstructionPrivacyPolicySet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyOperation" ADD CONSTRAINT "ConstructionPrivacyOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyRefusal" ADD CONSTRAINT "ConstructionPrivacyRefusal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyDeletionRequest" ADD CONSTRAINT "ConstructionPrivacyDeletionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyDeletionRequest" ADD CONSTRAINT "ConstructionPrivacyDeletionRequest_policySetId_workspaceId_fkey" FOREIGN KEY ("policySetId", "workspaceId") REFERENCES "ConstructionPrivacyPolicySet"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyTombstone" ADD CONSTRAINT "ConstructionPrivacyTombstone_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionPrivacyTombstone" ADD CONSTRAINT "ConstructionPrivacyTombstone_deletionRequestId_fkey" FOREIGN KEY ("deletionRequestId") REFERENCES "ConstructionPrivacyDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
