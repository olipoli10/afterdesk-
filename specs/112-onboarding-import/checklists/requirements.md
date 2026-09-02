# Specification Quality Checklist: R32 Onboarding and Import

## Content quality

- [x] Focused on contractor onboarding value and safe time-to-first-value
- [x] All mandatory sections are complete
- [x] Evidence labels and unsupported provider/customer claims remain explicit
- [x] The product reuses canonical state rather than creating an onboarding shadow system

## Requirement completeness

- [x] No NEEDS CLARIFICATION marker remains
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Acceptance covers happy path, ambiguity, replay, atomicity and restart
- [x] Scope, dependencies, authority and external-effect boundaries are explicit

## Readiness

- [x] Every user scenario has an independent test outcome
- [x] First value does not depend on optional connectors
- [x] Import never silently merges or overwrites canonical state
- [x] Preview and commit are separate, versioned and reconstructible
- [x] Web/iOS/Android share one strict contract
