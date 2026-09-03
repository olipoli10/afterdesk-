# R37AW RED evidence

`npx vitest run test/construction-operating-assistant-r37aw-provider-transparent-require-destructuring.test.ts`

- 2 required parenthesized/asserted destructuring tests failed.
- 1 unrelated-module negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that transparent wrappers around a CommonJS node:module destructuring initializer currently evade createRequire factory tracking.
