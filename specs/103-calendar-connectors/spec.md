# Feature Specification: Permissioned Calendar Connector Foundation

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Feature**: `specs/103-calendar-connectors`
**Status**: Draft for local implementation

## Outcome

Extend ENDVERA's existing Google Calendar preparation foundation into one
provider-neutral Google and Microsoft Calendar connector cockpit. R23 must make
the complete authorization, read, prepare-write, conflict, revocation and
recovery contract executable locally while every real credential, OAuth
redirect and provider request remains disabled.

## User Scenarios and Testing

### User Story 1 — Inspect and prepare least-privilege access (P1)

An owner or office manager sees Google and Microsoft Calendar separately,
chooses read-only or read/write access, and prepares an exact consent plan.
ENDVERA shows the requested capabilities and missing activation prerequisites;
it never claims that a prepared account is connected.

**Independent test**: concurrent and replayed commands create one account and
one immutable operation for the selected provider. Unknown providers, excessive
scopes, members, field workers, stale versions and cross-workspace requests are
refused.

### User Story 2 — Prepare deterministic calendar synchronization (P2)

For a synthetically connected test account, ENDVERA can build provider-native
read and write envelopes from canonical calendar state. The envelope includes
the exact scope, canonical fingerprint, conflict precondition and notification
policy, but no token and no transport capability.

**Independent test**: Google and Microsoft adapters produce deterministic
requests, classify stale cursors and authorization failures consistently, and
refuse a write when the canonical item or provider precondition has changed.

### User Story 3 — Revoke immediately and recover safely (P3)

An owner or office manager can revoke local access for one provider. Revocation
clears every active scope and opaque secret reference, invalidates prepared
work, preserves immutable history and never calls the provider. Recovery after
restart shows the same revoked state and no background sync starts.

**Independent test**: concurrent revocation and replay converge to one local
transition. Post-revocation read/write preparation fails, other providers and
workspaces are unaffected, and the mobile cockpit reconstructs exactly.

## Functional Requirements

- **FR-001**: The system MUST support `google_calendar` and
  `microsoft_calendar` through one provider-neutral contract.
- **FR-002**: Provider, workspace, mode, command identity and state version MUST
  be explicit and closed-world.
- **FR-003**: Read-only and read/write grants MUST request the minimum provider
  scopes defined by a versioned local registry.
- **FR-004**: Only an active owner or admin MAY prepare or revoke a connector.
- **FR-005**: A prepared connector MUST remain distinct from a connected one.
- **FR-006**: No credential, authorization code, refresh token, access token,
  raw sync token or secret-store value MAY enter API, audit or mobile state.
- **FR-007**: Provider request builders MUST be deterministic, scope-gated,
  precondition-aware and notification-suppressed by default.
- **FR-008**: R23 MUST retain `externalTransportPerformed=false` for every
  operation and MUST expose no executable provider client.
- **FR-009**: Calendar write preparation MUST bind the canonical item
  fingerprint and the expected remote precondition.
- **FR-010**: Stale cursor, stale remote precondition, authorization failure,
  throttling and provider outage MUST map to explicit non-destructive states.
- **FR-011**: Exact retries MUST return the retained result; changed-content
  reuse MUST fail without a partial effect.
- **FR-012**: Local revocation MUST immediately disable grants and clear opaque
  credential and cursor references.
- **FR-013**: Field workers and outsiders MUST receive no connector-management
  projection and no connector economics or secret metadata.
- **FR-014**: Google and Microsoft states MUST remain independent inside the
  same workspace.
- **FR-015**: The shared iOS/Android application MUST expose status, scopes,
  prepare and local-revoke controls with protected restart-safe commands.
- **FR-016**: No automatic sync consumer, OAuth redirect, provider SDK, network
  call, customer data, deployment or store action is permitted in R23.

## Success Criteria

- **SC-001**: Two providers parse through one strict projection and command
  contract with zero unknown fields accepted.
- **SC-002**: Concurrent prepare/revoke tests retain exactly one canonical
  operation per command and provider.
- **SC-003**: Google and Microsoft request builders pass deterministic
  read/write/precondition and response-classification tests.
- **SC-004**: Every observed operation reports zero external transport.
- **SC-005**: Revocation survives a fresh PostgreSQL connection and prevents
  further request preparation.
- **SC-006**: Field and cross-workspace projections are empty or refused.
- **SC-007**: Mobile commands survive restart with byte-identical identity and
  are never automatically dispatched.
- **SC-008**: Root/mobile tests, lint, typecheck, fresh migration replay and the
  local Webpack build pass without lockfile drift.

## Explicit Non-goals

- Real Google or Microsoft credentials, OAuth, consent screens or callbacks.
- Real provider read/write traffic or a background synchronization worker.
- Customer calendars or external event identifiers.
- SMS, voice, email, accounting, push, Preview, Production, EAS or stores.
- Claims of provider readiness, customer value, production readiness or
  Verified-E2E coverage.
