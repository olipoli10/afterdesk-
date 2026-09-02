-- ENDVERA Construction Operating Assistant R20 — durable follow-up,
-- escalation and next-owner state. Forward-only; no provider or transport.

DROP TRIGGER IF EXISTS "ConstructionFollowUp_guard_update" ON "ConstructionFollowUp";
DROP FUNCTION IF EXISTS endvera_guard_construction_follow_up();

ALTER TABLE "ConstructionFollowUp" DROP CONSTRAINT IF EXISTS "ConstructionFollowUp_one_target_check";
ALTER TABLE "ConstructionFollowUp" DROP CONSTRAINT IF EXISTS "ConstructionFollowUp_kind_target_check";
ALTER TABLE "ConstructionFollowUp" DROP CONSTRAINT IF EXISTS "ConstructionFollowUp_state_shape_check";

-- PostgreSQL cannot safely reference enum values added inside the same migration
-- transaction. Replace each enum in place so a fresh shadow migration remains
-- atomic and existing rows retain their exact value.
ALTER TABLE "ConstructionFollowUp" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "ConstructionFollowUpKind" RENAME TO "ConstructionFollowUpKind_old";
CREATE TYPE "ConstructionFollowUpKind" AS ENUM (
  'receivable_payment',
  'missing_evidence',
  'job_progress',
  'calendar_confirmation'
);
ALTER TABLE "ConstructionFollowUp" ALTER COLUMN "kind" TYPE "ConstructionFollowUpKind" USING ("kind"::text::"ConstructionFollowUpKind");
DROP TYPE "ConstructionFollowUpKind_old";

ALTER TYPE "ConstructionFollowUpStatus" RENAME TO "ConstructionFollowUpStatus_old";
CREATE TYPE "ConstructionFollowUpStatus" AS ENUM (
  'scheduled',
  'prepared_unsent',
  'ready_for_review',
  'awaiting_response',
  'escalated',
  'decision_required',
  'completed',
  'cancelled'
);
ALTER TABLE "ConstructionFollowUp" ALTER COLUMN "status" TYPE "ConstructionFollowUpStatus" USING ("status"::text::"ConstructionFollowUpStatus");
ALTER TABLE "ConstructionFollowUp" ALTER COLUMN "status" SET DEFAULT 'scheduled';
DROP TYPE "ConstructionFollowUpStatus_old";

ALTER TYPE "ConstructionFollowUpChannel" RENAME TO "ConstructionFollowUpChannel_old";
CREATE TYPE "ConstructionFollowUpChannel" AS ENUM ('SMS', 'EMAIL', 'HUMAN_CALL', 'INTERNAL');
ALTER TABLE "ConstructionFollowUp" ALTER COLUMN "channel" TYPE "ConstructionFollowUpChannel" USING ("channel"::text::"ConstructionFollowUpChannel");
DROP TYPE "ConstructionFollowUpChannel_old";

CREATE TYPE "ConstructionFollowUpAttemptStatus" AS ENUM (
  'prepared_unsent',
  'ready_for_review',
  'resolved',
  'no_response',
  'cancelled'
);

ALTER TABLE "ConstructionFollowUp"
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "calendarItemId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ownerKind" "ConstructionJobAssigneeKind",
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "nextDecision" TEXT,
  ADD COLUMN "policy" JSONB,
  ADD COLUMN "policyHash" TEXT,
  ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ConstructionFollowUp" WHERE "contactId" IS NULL) THEN
    RAISE EXCEPTION 'R20 requires every existing follow-up to retain an accountable contact';
  END IF;
