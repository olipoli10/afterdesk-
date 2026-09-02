# R36 Research and decisions

## Existing product facts

- R18-R35 each have focused unit and disposable-PostgreSQL proof.
- No single accepted run currently composes the complete contractor story.
- Provider adapters are implemented fail-closed and not observed externally.
- Web and shared iOS/Android already parse the same R33 Golden Workflow shape.
- R35 produces a validated local package, not a signed or deployed artifact.

## Decisions

### D1 — Service-level internal E2E

The run uses real service functions and PostgreSQL transactions. It does not
depend on flaky browser clicking or unavailable providers. UI behaviour remains
covered by strict contract and platform tests.

### D2 — One story, many mandatory checkpoints

A single chronological story exposes composition errors while checkpoint
hashes identify the exact boundary that failed. Independent focused tests still
cover branch combinatorics.

### D3 — Deterministic local intent only

The accepted deterministic interpreter handles exact synthetic phrases. R36
cannot claim live-model understanding.

### D4 — Evidence before readiness

The economic state must visibly fail before written approval and work evidence,
preserve contradictory claims, then reach readiness only after authorized
resolution and both evidence classes.

### D5 — Prepared, never delivered

Connector paths are exercised through normalized/prepared contracts and exact
approval state. Delivery and provider observation remain zero.

### D6 — Report is evidence, not a new source of truth

The report stores hashes, counts and sanitized checkpoint results. PostgreSQL
and immutable audit records remain canonical.

### D7 — R36 does not unlock R37 by itself

Internal PASS proves local composition. Provider sandbox authority remains a
separate founder/external decision.
