# R37BA RED evidence

`npx vitest run test/construction-operating-assistant-r37ba-provider-transparent-loader-alias.test.ts`

- 2 required wrapped loader-alias tests failed.
- 1 unrelated-identifier negative-control test passed.
- Missing code: `R37O_UNRESOLVED_DYNAMIC_MODULE`.

This proves that transparent wrappers currently break require loader capability propagation in declarations and assignments.
