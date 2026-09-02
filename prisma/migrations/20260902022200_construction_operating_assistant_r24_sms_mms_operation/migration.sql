-- R24 adds one local-only prepared operation kind while preserving every
-- historical calendar and R4 communication value.

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
    'sms_dispatch_prepare',
    'sms_mms_dispatch_prepare_r24'
  ));
