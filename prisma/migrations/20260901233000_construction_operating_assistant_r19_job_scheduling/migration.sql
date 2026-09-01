-- ENDVERA Construction Operating Assistant R19 — canonical project jobs,
-- assignments, availability, dependencies and immutable command history.
-- Forward-only; no provider, transport or external write.

CREATE TYPE "ConstructionJobStatus" AS ENUM ('proposed', 'scheduled', 'blocked', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "ConstructionJobAssigneeKind" AS ENUM ('member', 'contact');
CREATE TYPE "ConstructionAvailabilityKind" AS ENUM ('available', 'unavailable');

CREATE TABLE "ConstructionJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "status" "ConstructionJobStatus" NOT NULL DEFAULT 'proposed',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "sourceRef" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionJob_time_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "ConstructionJob_version_check" CHECK ("version" > 0),
  CONSTRAINT "ConstructionJob_priority_check" CHECK ("priority" BETWEEN -100 AND 100),
  CONSTRAINT "ConstructionJob_title_check" CHECK (length(btrim("title")) > 0)
);

CREATE TABLE "ConstructionJobAssignment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "assigneeKind" "ConstructionJobAssigneeKind" NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "roleLabel" TEXT,
  "contactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionJobAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionJobAssignment_shape_check" CHECK (
    ("assigneeKind" = 'member' AND "contactId" IS NULL)
    OR ("assigneeKind" = 'contact' AND "contactId" IS NOT NULL AND "contactId" = "assigneeId")
  )
);

CREATE TABLE "ConstructionJobDependency" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "predecessorJobId" TEXT NOT NULL,
  "successorJobId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionJobDependency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionJobDependency_not_self_check" CHECK ("predecessorJobId" <> "successorJobId")
);

CREATE TABLE "ConstructionResourceAvailability" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "assigneeKind" "ConstructionJobAssigneeKind" NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "kind" "ConstructionAvailabilityKind" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "sourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionResourceAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionResourceAvailability_time_check" CHECK ("endsAt" > "startsAt")
);

CREATE TABLE "ConstructionJobTransition" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "jobId" TEXT,
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
  CONSTRAINT "ConstructionJobTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionJobTransition_hash_check" CHECK ("commandHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ConstructionJobTransition_version_check" CHECK (
    ("versionBefore" IS NULL OR "versionBefore" > 0)
    AND ("versionAfter" IS NULL OR "versionAfter" > 0)
  )
);

CREATE INDEX "ConstructionJob_workspaceId_startsAt_endsAt_idx" ON "ConstructionJob"("workspaceId", "startsAt", "endsAt");
CREATE INDEX "ConstructionJob_projectId_status_startsAt_idx" ON "ConstructionJob"("projectId", "status", "startsAt");
CREATE UNIQUE INDEX "ConstructionJobAssignment_jobId_assigneeKind_assigneeId_key" ON "ConstructionJobAssignment"("jobId", "assigneeKind", "assigneeId");
CREATE INDEX "ConstructionJobAssignment_workspaceId_assigneeKind_assignee_idx" ON "ConstructionJobAssignment"("workspaceId", "assigneeKind", "assigneeId");
CREATE UNIQUE INDEX "ConstructionJobDependency_predecessorJobId_successorJobId_key" ON "ConstructionJobDependency"("predecessorJobId", "successorJobId");
CREATE INDEX "ConstructionJobDependency_workspaceId_successorJobId_idx" ON "ConstructionJobDependency"("workspaceId", "successorJobId");
CREATE INDEX "ConstructionResourceAvailability_workspaceId_assigneeKind_a_idx" ON "ConstructionResourceAvailability"("workspaceId", "assigneeKind", "assigneeId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "ConstructionJobTransition_workspaceId_commandId_key" ON "ConstructionJobTransition"("workspaceId", "commandId");
CREATE INDEX "ConstructionJobTransition_jobId_createdAt_idx" ON "ConstructionJobTransition"("jobId", "createdAt");
CREATE INDEX "ConstructionJobTransition_workspaceId_createdAt_idx" ON "ConstructionJobTransition"("workspaceId", "createdAt");

ALTER TABLE "ConstructionJob" ADD CONSTRAINT "ConstructionJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJob" ADD CONSTRAINT "ConstructionJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJob" ADD CONSTRAINT "ConstructionJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobAssignment" ADD CONSTRAINT "ConstructionJobAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobAssignment" ADD CONSTRAINT "ConstructionJobAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConstructionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobAssignment" ADD CONSTRAINT "ConstructionJobAssignment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobDependency" ADD CONSTRAINT "ConstructionJobDependency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobDependency" ADD CONSTRAINT "ConstructionJobDependency_predecessorJobId_fkey" FOREIGN KEY ("predecessorJobId") REFERENCES "ConstructionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobDependency" ADD CONSTRAINT "ConstructionJobDependency_successorJobId_fkey" FOREIGN KEY ("successorJobId") REFERENCES "ConstructionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionResourceAvailability" ADD CONSTRAINT "ConstructionResourceAvailability_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobTransition" ADD CONSTRAINT "ConstructionJobTransition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobTransition" ADD CONSTRAINT "ConstructionJobTransition_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ConstructionJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionJobTransition" ADD CONSTRAINT "ConstructionJobTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION endvera_guard_construction_job()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."createdById" IS DISTINCT FROM NEW."createdById"
     OR OLD."sourceRef" IS DISTINCT FROM NEW."sourceRef"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'construction job identity and provenance are immutable';
  END IF;
  IF OLD."status" IN ('completed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal construction job is immutable';
  END IF;
  IF NEW."version" <= OLD."version" THEN
    RAISE EXCEPTION 'construction job version must increase';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionJob_guard_update" BEFORE UPDATE ON "ConstructionJob" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_job();

CREATE FUNCTION endvera_refuse_job_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'construction job history is immutable';
END;
$$;
CREATE TRIGGER "ConstructionJobAssignment_guard_update_delete" BEFORE UPDATE OR DELETE ON "ConstructionJobAssignment" FOR EACH ROW EXECUTE FUNCTION endvera_refuse_job_history_mutation();
CREATE TRIGGER "ConstructionJobDependency_guard_update_delete" BEFORE UPDATE OR DELETE ON "ConstructionJobDependency" FOR EACH ROW EXECUTE FUNCTION endvera_refuse_job_history_mutation();
CREATE TRIGGER "ConstructionResourceAvailability_guard_update_delete" BEFORE UPDATE OR DELETE ON "ConstructionResourceAvailability" FOR EACH ROW EXECUTE FUNCTION endvera_refuse_job_history_mutation();
CREATE TRIGGER "ConstructionJobTransition_guard_update_delete" BEFORE UPDATE OR DELETE ON "ConstructionJobTransition" FOR EACH ROW EXECUTE FUNCTION endvera_refuse_job_history_mutation();
CREATE TRIGGER "ConstructionJobTransition_guard_truncate" BEFORE TRUNCATE ON "ConstructionJobTransition" FOR EACH STATEMENT EXECUTE FUNCTION endvera_refuse_job_history_mutation();
