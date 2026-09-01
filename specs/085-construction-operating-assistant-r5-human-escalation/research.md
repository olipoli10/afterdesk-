# Research decisions

## Reuse the local HumanWorkUnit RC

Decision: merge the exact RC commit instead of reimplementing its lifecycle.

Reason: it already proves immutable definitions and acceptances, role-shaped
projections, claim fencing, review separation, deadline recovery and exactly-once
resume. A second engine would duplicate risk and contradict the canonical Brain.

## Bind construction state through an additive bridge

Decision: keep HumanWorkUnit generic and add a construction-owned binding keyed
by workspace, project, open loop, purpose and source version.

Reason: construction should consume the execution substrate without teaching the
generic engine construction-specific fields. The unique binding is also the
idempotency boundary for retries.

## Apply only reviewed results

Decision: construction application consumes `HumanWorkUnitAcceptance`, never a
candidate or chat transcript.

Reason: format validation is not truth verification. Acceptance is immutable and
already fenced against self-review and stale generations.

## No transport in R5

Decision: local task publication and prepared actions only.

Reason: provider credentials, external dispatch and customer data require new
authority. They are not needed to prove the core responsibility loop.
