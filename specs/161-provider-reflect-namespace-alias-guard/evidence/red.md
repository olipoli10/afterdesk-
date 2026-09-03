# R37AM RED

Command: `npx vitest run test/construction-operating-assistant-r37am-provider-reflect-namespace-alias.test.ts`

Result against committed R37AL: 2 required cases failed and 1 unrelated-object control passed. Aliasing the global `Reflect` namespace hid both member and destructured reflective loader invocations, proving the bounded gap without any provider or external transport.
