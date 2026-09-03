# R37AP RED

Command: `npx vitest run test/construction-operating-assistant-r37ap-provider-reflect-computed-destructuring.test.ts`

Result against committed R37AO: 2 required cases failed and 1 different-computed-property control passed. String-literal computed `apply` property names in Reflect destructuring declarations and assignments hid the tracked reflective loader capability, proving the bounded gap without any provider or external transport.
