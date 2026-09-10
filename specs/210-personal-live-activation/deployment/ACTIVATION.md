# Personal activation: operational handoff, not a live claim

## Scope and remaining authority

The implementation supports an owner's verified phone, signed incoming SMS,
bounded replies, separately approved SMS or short synthesized calls to that same
phone, and Google primary-calendar reads and approved event inserts. It does not
yet authorize employees, customer numbers, bulk sends, inbound voice conversation,
or arbitrary device control. Fresh authorization.json now permits OpenRouter within
its separate 20 CAD envelope, subject to current credentials and budget gates;
that integration is not activated. Existing local intent routing
is not evidence of an OpenRouter conversation. Do not reuse historical R37 budgets.

Current authority is authorization.json: 100 CAD TOTAL through 2026-10-10T01:18:26Z,
no automatic renewal, owner-recipient only. The budget is accepted; account access
and genuine owner consent are still required. Historical local validation did not
perform purchases, deployment, SMS/calls, OAuth consent or external AI requests.
Current external setup is recorded separately in backend-provisioning.json.

## Existing projects verified read-only

- Product checkout: C:/dev/endvera-astra-r03, codex/endvera-astra-r03.
- Vercel team: team_txoYNQAo21jmENCfI2EG4pdP (afterdesk).
- Dedicated candidate backend: endvera-core-sandbox,
  prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75; Next.js, Node 24.x.
- Do not replace the separate `afterdesk` public-site project or its Git linkage.
- Expo project: a7b2c087-f8e1-48e4-8798-f6fabefb69fe (endveras-team/endvera).
- Android internal APK profile: founder-device. Local Hermes export is NOT an APK,
  installation, store publication or a physical Samsung observation.

## Activation order

1. Verify current spending authority and provision/reconcile dedicated backend
   PostgreSQL and HTTPS origin. Apply existing migrations without resetting data.
   Back up any non-disposable database before migrations; inspect schema drift.
2. Store server-only credentials in that backend's secret configuration. Never
   put Twilio, Google client secrets or connector-encryption keys in Expo variables.
   Never print secret values, copy them into chat, logs or Git. Configure
   BETTER_AUTH_URL/SECRET, DATABASE_URL and the existing auth origin/cookie rules.
3. Register Google web OAuth callback exactly at
   /api/endvera/v1/personal/google/callback on the chosen HTTPS origin; configure
   GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI and a base64 32-byte
   ENDVERA_CONNECTOR_ENCRYPTION_KEY. Restrict the testing audience to the owner.
4. Reconcile a Twilio account/number with SMS and voice capabilities, correct
   geography and restrictions. Set TWILIO_ACCOUNT_SID/AUTH_TOKEN (signature),
   TWILIO_API_KEY_SID/SECRET (REST), and TWILIO_PHONE_NUMBER. Set incoming POST to
   /api/webhooks/twilio/sms; ENDVERA_TWILIO_SMS_WEBHOOK_URL must match it exactly.
   Set ENDVERA_TWILIO_STATUS_WEBHOOK_URL to /api/webhooks/twilio/status and
   ENDVERA_PROVIDER_WEBHOOK_ORIGIN to the same HTTPS origin.
5. Record a fresh tariff review, exchange-rate and carrier-fee allowance using
   ENDVERA_TWILIO_RATE_REVIEW_REF/REVIEWED_AT, ENDVERA_SMS_SEGMENT_RESERVE_CAD and
   ENDVERA_VOICE_MINUTE_RESERVE_CAD. Review expires after 24 hours. Set an approved
   ENDVERA_PERSONAL_BUDGET_CAD, ENDVERA_PERSONAL_PILOT_EXPIRES_AT and existing
   external authority/owner references. The local reservation ledger bounds only
   authorized outgoing reservations: it is NOT a hard ceiling on Twilio's entire
   invoice. Inbound traffic, number rental, taxes, fees and FX need a separate
   reserve and provider-side operational review. Usage alerts are not hard stops.
