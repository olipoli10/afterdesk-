# Tasks: R26 Project Email Inbox

## Phase 1 — Contract and RED

- [x] T001 [P] [US1] Freeze provider-neutral account, inbound envelope, cursor and adapter contracts in `specs/106-email-inbox/contracts/email-inbox.md`.
- [x] T002 [P] [US3] Freeze exact draft/approval and role projection contracts in `src/lib/construction-operating-assistant-r26/contracts.ts`.
- [x] T003 [US1] Add failing tests for replay drift, ambiguity, stale cursor, account revocation and zero transport in `test/construction-operating-assistant-r26-email-inbox.test.ts`.
- [x] T004 [US2] Add failing tests for selected evidence and cross-workspace/remote attachment refusal in `test/construction-operating-assistant-r26-email-inbox.test.ts`.

## Phase 2 — PostgreSQL email memory

- [x] T005 [US1] Add forward-only R26 account/event/evidence/draft/decision schema and migration in `prisma/`.
- [x] T006 [P] [US1] Implement deterministic account, cursor, identity and projection policy in `src/lib/construction-operating-assistant-r26/`.
- [x] T007 [US1] Implement local preparation/revocation and trusted inbound admission under exact locks in `src/server/construction-operating-assistant-r26/`.
- [x] T008 [US1] Route admitted verified email text through the canonical R18 intent bridge with email provenance.
- [x] T009 [US2] Link only admitted same-project R14 evidence and preserve contradictory claims.
- [x] T010 [US1] Prove replay, conflict, concurrency, cursor, restart and tenant isolation on disposable PostgreSQL.

## Phase 3 — Prepared outbound email

- [x] T011 [US3] Implement exact versioned `PREPARED_UNSENT` email drafts and payload hashing.
- [x] T012 [US3] Implement exact approval, stale/altered refusal and permanent zero delivery.
- [x] T013 [US4] Implement owner/admin cockpit and recursively minimized field projection.

## Phase 4 — Shared iOS/Android inbox

- [x] T014 [US4] Add protected mobile email API in `src/app/api/endvera/v1/mobile/email-inbox/route.ts`.
- [x] T015 [P] [US4] Add native contracts and restart-safe outbox commands in `apps/mobile/src/lib/email-inbox.ts` and shared client state.
- [x] T016 [US4] Add one shared Email inbox surface and navigation entry in `apps/mobile/src/app/(app)/`.
- [x] T017 [US4] Add mobile parsing, restart, role and zero-transport tests in `apps/mobile/test/email-inbox.test.ts`.

## Phase 5 — Validation and continuation

- [x] T018 [US1] Run R26 and relevant R14/R18/R24 unit/integration gates.
- [x] T019 [US4] Run fresh migration, full mobile/export, lint, typecheck, build, diff, audit and lockfile review.
- [ ] T020 [US4] Record R26 closeout, commit locally and advance automatically to R27.
