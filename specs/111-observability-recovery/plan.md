# Implementation Plan: R31 Observability and Recovery

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android app and existing role-safe Construction cockpit.
- Existing R20 follow-up, R22 human escalation, R23-R27 connector and R30 privacy state remain canonical.
- One forward-only migration adds reliability evidence and recovery control records; no dependency or lockfile change.
- PostgreSQL command-line backup/restore tooling is used only by a fail-closed disposable-local drill script.

## Architecture

1. Define a closed observability vocabulary and bounded safe dimensions; reject arbitrary log payloads.
2. Persist append-only deduplicated signals that can also represent safe trace spans through exact trace/span references.
3. Derive metrics from canonical tables and accepted signals with numerator, denominator, time window and evidence label.
4. Maintain one versioned alert per workspace/type/resource with immutable signal history and compare-and-swap adjudication.
5. Register existing queues through explicit inspectors and recovery handlers. The initial registry covers due managed follow-ups and stale prepared connector operations.
6. Permit exact local replay only for due follow-ups already proven idempotent by R20; quarantine connector work rather than replay possible external effects.
7. Persist recovery commands with before/after hashes, exact replay, collision refusal and a named next responsible role.
8. Create minimized recovery checkpoints from a closed canonical table registry.
9. Run backup/restore drills only against database names and URLs that satisfy a strict disposable-local guard; compare schema identity, counts and fingerprints.
10. Persist bounded concurrency/load gate results rather than claiming performance from test count alone.
11. Expose one private/no-store API and independent owner/office versus field-worker web/mobile projections.
12. Prove tenant isolation, restart equality, concurrency, recovery, restore mismatch detection, role minimization and zero external effect.

## Queue recovery registry v1

| Queue kind | Canonical source | Stale rule | Replay class | Recovery |
|---|---|---|---|---|
| `FOLLOW_UP_DUE` | `ConstructionFollowUp` | managed `scheduled`/`escalated`, due before server cutoff | `LOCAL_REPLAY_SAFE` | invoke exact R20 due-item handler once |
| `CONNECTOR_PREPARED` | `ConstructionConnectorOperation` | `prepared` beyond server cutoff | `EXTERNAL_EFFECT_UNCERTAIN` | quarantine; owner review only |

An unsupported queue kind refuses. Adding a handler requires a new registry
version, replay-safety review and integration/concurrency evidence.

## Persistence

- `ConstructionReliabilitySignal`: append-only safe signal/trace evidence.
- `ConstructionReliabilityAlert`: current versioned incident projection.
- `ConstructionRecoveryOperation`: exact idempotent recovery command ledger.
- `ConstructionRecoveryCheckpoint`: minimized canonical-state manifest.
- `ConstructionRecoveryDrill`: immutable restore comparison result.
- `ConstructionReliabilityGateRun`: immutable bounded load/concurrency result.

## Constitution Check

- **Owned outcomes**: PASS — every alert names a next owner and recovery state.
- **Canonical state**: PASS — inspectors read R20/R23 records; no second queue is created.
- **Closed-world capability**: PASS — vocabulary, dimensions, queues and handlers are allowlisted and versioned.
- **Authorization/tenancy**: PASS — membership and workspace ownership are reloaded at every command and query.
- **Sensitive-data handling**: PASS — schemas accept only bounded codes, references, counts, hashes and safe dimensions.
- **Recovery safety**: PASS — only proven local-idempotent work can replay; uncertain external work quarantines.
- **Verification/evidence**: PASS — checkpoint, drill and gate outcomes are separate immutable evidence records.
- **Proportionate testing**: PASS — real PostgreSQL, concurrency, crash/restart, restore and load paths are exercised.
- **External effects**: PASS — provider and external write paths remain disabled.

No constitutional exception is required. The post-design check remains PASS.

## Validation

- R31 contract/policy unit tests and fresh disposable-PostgreSQL integration tests;
- RED/mutations for unknown dimensions, cross-workspace access, stale versions, duplicate scans, unsafe replay and hidden fields;
- exact R20 recovery and R23 quarantine integration/concurrency tests;
- local `pg_dump`/`pg_restore` drill plus deliberate mismatch and non-disposable refusal;
- bounded 500-signal load gate with recorded correctness and latency denominators;
- R20/R23/R28/R29/R30 regression gates;
- root and mobile tests, lint/typecheck, Prisma validation, fresh migration, Expo Doctor/exports, Next.js Webpack build, Spec Kit analysis, diff/lockfile/forbidden-path audits.

## Delivery and continuation

Commit the R31 transition, implementation and closeout coherently. Mark S4 and
R31 DONE, then promote R32 Onboarding/Import and continue without an
intermediate final or founder prompt. No push, provider, deployment, production
database, customer data or external recovery action.
