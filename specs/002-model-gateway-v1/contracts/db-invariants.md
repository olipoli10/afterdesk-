# Database Invariants

These invariants must be proven against disposable PostgreSQL with real migrations. Pure mocks are not sufficient evidence.

## Identity and immutability

- One `ModelGatewayOperation` may bind to one `AiOperation`, and that binding is unique.
- Request fingerprints, output-contract hashes, tenant binding, policy version and logical ceiling are immutable after admission.
- Published policy and route-profile decision fields cannot be updated in place.
- Attempt ordinals and decision fingerprints are unique within one logical operation.

## Admission and dispatch

- A dispatch requires one persisted `route_authorized` decision.
- The referenced policy and route profile must be published, exact and compatible with operation/data/privacy facts.
- A spend hold for the real billing provider must exist before dispatch and bind uniquely to the attempt.
- The breaker generation observed at decision is revalidated immediately before dispatch.
- A refusal creates no attempt and no external dispatch.

## Spend integrity

- Settled plus held/uncertain exposure across all attempts cannot exceed the frozen logical ceiling.
- Only conclusive non-dispatch may release a hold.
- Dispatched-but-unresolved attempts retain conservative exposure.
- Settlement is idempotent and may not create duplicate `AiUsage` evidence.

## Replay and fencing

- Replaying the same logical operation converges on the existing gateway binding.
- Concurrent claims cannot create duplicate decisions, attempts or provider dispatches.
- A stale fence cannot publish a final result or overwrite a newer terminal state.
- A fallback uses a new attempt ordinal and cannot reuse the prior reservation.

## Breakers and tenancy

- Breaker transitions use compare-and-swap generation; stale generations lose.
- Breaker events are append-only and identify the authorized actor and stable reason.
- Operation, policy, spend account, task and protected-content references must share the authorized tenant boundary.
- Cross-tenant reassignment and binding fail closed.

## Required named mutations

Each mutation must fail by its exact name, then be restored byte-exactly:

- `gateway-dispatch-without-decision`
- `gateway-dispatch-without-hold`
- `gateway-silent-route-substitution`
- `gateway-releases-ambiguous-spend`
- `gateway-policy-version-mutates`
- `gateway-stale-breaker-generation-wins`
- `gateway-replay-dispatches-twice`
- `gateway-cross-tenant-binding`
