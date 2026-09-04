# Tasks: Project Brain Understanding Review

**Input**: Design documents from `/specs/189-project-brain-understanding-review/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Contract, persistence, authorization, replay/concurrency, corruption and mobile tests are mandatory.

## Phase 1: Contract and RED

- [x] T001 [P] Add strict lifecycle/command/projection/hash tests in `test/construction-operating-assistant-r36x-understanding-contracts.test.ts`
- [x] T002 [P] Add failing authorization/non-enumeration/replay/API tests in `test/construction-operating-assistant-r36x-understanding-api.test.ts`
- [x] T003 [P] Add failing provider/binary/external/automatic-resolution sentinels in `test/construction-operating-assistant-r36x-understanding-server.test.ts`
- [x] T004 [P] Add failing one-surface/no-technical-ID/accessibility tests in `apps/mobile/test/project-brain-understanding-review.test.ts`
- [x] T005 Record reproducible RED only in `specs/189-project-brain-understanding-review/evidence/red.md`

## Phase 2: Foundational Persistence

- [x] T006 Add review, disposition, contradiction, member, resolution, snapshot and decision entities in `prisma/schema.prisma`
- [x] T007 Create one additive forward-only R36X migration under `prisma/migrations/` with reciprocal, completeness, canonical disposition/resolution matrix, multi-group agreement, monotonic confirmation sequence, exclusivity, hash and append-only guards
- [x] T008 [P] Add fresh PostgreSQL migration/raw-SQL/immutability/matrix/sequence tests in `test/integration/construction-operating-assistant-r36x-understanding.itest.ts`
- [x] T009 [P] Add reset allowlisting for only named R36X test guards in `test/integration/per-file-setup.ts` and preserve migration-byte fingerprints in `test/integration/global-setup.ts`

**Checkpoint**: Forged, partial, cross-tenant or history-rewriting review state cannot commit.

## Phase 3: User Story 1 — Inspect one complete packet (Priority: P1)

**Independent Test**: Open from a project and inspect every exact source/candidate/provenance without copied IDs.

- [x] T010 [US1] Implement strict schemas, projections and canonical ordering in `src/lib/construction-operating-assistant-r36x/project-brain-understanding-review.ts`
- [x] T011 [US1] Implement project-navigation resolution, point-of-use authorization and complete R36V/R36W binding in `src/server/construction-operating-assistant-r36x/project-brain-understanding-review.ts`
- [x] T012 [US1] Implement authenticated no-store GET/POST route in `src/app/api/endvera/v1/mobile/project-brain-understanding-review/route.ts`
- [x] T013 [P] [US1] Add mirrored mobile contracts/API/state in `apps/mobile/src/lib/project-brain-understanding-review.ts`, `apps/mobile/src/lib/api.ts` and `apps/mobile/src/state/mobile-session.tsx`
- [x] T014 [US1] Build one project-linked review surface in `apps/mobile/src/app/(app)/project-brain-understanding-review.tsx`, `apps/mobile/src/app/(app)/projects.tsx` and `apps/mobile/src/app/(app)/_layout.tsx`
- [x] T015 [US1] Add truthful bilingual labels in `apps/mobile/src/lib/product-experience.ts`

## Phase 4: User Story 2 — Preserve and resolve contradictions (Priority: P1)

**Independent Test**: Declare, resolve and reload a contradiction while all members/history remain unchanged.

- [x] T016 [US2] Implement serialized body-bound candidate disposition and contradiction declaration in `src/server/construction-operating-assistant-r36x/project-brain-understanding-review.ts`
- [x] T017 [US2] Implement three explicit append-only resolution modes plus canonical disposition derivation and multi-group agreement with no default/automatic path in `src/server/construction-operating-assistant-r36x/project-brain-understanding-review.ts`
- [x] T018 [US2] Add contradiction/member/non-member/history/replay/matrix/multi-group conflict tests in `test/construction-operating-assistant-r36x-understanding-server.test.ts` and `test/integration/construction-operating-assistant-r36x-understanding.itest.ts`
- [x] T019 [US2] Complete mobile contradiction and explicit resolution interactions in `apps/mobile/src/app/(app)/project-brain-understanding-review.tsx` and `apps/mobile/test/project-brain-understanding-review.test.ts`

## Phase 5: User Story 3 — Seal exact understanding (Priority: P1)

**Independent Test**: Complete all decisions, prepare exact fingerprint, confirm once, replay and restart byte-equivalently.

- [x] T020 [US3] Implement complete-coverage validation and canonical snapshot/fingerprint builders in `src/lib/construction-operating-assistant-r36x/project-brain-understanding-review.ts`
- [x] T021 [US3] Implement matrix-gated prepare plus project-serialized monotonic-sequence exact atomic confirmation transitions in `src/server/construction-operating-assistant-r36x/project-brain-understanding-review.ts`
- [x] T022 [US3] Add incomplete/stale/hash/body-drift/concurrent-confirm/unique-sequence/current-order/restart tests in `test/integration/construction-operating-assistant-r36x-understanding.itest.ts`
- [x] T023 [US3] Complete canonical preview/exact confirmation UX and tests in `apps/mobile/src/app/(app)/project-brain-understanding-review.tsx` and `apps/mobile/test/project-brain-understanding-review.test.ts`

## Phase 6: Validation and Closeout

- [x] T024 Run all targeted root/mobile and fresh disposable PostgreSQL commands from `specs/189-project-brain-understanding-review/quickstart.md`
- [x] T025 Run targeted R36V/R36W regressions proving upstream meaning/provenance remain unchanged
- [x] T026 Execute/restore all required mutations and record hashes/guards in `specs/189-project-brain-understanding-review/evidence/mutations.md`
- [x] T027 Run Prisma validation, provider boundary, root/mobile lint/typecheck/tests and Next.js Webpack build
- [x] T028 Record exact local evidence and remaining R36Y/R36Z/external gates in `specs/189-project-brain-understanding-review/evidence/closeout.md`
- [x] T029 Update only separately authorized release/queue/task state after all gates pass and create coherent local commits without push

## Dependencies & Execution Order

- RED precedes implementation; persistence blocks all user stories.
- US1 establishes the exact review projection.
- US2 consumes US1 candidates and must complete before US3 can prove contradiction coverage.
- US3 precedes closeout.

## Parallel Opportunities

- T001–T004 target separate test surfaces.
- T008 and T010 can proceed after the persistence contract is frozen.
- T018 and T019 target server/integration and mobile files respectively.

## Implementation Strategy

The first truthful vertical is inspection plus explicit disposition/contradiction decisions. Exact sealing follows only after all review coverage and database backstops pass. R36X stops before assistant recall or any external effect.
