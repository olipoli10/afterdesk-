-- ENDVERA Construction Operating Assistant R0: additive Open-Loop Closure Core.
-- Existing construction records and state machines are preserved.

CREATE TYPE "ConstructionOpenLoopType" AS ENUM ('invoice_ready');
CREATE TYPE "ConstructionBillingBasis" AS ENUM ('change_order');
CREATE TYPE "ConstructionOpenLoopStatus" AS ENUM ('open', 'waiting_for_evidence', 'waiting_for_verification', 'ready_to_invoice', 'closed', 'revoked');
CREATE TYPE "ConstructionOpenLoopFactState" AS ENUM ('unknown', 'claimed', 'verified', 'disputed', 'revoked');
CREATE TYPE "ConstructionOpenLoopEvidenceKind" AS ENUM ('written_approval', 'photo', 'document');
CREATE TYPE "ConstructionOpenLoopEvidenceState" AS ENUM ('present_unverified', 'verified', 'rejected', 'revoked');
CREATE TYPE "ConstructionOpenLoopContradictionStatus" AS ENUM ('open', 'resolved');

ALTER TABLE "ConstructionAction" ADD COLUMN "openLoopId" TEXT;
ALTER TABLE "ConstructionMessage" ADD COLUMN "relatedOpenLoopId" TEXT;

CREATE TABLE "ConstructionOpenLoop" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "openedByMessageId" TEXT NOT NULL,
  "type" "ConstructionOpenLoopType" NOT NULL DEFAULT 'invoice_ready',
  "billingBasis" "ConstructionBillingBasis" NOT NULL DEFAULT 'change_order',
  "desiredOutcome" TEXT NOT NULL,
  "status" "ConstructionOpenLoopStatus" NOT NULL DEFAULT 'open',
  "priority" INTEGER NOT NULL DEFAULT 50,
  "dueAt" TIMESTAMP(3),
  "dueState" TEXT NOT NULL DEFAULT 'actionable_now',
  "policyVersion" TEXT NOT NULL,
  "stateVersion" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "semanticKey" TEXT NOT NULL,
  "nextResponsibleRole" TEXT NOT NULL,
  "nextAction" TEXT NOT NULL,
  "decisionHash" TEXT NOT NULL,
  "readyAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionOpenLoop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionOpenLoop_state_version_check" CHECK ("stateVersion" > 0),
  CONSTRAINT "ConstructionOpenLoop_terminal_time_check" CHECK (
    ("closedAt" IS NULL OR "revokedAt" IS NULL) AND
    ("readyAt" IS NULL OR "status" IN ('ready_to_invoice', 'closed'))
  )
);

CREATE TABLE "ConstructionOpenLoopFact" (
  "id" TEXT NOT NULL,
  "loopId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "state" "ConstructionOpenLoopFactState" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "suppliedById" TEXT,
  "observedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionOpenLoopFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionOpenLoopEvidence" (
  "id" TEXT NOT NULL,
  "loopId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "evidenceKey" TEXT NOT NULL,
  "kind" "ConstructionOpenLoopEvidenceKind" NOT NULL,
  "state" "ConstructionOpenLoopEvidenceState" NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "contentHash" TEXT,
  "suppliedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionOpenLoopEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConstructionOpenLoopContradiction" (
  "id" TEXT NOT NULL,
  "loopId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "claimIds" TEXT[] NOT NULL,
  "status" "ConstructionOpenLoopContradictionStatus" NOT NULL DEFAULT 'open',
  "resolution" JSONB,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionOpenLoopContradiction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionOpenLoopContradiction_resolution_check" CHECK (
    ("status" = 'open' AND "resolution" IS NULL AND "resolvedAt" IS NULL) OR
    ("status" = 'resolved' AND "resolution" IS NOT NULL AND "resolvedAt" IS NOT NULL)
  )
);

CREATE TABLE "ConstructionOpenLoopTransition" (
  "id" TEXT NOT NULL,
  "loopId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "priorStatus" "ConstructionOpenLoopStatus",
  "nextStatus" "ConstructionOpenLoopStatus" NOT NULL,
  "priorVersion" INTEGER NOT NULL,
  "nextVersion" INTEGER NOT NULL,
  "reasonCodes" TEXT[] NOT NULL,
  "actorUserId" TEXT,
  "authorityDecision" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionOpenLoopTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionOpenLoopTransition_version_check" CHECK (
    "priorVersion" >= 0 AND "nextVersion" = "priorVersion" + 1
  )
);

CREATE TABLE "ConstructionOpenLoopSnapshot" (
  "id" TEXT NOT NULL,
  "loopId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "stateVersion" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "canonicalHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionOpenLoopSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionOpenLoopSnapshot_state_version_check" CHECK ("stateVersion" > 0)
);

