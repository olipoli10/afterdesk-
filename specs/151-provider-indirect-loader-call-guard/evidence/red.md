# R37AC RED

`npx vitest run test/construction-operating-assistant-r37ac-provider-indirect-loader-call.test.ts`

- 1 test file failed and all 3 tests failed against committed R37AB `f8ef223abfc26d9b79e1aeb27280cbb34e8f2ad7`.
- Direct `require.call`, aliased-loader `apply`, and createRequire-loader `call` returned no violation.
- No provider or transport was invoked.
