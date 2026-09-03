# Feature Specification: Provider Activation Controls R37B

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for autonomous local implementation
**Evidence label**: `INFERRED`; provider demand, quality and economics remain `UNKNOWN`.

## Problem Statement

R37A makes provider dispatch impossible. Before a later observed provider test can
safely exist, ENDVERA needs durable controls for explicit authorization, spending,
call count, expiry, revocation and a global kill switch. The denominator is every
future provider attempt admitted through the ENDVERA routing brain.

## User Scenarios & Testing

### User Story 1 — Bounded activation grant (Priority: P1)

An authorized operator can prepare a short-lived provider activation grant bound
to one candidate, exact model, synthetic case set and hard call/spend ceilings.

**Independent Test**: Missing role, workspace, model, ceiling, expiry or current
R37A fingerprint refuses without creating an executable grant.

### User Story 2 — Reserve and settle provider budget (Priority: P1)

Every simulated attempt must reserve integer microdollars before work and either
settle or release that reservation exactly once.

**Independent Test**: Concurrency, replay, over-budget settlement and unconfigured
ceilings fail closed in disposable PostgreSQL.

### User Story 3 — Revoke and kill safely (Priority: P1)

An authorized operator can revoke one grant or disable the entire provider lane.

**Independent Test**: Revocation and kill switch block later attempts immediately;
replay is idempotent and history remains reconstructible.

## Functional Requirements

- **FR-001**: Grants are versioned, workspace-scoped, role-checked, fingerprint-bound and short-lived.
- **FR-002**: Exact candidate/model, case allowlist, maximum calls and integer-microdollar ceiling are mandatory.
- **FR-003**: Missing or zero economic configuration refuses rather than allowing unlimited spend.
- **FR-004**: Reservation, settlement or release and audit are atomic and replay-safe.
- **FR-005**: Concurrent attempts cannot exceed call or spend ceilings.
- **FR-006**: Grant revocation and a global provider kill switch are immediate, durable and auditable.
- **FR-007**: Secret values never enter the grant, database, logs, errors or returned projections.
- **FR-008**: All local attempts remain synthetic and perform zero provider/network dispatch.
- **FR-009**: No customer/prospect data, public endpoint, automatic consumer or production activation is added.
- **FR-010**: R37A and R36C fail-closed behavior remains unchanged.

## Failure and Verification

Unknown grants, model drift, expired authorization, exhausted calls, exhausted
budget, revocation, kill switch, replay and concurrent oversubscription each have
an exact refusal. Verification uses disposable PostgreSQL transaction and
concurrency tests plus source guards proving zero provider transport.

## Economics

Provider price, customer price, demand and margin remain `UNKNOWN`. R37B tracks
integer microdollars only. It authorizes zero real spending.

## Explicit Exclusions

No credential resolver, provider client, network, actual spending, customer data,
SMS/email/voice send, OAuth, push, Preview, Production or deployment.

## Success Criteria

- **SC-001**: 100% of attempts require a valid unexpired grant and configured ceiling.
- **SC-002**: Concurrent synthetic reservations never exceed grant limits.
- **SC-003**: Replay creates no second reservation, settlement or release.
- **SC-004**: Revocation and kill switch refuse all later attempts.
- **SC-005**: Provider calls, external effects and persisted secret values remain zero.
