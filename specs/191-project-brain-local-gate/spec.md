# Feature Specification: Project Brain Local Gate

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Draft ready for implementation

**Input**: `credential-free local gate proves intake, restart recovery, confirmation, assistant recall, mobile usability and zero external effects before provider work.`

## Problem Statement and Evidence

R36V–R36Y specify a local Project Brain chain from multi-source intake through deterministic candidates, explicit contradiction review, immutable sealing, confirmed-memory recall and prepared-unsent action creation. Passing isolated tests does not yet prove that these boundaries compose into one recoverable local workflow. R36Z must provide one deterministic credential-free gate using synthetic data, one integrated mobile journey and one machine-readable report. This gate is automated development evidence only; it cannot establish founder usability, customer value, provider behavior, market readiness or production readiness.

## User Scenarios & Testing

### User Story 1 - Exercise the complete local chain (Priority: P1)

As a maintainer, I run one command that builds a synthetic Project Brain from intake through cited assistant preparation and proves every expected canonical transition.

**Why this priority**: The release exists to prove integration rather than another isolated component.

**Independent Test**: Run the unique validator against a fresh disposable PostgreSQL database and verify one synthetic intake, candidate set, explicit contradiction/resolution, sealed understanding, confirmed-memory answer and `PREPARED_UNSENT` action.

**Acceptance Scenarios**:

1. **Given** a fresh disposable database and synthetic workspace/project/contact/material, **When** the gate runs, **Then** it admits multiple sources plus an owner brief through R36V and confirms the exact intake.
2. **Given** the confirmed intake, **When** the chain continues, **Then** R36W creates only deterministic provenance-bound unconfirmed candidates.
3. **Given** the candidate set, **When** the synthetic reviewer declares and resolves one contradiction and dispositions every candidate, **Then** R36X preserves the conflict and seals one exact immutable understanding.
4. **Given** the confirmed understanding, **When** R36Y recalls a supported field and prepares an allowlisted project action, **Then** the answer has complete citations and the action remains `PREPARED_UNSENT` with visible recipient, channel and body.
5. **Given** any failed prerequisite or assertion, **When** the validator completes, **Then** the gate reports failure and never skips, guesses or converts the missing proof into success.

---

### User Story 2 - Prove recovery and adversarial boundaries (Priority: P1)

As a maintainer, I can prove the complete canonical state survives restart and that replay, concurrency, role and tenant attacks do not alter or expose it.

**Why this priority**: A happy-path demo without recovery/isolation does not establish a trustworthy memory boundary.

**Independent Test**: Capture the canonical chain, restart server/database/mobile clients, compare exact projections, then run replay/concurrency/cross-tenant/role adversarial cases and verify fixed effect counts.

**Acceptance Scenarios**:

1. **Given** a completed local chain, **When** all application clients are recreated, **Then** intake, candidates, contradictions, resolution, confirmed understanding, recall citations and prepared action are canonical-byte equivalent.
2. **Given** every accepted command, **When** exact replays and bounded concurrent duplicates run, **Then** canonical effect counts do not increase.
3. **Given** body drift, stale versions/fingerprints or mixed upstream identities, **When** commands run, **Then** they refuse with no partial state.
4. **Given** a FIELD_WORKER, inactive user or second workspace/project, **When** protected reads/mutations are attempted, **Then** no Project Brain, contact, citation or action content/existence is disclosed.
5. **Given** raw-SQL guard tests from R36V–R36Y, **When** reciprocal/hash/immutability bypasses are attempted, **Then** each transaction refuses at commit.

---

### User Story 3 - Verify one-surface mobile usability honestly (Priority: P2)

As a maintainer, I verify that a user can traverse intake, review, recall and prepared-action inspection from one coherent project flow without copying technical identifiers.

**Why this priority**: The chain is not usable if its internal IDs become user workflow.

**Independent Test**: Drive the mobile UI with accessibility labels and visible project navigation, fail on any technical-ID field/copy step, and retain machine-readable interaction assertions.

**Acceptance Scenarios**:

1. **Given** a synthetic signed-in owner, **When** the project flow is driven, **Then** each next action is reachable from the same project experience using visible controls.
2. **Given** intake, review and assistant screens, **When** the journey advances, **Then** workspace/project/intake/snapshot/batch/candidate/contradiction IDs are resolved internally and never requested from the user.
3. **Given** the prepared action, **When** it is inspected, **Then** recipient, channel, complete body, citations, `PREPARED_UNSENT` and separate approval are visible.
4. **Given** automated UI success, **When** readiness is reported, **Then** it is labelled synthetic automated evidence and not founder/customer usability observation.

### Edge Cases

