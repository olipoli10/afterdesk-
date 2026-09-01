# Feature Specification: ENDVERA Construction Operating Assistant R9 — Mobile Assistant

**Feature Branch**: `codex/endvera-construction-operating-assistant-r9-mobile-assistant`

**Created**: 2026-09-01

**Status**: Accepted for local implementation

**Input**: Continue automatically after R8 by making the persistent Construction Operating Assistant usable from the shared iOS/Android application, without another founder test or external provider.

## Problem Statement and Evidence

R8 provides secure mobile access and a role-shaped cockpit, but the user still cannot talk to ENDVERA from the native app. The repository already has a deterministic, PostgreSQL-backed assistant that understands agenda questions, appointments, reminders, rescheduling and prepared outbound messages. R9 closes only the mobile access gap. It does not claim that the workflow has customer value or market fit.

## User Scenarios & Testing

### User Story 1 — Ask and update from the phone (Priority: P1)

An owner or office manager writes a normal French request in the mobile app and receives the persisted result from ENDVERA.

**Independent Test**: Ask what is planned tomorrow, create an unambiguous appointment, then reload and prove both sides of the conversation and the resulting calendar state come from PostgreSQL.

**Acceptance Scenarios**:

1. **Given** an authenticated owner or office manager, **When** a supported request is submitted, **Then** the server derives the actor, interprets the request with the existing construction core, persists it, and returns the canonical result.
2. **Given** an ambiguous date, time, contact, project or appointment, **When** the request is submitted, **Then** ENDVERA asks a precise clarification and creates no consequential write.
3. **Given** a question about today or tomorrow, **When** ENDVERA answers, **Then** the answer is derived from the current PostgreSQL calendar rather than mobile memory.

---

### User Story 2 — Prepare, never silently send (Priority: P2)

An owner asks ENDVERA to text a contact and sees a durable draft that remains unsent.

**Independent Test**: Ask ENDVERA to text Marc, prove the response is `PREPARED_UNSENT`, reload the app, and prove zero transport occurred.

**Acceptance Scenarios**:

1. **Given** a resolvable contact and message, **When** the owner asks ENDVERA to text the contact, **Then** the server creates one prepared action and labels the response as not sent.
2. **Given** an incomplete or ambiguous recipient/body, **When** the request is submitted, **Then** ENDVERA asks for clarification and prepares nothing.
3. **Given** any R9 flow, **When** it completes, **Then** external transport remains false.

---

### User Story 3 — Recover safely from interruption (Priority: P3)

The user can retry an uncertain mobile request without creating a second canonical effect.

**Independent Test**: Simulate a timeout after dispatch, retry the exact same request identifier and payload, and prove the response is a replay with one canonical effect.

**Acceptance Scenarios**:

1. **Given** an unknown network outcome, **When** the user retries, **Then** the app reuses the exact request identifier, text and timestamp.
2. **Given** a replay, **When** the canonical response returns, **Then** the app labels it as recovered and does not show a duplicate result.
3. **Given** a field worker, revoked membership, cross-workspace identifier or malformed response, **When** assistant access is attempted, **Then** the request fails closed and exposes no conversation.

### Edge Cases

- The session expires after the assistant screen loads.
- Workspace role changes between history load and command submission.
- The server response has an unsupported version, unknown field or mismatched request identifier.
- A timeout occurs after the database commit but before the response reaches the device.
- Two users share a workspace; each must see only their own portal conversation.
- The user double taps Send.
- The assistant returns `PREPARED_UNSENT`, clarification or refusal.

## Requirements

### Functional Requirements

