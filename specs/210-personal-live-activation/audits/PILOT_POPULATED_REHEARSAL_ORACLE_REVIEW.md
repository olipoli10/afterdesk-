# Populated70-to79 local rehearsal: independent oracle review

Date:2026-09-10. Status: GREEN for SQL seed/comparison oracles; native execution NOT performed.

## Scope

Controller assigned this lane only SQL seed and verification-oracle review.
The separate peer reviews paths/process safety; controller alone runs native
PostgreSQL. This lane owns only this audit and
`test/personal-pilot-upgrade-rehearsal-oracle-review.test.ts`. No migration,
schema, author helper/seed, remote data, credential or provider mutation.

Read the full21:12Z addendum of `PILOT_BACKEND_APK_UPGRADE_PLAN.md`, the complete
rehearsal helper and seed, the existing migration risk audit, actual69/70 and
legacy voice SQL constraints, actual71/72/77 in full, and the relevant71-to79
DDL/default/table/trigger definitions and75/79 subject/shape constraints. No SQL
was executed. These reads establish consistency for review, not compatibility
with an observed remote or a restored backup.

## Seed and historical preservation

The seed is explicit synthetic data, inserted after genuine prefix70 deployment:
owner/workspace/member, two revoked accounts, a budget with250000reserved micros,
four ordinary operations spanning received/completed/pending/processing, one
synthetic delivery receipt, one legacy voice session/segment and a voice-subject
AiOperation. It contains no real credential or provider acceptance, and labels
the voice consent and receipt as synthetic rather than an actual user grant.

The old nullable kind/provider/status and budget checks permit the proposed
values by static inspection. The voice language/media fields are literals in
direct INSERTs, subject FK refers to the seeded user/segment, bounds remain
within the historical600s/45s/14segment limits. Expiry is within24h of its explicit
createdAt. The old March8 02:30 naive timestamp, nested JSON, decomposed Unicode,
reservation, expired lease and result fields are useful preservation sentinels.
No migration history rows are seeded or repaired; native Prisma must produce
the real70 then79 history.

Snapshot SQL selects `to_jsonb(t)` for every seeded table, not a subset of known
columns. The verifier compares all old fields and row counts exactly, adding only
the new NULL links and `subjectKind=voice_intake` allowed by71/72/75/78. The before
snapshot refuses those new columns, so a79 schema cannot be silently described
as70 in this comparison. It requires exact prior70 history rows (including IDs,
timestamps and logs), not merely a final count79. These checks do not authenticate
arbitrary supplied snapshots outside the controlled harness execution.

## Static observations corrected before any reviewer run

- The first WIP proof-table list used `PersonalSmsReplyExpectation`. Actual76
  creates `PersonalSmsConversationExpectation`; this was reported immediately
  and corrected by the author. No native RED is claimed.
- Initial default checks used substring CURRENT_TIMESTAMP/UTC, which could
  accept a UTC-like expression shifted by an interval. Requested exact
  `pg_get_expr` representation instead; author applied it during WIP.
- Initial77 check searched only for an ELSIF token. Requested exact `prosrc`
  comparison against the staged immutable migration77 body. Author implemented
  that stronger comparison; no runtime execution or pre-fix RED is claimed.

At a genuine frozen70 prefix, Confirmation73 does not yet exist and73 creates it
empty, so76's backfill must produce zero ledger rows. Final counts of all seven
new proof tables must be present and exactlyzero. Missing counts are not zero.
This does not cover an already partially upgraded remote database.

## Tests and verdict pending freeze

The independent test file uses the actual comparison functions with explicitly
synthetic JSON snapshots. It includes positive controls and negative old-column,
history, added-link, new-proof, default, function-body, constraint, trigger and
index oracles. It also checks the SQL query and seed against actual physical
names and absence of forged history/disabled checks. These are not database
fixtures and cannot prove seed execution or SQL catalog formatting.

Final source hashes, actual targeted results and bounded verdict will be appended
after author freeze. Native failures, if any, belong to the controller's retained
receipts and must not be replaced by these pure tests.

## Final freeze and independent execution

The author announced the freeze at17:22. The entire final helper and its30 tests
were then read; the independent fixture was updated to include the new required
index map and invalid-trigger count BEFORE its first execution. Positive controls
therefore satisfy the full frozen contract, not an obsolete object shape that
would make every negative test pass by early refusal.

At17:24:36, the first reviewer execution passed **67/67**:37 independent oracle
tests plus30 author tests. No reviewer RED run is claimed for this source. The
three static WIP findings above were corrected before the reviewer executed it.
Scoped reviewer ESLint exited0 without suppressions.
The subsequent complete TypeScript `--noEmit` check also exited0 (session91596).

The37 tests cover changes in all10 seeded tables' arbitrary old nested columns,
missing/replaced columns/rows, exact new NULL/discriminator mappings, preexisting
post70 fields, old history IDs, missing/reordered79 history and invalid migration
states, each of seven new proof counts and missing-count refusal, UTC-like but
wrong default expressions, substituted77 body, required validated constraints,
enabled triggers, separately counted invalid triggers and required valid indexes.
The positive receipt keeps remotePg18Verified/providerCallsAuthorized/
deploymentAuthorized false. No native or remote inference follows from that
synthetic receipt returned by pure comparison functions.

Reviewed freeze hashes:

- Helper `rehearsal.mjs`:
  `985e184bebd520784234ced83d2596266a1f4bd9e7211012d2ed4bfad0998957`.
- Seed `seed-70.sql`:
  `7c41d9095859d8a648d2f903b57306420d468e0f75abb626e13ee219d37827fa`.
- Independent test:
  `3736f0c52379b391032a0f6bac72a21ee1cb653d6a9bac7d7b6cf7697c04e97a`.

## Bounded verdict and remaining runtime proof

No remaining concrete SQL-seed or comparator defect was found in this bounded
review. It does not certify every catalog object's complete definition or every
legacy workload. The checks validate reported constraints and selected required
names, index readiness, exact18 default expressions and77 function source; they
are not a full schema-drift diff. SQL formatting/CRLF preservation of `prosrc`,
actual PostgreSQL defaults, actual seed INSERT validity, real Prisma history and
successful populated migration must still be observed by the controller's native
run. A native failure must be retained, not normalized away to make it pass.

Path/process review belongs to the other peer. A possible installed-Prisma
version-check interaction with the known shared node_modules junction was sent
to that peer rather than changing the author's helper here. This oracle verdict
does not override that separate execution-safety gate or authorize a native run.
No database was started and no migration/history rows, remote data or provider
were modified by this reviewer.
