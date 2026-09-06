# Tasks: R38C secretary command entry

## Phase 1 — Contract

- [x] T001 Record the assistant-first entry specification and plan in `specs/199-secretary-command-entry/`
- [x] T002 [P] [US1] Add a failing seven-entry contract test in `apps/mobile/test/secretary-command-entry.test.ts`
- [x] T003 [P] [US2] Add failing bounded-prefill tests in `apps/mobile/test/secretary-command-entry.test.ts`

## Phase 2 — Implementation

- [x] T004 [US1] Add exact entry metadata and the bounded-prefill helper in `apps/mobile/src/lib/virtual-secretary-actions.ts`
- [x] T005 [US1] Make all capability cards actionable in `apps/mobile/src/app/(app)/text-assist.tsx`
- [x] T006 [US2] Consume a valid prefill once without submission in `apps/mobile/src/app/(app)/assistant.tsx`

## Phase 3 — Closure

- [x] T007 Run focused mobile tests, typecheck, lint and the provider-boundary check
- [x] T008 Record exact evidence and backlog state without moving readiness metrics
- [x] T009 Create the useful local product commit and prepare the Brain checkpoint

## Dependencies

T004-T006 follow the RED proof in T002-T003. T007-T009 follow implementation.

## Independent tests

- US1: all seven capabilities reach their intended existing destination.
- US2: valid prefill is accepted once; blank, array and oversized values never submit.
