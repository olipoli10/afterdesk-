# Quickstart — local validation only

```powershell
npm exec vitest run test/construction-operating-assistant-r38a.test.ts
npm run typecheck
npm run validate:provider-boundary
npm --prefix apps/mobile test -- text-assist-foundation.test.ts
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
$env:EXPO_PUBLIC_ENDVERA_API_URL = "https://local-build.invalid"
npm --prefix apps/mobile run export:local
Remove-Item Env:EXPO_PUBLIC_ENDVERA_API_URL
```

Then open the local Expo candidate and navigate to `Plus → Configurer TextAssist`.

Expected result: the app describes the dedicated ENDVERA number as not provisioned, the model gateway as disabled, and every permission as optional/progressive. No external request occurs.
