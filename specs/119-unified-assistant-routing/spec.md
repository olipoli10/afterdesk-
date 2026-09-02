# Feature Specification: Unified Assistant Routing

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-02

**Status**: Accepted

**Input**: Route the real ENDVERA assistant through the provider-neutral AI Routing Brain while deferring all real provider work. Preserve the existing operational assistant for internal state and action requests, surface provider-required work honestly, and never fabricate a researched or model-generated result.

## User Scenarios & Testing

### User Story 1 - One assistant entry point (Priority: P1)

As an authorized construction owner or office administrator, I can send an ordinary assistant request from the mobile experience and ENDVERA uses one hidden routing decision before handling it. Calendar, project-state and communication-draft requests continue through the existing deterministic operational engine.

**Why this priority**: The routing brain has no product value while the real assistant bypasses it.

**Independent Test**: Submit state, calendar and message-draft requests through the real assistant boundary and verify that each receives an internal routing projection, the existing canonical effect occurs exactly once, and no external provider is contacted.

**Acceptance Scenarios**:

1. **Given** an authorized owner and an existing workspace, **When** the owner asks what is scheduled tomorrow, **Then** ENDVERA answers from canonical operational state and reports an internal route without exposing any provider or model name.
2. **Given** an authorized administrator, **When** the administrator asks to create a clear appointment, **Then** the existing calendar transition occurs exactly once and the routing projection identifies an internal tool path.
3. **Given** a request to draft a text message, **When** the request is accepted, **Then** the message remains prepared and unsent and the routing projection states that approval is required.

---

### User Story 2 - Honest deferred intelligence (Priority: P2)

As an owner, I can ask ENDVERA to research a public business topic or perform reasoning that will eventually use a specialist model. Until a provider is authorized, ENDVERA records the recognized request and clearly says that execution is not yet authorized instead of returning a fabricated answer.

**Why this priority**: The user needs one assistant even before external providers are enabled, but false research would destroy trust.

**Independent Test**: Submit a public research request and verify that the request and ENDVERA response are durable and replay-safe, the result contains no invented claim or citation, and every provider/dispatch flag remains false.

**Acceptance Scenarios**:

1. **Given** a public business-research request, **When** no provider authority exists, **Then** ENDVERA returns a provider-required-not-authorized outcome with no research conclusion, citation, provider name, model name or external effect.
2. **Given** the same request identifier and exact request, **When** it is replayed, **Then** ENDVERA returns the same durable result without creating a second canonical effect.
3. **Given** the same request identifier with different content, **When** it is submitted, **Then** ENDVERA refuses the mismatch and preserves the first accepted record.

---

### User Story 3 - Safe refusal and channel parity (Priority: P3)

As ENDVERA, I apply the same routing policy to equivalent portal, mobile, SMS, email and voice-transcript inputs. Restricted personal research is refused, mixed research-and-action requests require clarification, and unsupported work can be directed toward bounded human support without silently creating human work.

**Why this priority**: Provider-neutral routing is only trustworthy if channel choice cannot bypass policy.

**Independent Test**: Route equivalent messages through every supported channel and compare the policy outcome while verifying that restricted and mixed requests never reach the existing operational executor.

**Acceptance Scenarios**:

1. **Given** equivalent requests from supported channels, **When** they are routed, **Then** their intent, capability, disposition and safety requirements agree.
2. **Given** a request for restricted personal data, **When** it is routed, **Then** ENDVERA refuses it without executing an internal tool, provider or human task.
3. **Given** a request that combines web research with a consequential action, **When** it is routed, **Then** ENDVERA asks the user to separate or clarify the requests before any write.

### Edge Cases

- A client-supplied provider or model name is treated as request text, never as routing authority.
- An empty, oversized, malformed, cross-workspace or unauthorized request is rejected by existing boundary validation and point-of-use authorization.
- Routing metadata exposed to clients omits route keys, adapter keys, model keys, cost estimates, policy internals and raw message fingerprints.
- Audit projections retain hashes and policy facts but never the raw message.
- A provider candidate becoming unavailable cannot cause fallback dispatch; the local response remains non-executed and truthful.
- Existing assistant history remains readable after the routing integration.

## Requirements

### Functional Requirements

