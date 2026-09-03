# R37AS RED evidence

`npx vitest run test/construction-operating-assistant-r37as-provider-module-namespace-destructuring-assignment.test.ts`

- 2 required direct/computed namespace destructuring-assignment tests failed.
- 1 negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that a `createRequire` factory assigned from a tracked module namespace currently evades the tracked factory set.
