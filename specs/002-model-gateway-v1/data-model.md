# Data Model: Model Gateway v1

## Design principles

- `AiOperation` remains the logical operation, claim lease and terminal fence.
- Every published policy/profile version is immutable.
- Every route decision exists before external dispatch.
- Every attempted external dispatch has one attempt row, even when usage is unknown.
- Mutable breaker state never rewrites historical policy or decision rows.
- Raw prompts, outputs, credentials and secrets are absent from these models.

## Existing entities retained

### AiOperation

Existing durable logical operation. For V1, only rows with `purpose=classification` may receive a Model Gateway binding. Its stable operation key, claim lease and fencing token remain authoritative.

### AiUsage

Existing append-only measured usage row for a provider response. It remains measured token/cost evidence. A gateway attempt may have no `AiUsage` when no usable provider response exists.

### AccountProviderSpendHold

Existing account-level conservative reservation. The billing-provider identity remains authoritative for account aggregation. A gateway attempt references the hold used before its dispatch.

## New entities

### ModelGatewayPolicyVersion

One immutable published routing contract for one operation type.

| Field | Meaning / validation |
| --- | --- |
| id | Stable internal identity |
| policyKey | Stable human/audit key |
| version | Positive monotonic version unique within policyKey |
| operationType | Closed enum; V1 permits classification only |
| status | draft, published, retired; published rows immutable |
| routeOrder | Canonical typed route-profile version references |
| fallbackRules | Canonical typed map from failure class to permitted next route |
| maxAttempts | Positive integer within the closed platform bound |
| maxTotalCostMicros | Immutable upper bound across all attempts |
| requiredPrivacyPosture | Closed privacy requirement |
| canonicalHash | Hash of every decision-bearing field |
| createdBy | Authorized admin identity |
| createdAt / publishedAt / retiredAt | Lifecycle evidence |

Validation: a published version has at least one current route; no route appears twice; every fallback target appears after its source; maximum attempts cannot exceed route sequence/platform bounds; retirement affects new admission only.

### ModelGatewayRouteProfile

One immutable certification for an exact provider path and model capability.

| Field | Meaning / validation |
| --- | --- |
| id | Stable identity |
| routeKey / version | Stable route name plus positive immutable version |
| pathKind | direct_provider or gateway_mediated |
| adapterKey | Closed code-registry adapter identifier |
| billingProvider | Identity used by spend aggregation |
| intermediary | Nullable gateway identity; required for gateway_mediated |
| endpointKey / modelKey | Exact certified capability identifiers |
| operationTypes | Closed list containing classification in V1 |
| allowedDataClasses | Closed non-empty list |
| privacyPosture | Closed retention/training posture |
| residency | Closed/validated region constraints |
| pricingEvidence | Protected reference and effective date |
| privacyEvidence | Protected reference, scope, effective and expiry times |
| maxInput / maxOutput | Conservative certified bounds |
| canonicalHash | Hash of every decision-bearing field |
| createdBy / createdAt | Certification authority and time |

Validation: adapterKey exists in the closed registry; evidence covers exact path/model/endpoint; expired evidence makes the profile ineligible without mutating it; published versions are immutable.

### ModelGatewayOperation

One-to-one binding between an existing `AiOperation` and immutable gateway admission facts.

| Field | Meaning / validation |
| --- | --- |
| id | Stable gateway operation identity |
| aiOperationId | Unique reference to existing AiOperation |
| tenantId | Validated tenant boundary from authorized task facts |
| operationType | classification in V1 |
| requestFingerprint | Canonical hash of decision-bearing request facts |
| outputContractHash | Hash of certified classification output contract |
| dataClass | Frozen platform classification |
| privacyRequirement | Frozen request posture |
| policyVersionId | Published immutable policy version |
| maxTotalCostMicros | Frozen bound, no greater than policy bound |
| status | admitted, running, succeeded, failed, uncertain, refused |
| finalAttemptId | Nullable until a final usable attempt exists |
| resultEvidenceRef | Nullable protected reference/fingerprint |
| createdAt / finishedAt | Lifecycle evidence |

Validation: `aiOperationId` unique; policy/operation match; request fingerprint immutable; total settled plus held/uncertain exposure cannot exceed the ceiling; terminal status and final attempt agree.

### ModelGatewayDecision

The immutable pre-dispatch authorization or refusal for one attempt ordinal.

| Field | Meaning / validation |
| --- | --- |
| id | Stable identity |
| gatewayOperationId | Parent logical gateway operation |
| attempt | Positive attempt ordinal, unique per operation |
| disposition | route_authorized or refused |
| routeProfileId | Required when authorized; absent for refusal |
| reasonClass | Stable admission/fallback/refusal class |
| policyHash / routeHash | Exact immutable evidence hashes |
| privacyEvidenceHash | Exact privacy evidence fingerprint |
| breakerGeneration | Breaker snapshot observed at decision |
| remainingCostMicros | Bound immediately before reservation |
| decisionFingerprint | Canonical hash of all decision facts |
| decidedAt | Must precede dispatch |

### ModelGatewayAttempt

One attempted route under one authorized decision.

| Field | Meaning / validation |
| --- | --- |
| id | Stable identity |
| decisionId | Unique authorized decision |
| accountSpendHoldId | Unique reservation used before dispatch |
| status | prepared, dispatched, settled, failed, uncertain, cancelled_before_dispatch |
| providerRequestRef | Nullable redacted provider correlation reference |
| dispatchState | not_dispatched, settled, dispatched_then_cancelled, unaccounted |
| errorClass / httpStatus | Stable redacted failure evidence |
| resultContractStatus | not_evaluated, valid, invalid |
| requestEvidenceRef / responseEvidenceRef | Protected refs or hashes only |
| aiUsageId | Nullable measured usage relation |
| startedAt / dispatchedAt / finishedAt | Timing evidence |

Validation: decision is authorized; hold exists before dispatch; only conclusive non-dispatch may release; valid result requires settled dispatch and passing output contract.

### ModelGatewayBreaker

Current dispatch eligibility for one scope: scope kind/key, generation, state, stable reason class, authorized actor and timestamp. Unique on scope and read immediately before dispatch.

### ModelGatewayBreakerEvent

Append-only transition history: scope, prior/new generation and state, reason class, actor, timestamp and correlation identifier. No free-text provider dump or request content.

## State transitions

### Gateway operation

```text
admitted -> running -> succeeded
                  \-> failed
                  \-> uncertain
admitted -> refused
```

### Decision and attempt

```text
route_authorized -> prepared -> dispatched -> settled | failed | uncertain
                            \-> cancelled_before_dispatch
refused -> terminal, zero dispatch
```

### Spend reservation

```text
held -> settled
    \-> released  (only conclusively not dispatched)
held              (retained while outcome is uncertain)
```

### Breaker

```text
closed --authorized open--> open --authorized reset--> closed
```

## Database invariants

The authoritative invariant list is [contracts/db-invariants.md](./contracts/db-invariants.md). PostgreSQL must prevent duplicate attempt decisions, dispatch without an authorized decision and reservation, mutation of published policies/profiles, unsafe release of dispatched holds, stale breaker transitions and cross-tenant bindings.
