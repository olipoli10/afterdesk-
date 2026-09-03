# R37AA RED

Command:

`npx vitest run test/construction-operating-assistant-r37aa-provider-parenthesized-loader-call.test.ts`

Observed against committed R37Z implementation `1fd2f76db2d8a68c4133ee2b327622d7474c5118`:

- 1 test file failed.
- 2 of 2 tests failed.
- Both parenthesized loader calls returned no violation instead of `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- The failure is a concrete static boundary bypass; no provider or transport was invoked.
