# Feature Specification: ENDVERA Provider Sandbox Preflight R36B

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Accepted for local implementation
**Evidence basis**: founder direction, existing R36A routing code, and current official provider documentation. Provider quality, privacy behavior and cost remain `UNKNOWN` until R37 observation.

## Problem Statement

R36A can choose a research or controller candidate, but R37 cannot safely call a
provider until ENDVERA has one exact, bounded and reproducible sandbox contract.
The denominator is every provider candidate ENDVERA may admit for public Web
research or controller reasoning. Current demand, provider quality and
willingness to pay remain `UNKNOWN`.

R36B must prepare the complete local test apparatus without credentials,
network calls, provider SDKs or claims that a candidate works.

## User Scenarios & Testing

### User Story 1 — Exact provider candidate packet (Priority: P1)

An operator can see the exact candidate capability, endpoint family, privacy
requirements, cost ceiling, allowed data classes, expected output and required
R37 evidence before supplying any credential.

**Independent Test**: Every candidate packet is strict, versioned, hash-bound,
candidate-only and refuses an unknown field or missing ceiling.

### User Story 2 — Source-first public research contract (Priority: P1)

ENDVERA can locally compile a public supplier/company or professional-person
research request into a Perplexity Search candidate and normalize synthetic
ranked results into source evidence.

**Independent Test**: Company research and public professional research compile;
private-person research refuses; missing or invalid source URLs fail verification.

### User Story 3 — Explicit controller route contract (Priority: P1)

ENDVERA can locally prepare an OpenRouter controller request with one explicit
model profile, strict parameter support, no provider-side model fallback, denied
data collection and mandatory zero-data-retention routing.

**Independent Test**: The request plan contains the required constraints and no
credential; an unknown model profile or weaker privacy configuration is refused.

### User Story 4 — Comparable sandbox benchmark (Priority: P2)

R37 can compare a research candidate, an aggregated controller candidate and a
direct-controller control using the same synthetic cases, output schema,
verification rules and bounded economics.

**Independent Test**: Synthetic responses produce a sealed comparison report;
unequal inputs, unsourced facts, budget excess or candidate self-selection fail.

### User Story 5 — Exact R37 activation boundary (Priority: P2)

An operator knows precisely what authority and secret references are missing,
without storing a secret value or treating a prepared request as a call.

**Independent Test**: The campaign stays `PREPARED_NOT_AUTHORIZED`, contains
secret-reference names only, permits zero calls locally and cannot produce PASS.

## Edge Cases

- Provider documentation changes after the packet was sealed.
- A model alias resolves to a different model version.
- A provider claims ZDR but the exact endpoint evidence is absent or expired.
- A response contains citations that do not support a generated claim.
- One provider receives more context or a larger token budget than another.
- A provider response succeeds after the local cost or time ceiling expired.
- A public-person query drifts toward private contact or sensitive information.
- OpenRouter performs an implicit model/provider fallback not represented in ENDVERA audit.

## Functional Requirements

- **FR-001**: Each provider candidate MUST have one strict immutable packet with
  version, capability, endpoint family, data classes, privacy, risk, cost,
  output contract, verification and evidence expiry.
- **FR-002**: Candidate packets MUST cite dated official documentation and MUST
  remain `candidate_only` until observed in R37.
- **FR-003**: R36B MUST perform zero network request, zero provider dispatch and
  zero credential or environment-secret read.
- **FR-004**: Research preparation MUST allow public business and public
  professional facts only and MUST refuse restricted personal information.
- **FR-005**: Perplexity research preparation MUST request ranked source results,
  bounded result count, bounded content, explicit locale/region and a specialized
  people mode only for public professional research.
- **FR-006**: Normalized research results MUST retain title, direct URL, bounded
  snippet, source date when present and a stable source fingerprint.
- **FR-007**: A source-bearing answer MUST fail verification when a factual claim
  lacks a supporting normalized source.
- **FR-008**: OpenRouter controller preparation MUST name one exact model profile,
  require supported parameters, deny data collection, require ZDR and disable
  provider-side model fallback so ENDVERA retains fallback authority.
