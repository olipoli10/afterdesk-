# Pilot populated upgrade rehearsal — peer review

Date: 2026-09-10. Status: implementation still in progress; no execution or final review verdict.

Reviewer owns only `test/personal-pilot-upgrade-rehearsal-review.test.ts` and this audit. No author source, harness, seed, migration, client or dependency is modified by the reviewer. No PostgreSQL process or migration is run.

## Required boundaries

Read the complete upgrade plan including the 21:12Z populated-rehearsal addendum, the code-review skill, current native harness and check-local launcher, the network preload and safe environment, and the new rehearsal helper. The existing normal path uses exact pinned PostgreSQL17.11 executables, a private ignored random cluster, ephemeral SCRAM credentials, loopback, a cleared child environment, bounded process waits, and exact retained-cluster shutdown. Its per-file migrated-template mode must remain intact. The Node network guard is cooperative runtime instrumentation, not an OS firewall or adversarial native-binary isolation.

The new mode must stage prefix70/full79 from real regular files, invoke installed Prisma migrate deploy for both, seed only explicit synthetic legacy data, preserve every old column and actual first70 migration-history row, and verify expected new defaults/proof tables without fabricating history. Its execution mode must not accept an arbitrary remote URL or combine a test-file run with rehearsal. Runtime verification must precede any claim of PostgreSQL17.11 evidence. No reset, drop, shared client regeneration, provider action or recursive cluster cleanup is allowed.

## Early source-reading observations (not reproduced defects)

Initial helper wrote hashes for schema/seed/lock but rechecked only catalog/SQL bytes in baseline/final modes. Executable private Prisma configs were not revalidated before use. Reviewer sent this WIP gap to the author and controller before tests; author agreed to add full input verification before every Prisma/psql phase, reconstructing configs and fixed snapshots rather than trusting a rehashed manifest. This must be checked on the frozen implementation; no RED or fixed-defect claim is made from the preliminary code.

The old per-file isolation test counts one migrate-deploy command globally. Rehearsal legitimately adds two commands in a separate branch; its original one-migration invariant must remain tested on the explicitly delimited, nonempty normal branch rather than being removed.

The fixed seed has been read: it identifies all rows as synthetic, keeps connectors revoked, creates only owner/workspace/member, budget/reservation, legacy operations/receipt, legacy voice metadata and AI operation. Its acceptance by actual70 constraints and upgrade compatibility remain unproven until the controller's native run. Static tests cannot establish that evidence.

Final source hashes, independently executed local negative tests and remaining limits will be appended after source freeze.

## Reproduced staging defect and correction

Controller identified that validating only the expected migration files leaves extra executable migration directories undetected. Independent local filesystem reproduction at **17:19:05: 1 PASS / 3 FAIL**. A genuine stage and verify control passed, but a new migration directory in prefix70, a new directory in full79, and an extra SQL sibling were all accepted by `verifyStagedInputs`. No Prisma or PostgreSQL was invoked; this proves the input-validation gap, not an observed malicious migration execution.

Author added exact directory enumeration for both staged roots, migration directories and each expected SQL directory, including ancestor and entry reparse/type refusal. The original three rejection assertions remained unchanged. Full staged configs/schema/seed/lock/snapshots are also compared against reconstructed expected bytes, and source changes refuse. Installed Prisma package identity must be exactly `prisma` / `6.19.3` before staging and before subsequent input verification. This is installed package-version verification, not a cryptographic attestation of the complete Prisma dependency tree.

## Final review evidence

- New reviewer file has **22 tests**, PASS at **17:22:05**. Eighteen earlier tests passed at 17:21:00; added cases cover Prisma version and static harness phase/boundary contracts.
- Real temporary-filesystem tests copy actual local SQL into an owned temporary fixture, stage exact70/79 copies, and exercise inventory tampering, all executable config/seed/schema/snapshot/lock byte changes, source SQL/schema/seed changes, replay overwrite refusal, junctions and cluster path refusal. Only the exact reviewer-created temporary directories are removed afterward; no retained real cluster or repository data is removed.
- Scoped reviewer ESLint exit 0. Initial shared TypeScript check after this tranche found only two implicit-any callbacks in the author's new test file; author notified. It did not report a reviewer-file diagnostic.
- Author helper, seed, complete harness diff and launcher diff read; author's 30 tests and existing six per-file isolation tests read. Combined run pending at this append.

