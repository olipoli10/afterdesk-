CREATE TABLE "ConstructionAuthorityPolicySet" (
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
    CONSTRAINT "ConstructionAuthorityPolicySet_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAuthorityPolicySet_status" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED')),
    CONSTRAINT "ConstructionAuthorityPolicySet_version" CHECK ("version" > 0 AND "stateVersion" > 0),
    CONSTRAINT "ConstructionAuthorityPolicySet_hash" CHECK ("policyHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "ConstructionAuthorityPolicyRule" (
    "id" TEXT NOT NULL,
    "policySetId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "projectId" TEXT,
    "roleScope" TEXT,
    "dataClassification" TEXT,
    "outcome" TEXT NOT NULL,
    "amountCeilingMinor" INTEGER,
    "reasonCode" TEXT NOT NULL,
    "ruleHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionAuthorityPolicyRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAuthorityPolicyRule_outcome" CHECK ("outcome" IN ('AUTOMATIC_INTERNAL', 'APPROVAL_REQUIRED', 'PROHIBITED')),
    CONSTRAINT "ConstructionAuthorityPolicyRule_role" CHECK ("roleScope" IS NULL OR "roleScope" IN ('OWNER', 'OFFICE_MANAGER', 'FIELD_WORKER')),
    CONSTRAINT "ConstructionAuthorityPolicyRule_data" CHECK ("dataClassification" IS NULL OR "dataClassification" IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')),
    CONSTRAINT "ConstructionAuthorityPolicyRule_ceiling" CHECK ("amountCeilingMinor" IS NULL OR "amountCeilingMinor" >= 0),
    CONSTRAINT "ConstructionAuthorityPolicyRule_hash" CHECK ("ruleHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "ConstructionAuthorityEvaluation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policySetId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "actionVersion" INTEGER NOT NULL,
    "projectId" TEXT,
    "targetRef" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "dataClassification" TEXT NOT NULL,
    "amountMinor" INTEGER,
    "sourceFingerprint" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "policySetVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
    "externalWritePerformed" BOOLEAN NOT NULL DEFAULT false,
    "providerEffectCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionAuthorityEvaluation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAuthorityEvaluation_outcome" CHECK ("outcome" IN ('AUTOMATIC_INTERNAL', 'APPROVAL_REQUIRED', 'PROHIBITED')),
    CONSTRAINT "ConstructionAuthorityEvaluation_status" CHECK ("status" IN ('AUTHORIZED_INTERNAL', 'PENDING_APPROVAL', 'PROHIBITED', 'APPROVED_LOCAL', 'REJECTED', 'EXPIRED', 'STALE')),
    CONSTRAINT "ConstructionAuthorityEvaluation_no_external_effect" CHECK ("externalTransportPerformed" = false AND "externalWritePerformed" = false AND "providerEffectCount" = 0),
    CONSTRAINT "ConstructionAuthorityEvaluation_amount" CHECK ("amountMinor" IS NULL OR "amountMinor" >= 0)
);

CREATE TABLE "ConstructionAuthorityDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "expectedEvaluationVersion" INTEGER NOT NULL,
    "expectedPolicySetVersion" INTEGER NOT NULL,
    "expectedPayloadHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "statusAfter" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "localAuthorizationEffectCount" INTEGER NOT NULL DEFAULT 1,
    "externalTransportPerformed" BOOLEAN NOT NULL DEFAULT false,
    "externalWritePerformed" BOOLEAN NOT NULL DEFAULT false,
    "providerEffectCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionAuthorityDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAuthorityDecision_kind" CHECK ("decision" IN ('APPROVE', 'REJECT')),
    CONSTRAINT "ConstructionAuthorityDecision_status" CHECK ("statusAfter" IN ('APPROVED_LOCAL', 'REJECTED')),
    CONSTRAINT "ConstructionAuthorityDecision_one_local_effect" CHECK ("localAuthorizationEffectCount" = 1),
    CONSTRAINT "ConstructionAuthorityDecision_no_external_effect" CHECK ("externalTransportPerformed" = false AND "externalWritePerformed" = false AND "providerEffectCount" = 0)
);

CREATE TABLE "ConstructionAuthorityRefusal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "refusalCode" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionAuthorityRefusal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionAuthorityRefusal_hash" CHECK ("inputHash" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "ConstructionAuthorityOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "operationKind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionAuthorityOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionAuthorityPolicySet_workspaceId_version_key" ON "ConstructionAuthorityPolicySet"("workspaceId", "version");
CREATE UNIQUE INDEX "ConstructionAuthorityPolicySet_one_active_per_workspace" ON "ConstructionAuthorityPolicySet"("workspaceId") WHERE "status" = 'ACTIVE';
CREATE INDEX "ConstructionAuthorityPolicySet_workspaceId_status_createdAt_idx" ON "ConstructionAuthorityPolicySet"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "ConstructionAuthorityPolicyRule_policySetId_ruleKey_key" ON "ConstructionAuthorityPolicyRule"("policySetId", "ruleKey");
CREATE INDEX "ConstructionAuthorityPolicyRule_policySetId_actionKey_outcome_idx" ON "ConstructionAuthorityPolicyRule"("policySetId", "actionKey", "outcome");
CREATE UNIQUE INDEX "ConstructionAuthorityEvaluation_workspaceId_commandId_key" ON "ConstructionAuthorityEvaluation"("workspaceId", "commandId");
CREATE INDEX "ConstructionAuthorityEvaluation_workspaceId_status_createdAt_idx" ON "ConstructionAuthorityEvaluation"("workspaceId", "status", "createdAt");
CREATE INDEX "ConstructionAuthorityEvaluation_policySetId_outcome_createdAt_idx" ON "ConstructionAuthorityEvaluation"("policySetId", "outcome", "createdAt");
CREATE UNIQUE INDEX "ConstructionAuthorityDecision_workspaceId_commandId_key" ON "ConstructionAuthorityDecision"("workspaceId", "commandId");
CREATE UNIQUE INDEX "ConstructionAuthorityDecision_evaluationId_key" ON "ConstructionAuthorityDecision"("evaluationId");
CREATE INDEX "ConstructionAuthorityDecision_workspaceId_statusAfter_createdAt_idx" ON "ConstructionAuthorityDecision"("workspaceId", "statusAfter", "createdAt");
CREATE INDEX "ConstructionAuthorityRefusal_workspaceId_operationKind_createdAt_idx" ON "ConstructionAuthorityRefusal"("workspaceId", "operationKind", "createdAt");
CREATE INDEX "ConstructionAuthorityRefusal_workspaceId_operationId_createdAt_idx" ON "ConstructionAuthorityRefusal"("workspaceId", "operationId", "createdAt");
CREATE UNIQUE INDEX "ConstructionAuthorityOperation_workspaceId_commandId_key" ON "ConstructionAuthorityOperation"("workspaceId", "commandId");
CREATE INDEX "ConstructionAuthorityOperation_workspaceId_operationKind_createdAt_idx" ON "ConstructionAuthorityOperation"("workspaceId", "operationKind", "createdAt");

ALTER TABLE "ConstructionAuthorityPolicySet" ADD CONSTRAINT "ConstructionAuthorityPolicySet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityPolicyRule" ADD CONSTRAINT "ConstructionAuthorityPolicyRule_policySetId_fkey" FOREIGN KEY ("policySetId") REFERENCES "ConstructionAuthorityPolicySet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityEvaluation" ADD CONSTRAINT "ConstructionAuthorityEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityEvaluation" ADD CONSTRAINT "ConstructionAuthorityEvaluation_policySetId_fkey" FOREIGN KEY ("policySetId") REFERENCES "ConstructionAuthorityPolicySet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityDecision" ADD CONSTRAINT "ConstructionAuthorityDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityDecision" ADD CONSTRAINT "ConstructionAuthorityDecision_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ConstructionAuthorityEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityRefusal" ADD CONSTRAINT "ConstructionAuthorityRefusal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAuthorityOperation" ADD CONSTRAINT "ConstructionAuthorityOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