- **FR-001**: R9 MUST reuse the existing Construction Operating Assistant core and PostgreSQL records; it MUST NOT create a second chat engine or source of truth.
- **FR-002**: The mobile request MUST contain only a schema version, UUID request identifier, authorized workspace identifier, message and occurrence timestamp.
- **FR-003**: The server MUST derive the authenticated user and portal sender address; the client MUST NOT choose or impersonate either.
- **FR-004**: Only active owner and office-manager memberships MAY access the mobile assistant in R9.
- **FR-005**: Field-worker, cross-workspace, revoked, unauthenticated and unverified-user access MUST fail closed.
- **FR-006**: Portal authority MAY derive from the authenticated session only when the sender is exactly `user:<authenticated-user-id>`; SMS, email and voice identities MUST retain their verified communication-identity requirement.
- **FR-007**: The history endpoint MUST return only portal messages sent by or addressed to the authenticated user in the selected workspace.
- **FR-008**: All request, result and history payloads MUST be strict and schema-versioned.
- **FR-009**: The mobile client MUST reject a result whose command identifier differs from the submitted request identifier.
- **FR-010**: The app MUST render canonical persisted history and MUST NOT optimistically invent a completed assistant message or business effect.
- **FR-011**: An uncertain retry MUST reuse the exact request identifier, text, workspace and occurrence timestamp.
- **FR-012**: Repeated taps MUST NOT dispatch parallel attempts.
- **FR-013**: `PREPARED_UNSENT`, clarification, replay and unknown outcome MUST be visibly distinct.
- **FR-014**: R9 MUST perform zero SMS, email, call, calendar-provider, payment, push or other external transport.
- **FR-015**: The assistant history MUST remain in memory on the device and MUST NOT be written to general-purpose persistent storage.
- **FR-016**: Errors and logs MUST omit cookies, session tokens and unrestricted message bodies.

### Authorization and Data Classification

- Session identity and workspace membership are server-derived on every request.
- Assistant messages are **CONFIDENTIAL OPERATIONAL**.
- Session material remains **SECRET** in native secure storage.
- Synthetic local validation remains **SYNTHETIC** and is not customer evidence.

### Failure and Exception States

- `ASSISTANT_UNAVAILABLE`: current history cannot be established.
- `ASSISTANT_REFUSED`: authorization or supported-intent boundary refused the request.
- `CLARIFICATION_REQUIRED`: no consequential write was allowed.
- `PREPARED_UNSENT`: an outbound action exists but no delivery occurred.
- `ASSISTANT_OUTCOME_UNKNOWN`: dispatch may have reached the server; exact retry is available.
- `ASSISTANT_RESPONSE_INVALID`: the result cannot be trusted and is not rendered.

### Economics

R9 authorizes local compute and existing development dependencies only. No paid model, messaging, voice, calendar, store or deployment cost is authorized. Price, willingness to pay and contribution margin remain unknown.

### Verification, Delivery, Rollout, and Rollback

- Verify contracts, role authority, history isolation, replay, external-transport refusal, mobile typecheck/tests, Expo diagnostics, root regression and a disposable PostgreSQL path.
- Delivery is committed local code only. No push, Preview, Production, provider or store distribution.
- Rollback is exact reversion of R9; no migration or historical reinterpretation is introduced.

## Success Criteria

- **SC-001**: 100% of accepted mobile assistant requests derive actor identity on the server.
- **SC-002**: Owner and office-manager synthetic tests can query agenda, create a clear appointment, receive a clarification and prepare an unsent message through the existing core.
- **SC-003**: Field worker, cross-workspace, wrong sender and unverified non-portal identities have zero accepted effects.
- **SC-004**: A timeout retry produces one canonical effect and a replayed result.
- **SC-005**: Reloaded history is reconstructible from PostgreSQL and contains only the authenticated user's portal conversation.
- **SC-006**: Automated validation observes zero external transport.
- **SC-007**: One shared codebase passes static checks for both iOS and Android targets.

## Assumptions

- R8 authentication, bootstrap and cockpit contracts remain canonical.
- The deterministic R2 conversation core remains the only interpreter used in R9.
- Broader field-worker conversational permissions require a later, explicitly designed projection.

## Explicit Non-Goals

Live SMS, calls, voicemail, email, Google Calendar, QuickBooks, payments, push notifications, external AI providers, customer/prospect data, field-worker assistant writes, voice recording, offline message cache, app-store distribution, deployment, Preview, Production, market proof and Verified-E2E claims.