Frozen files reviewed:

- `deployment/migration-rehearsal/rehearsal.mjs`: `985e184bebd520784234ced83d2596266a1f4bd9e7211012d2ed4bfad0998957`.
- `validate-postgres-native.ps1`: `105f5d58082d83d4cd23b31440983264223012c34bd131078b6422da16e36cd1`.
- `check-local.mjs`: `61683c830318a3b12f660a305443405e7bd7d1b26b4ab1aceffd29492667970c`.

The normal migrated-template branch remains separate and has exactly one ordinary migrate-deploy phase. Rehearsal has two explicit phases, validates all staged inputs before each file-based native execution, preserves/seals baseline70, checks no remaining connections before cloning, carries the same remaining campaign deadline, compares complete old rows/history and retains both databases. All native runtime/hash/ACL/ignore/loopback probes precede the new branch; child environment clearing and exact graceful shutdown remain intact. No reset/drop/shared generation was added.

## Bounded verdict

**GREEN for the reviewed local staging and harness design, subject to final controller checks; no additional actionable defect found.** Filesystem guards are not an atomic defense against a malicious process running as the same Windows identity. ACL application, actual binary execution, schema-engine behavior, SQL seed validity, populated upgrade preservation and successful shutdown are not proved by these tests. Only a controller-run native receipt can establish those local execution facts. Even a successful native17.11 rehearsal will not be a remote PostgreSQL18 restore, backup, schema-drift certification, customer-data test, or permission to deploy. No provider, credential, network or database action was performed by this reviewer.

## Actual dependency graph blocker — native remains on hold

Combined author30 + reviewer22 + normal-mode6 tests passed **58/58 at 17:23:20**. Controller then found an actual-checkout gap not represented by the temporary regular-node_modules fixture: this checkout intentionally uses a shared `node_modules` junction. Read-only inspection confirmed that junction. Reviewer invoked only the exact regular-file lookup used by `requirePrismaVersion` against the real checkout; it failed with `RELEASE_SOURCE_SYMLINK_REFUSED` (Node exit 1). No staging directory or database was created. The preliminary staging verdict does not authorize native execution while this compatibility blocker remains.

Required resolution: a narrowly separate installed-dependency policy, preserving the strict no-link rule for migration source and staged data. The shared source-binding helper must remain unchanged. Review the author's resolution and an actual-checkout version-read smoke before lifting this hold. Package version verification still must not be described as full dependency-binary attestation.

## Dependency resolution and final frozen verdict

Author introduced the read-only `verifyInstalledPrisma` boundary. It permits only this checkout's exact existing `r03/node_modules -> r9/node_modules -> r8/node_modules` chain with both readlink targets pinned, final realpath equality, and a final regular directory. The package file and its resolved ancestors still pass regular/no-reparse checks. Other roots may use regular node_modules, but an arbitrary dependency junction refuses. Migration sources, private staging and shared source-binding code are unchanged by this exception.

Reviewer read the full delta and added two cases: actual-checkout read-only version lookup and arbitrary junction refusal. **2 PASS / 22 intentionally filtered skips at 17:27:51**. A separate direct Node import invoking only `verifyInstalledPrisma(process.cwd())` returned exactly `{"version":"6.19.3","sharedDependencyJunction":true,"readOnly":true}` with exit 0. Neither command started Prisma CLI, PostgreSQL or network activity.

Fresh complete targeted run: **61/61 PASS at 17:28:11** (author31 + reviewer24 + normal-mode6). Root TypeScript no-emit exit 0 and scoped reviewer ESLint exit 0. Final helper SHA256: `2866bd3be3db894ce946e34aa1adba220dff8d0bae3adee33ad278b0ba558983`; harness/check-local hashes above remain unchanged. The initial failed actual-lookup and inventory RED evidence are retained, not overwritten.

**Final GREEN, bounded to this independent source/local-staging review.** The dependency blocker is resolved on the actual checkout and no further actionable issue was found. The controller may proceed with its separately controlled local native rehearsal after its own checks. This is not a claim that the native rehearsal passed, not remote permission, and not a change to real provider/customer-data readiness. All database and provider actions by this reviewer remain zero.
