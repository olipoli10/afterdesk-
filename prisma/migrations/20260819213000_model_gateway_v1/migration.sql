-- Model Gateway v1 foundation. Additive only: no existing table or enum is
-- rewritten, and rollout remains disabled in code.

CREATE TABLE "ModelGatewayPolicyVersion" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "operationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "routeOrder" JSONB NOT NULL,
  "fallbackRules" JSONB NOT NULL,
  "maxAttempts" INTEGER NOT NULL,
  "maxTotalCostMicros" BIGINT NOT NULL,
  "requiredPrivacyPosture" TEXT NOT NULL,
  "canonicalHash" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "ModelGatewayPolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_policy_closed_fields" CHECK (
    "version" > 0 AND "operationType" = 'classification' AND
    "status" IN ('draft','published','retired') AND "maxAttempts" > 0 AND
    "maxTotalCostMicros" >= 0 AND
    "requiredPrivacyPosture" IN ('standard','no_training','zero_retention','regional_zero_retention') AND
    "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
  )
);

CREATE TABLE "ModelGatewayRouteProfile" (
  "id" TEXT NOT NULL,
  "routeKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "pathKind" TEXT NOT NULL,
  "adapterKey" TEXT NOT NULL,
  "billingProvider" TEXT NOT NULL,
  "intermediary" TEXT,
  "endpointKey" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "operationTypes" TEXT[] NOT NULL,
  "allowedDataClasses" TEXT[] NOT NULL,
  "privacyPosture" TEXT NOT NULL,
  "residency" TEXT[] NOT NULL,
  "pricingEvidence" JSONB NOT NULL,
  "privacyEvidence" JSONB NOT NULL,
  "maxInputTokens" INTEGER NOT NULL,
  "maxOutputTokens" INTEGER NOT NULL,
  "canonicalHash" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "ModelGatewayRouteProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_route_closed_fields" CHECK (
    "version" > 0 AND "status" IN ('draft','published','retired') AND
    "pathKind" IN ('direct_provider','gateway_mediated') AND
    (("pathKind"='direct_provider' AND "intermediary" IS NULL) OR
     ("pathKind"='gateway_mediated' AND "intermediary" IS NOT NULL)) AND
    cardinality("operationTypes") > 0 AND cardinality("allowedDataClasses") > 0 AND
    "maxInputTokens" > 0 AND "maxOutputTokens" > 0 AND
    "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
  )
);

CREATE TABLE "ModelGatewayOperation" (
  "id" TEXT NOT NULL,
  "aiOperationId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "outputContractHash" TEXT NOT NULL,
  "dataClass" TEXT NOT NULL,
  "privacyRequirement" TEXT NOT NULL,
  "policyVersionId" TEXT NOT NULL,
  "maxTotalCostMicros" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'admitted',
  "finalAttemptId" TEXT,
  "resultEvidenceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ModelGatewayOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_operation_closed_fields" CHECK (
    "operationType"='classification' AND
    "dataClass" IN ('public','business_confidential','personal_data','restricted_sensitive') AND
    "privacyRequirement" IN ('standard','no_training','zero_retention','regional_zero_retention') AND
    "status" IN ('admitted','running','succeeded','failed','uncertain','refused') AND
    "maxTotalCostMicros" >= 0 AND
    "requestFingerprint" ~ '^sha256:[a-f0-9]{64}$' AND
    "outputContractHash" ~ '^sha256:[a-f0-9]{64}$'
  )
);

