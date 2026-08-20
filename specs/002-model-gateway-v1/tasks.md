# Tasks: Model Gateway v1

**Input**: Design documents from `/specs/002-model-gateway-v1/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Mandatory. Write each named test first, observe the RED for the intended reason, implement the smallest correction, then rerun GREEN. Persistence, concurrency, money and provider-boundary claims require disposable PostgreSQL or boundary-level evidence as specified.

**Organization**: Tasks are grouped by user story so each story can be completed and tested as an explicit increment. All work remains local until a separate release authorization.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on an incomplete task.
- **[Story]**: Maps the task to one user story in `spec.md`.
- Every task names the expected file path.

---

## Phase 1: Setup and Evidence Baseline

**Purpose**: Preserve the accepted codebase and make later claims reproducible.

- [X] T001 Record branch, HEAD, Git status, protected-worktree fingerprints, lockfile hash and disposable-PostgreSQL identity in `specs/002-model-gateway-v1/evidence/preflight.md`
- [X] T002 Run the existing lint, typecheck, fast suite and disposable-PostgreSQL integration baseline and record exact inherited results in `specs/002-model-gateway-v1/evidence/baseline.md`
- [X] T003 [P] Inventory every current provider-bound model call and its retry, usage, privacy and caller-result semantics in `specs/002-model-gateway-v1/evidence/provider-call-inventory.md`
- [X] T004 [P] Record the current classification prompt, model pin, output schema, failure mapping and caller-visible fixtures in `test/fixtures/model-gateway/classification-baseline.ts`
- [X] T005 [P] Add test support for deterministic provider fixtures and call counting in `test/support/model-gateway-provider.ts`
- [X] T006 Create the server-only module skeleton and explicit public exports in `src/server/model-gateway/index.ts` and `src/server/model-gateway/adapters/contract.ts`

**Checkpoint**: The baseline and current classification contract are reproducible before gateway behaviour exists.

---

## Phase 2: Foundational Contracts and Persistence

**Purpose**: Establish the closed types, durable schema and fail-closed primitives that block every story.

**CRITICAL**: No user-story implementation begins until T007–T020 are GREEN.

- [X] T007 [P] Write RED closed-world type and canonicalization tests in `test/model-gateway-types.test.ts`
- [X] T008 [P] Write RED registry tests for unknown operation, adapter, route and policy identifiers in `test/model-gateway-registry.test.ts`
- [X] T009 [P] Write RED content-redaction and protected-reference tests in `test/model-gateway-evidence.test.ts`
- [X] T010 Define closed operation, data, privacy, provider-error, refusal and terminal-result types in `src/server/model-gateway/types.ts`
- [X] T011 Implement canonical hashing and content-free evidence helpers in `src/server/model-gateway/evidence.ts`
- [X] T012 Implement the closed adapter and operation registries in `src/server/model-gateway/registry.ts`
- [X] T013 Write RED schema-presence, uniqueness, immutability and historical-meaning integration tests in `test/integration/model-gateway-immutability.itest.ts`
- [X] T014 Add `ModelGatewayPolicyVersion`, `ModelGatewayRouteProfile`, `ModelGatewayOperation`, `ModelGatewayDecision`, `ModelGatewayAttempt`, `ModelGatewayBreaker` and `ModelGatewayBreakerEvent` models to `prisma/schema.prisma`
- [X] T015 Add the optional unique gateway-attempt association to the existing spend-hold model in `prisma/schema.prisma`
- [X] T016 Create an additive versioned migration with constraints and triggers in `prisma/migrations/<timestamp>_model_gateway_v1/migration.sql`
- [X] T017 Apply the migration only to disposable PostgreSQL and observe the RED-to-GREEN invariant suite in `test/integration/model-gateway-immutability.itest.ts`
- [X] T018 [P] Add typed factories for policy, route, operation, decision and attempt rows in `test/support/model-gateway-db.ts`
- [X] T019 Implement transactional repository primitives for immutable bindings, decisions and attempts in `src/server/model-gateway/operations.ts`
- [X] T020 Run the foundational targeted tests and record exact migrations, RED causes and GREEN results in `specs/002-model-gateway-v1/evidence/foundation.md`

**Checkpoint**: Published facts are immutable; an attempt cannot exist without durable lineage.

---

## Phase 3: User Story 1 — One Policy-Compliant Classification (Priority: P1) MVP

**Goal**: Admit or refuse classification under one frozen policy, dispatch one exact route, verify its output and converge replay without an extra provider call.

**Independent Test**: Allowed fixtures produce one durable decision and one bounded attempt; refused fixtures dispatch zero calls; successful replay reuses the durable result.

### RED tests

- [x] T021 [P] [US1] Write RED pure admission tests for allowed, unknown, expired, contradictory and non-classification requests in `test/model-gateway-policy.test.ts`
- [x] T022 [P] [US1] Write RED adapter single-attempt, exact-pin and hidden-retry tests in `test/model-gateway-adapter-contract.test.ts`
- [x] T023 [P] [US1] Write RED output-contract tests for valid, malformed and semantically invalid classifications in `test/model-gateway-classification-contract.test.ts`
- [x] T024 [US1] Write RED disposable-PostgreSQL tests for durable pre-dispatch decision, hold-before-dispatch and replay convergence in `test/integration/model-gateway-admission.itest.ts`

### Implementation

- [x] T025 [P] [US1] Implement immutable request construction and minimum classification projection in `src/server/model-gateway/privacy.ts`
- [x] T026 [P] [US1] Implement published-policy and exact-route eligibility resolution in `src/server/model-gateway/policy.ts`
- [x] T027 [P] [US1] Implement a synthetic one-attempt adapter for deterministic boundary proof in `src/server/model-gateway/adapters/synthetic.ts`
- [x] T028 [US1] Implement transactional admission, decision persistence and refusal handling in `src/server/model-gateway/operations.ts`
- [x] T029 [US1] Implement one-attempt dispatch with immediate pre-dispatch eligibility recheck in `src/server/model-gateway/dispatch.ts`
- [x] T030 [US1] Implement certified classification output validation and terminal evidence binding in `src/server/model-gateway/evidence.ts`
- [x] T031 [US1] Integrate logical-operation claim, lease and fence semantics from `src/server/ai-operations.ts` into `src/server/model-gateway/operations.ts`
- [x] T032 [US1] Prove allowed/refused/replay scenarios end to end and record exact evidence in `specs/002-model-gateway-v1/evidence/us1-classification.md`

**Checkpoint**: Classification works through the synthetic boundary with rollout still disabled and no vendor selection.

---

## Phase 4: User Story 2 — Explicit Fallback and Spend Integrity (Priority: P1)

**Goal**: Classify provider outcomes honestly, retain ambiguous exposure and permit only separately authorized, cost-bounded fallback attempts.

**Independent Test**: Every supported failure class either stops or creates exactly the frozen next attempt with its own decision and reservation; ambiguous dispatch never releases or blindly replays.

### RED tests

- [x] T033 [P] [US2] Write RED normalized provider-error and fallback-eligibility tests in `test/model-gateway-fallback.test.ts`
- [x] T034 [P] [US2] Write RED adapter fixtures for refusal, rate limit, authentication, malformed request, provider 5xx, timeout and abort in `test/model-gateway-adapter-contract.test.ts`
- [x] T035 [US2] Write RED disposable-PostgreSQL reservation, settlement, release and uncertain-exposure tests in `test/integration/model-gateway-spend.itest.ts`
- [x] T036 [US2] Write RED concurrent fallback and total logical-ceiling tests in `test/integration/model-gateway-fallback.itest.ts`

### Implementation

- [x] T037 [P] [US2] Extend normalized provider error classes without changing existing caller semantics in `src/lib/ai-work-engine/provider-error.ts`
- [x] T038 [US2] Implement frozen fallback evaluation and new-attempt authorization in `src/server/model-gateway/policy.ts`
- [x] T039 [US2] Integrate conservative per-attempt reservation with the existing account-spend authority in `src/server/model-gateway/dispatch.ts` and `src/server/account-spend.ts`
- [x] T040 [US2] Implement conclusive settlement, conclusive non-dispatch release and dispatched-unknown retention in `src/server/model-gateway/operations.ts`
- [x] T041 [US2] Enforce total primary-plus-fallback exposure below the immutable logical ceiling in `src/server/model-gateway/operations.ts`
- [x] T042 [US2] Add operator-readable attempt/fallback/refusal lineage projection in `src/server/model-gateway/evidence.ts`
- [x] T043 [US2] Prove named mutations `gateway-dispatch-without-hold`, `gateway-releases-ambiguous-spend` and `gateway-silent-route-substitution`, restore byte-exactly, and record results in `specs/002-model-gateway-v1/evidence/us2-fallback-spend.md`

**Checkpoint**: No hidden retry, unbounded fallback or fabricated zero-cost outcome remains possible.

---

## Phase 5: User Story 3 — Operator Breakers and Safe Stop (Priority: P1)

**Goal**: Let authorized operators stop unsafe/expensive new dispatch immediately while preserving in-flight attempt meaning.

**Independent Test**: Open/close/revoke each supported scope around admission and dispatch; new work stops, admitted work rechecks, dispatched work reconciles under its frozen route.

### RED tests

- [ ] T044 [P] [US3] Write RED pure breaker-scope, generation and authorization tests in `test/model-gateway-breakers.test.ts`
- [ ] T045 [US3] Write RED disposable-PostgreSQL CAS, stale-generation and append-only event tests in `test/integration/model-gateway-breaker.itest.ts`
- [ ] T046 [US3] Write RED race tests for breaker opening between admission and dispatch in `test/integration/model-gateway-admission.itest.ts`

### Implementation

- [ ] T047 [US3] Implement route, model, provider and policy breaker resolution in `src/server/model-gateway/breakers.ts`
- [ ] T048 [US3] Implement generation-fenced breaker transitions and append-only events in `src/server/model-gateway/breakers.ts`
- [ ] T049 [US3] Implement admin-only breaker and certification actions with point-of-use authorization in `src/server/actions/admin-model-gateway.ts`
- [ ] T050 [US3] Recheck current breaker generation immediately before external dispatch in `src/server/model-gateway/dispatch.ts`
- [ ] T051 [US3] Preserve frozen identity and reconcile responses that arrive after a breaker opens in `src/server/model-gateway/operations.ts`
- [ ] T052 [US3] Prove named mutation `gateway-stale-breaker-generation-wins`, restore byte-exactly, and record stop/resume evidence in `specs/002-model-gateway-v1/evidence/us3-breakers.md`

**Checkpoint**: Operators have an audited hard stop; already-dispatched work is never silently rerouted.

---

## Phase 6: User Story 4 — Exact-Route Privacy Proof (Priority: P2)

**Goal**: Prove which exact route may receive each data class and form only the minimum authorized outbound projection.

**Independent Test**: Cross every data class with current, expired, mismatched and uncertified route evidence; inspect the outbound projection and prove secrets/unrelated tenant data never leave.

### RED tests

- [ ] T053 [P] [US4] Write RED route-profile certification, expiry, endpoint/model scope and privacy-posture tests in `test/model-gateway-privacy.test.ts`
- [ ] T054 [P] [US4] Write RED credential, raw-content, prompt-injection and unrelated-context projection tests in `test/model-gateway-projection.test.ts`
- [ ] T055 [US4] Write RED disposable-PostgreSQL cross-tenant binding and historical-evidence tests in `test/integration/model-gateway-privacy.itest.ts`

### Implementation

- [ ] T056 [US4] Implement exact path/model/endpoint privacy evidence matching and expiry refusal in `src/server/model-gateway/privacy.ts`
- [ ] T057 [US4] Implement closed data-class reach comparison and minimum outbound projection in `src/server/model-gateway/privacy.ts`
- [ ] T058 [US4] Isolate credential lookup to the certified route/environment after admission in `src/server/model-gateway/dispatch.ts`
- [ ] T059 [US4] Enforce tenant-consistent operation, task, content, policy and spend bindings in `src/server/model-gateway/operations.ts`
- [ ] T060 [US4] Prove named mutation `gateway-cross-tenant-binding`, restore byte-exactly, and record privacy matrix evidence in `specs/002-model-gateway-v1/evidence/us4-privacy.md`

**Checkpoint**: Privacy claims are exact-path, expiring and reconstructable; no provider-wide slogan authorizes dispatch.

---

## Phase 7: User Story 5 — Direct-Provider Escape Hatch and Parity (Priority: P2)

**Goal**: Move the current direct classification call behind the same contract and compare it honestly with a gateway-mediated candidate without adopting either route.

**Independent Test**: Run identical certified fixtures through synthetic, direct and authorized candidate adapters; expose route-specific differences while preserving classification caller semantics.

### RED tests

- [ ] T061 [P] [US5] Extend the shared conformance harness for direct and gateway-mediated path kinds in `test/support/model-gateway-conformance.ts`
- [ ] T062 [P] [US5] Write RED compatibility tests against the frozen classification baseline in `test/model-gateway-classification-compat.test.ts`
- [ ] T063 [P] [US5] Write RED tests proving a gateway outage cannot construct an implicit direct bypass in `test/model-gateway-fallback.test.ts`

### Implementation

- [ ] T064 [US5] Wrap the existing Anthropic classification client as a one-attempt adapter with SDK retries disabled in `src/server/model-gateway/adapters/anthropic-direct.ts`
- [ ] T065 [US5] Refactor `src/lib/ai-work-engine/classify.ts` to preserve prompt, model pin, schema and caller semantics while dispatching through the certified direct adapter
- [ ] T066 [US5] Implement a vendor-neutral gateway-mediated conformance adapter seam using existing platform primitives in `src/server/model-gateway/adapters/gateway-candidate.ts`
- [ ] T067 [US5] Run route-separated synthetic/direct/candidate conformance without enabling rollout and record all UNKNOWN dimensions in `specs/002-model-gateway-v1/evidence/us5-conformance.md`
- [ ] T068 [US5] Prove named mutation `gateway-silent-route-substitution`, restore byte-exactly, and confirm the current direct path remains independently usable in `test/model-gateway-adapter-contract.test.ts`

**Checkpoint**: The direct escape hatch has parity; a candidate conformance pass is not an adoption or production decision.

---

## Phase 8: User Story 6 — Content-Free Audit Reconstruction (Priority: P2)

**Goal**: Reconstruct admission, route, attempts, cost, breakers and final disposition without exposing sensitive request or response content.

**Independent Test**: Reconstruct successful, refused, fallback, ambiguous and breaker-open operations from authorized evidence alone; scan ordinary logs/events for secrets and raw content.

### RED tests

- [ ] T069 [P] [US6] Write RED audit-event vocabulary, required-field and content-ban tests in `test/model-gateway-audit.test.ts`
- [ ] T070 [P] [US6] Write RED reconciliation projection tests for successful, refused, fallback, ambiguous and breaker-open operations in `test/model-gateway-reconstruction.test.ts`
- [ ] T071 [US6] Write RED fail-closed audit-persistence and replay-convergence integration tests in `test/integration/model-gateway-replay.itest.ts`

### Implementation

- [ ] T072 [US6] Implement the typed content-free event vocabulary in `src/server/model-gateway/evidence.ts`
- [ ] T073 [US6] Write admission, policy, decision, attempt, breaker, spend and replay events at their authoritative transaction boundaries in `src/server/model-gateway/operations.ts` and `src/server/model-gateway/breakers.ts`
- [ ] T074 [US6] Implement authorized audit reconstruction and provider-invoice correlation projections in `src/server/model-gateway/evidence.ts`
- [ ] T075 [US6] Prove named mutation `gateway-replay-dispatches-twice`, restore byte-exactly, and record reconstruction/redaction evidence in `specs/002-model-gateway-v1/evidence/us6-audit.md`

**Checkpoint**: Every provider decision is reconstructable, and ordinary evidence remains content-free.

---

## Phase 9: Rollout Controls, Hardening and Local Release Candidate

**Purpose**: Integrate the stories without enabling a provider migration or production rollout.

- [ ] T076 [P] Write RED environment hard-disable and unpublished-policy rollout tests in `test/model-gateway-rollout.test.ts`
- [ ] T077 Implement the default-closed environment hard-disable and classification policy gate in `src/server/model-gateway/dispatch.ts`
- [ ] T078 Implement zero-dispatch shadow policy comparison for the current classification route in `src/server/model-gateway/policy.ts`
- [ ] T079 Add bounded admin projections for policies, profiles, breakers and attempt evidence in `src/server/actions/admin-model-gateway.ts`
- [ ] T080 Run all eight required named mutations, verify successful test/build execution for each mutation, and restore every source byte-exactly as recorded in `specs/002-model-gateway-v1/evidence/mutations.md`
- [ ] T081 Run lint, typecheck, complete fast suite and disposable-PostgreSQL integration on pristine source and record exact results in `specs/002-model-gateway-v1/evidence/final-gates.md`
- [ ] T082 Run the production-like build only against the proven disposable database, verify applied migrations, and record output in `specs/002-model-gateway-v1/evidence/final-gates.md`
- [ ] T083 Verify lockfile, protected worktrees, remote state and absence of Preview/Production actions in `specs/002-model-gateway-v1/evidence/final-fingerprints.md`
- [ ] T084 Validate every scenario in `specs/002-model-gateway-v1/quickstart.md` and reconcile discrepancies in `specs/002-model-gateway-v1/evidence/quickstart-validation.md`
- [ ] T085 Complete the constitution and threat-boundary review, naming remaining UNKNOWNs and any route not yet certified, in `specs/002-model-gateway-v1/evidence/constitution-review.md`
- [ ] T086 Create coherent local commits, checkpoint `C:\dev\afterdesk-project-brain\CURRENT_STATE.md`, `C:\dev\afterdesk-project-brain\HANDOFF.md` and `C:\dev\afterdesk-project-brain\spec-manifest\README.md` without overwriting concurrent ENDVERA decisions, and STOP with rollout disabled and no candidate adopted

---

## Dependencies and Execution Order

### Phase dependencies

- **Phase 1** has no implementation dependency.
- **Phase 2** depends on Phase 1 and blocks all user stories.
- **US1** depends on Phase 2 and is the smallest independently demonstrable boundary.
- **US2** depends on US1 because fallback extends the one-attempt operation.
- **US3** depends on US1; it may be developed beside US2 after the pre-dispatch boundary is stable.
- **US4** depends on Phase 2 and must be GREEN before any real route is certified.
- **US5** depends on US1, US2 and US4 because direct parity includes fallback, accounting and privacy obligations.
- **US6** depends on US1–US4 authoritative transaction points; its pure schemas may begin earlier but reconstruction cannot close early.
- **Phase 9** depends on every selected story and is the only local-release checkpoint.

### User-story dependency graph

```text
Setup -> Foundation -> US1 classification
                         |-> US2 fallback/spend ----|
                         |-> US3 breakers ----------|-> US5 direct parity -> Final gates
