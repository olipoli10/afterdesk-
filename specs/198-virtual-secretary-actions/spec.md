# Feature Specification: ENDVERA virtual secretary actions

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-05

**Status**: Accepted for local implementation

**Input**: The founder defines ENDVERA as a virtual secretary that can call, text one or several people, update a job, add calendar items and answer schedule or Google Calendar questions through conversation.

## User Scenarios & Testing

### User Story 1 - Ask the secretary (Priority: P1)

An authenticated owner asks ENDVERA what is on the schedule or authorized Google Calendar and receives a grounded answer or a clear connection request, without reconstructing the business context.

**Why this priority**: Reading the schedule is frequent, low-risk and proves that ENDVERA understands the owner's business state before it acts.

**Independent Test**: Submit schedule and Google Calendar questions to the local planner and verify canonical schedule reads are ready while missing Google authorization is stated without an invented answer.

**Acceptance Scenarios**:

1. **Given** an authenticated owner and bound workspace, **When** the owner asks about the canonical schedule, **Then** ENDVERA selects a read action with no external write.
2. **Given** Google Calendar is not connected, **When** the owner asks about it, **Then** ENDVERA requests that exact connection and returns no calendar facts.

### User Story 2 - Communicate for the owner (Priority: P1)

An owner asks ENDVERA to text one person, text as many as ten people, or place a call. ENDVERA resolves every recipient and shows the exact channel, recipients and content before any external action.

**Why this priority**: Coordinating people is core secretarial work and the fastest route to recurring daily value.

**Independent Test**: Prepare one message, a ten-person broadcast and a call; verify exact recipient previews, duplicate rejection, limits and zero external transport.

**Acceptance Scenarios**:

1. **Given** one resolved recipient, **When** the owner requests a text, **Then** one approval-bound message is prepared.
2. **Given** ten unique resolved recipients with eligible communication state, **When** the owner requests the same operational notice, **Then** one batch preview lists all ten people and one message body.
3. **Given** more than ten recipients or a duplicate recipient, **When** the request is planned, **Then** ENDVERA refuses the batch without silently changing its audience.
4. **Given** one resolved person and a call objective, **When** the owner asks ENDVERA to call, **Then** the exact recipient, purpose and assistant disclosure are prepared before dialing.

### User Story 3 - Change the operation (Priority: P1)

An authorized owner asks ENDVERA to update a job or add a calendar event. ENDVERA clarifies missing targets, prepares the exact mutation and requires the applicable approval before changing state.

**Why this priority**: A secretary creates value by maintaining the operation, not only by answering questions.

**Independent Test**: Prepare a project update and calendar event; verify workspace, target, expected version, timing and approval requirements are explicit and no external effect occurs.

**Acceptance Scenarios**:

1. **Given** an exact project and current version, **When** the owner requests a change, **Then** ENDVERA prepares the bounded project mutation.
2. **Given** an authorized calendar connection and complete date/time, **When** the owner requests an event, **Then** ENDVERA prepares the exact event and approval requirement.
3. **Given** an ambiguous project, person, date or time, **When** the owner requests a write, **Then** ENDVERA asks one focused clarification instead of guessing.

### Edge Cases

- Unknown sender, role or workspace is refused before interpretation.
- Repeated provider message IDs reuse the original plan and cannot create a second effect.
- Recipient lists preserve the owner's exact audience; duplicates, unresolved contacts and more than ten recipients are refused.
- Revoked Google Calendar or communication grants are unavailable immediately.
- A model timeout or malformed answer cannot mutate project, calendar or communication state.
- An emergency request or low-confidence interpretation is offered to bounded human support.

## Requirements

### Functional Requirements

- **FR-001**: ENDVERA MUST present itself and behave as a virtual secretary for operational work.
- **FR-002**: The accepted action catalog MUST include schedule query, Google Calendar query, calendar event creation, project update, single-recipient text, broadcast text for one to ten recipients and outbound call preparation.
- **FR-003**: Every request MUST bind an authenticated actor and one workspace before planning.
- **FR-004**: Schedule answers MUST use authorized canonical or connected calendar facts and MUST NOT rely on general model memory.
- **FR-005**: Google Calendar reads and writes MUST be separately authorized with the minimum useful scope.
- **FR-006**: Every external communication MUST show its exact recipient or recipient list, channel and content before approval.
- **FR-007**: A broadcast MUST contain between one and ten unique, resolved recipients and MUST preserve per-recipient eligibility information.
- **FR-008**: Calls MUST disclose that ENDVERA is acting as the owner's assistant and MUST expose the exact call objective before dialing.
- **FR-009**: Project mutations MUST bind the exact project, expected current version and requested change.
- **FR-010**: Calendar mutations MUST bind the exact calendar, title, start, end and time zone.
- **FR-011**: Missing or ambiguous people, projects, calendars, dates, times or content MUST produce focused clarification.
- **FR-012**: Every write MUST be idempotent and pass policy, approval and postcondition verification appropriate to its risk.
- **FR-013**: This local increment MUST perform zero SMS, call, OAuth, calendar provider, customer-data or production action.
- **FR-014**: Every decision MUST expose a reconstructable reason code, readiness state and evidence label.
- **FR-015**: Human support MUST remain an available bounded fallback without receiving unrelated workspace context.

### Key Entities

- **Secretary action request**: Authenticated conversational intent, workspace, capability and typed target payload.
- **Recipient set**: One to ten unique resolved contacts plus communication eligibility state.
- **Action preview**: Exact user-visible description of channel, targets, content, risk and required approval.
- **Connector readiness**: Required provider, grant and current read/write availability.
- **Action plan**: Ready answer, clarification, prepared action, refusal or human handoff with zero or one allowed next step.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All seven secretary capabilities are visible in one action catalog and independently testable.
- **SC-002**: A valid ten-person message produces one exact preview containing ten unique recipients and zero transport.
- **SC-003**: Every ambiguous or unauthorized write produces clarification or refusal with zero state change.
- **SC-004**: Users can distinguish an immediate read, a missing connection and an approval-bound action from one screen.
- **SC-005**: Automated tests cover all seven capabilities, authorization refusal, missing connector, duplicate recipient, eleven-recipient refusal and zero external effects.

## Assumptions

- The owner is the default actor for this local contract; team-role expansion remains policy-controlled.
- Existing canonical projects, contacts, schedule, calendar connector, messaging, call, approval and human-support modules will be reused.
- One broadcast contains one common message body; personalized bulk campaigns are outside this release.
- Real telephone and calendar providers remain later explicit activation gates.

## Explicit exclusions

- No real SMS, call, OAuth, Google Calendar request, customer/prospect data, deployment, store submission, Preview or Production.
- No autonomous emergency calling, marketing blast, hidden recipient expansion or blanket device surveillance.
- No claim that a prepared action has been executed or verified externally.
