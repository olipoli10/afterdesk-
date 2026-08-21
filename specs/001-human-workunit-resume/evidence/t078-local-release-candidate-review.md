# T078 — Local release-candidate review

**Verdict:** PASS — **LOCAL RELEASE CANDIDATE ONLY**.

This review closes T078 locally. It does not authorize Preview, Production,
rollout, providers, customer traffic, or any commercial claim. T001–T077 remain
historically closed; Codex reviewer/implementer ownership applied only to T078.

## Authority and freshness

- Frozen product base: `d7f0a394c14259518df3184a3f93fc14293a1427`.
- Branch: `feat/human-workunit-resume`.
- The only untracked product-worktree entry remained `.agents/`.
- `.agents/` manifest: 10 files; SHA-256
  `C18F13483D1B654F715143E3743C2AA5EF080F2400C735E880AFA2BD2DC9DA47`.
- Engineering Factory was read only: I5 `8f1bd1a0898071a64fac3650290a158d6f3287e9`,
  I6 admission `86b3d4c`, I6 hardening
  `4088d00113c738ee9dbbe460e1854db16e499933`; verdict remains **I6 PHYSICAL NO-GO**.
- Brain reconciliation checkpoint before T078 product work:
  `572e5e669a63e7795544039dcad3b6d77cbc584a`.

## Named mutation evidence

Every mutation compiled (`npm run typecheck`), failed by its exact guard name,
was restored, reproduced the same SHA-256, and was followed by a pristine
targeted rerun. A first provisional rollout restoration normalized line endings
and therefore had no byte-exact verdict; it was discarded and rerun from the
canonical clean CRLF checkout shown below.

| Mutation | Temporary defect | Exact failing guard | File SHA-256 before = after |
|---|---|---|---|
| `hwu-rollout-gate-bypass` | Replace the sole admission flag check with `true` | `hwu-rollout-gate-bypass` | `FAC623220649C0C43349C0319ED9E7613B6C00C865B9DFE19ADA3E05A965B760` |
| `hwu-stale-generation-resume-bypass` | Remove `resumeGeneration` from the resume CAS | `hwu-stale-generation-resume-bypass` | `3A678B125113AA66290995F3DC808103DFA368D0B1DDC5E1FE6E8F4783BCA957` |
| `hwu-lifecycle-withdrawal-bypass` | Remove the transactional `withdrawHumanUnit` call | `hwu-lifecycle-withdrawal-bypass` | `FAC623220649C0C43349C0319ED9E7613B6C00C865B9DFE19ADA3E05A965B760` |
| `hwu-worker-projection-leak` | Select `snapshotId` into the active worker projection | `hwu-worker-projection-leak` | `FADAD16AB692964E1BC2171E85D27E33E6BA56CCA5A5E3A10EAECD6012AE6803` |
| `hwu-waiting-provider-spend-bypass` | Let any claimed unit pass the resumed-only execution fence | `hwu-waiting-provider-spend-bypass` | `FAC623220649C0C43349C0319ED9E7613B6C00C865B9DFE19ADA3E05A965B760` |
| `hwu-duplicate-resume-or-payout-bypass` | Disable the application-level already-resumed fence | `hwu-duplicate-resume-or-payout-bypass` | `3A678B125113AA66290995F3DC808103DFA368D0B1DDC5E1FE6E8F4783BCA957` |
| `hwu-poison-item-stops-recovery-sweep` | Remove per-item recovery isolation | `hwu-poison-item-stops-recovery-sweep` | `3A678B125113AA66290995F3DC808103DFA368D0B1DDC5E1FE6E8F4783BCA957` |
| `hwu-post-commit-replay-duplicates-effect` | Move session cleanup before the durable candidate commit/refusal boundary | `hwu-post-commit-replay-duplicates-effect` | `49109FE827685979B53683C54F678B0F9888AD573C6E40FAEA3B7CC1C63C876A` |

No mutation exposed a surviving product defect after restoration. Therefore no
production runtime correction was made in T078.

## Pristine validation

### Disposable PostgreSQL proof

- Named Prisma Dev instance: `hwu-integration`, recreated because its prior PID
  record was stale and no process or port existed.
- TCP listener: `127.0.0.1:51214`, positively observed as `Listen`.
- Logical database: `afterdesk_integration`.
- URL shape: local TCP only, `sslmode=disable`, `pgbouncer=true`,
  `connection_limit=10`.
- Destructive-test opt-in: `ALLOW_INTEGRATION_DB_RESET=1`.
- The integration global setup reported the exact host/database before changes.
- All 35 migrations were applied from zero after recreation.
- No shared or Production database, `prisma db push`, or `prisma migrate reset`
  was used.

### Results

| Gate | Result |
|---|---|
| T078 mutation guards before registry closure | 8/8 PASS |
| T078 final guards including registry closure | 9/9 PASS |
| Adjacent pure suites | 5 files / 90 tests PASS |
| Targeted PostgreSQL scenarios | 7 files / 108 tests PASS |
| ESLint | exit 0; 0 errors; 0 warnings |
| TypeScript | exit 0 |
| Fast suite | 63 files / 1,494 tests PASS |
| Full PostgreSQL suite | 29 files / 345 tests PASS |
| PostgreSQL invariants | 1 file / 40 tests PASS |
| Migration chain from zero | 35/35 applied |
| Next.js local build | 16.2.12; compiled; TypeScript PASS; 95/95 static pages generated |

The build used the installed `next` binary directly because the disposable
schema had already been reconstructed from all migrations without Prisma's
`_prisma_migrations` ledger. Running the package wrapper's preceding
`prisma migrate deploy` against that nonempty schema would produce a false P3005
rather than add evidence. `DATABASE_URL` and `DIRECT_URL` both pointed at the
same disposable local TCP database; auth, origin, cron and R2 values were
synthetic build-only strings. No provider call was made.

## Residual risks and unknowns

- Rollout is structurally disabled by the repository default and no rollout or
  deployment was performed. External environment database values were not read
  or changed; this local review does not claim an independent Production-state
  observation.
- Demand, frequency, coverage gain, willingness to pay, revenue and margin
  remain **UNKNOWN**.
- No customer traffic, provider traffic or native execution was exercised.
- Engineering Factory I6 remains independently blocked at PHYSICAL NO-GO.

## Final claim

T001–T078 are contiguous and locally closed. The accepted HumanWorkUnit + Safe
Resume contract passed its structural, mutation, fast, real-PostgreSQL,
invariant, migration and local-build gates. The only permitted label is:

**LOCAL RELEASE CANDIDATE ONLY — rollout false; no push, Preview, Production or provider.**
