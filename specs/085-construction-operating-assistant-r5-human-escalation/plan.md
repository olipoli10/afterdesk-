# Plan

## Technical context

TypeScript, Next.js, Prisma and PostgreSQL. R5 starts from Construction R4
`2e201d822f904744e879442ec9eb5c0059177820` and imports the immutable local
HumanWorkUnit RC `c156348f16d2a0b7dc174ae96845427b2fe8eea1` through Git history.
No dependency or lockfile change is required.

## Constitution check

- Owned outcome: a bounded human exception returns a reviewed result and the
  original workflow continues.
- Closed world: escalation purposes, result contracts, states and refusals are
  versioned enums/unions.
- Authorization: enforced at every request, claim, review and resume boundary.
- Human work: existing typed HumanWorkUnit lifecycle is reused.
- Verification: schema conformance is not acceptance; a separate reviewer owns
  acceptance.
- Evidence: immutable acceptance, resume record, construction transition,
  snapshot and audit event.
- Economics: accepted price/payout/currency/effort freeze at preparation;
  publication requires pre-existing authorized funding and performs no capture.
- Incremental change: one bridge and one forward-only migration.

## Implementation sequence

1. Merge the exact local HumanWorkUnit RC while preserving the newer
   Construction R4 product, package lock and public surfaces.
2. Add a versioned construction escalation binding and forward-only migration.
3. Add a pure contract compiler that produces the minimum HumanWorkUnit packet.
4. Add transactional request, withdrawal, accepted-result application and
   recovery services.
5. Add role-shaped queries and authenticated server actions; no client-facing
   human-unit timeline is introduced.
6. Prove replay, concurrency, restart, authorization, leakage and zero transport
   against disposable PostgreSQL.
7. Run HumanWorkUnit, Construction, Prisma, lint, typecheck, serialized suite and
   Webpack build gates; commit locally.

## Rollback

Code rollback removes the bridge. Data rollback is logical: withdraw unpublished
or active escalations and refuse replay. Accepted HumanWorkUnit evidence and
applied construction transitions are retained and never rewritten. The database
migration is forward-only and non-destructive.
