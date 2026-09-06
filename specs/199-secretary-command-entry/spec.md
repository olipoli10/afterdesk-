# Feature Specification: Secretary command entry

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-05
**Status**: Draft
**Input**: Make every advertised virtual-secretary capability actionable from the existing TextAssist surface and prefill the existing assistant rather than introducing another form or test console.

## User Scenarios & Testing

### User Story 1 — Start a secretary request from one surface (Priority: P1)

An owner sees what ENDVERA can do and selects one capability. ENDVERA either opens the existing assistant with a plain-language command already present or opens the exact connection/work surface needed.

**Independent Test**: Select each of the seven capability entries and verify its destination and prefilled command without sending or changing anything.

**Acceptance Scenarios**:

1. **Given** the TextAssist capability list, **When** the owner selects a command capability, **Then** the existing assistant opens with that exact example prefilled and unsent.
2. **Given** a capability requiring a dedicated local surface, **When** it is selected, **Then** ENDVERA opens the correct existing surface.

### User Story 2 — Preserve user control (Priority: P1)

The owner reviews or edits the prefilled request before choosing to submit it. Merely selecting a capability performs no canonical or external effect.

**Independent Test**: Open a prefilled assistant request and verify no submission occurs until the owner uses the existing send control.

**Acceptance Scenarios**:

1. **Given** an assistant prompt supplied by navigation, **When** the screen opens, **Then** the prompt is visible but no assistant attempt exists because of that navigation alone.
2. **Given** an invalid, repeated or oversized navigation value, **When** the assistant opens, **Then** it ignores the value without failing or dispatching.

### Edge Cases

- Array-valued route parameters use only one bounded scalar value.
- Prompts above the assistant limit are ignored.
- A field worker cannot obtain a writable assistant composer through this entry.
- Selecting Google Calendar opens the connection surface; it does not imply a grant.
- Selecting call work opens the existing calls surface; it does not place a call.

## Requirements

### Functional Requirements

- **FR-001**: The TextAssist surface MUST expose an actionable entry for all seven R38B capabilities.
- **FR-002**: Natural-language capabilities MUST open the existing assistant with the exact advertised example prefilled.
- **FR-003**: Google Calendar readiness MUST open the existing calendar-connection surface.
- **FR-004**: Outbound call preparation MUST open the existing call-work surface.
- **FR-005**: Navigation alone MUST NOT submit an assistant request or perform any canonical or external effect.
- **FR-006**: The assistant MUST accept at most one non-empty prefill value of 10,000 characters or fewer.
- **FR-007**: The assistant MUST ignore malformed or oversized prefill values.
- **FR-008**: Existing role protections, approval controls and transport-disabled boundaries MUST remain intact.

## Assumptions

- The existing assistant, calendar-connection and calls surfaces remain the owned product destinations.
- Prefilling is safer than auto-submitting because the examples include sensitive write intentions.
- This slice does not add speech-to-text, OAuth, SMS or calling providers.

## Success Criteria

- **SC-001**: Seven of seven advertised capabilities have a deterministic actionable entry.
- **SC-002**: Every command entry reaches the existing assistant with its exact visible example.
- **SC-003**: Zero assistant submissions or external effects occur from navigation alone.
- **SC-004**: All malformed-prefill and role-protection tests pass.

## Out of Scope

- Provider activation, OAuth, speech transcription, SMS delivery, calling, store signing and deployment.
- A new form-led test, duplicate assistant or fabricated provider result.
