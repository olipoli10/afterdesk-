# R11 Plan — Exact Prepared-Action Decisions

## Objective

Add idempotent, concurrency-safe owner/office decisions for exact approval,
rejection before approval and revocation after approval. Decisions must bind the
action id, version and payload fingerprint, retain immutable audit evidence and
perform zero dispatch.

## Allowed implementation

- reuse `approveOutboundWithoutDispatch` for exact approval;
- add bounded reject/revoke semantics over the canonical action ledger;
- expose one authenticated mobile decision route or shared command extension;
- add focused contract, authorization, replay and PostgreSQL tests.

## Completion gate

- stale or modified payload decisions fail closed;
- exact retry returns the same canonical decision without a second effect;
- concurrent decisions produce at most one canonical transition;
- approval, rejection and revocation remain workspace-scoped;
- `simulatedDeliveryCount` and external transport remain zero.

