# Feature Specification: R37 Controller Contract Alignment

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-05

**Status**: Accepted

**Input**: Correct the local controller contract defect revealed by the sealed R37 retest without another provider call and without changing the observed REWORK result.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive an answer permitted by the task (Priority: P1)

The evaluation case permits an answer from known state when it explicitly asks whether a file is ready to invoice.

**Why this priority**: The sealed run showed that a grounded answer was rejected only because the case allowed clarification but asked for a decision.

**Independent Test**: Evaluate the case contract and confirm that `ANSWER_FROM_STATE` is permitted while unsupported external actions remain forbidden.

**Acceptance Scenarios**:

1. **Given** the invoice-readiness facts, **When** the controller answers from those facts, **Then** the capability is allowed.
2. **Given** the same facts, **When** an external action is proposed, **Then** it remains refused.

---

### User Story 2 - See the complete evaluation contract (Priority: P1)

The bounded controller receives the allowed capabilities and required limitations alongside the task and facts.

**Why this priority**: A hidden requirement cannot honestly evaluate whether the model follows it.

**Independent Test**: Inspect the locally built request and confirm that both fields are present and exact for every frozen case.

**Acceptance Scenarios**:

1. **Given** any frozen case, **When** its request is built, **Then** its exact allowed capabilities and expected limitations are included.
2. **Given** the corrected request, **When** no provider credential exists, **Then** it can still be validated locally without dispatch.

---

### User Story 3 - Preserve observed history (Priority: P1)

The founder can trust that the failed provider observation remains byte-identical and its verdict remains REWORK.

**Why this priority**: A local correction is not evidence that the paid provider campaign passed.

**Independent Test**: Verify the sealed report hash and its original verdict and reason codes after the correction.

**Acceptance Scenarios**:

1. **Given** the sealed R37 report, **When** the local correction completes, **Then** its bytes and REWORK verdict are unchanged.
2. **Given** no new authority, **When** validation runs, **Then** zero provider calls and zero spend occur.

### Edge Cases

- A future case asks for an answer but omits that capability: contract tests fail.
- A limitation contains different casing: the exact case value is still serialized.
- Historical evidence is edited: the immutable-hash gate fails.
- A developer attempts to treat local tests as observed provider evidence: the release remains locally corrected only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The invoice-readiness case MUST permit answering from its supplied state.
- **FR-002**: Every corrected request MUST include the exact allowed capabilities and expected limitations of its case.
- **FR-003**: The system MUST retain the existing strict structured-output, zero-retention and no-fallback controls.
- **FR-004**: The sealed R37 provider report MUST remain byte-identical and MUST retain its REWORK verdict.
- **FR-005**: This correction MUST perform zero provider calls, incur zero additional spend and require no credential.
- **FR-006**: The correction MUST NOT authorize communication, external writes, deployment, Preview or Production.
- **FR-007**: Validation MUST prove both the semantic alignment and historical immutability.

### Key Entities

- **Evaluation Case Contract**: Frozen facts, task, allowed capabilities, answer evidence and expected limitations.
- **Corrected Controller Request**: Local representation of the exact contract shown to a bounded model.
- **Historical Provider Report**: Immutable observed evidence whose original failure remains authoritative.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three frozen cases expose 100% of their allowed capabilities and expected limitations in their local request.
- **SC-002**: A grounded invoice-readiness answer using `ANSWER_FROM_STATE` no longer fails the capability rule.
- **SC-003**: The corrected-retest report SHA-256 remains `0f94e15c69c32fc1ac7c2162ce0460ea93c6cc581864826d46879dd160ac5649`, the original R37 report remains `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3`, and both verdicts remain REWORK.
- **SC-004**: Provider dispatch count and additional provider spend are both zero.
- **SC-005**: Targeted tests, type checking and provider-boundary validation pass.

## Assumptions

- `ANSWER_FROM_STATE` is the least-privilege capability matching a task that asks for a decision from supplied facts.
- Expected limitations are part of the model-visible run contract, not secret oracle answers.
- The historical provider output may be re-evaluated locally for diagnosis, but that result cannot replace its sealed oracle or verdict.
