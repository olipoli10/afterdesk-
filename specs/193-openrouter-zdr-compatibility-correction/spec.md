# Feature Specification: OpenRouter ZDR Compatibility Correction

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-05

**Status**: Accepted for local implementation

**Input**: Preserve the failed R37 observation, determine why a valid model returned HTTP 404, and prepare a corrected provider contract without another provider attempt, credential, or spend.

## User Scenarios & Testing

### User Story 1 - Explain the real failure (Priority: P1)

As the founder, Olivier can see whether R37 failed because the model did not exist, because the account lacked access, or because the privacy and request requirements eliminated every compatible endpoint.

**Why this priority**: Retrying without distinguishing these cases risks repeating the same paid failure and corrupting the meaning of the original observation.

**Independent Test**: Public provider metadata and the frozen request requirements produce one deterministic explanation while the original R37 report remains unchanged.

**Acceptance Scenarios**:

1. **Given** the sealed R37 report and current public model metadata, **When** compatibility is evaluated, **Then** both requested models are recognized as existing.
2. **Given** the original request and privacy requirements, **When** compatible endpoints are filtered, **Then** the eliminated parameter and the remaining compliant alternatives are visible.

---

### User Story 2 - Prepare a corrected contract safely (Priority: P2)

As the product owner, Olivier has a corrected request contract that preserves zero-data-retention, denied data collection, structured output, strict parameter support, bounded output and zero automatic fallback.

**Why this priority**: The correction must remove only the incompatibility; weakening privacy or widening execution would invalidate the comparison.

**Independent Test**: The corrected contract accepts the supported output-limit field, rejects the obsolete output-limit field and unsupported sampling fields, and still rejects every privacy or fallback weakening.

**Acceptance Scenarios**:

1. **Given** an eligible endpoint, **When** a corrected request is constructed, **Then** every mandatory privacy and output constraint is present.
2. **Given** a request using the incompatible output-limit field, **When** it is validated, **Then** it is refused before any provider execution.

---

### User Story 3 - Stop before a second paid attempt (Priority: P3)

As the founder, Olivier gets all safe local preparation completed automatically while a second provider execution remains impossible without a distinct, exact authorization.

**Why this priority**: R37 was a one-shot observed campaign and its REWORK verdict must remain immutable.

**Independent Test**: The local completion gate passes with no credential access, no generation request, no spend and no mutation of the R37 report.

**Acceptance Scenarios**:

1. **Given** the local correction is complete, **When** its completion gate runs, **Then** it performs zero provider generation calls and reports readiness for a separately authorized retest only.
2. **Given** no new founder authority, **When** a second execution is requested, **Then** it remains unavailable.

### Edge Cases

- A model exists but no zero-retention endpoint supports every requested parameter.
- An endpoint supports structured output but only under a different output-limit field.
- Public endpoint metadata changes after the evidence snapshot.
- A candidate endpoint is temporarily unhealthy or removed.
- An account or key guardrail further narrows the public endpoint set.
- A local change accidentally alters the sealed R37 report.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST preserve the sealed R37 report byte-for-byte and retain verdict `REWORK`.
- **FR-002**: The system MUST distinguish model existence from endpoint compatibility.
- **FR-003**: Compatibility MUST require zero data retention, denied data collection, strict parameter support, structured output and bounded output.
- **FR-004**: The corrected contract MUST use the output-limit field supported by every selected compliant endpoint.
- **FR-005**: Every optional request field not advertised by the selected compliant endpoints, including the original output-limit and sampling fields, MUST be omitted and rejected by the corrected contract.
- **FR-006**: Missing, stale, malformed or contradictory public metadata MUST fail closed.
- **FR-007**: The local correction MUST NOT read a credential or dispatch a provider generation request.
- **FR-008**: The local correction MUST NOT authorize a second R37 attempt, R38, customer data, communication, deployment or production.
- **FR-009**: The completion evidence MUST state which findings are directly observed from public metadata and which are inferred.
- **FR-010**: A future retest MUST require a new immutable run contract and explicit founder authority.

### Key Entities

- **Public endpoint snapshot**: Dated metadata describing model existence, endpoint identifiers, privacy eligibility, supported parameters and health state.
- **Compatibility decision**: Deterministic result identifying eligible endpoints and exact exclusion reasons.
- **Corrected request contract**: A provider request shape that matches compliant endpoint capabilities without weakening R37 safety constraints.
- **R37 seal**: The immutable report hash and verdict that the correction cannot change.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Both frozen R37 model identifiers are found in current public provider metadata.
- **SC-002**: At least one compliant endpoint per model remains after privacy and parameter filtering.
- **SC-003**: All compatibility and mutation tests pass with zero provider generation calls and zero spend.
- **SC-004**: The sealed R37 report retains the exact SHA-256 recorded at closeout.
- **SC-005**: The completion gate reports exactly one next decision: whether to authorize a new bounded retest.

## Assumptions

- Public OpenRouter model and ZDR endpoint inventories are readable without a credential and do not incur generation spend.
- The HTTP 404 body was intentionally not retained, so the root cause is established by reconciling the frozen request with current endpoint capabilities.
- Account-level guardrails may be stricter than public metadata and remain unknown until a separately authorized preflight or retest.
- No database or user-facing product surface changes are required for this compatibility correction.