6. Keep all execution switches off until configuration and ownership are verified.
   Then enable only the selected existing global SMS/voice/Google capabilities
   and ENDVERA_PERSONAL_SMS_INGRESS_ENABLED, SMS_WORKER_ENABLED, OUTBOUND_ENABLED
   (each prefixed ENDVERA_PERSONAL_, value true). Automatic self-replies additionally
   require ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED=true and the owner's explicit
   SMS consent recorded when pairing. Voice consent is separate.
7. Install a strong server-only CRON_SECRET (at least 32 characters). The optional
   vercel-cron.example.json is a template, not deployed configuration. Merge only
   its job into the selected project's configuration, preserving other jobs.
   GET /api/endvera/v1/personal/worker/tick requires Bearer CRON_SECRET and processes
   one item. Incoming SMS also schedules one bounded after-response pass. An
   always-on server can instead run scripts/run-personal-sms-worker.ts with the
   explicit scripts/personal-worker.tsconfig.json; do not run two unowned daemons.
8. Build an internal Android APK with the verified HTTPS backend origin in
   EXPO_PUBLIC_ENDVERA_API_URL. This public URL is not a secret. First check HTTPS auth from the
   actual app; never distribute another login-only/unconfigured APK as ready.
9. Owner connects their phone through the app's one-use SMS pairing message and
   consents to Google through the browser. Do not enter a phone string directly
   into the database as verified. Do not simulate the owner's consent.
10. Only within approved authority, observe real receive -> answer -> Google read,
    exact calendar approval, self-SMS and optional self-call. Provider acceptance
    is not delivery; a completed call is not proof the message was understood.
    Record actual billing, provider receipts and Samsung results, then disable
    the pilot or keep only explicitly authorized standing operation enabled.

## Recovery and stop controls

Disable global external transport or the relevant personal switch to stop new
dispatches. Expiry and exhausted reservations also refuse new sends. Unknown
outcomes keep their reservation and are never automatically replayed. Review
provider receipts before retrying through a NEW, explicitly approved operation.
Never relabel a failed/uncertain outcome as a successful observation.

App disconnect revokes local phone/grants or clears encrypted Google credentials.
Google's account-side authorization must also be removed in Google settings when
desired; remote grant revocation is not implemented. In-flight transmissions cannot
be recalled. Signed delivery receipts remain admissible after pilot expiry.

Run `node scripts/personal-live-preflight.mjs` for presence-only diagnostics.
It does not validate credentials, activate capabilities, or prove live readiness.

The diagnostic now lists each route's exact switch requirements separately. Its
`REQUESTED_UNVERIFIED` label is not an authorization or a successful connection.
OpenRouter requires the trusted server-side rate/budget configuration, the owner's
explicit model consent and a separately provisioned encrypted database credential;
this presence-only command reads none of those database secrets.

The local SMS calendar-confirmation route additionally requires all three switches
`ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED`,
`ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED` and
`ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED` (exact literal `true`), alongside
the existing SMS worker, automatic self-reply, outbound and Google gates. Apply its
unchanged schema migration before any activation. It sends one exact summary,
waits for the owner's matching phrase, then uses the existing one-use Google
claim. The model cannot approve the operation, and an unknown result cannot be
automatically retried. No switch is enabled by this document or the diagnostic.

Optional `ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED` and
`ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED` are bookkeeping only: expired/unknown
claims retain their evidence and budget holds. They do not authorize transport,
grant consent or retry an effect. Native contention proof and real-owner/provider
observations remain separate requirements, not consequences of flag presence.

Official references checked during implementation:
- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/docs/voice/api/call-resource
- https://www.twilio.com/docs/usage/api/usage-trigger
- https://developers.google.com/identity/protocols/oauth2/web-server

No rubric changes: roadmap, build readiness, C2, real-test readiness and observed
Verified-E2E remain separate; this document is not launch evidence.
