# Quickstart: R37A Local Validation

R37A runs with no credential, provider or network.

```powershell
npx vitest run test/construction-operating-assistant-r37a-sealed-executor.test.ts
npx vitest run test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts
npx vitest run test/construction-operating-assistant-r36c-unified-routing.test.ts
npm run typecheck
npm run lint
git diff --check
```

Expected: synthetic evidence only; observed/provider execution refuses; no
credential read or external effect occurs.
