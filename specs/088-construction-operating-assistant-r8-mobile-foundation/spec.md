# Feature Specification: ENDVERA Construction Operating Assistant R8 — Mobile Foundation

**Feature Branch**: `codex/endvera-construction-operating-assistant-r8-mobile-foundation`

**Created**: 2026-09-01

**Status**: Accepted for local implementation

**Input**: Continue the accepted ENDVERA Construction Operating Assistant direction by building the first shared iOS/Android application foundation without another founder test or external provider.

## Problem Statement and Evidence

ENDVERA already exposes a versioned construction cockpit and bounded commands, but it has no native mobile client. The target denominator is small-contractor owners, office managers, and field workers who need to inspect and advance maintained operational state from a phone. Market frequency and willingness to pay for this exact client remain **UNKNOWN**; R8 is selected as an incremental product foundation, not as market proof. Evidence source: accepted R7 contracts and founder direction recorded on 2026-09-01.

## User Scenarios & Testing

### User Story 1 - Secure mobile access (Priority: P1)

An existing ENDVERA user signs in from an iPhone or Android phone and reaches only workspaces authorized by the server.

**Why this priority**: No mobile surface is useful if identity, session storage, and tenant selection are unsafe.

**Independent Test**: Sign in against a local server, restart the app, confirm the session is restored from native secure storage, then confirm an invalid or revoked session returns to sign-in.

**Acceptance Scenarios**:

1. **Given** valid local credentials, **When** the user signs in, **Then** the server establishes the identity and the mobile client securely retains only the session material required for later authenticated requests.
2. **Given** an unauthenticated, invalid, or revoked session, **When** a protected screen or API is requested, **Then** the client exposes no cockpit data and returns to sign-in.
3. **Given** multiple workspace memberships, **When** the bootstrap loads, **Then** only active memberships are listed and the role comes from server state.

---

### User Story 2 - Role-shaped pocket cockpit (Priority: P2)

An owner or office manager sees projects, appointments, open loops, receivables, and prepared actions. A field worker sees only the operational subset allowed by the server projection.

**Why this priority**: The mobile app must render maintained operational state, not become a second database or a decorative shell.

**Independent Test**: Feed owner and field-worker cockpit fixtures through the mobile parser and screens, then prove financial fields and message payloads never appear in the field-worker rendering tree.

**Acceptance Scenarios**:

1. **Given** an owner projection, **When** the cockpit loads, **Then** the user can inspect current projects, calendar items, open loops, receivables, and prepared actions.
2. **Given** a field-worker projection, **When** the cockpit loads, **Then** money, invoice references, message bodies, payload hashes, and action payloads are absent rather than merely hidden.
3. **Given** a network failure, **When** a refresh fails, **Then** the client clearly reports that live state is unavailable and does not present a stale snapshot as current.

---

### User Story 3 - Bounded operational commands (Priority: P3)

An authorized owner or office manager records a receivable, records a payment, or schedules a follow-up from the phone using the same R7 command contract and approval boundaries as the web application.

**Why this priority**: Mobile must move maintained work forward while preserving the existing server as the only authority.

**Independent Test**: Submit each command to a synthetic local API adapter, verify strict versioned envelopes and idempotency keys, and prove unsupported, stale, offline, or field-worker writes are refused before any external effect.

**Acceptance Scenarios**:

1. **Given** an authorized role and valid input, **When** a command is confirmed, **Then** the mobile client sends exactly one strict R7 envelope and renders the canonical server response.
2. **Given** a duplicate retry, **When** the same idempotency material is reused, **Then** the client accepts the replay response without representing a second effect.
3. **Given** a field worker, unsupported API version, offline state, or malformed response, **When** a write is attempted, **Then** the command fails closed and no optimistic canonical state is invented.

### Edge Cases

