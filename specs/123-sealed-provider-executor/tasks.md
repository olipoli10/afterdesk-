# Tasks: ENDVERA Sealed Provider Executor R37A

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, contract and R36B source

## Phase 1 — Contract foundation

- [x] T001 Document the synthetic-only scope and no-dispatch design in `specs/123-sealed-provider-executor/`.
- [x] T002 [US1] Add RED tests for strict R36B binding, expiry, privacy and direct-controller refusals in `test/construction-operating-assistant-r37a-sealed-executor.test.ts`.
- [x] T003 [US1] Implement sealed authorization/request schemas in `src/lib/construction-operating-assistant-r37a/contracts.ts`.

## Phase 2 — Synthetic execution

- [x] T004 [US2] Add RED tests for adapter limits, no-external-transport proof and credential-free serialization in `test/construction-operating-assistant-r37a-sealed-executor.test.ts`.
- [x] T005 [US2] Implement server-only synthetic attempt sealing and execution in `src/server/construction-operating-assistant-r37a/sealed-executor.ts`.

## Phase 3 — Activation boundary and regression

- [x] T006 [US3] Add tests proving observed execution, secret-shaped input and automatic transport are refused.
- [x] T007 [US3] Implement the explicit observed-authority refusal with no HTTP route or consumer.
- [x] T008 Run Spec Kit analysis and resolve any contradiction.
- [ ] T009 Run targeted R37A, R36B and R36C tests; then typecheck, lint and `git diff --check`.
- [ ] T010 Update autonomous backlog/queue/proof to record R37A local completion and leave external R37 deferred.