- The validator refuses a reused or non-empty database unless its disposable ownership marker matches the current run.
- A test skipped, filtered out, quarantined or reported pending counts as gate failure.
- A process restart must use a fresh process/client, not a remount of the same in-memory service object.
- Exact replay is historical; a new command deliberately bound to a newer confirmed snapshot is a distinct effect.
- Shared identical source bytes may reuse one canonical file while retaining distinct provenance counts required by R36V.
- The contradiction fixture MUST use two exact incompatible `OWNER_TEXT` assertions: `L’unique inspection finale est vendredi à 09 h.` copied from `ownerBrief.summary`, and `L’unique inspection finale est lundi à 09 h.` copied from `ownerBrief.importantDates`. Each candidate keeps its exact field/range provenance; the harness explicitly declares the conflict because R36W performs no contradiction detection. Both assertions and provenances remain visible after resolution and sealing.
- UI automation cannot fill hidden IDs or call domain services directly to claim mobile usability.
- Missing provider credentials is expected; presence of credentials/environment configuration must not activate a provider.
- Any network socket, provider import/call, binary AI interpretation, external transport/write, credential read or spend makes the gate fail.
- Cleanup stops/removes only the gate-owned disposable database, local processes and synthetic files.

## Requirements

### Functional Requirements

- **FR-001**: R36Z MUST expose one unique PowerShell validator that orchestrates all required checks and emits one machine-readable report plus one human closeout.
- **FR-002**: The validator MUST create/use only a uniquely named disposable local PostgreSQL database with an exact run ownership marker and MUST refuse shared, persistent or ambiguous targets.
- **FR-003**: Gate fixtures MUST be entirely synthetic and include two workspaces, two projects, authorized OWNER/OFFICE_MANAGER, FIELD_WORKER/inactive actors, one same-project contact, a multi-source intake and an explicit owner brief containing the exact incompatible `OWNER_TEXT` assertions and field provenances defined above.
- **FR-004**: The positive chain MUST execute R36V multi-source intake, exact review/confirmation, R36W candidate generation, R36X candidate disposition plus contradiction declaration/resolution/exact sealing, and R36Y confirmed recall plus one prepared action.
- **FR-005**: R36V assertions MUST verify exact tenant/project/source/hash/ordinal/brief binding, confirmed snapshot and binary limitations.
- **FR-006**: R36W assertions MUST verify exact-copy provenance, non-probabilistic confidence, unconfirmed status and zero binary understanding.
- **FR-007**: R36X assertions MUST verify harness-explicit (never auto-detected) contradiction declaration, complete dispositions, both exact incompatible values and provenances preserved after explicit resolution/seal, exact fingerprint/hash and one immutable confirmed understanding.
- **FR-008**: R36Y assertions MUST verify exact current R36X sequence/pointer selection, complete decision/candidate/source citations and one allowlisted `PREPARED_UNSENT` action with visible recipient/channel/body and separate approval.
- **FR-009**: Restart proof MUST recreate server/database clients and mobile durable state, then compare canonical serialized projections and exact effect counts before/after.
- **FR-010**: Exact replay and bounded concurrency tests MUST cover every consequential command family across R36V–R36Y and prove zero duplicate canonical effects.
- **FR-011**: Adversarial tests MUST cover body drift, stale versions/fingerprints/hashes, cross-workspace/project bindings, FIELD_WORKER/inactive roles and nonexistent resources with no protected disclosure or partial effect.
- **FR-012**: Existing fresh PostgreSQL raw-SQL guard tests for R36V–R36Y MUST run serialized and all append-only/update/delete/truncate/hash/reciprocity bypasses MUST refuse.
- **FR-013**: Mobile validation MUST drive one integrated project flow through public UI controls/accessibility selectors and MUST NOT inject/copy technical identifiers or bypass routes with direct service calls.
- **FR-014**: Mobile assertions MUST verify visible limitations, contradiction preservation/resolution controls, confirmed recall citations and prepared-action recipient/channel/body/status/approval boundary.
- **FR-015**: Provider/model/OCR/transcription/vision/document-understanding modules, credential readers, network clients, external transports/writes and spend paths MUST be instrumented with fail-fast sentinels and observe exactly zero reach.
- **FR-016**: Binary admission/signature validation MAY read bytes as required by R36V, but semantic binary AI/OCR/transcription/vision/document interpretation MUST remain exactly zero and separately measured.
- **FR-017**: The report MUST distinguish `CODE`, `TEST` and `SYNTHETIC` evidence and MUST state that `OBSERVED` founder/customer/provider evidence was not performed.
- **FR-018**: Every required assertion MUST have a stable ID, expected value, actual value, evidence path/command and status; tests may write only isolated run-owned fragments or JSON stdout, never the final report; missing/unknown/skipped assertions MUST fail the gate.
- **FR-019**: The report MUST include exact test counts/results, canonical entity/effect counts, restart comparison hashes, mutation results, external-effect counters, database ownership/cleanup status and dirty-path inventory without inventing Git SHAs.
- **FR-020**: The unique validator MUST own an exact fragment/assertion/mutation allowlist, reject duplicate/extra/missing fragments, aggregate them, complete owned cleanup, then finalize the report through a same-directory temporary file and atomic rename. It MUST validate the final schema and return non-zero unless all mandatory assertions pass, all mutations are restored byte-exactly and all cleanup postconditions are satisfied.
- **FR-021**: A proportional mutation matrix MUST cover one non-vacuous guard per critical truth, provenance, confirmation, replay, tenancy, role, restart, mobile and zero-effect invariant.
- **FR-022**: Required validation MUST include targeted suites, fresh serialized PostgreSQL tests, full root/mobile serialized suites, lint, typecheck, provider-boundary validation and Next.js Webpack build.
- **FR-023**: Gate execution MUST NOT mutate release/backlog/queue/Brain state or create a completion commit before all checks pass; reporting cannot broaden authority.
- **FR-024**: Cleanup MUST stop/remove only gate-owned local processes, database and synthetic temporary files and MUST record successful post-cleanup verification.
- **FR-025**: R36Z MUST NOT claim founder usability, customer value, product-market fit, provider functionality, signed/store readiness, Preview, Production, deployment or Verified-E2E observed coverage.