CREATE UNIQUE INDEX "ConstructionOpenLoop_workspaceId_idempotencyKey_key" ON "ConstructionOpenLoop"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "ConstructionOpenLoop_workspaceId_semanticKey_key" ON "ConstructionOpenLoop"("workspaceId", "semanticKey");
CREATE INDEX "ConstructionOpenLoop_workspaceId_status_updatedAt_idx" ON "ConstructionOpenLoop"("workspaceId", "status", "updatedAt");
CREATE INDEX "ConstructionOpenLoop_projectId_status_updatedAt_idx" ON "ConstructionOpenLoop"("projectId", "status", "updatedAt");
CREATE INDEX "ConstructionOpenLoop_workspaceId_nextResponsibleRole_status_idx" ON "ConstructionOpenLoop"("workspaceId", "nextResponsibleRole", "status");
CREATE INDEX "ConstructionOpenLoop_workspaceId_dueAt_status_idx" ON "ConstructionOpenLoop"("workspaceId", "dueAt", "status");

CREATE INDEX "ConstructionOpenLoopFact_loopId_field_createdAt_idx" ON "ConstructionOpenLoopFact"("loopId", "field", "createdAt");
CREATE INDEX "ConstructionOpenLoopFact_workspaceId_projectId_field_idx" ON "ConstructionOpenLoopFact"("workspaceId", "projectId", "field");

CREATE UNIQUE INDEX "ConstructionOpenLoopEvidence_loopId_evidenceKey_key" ON "ConstructionOpenLoopEvidence"("loopId", "evidenceKey");
CREATE INDEX "ConstructionOpenLoopEvidence_loopId_kind_state_idx" ON "ConstructionOpenLoopEvidence"("loopId", "kind", "state");
CREATE INDEX "ConstructionOpenLoopEvidence_workspaceId_projectId_state_idx" ON "ConstructionOpenLoopEvidence"("workspaceId", "projectId", "state");

CREATE INDEX "ConstructionOpenLoopContradiction_loopId_status_createdAt_idx" ON "ConstructionOpenLoopContradiction"("loopId", "status", "createdAt");
CREATE INDEX "ConstructionOpenLoopContradiction_workspaceId_projectId_status_idx" ON "ConstructionOpenLoopContradiction"("workspaceId", "projectId", "status");

CREATE UNIQUE INDEX "ConstructionOpenLoopTransition_loopId_idempotencyKey_key" ON "ConstructionOpenLoopTransition"("loopId", "idempotencyKey");
CREATE UNIQUE INDEX "ConstructionOpenLoopTransition_loopId_nextVersion_key" ON "ConstructionOpenLoopTransition"("loopId", "nextVersion");
CREATE INDEX "ConstructionOpenLoopTransition_workspaceId_createdAt_idx" ON "ConstructionOpenLoopTransition"("workspaceId", "createdAt");

CREATE UNIQUE INDEX "ConstructionOpenLoopSnapshot_loopId_stateVersion_key" ON "ConstructionOpenLoopSnapshot"("loopId", "stateVersion");
CREATE INDEX "ConstructionOpenLoopSnapshot_workspaceId_createdAt_idx" ON "ConstructionOpenLoopSnapshot"("workspaceId", "createdAt");
CREATE INDEX "ConstructionOpenLoopSnapshot_canonicalHash_idx" ON "ConstructionOpenLoopSnapshot"("canonicalHash");

CREATE INDEX "ConstructionAction_openLoopId_status_idx" ON "ConstructionAction"("openLoopId", "status");
CREATE INDEX "ConstructionMessage_relatedOpenLoopId_createdAt_idx" ON "ConstructionMessage"("relatedOpenLoopId", "createdAt");

ALTER TABLE "ConstructionOpenLoop" ADD CONSTRAINT "ConstructionOpenLoop_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoop" ADD CONSTRAINT "ConstructionOpenLoop_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoop" ADD CONSTRAINT "ConstructionOpenLoop_openedByMessageId_fkey" FOREIGN KEY ("openedByMessageId") REFERENCES "ConstructionMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoopFact" ADD CONSTRAINT "ConstructionOpenLoopFact_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoopEvidence" ADD CONSTRAINT "ConstructionOpenLoopEvidence_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoopContradiction" ADD CONSTRAINT "ConstructionOpenLoopContradiction_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoopTransition" ADD CONSTRAINT "ConstructionOpenLoopTransition_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionOpenLoopSnapshot" ADD CONSTRAINT "ConstructionOpenLoopSnapshot_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionAction" ADD CONSTRAINT "ConstructionAction_openLoopId_fkey" FOREIGN KEY ("openLoopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionMessage" ADD CONSTRAINT "ConstructionMessage_relatedOpenLoopId_fkey" FOREIGN KEY ("relatedOpenLoopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TYPE "ConstructionIntent" ADD VALUE IF NOT EXISTS 'report_work_finished';
