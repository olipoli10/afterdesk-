# RED Evidence — 2026-09-05

Command:

`npm run test:run -- test/construction-operating-assistant-r37bc-controller-contract-alignment.test.ts`

Result: expected failure before implementation.

- `INVOICE_READINESS` exposed only `CLARIFY`, so `ANSWER_FROM_STATE` was refused.
- All three corrected requests omitted `allowedCapabilities`.
- All three corrected requests omitted `expectedLimitations` (first assertion stopped at the capability field).
- The initial immutable-report assertion used the older feature-192 hash against the feature-194 file. Direct byte hashing established both distinct sealed hashes; the guard was corrected before implementation to protect each file explicitly.
- 5 tests failed; no provider call, credential or spend occurred.

