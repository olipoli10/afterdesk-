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
4. Install on Olivier's phone and verify contacts/calendar permission states.
5. Provision a compliant dedicated number with SMS and voice.
6. Publish an approved HTTPS webhook origin and install server-only provider credentials.
7. Run one bounded, recorded founder SMS and call loop.

This section cannot be marked complete from local code alone.
