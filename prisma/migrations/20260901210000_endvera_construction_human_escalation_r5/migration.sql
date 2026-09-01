-- ENDVERA Construction Operating Assistant R5 — durable binding to the
-- existing HumanWorkUnit safe-resume engine. Forward-only and local-safe.

CREATE TYPE "ConstructionHumanEscalationPurpose" AS ENUM (
  'obtain_missing_evidence'
);

CREATE TYPE "ConstructionHumanEscalationState" AS ENUM (
  'prepared',
  'active',
  'resumed',
  'withdrawn',
  'exhausted',
  'paused'
);

CREATE TABLE "ConstructionHumanEscalation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "openLoopId" TEXT NOT NULL,
  "purpose" "ConstructionHumanEscalationPurpose" NOT NULL,
  "evidenceKind" "ConstructionOpenLoopEvidenceKind" NOT NULL,
  "sourceStateVersion" INTEGER NOT NULL,
  "contractVersion" INTEGER NOT NULL DEFAULT 1,
  "requestId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "unitStateId" TEXT NOT NULL,
  "state" "ConstructionHumanEscalationState" NOT NULL DEFAULT 'prepared',
  "acceptanceId" TEXT,
  "acceptedResultHash" TEXT,
  "appliedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConstructionHumanEscalation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionHumanEscalation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_openLoopId_fkey"
    FOREIGN KEY ("openLoopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_unitStateId_fkey"
    FOREIGN KEY ("unitStateId") REFERENCES "HumanWorkUnitRunState"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_acceptanceId_fkey"
    FOREIGN KEY ("acceptanceId") REFERENCES "HumanWorkUnitAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConstructionHumanEscalation_application_shape_check" CHECK (
    ("appliedAt" IS NULL AND "acceptanceId" IS NULL AND "acceptedResultHash" IS NULL)
    OR
    ("appliedAt" IS NOT NULL AND "acceptanceId" IS NOT NULL AND "acceptedResultHash" IS NOT NULL AND "state" = 'resumed')
  ),
  CONSTRAINT "ConstructionHumanEscalation_withdrawal_shape_check" CHECK (
    ("state" = 'withdrawn' AND "withdrawnAt" IS NOT NULL AND "appliedAt" IS NULL)
    OR
    ("state" <> 'withdrawn' AND "withdrawnAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "ConstructionHumanEscalation_taskId_key"
  ON "ConstructionHumanEscalation"("taskId");
CREATE UNIQUE INDEX "ConstructionHumanEscalation_unitStateId_key"
  ON "ConstructionHumanEscalation"("unitStateId");
CREATE UNIQUE INDEX "ConstructionHumanEscalation_acceptanceId_key"
  ON "ConstructionHumanEscalation"("acceptanceId");
CREATE UNIQUE INDEX "ConstructionHumanEscalation_workspace_idempotency_key"
  ON "ConstructionHumanEscalation"("workspaceId", "idempotencyKey");
CREATE INDEX "ConstructionHumanEscalation_openLoop_state_created_idx"
  ON "ConstructionHumanEscalation"("openLoopId", "state", "createdAt");
CREATE INDEX "ConstructionHumanEscalation_workspace_state_created_idx"
  ON "ConstructionHumanEscalation"("workspaceId", "state", "createdAt");

CREATE FUNCTION endvera_guard_construction_human_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'construction human escalation history is immutable';
  END IF;

  IF OLD."appliedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'applied construction human escalation is immutable';
  END IF;

  IF OLD."state" IN ('resumed', 'withdrawn', 'exhausted')
     AND NEW."state" IS DISTINCT FROM OLD."state" THEN
    RAISE EXCEPTION 'terminal construction human escalation cannot reopen';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ConstructionHumanEscalation_guard_update_delete"
BEFORE UPDATE OR DELETE ON "ConstructionHumanEscalation"
FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_human_escalation();

CREATE TRIGGER "ConstructionHumanEscalation_guard_truncate"
BEFORE TRUNCATE ON "ConstructionHumanEscalation"
FOR EACH STATEMENT EXECUTE FUNCTION endvera_guard_construction_human_escalation();
