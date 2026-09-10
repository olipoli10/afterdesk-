# Personal pilot deployment — 2026-09-10

Authority: ENDVERA-PERSONAL-20260910-100CAD, total 100 CAD / 30 days.
Existing Vercel Pro and Neon Free accounts; no new subscription or auto-renewal.
Expo internal build uses the existing account; do not accept an upgrade if refused.

## Database and configuration

The 68 remote migrations match local content after accounting for CRLF/LF.
Two pending personal-service migrations were applied successfully to new isolated
Neon branch br-nameless-moon-ax8nmuwj, copied from main. A separate SQL check
confirmed 70 finished migrations and the new operation, budget and credential
tables. Original main and its 68 migrations remain unmodified.

The dedicated backend's new Production configuration points to that pilot branch,
not the public Afterdesk project's database. Existing login secret is preserved.
New CRON_SECRET and connector encryption key were generated directly into server
configuration; no secret file or value was printed or committed.

Transport and personal ingress/worker/outbound/automatic replies remain OFF.
Outgoing reservations have a 15 CAD ceiling within the 30 CAD Twilio envelope;
the remainder covers number rental, inbound traffic, fees and billing headroom.
No Twilio credential, owner phone binding or Google consent is claimed.

## Release gate

- Existing local root tests: 2785 pass / 3 historical skips; mobile: 199 pass.
- Existing disposable PostgreSQL checks: 20 pass, fake provider transport only.
- Actual isolated Neon migration deploy and status: pass; main unchanged.
- No CI or independent human review is claimed by those local checks.
- Use deployment/vercel.personal.json: guarded build, no inherited maintenance
  cron and no personal worker schedule before provider configuration.
- Actual deployment dpl_9bNdAWKT2FKA2JRRSpwcf7kszh7N is READY at source
  06e26ce7a3f4f373548405fb451bd4b45861b644. CLI auto-assigned the existing
  dedicated backend alias despite --skip-domain. Do not rely on that flag as an
  alias isolation guarantee. Previous deployment remains available for rollback.
- Require login page HTTP 200, auth session endpoint healthy, unauthenticated
  protected personal endpoints refused, provider webhooks disabled/refused.
- Android 0.2.0 / versionCode 4 points to the existing HTTPS backend alias.
- Do not advertise the APK as a live SMS/Google/voice service before real setup.

## Rollback and end-of-pilot

Prior live deployment: dpl_F6ZK274V2aoyyxuRFotNQcMimSLi. Leave it and original
main available. On auth errors, unexpected provider activation or schema errors,
do not promote the candidate; if already promoted, roll back to that deployment.
Rolling back deployment traffic does not revert project-level future env settings.
Do not delete the pilot branch or overwrite its data as a rollback shortcut.
At expiry disable new personal operations; preserve records. Review provider
number cancellation and any recurring costs before the authorized period ends.

Technical deploy success is not Samsung login, delivery, Google consent, founder
acceptance, customer readiness or Verified-E2E. All rubrics remain unchanged.

## Corrected Android candidate

First build 78ef1211-b710-4f2e-8e21-c429f1c9247e was canceled before distribution
after metadata drift was found. Failed checks are retained. Current mobile
identity is 0.2.0 / Android 4 throughout the active projection and package.
Historical manifests remain historical. Latest root and mobile checks succeeded
(root-1789005406364, mobile-1789005457974); standalone mobile tsc exited 0.
Vercel link generated a local OIDC env file: it was preserved inside ignored
.vercel/local-env-from-link-20260910.preserved, never printed or committed.
