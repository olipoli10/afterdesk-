-- ENDVERA Construction Operating Assistant R23 — add Microsoft Calendar to
-- the existing provider-neutral connector authority tables. This migration is
-- forward-only and widens one closed provider set; it stores no credential,
-- OAuth token, sync token, external event identifier or provider result.

ALTER TABLE "ConstructionConnectorAccount"
  DROP CONSTRAINT "ConstructionConnectorAccount_provider_check";

ALTER TABLE "ConstructionConnectorAccount"
  ADD CONSTRAINT "ConstructionConnectorAccount_provider_check"
  CHECK ("provider" IN (
    'google_calendar',
    'microsoft_calendar',
    'endvera_sms',
    'endvera_voice'
  ));
