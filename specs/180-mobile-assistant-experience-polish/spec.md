# Feature Specification: Mobile Assistant Experience Polish

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Accepted for autonomous implementation

## User Scenarios

### User Story 1 - Navigate in the workspace language (P1)

An owner with a French or English workspace sees the five primary destinations and grouped More directory in the same language.

### User Story 2 - Recover from an uncertain or unavailable result (P1)

When the assistant cannot confirm an outcome, the user sees a plain-language explanation and one exact retry or refresh action without losing the request identity.

### User Story 3 - Operate with assistive technology (P1)

The assistant input, primary action, retry controls and secondary links expose labels, roles, state and hints.

## Requirements

- **FR-001**: Primary navigation MUST remain limited to Today, Assistant, Projects, Calendar and More.
- **FR-002**: Critical navigation and assistant copy MUST support equivalent `fr-CA` and `en-CA` meaning.
- **FR-003**: Every current secondary route MUST remain reachable from More or a stable deep link.
- **FR-004**: Errors MUST show an adjacent recovery action when retry or refresh is safe.
- **FR-005**: Unknown-outcome retries MUST reuse the exact existing attempt.
- **FR-006**: Primary inputs and controls MUST expose accessibility roles, labels and relevant state.
- **FR-007**: Provider-disabled state and zero external transport MUST remain unchanged.
- **FR-008**: No dependency, lockfile, schema, credential, provider or external effect may be added.

## Success Criteria

- Five primary tabs render bilingual workspace-specific titles.
- All 20 secondary routes remain reachable.
- Assistant input, submit, retry and refresh are accessible and recovery is adjacent to the error.
- Targeted and full mobile tests, typecheck, lint and local export pass.

