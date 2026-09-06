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

1. Authorize and bind an Expo project.
2. Produce a signed physical iOS or Android internal build.
3. Install on Olivier's phone and verify contacts/calendar permission states.
4. Provision a compliant dedicated number with SMS and voice.
5. Publish an approved HTTPS webhook origin and install server-only provider credentials.
6. Run one bounded, recorded founder SMS and call loop.

This section cannot be marked complete from local code alone.