END;
$$;
ALTER TABLE "ConstructionFollowUp" ALTER COLUMN "contactId" SET NOT NULL;

ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_one_target_check" CHECK (
  (("receivableId" IS NOT NULL)::int
    + ("openLoopId" IS NOT NULL)::int
    + ("jobId" IS NOT NULL)::int
    + ("calendarItemId" IS NOT NULL)::int) = 1
);
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_kind_target_check" CHECK (
  ("kind" = 'receivable_payment' AND "receivableId" IS NOT NULL AND "openLoopId" IS NULL AND "jobId" IS NULL AND "calendarItemId" IS NULL)
  OR ("kind" = 'missing_evidence' AND "openLoopId" IS NOT NULL AND "receivableId" IS NULL AND "jobId" IS NULL AND "calendarItemId" IS NULL)
  OR ("kind" = 'job_progress' AND "jobId" IS NOT NULL AND "receivableId" IS NULL AND "openLoopId" IS NULL AND "calendarItemId" IS NULL)
  OR ("kind" = 'calendar_confirmation' AND "calendarItemId" IS NOT NULL AND "receivableId" IS NULL AND "openLoopId" IS NULL AND "jobId" IS NULL)
);
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_managed_contract_check" CHECK (
  "policyHash" IS NULL
  OR (
    "policy" IS NOT NULL
    AND "ownerKind" IS NOT NULL
    AND "ownerId" IS NOT NULL
    AND length(btrim("ownerId")) > 0
    AND "nextDecision" IS NOT NULL
    AND length(btrim("nextDecision")) > 0
  )
);
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_version_check" CHECK ("version" > 0);
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_escalation_level_check" CHECK ("escalationLevel" >= 0);
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_state_shape_check" CHECK (
  ("status" = 'scheduled' AND "actionId" IS NULL AND "preparedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'prepared_unsent' AND "actionId" IS NOT NULL AND "preparedAt" IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" IN ('ready_for_review', 'awaiting_response', 'escalated', 'decision_required') AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'completed' AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL)
  OR ("status" = 'cancelled' AND "cancelledAt" IS NOT NULL AND "completedAt" IS NULL)
);

ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConstructionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_calendarItemId_fkey" FOREIGN KEY ("calendarItemId") REFERENCES "ConstructionCalendarItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ConstructionFollowUp_jobId_status_idx" ON "ConstructionFollowUp"("jobId", "status");
CREATE INDEX "ConstructionFollowUp_calendarItemId_status_idx" ON "ConstructionFollowUp"("calendarItemId", "status");
CREATE INDEX "ConstructionFollowUp_workspaceId_ownerKind_ownerId_status_d_idx" ON "ConstructionFollowUp"("workspaceId", "ownerKind", "ownerId", "status", "dueAt");

