# Independent review: additive native70/79 catalog capture

2026-09-10. Verdict: **GREEN for the bounded source delta and focused tests**.
No database, network, remote connection, provider, credential, native launcher,
Prisma generation, build or full-root execution was performed by this reviewer.

## Scope and source read

Read the entire controller capture continuation in PILOT_SCHEMA_DRIFT_PLAN.md,
the two changed-file diffs, the complete staging helper and the harness sections
for child-process bounds, environment isolation, rehearsal sequence and cleanup.
Used the engineering code-review skill. Reviewed only additive capture behavior;
the earlier populated70-to79 result is not recast as proof of this new query.

Controller-owned files reviewed:

- deployment/migration-rehearsal/rehearsal.mjs
- validate-postgres-native.ps1

Only this audit and test/personal-pilot-schema-capture-review.test.ts were created
for this task. The SQL-review test/audit received the separately requested three
explicit internal-char cast regression checks after the controller native failure.
No production, helper, harness, migration or schema edit by this reviewer.

## What the delta preserves

- Stage the exported fixed query as schema-catalog.sql with exclusive creation;
  inputs.json records its SHA256. verifyStagedInputs compares both the expected
  input manifest and the exact staged bytes against the current fixed query.
- Every Save-RehearsalCatalog call first runs existing input verification, then
  recomputes remaining campaign time for the existing psql child. Verification
  of the saved snapshot runs through the same helper CLI, which rechecks inputs.
- psql uses fixed -X/-q/-A/-t, ON_ERROR_STOP and the one staged -f path. There is
  no new connection, process launcher, remote destination or inherited secret.
  Existing remaining-time/child cleanup rules apply. SQL bounds output; the
  existing JSON-file cap is stricter (4,000,000 bytes), so excess refuses.
- Only catalog-70/catalog-79 labels are accepted; capture destinations reject a
  preexisting path and receipts use flag wx. This is the existing exclusive,
  private single-controller directory model, not a new hostile-writer sandbox.
- Capture70 follows baseline verification and precedes sealing. Capture79 occurs
  only after clone/migrate79 and old-row snapshot checks. No unsealing was added.
- verifyCatalogCapture self-compares shape, pins PostgreSQL17.11 and preserves
  unsupported/known-guard review flags. A supplied synthetic snapshot can produce
  a shape-valid receipt: query hash is not proof that PostgreSQL executed it.
  remoteObserved, snapshotProvenanceVerified, backupVerified and execution
  authority remain false in the relevant receipt/comparison fields.
- The ordinary migrated-template test branch is unchanged against git HEAD
  after CRLF/LF normalization; its checked SHA256 is
  f96e5e4f9949a2a4bbbb3b588159fa45022592009f6d1d5aa7b69ada3a91d181.

## Verification and retained failure

Fresh safeEnvironment run at **18:02:27 America/Toronto**:

- New independent capture tests: **14/14 PASS**.
- SQL-shape reviewer with three new char-cast checks: **24/24 PASS**.
- Existing rehearsal author suite: **31/31 PASS**.
- Combined **69/69 PASS**; PowerShell ParseFile **0 errors**; scoped reviewer
  ESLint exited0. These are pure helper/static wiring tests, not native execution.

Subsequent TypeScript `--noEmit --incremental false` completed with exit0
(reviewer process44786), without generation or full-suite execution.

No reviewer RED was needed for the additive capture delta. Separately, read the
controller's actual result.json/output.txt and retained catalog-70.log for
postgres-native-1789077665225: exit1, stage REHEARSAL_CATALOG_70, finished
2026-09-10T22:01:23.653Z, exact cluster stopped and retained. PostgreSQL rejected
unknown || internal char at RELKIND_. Controller fixed three label expressions
with ::text (relkind, typtype, prokind). The new SQL oracles ran after that fix;
they must not be represented as independent native reproduction or a successful
rerun. Our earlier static GREEN had not established PostgreSQL parsing.

Reviewed hashes at this point:

- rehearsal.mjs: 0befc6951e9e09b0c2f5a6a30f3220edced98947d53ca4d5a8663308decf7ead
- validate-postgres-native.ps1: 629ac9f2a2cff1fa8eec779cdda951873e4aad9315656e055ebe3c1dced0da7b
- pilot-schema-drift.mjs after casts: a27b1c23750cf22b5e71ef89c1d6a83606afa0a7b8b3fa583826f409d695cf3d
- new reviewer test: cbb36592726473ae8bfab703f3af56b37587c51e1823c563b905f0c12d18594e

No additional concrete blocker found in this capture delta. Controller still
owns the real query rerun, full capture/receipt lineage, compatibility assessment
and any separately authorized metadata-only remote observation. This review is
not remote catalog equality, backup/restore verification or upgrade authorization.
