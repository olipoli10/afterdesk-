# Feature Specification: Model Gateway v1

**Feature Branch**: `codex/model-gateway-v1`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "Create the next accepted Spec Kit feature after HumanWorkUnit: a certified boundary between the platform and any model provider, with policy-controlled routing, explicit fallbacks, spend breakers, privacy and zero-data-retention posture, observability, replay safety, and a tested escape hatch to a direct-provider path. Start with classification as the first canary. Preserve direct-provider parity and prohibit silent substitutions. No gateway or provider candidate is adopted by this specification."

---

## Problem Statement and Evidence

The platform currently reaches external model providers through several bounded call sites, but provider selection, privacy posture, retry semantics, cost controls, error classification and evidence are not expressed as one certified product boundary. A new provider or gateway could therefore be integrated inconsistently, and a fallback could change the model, data posture, price or behaviour without a single authoritative decision record. `CODE` — multiple current provider-facing call sites and spend controls exist; `TEST` — the existing suite proves a closed provider-client set and metering at those sites; `INFERRED` — a single certified boundary is needed before evaluating gateway candidates.

The first denominator is deliberately narrow: classification operations admitted under one certified Model Gateway policy. The number of real production classification operations, their provider failure distribution, the achievable quality improvement, and the cost or latency advantage of any gateway candidate are `UNKNOWN`. V1 must prove the boundary and its failure behaviour before it can justify broader routing.

### Explicitly unmeasured

| Question | Evidence label |
| --- | --- |
| Which gateway or direct provider should be adopted | `UNKNOWN` |
| Whether multi-provider routing improves classification quality | `UNKNOWN` |
| Whether a gateway lowers total provider cost | `UNKNOWN` |
| Whether fallbacks improve completion rate without reducing truthfulness | `UNKNOWN` |
| Production classification volume and provider-error distribution | `UNKNOWN` |
| Revenue, retention or margin impact | `UNKNOWN` |

This specification does not convert a candidate in the Tool Radar into an architectural dependency. Candidate adoption requires a separate bake-off and decision record.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The runtime obtains one policy-compliant classification (Priority: P1)

The runtime asks for a classification without choosing a vendor. The gateway evaluates the operation, frozen contract context, data classification, approved model profiles, privacy constraints and cost ceiling. It either produces one authorized routing decision before dispatch or refuses the operation before any provider sees data or any provider spend is incurred.

**Why this priority**: Classification is the first canary named by the roadmap. It is small enough to certify end to end and important enough to prove that all provider calls can be governed by one boundary.

**Independent Test**: Submit representative allowed and refused classification fixtures through the gateway. Verify that every allowed fixture receives one durable pre-dispatch decision and one bounded attempt, while every refused fixture causes no external dispatch and names a stable refusal class.

**Acceptance Scenarios**:

1. **Given** a classification request whose operation, data class, model profile, privacy posture and maximum cost are all certified, **When** the runtime requests a classification, **Then** one policy decision is recorded before dispatch and the selected route cannot change inside that attempt.
2. **Given** a request with a missing, unknown, expired or contradictory policy fact, **When** admission is evaluated, **Then** the request is refused before dispatch, no fallback is guessed, and no provider spend is attributable to it.
3. **Given** two equivalent replays of the same logical operation, **When** the first attempt has a durable conclusive outcome, **Then** the replay returns or references that outcome without emitting another provider call.
4. **Given** a successful provider response, **When** the gateway returns the classification, **Then** the result is bound to the exact route, policy version, request fingerprint, response evidence and measured usage that produced it.

---

### User Story 2 - A provider failure follows an explicit fallback contract (Priority: P1)

An authorized classification route can fail through rate limiting, timeout, quota, authentication, invalid request or provider failure. The gateway distinguishes those outcomes and follows only the fallback sequence frozen before the first dispatch. A fallback is a new, separately authorized and cost-bounded attempt; it is never a silent substitution inside the original attempt.

**Why this priority**: Fallback convenience is where unreviewed model substitution, privacy regression and unbounded cost most easily enter the system.

