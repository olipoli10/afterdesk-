-- Durable read-only property jobs. No source connector, route or grant is enabled.
CREATE TABLE "PersonalPropertyResearchJob" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "ConstructionWorkspace"(id) ON DELETE RESTRICT,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "sourceSmsId" TEXT NOT NULL UNIQUE REFERENCES "PersonalAssistantOperation"(id) ON DELETE RESTRICT,
  request JSONB NOT NULL, "requestHash" TEXT NOT NULL, "authorityHash" TEXT NOT NULL, "registryHash" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT, "leaseUntil" TIMESTAMP(3),
  progress JSONB NOT NULL DEFAULT '[]', report JSONB, "reportHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT property_job_shape CHECK (
    "requestHash" ~ '^sha256:[a-f0-9]{64}$' AND "authorityHash" ~ '^sha256:[a-f0-9]{64}$' AND "registryHash" ~ '^sha256:[a-f0-9]{64}$'
    AND jsonb_typeof(request)='object' AND jsonb_typeof(progress)='array' AND jsonb_array_length(progress)<=100
    AND ((status='pending' AND attempts=0 AND "claimToken" IS NULL AND "leaseUntil" IS NULL AND report IS NULL AND "reportHash" IS NULL)
      OR (status='running' AND attempts=1 AND "claimToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND report IS NULL AND "reportHash" IS NULL)
      OR (status='completed' AND attempts=1 AND "claimToken" IS NULL AND "leaseUntil" IS NULL AND jsonb_typeof(report)='object' AND "reportHash" ~ '^sha256:[a-f0-9]{64}$')
      OR (status='uncertain' AND attempts=1 AND "claimToken" IS NULL AND "leaseUntil" IS NULL AND report IS NULL AND "reportHash" IS NULL)))
);
CREATE INDEX property_job_pending_idx ON "PersonalPropertyResearchJob"(status,"createdAt");
CREATE FUNCTION personal_property_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW."workspaceId",NEW."userId",NEW."sourceSmsId",NEW.request,NEW."requestHash",NEW."authorityHash",NEW."registryHash",NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."userId",OLD."sourceSmsId",OLD.request,OLD."requestHash",OLD."authorityHash",OLD."registryHash",OLD."createdAt") THEN
      RAISE EXCEPTION 'property job binding is immutable';
    END IF;
    IF OLD.status IN ('completed','uncertain') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'property job terminal is immutable'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='pending' AND NEW.status='running') OR (OLD.status='running' AND NEW.status IN ('completed','uncertain'))) THEN
      RAISE EXCEPTION 'property job transition refused';
    END IF;
    IF OLD.status='running' AND NEW.status='running' AND (NEW."claimToken" IS DISTINCT FROM OLD."claimToken" OR NEW."leaseUntil" IS DISTINCT FROM OLD."leaseUntil") THEN
      RAISE EXCEPTION 'property job cannot be reclaimed';
    END IF;
    IF jsonb_array_length(NEW.progress)<jsonb_array_length(OLD.progress) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(OLD.progress) WITH ORDINALITY p(value,ordinal)
      WHERE NEW.progress->(p.ordinal::int-1) IS DISTINCT FROM p.value) THEN RAISE EXCEPTION 'property progress is append only'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "PersonalAssistantOperation" s WHERE s.id=NEW."sourceSmsId"
    AND s.kind='personal_sms_inbound' AND s."workspaceId"=NEW."workspaceId" AND s."createdByUserId"=NEW."userId") THEN
    RAISE EXCEPTION 'property job source mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER personal_property_job_guard BEFORE INSERT OR UPDATE ON "PersonalPropertyResearchJob"
FOR EACH ROW EXECUTE FUNCTION personal_property_job_guard();