CREATE TABLE "ModelGatewayDecision" (
  "id" TEXT NOT NULL,
  "gatewayOperationId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "disposition" TEXT NOT NULL,
  "routeProfileId" TEXT,
  "reasonClass" TEXT NOT NULL,
  "policyHash" TEXT NOT NULL,
  "routeHash" TEXT,
  "privacyEvidenceHash" TEXT,
  "breakerGeneration" BIGINT NOT NULL,
  "remainingCostMicros" BIGINT NOT NULL,
  "decisionFingerprint" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelGatewayDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_decision_shape" CHECK (
    "attempt" > 0 AND "breakerGeneration" >= 0 AND "remainingCostMicros" >= 0 AND
    "policyHash" ~ '^sha256:[a-f0-9]{64}$' AND
    "decisionFingerprint" ~ '^sha256:[a-f0-9]{64}$' AND
    (("disposition"='route_authorized' AND "routeProfileId" IS NOT NULL AND
      "routeHash" IS NOT NULL AND "privacyEvidenceHash" IS NOT NULL) OR
     ("disposition"='refused' AND "routeProfileId" IS NULL))
  )
);

CREATE TABLE "ModelGatewayAttempt" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "accountSpendHoldId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'prepared',
  "providerRequestRef" TEXT,
  "dispatchState" TEXT NOT NULL DEFAULT 'not_dispatched',
  "errorClass" TEXT,
  "httpStatus" INTEGER,
  "resultContractStatus" TEXT NOT NULL DEFAULT 'not_evaluated',
  "requestEvidenceRef" TEXT,
  "responseEvidenceRef" TEXT,
  "aiUsageId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ModelGatewayAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_attempt_closed_fields" CHECK (
    "status" IN ('prepared','dispatched','settled','failed','uncertain','cancelled_before_dispatch') AND
    "dispatchState" IN ('not_dispatched','settled','dispatched_then_cancelled','unaccounted') AND
    "resultContractStatus" IN ('not_evaluated','valid','invalid') AND
    ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599)
  )
);

CREATE TABLE "ModelGatewayBreaker" (
  "id" TEXT NOT NULL,
  "scopeKind" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "generation" BIGINT NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'closed',
  "reasonClass" TEXT NOT NULL,
  "changedBy" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelGatewayBreaker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_breaker_closed_fields" CHECK (
    "scopeKind" IN ('policy','route','model','provider') AND
    "generation" >= 0 AND "state" IN ('closed','open')
  )
);

CREATE TABLE "ModelGatewayBreakerEvent" (
  "id" TEXT NOT NULL,
  "scopeKind" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "priorGeneration" BIGINT NOT NULL,
  "newGeneration" BIGINT NOT NULL,
  "priorState" TEXT NOT NULL,
  "newState" TEXT NOT NULL,
  "reasonClass" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelGatewayBreakerEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mg_breaker_event_transition" CHECK (
    "scopeKind" IN ('policy','route','model','provider') AND
    "newGeneration" = "priorGeneration" + 1 AND
    "priorState" IN ('closed','open') AND "newState" IN ('closed','open') AND
    "priorState" <> "newState"
  )
);

