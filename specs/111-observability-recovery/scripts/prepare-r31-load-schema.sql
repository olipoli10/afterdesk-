DROP TABLE IF EXISTS "ConstructionReliabilityCommand";
DROP TABLE IF EXISTS "ConstructionReliabilityGateRun";
DROP TABLE IF EXISTS "ConstructionReliabilitySignal";
DROP TABLE IF EXISTS "ConstructionWorkspaceMember";
DROP TABLE IF EXISTS "ConstructionWorkspace";
DROP TABLE IF EXISTS "User";
DROP TYPE IF EXISTS "ConstructionMembershipStatus";
DROP TYPE IF EXISTS "ConstructionMembershipRole";
DROP TYPE IF EXISTS "ConstructionWorkspaceStatus";
DROP TYPE IF EXISTS "Role";

CREATE TYPE "Role" AS ENUM ('CLIENT', 'VA', 'ADMIN');
CREATE TYPE "ConstructionWorkspaceStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ConstructionMembershipRole" AS ENUM ('owner', 'admin', 'member');
CREATE TYPE "ConstructionMembershipStatus" AS ENUM ('active', 'revoked');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "role" "Role" NOT NULL DEFAULT 'CLIENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ConstructionWorkspace" (
  "id" TEXT PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "defaultTimezone" TEXT NOT NULL DEFAULT 'America/Toronto',
  "defaultLocale" TEXT NOT NULL DEFAULT 'fr-CA',
  "status" "ConstructionWorkspaceStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ConstructionWorkspaceMember" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" "ConstructionMembershipRole" NOT NULL DEFAULT 'member',
  "status" "ConstructionMembershipStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionWorkspaceMember_workspaceId_userId_key" UNIQUE ("workspaceId", "userId")
);

CREATE TABLE "ConstructionReliabilitySignal" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT,
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
  CONSTRAINT "ConstructionReliabilitySignal_workspaceId_signalKey_key" UNIQUE ("workspaceId", "signalKey")
);

CREATE TABLE "ConstructionReliabilityGateRun" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT,
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
  "recordedByUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionReliabilityGateRun_workspaceId_gateKey_key" UNIQUE ("workspaceId", "gateKey")
);

CREATE TABLE "ConstructionReliabilityCommand" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "resultFingerprint" TEXT NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionReliabilityCommand_workspaceId_commandId_key" UNIQUE ("workspaceId", "commandId")
);

CREATE INDEX "ConstructionReliabilitySignal_workspaceId_severity_observedAt_idx" ON "ConstructionReliabilitySignal"("workspaceId", "severity", "observedAt");
CREATE INDEX "ConstructionReliabilitySignal_workspaceId_traceId_observedAt_idx" ON "ConstructionReliabilitySignal"("workspaceId", "traceId", "observedAt");
CREATE INDEX "ConstructionReliabilitySignal_workspaceId_resourceType_resourceId_observedAt_idx" ON "ConstructionReliabilitySignal"("workspaceId", "resourceType", "resourceId", "observedAt");
CREATE INDEX "ConstructionReliabilityGateRun_workspaceId_status_createdAt_idx" ON "ConstructionReliabilityGateRun"("workspaceId", "status", "createdAt");
CREATE INDEX "ConstructionReliabilityCommand_workspaceId_action_createdAt_idx" ON "ConstructionReliabilityCommand"("workspaceId", "action", "createdAt");
