# Tasks: Project Brain Intake

**Input**: Design documents from `/specs/187-project-brain-intake/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Contract, persistence, concurrency, recovery, authorization and mobile tests are mandatory because this feature adds a schema and authenticated data boundary.

## Phase 1: Setup and RED

**Purpose**: Freeze the release and prove the missing contract before implementation.

- [x] T001 Record the R36V release, local-only authority and dependency chain in `specs/090-prepared-action-inspection/PROJECT_BACKLOG.json` and `specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json`
- [x] T002 [P] Add strict failing Project Brain contract tests in `test/construction-operating-assistant-r36v-project-brain-contracts.test.ts`
- [x] T003 [P] Add failing mobile queue/surface contract tests in `apps/mobile/test/project-brain-intake.test.ts`
- [x] T004 Run the targeted RED commands and record the expected missing-module failures in `specs/187-project-brain-intake/evidence/red.md`

---

## Phase 2: Foundational Persistence

**Purpose**: Establish additive, versioned and tenant-bound state before exposing any user flow.

- [ ] T005 Add packet, source, snapshot and decision entities plus relations in `prisma/schema.prisma`
- [ ] T006 Create one additive forward-only migration in `prisma/migrations/20260903180000_construction_assistant_r36v_project_brain_intake/migration.sql`
- [ ] T007 Implement strict schemas, canonical snapshot building and result projections in `src/lib/construction-operating-assistant-r36v/project-brain-intake.ts`
- [ ] T008 Add disposable PostgreSQL integration tests for migration, tenancy, replay, concurrency and restart in `test/integration/construction-operating-assistant-r36v-project-brain.itest.ts`

**Checkpoint**: The data model and public contracts are independently valid, with no provider behavior.

---

## Phase 3: User Story 1 — Empty a job into one intake (Priority: P1)

**Goal**: Create one durable project-bound packet and admit several independently retryable sources.

**Independent Test**: Submit at least four synthetic sources through separate commands and recover the same ordered inventory and hashes after a new database client.

- [ ] T009 [US1] Implement authorized, serialized create/brief/source admission and replay logic in `src/server/construction-operating-assistant-r36v/project-brain-intake.ts`
- [ ] T010 [US1] Reuse secure scanner/storage admission with orphan compensation in `src/server/construction-operating-assistant-r36v/project-brain-intake.ts`
- [ ] T011 [US1] Add authenticated no-store command/projection route in `src/app/api/endvera/v1/mobile/project-brain-intake/route.ts`
- [ ] T012 [US1] Add authenticated multipart source route in `src/app/api/endvera/v1/mobile/project-brain-intake/sources/route.ts`
- [ ] T013 [P] [US1] Add mirrored mobile contracts and retry state in `apps/mobile/src/lib/project-brain-intake.ts`
- [ ] T014 [US1] Add API client and session operations in `apps/mobile/src/lib/api.ts` and `apps/mobile/src/state/mobile-session.tsx`

**Checkpoint**: Multi-source admission is durable, project-bound, idempotent and visibly local-only.

---

## Phase 4: User Story 2 — Review and confirm exact project memory (Priority: P1)

**Goal**: Produce an owner-reviewable, deterministic understanding and atomically confirm its exact fingerprint.

**Independent Test**: Submit a complete packet, confirm its current fingerprint once, replay it, and verify exactly one immutable confirmed snapshot/decision.

- [ ] T015 [US2] Implement submit, confirm, reject, fingerprint and append-only decision transitions in `src/server/construction-operating-assistant-r36v/project-brain-intake.ts`
- [ ] T016 [US2] Build the one-surface intake/review/confirmation experience in `apps/mobile/src/app/(app)/project-brain-intake.tsx`
- [ ] T017 [US2] Link the hidden route from Projects without adding a primary tab in `apps/mobile/src/app/(app)/projects.tsx` and `apps/mobile/src/app/(app)/_layout.tsx`
- [ ] T018 [US2] Add equivalent French/English truth labels and actions in `apps/mobile/src/lib/product-experience.ts`
- [ ] T019 [US2] Complete mobile interaction tests for multi-select queue, partial retry, limitations, exact confirmation, accessibility and remount recovery in `apps/mobile/test/project-brain-intake.test.ts`

**Checkpoint**: The owner can confirm exact memory from one surface without any fake analysis claim.

---

## Phase 5: User Story 3 — Ask what the owner confirmed (Priority: P2)

**Goal**: Recover narrow useful context from the latest confirmed snapshot only.

**Independent Test**: After restart, retrieve summary, blockers, next decision and source inventory while draft and binary-content claims remain unavailable.

- [ ] T020 [P] [US3] Add failing deterministic query tests in `test/construction-operating-assistant-r36v-project-brain-query.test.ts`
- [ ] T021 [US3] Implement confirmed-snapshot-only queries in `src/server/construction-operating-assistant-r36v/project-brain-query.ts`
- [ ] T022 [US3] Integrate the narrow query path without changing other intent behavior in `src/server/construction-operating-assistant-r36c/orchestrator.ts`

**Checkpoint**: ENDVERA recalls owner-confirmed context and refuses to invent binary-source understanding.

---

## Phase 6: Validation and Closeout

**Purpose**: Prove the new persistence/security boundary and preserve honest readiness labels.

- [ ] T023 Run targeted unit, API, mobile and disposable PostgreSQL integration tests from `specs/187-project-brain-intake/quickstart.md`
- [ ] T024 Run Prisma validation, migration checks, provider-boundary validation, lint, typecheck, full serialized suites and Next.js Webpack build
- [ ] T025 Execute and restore the proportional replay, tenancy, stale-version, invented-fact and provider-call mutations documented in `specs/187-project-brain-intake/evidence/mutations.md`
- [ ] T026 Record exact evidence, dashboard labels and remaining provider-enabled releases in `specs/187-project-brain-intake/evidence/closeout.md`
- [ ] T027 Mark completed tasks and release state, validate `git diff --check`, and create coherent local commits without push

---

## Dependencies & Execution Order

- Setup/RED (T001–T004) precedes every implementation task.
- Persistence (T005–T008) blocks all three user stories.
- US1 (T009–T014) precedes US2 because review consumes the admitted packet.
- US2 (T015–T019) precedes US3 because queries require a confirmed snapshot.
- Closeout (T023–T027) follows all desired stories.

## Parallel Opportunities

- T002 and T003 target different test trees.
- T013 can proceed after T007 while server persistence work continues.
- T020 can be written after the snapshot contract is fixed, before the query service.

## Implementation Strategy

The first useful vertical is T001–T019: the owner can empty one job into a durable packet, add explicit context and confirm exact project memory. T020–T022 then exposes that memory through the assistant. No future provider work is required to close the local R36V contract, and no provider capability is implied by its completion.
