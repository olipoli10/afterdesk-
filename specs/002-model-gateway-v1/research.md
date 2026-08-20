# Phase 0 Research: Model Gateway v1

## Evidence boundary

This research resolves architecture choices needed for planning. It does not select a vendor. Existing repository behaviour is `CODE`/`TEST`; vendor quality, privacy, cost and reliability remain `UNKNOWN` until the bake-off.

## Decision 1 — Extend the existing durable operation engine

**Decision**: Keep `AiOperation` as the logical operation, lease and fencing authority. Add a one-to-one gateway binding and child decision/attempt records.

**Rationale**: The current engine already provides deterministic operation keys, CAS claims, leases, fencing, replay convergence and append-only usage. A parallel gateway operation engine would create two answers for who owns an attempt and who may close it.

**Alternatives considered**: A new standalone gateway operation table was rejected because it duplicates reservation, lease and fencing semantics. Putting all facts directly on `AiOperation` was rejected because attempt-level route/fallback evidence is one-to-many.

## Decision 2 — Separate immutable versions from mutable controls

**Decision**: Published routing policies and certified route profiles are immutable. Current breaker/revocation state is mutable only through an audited transition with its own generation.

**Rationale**: A historical attempt must retain the exact rules and privacy evidence that authorized dispatch. Operational shutdown must still happen immediately without editing history.

**Alternatives considered**: Mutable route rows rewrite past meaning. Code-only policy has no durable version to reconstruct.

## Decision 3 — Put fallback orchestration above adapters

**Decision**: An adapter can emit at most one external attempt. It cannot retry, fallback, hedge, cache or substitute. The gateway orchestrator creates every additional attempt explicitly.

**Rationale**: Each attempt needs an independent policy decision, reservation and evidence record. Hidden client behaviour makes both spend and privacy claims false.

**Alternatives considered**: Provider SDK retry and gateway-managed hidden fallback were rejected because one accounting identity could fund multiple calls and conceal route lineage.

## Decision 4 — Preserve uncertainty as a first-class spend state

**Decision**: Map conclusive non-dispatch to release, usable response to settlement, and every dispatched-but-unresolved outcome to uncertainty that retains exposure.

**Rationale**: A local timeout or abort proves only that the platform stopped waiting. It cannot prove that a provider stopped processing or billing.

**Alternatives considered**: Recording zero cost or blindly replaying ambiguous attempts was rejected as fabricated evidence and duplicate-spend risk.

## Decision 5 — Use a hybrid policy representation

**Decision**: Persist immutable policy/profile versions and canonical hashes, while using closed code schemas and adapter registries to validate every published record and runtime lookup.

**Rationale**: Operators need durable versions and immediate control; the runtime needs closed types that reject arbitrary vendor or endpoint definitions.

**Alternatives considered**: Arbitrary JSON rules become an unreviewed policy language. Hard-coded-only policy cannot express auditable expiration and revocation cleanly.

## Decision 6 — Migrate classification without changing its business contract

**Decision**: Move client construction and dispatch behind a direct-route adapter. Keep classification prompt construction, schema validation, usage extraction and caller result semantics unchanged during the first migration.

**Rationale**: The gateway canary should prove the boundary, not combine routing work with a prompt/model redesign.

**Alternatives considered**: Migrating classify/plan/critique together or changing the classification model was rejected because it confounds boundary defects with behavioural drift.

## Decision 7 — Route profiles certify exact paths, not brands

**Decision**: A route profile binds path kind, billing provider, gateway intermediary when present, endpoint/model capability, operation, data classes, privacy evidence, region and price evidence.

**Rationale**: Retention, training, residency, model availability and accounting can differ by endpoint and mediation path. A provider-family claim is too broad.

**Alternatives considered**: One provider-wide privacy flag was rejected as likely to over-authorize paths not covered by evidence.

## Decision 8 — Use shared conformance fixtures before vendor adoption

**Decision**: The same harness tests synthetic adapters, the current direct route and a gateway-mediated candidate. Results remain separated by route and dimension.

**Rationale**: The roadmap requires direct parity and evidence-based candidate selection. A shared contract detects integration drift without turning a passing candidate into an adoption decision.

**Alternatives considered**: Vendor-specific suites and one composite score were rejected as incomparable and capable of hiding safety failures.

## Decision 9 — Keep ordinary evidence content-free

**Decision**: Store canonical fingerprints, typed facts, protected-content references and redacted error classes in gateway records. Raw prompts and outputs remain only where existing authorized product evidence requires them.

**Rationale**: Audit must reconstruct a decision without copying customer content into a broader operational surface.

**Alternatives considered**: Raw request/response JSON on every attempt was rejected because it expands sensitive-data retention and access scope.

## Decision 10 — Two rollout controls

**Decision**: Require both a published enabled classification policy and an environment-level hard disable that defaults closed outside explicitly authorized environments.

**Rationale**: Policy controls normal rollout and route changes; the hard disable gives release/incident operators an independent stop.

**Alternatives considered**: An environment flag alone cannot version route meaning. Database policy alone lacks an independent release stop.

## Decision 11 — No package addition in the boundary phase

**Decision**: Implement the adapter contract using existing dependencies and platform primitives. A gateway candidate that requires a package must justify it in its bake-off and lockfile review.

**Rationale**: The boundary can be proven without adopting a vendor SDK. Package choice is candidate-specific and should not precede evidence.

**Alternatives considered**: Installing every candidate SDK was rejected as premature lock-in and attack surface.

## Resolved unknowns

No `NEEDS CLARIFICATION` remains in the plan. Vendor selection, exact production policy values and measured quality/cost gains are intentionally not planning unknowns; they are bake-off and release decisions outside this feature's implementation authority.
