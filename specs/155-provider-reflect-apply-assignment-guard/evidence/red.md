# R37AG RED

Command: `npx vitest run test/construction-operating-assistant-r37ag-provider-reflect-apply-assignment.test.ts`

Result against committed R37AF: 2 required cases failed and 1 unrelated-assignment control passed. Assignments from `Reflect.apply` and `Reflect["apply"]` returned no provider-boundary finding for computed module targets, proving the bounded gap without any provider or external transport.
