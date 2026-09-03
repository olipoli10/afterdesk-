# R37AB RED

Command:

`npx vitest run test/construction-operating-assistant-r37ab-provider-transparent-expression.test.ts`

Observed against committed R37AA implementation `a5d059b3a34b545d0f2b1462bb308737fc858d6f`:

- 1 test file failed.
- 4 of 4 tests failed.
- `as`, `satisfies` and non-null wrapped factory/loader calls returned no violation instead of `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- The failures are concrete static boundary bypasses; no provider or transport was invoked.
