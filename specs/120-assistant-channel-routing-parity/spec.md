# Feature Specification: Assistant Channel Routing Parity

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Draft
**Input**: Continue authorized local work after R36C while real providers remain deferred.

## User Scenarios & Testing

### User Story 1 — The same assistant answers app and SMS (Priority: P1)

As a contractor, I can ask the same operational question through the app or an authorized SMS identity and ENDVERA applies the same hidden routing policy before any action.

**Independent Test**: An authorized synthetic SMS calendar query is classified internally, keeps SMS provenance and creates one canonical effect across replay.

### User Story 2 — Provider-required SMS stays honest (Priority: P2)

As a contractor, I can ask for public research by SMS and ENDVERA records the request and truthfully says external research is not active instead of inventing an answer.

**Independent Test**: A synthetic research SMS creates exactly one deferred exchange, zero external dispatch, and exact replay returns the original decision.

### User Story 3 — Voice transcript follows the same gate (Priority: P3)

As a contractor, an authorized consented local voice transcript is routed by the same brain and retains voice provenance without storing source audio.

**Independent Test**: Equivalent authorized SMS and voice transcript requests receive equivalent dispositions while their channel provenance stays distinct.

## Requirements

### Functional Requirements

- **FR-001**: The authenticated local SMS and voice-transcript ingress MUST call the R36C unified assistant router before internal execution.
- **FR-002**: The router MUST preserve the admitted channel, opaque sender identity, provider and provider message reference for internal commands.
- **FR-003**: Mobile and portal requests MUST continue to use authenticated user identity without accepting client-supplied provider/model choice.
- **FR-004**: Non-portal calls MUST fail closed when trusted admitted-source metadata is absent or inconsistent.
- **FR-005**: Provider-required, human, clarification and refusal dispositions MUST preserve one durable deferred exchange and zero external dispatch.
- **FR-006**: Exact replay MUST return the original channel, rows, reply and routing decision; mismatched replay MUST be refused.
- **FR-007**: Authorization MUST be checked by the channel adapter and rechecked by the unified assistant before persistence.
- **FR-008**: No raw phone number, credential, audio bytes, provider output or customer data may be added.
- **FR-009**: Existing R4 response contracts MUST remain compatible.

## Success Criteria

- **SC-001**: 100% of tested mobile, SMS and local voice-transcript requests cross the same routing decision boundary.
- **SC-002**: Internal SMS and voice tests retain their admitted database channel and provider reference.
- **SC-003**: Research over SMS or voice produces zero invented facts and zero external dispatch.
- **SC-004**: Exact replay produces one canonical effect or one deferred exchange; request-ID drift is refused.
- **SC-005**: R36A, R36C, R4 and PostgreSQL regressions pass with no schema, dependency or lockfile change.

## Boundaries

This feature is local code, tests and disposable PostgreSQL only. It does not authorize Twilio, telephony, email, credentials, spending, external transport, customer data, push, Preview, Production or deployment.
