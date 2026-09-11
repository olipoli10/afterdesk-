# Google Calendar and Google sign-in: separate opt-ins

## Configuration contract

`ENDVERA_GOOGLE_SIGN_IN_ENABLED=ENABLED` is now additionally required for Better
Auth's Google social provider and the server-exported `googleEnabled` UI switch.
Missing, empty, DISABLED, true, differently cased or whitespace-padded values do
not opt in. This variable is server-side only; no NEXT_PUBLIC/EXPO_PUBLIC copy.

The existing requirements remain necessary: GOOGLE_CLIENT_ID/SECRET, exact
ENDVERA_EXTERNAL_TRANSPORT_ENABLED=ENABLED and ENDVERA_GOOGLE_OAUTH_ENABLED=ENABLED,
plus the existing owner and authority references. The new helper proves only
the extra sign-in intent, not a complete capability decision or user consent.

Calendar continues to use its unchanged Google capability, pilot expiry,
encryption, membership and grant checks. Its callback remains:

`https://endvera-core-sandbox-afterdesk.vercel.app/api/endvera/v1/personal/google/callback`

The dedicated personal Web client has only this callback, according to the
controller. Keep the new sign-in flag absent or DISABLED for that client. Do not
add `/api/auth/callback/google` externally to conceal a configuration mismatch.

## Compatibility choice

Credential presence plus Calendar permission cannot distinguish intended
social login from Calendar-only consent. No safe automatic legacy fallback was
identified. Therefore **absence of the new flag no longer enables Google
sign-in**, including deployments that previously intended social login.

Before deploying this change to a deployment that intentionally supports Google
sign-in, its operator must explicitly configure the new flag and verify that
its client is authorized for that separate auth callback. No such environment
change, public-site deployment or callback registration is performed here.

With explicit opt-in, the existing provider credentials, CLIENT role default,
email/password behavior and `requireLocalEmailVerified:true` account-linking
protection are unchanged. The exported name `googleEnabled` is retained so
existing server-rendered buttons follow the same provider decision.

The decision remains an **initialization-time** setting in `src/lib/auth.ts`,
just as before. Changing environment variables after that module has loaded is
not a guaranteed immediate revocation mechanism; restart/redeploy and verify
both provider configuration and rendered UI. Existing sessions are not revoked
by this patch. This is separation of configuration intent, not a new per-request
authorization layer or a separate pair of credential variables.

## Local evidence and limits

- Read installed Next.js authentication and environment-variable guides and the
  engineering debug skill before code changes. No framework API replacement.
- Reproduction 2026-09-10 21:34:51 America/Toronto (2026-09-11 01:34:51Z):
  7 PASS / 4 FAIL. Actual
  `auth.ts` import, with Better Auth configuration captured and DB/plugins/email
  replaced by test doubles, enabled Google for missing/DISABLED/true sign-in
  flag and Calendar-only configuration. Positive existing guards passed.
- Corrected run 21:35:24: **66/66 PASS**, six files: new isolation 22, backend
  activation 7, Calendar client 10, cancellation 5, read authority 10, portal 12.
  Original four failure oracles retained; no legacy assertion was edited.
- Scoped ESLint (helper, auth, new test) PASS; fresh TypeScript `--noEmit
  --incremental false` exit 0 (session 13690); scoped `git diff --check` PASS.
  These checks did not alter the existing user-owned tsconfig changes.
- Tests use synthetic environment values and the real Calendar consent builder.
  They verify provider omission/configuration, not a real Google login, live
  credentials, live browser button, deployment or end-to-end provider flow.
- No network, credential access, DB execution, Android/queue changes, schema,
  migration, commit or deployment. User-owned tsconfig/drafts left untouched.

Source: `src/lib/auth-google.ts`, narrow use in `src/lib/auth.ts`; configuration
example `.env.example`; dedicated tests `test/google-sign-in-isolation.test.ts`.
