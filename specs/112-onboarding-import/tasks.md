# Tasks: R32 Contractor Onboarding and Bounded Import

## Phase 1 — Contract and RED

- [ ] T001 Define closed onboarding, import, row, decision and role schemas in `src/lib/construction-operating-assistant-r32/contracts.ts`
- [ ] T002 Add deterministic bounded CSV parser RED in `test/construction-operating-assistant-r32-onboarding-import.test.ts`
- [ ] T003 Add workspace idempotency, tenancy, stale-preview and atomic-commit PostgreSQL RED in `test/integration/construction-operating-assistant-r32-onboarding-import.itest.ts`
- [ ] T004 Add field-projection, oversize, unknown-column, duplicate/conflict and altered-replay mutations to the R32 gates

## Phase 2 — Persistence and canonical reuse

- [ ] T005 Add session, command, batch, row, decision and commit models to `prisma/schema.prisma`
- [ ] T006 Add one additive forward-only R32 migration in `prisma/migrations/*_construction_operating_assistant_r32_onboarding_import/migration.sql`
- [ ] T007 Implement CSV bounds, normalization, fingerprints and closed reason codes in `src/lib/construction-operating-assistant-r32/parser.ts`
- [ ] T008 Implement point-of-use owner/member guards and exact command replay in `src/server/construction-operating-assistant-r32/onboarding.ts`

## Phase 3 — US1/US2 workspace and first value

- [ ] T009 Reuse canonical workspace initialization with one owner/session effect in `src/server/construction-operating-assistant-r32/onboarding.ts`
- [ ] T010 Reuse canonical project/contact creation and derive first-value readiness from PostgreSQL
- [ ] T011 Build independent owner/office and field onboarding projections with one next action

## Phase 4 — US3/US4 immutable preview and decisions

- [ ] T012 Persist zero-canonical-write contact/project previews with exact row states
- [ ] T013 Implement workspace-scoped duplicate and conflict detection without silent merge
- [ ] T014 Implement version-bound `SKIP`, safe `CREATE_NEW` and exact `USE_EXISTING` decisions

## Phase 5 — US5 atomic exact commit

- [ ] T015 Revalidate unchanged source, preview, decisions and canonical conflicts at commit
- [ ] T016 Atomically create accepted canonical records, audit/provenance and immutable commit result
- [ ] T017 Prove exact retry, collision refusal, concurrency and rollback on one failed row

## Phase 6 — US6 shared surfaces

- [ ] T018 Add authenticated rate-limited private/no-store onboarding API in `src/app/api/endvera/v1/mobile/onboarding/route.ts`
- [ ] T019 Add one-step web onboarding surface in `src/app/client/onboarding`
- [ ] T020 Add strict mobile contracts/API/session state in `apps/mobile/src/lib/onboarding.ts`, `apps/mobile/src/lib/api.ts` and `apps/mobile/src/state/mobile-session.tsx`
- [ ] T021 Add Expo onboarding screen/navigation and tests in `apps/mobile/src/app/(app)/onboarding.tsx` and `apps/mobile/test/onboarding.test.ts`

## Phase 7 — Closure and continuation

- [ ] T022 Run R32 plus R1/R13/R16/R17/R18/R29-R31 unit and disposable PostgreSQL gates
- [ ] T023 Run root/mobile lint, typecheck, tests, fresh migration, Expo Doctor/export and Next.js Webpack build
- [ ] T024 Run Spec Kit analysis, diff/lockfile/forbidden-effect audits and record `specs/112-onboarding-import/evidence/r32-closeout.md`
- [ ] T025 Commit R32, mark R32 DONE and promote R33 in the rolling queue/backlog

## Dependencies and strategy

T001–T004 establish RED; T005–T008 are blocking foundation. Deliver one direct
first-value path before CSV, then immutable preview/decision/commit, then shared
surfaces. R32 is incomplete until R33 is promoted and work continues.
