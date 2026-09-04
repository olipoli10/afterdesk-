# Feature Specification: R37 OpenRouter Provider Sandbox

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`

**Created**: 2026-09-04

**Status**: Accepted for implementation under exact founder authority

**Input**: Olivier authorizes R37 with OpenRouter only, synthetic data only, a maximum total cost of 10 CAD, a locally kept credential that is never committed, no client, no real SMS/call and no deployment. Prepare the plan and goal, then execute everything possible without another routine GO.

## Problem Statement and Evidence Boundary

R36A through R37BA built a provider-neutral routing brain, strict request packets, durable activation/budget/replay controls, normalized synthetic evidence and a closed provider boundary, but deliberately contained no real provider transport. R37 must now determine whether a narrowly selected OpenRouter controller route actually returns contract-valid answers at acceptable latency and cost on synthetic construction-assistant cases.

This is an observed provider sandbox, not provider adoption, customer evidence, production readiness or proof that any model is globally best. The prior OpenRouter voice attempt that returned HTTP 402 is historical `REWORK` evidence and cannot count toward this campaign.

## User Scenarios & Testing

### User Story 1 - Fail-closed authority, credential and budget gate (Priority: P1)

As the owner, I can authorize one bounded OpenRouter experiment without exposing a credential or risking an uncontrolled bill.

**Why this priority**: No external request is acceptable until the exact authority, secret custody and spend ceilings are enforceable in code.

**Independent Test**: With no credential, the campaign validates all local contracts and returns `CREDENTIAL_REQUIRED` with zero network calls and zero spend. With a locally injected credential reference, only the exact allowlisted host, models, cases, call count and budget can advance.

**Acceptance Scenarios**:

1. **Given** the founder authority in this specification, **when** R37 is prepared, **then** its immutable manifest names OpenRouter as the only gateway, synthetic cases only, 10 CAD as the founder ceiling and 5 USD as the stricter application/provider-key ceiling.
2. **Given** no `R37_OPENROUTER_CONTROLLER_API_KEY` in the current process, **when** the runner starts, **then** it exits before network with `CREDENTIAL_REQUIRED`, never reads a secret value into an artifact and leaves the lane disabled.
3. **Given** a credential is locally injected, **when** any request targets another host, model, case, data class or endpoint, **then** it is refused before dispatch.
4. **Given** current Bank of Canada evidence of 1 USD = 1.3789 CAD on 2026-09-03, **when** the 5 USD application ceiling is converted, **then** it is 6.8945 CAD and therefore remains below the founder's 10 CAD ceiling with margin.

---

### User Story 2 - Exact OpenRouter controller transport (Priority: P1)

As the ENDVERA routing brain, I can execute only a sealed synthetic controller request through OpenRouter and normalize the returned response into canonical evidence.

**Why this priority**: The economic and quality hypothesis cannot be tested by another fixture.

**Independent Test**: A transport adapter calls exactly `https://openrouter.ai/api/v1/chat/completions`, sends one exact model, disables provider fallback, requires supported parameters, denies data collection, requires ZDR, uses no tools and returns a strict non-streaming response with usage cost.

**Acceptance Scenarios**:

1. **Given** an active exact grant and reserved spend, **when** a request is dispatched, **then** the adapter sends only the sealed payload and local authorization header to the exact OpenRouter endpoint.
2. **Given** OpenRouter returns a successful response, **when** it is normalized, **then** the exact response id, returned model, bounded answer, token usage, reported cost, latency and response fingerprint are recorded without the raw credential or request headers.
3. **Given** a timeout, non-2xx response, malformed body, model drift, tool call, missing cost or ceiling breach, **when** the attempt terminates, **then** it fails closed, releases or settles the correct reservation, opens the kill switch where required and does not fabricate evidence.
4. **Given** the same idempotency key is replayed, **when** execution is requested again, **then** no second network request or charge occurs.

---

### User Story 3 - Equal synthetic controller bake-off (Priority: P2)

As the owner, I can compare one strong and one efficient OpenRouter-served controller model on identical synthetic inputs without confusing gateway convenience with quality.

**Why this priority**: ENDVERA needs a versioned model policy based on observed evidence rather than a hard-coded vendor slogan.

**Independent Test**: `openai/gpt-5.4` and `openai/gpt-5.4-mini` each receive the same three sealed cases, ordered facts, locale, output schema, temperature, maximum output and verification oracle, for at most six paid calls total.

**Acceptance Scenarios**:

