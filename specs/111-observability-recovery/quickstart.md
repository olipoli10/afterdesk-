# Quickstart: R31 Observability and Recovery

## Preconditions

- Use a fresh disposable local PostgreSQL database named `endvera-r31-*`.
- Apply forward-only migrations; never use `prisma db push`.
- Use only synthetic workspaces, users, follow-ups and connector operations.
- Keep provider, transport and external write paths disabled.

## Scenario A — Signals, metrics and tenancy

1. Seed two synthetic workspaces and active roles.
2. Record exact and altered duplicate signals.
3. Inspect both cockpits and field projection.
4. Expect one exact canonical signal, altered reuse refusal, complete tenant isolation and no hidden field.

## Scenario B — Scan and safe recovery

1. Seed an overdue managed R20 follow-up and a stale prepared R23 connector operation.
2. Run two concurrent workspace scans.
3. Expect one alert for each item.
4. Prepare and apply the follow-up recovery twice with one command identity.
5. Expect one R20 canonical due transition and one replayed R31 result.
6. Prepare/apply connector recovery; expect `QUARANTINED`, owner review and zero connector dispatch.

## Scenario C — Restart equality

1. Capture cockpit, alert and recovery fingerprints.
2. Stop and restart the process against the same disposable database.
3. Re-read state and expect byte-equivalent canonical fingerprints.

## Scenario D — Backup and restore

1. Create a recovery checkpoint.
2. Run `scripts/run-disposable-restore-drill.ps1` with explicit `endvera-r31-*` source and target names.
3. Expect schema, registered counts and fingerprints to match.
4. Run the mutation mode and expect a visible failed drill.
5. Try a non-disposable name and expect refusal before backup creation.

## Scenario E — Concurrency and load

1. Run 500 bounded synthetic signal writes at the recorded concurrency.
2. Repeat a fixed subset with identical keys.
3. Expect no lost canonical effect, exact duplicate counts and a persisted p50/p95 gate result.

## Validation commands

Run targeted R31 unit/integration tests, R20/R23/R28-R30 regressions, Prisma
validation and fresh migration, root/mobile lint and typecheck, mobile tests,
Expo Doctor/exports, Next.js Webpack build, Spec Kit analysis, `git diff
--check`, lockfile fingerprint and forbidden-effect audits. Record every result
as CODE, TEST or SYNTHETIC; do not report OBSERVED production evidence.
