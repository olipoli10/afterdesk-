# Quickstart: Assistant Channel Routing Parity

```powershell
npx vitest run test/construction-operating-assistant-r36d-channel-routing-parity.test.ts test/construction-operating-assistant-r36c-unified-routing.test.ts test/construction-operating-assistant-r4-sms-voice.test.ts
npm run test:integration -- test/integration/construction-operating-assistant-r36d-channel-routing-parity.itest.ts test/integration/construction-operating-assistant-r4-sms-voice.itest.ts
npm run typecheck
npm run lint
git diff --check
```

Required label: `CODE + TEST + SYNTHETIC`; provider/customer/production readiness and Verified-E2E remain unchanged.
