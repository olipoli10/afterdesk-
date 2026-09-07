# Quickstart: founder self live activation

## Local validation

```powershell
npm exec vitest run test/backend-activation-gate.test.ts
npm --prefix apps/mobile test -- founder-activation.test.ts device-access.test.ts store-build.test.ts
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm run validate:provider-boundary
```

Expected local result: code and configuration are ready for external setup; no app is claimed signed, no number is claimed provisioned, no OAuth is claimed connected and no external transport occurs.

## Physical founder activation

1. Create an Expo account and a personal access token.
2. From the repository root, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-founder-android-build-secure.ps1`. The token is requested through a masked prompt and removed from the process after the build.
3. The launcher verifies the existing `endveras-team/endvera` EAS project binding and produces a signed internal Android APK without submitting it to a store.
4. The signed APK is now observed installed and launchable on Olivier's Samsung. Contacts/calendar permission states remain to be verified after the approved HTTPS backend is connected.
5. Provision a compliant dedicated number with SMS and voice.
6. Publish an approved HTTPS webhook origin and install server-only provider credentials.
7. Run one bounded, recorded founder SMS and call loop.

This section cannot be marked complete from local code alone.

## Local mobile login proof

Run the bounded validation from the repository root:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\specs\205-founder-self-live-activation\scripts\validate-founder-mobile-login-local.ps1`

The validator creates a new disposable PostgreSQL database, generates a
synthetic verified `CLIENT` credential only in process memory, starts the
local server, exercises the same Better Auth email/password and mobile
bootstrap routes used by the app, and then stops the server and removes the
database. It never prints or writes the generated password, cookie, token, or
session body. The current observed result is recorded in
`evidence/founder-mobile-login-local-smoke.json`.

This proves the local authentication/backend path only. It does not make the
installed APK reachable from the Samsung and does not prove a device login.

## Observed physical install

Olivier supplied one physical-device photo showing the ENDVERA sign-in surface
running on his Samsung. The photo fingerprint and narrow claim boundary are in
`evidence/founder-samsung-install-observation.json`. The same photo visibly
confirms that this APK was built without an activated secure backend address;
authentication is therefore still blocked and requires a newly configured APK.