**Independent Test**: Inject every supported provider failure class into a request with and without an authorized fallback. Verify that only eligible failure classes advance to the next frozen route, every new attempt obtains its own authorization and spend reservation, and all other failures stop without dispatching another provider call.

**Acceptance Scenarios**:

1. **Given** a route whose policy permits one named fallback for a rate-limit failure, **When** the first attempt is conclusively rate limited, **Then** the gateway may create one new attempt on that exact fallback only after rechecking privacy, capability and remaining cost.
2. **Given** a failure whose class is not eligible for fallback, **When** the failure is classified, **Then** the operation stops with that class and no substitute model or provider is called.
3. **Given** a timeout or connection loss for which dispatch may have occurred but the provider outcome is unknown, **When** the gateway cannot prove non-dispatch, **Then** it records uncertain spend, does not release the reservation as unused, and does not blindly replay the attempt.
4. **Given** a fallback route with weaker privacy, incompatible capability, stale certification or insufficient remaining budget, **When** it is considered, **Then** it is refused even if it would otherwise improve availability.
5. **Given** any completed operation, **When** an operator inspects it, **Then** the primary route, every attempted fallback, every refusal and the final outcome are distinguishable; no surface describes them as one opaque provider call.

---

### User Story 3 - An operator can stop unsafe or expensive dispatch (Priority: P1)

An authorized operator can disable a provider profile, model profile or routing policy when its certification expires, its privacy posture changes, its error rate rises, or its spend breaker opens. New dispatches fail closed immediately. In-flight attempts keep their already-frozen meaning and are reconciled rather than silently moved.

**Why this priority**: A certified boundary is not credible unless it can be closed quickly without changing already-dispatched work.

**Independent Test**: Open each breaker and revoke each route type while requests are pending, admitted and already dispatched. Verify that new admissions stop, admitted-but-not-dispatched operations recheck and stop, and dispatched attempts retain their route identity until a conclusive or uncertain outcome is recorded.

**Acceptance Scenarios**:

1. **Given** a disabled or expired route, **When** a new operation is admitted, **Then** no provider dispatch occurs and the refusal identifies the controlling policy condition.
2. **Given** an operation admitted before a route is disabled but not yet dispatched, **When** it reaches the dispatch boundary, **Then** authorization is rechecked and the operation is refused if the route is no longer valid.
3. **Given** an attempt already dispatched when a breaker opens, **When** its outcome arrives, **Then** the outcome is reconciled under the frozen attempt identity and is not reassigned to another route.
4. **Given** a breaker reset, **When** new operations arrive, **Then** only policies and routes currently certified may resume; historical attempts and decisions remain unchanged.

---

### User Story 4 - A privacy reviewer can prove what each route may receive (Priority: P2)

A privacy reviewer can inspect a route profile and determine which operation classes and data classifications it may process, whether retention or training is permitted, what evidence supports its privacy posture, when that evidence expires, and which regions or tenancy constraints apply. The model never receives secrets, credentials or data outside the request's minimum authorized projection.

**Why this priority**: Zero-data-retention and privacy claims are route-specific, time-sensitive facts. Treating them as a provider-wide slogan would create a false safety boundary.

**Independent Test**: Exercise every data class against every certified and uncertified route profile. Inspect the exact outbound projection and prove that disallowed classes, credentials, identifiers and undeclared context never leave the platform.

**Acceptance Scenarios**:

1. **Given** a route profile certified only for public business data, **When** a request contains a more restrictive class, **Then** admission fails before any outbound request is formed.
2. **Given** a route whose zero-data-retention evidence is absent, expired or scoped differently from the selected model or endpoint, **When** policy requires zero retention, **Then** the route is ineligible.
3. **Given** an allowed request, **When** its outbound projection is formed, **Then** it contains only the minimum fields required by the operation and never contains platform secrets, provider credentials, unrelated tenant data or raw audit material.
4. **Given** a privacy certification change, **When** an auditor reviews historical attempts, **Then** each attempt still points to the exact evidence and policy version in force when it was dispatched.

---

### User Story 5 - The platform can escape a gateway without changing the contract (Priority: P2)

