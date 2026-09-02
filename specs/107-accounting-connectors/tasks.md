# Tasks: R27 Accounting Connectors

## Phase 1 — Contract and RED

- [ ] T001 [P] [US1] Freeze provider-neutral account, observation and capability contracts.
- [ ] T002 [P] [US3] Freeze exact invoice/reconciliation draft and role projection contracts.
- [ ] T003 [US2] Add RED for replay drift, ambiguity, partial/overpayment, stale source and zero write.
- [ ] T004 [US1] Add RED for secrets, revocation, tenant isolation and field financial leakage.

## Phase 2 — PostgreSQL accounting memory

- [ ] T005 [US1] Add forward-only account/observation/match/draft/decision migration.
- [ ] T006 [P] [US1] Implement deterministic provider-neutral policy and hashes.
- [ ] T007 [US1] Implement local account preparation/revocation and trusted admission.
- [ ] T008 [US2] Implement exact R21 receivable matching with ambiguity and conflict preservation.
- [ ] T009 [US2] Prove replay, concurrency, restart and cross-workspace isolation.

## Phase 3 — Exact prepared operations

- [ ] T010 [US3] Implement exact R21 invoice draft preparation.
- [ ] T011 [US3] Implement exact payment reconciliation draft preparation.
- [ ] T012 [US3] Implement exact approval, stale/altered refusal and permanent zero external effect.
- [ ] T013 [US4] Implement owner/admin cockpit and recursively minimized field projection.

## Phase 4 — Shared iOS/Android accounting cockpit

- [ ] T014 [US4] Add protected accounting API.
- [ ] T015 [P] [US4] Add native schemas, API commands and restart-safe outbox kinds.
- [ ] T016 [US4] Add one shared Accounting surface and navigation entry.
- [ ] T017 [US4] Add mobile parsing, restart, role and zero-write tests.

## Phase 5 — Validation and continuation

- [ ] T018 [US1] Run R27 and relevant R10/R11/R16/R17/R21 gates.
- [ ] T019 [US4] Run fresh migration, full mobile/export, lint, typecheck, build and audits.
- [ ] T020 [US4] Record R27 closeout, commit locally and advance automatically to R28.
