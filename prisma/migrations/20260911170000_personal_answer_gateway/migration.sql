-- Register separate answer/research subjects in the EXISTING gateway.
-- No policy, provider route, credential, account or runtime flag is activated.
ALTER TABLE "AiOperation" DROP CONSTRAINT "ai_operation_personal_subject_ck";
ALTER TABLE "AiOperation" ADD CONSTRAINT "ai_operation_personal_subject_ck" CHECK (
  (purpose IN ('personal_intent_candidate_v1','personal_answer_candidate_v1','personal_public_research_v1')
    AND "personalAssistantOperationId" IS NOT NULL AND "taskId" IS NULL AND "voiceIntakeSegmentId" IS NULL)
  OR (purpose NOT IN ('personal_intent_candidate_v1','personal_answer_candidate_v1','personal_public_research_v1')
    AND "personalAssistantOperationId" IS NULL)
);
ALTER TABLE "ModelGatewayPolicyVersion" DROP CONSTRAINT "mg_policy_closed_fields";
ALTER TABLE "ModelGatewayPolicyVersion" ADD CONSTRAINT "mg_policy_closed_fields" CHECK (
  version>0 AND "operationType" IN ('classification','intake_voice_transcription','personal_intent_candidate_v1','personal_answer_candidate_v1','personal_public_research_v1')
  AND status IN ('draft','published','retired') AND "maxAttempts">0 AND "maxTotalCostMicros">=0
  AND "requiredPrivacyPosture" IN ('standard','no_training','zero_retention','regional_zero_retention')
  AND "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
  AND ("operationType" NOT IN ('personal_intent_candidate_v1','personal_answer_candidate_v1','personal_public_research_v1') OR "maxAttempts"=1)
);
ALTER TABLE "ModelGatewayOperation" DROP CONSTRAINT "mg_operation_closed_fields";
ALTER TABLE "ModelGatewayOperation" ADD CONSTRAINT "mg_operation_closed_fields" CHECK (
  "operationType" IN ('classification','intake_voice_transcription','personal_intent_candidate_v1','personal_answer_candidate_v1','personal_public_research_v1')
  AND "dataClass" IN ('public','business_confidential','personal_data','restricted_sensitive')
  AND "privacyRequirement" IN ('standard','no_training','zero_retention','regional_zero_retention')
  AND status IN ('admitted','running','succeeded','failed','uncertain','refused') AND "maxTotalCostMicros">=0
  AND "requestFingerprint" ~ '^sha256:[a-f0-9]{64}$' AND "outputContractHash" ~ '^sha256:[a-f0-9]{64}$'
);
ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "PersonalAssistantOperation_kind_check";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_kind_check" CHECK (
  kind IN ('personal_sms_inbound','google_oauth','calendar_write','sms_outbound','voice_outbound','sms_pairing',
    'personal_model_candidate_v1','calendar_confirmation_summary','device_calendar_write_v1','personal_answer_v1')
);
ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "personal_model_child_shape_ck";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "personal_model_child_shape_ck" CHECK (
  (kind IN ('personal_model_candidate_v1','personal_answer_v1') AND "sourcePersonalOperationId" IS NOT NULL AND "modelGatewayOperationId" IS NOT NULL
    AND "budgetId" IS NOT NULL AND "reservedCadMicros" IS NOT NULL
    AND status IN ('received','processing','completed','refused','uncertain'))
  OR (kind='device_calendar_write_v1' AND "sourcePersonalOperationId" IS NOT NULL AND "modelGatewayOperationId" IS NULL
    AND "budgetId" IS NULL AND "reservedCadMicros" IS NULL)
  OR (kind NOT IN ('personal_model_candidate_v1','personal_answer_v1','device_calendar_write_v1')
    AND "sourcePersonalOperationId" IS NULL AND "modelGatewayOperationId" IS NULL)
);
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "personal_answer_shape_ck" CHECK (
  kind<>'personal_answer_v1' OR (
    (status='received' AND attempts=0 AND result IS NULL AND "externalTransportPerformed"=false)
    OR (status='processing' AND attempts=1 AND "leaseUntil" IS NOT NULL AND result IS NOT NULL)
    OR (status IN ('completed','uncertain','refused') AND attempts=1 AND "leaseUntil" IS NULL AND result IS NOT NULL)
  )
);
CREATE FUNCTION personal_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound BOOLEAN;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.kind='personal_answer_v1' OR NEW.kind='personal_answer_v1') THEN
    IF ROW(NEW.kind,NEW."sourcePersonalOperationId",NEW."modelGatewayOperationId",NEW."workspaceId",NEW."createdByUserId",NEW."connectorAccountId",NEW."idempotencyKey",NEW.request,NEW."requestHash",NEW."createdAt",NEW."budgetId",NEW."reservedCadMicros")
      IS DISTINCT FROM ROW(OLD.kind,OLD."sourcePersonalOperationId",OLD."modelGatewayOperationId",OLD."workspaceId",OLD."createdByUserId",OLD."connectorAccountId",OLD."idempotencyKey",OLD.request,OLD."requestHash",OLD."createdAt",OLD."budgetId",OLD."reservedCadMicros") THEN
      RAISE EXCEPTION 'personal answer binding is immutable';
    END IF;
    IF OLD.status IN ('completed','refused','uncertain') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'personal answer terminal evidence is immutable';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='received' AND NEW.status IN ('processing','uncertain'))
      OR (OLD.status='processing' AND NEW.status IN ('completed','refused','uncertain'))
    ) THEN RAISE EXCEPTION 'personal answer transition refused'; END IF;
  END IF;
  IF NEW.kind='personal_answer_v1' THEN
    SELECT true INTO bound FROM "PersonalAssistantOperation" s
      JOIN "ConstructionConnectorAccount" sms ON sms.id=s."connectorAccountId" AND sms.provider='endvera_sms'
      JOIN "ConstructionConnectorAccount" model ON model.id=NEW."connectorAccountId" AND model.provider='openrouter'
        AND model."workspaceId"=s."workspaceId" AND model."createdByUserId"=s."createdByUserId"
      JOIN "ModelGatewayOperation" g ON g.id=NEW."modelGatewayOperationId"
        AND g."operationType" IN ('personal_answer_candidate_v1','personal_public_research_v1')
        AND g."tenantId"='construction-workspace:'||s."workspaceId"
      JOIN "AiOperation" ai ON ai.id=g."aiOperationId" AND ai."personalAssistantOperationId"=s.id
        AND ai.purpose=g."operationType" AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
      WHERE s.id=NEW."sourcePersonalOperationId" AND s.kind='personal_sms_inbound'
        AND s."workspaceId"=NEW."workspaceId" AND s."createdByUserId"=NEW."createdByUserId";
    IF bound IS DISTINCT FROM true THEN RAISE EXCEPTION 'personal answer source/provider/gateway mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "personal_answer_guard" BEFORE INSERT OR UPDATE ON "PersonalAssistantOperation"
  FOR EACH ROW EXECUTE FUNCTION personal_answer_guard();
