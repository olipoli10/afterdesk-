# R37AT RED evidence

`npx vitest run test/construction-operating-assistant-r37at-provider-module-namespace-destructuring-declaration.test.ts`

- 2 required direct/computed namespace binding tests failed.
- 1 negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that a `createRequire` binding initialized from a tracked module namespace currently evades the factory set.
