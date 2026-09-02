# Quickstart: Unified Assistant Routing

## Focused validation

```powershell
npx vitest run test/construction-operating-assistant-r36c-unified-routing.test.ts
npm --prefix apps/mobile test -- --run mobile-assistant-routing.test.ts
```

Expected: internal, candidate, restricted, mixed and channel-parity scenarios pass with zero provider/model leakage.

## PostgreSQL validation

```powershell
npm run test:integration -- test/integration/construction-operating-assistant-r36c-unified-routing.itest.ts
```

Expected: internal commands preserve canonical effects; deferred exchanges survive restart-style rereads; exact replay creates no duplicate; mismatched replay and unauthorized actors are refused.

## Regression validation

```powershell
npx vitest run test/construction-operating-assistant-r36a-ai-routing-brain.test.ts test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts
npm --prefix apps/mobile test -- --run mobile-assistant.test.ts mobile-assistant-routing.test.ts
npm run typecheck
npm run lint
git diff --check
```

## Required evidence label

The result is `CODE + TEST + SYNTHETIC`. Provider/customer/production readiness and Verified-E2E remain unchanged.
