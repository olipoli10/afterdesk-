-- Model Gateway content-free audit ledger. Additive only. The table has no
-- arbitrary JSON/free-text column by design, so ordinary evidence cannot be
-- used to store prompts, outputs, credentials or provider dumps.

CREATE TABLE "ModelGatewayAuditEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "gatewayOperationId" TEXT,
  "tenantId" TEXT,
  "attemptId" TEXT,
  "decisionId" TEXT,
  "policyHash" TEXT,
  "routeHash" TEXT,
  "spendHoldId" TEXT,
  "billingProvider" TEXT,
  "amountMicros" BIGINT,
  "errorClass" TEXT,
  "dispatchState" TEXT,
  "resultContractStatus" TEXT,
  "evidenceRef" TEXT,
  "actorId" TEXT,
  "eventFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelGatewayAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_audit_event_closed_fields" CHECK (
    "eventType" IN (
      'model_gateway.admission.accepted','model_gateway.admission.refused',
      'model_gateway.policy.published','model_gateway.policy.retired',
      'model_gateway.route.certified','model_gateway.route.revoked',
      'model_gateway.decision.authorized','model_gateway.decision.refused',
      'model_gateway.attempt.prepared','model_gateway.attempt.dispatched',
      'model_gateway.attempt.settled','model_gateway.attempt.failed','model_gateway.attempt.uncertain',
      'model_gateway.breaker.opened','model_gateway.breaker.closed',
      'model_gateway.spend.held','model_gateway.spend.released','model_gateway.spend.settled',
      'model_gateway.replay.converged'
    ) AND "correlationId" ~ '^[A-Za-z0-9_.:@/-]{1,240}$' AND
    ("policyHash" IS NULL OR "policyHash" ~ '^sha256:[a-f0-9]{64}$') AND
    ("routeHash" IS NULL OR "routeHash" ~ '^sha256:[a-f0-9]{64}$') AND
    ("evidenceRef" IS NULL OR "evidenceRef" ~ '^sha256:[a-f0-9]{64}$') AND
    ("amountMicros" IS NULL OR "amountMicros" >= 0)
  )
);

CREATE UNIQUE INDEX "ModelGatewayAuditEvent_eventFingerprint_key" ON "ModelGatewayAuditEvent"("eventFingerprint");
CREATE INDEX "ModelGatewayAuditEvent_gatewayOperationId_createdAt_idx" ON "ModelGatewayAuditEvent"("gatewayOperationId","createdAt");
CREATE INDEX "ModelGatewayAuditEvent_tenantId_createdAt_idx" ON "ModelGatewayAuditEvent"("tenantId","createdAt");
CREATE INDEX "ModelGatewayAuditEvent_correlationId_idx" ON "ModelGatewayAuditEvent"("correlationId");

ALTER TABLE "ModelGatewayAuditEvent" ADD CONSTRAINT "ModelGatewayAuditEvent_gatewayOperationId_fkey"
  FOREIGN KEY ("gatewayOperationId") REFERENCES "ModelGatewayOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "model_gateway_audit_event_append_only"
BEFORE UPDATE OR DELETE ON "ModelGatewayAuditEvent"
FOR EACH ROW EXECUTE FUNCTION mg_reject_append_only();
