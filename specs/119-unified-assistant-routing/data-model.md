# Data Model: Unified Assistant Routing

No database schema change is required.

## TrustedAssistantRequest

- `schemaVersion`: 1
- `requestId`: UUID from the existing assistant request
- `workspaceId`: authorized workspace
- `actorId`: authenticated user
- `channel`: server-selected supported channel
- `message`: original request, used for execution but omitted from audit projection
- `declaredDataClass`: trusted conservative baseline
- `privacyRequirement`: trusted conservative baseline
- `riskClass`: trusted policy baseline
- `maxTotalCostMicros`: server-selected planning ceiling only; it cannot authorize execution or spending
- `policyKey`: canonical R36A policy
- `acceptedAt`: existing occurrence timestamp

## ClientRoutingProjection

- `schemaVersion`: 1
- `intentClass`: classified request family
- `capabilityKey`: provider-neutral capability or null
- `disposition`: internal, candidate, human, clarification or refusal
- `readiness`: `INTERNAL_READY`, `PROVIDER_REQUIRED_NOT_AUTHORIZED`, `HUMAN_SUPPORT_AVAILABLE`, `CLARIFICATION_REQUIRED` or `REFUSED`
- `citationsRequired`: whether eventual output requires sources
- `approvalRequired`: whether consequential use requires approval
- `providerExecutionAuthorized`: always false
- `externalDispatchPerformed`: always false

Provider, adapter, model, route order, hashes and cost estimates are intentionally absent.

## DeferredAssistantExchange

Uses two existing `ConstructionMessage` rows and one immutable `ConstructionInterpretation` snapshot:

- inbound row: exact user request, workspace/actor scoped, unique R36C request key
- outbound row: deterministic truthful ENDVERA reply, unique R36C reply key
- interpretation row: original routing projection and deferred result used for exact replay even if policy later changes
- no calendar item, action, open loop or external delivery effect
- replay: same workspace/request/body returns first rows
- mismatch: same workspace/request with different fingerprint is refused

## State Transitions

```text
ACCEPTED
  ├─ INTERNAL_TOOL ───────────────> EXISTING_R9_R2_RESULT
  ├─ CANDIDATE_PREPARED ─────────> PROVIDER_REQUIRED_NOT_AUTHORIZED
  ├─ HUMAN_HANDOFF ──────────────> HUMAN_SUPPORT_AVAILABLE (not created)
  ├─ CLARIFICATION_REQUIRED ─────> CLARIFICATION_REQUIRED
  └─ REFUSED ────────────────────> REFUSED
```

All terminal R36C states are replay-safe and have `externalDispatchPerformed=false`.
