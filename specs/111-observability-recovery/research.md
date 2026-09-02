# Research: R31 Observability and Recovery

## Decision 1 — Structured signals, not raw application logs

**Decision**: Accept only closed signal kinds, outcome codes, canonical
references, hashes and a small allowlist of bounded dimensions.

**Rationale**: Raw logs are hard to project by tenant and are a common path for
messages, contact data, secrets and provider references to leak. R31 needs
reconstructibility, not unrestricted text retention.

**Alternatives considered**: Persist full JSON logger events; adopt an external
observability vendor now. Both exceed local authority and weaken data minimization.

## Decision 2 — Inspect canonical queues through a versioned registry

**Decision**: R31 reads existing queue/state tables with per-kind stale rules and
recovery safety classifications.

**Rationale**: Creating an observability-specific work queue would split truth.
Closed inspectors keep the workflow engines authoritative and make unsupported
recovery explicit.

**Alternatives considered**: Generic table/column configuration; one new global
queue. Both allow silent drift and arbitrary mutation.

## Decision 3 — Replay only the existing R20 exact due-item handler

**Decision**: Export the already locked/idempotent R20 single-item due handler
and call it from one version-bound R31 recovery operation.

**Rationale**: It has no external transport and already uses advisory locking,
unique command identities and canonical transitions. Reimplementing it in R31
would introduce a second effect path.

**Alternatives considered**: Update follow-up status directly; re-run all due
work. Direct updates bypass transitions, while batch recovery broadens the
approved item scope.

## Decision 4 — Quarantine prepared connector work

**Decision**: A stale connector operation produces an alert and a quarantined
recovery operation; R31 never dispatches or replays it.

**Rationale**: The local record may be prepared, but the future provider effect
belongs to a separately authorized adapter. Recovery must not infer that an
external write is safe.

**Alternatives considered**: Mark it refused or automatically prepare again.
Both destroy or duplicate intent without provider-side evidence.

## Decision 5 — Minimized logical checkpoint plus real disposable restore drill

**Decision**: The product persists a closed logical manifest. A local script
uses PostgreSQL backup/restore tooling against guarded disposable databases and
records the comparison outcome.

**Rationale**: A manifest alone cannot prove restoration; a dump file alone
cannot prove canonical equality. The combination provides honest local evidence
without exposing raw backup content to user surfaces.

**Alternatives considered**: Claim recovery from migrations/tests; build a
production backup service. The first is insufficient and the second is outside authority.

## Decision 6 — Measured gates with denominators

**Decision**: Load/concurrency gates record exact input count, concurrency,
duration, p50/p95, duplicates, canonical effects and threshold result.

**Rationale**: A passing test count is not a capacity claim. Persisted gate
records make the synthetic denominator and evidence label explicit.

**Alternatives considered**: Hard-coded readiness badge; unrecorded benchmark output.

## Decision 7 — No new dependency

**Decision**: Use existing Zod, Prisma, PostgreSQL locks, Vitest, Expo and native
database tooling.

**Rationale**: The required controls are already available and a new telemetry
stack would add operational complexity without evidence of need.
