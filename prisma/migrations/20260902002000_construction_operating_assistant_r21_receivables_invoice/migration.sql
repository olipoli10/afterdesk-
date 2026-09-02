-- ENDVERA Construction Operating Assistant R21 — exact invoice-readiness
-- binding, durable payment promises and immutable economic command history.
-- Forward-only; no provider, payment rail, accounting write or transport.

CREATE TYPE "ConstructionPaymentPromiseStatus" AS ENUM ('active', 'kept', 'broken', 'revoked');

ALTER TABLE "ConstructionReceivable" ADD COLUMN "openLoopId" TEXT;

CREATE UNIQUE INDEX "ConstructionReceivable_openLoopId_key"
  ON "ConstructionReceivable"("openLoopId");
ALTER TABLE "ConstructionReceivable"
  ADD CONSTRAINT "ConstructionReceivable_openLoopId_fkey"
  FOREIGN KEY ("openLoopId") REFERENCES "ConstructionOpenLoop"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConstructionPaymentPromise" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "ConstructionPaymentPromiseStatus" NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "promisedAmountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CAD',
  "promisedFor" TIMESTAMP(3) NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "activeKey" TEXT,
  "createdById" TEXT NOT NULL,
  "keptAt" TIMESTAMP(3),
  "brokenAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "resolutionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionPaymentPromise_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionPaymentPromise_amount_check" CHECK (
    "promisedAmountMinor" > 0 AND "currency" = 'CAD'
  ),
  CONSTRAINT "ConstructionPaymentPromise_version_check" CHECK ("version" > 0),
  CONSTRAINT "ConstructionPaymentPromise_source_check" CHECK (
    length(btrim("sourceRef")) > 0 AND length("sourceHash") = 64
  ),
  CONSTRAINT "ConstructionPaymentPromise_state_shape_check" CHECK (
    ("status" = 'active'
      AND "activeKey" = "receivableId"
      AND "keptAt" IS NULL AND "brokenAt" IS NULL AND "revokedAt" IS NULL
      AND "resolutionReason" IS NULL)
    OR ("status" = 'kept'
      AND "activeKey" IS NULL
      AND "keptAt" IS NOT NULL AND "brokenAt" IS NULL AND "revokedAt" IS NULL
      AND "resolutionReason" IS NOT NULL)
    OR ("status" = 'broken'
      AND "activeKey" IS NULL
      AND "keptAt" IS NULL AND "brokenAt" IS NOT NULL AND "revokedAt" IS NULL
      AND "resolutionReason" IS NOT NULL)
    OR ("status" = 'revoked'
      AND "activeKey" IS NULL
      AND "keptAt" IS NULL AND "brokenAt" IS NULL AND "revokedAt" IS NOT NULL
      AND "resolutionReason" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ConstructionPaymentPromise_activeKey_key"
  ON "ConstructionPaymentPromise"("activeKey");
CREATE UNIQUE INDEX "ConstructionPaymentPromise_workspaceId_idempotencyKey_key"
  ON "ConstructionPaymentPromise"("workspaceId", "idempotencyKey");
CREATE INDEX "ConstructionPaymentPromise_workspaceId_status_promisedFor_idx"
  ON "ConstructionPaymentPromise"("workspaceId", "status", "promisedFor");
CREATE INDEX "ConstructionPaymentPromise_receivableId_createdAt_idx"
  ON "ConstructionPaymentPromise"("receivableId", "createdAt");

ALTER TABLE "ConstructionPaymentPromise"
  ADD CONSTRAINT "ConstructionPaymentPromise_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionPaymentPromise"
  ADD CONSTRAINT "ConstructionPaymentPromise_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "ConstructionReceivable"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionPaymentPromise"
  ADD CONSTRAINT "ConstructionPaymentPromise_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionPaymentPromise"
  ADD CONSTRAINT "ConstructionPaymentPromise_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConstructionEconomicCommand" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "openLoopId" TEXT,
  "receivableId" TEXT,
  "promiseId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "result" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionEconomicCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionEconomicCommand_hash_check" CHECK (length("commandHash") = 64),
  CONSTRAINT "ConstructionEconomicCommand_action_check" CHECK (
    "action" IN ('ISSUE_READY_INVOICE', 'RECORD_PAYMENT_PROMISE', 'RESOLVE_PAYMENT_PROMISE')
  )
);

CREATE UNIQUE INDEX "ConstructionEconomicCommand_workspaceId_commandId_key"
  ON "ConstructionEconomicCommand"("workspaceId", "commandId");
CREATE INDEX "ConstructionEconomicCommand_receivableId_createdAt_idx"
  ON "ConstructionEconomicCommand"("receivableId", "createdAt");
CREATE INDEX "ConstructionEconomicCommand_promiseId_createdAt_idx"
  ON "ConstructionEconomicCommand"("promiseId", "createdAt");
CREATE INDEX "ConstructionEconomicCommand_workspaceId_createdAt_idx"
  ON "ConstructionEconomicCommand"("workspaceId", "createdAt");

ALTER TABLE "ConstructionEconomicCommand"
  ADD CONSTRAINT "ConstructionEconomicCommand_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEconomicCommand"
  ADD CONSTRAINT "ConstructionEconomicCommand_openLoopId_fkey"
  FOREIGN KEY ("openLoopId") REFERENCES "ConstructionOpenLoop"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEconomicCommand"
  ADD CONSTRAINT "ConstructionEconomicCommand_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "ConstructionReceivable"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEconomicCommand"
  ADD CONSTRAINT "ConstructionEconomicCommand_promiseId_fkey"
  FOREIGN KEY ("promiseId") REFERENCES "ConstructionPaymentPromise"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionEconomicCommand"
  ADD CONSTRAINT "ConstructionEconomicCommand_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION endvera_guard_construction_receivable_r21()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."openLoopId" IS DISTINCT FROM NEW."openLoopId" THEN
    RAISE EXCEPTION 'construction receivable open-loop binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionReceivable_guard_r21_update"
  BEFORE UPDATE ON "ConstructionReceivable"
  FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_receivable_r21();

CREATE FUNCTION endvera_guard_construction_payment_promise()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."receivableId" IS DISTINCT FROM NEW."receivableId"
     OR OLD."contactId" IS DISTINCT FROM NEW."contactId"
     OR OLD."promisedAmountMinor" IS DISTINCT FROM NEW."promisedAmountMinor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."promisedFor" IS DISTINCT FROM NEW."promisedFor"
     OR OLD."sourceRef" IS DISTINCT FROM NEW."sourceRef"
     OR OLD."sourceHash" IS DISTINCT FROM NEW."sourceHash"
     OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
     OR OLD."createdById" IS DISTINCT FROM NEW."createdById" THEN
    RAISE EXCEPTION 'construction payment promise identity is immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'construction payment promise version must increase exactly once';
  END IF;
  IF OLD."status" <> 'active' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal construction payment promise is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionPaymentPromise_guard_update"
  BEFORE UPDATE ON "ConstructionPaymentPromise"
  FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_payment_promise();

CREATE FUNCTION endvera_guard_construction_economic_command()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'construction economic command history is immutable';
END;
$$;
CREATE TRIGGER "ConstructionEconomicCommand_guard_update_delete"
  BEFORE UPDATE OR DELETE ON "ConstructionEconomicCommand"
  FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_economic_command();
CREATE TRIGGER "ConstructionEconomicCommand_guard_truncate"
  BEFORE TRUNCATE ON "ConstructionEconomicCommand"
  FOR EACH STATEMENT EXECUTE FUNCTION endvera_guard_construction_economic_command();

