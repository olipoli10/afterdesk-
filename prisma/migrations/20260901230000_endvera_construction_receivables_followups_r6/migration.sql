-- ENDVERA Construction Operating Assistant R6 — canonical receivables and
-- durable approval-gated follow-ups. Forward-only; no provider or transport.

CREATE TYPE "ConstructionReceivableStatus" AS ENUM ('open', 'partial', 'paid', 'disputed', 'void');
CREATE TYPE "ConstructionReceivableEventKind" AS ENUM ('issued', 'payment_received', 'promise_to_pay', 'disputed', 'note');
CREATE TYPE "ConstructionFollowUpKind" AS ENUM ('receivable_payment', 'missing_evidence');
CREATE TYPE "ConstructionFollowUpStatus" AS ENUM ('scheduled', 'prepared_unsent', 'completed', 'cancelled');
CREATE TYPE "ConstructionFollowUpChannel" AS ENUM ('SMS', 'EMAIL', 'HUMAN_CALL');

CREATE TABLE "ConstructionReceivable" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "invoiceReference" TEXT NOT NULL,
  "originalAmountMinor" INTEGER NOT NULL,
  "outstandingAmountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CAD',
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "ConstructionReceivableStatus" NOT NULL DEFAULT 'open',
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionReceivable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionReceivable_amount_check" CHECK (
    "originalAmountMinor" > 0
    AND "outstandingAmountMinor" >= 0
    AND "outstandingAmountMinor" <= "originalAmountMinor"
  ),
  CONSTRAINT "ConstructionReceivable_version_check" CHECK ("version" > 0),
  CONSTRAINT "ConstructionReceivable_paid_shape_check" CHECK (
    ("status" = 'paid' AND "outstandingAmountMinor" = 0 AND "paidAt" IS NOT NULL)
    OR ("status" <> 'paid' AND "outstandingAmountMinor" > 0 AND "paidAt" IS NULL)
  )
);

CREATE TABLE "ConstructionReceivableEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "kind" "ConstructionReceivableEventKind" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "amountMinor" INTEGER,
  "resultingOutstandingMinor" INTEGER NOT NULL,
  "note" TEXT,
  "sourceRef" TEXT,
  "actorId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConstructionReceivableEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionReceivableEvent_balance_check" CHECK ("resultingOutstandingMinor" >= 0),
  CONSTRAINT "ConstructionReceivableEvent_amount_shape_check" CHECK (
    ("kind" IN ('issued', 'payment_received') AND "amountMinor" IS NOT NULL AND "amountMinor" > 0)
    OR ("kind" NOT IN ('issued', 'payment_received'))
  )
);

