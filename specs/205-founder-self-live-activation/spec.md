# Feature Specification: Founder self live activation

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-05

**Status**: Implementation

**Input**: Olivier will be ENDVERA's first real user. He needs a genuinely installable iOS and Android app, explicit access to his chosen contacts and calendars, and a dedicated ENDVERA phone number that can receive and place real SMS and calls.

## User Scenarios & Testing

### User Story 1 - Install and grant useful device access (Priority: P1)

As Olivier, I install ENDVERA on my phone and independently grant access to contacts and calendars so the assistant can use only the information I chose.

**Why this priority**: The first real product loop cannot exist through a browser mock or Expo Go alone.

**Independent Test**: Install a signed internal build on a physical phone, open the activation centre, grant one permission, refuse another, and observe the two distinct states without disclosing data.

**Acceptance Scenarios**:

1. **Given** the signed app is installed, **When** Olivier grants contacts access, **Then** ENDVERA reports the native permission as granted without uploading contact values.
2. **Given** calendar access is not granted, **When** Olivier refuses it, **Then** ENDVERA remains usable and explains how to retry later.
3. **Given** a permission was granted, **When** Olivier revokes it in system settings, **Then** the activation centre detects the revoked state on refresh.

---

### User Story 2 - Reach a dedicated ENDVERA number (Priority: P1)

As Olivier, I text or call one dedicated ENDVERA number and receive a response from the assistant without giving the app access to unrelated personal SMS or call history.

**Why this priority**: The dedicated number is the product's lowest-friction entry channel and must be real before the self pilot is represented as live.

**Independent Test**: From Olivier's authorized phone, send one bounded test SMS and place one bounded test call to the provisioned number; verify authenticated admission, one canonical request per provider message/call identifier, and the resulting audit trail.

**Acceptance Scenarios**:

1. **Given** a provisioned ENDVERA number and verified founder identity, **When** Olivier sends one SMS, **Then** exactly one canonical inbound request is admitted.
2. **Given** an unknown or revoked sender, **When** a message or call arrives, **Then** no protected workspace data is disclosed.
3. **Given** a duplicate provider identifier, **When** the provider retries delivery, **Then** no duplicate canonical effect is created.

---

### User Story 3 - Use calendar and contacts through explicit authority (Priority: P2)

As Olivier, I ask ENDVERA about my schedule or a selected contact and approve an exact calendar or communication action when a write is needed.

**Why this priority**: This turns the channel into a secretary instead of a generic chatbot.

**Independent Test**: Ask for the next appointment, prepare one calendar change and one message, then confirm reads are least-privilege and writes remain gated by exact approval and postcondition verification.

**Acceptance Scenarios**:

1. **Given** calendar read access, **When** Olivier asks about his schedule, **Then** ENDVERA answers from authorized calendar data and cites the relevant event state.
2. **Given** a requested calendar change, **When** ENDVERA prepares the action, **Then** the target, time, calendar and exact mutation are visible before approval.
3. **Given** a selected contact, **When** Olivier asks to text that person, **Then** the recipient, channel and complete text are visible before an external send.

### Edge Cases

- A phone permission is permanently denied, revoked while the app is open, or unavailable on the device.
- A device has several calendars or duplicate contacts and ENDVERA cannot safely infer the intended one.
- A provider webhook is replayed, forged, delayed or delivered out of order.
- The dedicated number is not provisioned, suspended, lacks SMS or voice capability, or has incomplete regulatory registration.
- The backend is unavailable after an action was approved but before the provider result is verified.
- A model proposes an action outside the granted resource, workspace, budget or authority scope.

## Requirements

### Functional Requirements

- **FR-001**: ENDVERA MUST provide one shared mobile application identity for iOS and Android with installable physical-device build profiles.
- **FR-002**: ENDVERA MUST request contacts, calendar, microphone, notifications, photos and files progressively, never as one misleading "allow everything" action.
- **FR-003**: ENDVERA MUST show current device permission state without serializing contact or calendar content into diagnostics.
- **FR-004**: ENDVERA MUST NOT request broad personal SMS or call-log permissions in this release.
- **FR-005**: Real SMS and voice MUST use a dedicated provider-hosted ENDVERA number and authenticated server-side webhooks.
- **FR-006**: Provider credentials MUST remain server-side and MUST NOT enter source control, mobile bundles, logs, errors or evidence artifacts.
- **FR-007**: External SMS, voice and calendar writes MUST fail closed unless global authority, capability authority, owner reference, configuration and exact action approval are all present.
- **FR-008**: Provider webhook admission MUST verify authenticity, bind the sender to an authorized identity, enforce workspace isolation and deduplicate provider identifiers.
- **FR-009**: Calendar and contact reads MUST use the narrowest available scope and be revocable independently.
- **FR-010**: Every consequential external action MUST have a durable state sequence from prepared to approved to dispatched to verified or failed.
- **FR-011**: The app MUST visibly distinguish coded readiness, signed-install readiness, provider configuration, live observation and store publication.
- **FR-012**: A live self pilot MUST remain blocked until a signed build, approved HTTPS backend origin, provider number, regulatory requirements and OAuth or native resource grants are proven.

### Key Entities

- **DevicePermissionState**: One protected resource, native status, request availability, last refresh and disclosure-safe reason.
- **InstallableBuildProfile**: Platform, app identity, distribution mode, signing state and installation evidence.
- **DedicatedNumberBinding**: Provider-neutral number reference, SMS/voice capabilities, compliance state and approved webhook origin.
- **ExternalCapabilityAuthority**: Global gate, capability gate, owner/authority references, credential presence and revocation state.
- **InboundCommunication**: Provider identifier, verified sender binding, channel, occurrence time, idempotency fingerprint and admission result.
- **ExternalActionAttempt**: Exact approved payload version, dispatch attempt, provider reference, spend and verified postcondition.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Olivier installs the signed app on one physical phone without using a browser or Expo Go.
- **SC-002**: Olivier can independently grant, refuse and later refresh contacts and calendar permission states in under two minutes.
- **SC-003**: One authorized inbound SMS and one authorized inbound call produce exactly one canonical request each, including provider retries.
- **SC-004**: Zero unrelated personal SMS messages or call-log entries are read by ENDVERA.
- **SC-005**: Every external write shows its exact target and content before approval and records a verified provider outcome afterward.
- **SC-006**: A revoked grant or missing capability gate causes 100% of protected operations to refuse before provider dispatch.
- **SC-007**: No secret value appears in Git, mobile bundles, test evidence or user-visible errors.

## Assumptions

- Olivier is the sole real user for the first bounded self pilot.
- The first install may use internal distribution; App Store and Play Store publication remain separate release gates.
- A dedicated telecommunications provider number is the message/call channel. Reading the phone's private SMS history is not part of this product contract.
- Calendars already synchronized into the phone may be accessed through native calendar permission; direct Google synchronization remains a separate OAuth connector when needed.
- Provider purchase, legal identity verification, signed distribution, public hosting and live external traffic require explicit owner actions and cannot be proven by local code.
