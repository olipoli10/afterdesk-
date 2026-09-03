# R37AQ RED evidence

Command:

`npx vitest run test/construction-operating-assistant-r37aq-provider-computed-create-require-destructuring.test.ts`

Observed before implementation:

- 1 required computed `createRequire` binding test failed.
- 2 regression and negative-control tests passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that a computed string-literal `createRequire` property currently evades the tracked factory set while the ordinary binding remains guarded.
