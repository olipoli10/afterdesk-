# Tasks: Project Brain Fact Candidates

**Input**: Design documents from `/specs/188-project-brain-fact-candidates/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Strict contract, persistence, authorization, replay/concurrency, corruption and zero-provider/binary-read tests are mandatory because this feature adds an authenticated persistence boundary.

## Phase 1: Contract and RED

**Purpose**: Prove the closed adapter and unavailable-understanding boundaries before implementation.

- [x] T001 [P] Add strict failing schemas/adapter/range/confidence tests in `test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts`
- [x] T002 [P] Add failing authenticated route/authorization/body-bound replay tests in `test/construction-operating-assistant-r36w-fact-candidates-api.test.ts`
- [x] T003 [P] Add failing binary-read/provider/network/automatic-confirmation sentinels in `test/construction-operating-assistant-r36w-fact-candidates-server.test.ts`
- [x] T004 Run the targeted RED command from `specs/188-project-brain-fact-candidates/quickstart.md` and record only reproducible missing-contract failures in `specs/188-project-brain-fact-candidates/evidence/red.md`

---

## Phase 2: Foundational Persistence

**Purpose**: Establish immutable candidate provenance and raw-SQL backstops before exposing generation.

- [x] T005 Add fact-candidate batch, candidate and decision entities plus restrictive reciprocal relations in `prisma/schema.prisma`
- [x] T006 Create one additive forward-only R36W migration under `prisma/migrations/` with exact enum/check/unique/foreign-key and deferred integrity guards
- [x] T007 [P] Add fresh PostgreSQL tests for migration, append-only history, tenant reciprocity, confirmed-snapshot binding, text reconstruction, canonical metadata equality, candidate completeness and raw-SQL bypass refusal in `test/integration/construction-operating-assistant-r36w-fact-candidates.itest.ts`
- [x] T008 [P] Add integration reset allowlisting for only the named R36W append-only guards in `test/integration/per-file-setup.ts` and preserve migration-byte fingerprinting in `test/integration/global-setup.ts`

**Checkpoint**: The database refuses forged, cross-tenant, semantically promoted or partially committed candidate state without service code.

---

## Phase 3: User Story 1 — Generate explicit local candidates (Priority: P1)

**Goal**: Emit only exact supported owner text and canonical source metadata from one confirmed intake.

**Independent Test**: Generate from a synthetic confirmed intake and reconstruct every candidate from its exact retained provenance with zero binary read.

- [x] T009 [US1] Implement strict command/result/projection schemas, fixed field orders, UTF-16 ranges and canonical fingerprint helpers in `src/lib/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`
- [x] T010 [US1] Implement the closed `OWNER_BRIEF_FIELDS_V1` and `ADMITTED_SOURCE_METADATA_V1` pure adapters in `src/lib/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`
- [x] T011 [US1] Implement point-of-use owner/office-manager authorization and exact confirmed R36V snapshot/source validation in `src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`
- [x] T012 [US1] Implement one serialized atomic generation transaction and redacted accepted decision in `src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`
- [x] T013 [US1] Complete exact-copy, Unicode, fixed-registry, metadata-not-job-fact and zero-binary/provider service assertions in `test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts` and `test/construction-operating-assistant-r36w-fact-candidates-server.test.ts`

**Checkpoint**: R36W creates deterministic local candidates and cannot claim binary understanding.

---

## Phase 4: User Story 2 — Retry safely without duplicate meaning (Priority: P1)

**Goal**: Converge exact retries and races on one immutable candidate set.

**Independent Test**: Race exact commands and distinct command IDs for the same adapter/input, then attempt body drift and stale snapshot generation.

- [x] T014 [US2] Add workspace-scoped command serialization, body-bound replay and equivalent-batch convergence in `src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`
- [x] T015 [US2] Add concurrent replay, equivalent-batch, body-drift, stale-snapshot, rollback and candidate-set hash tests in `test/integration/construction-operating-assistant-r36w-fact-candidates.itest.ts`
- [x] T016 [US2] Add one idempotent eligible refusal/replay audit effect while preserving no-target-audit behavior for malformed/unauthorized requests in `src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`

**Checkpoint**: Retry, response loss and concurrency cannot duplicate or rewrite candidate meaning.

---

## Phase 5: User Story 3 — Inspect unconfirmed provenance safely (Priority: P2)

**Goal**: Return complete valid provenance only to authorized roles and never expose a confirmed fact.

**Independent Test**: Read as OWNER, OFFICE_MANAGER, FIELD_WORKER and another workspace; then corrupt synthetic retained state and verify all-or-nothing refusal.

- [x] T017 [US3] Implement authorized read projection with complete candidate provenance and read-side canonical text/metadata revalidation in `src/server/construction-operating-assistant-r36w/project-brain-fact-candidates.ts`
- [x] T018 [US3] Add strict authenticated no-store POST/GET handling in `src/app/api/endvera/v1/mobile/project-brain-fact-candidates/route.ts`
- [x] T019 [US3] Complete route tests for non-enumeration, role matrix, corrupt-state refusal, immutable limitations and all five false-effect flags in `test/construction-operating-assistant-r36w-fact-candidates-api.test.ts`
- [x] T020 [US3] Complete restart byte-equivalence and cross-workspace raw-SQL/source-reuse refusal tests in `test/integration/construction-operating-assistant-r36w-fact-candidates.itest.ts`

**Checkpoint**: Authorized readers can inspect exact unconfirmed provenance; everyone else learns nothing.

---

## Phase 6: Validation and Closeout

**Purpose**: Prove the new boundary without broadening any release claim.

- [x] T021 Run all targeted root and fresh disposable PostgreSQL commands from `specs/188-project-brain-fact-candidates/quickstart.md`
- [x] T022 Run targeted R36V Project Brain regressions to prove confirmed intake/source/snapshot meanings remain unchanged
- [x] T023 Execute and restore every proportional mutation listed in `specs/188-project-brain-fact-candidates/quickstart.md`, recording hashes and exact guards in `specs/188-project-brain-fact-candidates/evidence/mutations.md`
- [x] T024 Run Prisma validation, provider-boundary validation, lint, typecheck, full root suite, Next.js Webpack build and `git diff --check`
- [x] T025 Record exact local evidence and honest remaining R36X/R36Y/R36Z/external gates in `specs/188-project-brain-fact-candidates/evidence/closeout.md`
- [ ] T026 Update only authorized release/queue/task state after all gates pass and create coherent local commits without push

## Dependencies & Execution Order

- Phase 1 RED precedes implementation.
- Phase 2 persistence blocks all user stories.
- US1 establishes candidate creation and blocks US2/US3.
- US2 and US3 may proceed after US1; US3 consumes stable batch identity from US2 for final concurrency assertions.
- Validation follows all selected stories.

## Parallel Opportunities

- T001–T003 target separate tests.
- T007 and T009 can proceed after the data contract is frozen, on different files.
- T015 and T019 target integration and route layers respectively.
- Mutation documentation can be prepared while static gates run, but results are recorded only after execution.

## Implementation Strategy

The minimum truthful vertical is T001–T013: exact-copy candidates with complete provenance and zero binary/provider reach. T014–T020 then make that vertical durable, retry-safe and safely readable. R36W stops before any human review or candidate confirmation; those belong to R36X.
