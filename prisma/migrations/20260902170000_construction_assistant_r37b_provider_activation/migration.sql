-- R37B provider activation controls. Additive, forward-only and local-only.

CREATE TABLE "ProviderActivationGrant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateKey" TEXT NOT NULL,
    "exactModelId" TEXT NOT NULL,
    "sealedExecutorFingerprint" TEXT NOT NULL,
    "allowedCaseFingerprints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxCallCount" INTEGER NOT NULL,
    "maxTotalSpendMicros" BIGINT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "reservedCallCount" INTEGER NOT NULL DEFAULT 0,
    "reservedSpendMicros" BIGINT NOT NULL DEFAULT 0,
    "settledCallCount" INTEGER NOT NULL DEFAULT 0,
    "settledSpendMicros" BIGINT NOT NULL DEFAULT 0,
    "releasedCallCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderActivationGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderActivationGrant_status" CHECK ("status" IN ('PREPARED', 'ACTIVE', 'REVOKED', 'EXPIRED')),
    CONSTRAINT "ProviderActivationGrant_exact_binding" CHECK (length("exactModelId") > 0 AND cardinality("allowedCaseFingerprints") > 0),
    CONSTRAINT "ProviderActivationGrant_positive_limits" CHECK ("maxCallCount" > 0 AND "maxTotalSpendMicros" > 0),
    CONSTRAINT "ProviderActivationGrant_nonnegative_counters" CHECK ("attemptCount" >= 0 AND "reservedCallCount" >= 0 AND "reservedSpendMicros" >= 0 AND "settledCallCount" >= 0 AND "settledSpendMicros" >= 0 AND "releasedCallCount" >= 0),
    CONSTRAINT "ProviderActivationGrant_call_ceiling" CHECK ("attemptCount" <= "maxCallCount"),
    CONSTRAINT "ProviderActivationGrant_spend_ceiling" CHECK (("reservedSpendMicros" + "settledSpendMicros") <= "maxTotalSpendMicros")
);

CREATE TABLE "ProviderSpendAttempt" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "caseFingerprint" TEXT NOT NULL,
    "exactModelId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedMicros" BIGINT NOT NULL,
    "settledMicros" BIGINT,
    "releasedMicros" BIGINT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderSpendAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderSpendAttempt_state" CHECK ("state" IN ('RESERVED', 'SETTLED', 'RELEASED')),
    CONSTRAINT "ProviderSpendAttempt_positive_reservation" CHECK ("reservedMicros" > 0),
    CONSTRAINT "ProviderSpendAttempt_valid_settlement" CHECK ("settledMicros" IS NULL OR ("settledMicros" >= 0 AND "settledMicros" <= "reservedMicros")),
    CONSTRAINT "ProviderSpendAttempt_valid_release" CHECK ("releasedMicros" IS NULL OR ("releasedMicros" >= 0 AND "releasedMicros" <= "reservedMicros"))
);

CREATE TABLE "ProviderLaneControl" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DISABLED',
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastChangedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderLaneControl_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderLaneControl_state" CHECK ("state" IN ('ENABLED', 'DISABLED'))
);

CREATE TABLE "ProviderActivationDecision" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "grantId" TEXT,
    "attemptId" TEXT,
    "kind" TEXT NOT NULL,
    "commandFingerprint" TEXT NOT NULL,
    "resultSnapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderActivationDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderActivationGrant_workspaceId_status_expiresAt_idx" ON "ProviderActivationGrant"("workspaceId", "status", "expiresAt");
CREATE INDEX "ProviderActivationGrant_candidateKey_exactModelId_status_idx" ON "ProviderActivationGrant"("candidateKey", "exactModelId", "status");
CREATE UNIQUE INDEX "ProviderSpendAttempt_grantId_idempotencyKey_key" ON "ProviderSpendAttempt"("grantId", "idempotencyKey");
CREATE INDEX "ProviderSpendAttempt_workspaceId_state_createdAt_idx" ON "ProviderSpendAttempt"("workspaceId", "state", "createdAt");
CREATE INDEX "ProviderSpendAttempt_grantId_state_idx" ON "ProviderSpendAttempt"("grantId", "state");
CREATE INDEX "ProviderLaneControl_state_changedAt_idx" ON "ProviderLaneControl"("state", "changedAt");
CREATE UNIQUE INDEX "ProviderActivationDecision_commandId_key" ON "ProviderActivationDecision"("commandId");
CREATE INDEX "ProviderActivationDecision_workspaceId_createdAt_idx" ON "ProviderActivationDecision"("workspaceId", "createdAt");
CREATE INDEX "ProviderActivationDecision_grantId_createdAt_idx" ON "ProviderActivationDecision"("grantId", "createdAt");
CREATE INDEX "ProviderActivationDecision_attemptId_createdAt_idx" ON "ProviderActivationDecision"("attemptId", "createdAt");

ALTER TABLE "ProviderActivationGrant" ADD CONSTRAINT "ProviderActivationGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderActivationGrant" ADD CONSTRAINT "ProviderActivationGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderSpendAttempt" ADD CONSTRAINT "ProviderSpendAttempt_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "ProviderActivationGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderLaneControl" ADD CONSTRAINT "ProviderLaneControl_lastChangedById_fkey" FOREIGN KEY ("lastChangedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderActivationDecision" ADD CONSTRAINT "ProviderActivationDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderActivationDecision" ADD CONSTRAINT "ProviderActivationDecision_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "ProviderActivationGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderActivationDecision" ADD CONSTRAINT "ProviderActivationDecision_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ProviderSpendAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderActivationDecision" ADD CONSTRAINT "ProviderActivationDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
