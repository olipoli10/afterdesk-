# Tasks: R27 Accounting Connectors

## Phase 1 — Contract and RED

- [X] T001 [P] [US1] Freeze provider-neutral account, observation and capability contracts.
- [X] T002 [P] [US3] Freeze exact invoice/reconciliation draft and role projection contracts.
- [X] T003 [US2] Add RED for replay drift, ambiguity, partial/overpayment, stale source and zero write.
- [X] T004 [US1] Add RED for secrets, revocation, tenant isolation and field financial leakage.

## Phase 2 — PostgreSQL accounting memory

- [X] T005 [US1] Add forward-only account/observation/match/draft/decision migration.
- [X] T006 [P] [US1] Implement deterministic provider-neutral policy and hashes.
- [X] T007 [US1] Implement local account preparation/revocation and trusted admission.
- [X] T008 [US2] Implement exact R21 receivable matching with ambiguity and conflict preservation.
- [X] T009 [US2] Prove replay, concurrency, restart and cross-workspace isolation.

## Phase 3 — Exact prepared operations

- [X] T010 [US3] Implement exact R21 invoice draft preparation.
- [X] T011 [US3] Implement exact payment reconciliation draft preparation.
- [X] T012 [US3] Implement exact approval, stale/altered refusal and permanent zero external effect.
- [X] T013 [US4] Implement owner/admin cockpit and recursively minimized field projection.

## Phase 4 — Shared iOS/Android accounting cockpit

- [X] T014 [US4] Add protected accounting API.
- [X] T015 [P] [US4] Add native schemas, API commands and restart-safe outbox kinds.
- [X] T016 [US4] Add one shared Accounting surface and navigation entry.
- [X] T017 [US4] Add mobile parsing, restart, role and zero-write tests.

## Phase 5 — Validation and continuation

- [X] T018 [US1] Run R27 and relevant R10/R11/R16/R17/R21 gates.
- [X] T019 [US4] Run fresh migration, full mobile/export, lint, typecheck, build and audits.
- [X] T020 [US4] Record R27 closeout, commit locally and advance automatically to R28.