The platform can route the same certified classification contract through a direct-provider path. The direct path is not an emergency bypass around policy: it must satisfy the same admission, privacy, cost, error, replay, observability and evidence obligations as a gateway-mediated route.

**Why this priority**: The direct path is the practical protection against gateway lock-in and is an explicit roadmap requirement.

**Independent Test**: Run the same conformance fixtures through a gateway-mediated candidate and its certified direct-provider counterpart. Verify equivalent policy decisions, refusal semantics, accounting, evidence and externally visible result contract.

**Acceptance Scenarios**:

1. **Given** a certified direct-provider profile, **When** policy selects it, **Then** it passes through the same admission and accounting boundary as every gateway-mediated route.
2. **Given** a gateway outage, **When** no direct path was preauthorized for the operation, **Then** the system stops rather than constructing an implicit direct bypass.
3. **Given** both gateway and direct paths for the same model capability, **When** conformance is measured, **Then** differences in result, usage, errors, latency and metadata are exposed rather than normalized away.
4. **Given** a gateway candidate is removed, **When** operations are moved to a direct route by a new policy version, **Then** historical route evidence remains exportable and no accepted contract is rewritten.

---

### User Story 6 - An auditor can reconstruct every provider decision without seeing sensitive content (Priority: P2)

An auditor can reconstruct why a route was eligible, which policy chose it, whether a fallback was allowed, what was dispatched, how much was reserved and measured, what failed, and which result was returned. The evidence is useful without storing raw prompts, raw outputs, credentials or customer secrets in ordinary logs.

**Why this priority**: Routing, spend and privacy controls that cannot be reconstructed after an incident are assertions, not a certified boundary.

**Independent Test**: Complete successful, refused, fallback, ambiguous-timeout and breaker-open operations. Reconstruct each using only authorized evidence and prove that ordinary logs contain no raw content or secret material.

**Acceptance Scenarios**:

1. **Given** any gateway operation, **When** an authorized auditor inspects it, **Then** the logical operation, request fingerprint, tenant boundary, policy version, route profile, attempt sequence, spend state, timing, error class and final disposition are reconstructable.
2. **Given** an ordinary application or provider log, **When** it is inspected, **Then** it contains no raw prompt, raw model output, credential, secret or unredacted sensitive customer value.
3. **Given** a provider invoice or usage export, **When** it is reconciled, **Then** recorded attempts can be matched or discrepancies can be isolated without exposing request content.
4. **Given** unavailable audit storage or an inability to persist the required pre-dispatch evidence, **When** a new operation reaches the boundary, **Then** dispatch is refused.

---

### Edge Cases

- A route is certified for a provider family but not for the requested model or endpoint.
- A model alias changes its underlying version after certification.
- A route supports the operation but not the request's data class, region, retention posture or maximum cost.
- The same provider is reachable through a gateway and directly, but the two paths report usage or errors differently.
- Dispatch succeeds but the response is lost; spend and provider outcome are uncertain.
- The provider returns a response with missing or malformed usage data.
- A fallback response is valid in shape but semantically incompatible with the operation's required output contract.
- Two workers replay the same logical operation concurrently.
- A breaker opens between admission and dispatch.
- A policy or certification expires while an attempt is in flight.
- Audit persistence succeeds but spend reservation fails, or the reverse.
- A provider SDK attempts an automatic retry that the platform did not authorize.
- A candidate gateway caches, retries, transforms or logs a request contrary to the certified profile.
- A request contains prompt injection or instructions attempting to select a provider, raise a budget or weaken privacy.
- A tenant identifier is absent or mismatched.

---

## Requirements *(mandatory)*

### Functional Requirements

#### A. Closed policy and admission boundary