CREATE TABLE "ConstructionFollowUpAttempt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "followUpId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "ConstructionFollowUpAttemptStatus" NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "body" TEXT NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "actionId" TEXT,
  "preparedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionFollowUpAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionFollowUpAttempt_number_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "ConstructionFollowUpAttempt_state_shape_check" CHECK (
    ("status" = 'prepared_unsent' AND "actionId" IS NOT NULL AND "resolvedAt" IS NULL)
    OR ("status" = 'ready_for_review' AND "actionId" IS NULL AND "resolvedAt" IS NULL)
    OR ("status" IN ('resolved', 'no_response', 'cancelled') AND "resolvedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "ConstructionFollowUpAttempt_actionId_key" ON "ConstructionFollowUpAttempt"("actionId");
CREATE UNIQUE INDEX "ConstructionFollowUpAttempt_followUpId_attemptNumber_key" ON "ConstructionFollowUpAttempt"("followUpId", "attemptNumber");
CREATE INDEX "ConstructionFollowUpAttempt_workspaceId_status_dueAt_idx" ON "ConstructionFollowUpAttempt"("workspaceId", "status", "dueAt");
ALTER TABLE "ConstructionFollowUpAttempt" ADD CONSTRAINT "ConstructionFollowUpAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUpAttempt" ADD CONSTRAINT "ConstructionFollowUpAttempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUpAttempt" ADD CONSTRAINT "ConstructionFollowUpAttempt_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUpAttempt" ADD CONSTRAINT "ConstructionFollowUpAttempt_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "ConstructionFollowUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUpAttempt" ADD CONSTRAINT "ConstructionFollowUpAttempt_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ConstructionAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConstructionFollowUpTransition" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "followUpId" TEXT,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "versionBefore" INTEGER,
  "versionAfter" INTEGER,
  "beforeState" JSONB,
  "afterState" JSONB,
  "result" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionFollowUpTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionFollowUpTransition_version_check" CHECK (
    ("versionBefore" IS NULL AND "versionAfter" = 1)
    OR ("versionBefore" IS NOT NULL AND "versionAfter" = "versionBefore" + 1)
  )
);
CREATE UNIQUE INDEX "ConstructionFollowUpTransition_workspaceId_commandId_key" ON "ConstructionFollowUpTransition"("workspaceId", "commandId");
CREATE INDEX "ConstructionFollowUpTransition_followUpId_createdAt_idx" ON "ConstructionFollowUpTransition"("followUpId", "createdAt");
CREATE INDEX "ConstructionFollowUpTransition_workspaceId_createdAt_idx" ON "ConstructionFollowUpTransition"("workspaceId", "createdAt");
ALTER TABLE "ConstructionFollowUpTransition" ADD CONSTRAINT "ConstructionFollowUpTransition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUpTransition" ADD CONSTRAINT "ConstructionFollowUpTransition_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "ConstructionFollowUp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUpTransition" ADD CONSTRAINT "ConstructionFollowUpTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION endvera_guard_construction_follow_up()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."contactId" IS DISTINCT FROM NEW."contactId"
     OR OLD."receivableId" IS DISTINCT FROM NEW."receivableId"
     OR OLD."openLoopId" IS DISTINCT FROM NEW."openLoopId"
     OR OLD."jobId" IS DISTINCT FROM NEW."jobId"
     OR OLD."calendarItemId" IS DISTINCT FROM NEW."calendarItemId"
     OR OLD."kind" IS DISTINCT FROM NEW."kind"
     OR OLD."channel" IS DISTINCT FROM NEW."channel"
     OR OLD."bodyHash" IS DISTINCT FROM NEW."bodyHash"
     OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
     OR OLD."requestedById" IS DISTINCT FROM NEW."requestedById"
     OR OLD."policyHash" IS DISTINCT FROM NEW."policyHash" THEN
    RAISE EXCEPTION 'construction follow-up contract is immutable';
  END IF;
  IF OLD."actionId" IS NOT NULL AND NEW."actionId" IS DISTINCT FROM OLD."actionId" THEN
    RAISE EXCEPTION 'prepared construction follow-up action is immutable';
  END IF;
  IF OLD."policyHash" IS NOT NULL AND NEW."version" <= OLD."version" THEN
    RAISE EXCEPTION 'managed construction follow-up version must increase';
  END IF;
  IF OLD."status" IN ('completed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal construction follow-up is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionFollowUp_guard_update" BEFORE UPDATE ON "ConstructionFollowUp" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_follow_up();

CREATE FUNCTION endvera_guard_construction_follow_up_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."contactId" IS DISTINCT FROM NEW."contactId"
     OR OLD."followUpId" IS DISTINCT FROM NEW."followUpId"
     OR OLD."attemptNumber" IS DISTINCT FROM NEW."attemptNumber"
     OR OLD."dueAt" IS DISTINCT FROM NEW."dueAt"
     OR OLD."bodyHash" IS DISTINCT FROM NEW."bodyHash"
     OR OLD."actionId" IS DISTINCT FROM NEW."actionId"
     OR OLD."preparedAt" IS DISTINCT FROM NEW."preparedAt" THEN
    RAISE EXCEPTION 'construction follow-up attempt identity is immutable';
  END IF;
  IF OLD."status" IN ('resolved', 'no_response', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal construction follow-up attempt is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionFollowUpAttempt_guard_update" BEFORE UPDATE ON "ConstructionFollowUpAttempt" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_follow_up_attempt();

CREATE FUNCTION endvera_guard_construction_follow_up_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'construction follow-up transition history is immutable';
END;
$$;
CREATE TRIGGER "ConstructionFollowUpTransition_guard_update_delete" BEFORE UPDATE OR DELETE ON "ConstructionFollowUpTransition" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_follow_up_transition();
CREATE TRIGGER "ConstructionFollowUpTransition_guard_truncate" BEFORE TRUNCATE ON "ConstructionFollowUpTransition" FOR EACH STATEMENT EXECUTE FUNCTION endvera_guard_construction_follow_up_transition();
