# Data Model

## ConstructionAccountingAccount

Workspace/provider account plan with opaque account/tenant/cursor references,
capabilities, state version and local preparation/revocation status. Secret and
external-write columns are permanently false/absent.

## ConstructionAccountingObservation

One normalized `INVOICE` or `PAYMENT` observation with opaque provider identity,
amount minor units, currency, observed status, supplied timestamp, content hash,
adapter fingerprint and matching status. It is evidence, not canonical truth.

## ConstructionAccountingMatch

Immutable relation from one observation to at most one R21 receivable/project,
including match reason, source versions, amount disposition and review status.
Ambiguous/unmatched records cannot update receivable settlement state.

## ConstructionAccountingDraft

Exact `INVOICE` or `RECONCILIATION` prepared payload with canonical source
versions, provider, line items/evidence, payload hash, version, approval facts,
`externalWrite=false` and `externalEffectCount=0`.

## ConstructionAccountingDecision

Immutable audit record for account preparation/revocation, admission, replay,
refusal, match, conflict, draft and approval.

## Invariants

- one account per workspace/provider;
- one observation per account/provider identity and content hash;
- one exact draft version/hash per command identity;
- account and source locks serialize concurrent state changes;
- no ambiguous observation changes a canonical receivable;
- no provider observation deletes or overwrites canonical evidence;
- no field projection exposes financial/accounting detail;
- no R27 path performs an external provider write.