- **FR-001**: Every provider-bound model operation MUST enter through one certified Model Gateway admission boundary before any provider client, gateway client or outbound request is constructed.
- **FR-002**: V1 MUST support `classification` as its first canary operation and MUST refuse every other operation type until that operation is separately certified and enabled.
- **FR-003**: Admission MUST evaluate an immutable operation request containing the logical operation identity, tenant identity, accepted contract or source context when applicable, operation type, data classification, required output contract, maximum total provider cost, privacy requirements and routing policy identifier.
- **FR-004**: Routing policies, provider profiles and model profiles MUST form a closed, versioned allowlist. A provider, gateway, endpoint, model alias or fallback not present in the applicable version MUST be ineligible.
- **FR-005**: Missing, unknown, expired, malformed or contradictory admission data MUST fail closed before dispatch and MUST NOT be replaced by a default inferred from customer content, model output or provider metadata.
- **FR-006**: Customer text, prompt content, model output and provider responses MUST NOT select a route, expand an allowlist, raise a ceiling, authorize a fallback or weaken a privacy requirement.
- **FR-007**: Every admitted attempt MUST have one immutable pre-dispatch routing decision. The provider, path, endpoint profile, model profile and policy version MUST NOT change inside that attempt.

#### B. Certified route profiles and privacy

- **FR-008**: A certified route profile MUST identify the provider path, provider and model capability, endpoint scope, supported operation types, allowed data classifications, retention and training posture, region or residency constraints, maximum request and response bounds, pricing evidence, certification evidence, certification owner, effective time and expiry time.
- **FR-009**: A route requiring a zero-data-retention or equivalent posture MUST be eligible only when current evidence covers the exact provider path, model or endpoint, tenancy mode and operation in use. A marketing claim or provider-family statement alone MUST NOT qualify.
- **FR-010**: The outbound request MUST contain only the minimum authorized projection required for the operation. Credentials, platform secrets, raw audit material, unrelated tenant data and undeclared context MUST never be included.
- **FR-011**: Provider credentials MUST be isolated by route and environment, MUST never be visible to a model, and MUST never appear in decision evidence, ordinary logs or user-facing errors.
- **FR-012**: Tenant identity MUST be present and validated at admission. Cross-tenant context, cache reuse or evidence association MUST be refused unless an explicit isolation proof permits it.
- **FR-013**: Historical attempts MUST retain the exact certification evidence and policy version used at dispatch even after a route is changed, expired or removed.

#### C. Routing, fallback and direct-provider parity

- **FR-014**: A routing policy MUST state an ordered set of eligible routes or an explicit refusal. It MUST include the failure classes eligible for fallback, the maximum number of attempts and the total provider cost ceiling.
- **FR-015**: The gateway MUST prohibit silent provider, model, endpoint or version substitution. Any fallback MUST be a new attempt with a new decision and its own evidence.
- **FR-016**: Before each fallback attempt, the gateway MUST recheck operation compatibility, data classification, privacy posture, certification validity, breaker state and remaining total cost.
- **FR-017**: Authentication errors, invalid requests, policy refusals, malformed outputs and unknown failures MUST NOT fallback unless the frozen policy explicitly names that exact class and the route remains safe.
- **FR-018**: A direct-provider route MUST satisfy the same admission, privacy, accounting, replay, error, observability and evidence contracts as a gateway-mediated route. It MUST NOT be a bypass around the boundary.
- **FR-019**: V1 MUST provide a conformance comparison that exposes differences between a gateway-mediated route and a direct-provider route for the same certified classification fixtures.
- **FR-020**: No candidate named in the Tool Radar MUST be marked adopted, preferred or production-ready solely because it conforms to this specification.

#### D. Spend integrity and breakers

- **FR-021**: Every billable attempt MUST reserve a conservative maximum cost before dispatch. A refusal or inability to reserve MUST prevent dispatch.
- **FR-022**: The total of all primary and fallback attempt reservations for one logical operation MUST remain within the immutable maximum total provider cost accepted at admission.
- **FR-023**: A conclusively non-dispatched attempt MAY release its reservation. A dispatched attempt MUST settle measured cost when conclusive evidence exists or remain classified as uncertain when it does not.
- **FR-024**: A timeout, dropped connection or lost response MUST NOT be treated as proof of non-dispatch. Its reservation MUST NOT be released as unused solely because no response arrived.
- **FR-025**: Provider SDKs, gateway products and network clients MUST NOT perform retries, hedges, caches or substitutions outside the attempt sequence authorized and accounted for by the gateway policy.
- **FR-026**: Breakers MUST be able to refuse new dispatch by provider path, model profile, policy, error condition and spend condition. Breaker state MUST be evaluated again immediately before dispatch.
- **FR-027**: Opening, closing or resetting a breaker MUST be authorized and audited. It MUST NOT rewrite a historical decision or move an already-dispatched attempt to another route.
- **FR-028**: User-facing and worker-facing refusal messages MUST NOT reveal provider names, secret configuration, internal cost ceilings or tenant activity.