Foundation -> US4 privacy --------------------------|
US1 + US2 + US3 + US4 -> US6 audit -----------------|
```

### Within each story

1. Write the named tests.
2. Observe the intended RED and record its cause.
3. Implement closed types/models before services.
4. Implement services before caller integration or admin surfaces.
5. Run targeted GREEN tests.
6. Run relevant disposable-PostgreSQL tests.
7. Kill and restore named mutations where assigned.
8. Commit only a coherent, independently truthful increment.

---

## Parallel Opportunities

- T003, T004 and T005 can run together after T001.
- T007, T008 and T009 can run together; T013 can be prepared independently before schema implementation.
- Within US1, policy, adapter and output-contract RED tests are independent.
- After US1, US2 error normalization, US3 breaker pure tests and US4 privacy pure tests can proceed in parallel in distinct files.
- US5 conformance harness and classification baseline compatibility tests can be authored in parallel before adapter implementation.
- US6 audit schemas and reconstruction fixtures can be authored in parallel after authoritative event points are known.

## Parallel Example: User Story 2

```text
Task: T033 normalized provider-error and fallback-eligibility RED tests
Task: T034 adapter failure fixtures and hidden-retry RED tests
Task: T035 disposable-PostgreSQL spend-state RED tests
```

## Parallel Example: User Story 4

```text
Task: T053 exact-route privacy certification RED tests
Task: T054 minimum-projection and secret-exclusion RED tests
Task: T055 cross-tenant and historical-evidence integration RED tests
```

---

## Implementation Strategy

### First bounded implementation block

1. Complete T001–T006 (baseline and skeleton).
2. Complete T007–T020 (closed contracts and real persistence).
3. Run the Phase 2 checkpoint and STOP if any DB invariant is unproven.

This is intentionally a multi-hour logical block. It produces a durable foundation but makes no provider call and enables no rollout.

### MVP boundary

1. Complete the first bounded block.
2. Complete T021–T032 (US1 classification through the synthetic boundary).
3. Validate allowed/refused/replay behaviour independently.
4. Keep production rollout hard-disabled.

### Incremental delivery

1. Add US2 fallback/spend integrity.
2. Add US3 breakers and US4 exact-route privacy.
3. Add US5 direct parity only after those controls pass.
4. Add US6 audit reconstruction.
5. Finish Phase 9 and produce a LOCAL ONLY release candidate.

## Notes

- `SYNTHETIC` conformance is never `OBSERVED` production evidence.
- No task adopts Anthropic, Vercel AI Gateway, Portkey, Cloudflare or another candidate.
- Engineering Factory and AfterDesk-DevBench are a separate feature.
- No task authorizes `npm install`, `prisma db push`, a shared database, Preview or Production.
- If a gateway candidate requires a package or secret, stop at T066/T067 for a separate bake-off authorization rather than widening this feature silently.