CREATE TABLE "ConstructionFollowUp" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "contactId" TEXT,
  "receivableId" TEXT,
  "openLoopId" TEXT,
  "kind" "ConstructionFollowUpKind" NOT NULL,
  "status" "ConstructionFollowUpStatus" NOT NULL DEFAULT 'scheduled',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "channel" "ConstructionFollowUpChannel" NOT NULL,
  "body" TEXT NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "actionId" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "preparedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionFollowUp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConstructionFollowUp_one_target_check" CHECK (
    (("receivableId" IS NOT NULL)::int + ("openLoopId" IS NOT NULL)::int) = 1
  ),
  CONSTRAINT "ConstructionFollowUp_kind_target_check" CHECK (
    ("kind" = 'receivable_payment' AND "receivableId" IS NOT NULL AND "openLoopId" IS NULL)
    OR ("kind" = 'missing_evidence' AND "openLoopId" IS NOT NULL AND "receivableId" IS NULL)
  ),
  CONSTRAINT "ConstructionFollowUp_attempt_check" CHECK ("attempt" >= 0),
  CONSTRAINT "ConstructionFollowUp_state_shape_check" CHECK (
    ("status" = 'scheduled' AND "actionId" IS NULL AND "preparedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'prepared_unsent' AND "actionId" IS NOT NULL AND "preparedAt" IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'completed' AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'cancelled' AND "cancelledAt" IS NOT NULL AND "completedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "ConstructionReceivable_workspace_invoice_key" ON "ConstructionReceivable"("workspaceId", "invoiceReference");
CREATE UNIQUE INDEX "ConstructionReceivable_workspace_idempotency_key" ON "ConstructionReceivable"("workspaceId", "idempotencyKey");
CREATE INDEX "ConstructionReceivable_workspace_status_due_idx" ON "ConstructionReceivable"("workspaceId", "status", "dueAt");
CREATE INDEX "ConstructionReceivable_project_status_idx" ON "ConstructionReceivable"("projectId", "status");
CREATE UNIQUE INDEX "ConstructionReceivableEvent_receivable_event_key" ON "ConstructionReceivableEvent"("receivableId", "eventKey");
CREATE INDEX "ConstructionReceivableEvent_workspace_created_idx" ON "ConstructionReceivableEvent"("workspaceId", "createdAt");
CREATE INDEX "ConstructionReceivableEvent_receivable_created_idx" ON "ConstructionReceivableEvent"("receivableId", "createdAt");
CREATE UNIQUE INDEX "ConstructionFollowUp_workspace_idempotency_key" ON "ConstructionFollowUp"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "ConstructionFollowUp_actionId_key" ON "ConstructionFollowUp"("actionId");
CREATE INDEX "ConstructionFollowUp_status_due_idx" ON "ConstructionFollowUp"("status", "dueAt");
CREATE INDEX "ConstructionFollowUp_workspace_status_due_idx" ON "ConstructionFollowUp"("workspaceId", "status", "dueAt");
CREATE INDEX "ConstructionFollowUp_receivable_status_idx" ON "ConstructionFollowUp"("receivableId", "status");
CREATE INDEX "ConstructionFollowUp_openLoop_status_idx" ON "ConstructionFollowUp"("openLoopId", "status");

ALTER TABLE "ConstructionReceivable" ADD CONSTRAINT "ConstructionReceivable_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReceivable" ADD CONSTRAINT "ConstructionReceivable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReceivable" ADD CONSTRAINT "ConstructionReceivable_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionReceivable" ADD CONSTRAINT "ConstructionReceivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReceivableEvent" ADD CONSTRAINT "ConstructionReceivableEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReceivableEvent" ADD CONSTRAINT "ConstructionReceivableEvent_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "ConstructionReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionReceivableEvent" ADD CONSTRAINT "ConstructionReceivableEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ConstructionWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ConstructionContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "ConstructionReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_openLoopId_fkey" FOREIGN KEY ("openLoopId") REFERENCES "ConstructionOpenLoop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionFollowUp" ADD CONSTRAINT "ConstructionFollowUp_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ConstructionAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION endvera_guard_construction_receivable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."invoiceReference" IS DISTINCT FROM NEW."invoiceReference"
     OR OLD."originalAmountMinor" IS DISTINCT FROM NEW."originalAmountMinor"
     OR OLD."currency" IS DISTINCT FROM NEW."currency"
     OR OLD."issuedAt" IS DISTINCT FROM NEW."issuedAt"
     OR OLD."createdById" IS DISTINCT FROM NEW."createdById"
     OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey" THEN
    RAISE EXCEPTION 'construction receivable identity and original economics are immutable';
  END IF;
  IF NEW."version" <= OLD."version" THEN
    RAISE EXCEPTION 'construction receivable version must increase';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionReceivable_guard_update" BEFORE UPDATE ON "ConstructionReceivable" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_receivable();

CREATE FUNCTION endvera_guard_construction_receivable_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'construction receivable event history is immutable';
END;
$$;
CREATE TRIGGER "ConstructionReceivableEvent_guard_update_delete" BEFORE UPDATE OR DELETE ON "ConstructionReceivableEvent" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_receivable_event();
CREATE TRIGGER "ConstructionReceivableEvent_guard_truncate" BEFORE TRUNCATE ON "ConstructionReceivableEvent" FOR EACH STATEMENT EXECUTE FUNCTION endvera_guard_construction_receivable_event();

CREATE FUNCTION endvera_guard_construction_follow_up()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     OR OLD."projectId" IS DISTINCT FROM NEW."projectId"
     OR OLD."receivableId" IS DISTINCT FROM NEW."receivableId"
     OR OLD."openLoopId" IS DISTINCT FROM NEW."openLoopId"
     OR OLD."kind" IS DISTINCT FROM NEW."kind"
     OR OLD."channel" IS DISTINCT FROM NEW."channel"
     OR OLD."bodyHash" IS DISTINCT FROM NEW."bodyHash"
     OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
     OR OLD."requestedById" IS DISTINCT FROM NEW."requestedById" THEN
    RAISE EXCEPTION 'construction follow-up contract is immutable';
  END IF;
  IF OLD."actionId" IS NOT NULL AND NEW."actionId" IS DISTINCT FROM OLD."actionId" THEN
    RAISE EXCEPTION 'prepared construction follow-up action is immutable';
  END IF;
  IF OLD."status" IN ('completed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal construction follow-up is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConstructionFollowUp_guard_update" BEFORE UPDATE ON "ConstructionFollowUp" FOR EACH ROW EXECUTE FUNCTION endvera_guard_construction_follow_up();
