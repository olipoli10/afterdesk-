# R37Z RED

Command:

`npx vitest run test/construction-operating-assistant-r37z-provider-parenthesized-loader-factory.test.ts`

Observed against committed R37Y implementation `3a71b49a92ec31adc1110ede0eefe3b61a432411`:

- 1 test file failed.
- 2 of 2 tests failed.
- Both parenthesized factory forms returned no violation instead of `R37O_UNRESOLVED_DYNAMIC_MODULE`.
- This proves a concrete static provider-boundary false negative without invoking any provider or transport.