1. **Given** the six-case matrix, **when** the runner executes, **then** each model receives byte-equivalent case facts and a distinct sealed attempt identity.
2. **Given** each normalized result, **when** the deterministic oracle evaluates it, **then** contract validity, required fact coverage, invented facts, unsafe action authorization, latency and actual cost are measured without subjective model self-ranking.
3. **Given** incomplete, unequal or failed observations, **when** adjudication runs, **then** no model is selected as the default.
4. **Given** complete evidence, **when** one candidate satisfies every safety/contract gate, **then** the report may recommend it as an R38 candidate only; it does not activate customer traffic.

---

### User Story 4 - Revocation, cleanup and reconstructible closeout (Priority: P2)

As the maintainer, I can reconstruct every authorized request and prove the campaign stopped with its credential unavailable to the repository and all provider execution disabled.

**Independent Test**: The runner revokes its grant, disables the provider lane, destroys its disposable database/processes, scans Git/artifacts for secret material, verifies spend/call counts and emits a bounded machine report.

**Acceptance Scenarios**:

1. **Given** success, failure or interruption, **when** cleanup runs, **then** the campaign-owned grant is revoked and the lane is disabled.
2. **Given** any committed/staged/untracked repository artifact, **when** secret scanning runs, **then** no credential value or authorization header is found.
3. **Given** the provider report and durable ledger, **when** totals are recomputed, **then** call count, reserved/settled/released spend and observed provider cost reconcile exactly.
4. **Given** the campaign is closed, **when** R38 is considered, **then** it still requires its own founder observation authority; R39 and R40 remain unauthorized.

### Edge Cases

- The local credential exists but is blank, placeholder-like, malformed or accidentally passed as a command-line argument.
- OpenRouter returns HTTP 402 as in the historical attempt, 403 from a budget/privacy guardrail, 429, 5xx or HTML instead of JSON.
- A successful HTTP response omits `usage.cost`, returns more than one choice, changes the exact model id or includes a tool call.
- An in-flight request completes after the local call or campaign ceiling is reached.
- The OpenRouter upstream route differs while the exact gateway model stays the same; the campaign records returned routing metadata when available but never enables automatic model fallback.
- A response contains instructions to contact, text, call, pay, deploy or modify real systems.
- The process crashes after provider response but before settlement; recovery must fence stale leases and reconcile without redispatch.
- The provider reports a cost fraction not exactly representable as integer micro-USD; conversion rounds upward for enforcement.
- Exchange-rate evidence expires before a real paid call; the call refuses until a new rate proves the stricter USD ceiling remains below 10 CAD.

## Requirements

### Functional Requirements

- **FR-001**: The campaign MUST accept only the exact authority stated in this specification and MUST NOT infer authority for any other provider, data, communication, customer, deployment or release.
- **FR-002**: The only network destination MUST be HTTPS `openrouter.ai` on the exact `/api/v1/chat/completions` path; redirects, proxies and alternate hosts MUST be refused.
- **FR-003**: All request facts MUST be synthetic, versioned, allowlisted and fingerprint-bound before a credential can be resolved.
- **FR-004**: The credential MUST be resolved only inside the final private transport from the process-local reference `R37_OPENROUTER_CONTROLLER_API_KEY`, MUST never be accepted as a CLI argument, returned to callers, logged, persisted, fingerprinted into evidence or committed. All preflight and validation outside that transport may inspect presence only as a boolean.
- **FR-005**: The runner MUST execute at most six paid calls and MUST reserve no more than 5,000,000 integer micro-USD total, a stricter ceiling than the founder's 10 CAD limit.
- **FR-006**: Before a paid call, unexpired official exchange evidence MUST prove the stricter USD ceiling converts to less than 10 CAD; otherwise the campaign MUST refuse.
- **FR-007**: OpenRouter requests MUST set `provider.allow_fallbacks=false`, `provider.require_parameters=true`, `provider.data_collection="deny"` and `provider.zdr=true`.
- **FR-008**: Each request MUST use exactly one allowlisted model id, no `models` array, no tools, no provider-side web search, no streaming and a bounded output.
- **FR-009**: R37 MUST compare exactly `openai/gpt-5.4` and `openai/gpt-5.4-mini` only if both remain present and eligible at execution; any model-list or pricing drift requires a new sealed packet before calls.
- **FR-010**: The three cases MUST contain identical ordered synthetic construction facts per model and MUST test classification/planning, maintained-state reasoning and safe prepared-action reasoning.
- **FR-011**: Output MUST satisfy one strict JSON-schema-compatible controller contract containing answer, cited fact ids, proposed capability and limitations; unknown fields fail validation.
- **FR-012**: The deterministic oracle MUST reject invented facts, missing required fact ids, real-world execution claims, external communication claims and any capability outside the closed registry.
- **FR-013**: The response normalizer MUST require a successful status, one choice, exact model identity, text-only content, no tool calls, token usage and provider-reported cost.
- **FR-014**: Provider-reported decimal cost MUST be rounded upward to integer micro-USD for settlement and budget enforcement.
- **FR-015**: Timeout MUST be at most 30 seconds per request and the response body MUST be capped before parsing.
- **FR-016**: Every accepted attempt MUST reserve worst-case spend atomically before dispatch and settle or release exactly once after completion.
- **FR-017**: Exact replay or concurrent duplicate MUST produce at most one provider dispatch and one canonical result.
- **FR-018**: Crash recovery MUST never redispatch an attempt that may already have incurred a provider charge without an explicit, distinct recovery decision.
- **FR-019**: Any privacy, schema, model, cost, call-count, lease, replay or evidence failure MUST disable the lane and revoke the campaign grant.
- **FR-020**: Evidence artifacts MUST contain bounded synthetic prompts/results or redacted excerpts only when required for verification, plus fingerprints, metrics and reason codes; they MUST contain no credential, authorization header or customer data.
- **FR-021**: Closeout MUST reconcile local ledger spend with OpenRouter-reported usage, prove the total remains below both ceilings, revoke the grant, disable the lane and stop the disposable database.
- **FR-022**: A successful R37 verdict MAY be `OPENROUTER_SANDBOX_OBSERVED_PASS`; it MUST NOT be labelled provider adoption, customer value, PMF, production readiness or Verified-E2E.
- **FR-023**: If the credential is absent after all credential-free work is complete, the exact state MUST remain `CREDENTIAL_REQUIRED` and the system MUST request only secure local key installation, not another GO.
- **FR-024**: No package dependency, lockfile change, Prisma schema change, push, Preview, Production, deployment, signing, store action, SMS, call, email or customer/prospect data is permitted.

