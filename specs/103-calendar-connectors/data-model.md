# Data Model

## Reused canonical records

### ConstructionConnectorAccount

One record per workspace/provider. Retains local state, requested scopes,
granted scopes and opaque secret/cursor references. R23 never stores the secret
values themselves.

### ConstructionConnectorGrant

One capability row per connector account. Calendar read and write remain
separate capabilities with requested/granted/revoked lifecycle.

### ConstructionConnectorOperation

Immutable request/result evidence for prepare, revoke, sync-read preparation,
write preparation and explicit refusal. The record always retains
`externalTransportPerformed=false` in R23.

### ConstructionCalendarItem

Canonical ENDVERA appointment state. Provider adapters read its exact values
and fingerprint; the provider is never the sole database of operational truth.

## Optional additive binding

If executable integration tests show that durable remote/canonical conflict
reconstruction cannot be represented safely by existing operations, add one
forward-only `ConstructionCalendarConnectorLink` containing only workspace,
account, canonical item, provider, non-reversible external event fingerprint,
remote precondition fingerprint, canonical fingerprint, status and versions.
No raw remote identifier, cursor or credential may enter the row.

## Invariants

- one account per workspace/provider;
- one capability grant per account/capability;
- one operation per workspace/idempotency key;
- provider states are independent;
- local revocation clears active authority before returning;
- no secret value is persisted or projected;
- provider request preparation never changes the canonical calendar item;
- no external transport is possible from an R23 code path.
