# Quickstart: R8 Mobile Foundation

## Prerequisites

- Node.js compatible with Expo SDK 57
- the existing ENDVERA local PostgreSQL environment and Next.js server
- an Android emulator/device or an iOS simulator/device on a supported host
- synthetic local credentials only

## Configure

Set `EXPO_PUBLIC_ENDVERA_API_URL` to the local server address reachable by the emulator/device. Use `http://127.0.0.1:3000` for an iOS simulator, `http://10.0.2.2:3000` for the standard Android emulator, or an explicit LAN address for a physical development device.

No provider credential, OAuth secret, customer data, EAS project, or production URL is required.

## Validate

From `apps/mobile`:

```text
npm run typecheck
npm run test
npm run lint
npm run doctor
$env:EXPO_PUBLIC_ENDVERA_API_URL="https://local.invalid"
npm run export:local
```

From the repository root:

```text
npm run test:run -- test/construction-operating-assistant-r7-shared-api.test.ts test/construction-operating-assistant-r8-mobile-foundation.test.ts
npm run lint
npm run typecheck
```

## Run locally

Start the existing ENDVERA local server, then from `apps/mobile` run `npm start` and choose Android or iOS. Sign in with a synthetic local account, select an authorized workspace, inspect the cockpit, and submit only synthetic commands.

## Expected safety behavior

- no session: sign-in only;
- invalid API URL: configuration error, no request;
- offline: live state unavailable, no stale current claim;
- unsupported API: refusal, no rendering;
- field worker: no receivables or financial/action payloads;
- command timeout: outcome unknown, retry retains the same idempotency material;
- zero SMS, email, call, calendar provider, payment, push, Preview, or Production.

## Local validation result — 2026-09-01

The isolated package passed TypeScript, 8 mobile tests, Expo lint, Expo Doctor 21/21, and local iOS/Android/Web export. The server passed root lint/typecheck, 8 targeted R7/R8 tests, the previously recorded 1,855-test regression run, and the R8 PostgreSQL integration test against 45 forward migrations.
