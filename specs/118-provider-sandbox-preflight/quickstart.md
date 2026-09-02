# Quickstart: Local R36B Validation

No credential, network or provider is required or permitted.

```powershell
npx vitest run test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts
npx vitest run test/construction-operating-assistant-r36a-ai-routing-brain.test.ts
npx vitest run test/model-gateway*.test.ts
npm run typecheck
npm run lint
git diff --check
```

Expected: strict local contracts pass; calls, credential reads and external effects remain zero; adjudication is `NO_PROVIDER_SELECTION`; R37 stays `PREPARED_NOT_AUTHORIZED`.
