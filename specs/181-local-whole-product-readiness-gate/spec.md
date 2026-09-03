# Feature Specification: Local Whole-Product Readiness Gate

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-03

**Status**: Accepted for autonomous validation

## User Scenarios

### User Story 1 - See one truthful local readiness decision (P1)

A release owner can inspect one artifact that reconciles the public Web experience, iOS/Android candidate, backend configuration and remaining external blockers without interpreting older reports.

### User Story 2 - Preserve the external authority boundary (P1)

The gate proves that unsigned local artifacts and disabled connectors are ready for the next authorized stage while refusing to call them deployed, signed, published, provider-observed or production-ready.

### User Story 3 - Detect stale or inflated readiness evidence (P1)

If a protected source artifact changes, a required public route disappears, a connector becomes externally enabled or an external blocker is omitted, validation fails.

## Requirements

- **FR-001**: The gate MUST cover Web, iOS, Android and backend configuration in one deterministic report.
- **FR-002**: The accepted homepage MUST remain present and `/textassist` plus `/account-deletion` MUST be public local routes.
- **FR-003**: Mobile evidence MUST retain five primary tabs, 20 secondary routes, both launch languages and local iOS/Android/Web exports.
- **FR-004**: Provider, messaging, voice, calendar, email and accounting connectors MUST remain disabled for external transport.
- **FR-005**: The report MUST bind every protected source artifact by SHA-256.
- **FR-006**: The resolved account-deletion route MUST not remain listed as an external blocker.
- **FR-007**: Final brand approval, real-device captures, signing, public infrastructure, legal review, monitoring and staffed support MUST remain explicit external blockers.
- **FR-008**: The report MUST state that R37-R40 remain incomplete and external authority is required next.
- **FR-009**: No dependency, lockfile, schema, credential, provider call, external write, deployment, upload, signing or publication may occur.

## Success Criteria

- One validator returns `LOCAL_WHOLE_PRODUCT_READINESS_VERIFIED`.
- All protected hashes match and all local-scope gaps are empty.
- Exactly 18 unresolved external blockers remain, with no stale account-deletion blocker.
- External effects, observed providers/customers, signing, deployment, upload, submission and publication remain zero or false.

