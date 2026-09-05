# RED evidence

**Observed**: 2026-09-05

`npx vitest run test/construction-operating-assistant-r37-corrected-retest.test.ts`

- 2 tests executed.
- 2 tests failed before implementation.
- The first failure proved the old request still emitted `max_tokens` and `temperature` instead of `max_completion_tokens`.
- The second failure proved the isolated corrected runner did not yet exist.

Evidence label: `TEST`.
