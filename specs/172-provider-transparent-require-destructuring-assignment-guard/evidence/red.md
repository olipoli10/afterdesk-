# R37AX RED evidence

`npx vitest run test/construction-operating-assistant-r37ax-provider-transparent-require-destructuring-assignment.test.ts`

- 2 required parenthesized/asserted assignment tests failed.
- 1 unrelated-module negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that transparent wrappers around a CommonJS node:module destructuring-assignment source currently evade createRequire factory tracking.
