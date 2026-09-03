# R37AV RED evidence

`npx vitest run test/construction-operating-assistant-r37av-provider-transparent-require-namespace.test.ts`

- 2 required parenthesized/asserted namespace tests failed.
- 1 unrelated-module negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that transparent wrappers around a CommonJS node:module namespace initializer currently evade the tracked namespace set.
