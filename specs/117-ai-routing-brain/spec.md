# Feature Specification: ENDVERA AI Routing Brain R36A

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-02  
**Status**: Accepted for local implementation  
**Evidence basis**: founder direction plus existing Model Gateway `CODE`; provider performance and adoption remain `UNKNOWN`.

## Problem Statement

Construction owners should be able to text, call or use the ENDVERA app without
knowing which model, search engine, business tool or human specialist is needed.
Today the assistant has durable operational workflows and a controlled Model
Gateway, but it does not yet expose one closed routing decision that chooses
between canonical state, deterministic tools, specialized research, a strong
reasoning model and human support.

The denominator is every authorized inbound assistant request. Demand for
specific providers and willingness to pay for multi-model access remain
`UNKNOWN`; the founder has selected the routing capability as product direction.

## User Scenarios & Testing

### User Story 1 — One assistant, hidden orchestration (Priority: P1)

An owner sends a natural-language request to ENDVERA. ENDVERA determines the
required capability and returns one route decision without asking the owner to
choose a model or tool.

**Independent Test**: Requests for canonical project state, calendar mutation,
communication drafting, research and complex reasoning each resolve to a
different closed capability while the user-facing identity remains ENDVERA.

**Acceptance Scenarios**:

1. **Given** a question answerable from maintained project state, **when** it is
   routed, **then** the canonical-state tool wins over any model route.
2. **Given** a request to text a contact, **when** it is routed, **then** ENDVERA
   chooses the prepared-communication capability and does not authorize delivery.
3. **Given** an unsupported request, **when** it is routed, **then** ENDVERA
   refuses or prepares a bounded human escalation rather than inventing support.

### User Story 2 — Specialized public Web research from text (Priority: P1)

An owner texts ENDVERA to research a supplier, company, product or public
professional fact. ENDVERA prepares a specialized research route, requires
sources and separates public professional information from restricted personal
information.

**Independent Test**: A supplier-reputation request prepares a specialized
research candidate with mandatory citations; a request for a private home
address or sensitive personal data is refused.

**Acceptance Scenarios**:

1. **Given** a public professional research request, **when** it is routed,
   **then** a specialized-research candidate is prepared, citations are
   mandatory, and execution remains disabled until that route is certified.
2. **Given** a named-person request, **when** only public professional facts are
   requested, **then** the route uses the personal-data privacy ceiling.
3. **Given** a request for restricted personal information, **when** it is
   classified, **then** the request is refused before any provider dispatch.

### User Story 3 — Best eligible controller candidate, not a hard-coded vendor (Priority: P1)

For complex or ambiguous work, ENDVERA selects the first eligible controller
candidate allowed by the operation policy, privacy requirement, budget,
availability and evidence instead of hard-coding one vendor. A candidate cannot
execute until a later release certifies and authorizes it.

**Independent Test**: Changing the versioned route order changes the prepared
controller candidate while the same safety and budget constraints remain in force.

**Acceptance Scenarios**:

1. **Given** multiple eligible candidates, **when** policy is evaluated, **then**
   the first eligible version-pinned route is selected.
2. **Given** an OpenRouter candidate and a direct-provider candidate, **when**
   neither has external authority, **then** a candidate may be prepared but no
   dispatch occurs.
3. **Given** expired privacy evidence, an open breaker or insufficient budget,
   **when** the route is evaluated, **then** it is skipped or refused with an
   exact reason.

### User Story 4 — Bounded fallback and human support (Priority: P2)

When a specialist route is unavailable, ENDVERA follows only an explicit
fallback chain. If no safe model or tool remains, it creates a bounded human
handoff with a machine resume point.

**Independent Test**: A research route can fall back to the next registered
eligible candidate and then to human review, but never to an unregistered route.

### User Story 5 — Reconstructible and private decisions (Priority: P2)

An operator can reconstruct why ENDVERA selected a route without seeing raw
messages, credentials or sensitive research content.

**Independent Test**: The decision contains policy, route and request
fingerprints, reason codes, cost/privacy ceilings and zero raw content.

## Edge Cases

- A message mixes a calendar mutation and a research request.
- A request is ambiguous about whether the subject is a company or a person.
- A provider candidate is listed but not externally authorized.
- All model routes are unavailable while an internal canonical answer exists.
- The same request identifier is replayed after policy changes.
- A provider marketing claim conflicts with expired route evidence.
- A model proposes an unregistered tool or a higher-risk external write.

## Functional Requirements

- **FR-001**: The system MUST expose one versioned, closed routing contract for
  every authorized assistant request.
- **FR-002**: The system MUST classify requests into registered capability
  families and MUST refuse unknown capability keys.
