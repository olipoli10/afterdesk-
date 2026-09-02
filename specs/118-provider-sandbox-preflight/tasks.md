# Tasks: ENDVERA Provider Sandbox Preflight R36B

**Input**: `specs/118-provider-sandbox-preflight/` design artifacts
**Execution**: Sequential; tests are required by the accepted specification.

## Phase 1 — Setup and foundation

- [x] T001 Create the isolated module structure in `src/lib/construction-operating-assistant-r36b/`.
- [x] T002 Define strict shared schemas and canonical fingerprint helpers in `src/lib/construction-operating-assistant-r36b/contracts.ts`.
- [x] T003 Define dated immutable candidate packets and closed model profiles in `src/lib/construction-operating-assistant-r36b/candidates.ts`.

## Phase 2 — User Story 1: exact candidate packets (P1)

**Independent test**: Every packet is strict, versioned, hash-bound, candidate-only and rejects unknown/missing fields.

- [x] T004 [US1] Add RED packet strictness, expiry, evidence and fingerprint tests in `test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts`.
- [x] T005 [US1] Implement packet validation, evidence expiry and deterministic sealing in `src/lib/construction-operating-assistant-r36b/candidates.ts`.

## Phase 3 — User Story 2: source-first public research (P1)

**Independent test**: Public company/professional research compiles and normalizes; private-person and invalid-source cases refuse.

- [x] T006 [US2] Add RED Perplexity plan, privacy and normalization tests in `test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts`.
- [x] T007 [US2] Implement bounded Perplexity Search plan compilation in `src/lib/construction-operating-assistant-r36b/perplexity.ts`.
- [x] T008 [US2] Implement strict source normalization and source-supported-claim verification in `src/lib/construction-operating-assistant-r36b/perplexity.ts`.

## Phase 4 — User Story 3: explicit controller route (P1)

**Independent test**: OpenRouter plans contain the exact internal profile/privacy/parameter/fallback constraints and no credential.

- [x] T009 [US3] Add RED OpenRouter privacy, exact-profile, unknown-profile and no-secret tests in `test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts`.
- [x] T010 [US3] Implement non-dispatchable OpenRouter plan compilation in `src/lib/construction-operating-assistant-r36b/openrouter.ts`.
- [x] T011 [US3] Implement weak-policy and unresolved-current-model refusal in `src/lib/construction-operating-assistant-r36b/openrouter.ts`.

## Phase 5 — User Story 4: comparable sandbox benchmark (P2)

**Independent test**: Equal synthetic observations seal deterministically; unequal facts/order/ceilings, unsupported claims and excess spend refuse.

- [x] T012 [US4] Add RED equality, verification, budget and replay tests in `test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts`.
- [x] T013 [US4] Implement equal-input candidate observation validation in `src/lib/construction-operating-assistant-r36b/benchmark.ts`.
- [x] T014 [US4] Implement deterministic `NO_PROVIDER_SELECTION` comparison reporting in `src/lib/construction-operating-assistant-r36b/benchmark.ts`.

## Phase 6 — User Story 5: exact R37 boundary (P2)

**Independent test**: The manifest contains only allowlisted secret-reference names, zero local calls, exact ceilings and `PREPARED_NOT_AUTHORIZED`.

- [x] T015 [US5] Add RED credential-like reference, call authorization and campaign ceiling tests in `test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts`.
- [x] T016 [US5] Implement the immutable R37 campaign manifest in `src/lib/construction-operating-assistant-r36b/campaign.ts`.

## Phase 7 — Cross-cutting closeout

- [x] T017 Add static no-network/no-environment/no-SDK and raw-report leakage tests in `test/construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts`.
- [x] T018 Run R36B, R36A and Model Gateway tests, typecheck, lint and `git diff --check` from `specs/118-provider-sandbox-preflight/quickstart.md`.
- [x] T019 Record exact local evidence and observed zero-dispatch boundary in `specs/118-provider-sandbox-preflight/evidence/r36b-closeout.md`.
- [x] T020 Reconcile the rolling queue and completion guard without claiming R37 or project completion in `specs/090-construction-operating-assistant-r10-r12-autonomous/CONTINUATION_QUEUE.json` and its proof artifacts.

## Dependencies

- T001–T003 block all user stories.
- US1 packet sealing blocks US2, US3 and US5.
- US2 and US3 block US4.
- US4 blocks US5 closeout evidence.
- T018–T020 run only after all implementation tasks pass.

## Completion criteria

All 20 tasks are checked, every accepted requirement is tested, no network/secret/provider access occurred, R36B reports only `SYNTHETIC` preparation, and the project-completion guard is re-evaluated honestly.
