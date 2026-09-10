# Native PostgreSQL test-file isolation

## Observed failure, not a production recovery change

The controller run `evidence/postgres-native-1789049425151` finished with
173/176 tests passing. Voice gateway 12/12 and temporal registry 29/29 passed.
The three failures were in `sms-inbound-recovery.postgres.test.ts`: its global
recovery batch included expired operations committed by earlier test files in
the same database (for example, 21 of its own 31 rows recovered instead of 25).
Sequential Vitest files do not provide database isolation.

## Harness change

`validate-postgres-native.ps1` retains its unique private loopback cluster,
runtime byte pins, outbound network guard, ephemeral credentials and exact
stop/retention procedure. It now:

1. Freezes the canonical flat `*.postgres.test.ts` inventory (or one exact file).
2. Creates and migrates one empty base using the complete current migration set.
3. Records the completed migration-name/checksum digest, disables connections
   to the base and requires zero remaining sessions. It does not kill sessions.
4. Creates a fresh random database from that base for every file, verifies the
   copied migration digest, then starts a fresh Vitest process with the exact
   file and clone-bound `DATABASE_URL`, `DIRECT_URL`, `PGDATABASE` and guard name.
5. Records per-file database/template/digest/exit provenance. An assertion
   failure remains a campaign failure even when later files pass.

The ten-minute campaign test budget applies to each clone, fingerprint and test
phase through its remaining duration; bounded process/server cleanup follows
separately. Clone/setup exceptions
stop fail-closed; assertion failures permit independent later files to run.
Every database remains in the private cluster, which is stopped at the end.
No deletion, reset, fixture relocation, recovery filter or weaker assertion is
introduced. Tests within a file still share its database intentionally.

The digest is a diagnostic equality check, not independent schema attestation.
Cloning does not copy database-level `ALTER DATABASE SET` settings; this harness
does not set those, and existing three-timezone tests retain transaction-local
settings. This is not a hostile-test sandbox: fixtures still use the synthetic
local operator in one private cluster.

PostgreSQL 17 documents that a database owner may clone a non-system database,
that cloning requires no other connections to its template, and that new
databases allow connections by default. References checked 2026-09-10:
[CREATE DATABASE](https://www.postgresql.org/docs/17/sql-createdatabase.html),
[Template databases](https://www.postgresql.org/docs/17/manage-ag-templatedbs.html).

## Validation boundary

Four new static contract tests failed before the patch (2026-09-10 10:16:04
local test clock), then nine combined harness tests passed at 10:17:15.
PowerShell parsing reported zero errors; scoped ESLint passed.
Peer review identified that the first delta still gave clone and fingerprint
their own full 30-second timeout near campaign expiry. Both now receive the
remaining campaign budget before process start. A fifth regression checks this
ordering; combined 10/10 harness tests passed at 10:20:00, with parsing and lint
still passing. The initial nine-test run did not cover this timeout edge.
These checks do not prove native cloning or recovery behavior. Independent
review and the controller's native rerun are required; preserve the prior
173/176 receipt and do not relabel it as passing.

## Controller native observations

`postgres-native-1789050187218`: targeted temporal32/32 PASS, one genuine clone,
same77-migration digest, normal stop confirmed at14:23:38Z.

`postgres-native-1789050288734`: all16 files /179 tests PASS, sixteen distinct
clone database ids, identical77-migration digest. The campaign still exits1:
the original15s graceful-stop wait ended before the final retained-clone fsync
completed (17.687s). The server logged shutdown at14:27:06.125Z; follow-up
postmaster.pid absence and read-only pg_ctl status exit3 confirmed STOPPED.
`cleanup-observation.json` records this without rewriting result.json.

The stop remains fast/graceful and exact-data-directory scoped; its wait is now
45s inside a55s child envelope. No immediate shutdown, server kill, deletion or
test-deadline extension. One old static assertion still expected15s and failed;
it now pins45/55 exactly. Controller11/11 harness contract tests PASS10:30:20.
A fresh end-to-end campaign, including successful cleanup, is still required.

Fresh controller campaign `postgres-native-1789051241146` completed
2026-09-10T14:43:22.077Z with exit0 and explicit server STOPPED. All16 isolated
files/192 tests pass, including45 temporal cases. Sixteen distinct cloned
databases share migration fingerprint77:f072fe1fe84f1d2f87bd61dfc0d642ef.
The earlier exit1/cleanup observation remains unchanged. This certifies the
local harness snapshot and synthetic SQL tests, not provider/customer E2E.