CREATE UNIQUE INDEX "ModelGatewayPolicyVersion_policyKey_version_key" ON "ModelGatewayPolicyVersion"("policyKey","version");
CREATE UNIQUE INDEX "ModelGatewayPolicyVersion_canonicalHash_key" ON "ModelGatewayPolicyVersion"("canonicalHash");
CREATE INDEX "ModelGatewayPolicyVersion_operationType_status_idx" ON "ModelGatewayPolicyVersion"("operationType","status");
CREATE UNIQUE INDEX "ModelGatewayRouteProfile_routeKey_version_key" ON "ModelGatewayRouteProfile"("routeKey","version");
CREATE UNIQUE INDEX "ModelGatewayRouteProfile_canonicalHash_key" ON "ModelGatewayRouteProfile"("canonicalHash");
CREATE INDEX "ModelGatewayRouteProfile_adapterKey_status_idx" ON "ModelGatewayRouteProfile"("adapterKey","status");
CREATE UNIQUE INDEX "ModelGatewayOperation_aiOperationId_key" ON "ModelGatewayOperation"("aiOperationId");
CREATE UNIQUE INDEX "ModelGatewayOperation_finalAttemptId_key" ON "ModelGatewayOperation"("finalAttemptId");
CREATE INDEX "ModelGatewayOperation_tenantId_status_idx" ON "ModelGatewayOperation"("tenantId","status");
CREATE INDEX "ModelGatewayOperation_policyVersionId_idx" ON "ModelGatewayOperation"("policyVersionId");
CREATE UNIQUE INDEX "ModelGatewayDecision_gatewayOperationId_attempt_key" ON "ModelGatewayDecision"("gatewayOperationId","attempt");
CREATE UNIQUE INDEX "ModelGatewayDecision_decisionFingerprint_key" ON "ModelGatewayDecision"("decisionFingerprint");
CREATE INDEX "ModelGatewayDecision_routeProfileId_idx" ON "ModelGatewayDecision"("routeProfileId");
CREATE UNIQUE INDEX "ModelGatewayAttempt_decisionId_key" ON "ModelGatewayAttempt"("decisionId");
CREATE UNIQUE INDEX "ModelGatewayAttempt_accountSpendHoldId_key" ON "ModelGatewayAttempt"("accountSpendHoldId");
CREATE UNIQUE INDEX "ModelGatewayAttempt_aiUsageId_key" ON "ModelGatewayAttempt"("aiUsageId");
CREATE INDEX "ModelGatewayAttempt_status_startedAt_idx" ON "ModelGatewayAttempt"("status","startedAt");
CREATE UNIQUE INDEX "ModelGatewayBreaker_scopeKind_scopeKey_key" ON "ModelGatewayBreaker"("scopeKind","scopeKey");
CREATE INDEX "ModelGatewayBreaker_state_scopeKind_idx" ON "ModelGatewayBreaker"("state","scopeKind");
CREATE UNIQUE INDEX "ModelGatewayBreakerEvent_scopeKind_scopeKey_newGeneration_key" ON "ModelGatewayBreakerEvent"("scopeKind","scopeKey","newGeneration");
CREATE INDEX "ModelGatewayBreakerEvent_correlationId_idx" ON "ModelGatewayBreakerEvent"("correlationId");

ALTER TABLE "ModelGatewayOperation" ADD CONSTRAINT "ModelGatewayOperation_aiOperationId_fkey" FOREIGN KEY ("aiOperationId") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelGatewayOperation" ADD CONSTRAINT "ModelGatewayOperation_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "ModelGatewayPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelGatewayDecision" ADD CONSTRAINT "ModelGatewayDecision_gatewayOperationId_fkey" FOREIGN KEY ("gatewayOperationId") REFERENCES "ModelGatewayOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelGatewayDecision" ADD CONSTRAINT "ModelGatewayDecision_routeProfileId_fkey" FOREIGN KEY ("routeProfileId") REFERENCES "ModelGatewayRouteProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelGatewayAttempt" ADD CONSTRAINT "ModelGatewayAttempt_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ModelGatewayDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelGatewayAttempt" ADD CONSTRAINT "ModelGatewayAttempt_accountSpendHoldId_fkey" FOREIGN KEY ("accountSpendHoldId") REFERENCES "AccountProviderSpendHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelGatewayAttempt" ADD CONSTRAINT "ModelGatewayAttempt_aiUsageId_fkey" FOREIGN KEY ("aiUsageId") REFERENCES "AiUsage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION mg_reject_policy_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('published','retired') THEN
    IF OLD."status"='published' AND NEW."status"='retired'
       AND NEW."retiredAt" IS NOT NULL
       AND ROW(NEW."policyKey",NEW."version",NEW."operationType",NEW."routeOrder",NEW."fallbackRules",NEW."maxAttempts",NEW."maxTotalCostMicros",NEW."requiredPrivacyPosture",NEW."canonicalHash",NEW."createdBy",NEW."createdAt",NEW."publishedAt")
           IS NOT DISTINCT FROM
           ROW(OLD."policyKey",OLD."version",OLD."operationType",OLD."routeOrder",OLD."fallbackRules",OLD."maxAttempts",OLD."maxTotalCostMicros",OLD."requiredPrivacyPosture",OLD."canonicalHash",OLD."createdBy",OLD."createdAt",OLD."publishedAt") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published ModelGatewayPolicyVersion is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "model_gateway_policy_history_immutable"
