# Tasks: ENDVERA AI Routing Brain R36A

## Phase 1 — Setup

- [x] T001 Create strict R36A request and decision contracts in src/lib/construction-operating-assistant-r36a/contracts.ts
- [x] T002 Create the candidate-only capability and route catalogue in src/lib/construction-operating-assistant-r36a/registry.ts

## Phase 2 — Foundational safety

- [x] T003 [P] Add channel-neutral conservative intent classification in src/lib/construction-operating-assistant-r36a/classifier.ts
- [x] T004 [P] Add public-professional research safety classification in src/lib/construction-operating-assistant-r36a/classifier.ts
- [x] T005 Add fail-closed policy eligibility and deterministic fingerprinting in src/lib/construction-operating-assistant-r36a/router.ts

## Phase 3 — User Story 1: hidden orchestration

- [x] T006 [US1] Route canonical state, calendar and communication requests to internal capabilities in src/lib/construction-operating-assistant-r36a/router.ts
- [x] T007 [US1] Refuse unknown or mixed consequential requests in src/lib/construction-operating-assistant-r36a/router.ts

## Phase 4 — User Story 2: specialized research

- [x] T008 [US2] Prepare citation-required specialist research candidates in src/lib/construction-operating-assistant-r36a/router.ts
- [x] T009 [US2] Refuse restricted-person research before route selection in src/lib/construction-operating-assistant-r36a/router.ts

## Phase 5 — User Story 3: best certified controller

- [x] T010 [US3] Resolve version-pinned controller candidates by policy, privacy, budget and availability in src/lib/construction-operating-assistant-r36a/router.ts
- [x] T011 [US3] Keep OpenRouter, direct-model and Perplexity candidates non-dispatchable in src/lib/construction-operating-assistant-r36a/registry.ts

## Phase 6 — User Story 4: bounded fallback

- [x] T012 [US4] Implement explicit candidate fallback and bounded human handoff in src/lib/construction-operating-assistant-r36a/router.ts
- [x] T013 [US4] Add the server-only Model Gateway planning facade in src/server/model-gateway/assistant-routing.ts

## Phase 7 — User Story 5: audit and privacy

- [x] T014 [US5] Emit content-free reconstructible decision projections in src/server/model-gateway/assistant-routing.ts
- [x] T015 [US5] Add comprehensive RED and acceptance tests in test/construction-operating-assistant-r36a-ai-routing-brain.test.ts

## Phase 8 — Closure

- [ ] T016 Run R36A, existing Model Gateway and R36 regressions and record results in specs/117-ai-routing-brain/evidence/r36a-closeout.md
- [ ] T017 Run typecheck, lint, diff, lockfile, provider and secret gates and update specs/117-ai-routing-brain/evidence/spec-kit-analysis.md
- [ ] T018 Commit R36A and update the rolling queue/backlog so R37 depends on R36A in specs/090-prepared-action-inspection

## Dependencies

T001-T002 → T003-T005 → T006-T011 → T012-T014 → T015-T018.

## Independent validation

- US1: internal state/tool selection without model choice.
- US2: cited public research prepared; restricted research refused.
- US3: versioned eligible controller selected without dispatch.
- US4: explicit fallback or bounded human handoff only.
- US5: stable hashes and zero raw content.
