# Tasks: Controlled Provider Orchestration R37C

## Phase 1 — Durable run contract

- [x] T001 [US1] Add strict coordinator contract tests in `test/construction-operating-assistant-r37c-controlled-run.test.ts`.
- [x] T002 [US1] Add `ControlledProviderRun` and a forward-only migration in `prisma/schema.prisma` and `prisma/migrations/*_construction_assistant_r37c_controlled_run/`.
- [x] T003 [US1] Add strict inputs and projections in `src/lib/construction-operating-assistant-r37c/contracts.ts`.

## Phase 2 — Controlled lifecycle

- [x] T004 [US1] Add disposable PostgreSQL success and exact replay tests in `test/integration/construction-operating-assistant-r37c-controlled-run.itest.ts`.
- [x] T005 [US1] Implement reserve-run-store-settle in `src/server/construction-operating-assistant-r37c/coordinator.ts`.
- [x] T006 [US2] Add failure release and restart/reclaim tests in `test/integration/construction-operating-assistant-r37c-controlled-run.itest.ts`.
- [x] T007 [US2] Implement bounded failure and expired synthetic lease recovery in `src/server/construction-operating-assistant-r37c/coordinator.ts`.

## Phase 3 — Concurrency and closure

- [x] T008 [US3] Add concurrent duplicate and kill-switch tests in `test/integration/construction-operating-assistant-r37c-controlled-run.itest.ts`.
- [x] T009 [US3] Enforce one lease owner, stored terminal replay and zero reinvocation in `src/server/construction-operating-assistant-r37c/coordinator.ts`.
- [x] T010 Add source guards proving zero credential/network path in `test/construction-operating-assistant-r37c-controlled-run.test.ts`.
- [x] T011 Run Spec Kit Analyze, R37A-R37C regression, fresh migration, lint, typecheck and `git diff --check`.
- [x] T012 Commit locally and close R37C while keeping observed readiness unchanged.

## Dependencies

US1 establishes the durable lifecycle. US2 depends on US1 state. US3 depends on
both but is independently verified by concurrent identical submissions.
