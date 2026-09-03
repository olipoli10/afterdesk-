# Feature Specification: Backend Activation Gate

**Status**: Accepted for autonomous implementation

## User Scenarios

### User Story 1 - Start safely with credentials present (P1)

A deployment that accidentally contains a provider credential still keeps AI, email and Google OAuth disabled unless global transport, exact capability, authority reference and owner reference are all explicit.

### User Story 2 - Inspect why a capability is disabled (P1)

An operator can evaluate a pure redacted decision containing only missing requirement names, never credential values.

## Requirements

- Provider credentials alone MUST never activate a connector outside tests.
- Global transport and each capability MUST use exact `ENABLED` tokens.
- Non-empty authority and owner references MUST be present.
- Required configuration names MUST be present without being returned or serialized.
- AI, email and Google OAuth existing entry points MUST use the central gate.
- Test-only synthetic AI compatibility MUST not create a production bypass.
- All current local behavior without provider configuration MUST remain available.
- No provider call, credential, dependency or schema change is allowed.

## Success Criteria

Every missing prerequisite produces `enabled=false`; only the complete synthetic presence map enables the pure decision; runtime entry points source-scan to the central gate.
