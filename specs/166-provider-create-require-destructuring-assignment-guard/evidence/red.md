# R37AR RED evidence

Command:

`npx vitest run test/construction-operating-assistant-r37ar-provider-create-require-destructuring-assignment.test.ts`

Observed before implementation:

- 2 required direct/computed destructuring-assignment tests failed.
- 1 negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that `createRequire` assigned from an exact `node:module` destructuring assignment currently evades the tracked factory set.
