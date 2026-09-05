# Tasks: R37B OpenRouter ZDR Compatibility Correction

## Phase 1 — Specification and evidence

- [x] T001 [US1] Freeze the local-only scope and immutable R37 boundary in `spec.md`, `plan.md` and `goal.md`
- [x] T002 [US1] Record current official model, endpoint, ZDR and routing evidence in `research.md`
- [ ] T003 [US1] Capture the bounded public endpoint snapshot in `evidence/openrouter-endpoint-eligibility-2026-09-05.json`

## Phase 2 — RED

- [ ] T004 [US1] Add failing model-existence, ZDR compatibility and R37-seal tests
- [ ] T005 [US2] Add failing corrected-request and privacy mutation tests
- [ ] T006 [US3] Capture non-vacuous RED evidence in `evidence/red.md`

## Phase 3 — Implementation

- [ ] T007 [US1] Implement strict public metadata and compatibility schemas in `src/lib/construction-operating-assistant-r37bb/contracts.ts`
- [ ] T008 [US2] Implement the corrected request builder using `max_completion_tokens`
- [ ] T009 [US3] Implement a credential-free local completion validator

## Phase 4 — Validation and closeout

- [ ] T010 [US1] Prove both model slugs exist and have at least one compatible ZDR endpoint
- [ ] T011 [US2] Kill incompatible parameter, privacy weakening, fallback and stale/malformed metadata mutations
- [ ] T012 [US3] Prove zero provider generation calls, zero spend and byte-exact R37 report preservation
- [ ] T013 [US3] Run targeted tests, provider boundary, lint, typecheck and `git diff --check`
- [ ] T014 [US3] Drain the local R37B queue, commit locally and checkpoint the canonical Brain

## Stop criteria

- The sealed R37 report hash changes.
- A credential or provider generation call becomes necessary.
- No compliant endpoint remains for either model.
- Customer data, external communication/write, spending, push, Preview, Production or deployment becomes necessary.
