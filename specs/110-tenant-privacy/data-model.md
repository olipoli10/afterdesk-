# Data Model: R30 Tenant Privacy Control Plane

## ConstructionPrivacyPolicySet

- workspace identity and immutable positive version
- lifecycle `DRAFT | ACTIVE | SUPERSEDED | REVOKED`
- complete rule fingerprint and actor/timestamps
- at most one active policy per workspace

## ConstructionPrivacyRetentionRule

- policy set and closed data class
- positive retention days
- deletion mode `RETAIN | TOMBSTONE_WHEN_ELIGIBLE | EXTERNAL_DELETE_WHEN_AUTHORIZED`
- legal/operational hold behavior
- one rule per policy/data class

## ConstructionPrivacyOperation

- workspace-scoped command ID/hash and operation kind
- expected policy/lifecycle versions
- immutable result or refusal reason
- actor, timestamps and `externalEffectPerformed=false`

## ConstructionPrivacyDeletionRequest

- workspace, closed target type and exact target ID
- request/eligibility/approval fingerprints
- lifecycle state and version
- hold/protection reason codes
- requester, approver and timestamps

## ConstructionPrivacyTombstone

- workspace, closed target and deletion request
- non-sensitive target fingerprint
- local tombstone time
- external deletion state and optional later proof fingerprint
- never stores raw deleted payload or secret material

## Privacy cockpit projections

- owner/office: policy, categorized counts, secret/evidence lifecycle summaries,
  export manifests and exact deletion request state
- field worker: own role/access summary only
- all projections report `externalEffectCount=0` in R30