### Key Entities

- **R37 Authority Envelope**: Exact provider, data, cost, effect and release boundaries derived from the founder instruction.
- **Model Binding Packet**: Dated exact model id, endpoint, parameter, privacy and worst-case price assumptions.
- **Observed Sandbox Case**: Synthetic ordered facts, strict expected contract and deterministic verification rules.
- **Provider Attempt**: Immutable idempotency, grant, model, case, reservation, lease and response identity.
- **Observed Provider Evidence**: Contract-valid bounded output, usage, cost, latency, fingerprints and verdict.
- **Campaign Report**: Complete call/spend/replay/revocation/privacy reconciliation and honest readiness label.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Structural tests prove the credential can enter only the final private transport header, is never returned by that boundary, and no authorization header, credential field, customer/prospect data, phone number or external communication content appears in Git or evidence; validators inspect credential presence only as a boolean and never compare or scan the secret value.
- **SC-002**: Zero network request is possible before exact authority, case, model, privacy, credential-presence, call-count and spend checks all pass.
- **SC-003**: At most six paid OpenRouter calls and at most 5 USD application spend occur; converted spend remains below 10 CAD.
- **SC-004**: 100% of admitted requests enforce ZDR, data-collection denial, supported parameters and disabled provider fallback.
- **SC-005**: 100% of observed responses either satisfy the strict controller contract and deterministic oracle or are recorded as failures without fabricated evidence.
- **SC-006**: Exact replay and concurrent duplicate testing produces zero second dispatches and zero second charges.
- **SC-007**: Ledger reservations, settlements/releases and provider-reported cost reconcile exactly for every attempt.
- **SC-008**: Final cleanup proves the provider lane disabled, campaign grant revoked, disposable database stopped and repository clean except intentional R37 artifacts.
- **SC-009**: R37 can pass only from actual OpenRouter responses; fixtures and the historical HTTP 402 attempt cannot satisfy the observed denominator.

## Assumptions

- Olivier controls the OpenRouter account and can create a dedicated key with a 5 USD key-level limit; account funding and key creation are not inferred.
- OpenRouter bills in USD; the stricter 5 USD ceiling uses the Bank of Canada 2026-09-03 rate of 1.3789 CAD/USD and must be refreshed before any call if the evidence is stale.
- `openai/gpt-5.4` and `openai/gpt-5.4-mini` are current exact candidates based on official OpenRouter pages reviewed 2026-09-04; they are not yet ENDVERA defaults.
- Existing R37A-R37BA provider activation, spend, fencing, replay and source-reachability controls are reused rather than replaced.

## Explicit Non-Goals

- No real user, client, prospect, project, phone, voice, SMS, email, calendar or accounting data.
- No public route, end-user setting, automatic runtime consumer or background provider worker.
- No Perplexity, Anthropic-direct, OpenAI-direct or any non-OpenRouter gateway.
- No adoption decision, rollout, deployment, Preview, Production, push, signing or store submission.
- No claim that a tested model is globally best or that the business model is validated.
