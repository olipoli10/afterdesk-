# Tasks: R31 Observability and Recovery

**Input**: `specs/111-observability-recovery/` design artifacts
**Tests**: Required by the specification and constitution.

## Phase 1 — Contract and RED

- [x] T001 Define closed observability, alert, queue, recovery, drill and gate schemas in `src/lib/construction-operating-assistant-r31/contracts.ts`
- [x] T002 [P] Add safe-dimension, fingerprint, health and field-leak policy RED in `test/construction-operating-assistant-r31-observability-recovery.test.ts`
- [x] T003 [P] Add PostgreSQL tenancy, duplicate, stale-version and restart RED in `test/integration/construction-operating-assistant-r31-observability-recovery.itest.ts`
- [x] T004 [P] Add unsafe connector replay and exact R20 recovery RED in `test/integration/construction-operating-assistant-r31-observability-recovery.itest.ts`
- [x] T005 [P] Add disposable backup/restore guard and mismatch RED in `specs/111-observability-recovery/scripts/test-disposable-restore-drill.ps1`

## Phase 2 — Foundational persistence

- [x] T006 Add reliability signal, alert, recovery, checkpoint, drill and gate relations/models in `prisma/schema.prisma`
- [x] T007 Add one non-destructive forward-only R31 migration in `prisma/migrations/*_construction_operating_assistant_r31_observability_recovery/migration.sql`
- [x] T008 Implement canonical fingerprints, safe dimensions, health derivation and registry metadata in `src/lib/construction-operating-assistant-r31/policy.ts`
- [x] T009 Implement workspace/owner role guards, advisory locks and exact command replay in `src/server/construction-operating-assistant-r31/reliability.ts`

## Phase 3 — US1 Inspect operational health (P1)

**Independent test**: two workspaces produce isolated denominator-bearing health summaries and the field role receives no aggregate internals.

- [x] T010 [US1] Implement deterministic canonical metrics and owner/field projections in `src/server/construction-operating-assistant-r31/reliability.ts`
- [x] T011 [US1] Implement append-only deduplicated safe signals in `src/server/construction-operating-assistant-r31/reliability.ts`
- [x] T012 [US1] Implement versioned alert creation, acknowledgement and resolution in `src/server/construction-operating-assistant-r31/reliability.ts`

## Phase 4 — US2 Trace one operational result (P1)

**Independent test**: one trace reconstructs canonical steps without any forbidden content or cross-workspace span.

- [x] T013 [US2] Add trace/span validation and projection to `src/lib/construction-operating-assistant-r31/contracts.ts`
- [x] T014 [US2] Add safe trace query and canonical-resource ordering to `src/server/construction-operating-assistant-r31/reliability.ts`

## Phase 5 — US3 Detect and adjudicate stuck work (P1)

**Independent test**: concurrent scans create one alert; exact local follow-up recovery applies once; connector recovery quarantines with zero dispatch.

- [x] T015 [US3] Export the exact idempotent due-item handler from `src/server/construction-operating-assistant-r20/follow-up-engine.ts`
- [x] T016 [US3] Implement v1 follow-up and connector inspectors in `src/server/construction-operating-assistant-r31/queue-registry.ts`
- [x] T017 [US3] Implement scan, prepared recovery, exact apply, quarantine and revoke flows in `src/server/construction-operating-assistant-r31/reliability.ts`

## Phase 6 — US4 Prove backup and restore readiness (P1)

**Independent test**: a disposable dump/restore matches one closed checkpoint; mutation and non-disposable names fail visibly.

- [x] T018 [US4] Implement closed canonical checkpoint registry and manifest builder in `src/server/construction-operating-assistant-r31/checkpoints.ts`
- [x] T019 [US4] Implement strict local database-name/URL guards and drill comparison in `src/lib/construction-operating-assistant-r31/recovery.ts`
- [x] T020 [US4] Implement disposable PostgreSQL backup/restore drill in `specs/111-observability-recovery/scripts/run-disposable-restore-drill.ps1`
- [x] T021 [US4] Persist honest pass/fail/refused drill evidence in `src/server/construction-operating-assistant-r31/reliability.ts`

## Phase 7 — US5 Enforce concurrency and load gates (P2)

**Independent test**: 500 bounded synthetic writes preserve exact canonical effects and persist complete p50/p95 denominators.

- [x] T022 [US5] Implement percentile, correctness and threshold gate evaluation in `src/lib/construction-operating-assistant-r31/gates.ts`
- [x] T023 [US5] Persist immutable synthetic gate results in `src/server/construction-operating-assistant-r31/reliability.ts`
- [x] T024 [US5] Add bounded 500-signal load/concurrency coverage in `test/integration/construction-operating-assistant-r31-load-gates.itest.ts`

## Phase 8 — US6 Shared role-safe surfaces (P2)

**Independent test**: web and shared Expo render the same strict contract while the field schema rejects every hidden aggregate.

- [x] T025 [US6] Add authenticated rate-limited private/no-store route in `src/app/api/endvera/v1/mobile/reliability/route.ts`
- [x] T026 [US6] Add owner/office and field-safe web Reliability cockpit in `src/app/client/reliability/page.tsx`
- [x] T027 [P] [US6] Add strict mobile contract and API client in `apps/mobile/src/lib/reliability.ts` and `apps/mobile/src/lib/api.ts`
- [x] T028 [P] [US6] Add native Reliability screen, navigation and tests in `apps/mobile/src/app/(app)/reliability.tsx`, `apps/mobile/src/app/(app)/_layout.tsx` and `apps/mobile/test/reliability.test.ts`

## Phase 9 — Closure and continuation

- [x] T029 Run R31/R20/R23/R28-R30 unit and disposable PostgreSQL integration gates and record results in `specs/111-observability-recovery/evidence/r31-closeout.md`
- [x] T030 Run root/mobile lint, typecheck, tests, fresh migration, restore drill, Expo Doctor/exports and Next.js Webpack build in `specs/111-observability-recovery/evidence/r31-closeout.md`
- [x] T031 Run Spec Kit analysis, diff/lockfile/forbidden-effect audits and close all tasks in `specs/111-observability-recovery/tasks.md`
- [x] T032 Commit R31, mark S4/R31 DONE and promote R32 in `specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json` and `specs/090-prepared-action-inspection/PROJECT_BACKLOG.json`

## Dependencies and execution order

- T001-T005 establish RED and contracts; T006-T009 are blocking foundation.
- US1 and US2 share persistence and proceed before queue recovery.
- US3 reuses R20 and must pass before recovery is exposed.
- US4 and US5 are independently testable after foundation.
- US6 depends on stable cockpit/command schemas.
- T029-T032 close only after all story tasks are green.

## Parallel opportunities

- T002-T005 can run independently after T001.
- US4 checkpoint/drill and US5 gate policy touch separate files after persistence.
- T027 and T028 can proceed together after the API contract stabilizes.

## Implementation strategy

Implement the closed contract and persistence first, then deliver the smallest
complete recovery proof: one canonical health cockpit, one safe local R20
recovery and one quarantined connector item. Add real disposable restore and
bounded load evidence before surfaces or release claims. R31 is not complete
until R32 is promoted and the queue continues.
