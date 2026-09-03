# R37AZ RED evidence

`npx vitest run test/construction-operating-assistant-r37az-provider-aliased-require-namespace.test.ts`

- 2 required aliased-require namespace tests failed.
- 1 unrelated-module negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that a tracked require alias can currently hide node:module namespace capability in declarations and assignments.
