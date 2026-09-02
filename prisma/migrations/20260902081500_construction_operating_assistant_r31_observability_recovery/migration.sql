-- R31 observability and recovery: additive, tenant-scoped evidence/control tables only.

CREATE TABLE "ConstructionReliabilitySignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "signalKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "outcomeCode" TEXT NOT NULL,
    "traceId" TEXT,
    "spanId" TEXT,
    "parentSpanId" TEXT,
    "sourceModule" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceVersion" INTEGER,
    "durationMs" INTEGER,
    "dimensions" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionReliabilitySignal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionReliabilitySignal_duration_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
    CONSTRAINT "ConstructionReliabilitySignal_resource_version_check" CHECK ("resourceVersion" IS NULL OR "resourceVersion" > 0)
);

CREATE TABLE "ConstructionReliabilityAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "firstObservedAt" TIMESTAMP(3) NOT NULL,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "latestSignalId" TEXT NOT NULL,
    "nextResponsibleRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionReliabilityAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionReliabilityAlert_occurrence_check" CHECK ("occurrenceCount" > 0),
    CONSTRAINT "ConstructionReliabilityAlert_version_check" CHECK ("stateVersion" > 0)
);

CREATE TABLE "ConstructionRecoveryOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "registryVersion" INTEGER NOT NULL,
    "alertId" TEXT NOT NULL,
    "queueKind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedItemVersion" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "replayClass" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "beforeFingerprint" TEXT NOT NULL,
    "afterFingerprint" TEXT,
    "result" JSONB NOT NULL,
    "resultFingerprint" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "nextResponsibleRole" TEXT NOT NULL,
    "externalEffectPerformed" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "quarantinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConstructionRecoveryOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionRecoveryOperation_version_check" CHECK ("stateVersion" > 0 AND "expectedItemVersion" > 0),
    CONSTRAINT "ConstructionRecoveryOperation_no_external_effect" CHECK ("externalEffectPerformed" = false)
);

CREATE TABLE "ConstructionRecoveryCheckpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "checkpointKey" TEXT NOT NULL,
    "registryVersion" INTEGER NOT NULL,
    "schemaIdentity" TEXT NOT NULL,
    "tableCounts" JSONB NOT NULL,
    "highWaterMarks" JSONB NOT NULL,
    "manifestFingerprint" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionRecoveryCheckpoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionRecoveryCheckpoint_total_check" CHECK ("totalRows" >= 0)
);

CREATE TABLE "ConstructionRecoveryDrill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "drillKey" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "restoredFingerprint" TEXT NOT NULL,
    "schemaMatch" BOOLEAN NOT NULL,
    "countsMatch" BOOLEAN NOT NULL,
    "reasonCodes" TEXT[],
    "sourceDatabaseLabel" TEXT NOT NULL,
    "targetDatabaseLabel" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionRecoveryDrill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionReliabilityGateRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "gateKey" TEXT NOT NULL,
    "gateKind" TEXT NOT NULL,
    "evidenceLabel" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "operationCount" INTEGER NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "canonicalEffectCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "p50LatencyMs" INTEGER NOT NULL,
    "p95LatencyMs" INTEGER NOT NULL,
    "thresholdMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "resultFingerprint" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionReliabilityGateRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConstructionReliabilityGateRun_nonnegative_check" CHECK ("operationCount" > 0 AND "concurrency" > 0 AND "canonicalEffectCount" >= 0 AND "duplicateCount" >= 0 AND "durationMs" > 0 AND "p50LatencyMs" >= 0 AND "p95LatencyMs" >= 0 AND "thresholdMs" > 0),
    CONSTRAINT "ConstructionReliabilityGateRun_label_check" CHECK ("evidenceLabel" = 'SYNTHETIC')
);

