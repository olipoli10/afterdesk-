-- ENDVERA Construction Operating Assistant R4 — provider-neutral SMS and
-- voice connector preparation. Forward-only constraint expansion only.
-- No credential, phone number, provider call, external transport, or delivery
-- authority is introduced by this migration.

ALTER TABLE "ConstructionConnectorAccount"
  DROP CONSTRAINT "ConstructionConnectorAccount_provider_check";

ALTER TABLE "ConstructionConnectorAccount"
  ADD CONSTRAINT "ConstructionConnectorAccount_provider_check"
  CHECK ("provider" IN ('google_calendar', 'endvera_sms', 'endvera_voice'));

ALTER TABLE "ConstructionConnectorGrant"
  DROP CONSTRAINT "ConstructionConnectorGrant_capability_check";

ALTER TABLE "ConstructionConnectorGrant"
  ADD CONSTRAINT "ConstructionConnectorGrant_capability_check"
  CHECK ("capability" IN (
    'calendar_read',
    'calendar_write',
    'sms_inbound',
    'sms_outbound_prepare',
    'voice_transcript_inbound'
  ));

ALTER TABLE "ConstructionConnectorOperation"
  DROP CONSTRAINT "ConstructionConnectorOperation_kind_check";

ALTER TABLE "ConstructionConnectorOperation"
  ADD CONSTRAINT "ConstructionConnectorOperation_kind_check"
  CHECK ("kind" IN (
    'authorization_prepare',
    'local_revoke',
    'calendar_insert',
    'calendar_patch',
    'full_sync',
    'incremental_sync',
    'communication_channel_prepare',
    'communication_channel_revoke',
    'sms_dispatch_prepare'
  ));
