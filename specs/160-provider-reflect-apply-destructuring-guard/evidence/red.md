# R37AL RED

Command: `npx vitest run test/construction-operating-assistant-r37al-provider-reflect-apply-destructuring.test.ts`

Result against committed R37AK: 2 required cases failed and 1 unrelated-object control passed. Destructuring the `apply` property from global `Reflect` lost the tracked reflective loader capability, proving the bounded gap without any provider or external transport.
