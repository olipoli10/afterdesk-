-- Durable Android calendar bridge. This stores only encrypted device metadata,
-- hashes and one-use directives. It does not grant device permission or enable
-- Expo transport by itself.

ALTER TABLE "ConstructionConnectorAccount" DROP CONSTRAINT "ConstructionConnectorAccount_provider_check";
ALTER TABLE "ConstructionConnectorAccount" ADD CONSTRAINT "ConstructionConnectorAccount_provider_check"
  CHECK (provider IN ('google_calendar','microsoft_calendar','endvera_sms','endvera_voice','openrouter','endvera_android_device'));

ALTER TABLE "ConstructionConnectorGrant" DROP CONSTRAINT "ConstructionConnectorGrant_capability_check";
ALTER TABLE "ConstructionConnectorGrant" ADD CONSTRAINT "ConstructionConnectorGrant_capability_check"
  CHECK (capability IN ('calendar_read','calendar_write','sms_inbound','sms_outbound_prepare','voice_transcript_inbound',
    'personal_sms_send','personal_voice_send','personal_model_inference','device_wake'));

ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "PersonalAssistantOperation_kind_check";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "PersonalAssistantOperation_kind_check"
  CHECK (kind IN ('personal_sms_inbound','google_oauth','calendar_write','sms_outbound','voice_outbound','sms_pairing',
    'personal_model_candidate_v1','calendar_confirmation_summary','device_calendar_write_v1'));

ALTER TABLE "PersonalAssistantOperation" DROP CONSTRAINT "personal_model_child_shape_ck";
ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "personal_model_child_shape_ck" CHECK (
  (kind='personal_model_candidate_v1' AND "sourcePersonalOperationId" IS NOT NULL AND "modelGatewayOperationId" IS NOT NULL
    AND "budgetId" IS NOT NULL AND "reservedCadMicros" IS NOT NULL
    AND status IN ('received','processing','completed','refused','uncertain'))
  OR (kind='device_calendar_write_v1' AND "sourcePersonalOperationId" IS NOT NULL AND "modelGatewayOperationId" IS NULL
    AND "budgetId" IS NULL AND "reservedCadMicros" IS NULL)
  OR (kind NOT IN ('personal_model_candidate_v1','device_calendar_write_v1')
    AND "sourcePersonalOperationId" IS NULL AND "modelGatewayOperationId" IS NULL)
);

ALTER TABLE "PersonalAssistantOperation" ADD CONSTRAINT "device_calendar_directive_shape_ck" CHECK (
  kind<>'device_calendar_write_v1' OR (
    "externalTransportPerformed"=false AND "budgetId" IS NULL AND "reservedCadMicros" IS NULL
    AND (
      (status='pending' AND attempts=0 AND "leaseUntil" IS NULL AND result IS NULL)
      OR (status='processing' AND attempts=1 AND "leaseUntil" IS NOT NULL AND result IS NOT NULL)
      OR (status IN ('completed','uncertain') AND attempts=1 AND "leaseUntil" IS NULL AND result IS NOT NULL)
      OR (status='refused' AND attempts=0 AND "leaseUntil" IS NULL AND result IS NOT NULL)
    )
  )
);

