# Quickstart — R38B local validation

```powershell
npm exec vitest run test/construction-operating-assistant-r38b.test.ts
npm --prefix apps/mobile test -- virtual-secretary-actions.test.ts
npm run typecheck
npm --prefix apps/mobile run typecheck
npm run validate:provider-boundary
```

Then open TextAssist in the local mobile candidate. The screen must describe all seven secretary actions, open the assistant and permission center directly, label Google Calendar/SMS/calls as connectors, and perform no external action.