#### E. Replay, concurrency and error semantics

- **FR-029**: Every logical operation and every provider attempt MUST have stable identities. Concurrent or repeated processing of the same logical operation MUST converge without creating an unauthorized duplicate attempt.
- **FR-030**: A conclusive durable result MUST be replayed or referenced without another provider dispatch.
- **FR-031**: An ambiguous dispatched attempt MUST enter an explicit uncertain state. Automated replay MUST wait for a policy-authorized reconciliation outcome and MUST NOT assume the provider did no work.
- **FR-032**: Provider failures MUST use a stable taxonomy that distinguishes at least policy refusal, authentication, quota, rate limit, timeout, invalid request, malformed response, provider failure, uncertain outcome and unknown failure.
- **FR-033**: A response MUST satisfy the certified output contract before it can become the operation result. A shape-valid but semantically ineligible response MUST be refused and retained only as attempt evidence.
- **FR-034**: The gateway MUST preserve the platform's accepted scope, criteria, data classification and economics. Model output MUST NOT add obligations or reinterpret the accepted contract.

#### F. Evidence, observability and reconciliation

- **FR-035**: The policy decision and its required audit evidence MUST be durable before dispatch. If required evidence cannot be persisted, dispatch MUST fail closed.
- **FR-036**: For each logical operation, authorized audit MUST reconstruct the tenant boundary, request fingerprint, operation type, policy version, route decision, attempt order, breaker state, privacy evidence, reservation and spend state, timing, error class and final disposition.
- **FR-037**: Ordinary logs and decision evidence MUST NOT contain raw prompts, raw model outputs, credentials, secrets or unredacted sensitive customer values. Content evidence MUST use authorized protected storage and minimum-necessary access where retention is required.
- **FR-038**: Each successful result MUST be bound to the exact request fingerprint, route profile, model profile, attempt and response evidence that produced it.
- **FR-039**: Usage and cost evidence MUST preserve the provider's reported facts, the platform's estimate and any reconciliation difference as distinct values. Missing usage MUST NOT be invented or labelled measured.
- **FR-040**: Evidence MUST be exportable enough to compare a gateway route with a direct route and to reconcile provider invoices without requiring raw customer content.
- **FR-041**: Metrics MUST distinguish refused-before-dispatch, dispatched-success, dispatched-failure, fallback-attempted, uncertain outcome, breaker-open and replay-without-dispatch. These categories MUST NOT be collapsed into one success rate.
- **FR-042**: Quality, latency, cost, privacy, availability and lock-in MUST remain separate evaluation dimensions. V1 MUST NOT publish a single composite score that hides a failure in one dimension.

#### G. Rollout and rollback

- **FR-043**: Model Gateway routing MUST be off by default for production operations until the classification conformance gate, privacy review, spend/replay tests and direct-path parity gate pass.
- **FR-044**: Rollout MUST be controllable by operation type and routing policy. Enabling classification MUST NOT enable planning, critique, generation, embeddings or tool execution.
- **FR-045**: Disabling a policy or route MUST stop new admissions and admitted-but-not-dispatched attempts immediately, while allowing already-dispatched attempts to be reconciled under their frozen identities.
- **FR-046**: Rollback MUST preserve historical decisions, evidence, spend states and results. It MUST NOT silently reclassify a gateway-mediated attempt as direct or vice versa.
- **FR-047**: The first production-capable release MUST retain at least one separately certified direct-provider path for the classification canary or stop rollout; it MUST NOT make a third-party gateway the only trust boundary.

### Key Entities

