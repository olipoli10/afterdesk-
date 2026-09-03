# R37AK RED

Command: `npx vitest run test/construction-operating-assistant-r37ak-provider-reflect-apply-transparent-assignment.test.ts`

Result against committed R37AJ: 2 required cases failed and 1 unrelated-assignment control passed. Parenthesized and TypeScript-wrapped right-hand identifiers lost the tracked `Reflect.apply` capability during assignment propagation, proving the bounded gap without any provider or external transport.