- The configured API URL is absent, malformed, or insecure outside local development.
- A session expires between bootstrap and cockpit retrieval.
- A membership is removed while the selected workspace is open.
- The server returns a newer schema version or extra fields.
- A user changes roles between refreshes.
- A request times out after reaching the server, leaving the client uncertain whether it was applied.
- The device is offline or switches networks during a command.
- Secure storage is unavailable or rejects a write.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide one shared native application codebase for supported iOS and Android devices.
- **FR-002**: The mobile client MUST authenticate through the existing ENDVERA identity system and MUST NOT implement an independent identity database.
- **FR-003**: Session cookies and session cache MUST use platform-protected secure storage; passwords MUST NOT be persisted by ENDVERA mobile code.
- **FR-004**: Protected navigation MUST refuse access while session state is unknown, absent, invalid, or revoked.
- **FR-005**: A versioned bootstrap endpoint MUST return only active construction workspaces derived from authenticated memberships.
- **FR-006**: The client MUST consume the R7 cockpit as canonical state and MUST NOT create an independent mobile source of truth.
- **FR-007**: Every decoded bootstrap, cockpit, and command response MUST enforce the supported schema version and required shape before display.
- **FR-008**: Field-worker views MUST omit money, invoice references, communication bodies, payload hashes, and action payloads from their accepted data shape and rendering.
- **FR-009**: The client MUST expose explicit loading, signed-out, unavailable, refused, conflict, and unsupported-version states.
- **FR-010**: The client MUST NOT persist cockpit financial or communication payloads in unencrypted general-purpose storage.
- **FR-011**: The client MUST NOT claim stale state is current; a failed refresh MUST identify live state as unavailable.
- **FR-012**: Mobile commands MUST use strict R7 envelopes, unique request/idempotency material, and server-returned canonical results.
- **FR-013**: The client MUST NOT optimistically mark a command complete before the server confirms it.
- **FR-014**: Write controls MUST be unavailable to roles whose server permissions prohibit the operation.
- **FR-015**: R8 MUST perform zero SMS, email, call, payment, calendar-provider, push-notification, or other external transport.
- **FR-016**: Logs and user-visible errors MUST exclude passwords, cookies, raw session tokens, and unrestricted response bodies.
- **FR-017**: The mobile foundation MUST support local development configuration without embedding a production URL or credential.
- **FR-018**: Sign-out MUST clear the mobile session and protected screen state.

### Authorization and Data Classification

- Identity and membership are server-derived at every protected request.
- Session material is **SECRET** and remains in native secure storage.
- Owner/office-manager cockpit data is **CONFIDENTIAL OPERATIONAL**, including financials.
- Field-worker cockpit data is **RESTRICTED ROLE-SCOPED OPERATIONAL** and is produced by the server projection.
- Synthetic local fixtures are **SYNTHETIC** evidence only.

### Failure and Exception States

- `SIGNED_OUT`: no authenticated session is available.
- `SESSION_INVALID`: the server rejects the retained session; local protected state is cleared.
- `NETWORK_UNAVAILABLE`: current canonical state cannot be established.
- `UNSUPPORTED_API`: the response version is not supported; data is not rendered.
- `ACCESS_REVOKED`: the selected workspace is no longer authorized.
- `COMMAND_CONFLICT`: canonical state changed or command preconditions failed.
- `COMMAND_OUTCOME_UNKNOWN`: transport ended after dispatch without a parseable response; retry uses the same idempotency material.

### Economics

R8 authorizes local development dependencies and local compute only. No paid build, provider, store submission, SMS, voice, email, calendar, payment, or AI usage is authorized. Price, contribution margin, and mobile willingness to pay remain **UNKNOWN**.

### Verification, Delivery, Rollout, and Rollback

- Verification consists of contract/unit tests, TypeScript checks, Expo dependency diagnostics, root regression gates, and a local bundle/static render where supported.
- Delivery is local committed code only; no Preview, Production, store build, deployment, or push.
- Rollout is disabled by default and requires an explicit local API URL.
- Rollback is exact removal/reversion of the R8 commit; R8 introduces no database migration or historical reinterpretation.
- Observability is limited to bounded status/error categories and request identifiers; secrets and raw payloads are never logged.

### Key Entities

- **Mobile Session**: secure client-held cookie/session cache representing an existing server session.
- **Workspace Summary**: server-derived membership, role, locale, timezone, and active workspace identity.
- **Cockpit Snapshot**: one schema-versioned response containing role-shaped canonical operational state.
- **Mobile Command Attempt**: request identifier, idempotency material, command type, pending/result state, and bounded public error category.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One codebase passes static validation for both iOS and Android targets.
- **SC-002**: 100% of protected mobile routes refuse access without a valid session.
- **SC-003**: 100% of workspace choices come from authenticated active memberships.
- **SC-004**: Field-worker fixture tests find zero financial or communication-payload fields in accepted and rendered data.
- **SC-005**: Unsupported response versions, malformed payloads, revoked access, and offline writes produce zero invented canonical effects.
- **SC-006**: Each supported command has a deterministic retry path using unchanged idempotency material after an unknown transport outcome.
- **SC-007**: Automated checks observe zero external provider or transport invocation.
- **SC-008**: A developer can configure, typecheck, test, and start the local mobile application from the documented quickstart without production credentials.

## Assumptions

- R7 remains the canonical API and PostgreSQL remains the canonical operational store.
- R8 targets the stable Expo SDK current on 2026-09-01 and its supported OS floors.
- Users have connectivity when they need current operational or financial state; sensitive offline cockpit persistence is deferred until an encrypted design is accepted.
- Email/password is sufficient for local mobile authentication; OAuth providers and account creation are outside R8.
- The local API is reachable from the emulator/device through a developer-supplied URL.

## Explicit Non-Goals

Live customer or prospect data; SMS, calls, voicemail, email, Google Calendar, QuickBooks, payments, push notifications, background tasks, biometric authorization, offline writes, offline sensitive-state cache, App Store/TestFlight/Play distribution, EAS services, deployment, Preview, Production, and any claim of customer value or Verified-E2E coverage.
