-- Personal model requests use the existing gateway, with a separate CAD pilot
-- child ledger. The gateway/account hold continues to record USD exposure.
-- No route, policy, consent, account or credential is activated by this migration.
ALTER TABLE "PersonalAssistantOperation" ADD COLUMN "sourcePersonalOperationId" TEXT;
ALTER TABLE "PersonalAssistantOperation" ADD COLUMN "modelGatewayOperationId" TEXT;
CREATE UNIQUE INDEX "PersonalAssistantOperation_id_workspaceId_createdByUserId_key"
  ON "PersonalAssistantOperation"(id,"workspaceId","createdByUserId");
CREATE UNIQUE INDEX "PersonalAssistantOperation_sourcePersonalOperationId_kind_key"
  ON "PersonalAssistantOperation"("sourcePersonalOperationId",kind);
CREATE UNIQUE INDEX "PersonalAssistantOperation_modelGatewayOperationId_key"
  ON "PersonalAssistantOperation"("modelGatewayOperationId");
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_sourcePersonalOperation_fkey"
  FOREIGN KEY ("sourcePersonalOperationId","workspaceId","createdByUserId")
  REFERENCES "PersonalAssistantOperation"(id,"workspaceId","createdByUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_modelGatewayOperationId_fkey"
  FOREIGN KEY ("modelGatewayOperationId") REFERENCES "ModelGatewayOperation"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "PersonalAssistantOperation_kind_check";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_kind_check"
  CHECK (kind IN ('personal_sms_inbound','google_oauth','calendar_write','sms_outbound','voice_outbound','sms_pairing','personal_model_candidate_v1'));
ALTER TABLE "ConstructionConnectorGrant" DROP CONSTRAINT "ConstructionConnectorGrant_capability_check";
ALTER TABLE "ConstructionConnectorGrant" ADD CONSTRAINT "ConstructionConnectorGrant_capability_check"
  CHECK (capability IN ('calendar_read','calendar_write','sms_inbound','sms_outbound_prepare','voice_transcript_inbound',
    'personal_sms_send','personal_voice_send','personal_model_inference'));
ALTER TABLE "ConstructionConnectorAccount" DROP CONSTRAINT "ConstructionConnectorAccount_provider_check";
ALTER TABLE "ConstructionConnectorAccount" ADD CONSTRAINT "ConstructionConnectorAccount_provider_check"
  CHECK (provider IN ('google_calendar','microsoft_calendar','endvera_sms','endvera_voice','openrouter'));
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "personal_model_child_shape_ck" CHECK (
  (kind='personal_model_candidate_v1' AND "sourcePersonalOperationId" IS NOT NULL AND "modelGatewayOperationId" IS NOT NULL
    AND "budgetId" IS NOT NULL AND "reservedCadMicros" IS NOT NULL
    AND status IN ('received','processing','completed','refused','uncertain'))
  OR (kind<>'personal_model_candidate_v1' AND "sourcePersonalOperationId" IS NULL AND "modelGatewayOperationId" IS NULL)
);

ALTER TABLE "ModelGatewayPolicyVersion" DROP CONSTRAINT "mg_policy_closed_fields";
ALTER TABLE "ModelGatewayPolicyVersion" ADD CONSTRAINT "mg_policy_closed_fields" CHECK (
  version>0 AND "operationType" IN ('classification','intake_voice_transcription','personal_intent_candidate_v1')
  AND status IN ('draft','published','retired') AND "maxAttempts">0 AND "maxTotalCostMicros">=0
  AND "requiredPrivacyPosture" IN ('standard','no_training','zero_retention','regional_zero_retention')
  AND "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
  AND ("operationType"<>'personal_intent_candidate_v1' OR "maxAttempts"=1)
);
ALTER TABLE "ModelGatewayOperation" DROP CONSTRAINT "mg_operation_closed_fields";
ALTER TABLE "ModelGatewayOperation" ADD CONSTRAINT "mg_operation_closed_fields" CHECK (
  "operationType" IN ('classification','intake_voice_transcription','personal_intent_candidate_v1')
  AND "dataClass" IN ('public','business_confidential','personal_data','restricted_sensitive')
  AND "privacyRequirement" IN ('standard','no_training','zero_retention','regional_zero_retention')
  AND status IN ('admitted','running','succeeded','failed','uncertain','refused') AND "maxTotalCostMicros">=0
  AND "requestFingerprint" ~ '^sha256:[a-f0-9]{64}$' AND "outputContractHash" ~ '^sha256:[a-f0-9]{64}$'
);

CREATE FUNCTION personal_model_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound BOOLEAN;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.kind='personal_model_candidate_v1' OR NEW.kind='personal_model_candidate_v1') THEN
    IF ROW(NEW.kind,NEW."sourcePersonalOperationId",NEW."modelGatewayOperationId",NEW."workspaceId",NEW."createdByUserId",NEW."connectorAccountId",NEW."idempotencyKey",NEW.request,NEW."requestHash",NEW."createdAt")
      IS DISTINCT FROM ROW(OLD.kind,OLD."sourcePersonalOperationId",OLD."modelGatewayOperationId",OLD."workspaceId",OLD."createdByUserId",OLD."connectorAccountId",OLD."idempotencyKey",OLD.request,OLD."requestHash",OLD."createdAt") THEN
      RAISE EXCEPTION 'personal model child identity is immutable';
    END IF;
    IF ROW(NEW."budgetId",NEW."reservedCadMicros") IS DISTINCT FROM ROW(OLD."budgetId",OLD."reservedCadMicros") THEN
      RAISE EXCEPTION 'personal model child budget binding is immutable';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='received' AND NEW.status IN ('processing','refused','uncertain')) OR
      (OLD.status='processing' AND NEW.status IN ('completed','refused','uncertain'))
    ) THEN RAISE EXCEPTION 'personal model child transition refused'; END IF;
    IF OLD.status IN ('completed','refused','uncertain') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'personal model child terminal evidence is immutable';
    END IF;
  END IF;
  IF NEW.kind='personal_model_candidate_v1' THEN
    SELECT true INTO bound FROM "PersonalAssistantOperation" source
      JOIN "ConstructionConnectorAccount" sms ON sms.id=source."connectorAccountId" AND sms.provider='endvera_sms'
      JOIN "ConstructionConnectorAccount" model ON model.id=NEW."connectorAccountId" AND model.provider='openrouter'
        AND model."workspaceId"=source."workspaceId" AND model."createdByUserId"=source."createdByUserId"
      JOIN "ModelGatewayOperation" gateway ON gateway.id=NEW."modelGatewayOperationId"
        AND gateway."operationType"='personal_intent_candidate_v1' AND gateway."tenantId"='construction-workspace:'||source."workspaceId"
      JOIN "AiOperation" ai ON ai.id=gateway."aiOperationId" AND ai."personalAssistantOperationId"=source.id
        AND ai.purpose='personal_intent_candidate_v1' AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
      WHERE source.id=NEW."sourcePersonalOperationId" AND source.kind='personal_sms_inbound'
        AND source."workspaceId"=NEW."workspaceId" AND source."createdByUserId"=NEW."createdByUserId";
    IF bound IS DISTINCT FROM true THEN RAISE EXCEPTION 'personal model child source/provider/gateway mismatch'; END IF;
    IF NEW.status='processing' AND (NEW."budgetId" IS NULL OR NEW."reservedCadMicros" IS NULL OR NEW.attempts<>1) THEN
      RAISE EXCEPTION 'personal model processing requires a single reserved attempt';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "personal_model_child_guard" BEFORE INSERT OR UPDATE ON "PersonalAssistantOperation"
  FOR EACH ROW EXECUTE FUNCTION personal_model_child_guard();