- **FR-003**: Canonical operational state and deterministic internal tools MUST
  take precedence over model knowledge for business-state questions.
- **FR-004**: The user MUST NOT be required to select a model, provider or tool.
- **FR-005**: Route decisions MUST consider operation type, data class, privacy,
  cost ceiling, route evidence, availability and risk.
- **FR-006**: “Best model” MUST mean the first eligible route in a versioned,
  evidence-backed policy, never an unqualified claim of global superiority.
- **FR-007**: OpenRouter, direct-model and specialized-search routes MUST remain
  replaceable adapters behind the internal Model Gateway.
- **FR-008**: A public professional research request MUST require source-bearing
  output and MUST use the personal-data privacy ceiling when a person is named.
- **FR-009**: Requests for private addresses, financial details, credentials,
  protected identifiers or other restricted personal data MUST be refused.
- **FR-010**: External communication and external writes MUST remain prepared
  and approval-bound unless separately authorized.
- **FR-011**: Fallback MUST follow an explicit, bounded, versioned chain and MUST
  never select an unregistered route.
- **FR-012**: Human fallback MUST contain bounded context, expected output,
  verification criteria and a machine resume point.
- **FR-013**: Replayed requests MUST preserve one immutable routing decision for
  the accepted request version.
- **FR-014**: Audit evidence MUST contain fingerprints and reason codes but no
  raw prompt, response, contact coordinate, credential or provider dump.
- **FR-015**: Local R36A execution MUST perform zero provider dispatch and zero
  external effect.
- **FR-016**: Provider candidates MUST be visibly labelled candidate-only until
  R37 produces exact sandbox evidence and authority.
- **FR-017**: Mixed consequential intents MUST require clarification or a split
  plan before any write-capable action is prepared.
- **FR-018**: A model-produced plan MUST be revalidated against the same closed
  registry before any capability can advance.

## Key Entities

- **Assistant Routing Request**: channel-neutral intent with stable identity,
  workspace, data class, risk and cost ceiling.
- **Capability Family**: closed description of the result type ENDVERA needs.
- **Routing Policy Version**: immutable ordered routes and bounded fallbacks.
- **Route Candidate**: version-pinned internal tool, specialist service, model
  gateway path or human capability with exact eligibility metadata.
- **Routing Decision**: immutable selected/refused/prepared outcome and reason.
- **Human Handoff Plan**: minimal context, expected result, verification and
  resume point.

## Authorization, Privacy and Economics

- Only active authorized workspace members may submit requests.
- The route may never lower the request data classification or privacy ceiling.
- Provider and human spend are bounded in integer microdollars; an absent ceiling
  refuses paid routing.
- R36A authorizes local code, tests and local commits only. It authorizes no key,
  provider, SMS, voice, email, Web research, external write or customer data.

## Failure, Verification, Rollback and Observability

- Unknown intent, route or provider metadata fails closed.
- A prepared route is not a completed result and cannot be represented as one.
- Research completion requires source-bearing output validation in a later
  provider-authorized release.
- Routing policy changes create a new version; historical decisions retain the
  original hashes.
- Rollback retires the candidate policy and restores the prior published order;
  it never rewrites historical decisions.
- Operational evidence records only bounded metadata and hashes.

## Explicit Exclusions

- No live OpenRouter, Perplexity or direct-model call.
- No provider selection claim based on current pricing or marketing.
- No API key, OAuth, external Web search, real SMS, call or email.
- No autonomous external write, contact enrichment or private-person lookup.
- No claim of “all models,” globally best model, production readiness, PMF or
  Verified-E2E.

## Success Criteria

- **SC-001**: 100% of test requests resolve to a registered capability, explicit
  clarification, bounded human handoff or refusal.
- **SC-002**: 100% of canonical-state questions prefer internal truth over model routes.
- **SC-003**: 100% of public-person research routes require citations and the
  personal-data privacy ceiling.
- **SC-004**: 100% of restricted-person requests are refused before dispatch.
- **SC-005**: 100% of external candidates remain non-dispatched in R36A.
- **SC-006**: Replaying the same accepted request produces the same decision fingerprint.
- **SC-007**: Audit projections contain zero raw content and zero credentials.
- **SC-008**: Unknown and ineligible routes fail closed with exact reason codes.

## Assumptions

- Existing Model Gateway policy, privacy, budget, fallback, evidence and breaker
  controls remain authoritative for eventual execution.
- Perplexity and OpenRouter are candidate examples, not adopted vendors.
- Provider comparison, benchmarks, privacy certification, pricing and exact API
  contracts will be researched and observed under R37 authority.
