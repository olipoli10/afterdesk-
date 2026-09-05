# Tasks: R37 Controller Contract Alignment

## Phase 1 — Contract and RED

- [x] T001 [US1] Freeze the bounded correction in `spec.md`, `plan.md` and `contracts/controller-contract.md`
- [x] T002 [US1] Add failing capability-alignment coverage in `test/construction-operating-assistant-r37bc-controller-contract-alignment.test.ts`
- [x] T003 [US2] Add failing request-visibility coverage in the same test
- [x] T004 [US3] Capture RED and immutable-report evidence in `evidence/`

## Phase 2 — Minimal correction

- [x] T005 [US1] Add a versioned invoice-readiness alignment in `src/lib/construction-operating-assistant-r37bc/cases.ts` without mutating the frozen R37 case
- [x] T006 [US2] Serialize the visible case contract in `src/lib/construction-operating-assistant-r37bb/contracts.ts`

## Phase 3 — Verification and closeout

- [x] T007 [US1] Pass focused and existing R37 contract/oracle tests
- [x] T008 [US3] Prove sealed report hash and REWORK verdict unchanged
- [x] T009 [US3] Pass typecheck, provider-boundary validation and diff checks
- [x] T010 [US3] Commit locally and checkpoint the canonical Brain without changing readiness rubrics

## Stop criteria

- Any provider dispatch, credential requirement or additional spend.
- Any mutation of the sealed feature-194 evidence.
- Any need to weaken the oracle or expand external authority.
