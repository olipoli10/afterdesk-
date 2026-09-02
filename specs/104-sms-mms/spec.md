# Feature Specification: SMS/MMS Operating Channel

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-02  
**Status**: In progress  
**Input**: R24 — inbound and outbound SMS/MMS with project routing, consent, opt-out, exact approval and delivery state.

## Product outcome

ENDVERA extends the existing provider-neutral R4 communication engine into a
durable construction messaging channel. Authorized inbound SMS/MMS is attached
to the correct workspace and project, ambiguous routing asks for clarification,
STOP immediately suppresses future preparation, and outbound work remains
inspectable and `PREPARED_UNSENT` until later provider authority exists.

This release proves the local product and policy boundary. It does not activate
a phone number, provider, public webhook or external delivery.

## User stories

### US1 — Receive a construction update safely (P1)

An authorized contact sends a text or a message containing previously admitted
media. ENDVERA records the original message, retains its source, routes it to the
only proven project when possible, and asks for clarification instead of
guessing when more than one project is plausible.

**Independent acceptance**: one authorized event has one canonical effect;
exact retry/replay has no second effect; ambiguous and cross-workspace events
cannot update a project.

### US2 — Respect consent and opt-out before outbound work (P1)

An owner or office administrator records the communication purpose and evidence
for a contact. A STOP message suppresses all outbound SMS preparation for that
contact immediately. START removes the STOP state only into review-required
state; it never invents consent.

**Independent acceptance**: a suppressed, unknown-consent or withdrawn contact
cannot obtain a prepared outbound operation. Consent evidence and every state
transition remain reconstructible.

### US3 — Inspect and approve the exact message (P1)

An owner or office administrator sees the contact, masked destination, channel,
exact body, version, fingerprint, purpose and consent state before approval.
Approval binds to the exact version and fingerprint. Preparation creates one
`PREPARED_UNSENT` operation and performs no delivery.

**Independent acceptance**: changed content, stale approval, duplicate command,
field-worker access and cross-workspace access fail closed.

### US4 — Track messaging state without inventing delivery (P2)

The cockpit distinguishes canonical internal states from synthetic or future
provider observations. Local observations are explicitly labelled synthetic and
cannot be presented as real sent or delivered proof. Duplicate and regressive
status events are refused or replayed without changing the derived state.

**Independent acceptance**: the timeline is monotonic, immutable and restart
safe; external transport remains false in every R24 artifact.

### US5 — Reference MMS evidence without bypassing file security (P2)

An MMS event may reference only evidence already admitted by the selected-file
security pipeline. ENDVERA stores the evidence identifier and content hash, not
a remote media URL or provider download token.

**Independent acceptance**: missing, revoked, changed-hash and cross-project
evidence references are rejected atomically.

## Functional requirements

- **FR-001**: R24 MUST reuse the R4 provider-neutral communication account,
  identity, inbound and exact outbound approval contracts.
- **FR-002**: Every admitted event MUST be workspace scoped and authenticated by
  a trusted adapter assertion before any canonical write.
- **FR-003**: Sender and recipient persistence added by R24 MUST use opaque
  identity references; R24 MUST NOT persist a raw phone number, provider token,
  webhook signature or remote media URL.
- **FR-004**: Inbound project routing MUST use canonical contact/project
  relationships. Zero or multiple proven projects MUST produce clarification,
  not a guessed project write.
- **FR-005**: Exact event retry and concurrent replay MUST produce one message,
  one consent effect and one set of media references.
- **FR-006**: MMS media MUST already exist as non-revoked, same-workspace,
  same-project selected evidence with an exact content hash.
- **FR-007**: STOP MUST immediately create or update a durable all-purpose
  suppression for the contact. START MUST move the contact to review required,
  not directly to granted consent.
- **FR-008**: HELP MUST be retained and may prepare a local response, but MUST
  NOT change consent.
- **FR-009**: Consent MUST be recorded separately by purpose and MUST retain
  evidence reference, actor, effective time, source and version.
- **FR-010**: Outbound preparation MUST require an active SMS connector grant,
  an exact approved action, a canonical contact, the required purpose consent
  and no active suppression.
- **FR-011**: The owner/office projection MUST display masked recipient, exact
  body, purpose, consent/suppression, approval fingerprint and delivery proof
  level. Field-worker projection MUST exclude destinations, bodies, consent
  evidence and all financial content.
- **FR-012**: Delivery observations MUST be immutable, idempotent and monotonic.
  R24 local observations MUST be labelled `SYNTHETIC_LOCAL` and never count as
  provider or Verified-E2E proof.
- **FR-013**: Revocation MUST fail closed for subsequent preparation while
  preserving history and audit evidence.
- **FR-014**: All writes spanning message, routing, suppression, media and audit
  MUST be atomic under concurrent events.
- **FR-015**: Public APIs MUST require an authenticated verified CLIENT, apply
  rate limits, return private no-store responses and expose bounded errors.
- **FR-016**: R24 MUST contain no provider executor, network call, credential,
  real phone number, public webhook, customer data, external write, push,
  Preview, Production or deployment path.

## Success criteria

- **SC-001**: 100% of admitted fixtures attach to the sole proven project or
  return clarification; no guessed project state is created.
- **SC-002**: Concurrent duplicate and replay tests create exactly one canonical
  message and one policy effect.
- **SC-003**: STOP blocks 100% of outbound preparations; START grants 0% of
  consent automatically.
- **SC-004**: Exact approval plus granted consent yields exactly one
  `PREPARED_UNSENT` operation and zero transports.
- **SC-005**: Changed approval, revoked consent, cross-workspace identity and
  invalid media references are refused atomically.
- **SC-006**: Derived delivery state is identical after restart and cannot move
  backward.
- **SC-007**: The shared iOS/Android cockpit parses only role-safe strict
  projections and shows that provider delivery is disabled.

## Non-goals

- Selecting or activating Twilio or another provider.
- Buying or porting a number.
- Receiving a public webhook.
- Sending a real SMS/MMS.
- Giving legal advice or claiming that product checks alone satisfy CASL.
- Downloading remote MMS media.
- Customer or prospect data and provider-observed evidence.

