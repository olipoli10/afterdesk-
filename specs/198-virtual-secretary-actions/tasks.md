# Tasks: R38B virtual secretary actions

## Phase 1 — Specification and design

- [x] T001 Record the founder's virtual-secretary definition in `specs/198-virtual-secretary-actions/spec.md`
- [x] T002 [P] Record architecture decisions in `specs/198-virtual-secretary-actions/research.md`
- [x] T003 [P] Define entities and endpoint contract in `specs/198-virtual-secretary-actions/data-model.md` and `contracts/virtual-secretary-actions.json`

## Phase 2 — Closed-world kernel

- [x] T004 [US1] Add catalog and request/plan schemas in `src/lib/construction-operating-assistant-r38b/virtual-secretary-actions.ts`
- [x] T005 [US1] Implement grounded schedule and Google Calendar readiness planning in `src/lib/construction-operating-assistant-r38b/virtual-secretary-actions.ts`
- [x] T006 [US2] Implement single, broadcast and call preparation boundaries in `src/lib/construction-operating-assistant-r38b/virtual-secretary-actions.ts`
- [x] T007 [US3] Implement project and calendar mutation preparation in `src/lib/construction-operating-assistant-r38b/virtual-secretary-actions.ts`
- [x] T008 [P] [US1] Prove all capability and refusal paths in `test/construction-operating-assistant-r38b.test.ts`

## Phase 3 — Authenticated API and mobile product surface

- [x] T009 [US1] Add authenticated GET/POST planning endpoint in `src/app/api/endvera/v1/mobile/virtual-secretary-actions/route.ts`
- [x] T010 [P] [US2] Add the mobile capability presentation contract in `apps/mobile/src/lib/virtual-secretary-actions.ts`
- [x] T011 [US2] Expose all seven secretary capabilities on `apps/mobile/src/app/(app)/text-assist.tsx`
- [x] T012 [P] [US2] Prove mobile capability coverage in `apps/mobile/test/virtual-secretary-actions.test.ts`

## Phase 4 — Validation and governance

- [x] T013 Run focused/full proportional validation and record exact evidence in `specs/198-virtual-secretary-actions/evidence/local-validation.json`
- [x] T014 Update `specs/090-prepared-action-inspection/PROJECT_BACKLOG.json` without inflating readiness metrics
- [ ] T015 Create useful local product and canonical Brain checkpoints

## Dependencies

- T004-T008 depend on T001-T003.
- T009-T012 depend on the schemas and planner in T004-T007.
- T013-T015 depend on all implementation tasks.

## Independent tests

- US1: canonical schedule answer and missing Google connection are distinguishable.
- US2: one, ten and invalid broadcast recipients plus call preparation are exact and transport-free.
- US3: project and calendar changes produce exact prepared actions only.

## MVP

The smallest valuable slice is all seven capabilities in one closed-world planner because the product promise is the secretary, not one isolated command.
