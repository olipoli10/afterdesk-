# R37AU RED evidence

`npx vitest run test/construction-operating-assistant-r37au-provider-import-equals-namespace.test.ts`

- 2 required direct/computed import-equals namespace tests failed.
- 1 unrelated-module negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that a TypeScript import-equals binding for `node:module` or `module` currently evades the tracked module namespace set.