- **FR-009**: The controller payload MUST carry a strict output contract and MUST
  contain no ENDVERA credential, contact coordinate or unbounded raw business state.
- **FR-010**: The benchmark MUST give candidates identical input facts, order,
  locale, output schema, verification checks, time ceiling and cost ceiling.
- **FR-011**: The benchmark MUST record integer microdollar cost, latency,
  contract validity, citation coverage, unsupported claims and failure class.
- **FR-012**: No candidate may be labelled best, certified or ready when any
  required comparison evidence is missing.
- **FR-013**: A direct-controller control route MUST remain distinct from the
  OpenRouter route so gateway convenience does not masquerade as model quality.
- **FR-014**: R37 campaign preparation MUST declare maximum call count, maximum
  total spend, allowed synthetic cases, stop conditions and exact secret-reference names.
- **FR-015**: Secret references MUST never contain secret values and MUST be
  rejected if they resemble a token, API key or credential.
- **FR-016**: Local reports MUST contain fingerprints and bounded metrics but no
  raw prompt, response, person contact coordinate or provider dump.
- **FR-017**: Replaying the same synthetic case and adapter fixture MUST produce
  the same normalized report fingerprint.
- **FR-018**: Unknown provider, endpoint, model profile, tool, response field or
  weaker privacy policy MUST fail closed.

## Key Entities

- **Provider Candidate Packet**: immutable proposed external route and evidence needs.
- **Sandbox Case**: equal synthetic input and expected verification contract.
- **Provider Request Plan**: credential-free, non-dispatchable request representation.
- **Normalized Source Evidence**: bounded source metadata and fingerprint.
- **Candidate Observation**: one synthetic or later observed result with metrics.
- **Comparison Report**: deterministic verdict over equal cases and candidates.
- **R37 Campaign Manifest**: exact authority, spend, call and secret-reference boundary.

## Authorization, Privacy and Economics

- R36B authorizes local source, tests, documentation and commits only.
- All cases are synthetic and contain no customer, prospect or private-person data.
- Cost is integer microdollars with an explicit per-attempt and campaign ceiling.
- No provider, key, OAuth, real search, SMS, voice, email, external write, push,
  Preview, Production or deployment is authorized.

## Failure, Verification, Rollback and Observability

- Contract compilation, provider success and verified answer are separate states.
- Unknown or expired evidence blocks candidate eligibility.
- The comparison report records the weakest evidence label among its inputs.
- Rollback removes the R36B preparation layer; no schema or historical data changes.
- R37 must publish a new observed packet rather than mutating synthetic evidence.

## Explicit Exclusions

- No live Perplexity, OpenRouter, OpenAI, Anthropic, Google or other model call.
- No selection of a globally best model.
- No automatic routing based only on provider rankings or marketing metadata.
- No private-person enrichment, broad background check or contact discovery.
- No production credential storage, billing activation or customer traffic.

## Success Criteria

- **SC-001**: 100% of candidate packets are strict, versioned and candidate-only.
- **SC-002**: 100% of restricted-person cases refuse before request preparation.
- **SC-003**: 100% of normalized factual research claims require direct sources.
- **SC-004**: 100% of OpenRouter plans enforce explicit model, ZDR, denied data
  collection, required parameters and disabled model fallback.
- **SC-005**: 100% of benchmark candidates receive equal synthetic inputs and ceilings.
- **SC-006**: 100% of over-budget, invalid, drifted or unsourced fixtures fail closed.
- **SC-007**: Replays produce identical report fingerprints.
- **SC-008**: Provider calls, credential reads and external effects remain zero.

## Assumptions

- Perplexity Search is evaluated first as retrieval, not as ENDVERA's global brain.
- OpenRouter is evaluated as an aggregation transport, not as routing authority.
- ENDVERA policy selects exact model profiles and owns all cross-model fallback.
- Exact model IDs, prices and privacy evidence are frozen only when R37 starts.