### Authorization and Tenancy

- Positive mutations run as synthetic authorized OWNER/OFFICE_MANAGER identities through real server boundaries.
- FIELD_WORKER, inactive and second-tenant fixtures are negative assertions only and receive no protected content.
- Test harness privileges may create fixtures/reset the disposable DB but may not substitute direct writes for positive product workflow effects.

### Data Classification and Retention

- All names, text, files, contacts, messages and credentials are synthetic; no customer/prospect data is permitted.
- The report stores hashes, counts, stable assertion IDs and redacted errors, not raw briefs, bodies, contact details or binary bytes.
- Gate-owned temporary data is removed after evidence capture; repository evidence retains only bounded synthetic/redacted results.

### Failure and Exception States

- `PASS`: all mandatory assertions/gates pass, zero forbidden effect is observed, mutations restore exactly and cleanup succeeds.
- `FAIL`: any assertion, test, mutation restoration, build or cleanup postcondition fails.
- `INVALID`: report/schema/ownership/evidence is incomplete, skipped, ambiguous or internally inconsistent.
- `URGENT_ASSISTANCE_REQUIRED`: only when safe local execution cannot continue without new authority or a non-disposable target; it is never converted to PASS.

### Economics

- Provider, network, external-write and spend ceilings are exactly zero.
- Local test runtime/resource use may be measured but is not production unit economics.
- Customer price, willingness to pay and contribution margin remain **UNKNOWN**.

### Verification, Delivery, Observability, Rollout and Rollback

- Verification is the gate itself plus independent report-schema validation and `git diff --check`.
- Delivery is a local credential-free gate and evidence packet only.
- Observability uses stable assertion/mutation IDs, commands, hashes and counters without raw protected content.
- Provider work may begin only under later separate authority; R36Z PASS does not authorize it.
- Rollback removes only gate artifacts/processes/database and restores each mutation byte-exactly.

### Key Entities

- **Local Gate Run**: One uniquely identified synthetic execution with owned resources and terminal state.
- **Gate Assertion**: Stable expected/actual/status/evidence record for one required invariant.
- **Gate Mutation Result**: Exact guard failure and restoration proof for one mutation.
- **External Effect Counter Set**: Zero-required counters for provider, credential, semantic binary, network, transport, write and spend reach.
- **Machine-readable Gate Report**: Strict aggregate consumed by the unique validator.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One validator command executes the complete synthetic R36V→R36Y chain and reports every mandatory assertion without skips or unknowns.
- **SC-002**: Exactly one confirmed intake, one deterministic candidate batch, the two exact incompatible `OWNER_TEXT` assertions with their field/range provenances, one harness-declared preserved-and-resolved contradiction, one confirmed understanding, one cited recall receipt and one `PREPARED_UNSENT` action exist for the positive scenario.
- **SC-003**: Canonical projections and effect counts are byte/hash equivalent before and after genuine server/database/mobile restart.
- **SC-004**: Exact/concurrent replay creates zero duplicate canonical effects across all consequential commands.
- **SC-005**: Cross-tenant/project, FIELD_WORKER/inactive and stale/body-drift attempts disclose zero protected fields and create zero canonical effects.
- **SC-006**: Mobile automation completes the integrated flow through visible controls with zero technical-ID copy/input step.
- **SC-007**: Provider/model calls, credential reads, semantic binary interpretation, network calls, external transports/writes and spend all equal zero.
- **SC-008**: Every required mutation fails non-vacuously at its named guard and is restored byte-exactly before the next mutation.
- **SC-009**: Targeted/serialized/full tests, lint, typecheck, provider boundary and Webpack build all pass with no skipped mandatory gate.
- **SC-010**: Tests write only isolated allowlisted fragments; after cleanup the validator atomically finalizes and validates the sole report, and evidence labels remain `TEST`/`SYNTHETIC` with founder/customer/provider `OBSERVED` explicitly absent.

## Assumptions

- R36V–R36Y implementations and their targeted tests are complete before this gate is implemented.
- Existing local test infrastructure can create fresh PostgreSQL databases and isolated server/mobile processes.
- Automated accessibility/UI behavior is not a substitute for founder-observed usability.
- Later provider work retains separate authority regardless of local gate outcome.
