# Tasks: Construction Assistant V1 R2 Founder Observation

## Phase 1 — Setup and contract

- [x] T001 Record immutable Brain/source/lockfile fingerprints in `specs/078-construction-assistant-v1-r2-founder-observed-loop/evidence/admission.json`
- [x] T002 Materialize and admit `specs/078-construction-assistant-v1-r2-founder-observed-loop/LONG_RUN_PROGRAM.json`
- [x] T003 Add closed observation/control schemas in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/observation-contract.ts`
- [x] T004 Add non-vacuous RED guards in `test/construction-assistant-v1-r2-observed-contract.test.ts`

## Phase 2 — Foundational local environment

- [x] T005 Create the loopback-only founder guide in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/founder-observation-server.ts`
- [x] T006 Create disposable environment orchestration in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/start-founder-test.ps1`
- [x] T007 Create the synthetic account/dossier seed in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/prepare-founder-test.ts`
- [x] T008 Create preflight validation in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/validate-founder-test-preflight.ps1`

## Phase 3 — US1 Fair comparison

- [x] T009 [US1] Freeze exact ordered inputs in `specs/078-construction-assistant-v1-r2-founder-observed-loop/fixtures/equal-input-sequence.json`
- [x] T010 [US1] Implement the stateless control in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/stateless-control.ts`
- [x] T011 [US1] Prove equal facts/order/reference time in `test/construction-assistant-v1-r2-observed-control.test.ts`

## Phase 4 — US2 Founder observation

- [x] T012 [US2] Run the single real founder session and create `specs/078-construction-assistant-v1-r2-founder-observed-loop/evidence/founder-observation.json`
- [x] T013 [US2] Extract database-backed technical measurements in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/measure-session.ts`
- [x] T014 [US2] Validate founder identity, completeness and seal in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/validate-founder-observation.ps1`

## Phase 5 — US3 Adjudication and closeout

- [x] T015 [US3] Implement frozen verdict guards in `specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/adjudicate.ts`
- [x] T016 [US3] Produce control/result/dashboard evidence under `specs/078-construction-assistant-v1-r2-founder-observed-loop/evidence/`
- [x] T017 [US3] Correct only a reproduced bounded product defect if required and add an exact regression test
- [ ] T018 [US3] Run proportional final gates and `git diff --check`
- [ ] T019 [US3] Complete manifest, create local commits and checkpoint `C:/dev/afterdesk-project-brain`

## Dependencies

T001–T004 block the environment. T005–T011 block the real observation. T012–T014 require Olivier's one session. T015–T019 require sealed founder evidence. T017 is skipped rather than committed when no product defect exists.

## MVP

The minimum valid result is the full US1–US3 chain. An automated dry run without T012 is not founder-observed evidence.
