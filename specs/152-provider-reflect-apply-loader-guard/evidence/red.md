# R37AD RED

- Command: `npx vitest run test/construction-operating-assistant-r37ad-provider-reflect-apply-loader.test.ts`.
- Result: 1 file failed; 3 of 3 tests failed against committed R37AC.
- Direct `Reflect.apply(require, ...)`, an aliased loader, and a createRequire loader all returned no boundary violation.
- This proves the reflective invocation gap without contacting a provider or executing inspected source.
