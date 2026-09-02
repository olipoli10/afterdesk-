# Feature Specification: R31 Observability and Recovery

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Ready for implementation
**Input**: R31 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

An owner can see whether ENDVERA's Construction operations are healthy, which
work is blocked, who owns the next recovery decision, and whether the local
database can be restored without reconstructing context manually. Operators
receive durable, tenant-scoped signals, traces, alerts and recovery actions
derived from canonical state rather than from raw logs or model summaries.

R31 does not add a second workflow engine. It observes existing Construction
queues and state machines through a closed registry, prepares or applies only
safe local recovery handlers, and preserves exact before/after evidence. It
never retries an uncertain or consequential external effect.

## User scenarios and acceptance

### US1 — Inspect operational health (P1)

An owner or office manager opens Reliability and sees one workspace-scoped
summary: open alerts, stale items, latest recovery checkpoint, latest restore
drill, queue depth and the exact next responsible role. Every number has a
denominator and observation time. A field worker receives only their own
assigned operational interruption summary and no workspace-wide metrics.

### US2 — Trace one operational result (P1)

An authorized user follows one safe trace from intent or scheduled work through
decisions, attempts, alerts and final state. The trace contains closed codes,
canonical references, versions, timing and hashes, but no message body, evidence
bytes, credential, raw provider reference, personal contact data or hidden
financial field.

### US3 — Detect and adjudicate stuck work (P1)

The system scans a closed registry of existing Construction queues and creates
one durable alert per stale canonical item. An owner can prepare a recovery
action. Applying it rechecks tenant, queue type, item state, expected version,
idempotency and external-effect safety. Safe local work can be requeued or
quarantined once; uncertain external effects are quarantined for human review
and never replayed.

### US4 — Prove backup and restore readiness (P1)

An operator creates a minimized recovery checkpoint and runs a disposable local
backup/restore drill. The drill compares schema version, closed table counts and
canonical fingerprints before and after restore. A mismatch remains a failed
drill with exact reason codes. Backup artifacts are temporary, encrypted-storage
claims are not made, and no customer or shared database is permitted.

### US5 — Enforce concurrency and load gates (P2)

Automated gates create concurrent duplicate signals, alerts and recovery
commands plus a bounded synthetic workload. The system retains one canonical
effect, reports measured denominators and refuses release evidence when
correctness, latency or backlog-drain thresholds are missed.

### US6 — Share one role-safe web/iOS/Android cockpit (P2)

The private no-store API supplies independent owner/office and field-worker
contracts to web and shared Expo surfaces. Unknown signal codes, dimensions,
queue kinds, recovery actions, roles or hidden fields fail closed.

## Functional requirements

