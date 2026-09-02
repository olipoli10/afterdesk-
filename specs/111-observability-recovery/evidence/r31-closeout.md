# R31 Observability and Recovery — closeout evidence

Recorded at: 2026-09-02T06:00:00-04:00

## Result

R31 adds workspace-scoped, versioned reliability signals, traces, alerts,
recovery operations, checkpoints, restore drills and load gates over the
existing Construction operating state. It exposes independent owner/office and
field-worker projections through the portal and shared Expo iOS/Android app.
Safe local follow-up work reuses the exact R20 handler; uncertain connector
work is quarantined with zero dispatch.

## PostgreSQL and recovery proof

- The complete forward-only chain rebuilt 57 migrations on disposable
  PostgreSQL; the R31 migration is additive and contains no destructive SQL.
- R31 integration: 1 file, 3 tests passed.
- R20/R23/R28/R29/R30/R31 regression: 6 files, 22 tests passed serially.
- Actual PostgreSQL load gate: 500 operations at concurrency 20, exactly 500
  canonical effects, 50 duplicate replays collapsed, 669 ms total, p50 10 ms,
  p95 63 ms against a 5,000 ms threshold; status `PASSED`.
- Actual PostgreSQL 17 dump/restore used distinct local source and target
  databases. The archive was 36,571 bytes and restored six registered rows.
  Source/restored fingerprints both equal
  `13d25b8253f7155e0f0d8699e4da61e529cf9491a0d667a12b4e65c0eaef45d4`.
- The portable PostgreSQL drill used a `DOUBLE PRECISION[]` surrogate only for
  the unrelated historical `TaskEmbedding` vector column because pgvector is
  absent from the portable archive. Backup scope was strictly `User` plus
  `Construction*`; the R31 registered counts and fingerprints matched exactly.
- Four restore mutations refused non-disposable, non-local, shared-port or
  unsafe targets. The test-only load-schema reset contains `DROP` statements
  only for its exact disposable load database; no migration does.

## Validation

- R31 pure contract/policy/recovery gate: 1 file, 6 tests passed.
- R31 mobile gate: 1 file, 3 tests passed.
- Root full suite: 133 files passed, 2 skipped; 1,946 tests passed, 2 skipped.
- Mobile full suite: 22 files, 88 tests passed.
- Root and mobile lint: passed.
- Root and mobile TypeScript: passed.
- Prisma validation: passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 49 static routes including
  `/reliability` and `/(app)/reliability`.
- Next.js 16 Webpack build: passed; 109 static pages generated and the private
  `/api/endvera/v1/mobile/reliability` route included.
- The URL-safety gate initially detected direct browser calls in R30/R31. Both
  now use one closed typed same-origin client; the 48-test URL gate and the
  full suite pass.
- Build guards correctly refused missing synthetic auth/storage configuration
  before the final local-only build used non-secret invalid build values. No
  provider or external write occurred.
- Spec Kit Analyze: PASS; 24 requirements and 11 success criteria covered,
  with zero critical/high/ambiguity/duplication finding.
- `git diff --check`: passed with line-ending notices only.
- `package-lock.json` and `apps/mobile/package-lock.json`: unchanged; no
  dependency was added.

## External-effect and privacy audit

No R31 implementation path calls fetch, axios, undici, Twilio, email, object
storage or a provider. The `externalTransportPerformed: true` text found by the
audit is a Prisma `select` field name used to detect uncertainty; it does not
set the field. Recovery persistence has a database constraint requiring
`externalEffectPerformed = false`. Field projection tests reject queue,
connector, checkpoint, trace, money and hidden identifiers.

## Honest boundary

Evidence labels remain `CODE + TEST + SYNTHETIC`. R31 does not prove customer
value, provider behavior, production monitoring, production restore, Preview,
Production, deployment, store readiness or Verified-E2E coverage.