- **FR-001**: Every accepted request at the real mobile assistant write boundary MUST receive a server-side routing decision before any operational execution.
- **FR-002**: The server MUST derive channel, data classification, privacy requirement, risk class and spending ceiling from trusted policy defaults; the client MUST NOT control them.
- **FR-003**: Internal canonical-state, calendar and communication-preparation dispositions MUST reuse the existing operational assistant and preserve its authorization, persistence, atomicity and replay behavior.
- **FR-004**: Provider-candidate dispositions MUST create no provider call, network dispatch, credential read, spend, external write or claimed provider result.
- **FR-005**: Provider-candidate dispositions MUST return a durable, replay-safe response explaining that the capability is recognized but not authorized for execution.
- **FR-006**: The durable provider-required response MUST contain zero research conclusion, invented fact, invented citation or assertion that external work occurred.
- **FR-007**: Restricted requests MUST be refused and mixed consequential requests MUST require clarification before any internal or external action.
- **FR-008**: Unsupported requests MAY expose bounded human support as a possible next path but MUST NOT automatically create or dispatch human work.
- **FR-009**: The client-visible routing projection MUST expose only disposition, capability, readiness, citation requirement, approval requirement and the two always-false external-effect flags.
- **FR-010**: The client-visible routing projection MUST NOT expose provider, adapter, model, route order, estimated spend, policy hash or internal fallback identifiers.
- **FR-011**: Equivalent requests across supported channels MUST apply the same classification and policy; channel may affect transport handling but MUST NOT relax safety.
- **FR-012**: Replaying the same workspace/request identifier with identical content MUST return the first accepted result; different content under that identifier MUST be refused.
- **FR-013**: Field workers, inactive members and cross-workspace actors MUST remain unable to use or inspect the owner/administrator assistant path.
- **FR-014**: Existing mobile assistant consumers MUST remain backward compatible with internal operational outcomes while accepting the new routing projection.
- **FR-015**: All claims produced by this feature MUST be labelled CODE, TEST or SYNTHETIC; it MUST NOT change provider, customer, production or Verified-E2E readiness.

### Authorization, Privacy, Economics, Verification, Rollout and Rollback

- Authorization is rechecked server-side at the point of use. Owner and admin are authorized; field worker and non-member are refused.
- Messages are business-confidential by default. The classifier may only increase, never decrease, the effective data and privacy restrictions.
- The local cost ceiling is zero for execution. Candidate estimates may inform planning but cannot authorize spend.
- Verification requires contract tests, pure routing tests, real mobile boundary wiring tests and PostgreSQL integration tests for durable replay behavior.
- Delivery is local code and test evidence only. No provider, customer, Preview, Production, push, store or deployment action is permitted.
- Rollback is an exact revert of the R36C integration commit; no schema or migration is introduced.

### Key Entities

- **Trusted Assistant Request**: The authenticated workspace request combined with server-derived channel and safety policy.
- **Routing Decision**: The immutable classification, capability, disposition and safety result produced before execution.
- **Client Routing Projection**: The minimal provider-neutral status safe to show in Web or mobile clients.
- **Deferred Assistant Exchange**: A durable inbound request and truthful ENDVERA response for work requiring authority that is not yet available.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of accepted mobile assistant requests pass through the unified routing boundary before operational execution.
- **SC-002**: 100% of existing internal assistant scenarios preserve their canonical result and exactly-once replay behavior.
- **SC-003**: 100% of provider-required scenarios produce zero provider calls, zero external effects, zero spend and zero invented facts or citations.
- **SC-004**: 100% of restricted, mixed, unauthorized and cross-workspace scenarios fail closed before consequential execution.
- **SC-005**: Client responses contain zero provider names, model names, adapter keys, route keys or internal cost estimates.
- **SC-006**: Equivalent supported-channel inputs yield identical intent, capability, disposition and safety requirements.
- **SC-007**: A process restart preserves deferred exchanges and exact replay behavior through the existing durable database.

## Assumptions

- R36A remains the canonical local routing policy and R36B remains only a credential-free sandbox preflight.
- Real provider activation, live web research, credentials and cost authorization are intentionally deferred.
- Existing R9/R2 persistence is retained for supported internal operations.
- The current mobile assistant endpoint is the first real product boundary wired to the router; channel-neutral server contracts make later SMS, email and voice wiring incremental.
- No database schema change or new dependency is necessary.
