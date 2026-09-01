# Tasks: Mobile Offline-Safe Command Recovery

## Phase 1 — Setup

- [x] T001 Reconcile the R17 roadmap boundary and implementation plan in specs/097-mobile-offline-retry/plan.md

## Phase 2 — Foundational

- [x] T002 Add RED coverage for durable restart, exact retry, workspace isolation, sign-out clearing, invalid transitions, and bounded storage in apps/mobile/test/outbox.test.ts
- [x] T003 Implement the versioned bounded protected command outbox in apps/mobile/src/lib/outbox.ts

## Phase 3 — User Story 1: Recover interrupted commands

- [x] T004 [US1] Add the foreground recovery surface in apps/mobile/src/app/(app)/outbox.tsx
- [x] T005 [US1] Register the Reprise route in apps/mobile/src/app/(app)/_layout.tsx
- [x] T006 [US1] Load and reconcile workspace recovery state across app restart in apps/mobile/src/state/mobile-session.tsx

## Phase 4 — User Story 2: Retry without duplicate effects

- [x] T007 [US2] Persist stable commands before attempts and wire explicit exact retries in apps/mobile/src/state/mobile-session.tsx

## Phase 5 — User Story 3: Isolate account recovery state

- [x] T008 [US3] Enforce workspace filtering and clear the protected outbox before sign-out in apps/mobile/src/state/mobile-session.tsx

## Phase 6 — Polish and validation

- [x] T009 Run the mobile outbox and existing mobile test suites from apps/mobile
- [x] T010 Run mobile lint, typecheck, Doctor, and iOS/Android/Web local export gates from apps/mobile
- [ ] T011 Record the R17 closeout evidence and advance the rolling queue in specs/097-mobile-offline-retry/evidence/r17-closeout.md and specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json

## Dependencies

- T002 and T003 establish the tested storage contract.
- T006 depends on T003–T005.
- T007 and T008 depend on T006 and are completed sequentially in the shared session file.
- T009–T011 depend on all implementation tasks.

## Independent delivery strategy

- **US1** is independently testable by interrupting and restarting one command.
- **US2** is independently testable by retrying the same retained command.
- **US3** is independently testable by switching workspace and signing out.
