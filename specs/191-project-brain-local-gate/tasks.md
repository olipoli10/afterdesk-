# Tasks: Project Brain Local Gate

**Input**: Design documents from `/specs/191-project-brain-local-gate/`

**Prerequisites**: completed R36V–R36Y implementations/tests plus plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Phase 1: Gate Contract and RED

- [ ] T001 Define strict isolated-fragment/report/assertion/mutation allowlists and validation helpers in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T002 [P] Add failing integrated-chain/missing-assertion/skipped-test RED in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T003 [P] Add failing one-surface/no-ID mobile RED in `apps/mobile/test/project-brain-local-gate.test.ts`
- [ ] T004 Add the fail-closed validator skeleton in `specs/191-project-brain-local-gate/scripts/validate-r36z-project-brain-local-gate.ps1`
- [ ] T005 Record reproducible RED in `specs/191-project-brain-local-gate/evidence/red.md`

## Phase 2: User Story 1 — Complete local chain (Priority: P1)

- [ ] T006 [US1] Build synthetic two-tenant fixtures containing the exact incompatible Friday/Monday `OWNER_TEXT` values and field ranges, then run R36V multi-source/brief/exact-confirmation through authenticated product boundaries in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T007 [US1] Continue through R36W exact candidates and retain candidate/provenance assertions in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T008 [US1] Explicitly declare (never auto-detect) the fixture contradiction, continue through R36X disposition/resolution/exact sealing and prove both exact values/provenances remain in history in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T009 [US1] Continue through R36Y cited recall and visible `PREPARED_UNSENT` action in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T010 [US1] Emit bounded canonical effect counts/hashes/assertions for the full chain only as the integration test's unique run-owned fragment or JSON stdout; do not write `evidence/local-gate-report.json`

## Phase 3: User Story 2 — Recovery and adversarial boundaries (Priority: P1)

- [ ] T011 [US2] Add fresh-process/server/database-client restart and exact projection comparison in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T012 [US2] Add exact/concurrent replay, body drift, stale version/fingerprint/hash and effect-count tests in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T013 [US2] Add FIELD_WORKER/inactive/second-tenant/project non-enumeration tests in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`
- [ ] T014 [US2] Compose all fresh serialized R36V–R36Y raw-SQL/immutability guard suites in `specs/191-project-brain-local-gate/scripts/validate-r36z-project-brain-local-gate.ps1`
- [ ] T015 [US2] Add fail-fast provider/credential/network/semantic-binary/transport/write/approval/delivery/spend sentinels and exact counters in `test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts`

## Phase 4: User Story 3 — Mobile one-surface usability (Priority: P2)

- [ ] T016 [US3] Drive project intake, review, assistant recall and prepared-action inspection through visible controls in `apps/mobile/test/project-brain-local-gate.test.ts`
- [ ] T017 [US3] Assert no technical-ID input/copy, complete provenance/limitations and visible contradiction/resolution controls in `apps/mobile/test/project-brain-local-gate.test.ts`
- [ ] T018 [US3] Assert visible recipient/channel/body/citations/`PREPARED_UNSENT`/separate approval and restart recovery in `apps/mobile/test/project-brain-local-gate.test.ts`
- [ ] T019 [US3] Emit the uniquely named mobile fragment with `TEST`/`SYNTHETIC` and founder/customer observation false; do not write `evidence/local-gate-report.json`

## Phase 5: Mutation Matrix and Validator

- [ ] T020 Implement every required mutation and byte-exact restoration check from `specs/191-project-brain-local-gate/quickstart.md`
- [ ] T021 Record non-vacuous setup, guard, failure, SHA-256 restoration and targeted rerun in `specs/191-project-brain-local-gate/evidence/mutations.md`
- [ ] T022 Complete exact fragment/assertion/mutation allowlists, duplicate/extra/missing/cross-run rejection, aggregation, strict report schema/status validation and nonzero failure behavior in `specs/191-project-brain-local-gate/scripts/validate-r36z-project-brain-local-gate.ps1`
- [ ] T023 Add exact disposable DB/process/temp ownership checks, bounded cleanup and post-cleanup probes in `specs/191-project-brain-local-gate/scripts/validate-r36z-project-brain-local-gate.ps1`

## Phase 6: Full Gates and Closeout

- [ ] T024 Run targeted R36V–R36Y plus integrated/mobile tests through the unique validator
- [ ] T025 Run fresh serialized PostgreSQL integration suites and verify no mandatory skipped/pending tests
- [ ] T026 Run provider boundary, root/mobile lint/typecheck/full serialized suites and Next.js Webpack build
- [ ] T027 Verify owned cleanup, write a same-directory temporary aggregate and atomically rename/finalize/validate `evidence/local-gate-report.json`, then generate/check `evidence/closeout.md`
- [ ] T028 Run `git diff --check`, record exact evidence labels and create coherent local commits without push only after the gate passes
- [ ] T029 Update release/queue/Brain state only under separate authority after a validated gate; never from an incomplete report

## Dependencies & Execution Order

- Contract/RED blocks all implementation.
- US1 positive chain precedes US2 adversarial/restart comparisons.
- US1 and US2 establish data for US3 mobile evidence.
- Mutation/validator completion precedes full gates and closeout.

## Parallel Opportunities

- T002 and T003 target independent integration/mobile tests.
- T011–T013 may be developed independently after T006–T010.
- T016–T018 are mobile-only while T014–T015 target server/PostgreSQL boundaries.

## Implementation Strategy

Prove the complete positive chain first, then attempt to break it through restart/replay/tenancy/role/raw-SQL cases, then validate the visible mobile path. The unique validator is terminal authority for this local synthetic gate only.