- **Gateway Operation**: One logical, replayable request for a certified model capability. It carries immutable policy inputs and owns an ordered set of attempts.
- **Routing Policy Version**: The closed decision contract that defines eligible routes, fallback classes, attempt bounds, total cost ceiling and breaker requirements for one operation type.
- **Certified Route Profile**: A versioned provider-path and model capability profile with privacy, data-class, region, pricing, evidence and expiry constraints.
- **Routing Decision**: The immutable pre-dispatch choice or refusal for one attempt, including the facts and policy version that made it valid.
- **Provider Attempt**: One authorized possibility of external dispatch. It has its own route, reservation, timing, outcome and evidence and cannot silently mutate into another route.
- **Spend Reservation**: The conservative maximum provider cost held before one attempt. It ends as released-only-if-not-dispatched, settled, or uncertain.
- **Breaker State**: An authorized control that makes a route, model or policy ineligible because of spend, safety, certification or operational conditions.
- **Privacy Evidence**: Time-bounded proof supporting retention, training, residency and endpoint claims for a specific certified route profile.
- **Gateway Evidence Record**: Redacted, exportable evidence connecting the operation, decision, attempt, accounting, failure and result without placing raw sensitive content in ordinary logs.

---

## Authorization, Tenancy and Data Classification

- The runtime may request an operation but cannot authorize its own route, fallback, budget or privacy posture.
- Only an authorized platform operator may certify or revoke route profiles, publish routing policy versions, or reset breakers.
- Every operation belongs to exactly one tenant boundary. A missing or conflicting tenant identity is a refusal.
- The existing platform data classification remains authoritative. V1 adds no new lower classification and never promotes sampled or inspected content into provider eligibility.
- Provider access is allowed only through the minimum projection authorized for the exact operation and route profile.

---

## Failure Ownership and Safe Next Action

| Failure state | Owner | Safe next action |
| --- | --- | --- |
| Admission or policy refusal | Platform operator | Correct or certify the missing policy fact; do not force dispatch |
| Privacy evidence absent or expired | Privacy reviewer | Renew evidence or remove the route from eligibility |
| Spend reservation refused | Platform operator | Keep the operation stopped; change future policy only through an authorized version |
| Conclusive retry-eligible provider failure | Gateway policy | Start only the next preauthorized, rechecked attempt |
| Non-fallback provider failure | Platform operator | Inspect and resolve; do not substitute silently |
| Ambiguous dispatched attempt | Operations / finance | Reconcile provider evidence and spend before any replay |
| Breaker open | Authorized operator | Investigate and explicitly reset or keep closed |
| Audit persistence unavailable | Platform operator | Restore the evidence boundary before dispatch resumes |
| Output contract failure | Operation owner | Treat as failed attempt evidence; never accept it as the result |

---

## Economics

- No client price, worker payout or accepted task economics changes in V1.
- Each operation carries an immutable maximum total provider cost, and each attempt reserves a conservative portion before dispatch.
- Provider-reported usage, estimated cost and reconciled cost remain distinct.
- The cost advantage of any gateway or fallback strategy is `UNKNOWN` until measured in the bake-off.
- An uncertain dispatched attempt is economically real risk and must not be represented as zero cost.

---

## Verification and Delivery Conditions

V1 is deliverable only when:

1. the classification canary passes allowed, refused, fallback, breaker, concurrency and ambiguous-outcome fixtures;
2. every provider dispatch in the canary is preceded by durable policy evidence and a spend reservation;
3. the privacy projection tests prove that disallowed data and secrets never leave the platform;
4. the same conformance contract passes for at least one gateway-mediated candidate and one direct-provider path, without implying adoption;
5. replay and concurrency tests prove no unauthorized duplicate dispatch;
6. mutation tests break the suite when silent substitution, unreserved dispatch, privacy bypass, hidden retry, ambiguous-spend release or missing pre-dispatch evidence is introduced;
7. rollout remains off by default until an explicit release decision records the passing evidence.

---

## Success Criteria *(mandatory)*

