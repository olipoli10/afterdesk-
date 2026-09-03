# R37AF RED

Command: `npx vitest run test/construction-operating-assistant-r37af-provider-reflect-apply-alias.test.ts`

Result against committed R37AE: 2 required cases failed and 1 unrelated-alias control passed. Extracted `Reflect.apply` and `Reflect["apply"]` aliases returned no provider-boundary finding for computed module targets, proving the bounded gap without any provider or external transport.
