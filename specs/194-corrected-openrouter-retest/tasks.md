# Tasks: Corrected OpenRouter Retest

## Phase 1 — Freeze authority and RED

- [x] T001 [US1] Freeze the one-campaign contract in `spec.md`, `plan.md`, `goal.md` and `contracts/openrouter-corrected-retest.md`
- [x] T002 [US2] Record the original report hash and separate evidence paths
- [x] T003 [US1] Capture non-vacuous failing tests in `evidence/red.md`

## Phase 2 — Corrected private transport

- [x] T004 [US1] Add the explicit corrected request version to `src/lib/construction-operating-assistant-r37/transport.ts`
- [x] T005 [US2] Add replay-refusing isolated runner `scripts/run-r37-corrected-openrouter-retest.ts`
- [x] T006 [US2] Add masked launcher and secret-free validator

## Phase 3 — Local preflight

- [x] T007 [US1] Pass targeted unit, boundary and disposable PostgreSQL tests
- [x] T008 [US2] Prove prior report immutability, no secret persistence and no preflight provider call
- [x] T009 [US3] Freeze queue/backlog authority and start the one campaign

## Phase 4 — Observed campaign and closeout

- [x] T010 [US1] Execute the corrected provider campaign exactly once
- [x] T011 [US3] Validate the sealed verdict, exact matrix/spend and cleanup
- [x] T012 [US3] Drain the release queue, commit locally and checkpoint the canonical Brain

## Stop criteria

- Prior report hash drift, ambiguous prior attempt or pre-existing corrected report.
- Credential cannot be entered privately or exchange evidence is invalid.
- Budget, customer-data, communication, external-write or deployment boundary cannot be proven.
- Any failure after dispatch seals REWORK and forbids retry.
