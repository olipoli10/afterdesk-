# Feature Specification: Secretary command parity

**Created**: 2026-09-05
**Status**: Draft

## Problem

TextAssist currently advertises four natural-language command examples. A live deterministic interpreter probe proved that the schedule example works, but the appointment and project-update examples are unsupported, the SMS example asks for missing wording, and the broadcast example has no integrated conversational executor. A clickable promise that fails after Send is not an actionable secretary.

## User Story 1 — Truthful working examples (P1)

An owner selecting a command example gets wording that the current assistant can actually interpret, or an honest prerequisite destination when the capability is not yet conversationally integrated.

### Acceptance scenarios

1. Schedule, appointment, completed-work and one-recipient SMS examples produce their exact intended interpretations.
2. Google Calendar and calling continue to open their prerequisite surfaces without claiming execution.
3. Broadcast messaging is labelled as planner-ready but conversational integration pending; it must not claim that an unsupported example will prepare a real batch.

## Requirements

- **FR-001**: Every prefilled example MUST pass an interpreter parity test.
- **FR-002**: Appointment wording MUST identify a rendez-vous, exact contact, exact project, weekday and 24-hour time.
- **FR-003**: Completed-work wording MUST explicitly identify work as finished and its project.
- **FR-004**: One-recipient SMS wording MUST contain the exact message after `que`.
- **FR-005**: Unintegrated broadcast behavior MUST be disclosed rather than represented as working conversational execution.
- **FR-006**: Navigation MUST remain unsent and external effects MUST remain zero.

## Success Criteria

- Four of four assistant-prefill examples map to their intended interpretation or are removed from prefill until integrated.
- Zero advertised prefill reaches `UNSUPPORTED` for the synthetic Laval/Marc context.
- Existing mobile tests, typecheck, lint and provider-boundary checks pass.

## Out of scope

Implementing the eventual durable batch approval/execution family, provider activation, OAuth or real transport.
