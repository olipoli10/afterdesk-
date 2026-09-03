# Feature Specification: TextAssist Public Offer Completion

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Accepted for autonomous implementation

**Input**: Keep the accepted ENDVERA site intact and make the additive `/textassist` offer understandable enough for a small contractor to identify the daily operating loop, authority boundary, human backup, current pricing state and next action.

## User Scenarios & Testing

### User Story 1 - Discover the new product without losing the old site (Priority: P1)

A visitor can reach TextAssist from the persistent homepage navigation and footer while the existing ENDVERA homepage remains unchanged below the additive banner.

**Independent Test**: The root still renders the accepted narrative and machine, and exposes durable TextAssist links in the header and footer.

### User Story 2 - Understand what the assistant does every day (Priority: P1)

A small contractor can see how a text, voice note or portal request becomes maintained project state, a safe next action, an inspectable approval and a verified follow-up.

**Independent Test**: French and English copy expose the same ordered operating loop, common questions and human-backup boundary.

### User Story 3 - See an honest offer state (Priority: P1)

A visitor can tell that pricing, providers, mobile publication and customer evidence are not yet validated, without confusing a local build with a live service.

**Independent Test**: The page contains an explicit pricing-in-preparation section and renders the closed-world release boundary with all external proof flags false.

## Requirements

- **FR-001**: The accepted homepage MUST remain structurally intact.
- **FR-002**: TextAssist MUST be reachable from persistent homepage navigation and footer links in addition to the banner.
- **FR-003**: `/textassist` MUST explain the daily operating loop in an ordered, scannable sequence.
- **FR-004**: `/textassist` MUST explain consequential-action approval and bounded human support.
- **FR-005**: `/textassist` MUST state that launch pricing is not yet validated and MUST NOT invent a price.
- **FR-006**: French and English MUST carry equivalent critical meaning.
- **FR-007**: Provider observation, customer observation, validated pricing, deployment and publication MUST remain false.
- **FR-008**: No provider, credential, customer data, external transport, external write, payment, deployment or publication may be used.

## Success Criteria

- **SC-001**: TextAssist is reachable from three independent root-page entry points: banner, header and footer.
- **SC-002**: The public page names the audience, daily loop, approval boundary, human backup, pricing state and availability state in French and English.
- **SC-003**: Targeted regression tests and `git diff --check` pass with zero external effects.

