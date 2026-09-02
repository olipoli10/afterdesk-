# Implementation plan: R24 SMS/MMS

## Architecture decision

Extend R4. R24 adds policy, project routing, MMS evidence references, delivery
observations, protected cockpit APIs and shared native UI. It does not replace
R4 contracts, the R2 canonical intent engine, R10/R11/R12 exact action control,
R14 file security or R17 mobile outbox.

## Phase 1 — Contract and RED

1. Add strict R24 event, policy, preparation, observation and projection schemas.
2. Add RED tests for unknown fields, untrusted adapters, ambiguous routing,
   STOP/START, exact replay, invalid media and non-monotonic delivery.

## Phase 2 — Durable policy and routing

1. Add forward-only permission, media-reference and delivery-event tables.
2. Resolve sender identities and the sole proven project without guessing.
3. Admit one canonical message and attach only pre-inspected evidence.
4. Apply STOP/START/HELP policy atomically and retain immutable audit events.

## Phase 3 — Outbound and delivery state

1. Gate R4 exact SMS preparation on contact purpose consent and suppression.
2. Persist only opaque recipient references in the connector operation.
3. Admit idempotent monotonic synthetic lifecycle observations.
4. Project exact proof level so synthetic state cannot look provider-observed.

## Phase 4 — Web/mobile cockpit

1. Add authenticated rate-limited private APIs.
2. Add strict shared iOS/Android parsing and offline-safe commands.
3. Add one Messages surface for owner/office and a minimized field projection.

## Phase 5 — Validation and continuation

Run R24/R4/R10/R11/R12/R14/R17 tests, PostgreSQL transaction/concurrency/restart
gates, full mobile tests, lint, typecheck, Prisma validation and fresh migration,
Webpack build, lockfile and diff checks. Commit locally, record evidence and
promote R25 automatically.

## Constitution check

- Outcome responsibility: messaging state progresses or explains the blocker.
- External authority: READ/WRITE/delivery remain disabled and separately proven.
- Safety: strict schemas, tenant scope, least privilege, no secret or raw number.
- Durability: canonical PostgreSQL records, immutable audit, replay-safe writes.
- Verification: synthetic delivery is labelled separately from provider proof.