BEFORE UPDATE OR DELETE ON "ModelGatewayPolicyVersion"
FOR EACH ROW EXECUTE FUNCTION mg_reject_policy_history_mutation();

CREATE OR REPLACE FUNCTION mg_reject_route_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('published','retired') THEN
    IF TG_OP='UPDATE' AND OLD."status"='published' AND NEW."status"='retired'
       AND NEW."retiredAt" IS NOT NULL
       AND ROW(NEW."routeKey",NEW."version",NEW."pathKind",NEW."adapterKey",NEW."billingProvider",NEW."intermediary",NEW."endpointKey",NEW."modelKey",NEW."operationTypes",NEW."allowedDataClasses",NEW."privacyPosture",NEW."residency",NEW."pricingEvidence",NEW."privacyEvidence",NEW."maxInputTokens",NEW."maxOutputTokens",NEW."canonicalHash",NEW."createdBy",NEW."createdAt",NEW."publishedAt")
           IS NOT DISTINCT FROM
           ROW(OLD."routeKey",OLD."version",OLD."pathKind",OLD."adapterKey",OLD."billingProvider",OLD."intermediary",OLD."endpointKey",OLD."modelKey",OLD."operationTypes",OLD."allowedDataClasses",OLD."privacyPosture",OLD."residency",OLD."pricingEvidence",OLD."privacyEvidence",OLD."maxInputTokens",OLD."maxOutputTokens",OLD."canonicalHash",OLD."createdBy",OLD."createdAt",OLD."publishedAt") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published ModelGatewayRouteProfile is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "model_gateway_route_history_immutable"
BEFORE UPDATE OR DELETE ON "ModelGatewayRouteProfile"
FOR EACH ROW EXECUTE FUNCTION mg_reject_route_history_mutation();

CREATE OR REPLACE FUNCTION mg_reject_operation_rebinding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."aiOperationId",NEW."tenantId",NEW."operationType",NEW."requestFingerprint",NEW."outputContractHash",NEW."dataClass",NEW."privacyRequirement",NEW."policyVersionId",NEW."maxTotalCostMicros",NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."aiOperationId",OLD."tenantId",OLD."operationType",OLD."requestFingerprint",OLD."outputContractHash",OLD."dataClass",OLD."privacyRequirement",OLD."policyVersionId",OLD."maxTotalCostMicros",OLD."createdAt") THEN
    RAISE EXCEPTION 'ModelGatewayOperation admission binding is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "model_gateway_operation_binding_immutable"
BEFORE UPDATE ON "ModelGatewayOperation"
FOR EACH ROW EXECUTE FUNCTION mg_reject_operation_rebinding();

CREATE OR REPLACE FUNCTION mg_reject_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER "model_gateway_decision_append_only"
BEFORE UPDATE OR DELETE ON "ModelGatewayDecision"
FOR EACH ROW EXECUTE FUNCTION mg_reject_append_only();

CREATE TRIGGER "model_gateway_breaker_event_append_only"
BEFORE UPDATE OR DELETE ON "ModelGatewayBreakerEvent"
FOR EACH ROW EXECUTE FUNCTION mg_reject_append_only();

CREATE OR REPLACE FUNCTION mg_attempt_requires_authorized_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE decision_disposition TEXT;
BEGIN
  SELECT "disposition" INTO decision_disposition FROM "ModelGatewayDecision" WHERE "id"=NEW."decisionId";
  IF decision_disposition IS DISTINCT FROM 'route_authorized' THEN
    RAISE EXCEPTION 'ModelGatewayAttempt requires a durable route_authorized decision';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "model_gateway_attempt_authorized_lineage"
BEFORE INSERT ON "ModelGatewayAttempt"
FOR EACH ROW EXECUTE FUNCTION mg_attempt_requires_authorized_decision();