- **SC-001**: 100% of classification fixtures either receive one durable pre-dispatch routing decision or are refused with zero provider dispatch.
- **SC-002**: Across all conformance fixtures, there are zero silent provider, model, endpoint or version substitutions.
- **SC-003**: Every emitted provider attempt has exactly one prior spend reservation and ends as settled or explicitly uncertain; no emitted attempt is recorded as unused.
- **SC-004**: Concurrent and repeated processing of a conclusive logical operation produces one external attempt sequence and one final result lineage.
- **SC-005**: Every eligible fallback is separately authorized and remains inside the operation's total cost, privacy and attempt bounds; every ineligible fallback produces zero dispatch.
- **SC-006**: Every tested disallowed data-class and privacy-posture combination is refused before an outbound request exists.
- **SC-007**: Automated scans of ordinary logs and decision evidence find zero raw prompt, raw output, credential or secret values across success and failure fixtures.
- **SC-008**: An auditor can reconstruct 100% of tested decisions, attempts, spend states, error classes and final dispositions using authorized evidence.
- **SC-009**: Opening a breaker blocks 100% of new or not-yet-dispatched attempts under its scope and changes zero already-dispatched attempt identities.
- **SC-010**: Direct and gateway-mediated classification paths pass the same policy, privacy, accounting, replay and output-contract suite, with all behavioural differences reported.
- **SC-011**: Removing the selected gateway candidate leaves the direct-provider conformance path usable without rewriting historical operation evidence.
- **SC-012**: No success report claims improved quality, cost, coverage, revenue or reliability until measured evidence exists; each remains `UNKNOWN` or is reported by its actual evidence label.

---

## Out of Scope

- Selecting or adopting Anthropic direct, Vercel AI Gateway, Portkey, Cloudflare AI Gateway, OpenRouter or any other candidate.
- Extending the canary beyond classification.
- Choosing the best model, prompt, coding harness or agent workflow; that belongs to the separate Engineering Factory and AfterDesk-DevBench feature.
- Tool or MCP authorization, browser execution, payments, email sending or generalized external WRITE.
- Changing accepted client scope, price, worker payout, margin rules or HumanWorkUnit behaviour.
- Building a customer-facing model picker or exposing provider names and internal budgets to customers or workers.
- Claiming production zero-data-retention without route-specific current evidence.
- Building an autonomous optimizer that changes routes or policies from model output or live performance without operator approval.
- Replacing protected content storage, retention or purge systems.

---

## Assumptions

1. Classification remains the only V1 canary because it is the roadmap-authorized first slice.
2. Existing accepted-contract, data-classification and spend-accounting rules remain authoritative and may be extended but not weakened.
3. A route profile is certified for an exact path and capability, not for a provider brand in general.
4. Provider-side idempotency may be absent; the gateway therefore treats ambiguous dispatch as uncertain rather than promising impossible exactly-once external execution.
5. Candidate bake-offs will use the same frozen conformance fixtures and will preserve separate quality, latency, cost, privacy, availability and lock-in results.
6. Engineering Factory work may consume certified Model Gateway profiles later, but it cannot decide this feature's production routing policy.

---

## Constitution Compliance

- **Outcome ownership and truth**: The feature promises a certified boundary and reconstructable evidence, not improved model quality or business results. Those outcomes remain `UNKNOWN`.
- **Closed-world contracts**: Operation types, routing policies, route profiles and fallbacks are versioned allowlists; unsupported states fail closed.
- **Immutable acceptance**: No route, retry or model response can change accepted scope, criteria, classification or economics.
- **Authorization and privacy**: The runtime and model cannot authorize routes or weaken controls; minimum projection, tenant isolation and route-specific evidence are mandatory.
- **Economic integrity**: Every attempt reserves before dispatch; ambiguous dispatch retains uncertain spend; total fallback cost is bounded.
- **Durable replay**: Logical operations and attempts have stable identities, and uncertain external outcomes are never hidden behind blind retries.
- **Verification and evidence**: Result-contract validation is separate from provider success, and ordinary observability remains redacted.
- **Vendor independence**: Direct-provider parity is part of acceptance, while every vendor remains a candidate until a separate decision record adopts it.