- **FR-001**: Every signal, trace, alert, checkpoint, drill and recovery operation must carry exact `workspaceId`; active membership and role must be rechecked at point of use.
- **FR-002**: Define closed signal kinds, severities, alert states, queue kinds, recovery actions, recovery states and restore outcomes.
- **FR-003**: Accept only allowlisted safe dimensions with bounded string/integer/boolean values; arbitrary JSON, raw text and unknown keys must refuse.
- **FR-004**: Never persist message bodies, contact coordinates, evidence bytes or storage keys, credentials, tokens, provider references, prompt/model content, hidden worker economics or other-workspace data in R31 telemetry.
- **FR-005**: Store append-only signals with deterministic fingerprints and exact duplicate collapse.
- **FR-006**: Store trace spans with parent linkage, canonical resource references, state versions, monotonic timing and immutable outcome codes.
- **FR-007**: Aggregate metrics only from canonical state and accepted signals; every metric must expose numerator, denominator, observed window and evidence label.
- **FR-008**: Create or update one durable alert per workspace, alert type and canonical resource while preserving first/last observation, occurrence count and state version.
- **FR-009**: Alert acknowledgement and resolution must bind expected version, actor and reason code; stale, cross-workspace and repeated changes must refuse or replay exactly.
- **FR-010**: Inspect only a closed registry of existing Construction queues; absence from the registry means unsupported, not best-effort recovery.
- **FR-011**: A stale item is determined from server time, canonical status, last transition time and queue-specific threshold; client-supplied staleness must not be trusted.
- **FR-012**: Recovery lifecycle must be `PREPARED`, `APPLIED`, `QUARANTINED`, `REFUSED` or `REVOKED` with immutable before/after state and result fingerprints.
- **FR-013**: Applying a recovery action must recheck exact item version and may mutate only a handler explicitly classified `LOCAL_REPLAY_SAFE`.
- **FR-014**: An item with possible or observed external dispatch must never be automatically replayed; it must enter `QUARANTINED` with a human decision owner.
- **FR-015**: Concurrent scan or recovery retries must create exactly one canonical alert/action/effect through locks, unique constraints and compare-and-swap.
- **FR-016**: Recovery checkpoints must contain only schema/migration identity, closed table counts, high-water marks and canonical fingerprints; no raw row payload is exposed in cockpit or API.
- **FR-017**: A restore drill may run only against explicitly disposable local PostgreSQL source and target databases and must record source, restored and comparison fingerprints.
- **FR-018**: Restore mismatch, missing migration, incomplete table registry or non-disposable database must fail closed and may not be reported as a successful backup.
- **FR-019**: Load gates must publish exact operation count, concurrency, duration, latency percentiles, canonical effect count, duplicate count and pass/fail threshold.
- **FR-020**: Owner/office and field-worker schemas must be independent; field workers receive no workspace-wide queue, privacy, connector, backup, trace or financial details.
- **FR-021**: The Reliability API must be authenticated, rate-limited, private/no-store and return cross-workspace resources as not found.
- **FR-022**: Web and shared Expo iOS/Android surfaces must show honest health, alert and recovery state without claiming production monitoring or observed provider recovery.
- **FR-023**: Every refusal and recovery decision must be reconstructible from canonical references and hashes without sensitive log content.
- **FR-024**: No provider call, external transport, external write, customer data, OAuth, credential, push, Preview, Production, deployment or store action is permitted.

## Failure and exception states

Missing membership, unknown code/dimension/queue, malformed fingerprint, stale
expected version, mixed workspace, unsafe replay classification, possible
external dispatch, incomplete checkpoint registry, non-disposable database,
restore mismatch, hidden-field leak or failed load threshold causes refusal,
quarantine or a visible failed gate. An unavailable metric is `UNKNOWN`, never
zero or healthy.

## Success criteria

- Two synthetic workspaces remain isolated across telemetry, alerts, recovery and cockpit projections.
- Exact and concurrent duplicate signals, scans and recovery commands create one canonical effect.
- All owner metrics expose numerator, denominator, window and evidence label.
- One safe local stale item is recovered once; one uncertain external item is quarantined with zero replay.
- Restart preserves identical alert, checkpoint and recovery fingerprints.
- Disposable backup/restore reproduces all registered counts and fingerprints exactly.
- A deliberately altered restore and an unregistered table fail the drill visibly.
- Bounded load gates process at least 500 synthetic signals with zero lost canonical effect and a recorded p95 threshold.
- Field projection contains zero workspace-wide metric, trace, backup, connector, money or sensitive content.
- Web/iOS/Android share the same strict fail-closed contract.
- Provider and external-effect counts remain zero.

## Assumptions and dependencies

- PostgreSQL advisory locks, transactions, version columns and the existing
  idempotency ledgers remain the canonical concurrency mechanisms.
- Queue recovery initially covers existing local Construction follow-up and
  disabled connector-operation states through explicit handlers; new handlers
  require a new reviewed registry version.
- Backup/restore evidence is local and synthetic. Production backup encryption,
  retention, geographic redundancy and recovery objectives remain UNKNOWN.

## Out of scope

- Production monitoring vendors, real paging, production backups, customer
  disaster recovery, provider retries, automatic uncertain-write replay,
  customer data, secrets, deployment, push, Preview, Production or store
  publishing.
