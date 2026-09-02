# Research and Decisions: R30 Tenant Privacy Control Plane

## Existing evidence

- Construction data is broadly workspace-scoped and active membership is already
  rechecked in core services.
- R16 models connector readiness and local revocation while keeping secrets opaque.
- R28 supplies versioned policy and exact decision patterns.
- R29 exposes reconstructible provenance without duplicating canonical state.
- Legacy file retention sweeps exist, but they are task-file specific and do not
  provide a Construction workspace privacy inventory or deletion decision path.

## Gap

The product has many strong local guards but no single tenant privacy control
plane. An owner cannot inspect retention, prepare a safe export, understand what
holds deletion, or distinguish a local tombstone from an observed provider or
storage deletion.

## Decisions

### D1 — Inventory is a projection

Counts and lifecycle classifications are reconstructed from a closed registry
of canonical workspace-scoped queries. A generic table scanner would be unsafe
and a duplicated inventory would drift.

### D2 — Export a manifest first

R30 prepares a minimized manifest rather than raw row content. This proves scope,
determinism and secret exclusion before any later downloadable archive authority.

### D3 — Deletion is a lifecycle, not a button

Request, eligibility, second approval, tombstone and external-pending are
separate durable states. Immutable operational evidence of the decision remains.

### D4 — Protected history stays protected

Audit, financial, contradiction, authority and accepted human-result history is
not physically erased in R30. Later legal/product rules may define anonymization,
but broad deletion is not inferred.

### D5 — Secret state, never secret material

R30 reports absent/opaque/revoked credential state. It does not return secret
references or claim remote revocation without provider proof.

## Unknowns deferred

- Jurisdiction-specific production retention schedules and legal holds.
- Customer expectations for raw archive formats and data portability.
- Real provider deletion/revocation guarantees and proof receipts.
- Production backup propagation and physical media deletion timelines.

These require legal, provider and customer evidence later; they do not block the
local fail-closed control plane.
