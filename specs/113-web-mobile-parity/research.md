# R33 Research and Design Decisions

## Decision 1 — One derived cockpit, not duplicated business logic

The existing releases already own state transitions. R33 composes their
canonical read models and routes. Reimplementing them per platform would create
three truths and make parity impossible to prove.

## Decision 2 — Codes cross the API; localized prose does not

Workflow steps, blockers and actions cross client boundaries as closed codes.
Each client renders them through one complete two-locale catalog. This avoids
persisted mixed-language history and makes missing translations testable.

## Decision 3 — Golden Workflow parity is behavioral, not pixel identity

Web and mobile use their native navigation and layout constraints, but must
show the same canonical state, allowed actions and safety explanation. Visual
adaptation is allowed; business-state divergence is not.

## Decision 4 — Accessibility is part of parity

A feature that exists visually but cannot be identified or activated by a
keyboard or screen reader is not functionally available. R33 therefore treats
semantic state, focus, touch targets, text scaling and narrow layout as release
gates rather than later polish.

## Decision 5 — One primary next action

The current application has many specialist tabs. The operating assistant must
reduce orchestration work, so the new cockpit selects one safe next action and
uses secondary links only for inspection. It does not surface every subsystem
as equal-priority navigation.
