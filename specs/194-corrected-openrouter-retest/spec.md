# Feature Specification: Corrected OpenRouter Retest

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-05

**Status**: Accepted

**Input**: One founder-authorized corrected R37 retest with OpenRouter, synthetic data only, an additional ceiling of 10 CAD, one new local secret never displayed or committed, and no client, SMS, call, deployment, Preview or Production.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run one corrected bounded campaign (Priority: P1)

The founder can authorize exactly one corrected evaluation campaign and receive a truthful PASS or REWORK verdict from the frozen two-model, three-case synthetic matrix.

**Why this priority**: The earlier run failed before producing a canonical observation; only one separately sealed retest can establish whether the corrected request works.

**Independent Test**: A disposable campaign either records six grounded observations or stops on the first failure, then revokes every grant and disables the provider lane.

**Acceptance Scenarios**:

1. **Given** a fresh local credential and valid exchange evidence, **When** the campaign runs, **Then** no more than six paid calls occur and total authorized exposure remains below 10 CAD.
2. **Given** any provider, schema, oracle, evidence or budget failure, **When** it occurs, **Then** the campaign returns REWORK without retry and performs cleanup.

---

### User Story 2 - Preserve historical evidence and secret hygiene (Priority: P1)

The founder can trust that the failed R37 report keeps its original meaning and that the new credential never enters source control, reports or logs.

**Why this priority**: A successful retest cannot rewrite the first observed failure or leak the credential used to obtain new evidence.

**Independent Test**: Hash the old report before and after, scan new artifacts for credential material, and verify only boolean credential presence is persisted.

**Acceptance Scenarios**:

1. **Given** the sealed R37 report, **When** the corrected retest completes, **Then** its SHA-256 remains `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3`.
2. **Given** the local credential, **When** preflight and execution evidence are written, **Then** no credential value or authorization header appears.

---

### User Story 3 - Close the campaign without external side effects (Priority: P2)

The founder receives one final adjudication and the temporary database, provider grants and lane are closed without external communications or deployment.

**Why this priority**: Provider observation is useful only if the authority remains narrow and cleanup is independently verifiable.

**Independent Test**: Validate the sealed report, disposable database cleanup, zero external messages/writes, and a drained continuation queue.

**Acceptance Scenarios**:

1. **Given** either allowed verdict, **When** closeout runs, **Then** all campaign grants are revoked, the provider lane is disabled and the disposable database is removed.
2. **Given** campaign completion, **When** the queue is drained, **Then** no second retest can start from the same campaign entry.

### Edge Cases

- Missing, malformed or old credential: refuse before any provider dispatch.
- Expired exchange evidence: refuse before spend.
- Previous corrected report already exists: refuse replay rather than overwrite it.
- Provider HTTP error, timeout, incompatible response, model drift or missing cost: seal REWORK after the first failed dispatch.
- Evidence write or cleanup failure: record REWORK and do not claim closure.
- Attempt or campaign cost over the stricter local ceiling: refuse or stop without further dispatch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST run at most one corrected retest campaign and MUST refuse report overwrite or campaign replay.
- **FR-002**: The campaign MUST use exactly `openai/gpt-5.4` and `openai/gpt-5.4-mini` against the three frozen synthetic R37 cases.
- **FR-003**: Every corrected request MUST require strict structured output and zero-data-retention routing, MUST disable fallbacks, and MUST omit incompatible legacy parameters.
- **FR-004**: The campaign MUST stop on the first failed call or failed oracle and MUST NOT retry it.
- **FR-005**: The campaign MUST reserve and settle provider spend durably and MUST remain below both the existing 5 USD application ceiling and the authorized 10 CAD ceiling.
- **FR-006**: The credential MUST remain local and ephemeral; only its presence MAY be recorded.
- **FR-007**: The original R37 report MUST remain byte-identical.
- **FR-008**: Every outcome MUST revoke grants, disable the provider lane and remove the disposable database before closeout.
- **FR-009**: The campaign MUST perform zero client/prospect processing, real communication, external tool write, deployment, Preview or Production action.
- **FR-010**: PASS MUST require six canonical observations, six passed oracles, no failure code, exact cleanup and no side effect; every other completed outcome MUST be REWORK.
- **FR-011**: A new key entered for this campaign MUST never be echoed, logged, stored in evidence or committed.
- **FR-012**: The final record MUST separately report roadmap state, local build readiness, C2 state, provider/customer-test readiness and Verified-E2E coverage without inflating any rubric.

### Key Entities

- **Corrected Retest Campaign**: One immutable authorization, exact matrix, ceilings, prior-report hash and final verdict.
- **Provider Observation**: One synthetic case/model output, grounding oracle, usage, cost, latency and fingerprint.
- **Activation Grant**: Temporary model-specific authority with bounded calls and spend, revoked at closeout.
- **Preflight Record**: Secret-free readiness facts including credential presence, exchange validity, request version and immutable-history proof.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The campaign dispatches between one and six calls exactly once and never retries a failed attempt.
- **SC-002**: PASS contains exactly six canonical grounded observations and zero failure codes; otherwise the verdict is REWORK.
- **SC-003**: Total settled spend is at most 5 USD and its proven CAD conversion is below 10 CAD.
- **SC-004**: The original report hash is identical before and after the campaign.
- **SC-005**: One hundred percent of grants are revoked, the provider lane is disabled and the disposable database is removed.
- **SC-006**: Credential scans find zero secret values or authorization headers in source, Git diff and evidence.
- **SC-007**: External communications, customer data use, external tool writes and deployment actions all remain zero.

## Assumptions

- The user will enter one newly generated OpenRouter key through a masked local prompt if no valid key is already available to the campaign process.
- The existing frozen R37 synthetic cases and oracle remain the accepted evaluation denominator.
- The existing 5 USD application ceiling is stricter than the newly authorized 10 CAD ceiling and remains binding.
- A provider or model incompatibility is a legitimate REWORK result, not authority to change the matrix or perform another retest.
