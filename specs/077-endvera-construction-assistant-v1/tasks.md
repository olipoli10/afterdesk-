# Tasks: ENDVERA Construction Assistant V1

## Phase 1 — Setup and RED

- [ ] T001 Record exact base, exclusions and baseline gates in `specs/077-endvera-construction-assistant-v1/evidence/baseline.md`
- [ ] T002 Add RED contract tests in `test/construction-assistant-v1-contract.test.ts`
- [ ] T003 Add RED tenant/idempotency tests in `test/construction-assistant-v1-security.test.ts`

## Phase 2 — Foundational schema

- [ ] T004 Add closed enums and ten additive models to `prisma/schema.prisma`
- [ ] T005 Add forward-only migration in `prisma/migrations/20260831110000_endvera_construction_assistant_v1/migration.sql`
- [ ] T006 Add pure schemas and canonical hashing in `src/lib/construction-assistant-v1/contracts.ts`

## Phase 3 — US1 Workspace, project and contacts

- [ ] T007 [US1] Implement membership-scoped domain service in `src/server/construction-assistant-v1/workspace.ts`
- [ ] T008 [US1] Add authenticated actions in `src/server/actions/construction-assistant-v1.ts`
- [ ] T009 [US1] Add Projects list/create/detail routes in `src/app/client/projects/`
- [ ] T010 [US1] Add workspace/project/contact integration tests in `test/integration/construction-assistant-v1.itest.ts`

## Phase 4 — US2/US3 Calendar and A2

- [ ] T011 [US2] Implement deterministic closed interpreter in `src/lib/construction-assistant-v1/interpreter.ts`
- [ ] T012 [US2] Implement atomic intake/calendar service in `src/server/construction-assistant-v1/intake.ts`
- [ ] T013 [US2] Add A2 construction composer in `src/components/construction-assistant-v1/a2-composer.tsx`
- [ ] T014 [US2] Add calendar route in `src/app/client/calendar/page.tsx`
- [ ] T015 [US3] Implement canonical tomorrow query in `src/server/construction-assistant-v1/queries.ts`
- [ ] T016 [US3] Cover restart, timezone and deterministic order in `test/construction-assistant-v1-calendar.test.ts`

## Phase 5 — US4 Inbox and local simulators

- [ ] T017 [US4] Implement provider-neutral envelopes in `src/lib/construction-assistant-v1/messaging.ts`
- [ ] T018 [US4] Implement local simulator admission/idempotency in `src/server/construction-assistant-v1/simulator.ts`
- [ ] T019 [US4] Add Inbox route in `src/app/client/inbox/page.tsx`
- [ ] T020 [US4] Cover retry, forged envelope, unverified sender and prompt injection in `test/construction-assistant-v1-messaging.test.ts`

## Phase 6 — US5 Exact approval and simulated delivery

- [ ] T021 [US5] Implement versioned outbound action policy in `src/server/construction-assistant-v1/outbound.ts`
- [ ] T022 [US5] Add approval UI in `src/components/construction-assistant-v1/outbound-approval.tsx`
- [ ] T023 [US5] Cover recipient/body/version substitution and replay in `test/construction-assistant-v1-outbound.test.ts`

## Phase 7 — Product integration and closeout

- [ ] T024 Extend client navigation in `src/app/client/layout.tsx`
- [ ] T025 Add French-first construction copy in `src/lib/i18n/construction-assistant-v1.ts`
- [ ] T026 Run Prisma validation/generation and fresh disposable migration
- [ ] T027 Run targeted, integration, lint, typecheck, full serialized suite and Webpack build
- [ ] T028 Record evidence, exact fingerprints, inherited failures and dashboard in `specs/077-endvera-construction-assistant-v1/evidence/closeout.md`
- [ ] T029 Create coherent local commits and checkpoint `C:/dev/afterdesk-project-brain`

## Dependencies

T001–T006 block every story. US1 blocks association in US2–US5. US2 enables US3 and provides the shared message/interpretation transaction used by US4. US5 depends on contact resolution from US1 and inbox/audit primitives from US4.

## MVP

US1–US5 together are the minimum complete proof because stopping at upload, calendar UI or chat interpretation would not demonstrate ENDVERA's differentiated closed loop.
