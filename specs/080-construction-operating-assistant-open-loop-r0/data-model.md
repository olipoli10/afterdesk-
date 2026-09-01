# Data Model: Open-Loop Closure Core R0

## OpenLoop

| Field | Meaning |
|---|---|
| id | Stable generated identity |
| workspaceId | Mandatory tenant boundary |
| projectId | Mandatory construction project |
| type | Closed enum; R0 accepts `INVOICE_READY` only |
| desiredOutcome | Versioned human-readable result |
| status | OPEN / WAITING_FOR_EVIDENCE / WAITING_FOR_VERIFICATION / READY_TO_INVOICE / CLOSED / REVOKED |
| priority | LOW / NORMAL / HIGH / URGENT, policy-derived with override audit |
| dueAt | Optional canonical deadline with source |
| nextResponsibleKind | USER / CONTACT / ENDVERA / HUMAN_WORK_UNIT |
| nextResponsibleId | Resolved actor when known |
| policyVersion | Exact evaluator version |
| stateVersion | Monotonic optimistic-concurrency version |
| openedByMessageId | Source message that created the loop |
| closedAt | Present only for CLOSED |
| revokedAt | Present only for REVOKED |

## OpenLoopFact

| Field | Meaning |
|---|---|
| loopId/workspaceId/projectId | Redundant boundaries checked on every write |
| field | Closed fact key such as workDescription, amount, completion, approval |
| normalizedValue | Typed canonical representation |
| claimState | CLAIMED / VERIFIED / DISPUTED / REVOKED |
| sourceType/sourceId | Message, selected file, human verification or connector record |
| suppliedBy | Identity that supplied the claim |
| observedAt | Time the source claims the event occurred |
| recordedAt | Server persistence time |
| confidenceClass | EXACT / EXPLICIT_UNVERIFIED / INFERRED / UNKNOWN |

Facts are append-only claims. A correction adds a new fact and relationship; it never rewrites history.

## OpenLoopEvidenceRequirement

| Field | Meaning |
|---|---|
| key | Closed requirement key |
| required | Whether the policy requires it for this loop |
| state | MISSING / PRESENT_UNVERIFIED / VERIFIED / REJECTED / WAIVED |
| evidenceRef | Secure selected file/message/verification reference |
| waivedBy/waiverReason | Explicit authorized waiver, if policy permits |

R0 requirement keys:

- `PROJECT_ASSOCIATION`
- `WORK_DESCRIPTION`
- `COMPLETION_ASSERTION`
- `AMOUNT_OR_EXPLICIT_UNKNOWN`
- `APPROVAL_STATE`
- `SUPPORTING_EVIDENCE`

## Frozen R0 policy

R0 evaluates one `billingBasis=CHANGE_ORDER` scenario. `READY_TO_INVOICE` requires all of the following simultaneously:

1. verified project association;
2. non-empty work description;
3. positive integer CAD amount in minor units;
4. explicit completion assertion;
5. accepted written approval evidence linked to the same project/change;
6. at least one accepted selected photo or document linked to the same project/change;
7. zero unresolved material contradiction.

A verbal approval claim can be preserved as a fact, but it does not satisfy the written-approval evidence requirement. A file with the wrong project, unknown provenance, rejection state or revoked state does not satisfy an evidence requirement.

Next actor is deterministic: office/owner obtains written approval; assigned field role supplies missing field evidence; authorized verifier resolves contradictions; office/accounting receives a ready package.

## OpenLoopContradiction

Links two or more incompatible fact claims. It records field, claim IDs, detection rule, status, resolver, resolution and reason. Unresolved material contradictions block readiness.

## OpenLoopTransition

Append-only transition event containing prior status/version, next status/version, reason code, evaluator version, actor, authority decision, input hash and timestamp. Unique idempotency keys prevent a second canonical effect.

## OpenLoopSnapshot

Immutable materialized decision snapshot used for proof and restart comparison:

- loop identity/version/status;
- normalized required facts;
- evidence states;
- unresolved contradictions;
- next responsible actor/action;
- readiness decision and reason codes;
- canonical hash.

## Projection

The owner/office projection includes amount and readiness. The field projection includes assigned action, evidence request and non-sensitive status only. Projections are derived; they are not independent sources of truth.

## State rules

1. A loop begins OPEN.
2. Missing required evidence produces WAITING_FOR_EVIDENCE.
3. Present but uncertain evidence produces WAITING_FOR_VERIFICATION.
4. All required facts/evidence verified and no material contradiction produces READY_TO_INVOICE.
5. CLOSED requires an explicit authorized closure event; readiness alone is not closure.
6. REVOKED prevents action and requires a new loop for a new desired outcome.
7. Any post-readiness revocation or contradiction re-evaluates the loop and preserves the prior snapshot.
