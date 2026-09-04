# Tasks: Project Brain Assistant Memory

**Input**: Design documents from `/specs/190-project-brain-assistant-memory/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Phase 1: Contract and RED

- [ ] T001 [P] Add failing confirmed-only registry/citation/action-family contracts in `test/construction-operating-assistant-r36y-assistant-memory-contracts.test.ts`
- [ ] T002 [P] Add failing assistant API/authorization/body-bound tests in `test/construction-operating-assistant-r36y-assistant-memory-api.test.ts`
- [ ] T003 [P] Add failing provider/binary/approval/delivery sentinels in `test/construction-operating-assistant-r36y-assistant-memory-server.test.ts`
- [ ] T004 [P] Add failing mobile no-ID/visible-payload/restart tests in `apps/mobile/test/project-brain-assistant-memory.test.ts`
- [ ] T005 Record reproducible RED in `specs/190-project-brain-assistant-memory/evidence/red.md`

## Phase 2: Foundational Provenance Persistence

- [ ] T006 Add recall receipt, citation, prepared-action binding and assistant decision entities in `prisma/schema.prisma`
- [ ] T007 Create one additive R36Y forward migration with confirmed-memory/citation/action reciprocity and append-only guards under `prisma/migrations/`
- [ ] T008 [P] Add fresh PostgreSQL migration/raw-SQL/replay/concurrency/restart tests in `test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts`
- [ ] T009 [P] Add reset allowlisting for only named R36Y test guards in `test/integration/per-file-setup.ts` and preserve migration-byte fingerprinting in `test/integration/global-setup.ts`

## Phase 3: User Story 1 — Recall sealed memory (Priority: P1)

- [ ] T010 [US1] Implement strict eight-question registry, results, citation schemas and canonical builders in `src/lib/construction-operating-assistant-r36y/project-brain-assistant-memory.ts`
- [ ] T011 [US1] Implement exact R36X project-current-pointer selection by `(confirmedUnderstandingSequence DESC, confirmed snapshot id DESC)`, point-of-use authorization and complete provenance validation in `src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts`
- [ ] T012 [US1] Implement deterministic recall receipts/citations and body-bound replay in `src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts`
- [ ] T013 [US1] Integrate the narrow recall path without changing other intents in `src/server/construction-operating-assistant-r36c/orchestrator.ts`
- [ ] T014 [US1] Complete draft/candidate/unresolved-conflict leakage and citation tests in `test/construction-operating-assistant-r36y-assistant-memory-server.test.ts` and `test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts`

## Phase 4: User Story 2 — Prepare cited action (Priority: P1)

- [ ] T015 [US2] Implement the four-family registry and exact contact/content/citation validation in `src/lib/construction-operating-assistant-r36y/project-brain-assistant-memory.ts`
- [ ] T016 [US2] Delegate atomically to existing evidence-request, SMS/MMS, voice-call and email preparation services in `src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts`
- [ ] T017 [US2] Persist exact action-memory bindings/citations while keeping approval and delivery structurally separate in `src/server/construction-operating-assistant-r36y/project-brain-assistant-memory.ts`
- [ ] T018 [US2] Add family-policy/recipient/payload/stale-memory/replay regressions in `test/construction-operating-assistant-r36y-assistant-memory-server.test.ts` and `test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts`

## Phase 5: User Story 3 — Unified mobile recovery (Priority: P2)

- [ ] T019 [US3] Extend strict assistant command/read handling with exact current sequence+hash binding in `src/app/api/endvera/v1/mobile/assistant/route.ts` and add `src/app/api/endvera/v1/mobile/assistant/project-memory/route.ts`
- [ ] T020 [P] [US3] Add mirrored mobile contracts/API/session state in `apps/mobile/src/lib/assistant.ts`, `apps/mobile/src/lib/api.ts` and `apps/mobile/src/state/mobile-session.tsx`
- [ ] T021 [US3] Integrate project-context recall and prepared-action inspection into `apps/mobile/src/app/(app)/assistant.tsx` with truthful labels in `apps/mobile/src/lib/product-experience.ts`
- [ ] T022 [US3] Complete no-ID navigation, visible recipient/channel/body/citations, replay and restart tests in `apps/mobile/test/project-brain-assistant-memory.test.ts`

## Phase 6: Validation and Closeout

- [ ] T023 Run targeted root/mobile and fresh PostgreSQL validation from `specs/190-project-brain-assistant-memory/quickstart.md`
- [ ] T024 Run targeted R36V–R36X plus four existing prepared-family regression suites
- [ ] T025 Execute/restore all mutations and record exact hashes/guards in `specs/190-project-brain-assistant-memory/evidence/mutations.md`
- [ ] T026 Run Prisma validation, provider boundary, root/mobile lint/typecheck/tests and Webpack build
- [ ] T027 Record exact local evidence and remaining R36Z/external gates in `specs/190-project-brain-assistant-memory/evidence/closeout.md`
- [ ] T028 Update only separately authorized release/queue/task state after all gates pass and create coherent local commits without push

## Dependencies & Execution Order

- RED precedes persistence; persistence blocks every story.
- US1 confirmed recall precedes US2 action preparation.
- US2 precedes the complete US3 mobile action flow.
- Validation follows all stories.

## Parallel Opportunities

- T001–T004 target separate test surfaces.
- T008 and T010 can proceed after the data contract is frozen.
- T018 and T020 target server/integration and mobile files.

## Implementation Strategy

Build confirmed-only cited recall first. Add only existing-family preparation second. Integrate the unified mobile surface last. Stop before approval, delivery, provider behavior or R36Z whole-chain claims.
