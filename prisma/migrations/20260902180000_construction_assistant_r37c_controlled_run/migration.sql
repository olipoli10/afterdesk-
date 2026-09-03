-- R37C: durable, transport-free controlled provider orchestration.
CREATE TABLE "ControlledProviderRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "spendAttemptId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "commandFingerprint" TEXT NOT NULL,
    "sealedAttemptFingerprint" TEXT NOT NULL,
    "caseFingerprint" TEXT NOT NULL,
    "exactModelId" TEXT NOT NULL,
    "sealedExecutorFingerprint" TEXT NOT NULL,
    "reservedMicros" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARED',
    "sealedSnapshot" JSONB NOT NULL,
    "evidenceSnapshot" JSONB,
    "evidenceFingerprint" TEXT,
    "failureCode" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "settlementCommandId" TEXT NOT NULL,
    "releaseCommandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledProviderRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ControlledProviderRun_reservedMicros_check" CHECK ("reservedMicros" > 0),
    CONSTRAINT "ControlledProviderRun_state_check" CHECK (
        "state" IN ('PREPARED', 'RUNNING', 'EVIDENCE_RECORDED', 'RELEASE_PENDING', 'SUCCEEDED', 'FAILED')
    ),
    CONSTRAINT "ControlledProviderRun_success_evidence_check" CHECK (
        "state" <> 'SUCCEEDED' OR (
            "spendAttemptId" IS NOT NULL AND
            "evidenceSnapshot" IS NOT NULL AND
            "evidenceFingerprint" IS NOT NULL
        )
    ),
    CONSTRAINT "ControlledProviderRun_failure_code_check" CHECK (
        "state" NOT IN ('RELEASE_PENDING', 'FAILED') OR "failureCode" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "ControlledProviderRun_spendAttemptId_key"
    ON "ControlledProviderRun"("spendAttemptId");
CREATE UNIQUE INDEX "ControlledProviderRun_settlementCommandId_key"
    ON "ControlledProviderRun"("settlementCommandId");
CREATE UNIQUE INDEX "ControlledProviderRun_releaseCommandId_key"
    ON "ControlledProviderRun"("releaseCommandId");
CREATE UNIQUE INDEX "ControlledProviderRun_grantId_idempotencyKey_key"
    ON "ControlledProviderRun"("grantId", "idempotencyKey");
CREATE INDEX "ControlledProviderRun_workspaceId_state_createdAt_idx"
    ON "ControlledProviderRun"("workspaceId", "state", "createdAt");
CREATE INDEX "ControlledProviderRun_grantId_state_idx"
    ON "ControlledProviderRun"("grantId", "state");
CREATE INDEX "ControlledProviderRun_state_leaseExpiresAt_idx"
    ON "ControlledProviderRun"("state", "leaseExpiresAt");

ALTER TABLE "ControlledProviderRun"
    ADD CONSTRAINT "ControlledProviderRun_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ControlledProviderRun"
    ADD CONSTRAINT "ControlledProviderRun_grantId_fkey"
    FOREIGN KEY ("grantId") REFERENCES "ProviderActivationGrant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ControlledProviderRun"
    ADD CONSTRAINT "ControlledProviderRun_spendAttemptId_fkey"
    FOREIGN KEY ("spendAttemptId") REFERENCES "ProviderSpendAttempt"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ControlledProviderRun"
    ADD CONSTRAINT "ControlledProviderRun_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
