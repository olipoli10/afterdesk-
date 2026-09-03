# Feature Specification: Controlled Provider Orchestration R37C

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for autonomous local implementation
**Evidence label**: `INFERRED`; provider behavior and economics remain `UNKNOWN`.

## Problem Statement

ENDVERA has a sealed synthetic execution boundary and durable activation/budget
controls, but they are not yet one accountable lifecycle. A future provider
attempt must never execute before a reservation, lose its result after restart,
or leave money reserved after a known failure.

## User Scenarios & Testing

### User Story 1 — One controlled lifecycle (Priority: P1)

An authorized operator submits one sealed synthetic attempt. ENDVERA binds it to
the exact grant, reserves the full permitted amount, executes only the injected
transport-free adapter, stores the evidence and settles the measured amount.

**Independent Test**: One successful attempt creates one run, one reservation,
one terminal settlement and one immutable evidence result.

### User Story 2 — Safe failure and recovery (Priority: P1)

When validation or the injected adapter fails, ENDVERA records the failure and
releases the reservation exactly once. A process interruption can be reclaimed
after a bounded lease without inventing success.

**Independent Test**: Failure and simulated restart preserve the run, release
reserved value and permit only a safe synthetic reclaim.

### User Story 3 — Exact replay and concurrent exclusion (Priority: P1)

Repeated or concurrent submission of the same command cannot execute the
adapter twice. A completed replay returns the original stored evidence.

**Independent Test**: Concurrent duplicates produce one adapter invocation;
completed replay produces no new invocation or financial transition.

## Functional Requirements

- **FR-001**: Every run is workspace-, grant-, case-, model-, fingerprint- and idempotency-bound.
- **FR-002**: Execution cannot start until the matching positive reservation exists.
- **FR-003**: Only the R37A injected synthetic adapter is eligible; external transport remains impossible.
- **FR-004**: One durable lease prevents concurrent duplicate adapter invocation.
- **FR-005**: Success stores exact sealed evidence before returning and settles no more than reserved.
- **FR-006**: Known failure records a bounded error and releases the full reservation exactly once.
- **FR-007**: Completed replay returns the original evidence without invoking the adapter again.
- **FR-008**: Expired leases can be reclaimed only for transport-free synthetic runs.
- **FR-009**: Revoked grants and a disabled global lane refuse any run that has not started execution.
- **FR-010**: No credentials, provider client, network path, customer data, public route or automatic consumer is added.

## Key Entities

- **ControlledProviderRun**: Durable command, binding, lease, state, evidence and failure record.
- **ProviderSpendAttempt**: Existing R37B reservation and terminal financial state.
- **SealedSyntheticAttempt**: Existing R37A immutable execution input.

## Edge Cases

- Same idempotency key with changed sealed attempt refuses.
- A settlement interruption preserves evidence in `EVIDENCE_RECORDED` for exact resume.
- Lease owner mismatch cannot settle or release another worker's run.
- Revocation after a terminal result does not rewrite historical evidence.
- A failure while releasing remains visible and recoverable rather than reported complete.

## Assumptions

- Synthetic adapter calls are replay-safe because R37A structurally refuses external transport.
- Future real-provider execution will require a separate authority and a stronger provider-specific delivery contract.

## Success Criteria

- **SC-001**: 100% of successful runs have a prior matching reservation and one settlement.
- **SC-002**: 100 concurrent identical submissions invoke the synthetic adapter exactly once.
- **SC-003**: Completed replay creates zero new adapter calls or money transitions.
- **SC-004**: Known failures release 100% of their reservation exactly once.
- **SC-005**: Restart/reclaim tests preserve exact run binding and stored evidence.
- **SC-006**: Provider calls, network effects, credentials and real spend remain zero.

## Explicit Exclusions

No real provider, credential resolution, network, customer data, SMS/email/voice
send, OAuth, external write, spending, push, Preview, Production or deployment.
