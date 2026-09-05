# R38A — TextAssist foundation

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-05

**Status**: Accepted for local implementation

**Input**: The founder wants the first product experience to be a downloadable ENDVERA app that connects authorized tools and exposes an AI operating assistant through a dedicated text channel.

## User Scenarios & Testing

### User Story 1 — Install and understand ENDVERA (Priority: P1)

An owner opens the iOS or Android app and immediately understands the product: text or speak to ENDVERA, connect only the tools needed, and review sensitive actions before they happen.

**Why this priority**: This is the founder-selected entry product and must be obvious before secondary operational workflows.

**Independent Test**: Open the local mobile candidate and verify one screen explains the dedicated-number model, permission choices, AI routing and action controls without claiming any live connector.

**Acceptance Scenarios**:

1. **Given** no connector is active, **When** the owner opens TextAssist setup, **Then** the screen shows the app chat as locally available and the dedicated SMS number as not yet provisioned.
2. **Given** the owner wants calendar, contacts or voice, **When** the setup screen is viewed, **Then** each access is shown separately with a plain-language purpose and revocation path.

### User Story 2 — Route one text request safely (Priority: P1)

ENDVERA receives a normalized request envelope, verifies the sender and workspace, classifies the request, chooses an allowed reasoning lane and returns either an answer, a clarification, a prepared action, a refusal or a human handoff.

**Why this priority**: The model gateway is useful only when ENDVERA remains the policy and action authority.

**Independent Test**: Unit tests classify representative requests and prove unknown senders, unknown capabilities and unauthorized writes fail closed.

**Acceptance Scenarios**:

1. **Given** a verified owner asks a canonical calendar question, **When** the router evaluates it, **Then** it selects the canonical operations lane and does not require web research.
2. **Given** a verified owner asks for current external research, **When** the router evaluates it, **Then** it selects a research lane but reports provider authorization as unavailable in the local build.
3. **Given** any request asks for an external write, **When** the router evaluates it, **Then** the result requires an exact preview and policy or human approval before execution.

### User Story 3 — Connect only what is useful (Priority: P2)

The owner can progressively connect calendar, selected contacts, notifications, microphone and files. ENDVERA requests access only when the related feature is used and reflects denial or revocation honestly.

**Why this priority**: Trust and store eligibility depend on least-privilege access, not a blanket permission prompt.

**Independent Test**: Contract tests prove the setup manifest contains no broad SMS-history or call-log permission and every protected capability has a purpose, state and revocation route.

**Acceptance Scenarios**:

1. **Given** the app is installed, **When** setup starts, **Then** it does not request all permissions at once.
2. **Given** calendar access is denied, **When** the owner asks a calendar question, **Then** ENDVERA explains the missing connection and invents no calendar answer.

### User Story 4 — Use the best bounded AI lane (Priority: P2)

ENDVERA may use a provider-neutral model gateway such as OpenRouter to choose among allowed models for reasoning, research or document analysis, while its own server controls identity, permissions, tools, cost, audit and final action state.

**Why this priority**: Model choice should improve answers without turning a third-party model into the system of record or action authority.

**Independent Test**: The local manifest exposes allowed lanes and policy boundaries while the provider gateway and external transport remain disabled.

**Acceptance Scenarios**:

1. **Given** no server-side provider grant exists, **When** a provider-required request is classified, **Then** the system returns `PROVIDER_REQUIRED_NOT_AUTHORIZED` with zero external call.
2. **Given** an internal project question can be answered from canonical data, **When** it is classified, **Then** the system does not route private project state to an external research model.

### Edge Cases

- Unverified phone numbers and workspace mismatches are refused before interpretation.
- Duplicate provider message IDs reuse the first result and create no second effect.
- Ambiguous people, projects, dates or write targets produce clarification.
- Revoked connectors become unavailable immediately for future operations.
- A model timeout cannot change canonical state or trigger an external action.
- Sensitive data is restricted to model/provider policies compatible with its classification.

## Requirements

### Functional Requirements

- **FR-001**: The product entry MUST be the assistant, not an invoice-readiness test or form-heavy ERP workflow.
- **FR-002**: The mobile app MUST present one TextAssist setup surface for entry channels, connectors, permissions, model routing and action control.
- **FR-003**: The intended SMS experience MUST use a dedicated ENDVERA number and provider webhook; it MUST NOT depend on reading the phone's SMS history.
- **FR-004**: Permissions MUST be progressive, purpose-bound, independently deniable and revocable.
- **FR-005**: The first permission manifest MUST NOT request Android `READ_SMS`, `WRITE_SMS`, `READ_CALL_LOG` or default-handler status.
- **FR-006**: OpenRouter or another gateway MUST remain server-only, provider-neutral, budget-bound and replaceable.
- **FR-007**: The model router MUST distinguish canonical operations, external research, document analysis, general reasoning and human escalation.
- **FR-008**: Canonical project/calendar/contact reads MUST prefer ENDVERA data and authorized connectors over general model memory.
- **FR-009**: External writes MUST bind actor, workspace, target, exact payload, policy decision, idempotency key and verification requirement.
- **FR-010**: The local implementation MUST keep provider calls, SMS/calls, OAuth, customer data, deployment, Preview and Production disabled.
- **FR-011**: The local setup status MUST never describe a disabled or unprovisioned connector as connected.
- **FR-012**: Existing provider-neutral calendar, messaging, voice, prepared-action and human-support foundations MUST be reused rather than rewritten.
- **FR-013**: Every route decision MUST produce a reconstructable reason code and evidence label.

### Key Entities

- **TextAssist setup manifest**: Honest state of entry channels, protected resources, connectors and model gateway.
- **Inbound request envelope**: Provider-neutral message identity, verified sender binding, workspace and idempotency data.
- **AI route decision**: Selected lane, required data class, provider readiness and reason code.
- **Action proposal**: Exact read, internal mutation, external write or human handoff with authority and verification state.
- **Connector grant**: Provider, scopes, owner, status, revocation and audit reference.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A new user can explain the core loop after viewing one mobile setup screen: text ENDVERA, connect tools, review sensitive actions.
- **SC-002**: Automated tests cover every routing lane, unknown intent refusal, external-write approval and zero external transport.
- **SC-003**: The permission manifest contains zero broad SMS-history and call-log permissions.
- **SC-004**: The provider boundary check confirms no OpenRouter secret or provider adapter enters the mobile bundle.
- **SC-005**: Mobile lint, typecheck and tests pass; root lint, typecheck and focused tests pass.

## Assumptions

- A dedicated business number will later be provisioned through a provider-neutral SMS adapter.
- Google and Microsoft calendar OAuth are later live gates; this increment exposes honest connection states only.
- OpenRouter remains a candidate gateway, not the ENDVERA brain, system of record or policy engine.
- This increment uses synthetic/local data and performs no external provider call.

## Explicit exclusions

- No real SMS, call, email, OAuth, calendar write, customer data, provider spend, push notification, deployment, store submission, Preview or Production.
- No blanket phone surveillance, SMS-history ingestion, call-log ingestion or background microphone access.
- No claim of customer value, product-market fit, production readiness or Verified-E2E provider coverage.
