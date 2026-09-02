# Tasks: Unified Assistant Routing

**Input**: Design documents from `specs/119-unified-assistant-routing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Phase 1: Setup

- [x] T001 Add R36C to the autonomous queue and backlog in `specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json`, `PROJECT_BACKLOG.json` and `evidence/autonomous-continuation-proof.json`
- [x] T002 Validate all checked requirements and Spec Kit prerequisites for `specs/119-unified-assistant-routing`

## Phase 2: Foundational

- [x] T003 [P] Define provider-neutral routing and result schemas in `src/lib/construction-operating-assistant-r36c/contracts.ts`
- [x] T004 [P] Write failing contract/routing tests in `test/construction-operating-assistant-r36c-unified-routing.test.ts`
- [x] T005 [P] Write failing mobile projection tests in `apps/mobile/test/mobile-assistant-routing.test.ts`
- [x] T006 [P] Write failing PostgreSQL replay and authorization tests in `test/integration/construction-operating-assistant-r36c-unified-routing.itest.ts`

## Phase 3: User Story 1 — One assistant entry point (P1)

**Goal**: Route every real mobile request before reusing the existing internal engine.

**Independent Test**: Canonical-state, calendar and communication requests retain exact behavior and receive an internal routing projection.

- [x] T007 [US1] Implement trusted request construction and provider-neutral decision projection in `src/server/construction-operating-assistant-r36c/orchestrator.ts`
- [x] T008 [US1] Delegate internal dispositions to the existing R9/R2 service in `src/server/construction-operating-assistant-r36c/orchestrator.ts`
- [x] T009 [US1] Wire the real POST boundary to R36C in `src/app/api/endvera/v1/mobile/assistant/route.ts`
- [x] T010 [US1] Prove internal routing and exact R9 regression behavior in `test/construction-operating-assistant-r36c-unified-routing.test.ts`

## Phase 4: User Story 2 — Honest deferred intelligence (P2)

**Goal**: Durably retain provider-required requests without provider execution or invented output.

**Independent Test**: Public research produces one persistent non-executed exchange; exact replay is stable and mismatch is refused.

- [x] T011 [US2] Implement atomic deferred exchange persistence and replay guards in `src/server/construction-operating-assistant-r36c/deferred-exchange.ts`
- [x] T012 [US2] Map candidate decisions to truthful no-result replies in `src/server/construction-operating-assistant-r36c/orchestrator.ts`
- [x] T013 [US2] Prove restart-style reread, exact replay, mismatch refusal and zero external effect in `test/integration/construction-operating-assistant-r36c-unified-routing.itest.ts`
- [x] T014 [US2] Accept and render routing readiness without provider identity in `apps/mobile/src/lib/assistant.ts` and `apps/mobile/src/app/(app)/assistant.tsx`
- [x] T015 [US2] Prove mobile compatibility and provider/model non-disclosure in `apps/mobile/test/mobile-assistant-routing.test.ts`

## Phase 5: User Story 3 — Safe refusal and channel parity (P3)

**Goal**: Apply one fail-closed policy across every registered channel.

**Independent Test**: Equivalent inputs agree; restricted, mixed, unsupported and unauthorized requests create no consequential effect.

- [x] T016 [US3] Implement deterministic replies for clarification, refusal and available human support without creating work in `src/server/construction-operating-assistant-r36c/orchestrator.ts`
- [x] T017 [US3] Prove channel parity, restricted refusal, mixed clarification and client/provider-choice non-authority in `test/construction-operating-assistant-r36c-unified-routing.test.ts`
- [x] T018 [US3] Prove field-worker and cross-workspace refusal before persistence in `test/integration/construction-operating-assistant-r36c-unified-routing.itest.ts`

## Phase 6: Validation and Closeout

- [x] T019 Run R36C, R36A, R36B, R9, Model Gateway and mobile focused test gates from `specs/119-unified-assistant-routing/quickstart.md`
- [x] T020 Run typecheck, lint and `git diff --check`, verify no schema/lockfile/provider/network change, and record `specs/119-unified-assistant-routing/evidence/r36c-closeout.md`
- [ ] T021 Mark every task complete, close the R36C queue entry, refresh the autonomous proof, validate the queue/router and create one coherent local commit
- [ ] T022 Inspect and promote the next meaningful local critical-path release instead of requesting routine founder confirmation

## Dependencies & Execution Order

- Setup gates all work.
- Foundational contracts and RED tests precede implementation.
- US1 establishes the orchestrator used by US2 and US3.
- US2 persistence and US3 fail-closed behavior can be validated independently after US1.
- Closeout requires all three stories.

## Parallel Opportunities

- T003–T006 target distinct files and can be prepared independently.
- T013 and T015 target distinct PostgreSQL/mobile surfaces after their implementations.
- Focused regression suites may run concurrently once implementation is stable.

## Implementation Strategy

The minimal valuable slice is US1: the real assistant stops bypassing R36A. US2 then preserves the user's future-intelligence requests honestly. US3 closes policy bypasses before the feature is considered complete. No external provider is required for any phase.
