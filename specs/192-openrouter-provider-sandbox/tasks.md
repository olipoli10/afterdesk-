# Tasks: R37 OpenRouter Provider Sandbox

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/openrouter-provider-sandbox.md`

**Tests**: Required. Provider, credential, money, replay and evidence boundaries use test-first RED plus mutation proof.

## Phase 1: Setup and authority

- [x] T001 [US1] Freeze the exact OpenRouter-only founder authority, 10 CAD ceiling and stricter 5 USD ceiling in `specs/192-openrouter-provider-sandbox/spec.md`
- [x] T002 [US1] Record the dated official routing, privacy, usage, model-price and exchange evidence in `specs/192-openrouter-provider-sandbox/research.md`
- [x] T003 [US1] Materialize the autonomous goal and queue-backed chapters in `specs/192-openrouter-provider-sandbox/goal.md` and `specs/192-openrouter-provider-sandbox/LONG_RUN_PROGRAM.json`
- [x] T004 [US1] Register R37 as the active release in `specs/090-prepared-action-inspection/PROJECT_BACKLOG.json` and `specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json`

## Phase 2: Foundational RED and closed-world contracts

- [x] T005 [US1] Write failing contract, authority, budget and credential tests in `test/construction-operating-assistant-r37-openrouter-sandbox.test.ts`
- [x] T006 [US1] Capture the non-vacuous initial failure in `specs/192-openrouter-provider-sandbox/evidence/red.md`
- [x] T007 [US1] Implement strict authority, binding, request, response, cost and report schemas in `src/lib/construction-operating-assistant-r37/contracts.ts`
- [x] T008 [US3] Freeze the equal three-case synthetic matrix in `src/lib/construction-operating-assistant-r37/cases.ts`
- [x] T009 [US3] Implement deterministic contract and fact-grounding verification in `src/lib/construction-operating-assistant-r37/oracle.ts`

## Phase 3: User Story 1 — fail-closed preflight

**Goal**: Prove no network or spend can occur without the exact authority, fresh exchange evidence, allowlisted model/case and process-local credential.

**Independent Test**: With the key absent, the runner returns `CREDENTIAL_REQUIRED`, performs zero fetches and leaves the provider lane disabled.

- [x] T010 [US1] Implement key-presence-only preflight and exact error codes in `src/lib/construction-operating-assistant-r37/contracts.ts`
- [x] T011 [US1] Add wrong provider, host, path, model, case, privacy, call-count, exchange and spend refusal coverage in `test/construction-operating-assistant-r37-openrouter-sandbox.test.ts`
- [x] T012 [US1] Produce and validate `specs/192-openrouter-provider-sandbox/evidence/credential-free-preflight.json`

## Phase 4: User Story 2 — private OpenRouter transport

**Goal**: Dispatch one sealed request only to the exact OpenRouter endpoint and normalize cost-bearing evidence without exposing the key.

**Independent Test**: An injected fetch proves exact URL/options/payload, strict normalization, timeout/body cap and no credential in any returned error or evidence.

- [x] T013 [US2] Write failing exact transport, response normalization, timeout and secret-redaction tests in `test/construction-operating-assistant-r37-openrouter-sandbox.test.ts`
- [x] T014 [US2] Implement the exact private transport in `src/lib/construction-operating-assistant-r37/transport.ts`
- [x] T015 [US2] Amend the provider-boundary policy to allow network and secret access only in the exact private R37 transport and retain public/transitive refusal
- [x] T016 [US2] Run and pass `npm run validate:provider-boundary` plus targeted security tests

## Phase 5: User Story 3 — durable equal bake-off

**Goal**: Execute at most six equal synthetic calls with durable reserve-before-dispatch and deterministic adjudication.

**Independent Test**: Fresh PostgreSQL proves one reservation/dispatch/result per attempt, replay and concurrency refusal, upward-rounded cost settlement and complete revocation.

- [x] T017 [US3] Write failing disposable PostgreSQL tests in `test/integration/construction-operating-assistant-r37-openrouter-sandbox.itest.ts`
- [x] T018 [US3] Implement durable campaign orchestration in `src/server/construction-operating-assistant-r37/campaign.ts`
- [x] T019 [US3] Implement the private CLI runner in `scripts/run-r37-openrouter-sandbox.ts` without any key argument
- [x] T020 [US3] Prove equal-input fingerprints, complete/incomplete matrix behavior and recommendation refusal rules

## Phase 6: User Story 4 — mutations, revocation and closeout

**Goal**: Demonstrate that every meaningful weakening fails, restores exactly, and that success/failure always revokes grants and disables the lane.

**Independent Test**: Mutation and cleanup validators reconcile report, ledger, cost, replay and credential hygiene.

- [x] T021 [US4] Implement `specs/192-openrouter-provider-sandbox/scripts/validate-r37-openrouter-sandbox.ps1` with presence-only credential inspection and structural forbidden-field scanning
- [x] T022 [US4] Execute and record mutations for fixture-as-observed, wrong host/model, privacy weakening, fallback, over-budget, replay redispatch, missing cost, model drift and secret leakage in `specs/192-openrouter-provider-sandbox/evidence/mutations.md`
- [x] T023 [US4] Validate cleanup on success, refusal and thrown transport failure
- [x] T024 [US4] Run the credential-free preflight and seal its bounded report

## Phase 7: Observed execution and project closure

- [ ] T025 [US2] If the local key exists, execute exactly the six-call OpenRouter matrix once and write `specs/192-openrouter-provider-sandbox/evidence/observed-provider-report.json`; otherwise leave `CREDENTIAL_REQUIRED`
- [ ] T026 [US4] Reconcile provider-reported cost, local ledger, call count, replay count, grants and lane state
- [ ] T027 [US4] Run targeted tests, PostgreSQL integration, provider boundary, lint, typecheck, serialized full suite and `git diff --check`
- [ ] T028 [US4] Complete `specs/192-openrouter-provider-sandbox/LONG_RUN_PROGRAM.json` only from observed evidence and validate with `-RequireComplete`
- [ ] T029 [US4] Create useful local commits, drain the R37 queue and checkpoint the canonical Brain without changing unsupported dashboard metrics
- [ ] T030 [US4] Revoke campaign grants, disable the lane, stop only the disposable database/processes and prove both repositories tracked-clean

## Dependencies and execution order

- T001–T004 establish authority and routing state.
- T005 must fail before T007–T010 implement the closed-world contracts.
- T013 must fail before T014–T016 introduce the only network/secret boundary.
- T017 must fail before T018–T020 implement durable execution.
- T021–T024 are mandatory before any paid call.
- T025 is the only credential-dependent task. Its absence does not block T001–T024.
- T026–T030 require an actual observed run; fixtures cannot close the observed denominator.

## Stop criteria

- Stop immediately for secret exposure, non-synthetic data, another provider, external effect, budget/authority drift or an ambiguous previously dispatched attempt.
- Do not stop for routine confirmation. If T025 alone is blocked by the absent local key, report exactly `CREDENTIAL_REQUIRED`, keep execution disabled and let the 3-minute heartbeat watch only boolean key presence.
