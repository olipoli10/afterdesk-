# Tasks: Human Escalation and Exact Resume

**Input**: Design documents from `specs/102-human-escalation-resume/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by the feature specification and constitution for authorization, persistence, concurrency, replay, review, and resume boundaries.

## Phase 1: Setup

**Purpose**: Freeze the incremental boundary and prove the current engine is the reusable foundation.

- [X] T001 Record the existing R5 and Human Work Unit reuse inventory in `specs/102-human-escalation-resume/evidence/r22-reuse-inventory.md`
- [X] T002 Verify root/mobile dependency and lockfile baselines in `specs/102-human-escalation-resume/evidence/r22-lockfile-baseline.md`

---

## Phase 2: Foundational Contracts

**Purpose**: Define strict shared contracts before product behavior.

- [X] T003 [P] Create strict R22 owner projection and command schemas in `src/lib/construction-operating-assistant-r22/contracts.ts`
- [X] T004 [P] Add RED contract, state-mapping, redaction, and unknown-field tests in `test/construction-operating-assistant-r22-human-escalation.test.ts`
- [X] T005 [P] Add shared mobile human-escalation contract parsing in `apps/mobile/src/lib/human-escalations.ts`

**Checkpoint**: R22 boundaries are closed-world and testable without a second engine.

---

## Phase 3: User Story 1 — Escalate a blocked loop (Priority: P1)

**Goal**: Let an authorized owner or office user prepare and inspect exactly one bounded Human Work Unit from one eligible construction loop.

**Independent Test**: Concurrent and replayed prepare commands create one bound escalation; stale, cross-workspace, unauthorized, disabled, and mismatched commands create none.

- [X] T006 [US1] Add real-PostgreSQL RED coverage for prepare, replay, concurrency, stale version, tenancy, policy, and atomicity in `test/integration/construction-operating-assistant-r22-human-escalation.itest.ts`
- [X] T007 [US1] Implement role-safe owner projection and R5 preparation composition in `src/server/construction-operating-assistant-r22/human-escalation-cockpit.ts`
- [X] T008 [US1] Add protected GET and prepare/withdraw POST behavior in `src/app/api/endvera/v1/mobile/human-escalations/route.ts`

**Checkpoint**: One blocked loop can enter one bounded, auditable, unfunded-prepared human escalation with zero transport.

---

## Phase 4: User Story 2 — Complete and review bounded human work (Priority: P2)

**Goal**: Prove current worker and reviewer paths retain minimal access, structured evidence, bounded revision, and independent acceptance.

**Independent Test**: An eligible synthetic worker can claim and submit the exact contract, an independent reviewer can decide it, and forbidden financial/identity fields never enter worker state.

- [X] T009 [P] [US2] Extend worker-projection regression assertions for Construction escalation redaction in `test/integration/construction-operating-assistant-r22-human-escalation.itest.ts`
- [X] T010 [US2] Add full synthetic claim, submission, evidence, revision, acceptance, and exhaustion coverage through existing Human Work Unit APIs in `test/integration/construction-operating-assistant-r22-human-escalation.itest.ts`
- [X] T011 [US2] Map canonical Human Work Unit review states to owner-facing next owner and action in `src/server/construction-operating-assistant-r22/human-escalation-cockpit.ts`

**Checkpoint**: Human support is bounded and independently reviewable without widening worker data reach.

---

## Phase 5: User Story 3 — Resume exactly once (Priority: P3)

**Goal**: Apply one accepted human result to the original construction loop exactly once and recover safely after restart.

**Independent Test**: Concurrent apply plus recovery retries produce one acceptance binding, one resume record, one verified construction evidence effect, and one loop transition.

- [X] T012 [US3] Add RED concurrency, replay, closed-loop, fingerprint-mismatch, and restart-recovery coverage in `test/integration/construction-operating-assistant-r22-human-escalation.itest.ts`
- [X] T013 [US3] Add R22 recovery orchestration and explicit operator-owned failure projection in `src/server/construction-operating-assistant-r22/human-escalation-cockpit.ts`
- [X] T014 [US3] Verify exact R5 accepted-result application remains the only Construction resume path in `test/integration/construction-operating-assistant-r22-human-escalation.itest.ts`

**Checkpoint**: Acceptance and Construction delivery remain separate, recoverable, and exactly once.

---

## Phase 6: Native Owner Cockpit

**Purpose**: Make Human Support visible and controllable from the shared iOS/Android application.

- [X] T015 [P] Add stable API and outbox commands for human escalation read/prepare/withdraw in `apps/mobile/src/lib/api.ts`, `apps/mobile/src/lib/outbox.ts`, and `apps/mobile/src/state/mobile-session.tsx`
- [X] T016 [P] Add one owner/office Human Support screen and navigation entry in `apps/mobile/src/app/(app)/human-support.tsx` and `apps/mobile/src/app/(app)/_layout.tsx`
- [X] T017 Add mobile parsing, stable retry, restart, role, next-action, and zero-transport tests in `apps/mobile/test/human-escalations.test.ts`

---

## Phase 7: Validation and Closeout

**Purpose**: Prove the incremental bridge, preserve truthful evidence labels, and continue the roadmap.

- [X] T018 Run the targeted R22, R5, Human Work Unit, Construction R0, PostgreSQL, and mobile gates documented in `specs/102-human-escalation-resume/quickstart.md`
- [X] T019 Run root/mobile lint, typecheck, full mobile tests, Prisma history validation, Next.js Webpack build, and `git diff --check`, recording results in `specs/102-human-escalation-resume/evidence/r22-closeout.md`
- [X] T020 Close R22 and advance the rolling queue and project backlog to R23 in `specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json`, `specs/090-prepared-action-inspection/PROJECT_BACKLOG.json`, and `specs/090-prepared-action-inspection/evidence/autonomous-continuation-proof.json`

## Dependencies and Execution Order

- Setup tasks T001-T002 precede contract freeze.
- T003-T005 are parallel and block all user stories.
- US1 T006-T008 establishes the owner boundary used by US2 and US3 projections.
- US2 and US3 tests may be authored in parallel after T006, but implementation remains on the existing canonical Human Work Unit and R5 paths.
- Mobile tasks T015-T017 begin after the GET/POST contract in T008 is stable.
- Validation and closeout begin only after US1-US3 and the native cockpit pass targeted tests.

## Parallel Opportunities

- T003, T004, and T005 touch separate contract/test surfaces.
- T009 and T012 can be authored as separate integration scenarios before their shared fixture consolidation.
- T015 and T016 touch separate mobile data and UI files before T017 integrates them.

## Implementation Strategy

1. Freeze and test the owner contract.
2. Expose existing R5 admission and state without duplicating lifecycle logic.
3. Prove worker/reviewer safety and exact resume through real persistence.
4. Add the owner mobile cockpit.
5. Run proportional gates, close R22, and immediately continue R23.

No checkpoint in this task list requests founder confirmation or permits an intermediate project completion claim.