CREATE TABLE "ConstructionReliabilityCommand" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "resultFingerprint" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionReliabilityCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConstructionReliabilitySignal_workspaceId_signalKey_key" ON "ConstructionReliabilitySignal"("workspaceId", "signalKey");
CREATE INDEX "ConstructionReliabilitySignal_workspaceId_severity_observedAt_idx" ON "ConstructionReliabilitySignal"("workspaceId", "severity", "observedAt");
CREATE INDEX "ConstructionReliabilitySignal_workspaceId_traceId_observedAt_idx" ON "ConstructionReliabilitySignal"("workspaceId", "traceId", "observedAt");
CREATE INDEX "ConstructionReliabilitySignal_workspaceId_resourceType_resourceId_observedAt_idx" ON "ConstructionReliabilitySignal"("workspaceId", "resourceType", "resourceId", "observedAt");
CREATE UNIQUE INDEX "ConstructionReliabilityAlert_workspaceId_alertKey_key" ON "ConstructionReliabilityAlert"("workspaceId", "alertKey");
CREATE INDEX "ConstructionReliabilityAlert_workspaceId_status_severity_lastObservedAt_idx" ON "ConstructionReliabilityAlert"("workspaceId", "status", "severity", "lastObservedAt");
CREATE INDEX "ConstructionReliabilityAlert_workspaceId_resourceType_resourceId_idx" ON "ConstructionReliabilityAlert"("workspaceId", "resourceType", "resourceId");
CREATE UNIQUE INDEX "ConstructionRecoveryOperation_workspaceId_commandId_key" ON "ConstructionRecoveryOperation"("workspaceId", "commandId");
CREATE INDEX "ConstructionRecoveryOperation_workspaceId_status_createdAt_idx" ON "ConstructionRecoveryOperation"("workspaceId", "status", "createdAt");
CREATE INDEX "ConstructionRecoveryOperation_alertId_createdAt_idx" ON "ConstructionRecoveryOperation"("alertId", "createdAt");
CREATE INDEX "ConstructionRecoveryOperation_workspaceId_queueKind_itemId_idx" ON "ConstructionRecoveryOperation"("workspaceId", "queueKind", "itemId");
CREATE UNIQUE INDEX "ConstructionRecoveryCheckpoint_workspaceId_checkpointKey_key" ON "ConstructionRecoveryCheckpoint"("workspaceId", "checkpointKey");
CREATE INDEX "ConstructionRecoveryCheckpoint_workspaceId_createdAt_idx" ON "ConstructionRecoveryCheckpoint"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "ConstructionRecoveryDrill_workspaceId_drillKey_key" ON "ConstructionRecoveryDrill"("workspaceId", "drillKey");
CREATE INDEX "ConstructionRecoveryDrill_workspaceId_status_completedAt_idx" ON "ConstructionRecoveryDrill"("workspaceId", "status", "completedAt");
CREATE UNIQUE INDEX "ConstructionReliabilityGateRun_workspaceId_gateKey_key" ON "ConstructionReliabilityGateRun"("workspaceId", "gateKey");
CREATE INDEX "ConstructionReliabilityGateRun_workspaceId_status_createdAt_idx" ON "ConstructionReliabilityGateRun"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "ConstructionReliabilityCommand_workspaceId_commandId_key" ON "ConstructionReliabilityCommand"("workspaceId", "commandId");
CREATE INDEX "ConstructionReliabilityCommand_workspaceId_action_createdAt_idx" ON "ConstructionReliabilityCommand"("workspaceId", "action", "createdAt");

ALTER TABLE "ConstructionReliabilitySignal" ADD CONSTRAINT "ConstructionReliabilitySignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReliabilityAlert" ADD CONSTRAINT "ConstructionReliabilityAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReliabilityAlert" ADD CONSTRAINT "ConstructionReliabilityAlert_latestSignalId_fkey" FOREIGN KEY ("latestSignalId") REFERENCES "ConstructionReliabilitySignal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryOperation" ADD CONSTRAINT "ConstructionRecoveryOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryOperation" ADD CONSTRAINT "ConstructionRecoveryOperation_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "ConstructionReliabilityAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryOperation" ADD CONSTRAINT "ConstructionRecoveryOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryCheckpoint" ADD CONSTRAINT "ConstructionRecoveryCheckpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryCheckpoint" ADD CONSTRAINT "ConstructionRecoveryCheckpoint_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryDrill" ADD CONSTRAINT "ConstructionRecoveryDrill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryDrill" ADD CONSTRAINT "ConstructionRecoveryDrill_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "ConstructionRecoveryCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionRecoveryDrill" ADD CONSTRAINT "ConstructionRecoveryDrill_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReliabilityGateRun" ADD CONSTRAINT "ConstructionReliabilityGateRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReliabilityGateRun" ADD CONSTRAINT "ConstructionReliabilityGateRun_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReliabilityCommand" ADD CONSTRAINT "ConstructionReliabilityCommand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReliabilityCommand" ADD CONSTRAINT "ConstructionReliabilityCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
