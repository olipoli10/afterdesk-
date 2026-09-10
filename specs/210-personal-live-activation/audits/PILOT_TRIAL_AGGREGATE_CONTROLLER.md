# Actual PG18 trial baseline and canonical Prisma formatting

2026-09-10, controller. Managed trial T identity freshly reconciled: project
withered-mud-08129552, br-holy-brook-ax7k68oh, parentA br-long-waterfall-ax3zhqtl,
fixed0.25CU endpoint ep-crimson-violet-axmmwtjw. Free_v3, project logical size
45162496bytes; reported compute1443seconds/transfer193439bytes may lag billing.
Explicit suspension is used; returned suspend_timeout_seconds=0 is not evidence
of a guaranteed automatic five-minute shutdown.

Actual transaction sizing read established PostgreSQL180006, neondb_owner,
neondb, repeatable read/readOnly on,70 history rows, public relation size7340032
bytes. Main read the aggregate-wrapper module and31 tests completely. It
rebuilds the existing reviewed query and only changes BEGIN to SET TRANSACTION
and removes COMMIT because the connector owns the transaction. No arbitrary
semicolon splitting, caller SQL or weakened timeout is admitted.

One actual15-statement read-only aggregate transaction against T completed.
Private capture .scratch/pilot-trial-data-before70-20260910T2308Z.json has SHA
3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a.
Complete183-table/2624-old-column capture validated;9 nonempty tables,81 total
rows including70 migration records. Counts/aggregate digests only were returned,
no application rows or per-row hashes. Self-comparison establishes capture
shape/completeness ONLY, not preservation after an unperformed migration.

Original query SHA4fdd6f2c263df2d7613f4660a49f0d090b316333c652e222737d086471730b28;
transaction-list SHA2bec7f86ca19116edaa7f356ee602bc54da1ef79d0edd98b54ecc4248858f8c9;
plan SHA f89406ca9aae018725fae5dd9f2d184945b4e823f90cd8726cd11b3bde802241.
Exact T suspension requested in finally; later fresh metadata confirms idle,
suspendedAt2026-09-10T23:09:46Z (controller observation23:10:23Z). Ancestors
untouched. No SQL mutation, migration, credential retrieval, messaging, deploy
or APK in this tranche. This is managed read evidence, not native-only proof.

## Reproducible local clean-checkout blocker repaired

Created owned detached worktree C:/dev/endvera-personal-trial-preflight-20260910
at456df894, shared dependency junction read-only and own copied generated client.
Initial actual prerequisite refused GENERATED_SCHEMA_MISMATCH before any secret
or remote call. Source schema was unformatted while the generated client used
Prisma's canonical formatting; whitespace and attribute/comment order differed.
Installed Prisma6.19.3 format ran first on the owned worktree schema, then on
r03 after exact preimage check. Result matches generated schema byte-for-byte:
0ed720a441ec604a95cb12e453a29b1d68c8603a62082789bba3e751eefd4eff.
Generated-client tree4271c323a2a970ce828cb8781ecec1959854e5fff9dd7c644e2881fc36f2f69b
was not regenerated or modified. Main and separate reviewer read full diff-w;
only whitespace, same @@unique/@@index order and comment placement changed.
No fingerprint acceptance weakened, no immutable migration edited.

Root1789081685785 retained exit1:6712passed/28failed/3historical skips.27 failures
collected the aggregate author's still-invalid PG18 notNullCount:null fixture
before its corrected freeze;1 failure was a literal spacing assertion after
formatting. Two static assertions now keep exact field/type/attribute/relation
tokens on a full single line with horizontal whitespace flexibility. Separate
peer reviewed these exact regexes. Controller fresh78/78 PASS19:11:26 (8 schema,
31 wrapper,39 builder); author wrapper70/70 and tsc/lint PASS. Full root rerun
after source freeze is still required. No failed result has been overwritten.

Prisma v6 TLS options verified against its official PostgreSQL connector docs:
https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql
This documentation check is not a successful real Prisma TLS connection.
