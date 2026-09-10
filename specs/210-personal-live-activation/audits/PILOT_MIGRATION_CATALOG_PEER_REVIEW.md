# Pilot migration catalog: independent local review

Date:2026-09-10. Status: GREEN within the explicitly local supplied-data contract.

## Scope and evidence boundary

Read the complete `PILOT_BACKEND_APK_UPGRADE_PLAN.md`, repository AGENTS,
code-review skill, the existing `endvera-release-source-binding.mjs` and its
independent test, and the historical deployment `RELEASE.md`. Historical70 and
current local79 are separate facts; no remote database connection or observation
is performed by this review. The old provisioning script is not an upgrader and
will not be run or edited. No secrets, credentials, provider APIs or network.

Reviewer ownership: only
`test/personal-pilot-migration-catalog-review.test.ts` and this audit. The author
owns `deployment/pilot-migration-catalog.mjs` and its author tests. No source,
migration, schema, release manifest or version modification by this reviewer.

## Planned falsifiable checks

- Exact ordered79 names and stable inventory hash; baseline70/pending9 split.
- Root/directory/file links and realpath escape refusal; lexical traversal,
  missing, unknown, nonregular or duplicated inputs must not be silently ignored.
- Raw SQL SHA-256 remains raw. Only explicit all-LF/all-CRLF alternatives may be
  compared, never whitespace/SQL normalization, mixed line endings, loneCR,
  invalid UTF-8, NUL or a content edit with a recomputed caller manifest.
- Supplied migration rows require exact known names/checksums and closed completed
  state. Missing, duplicate, unfinished, rolled-back, failed or malformed state
  must fail closed. Ordering rules must be explicit rather than accidental.
- Positive synthetic supplied rows prove only consistency of those supplied rows
  with a local catalog. They do not prove live remote identity, a backup, absence
  of schema drift, a safe populated migration, release authority or readiness.
- Immutable local output, bounded arrays/bytes and refusal of unsafe object
  shapes are checked where the final public contract claims those boundaries.

The existing release helper checks all path components without accepting links.
Its text-extension CRLF comparator deliberately does not include `.sql`; this
catalog must define its SQL line-ending policy explicitly without modifying that
unrelated helper or historical hashes.

Source freeze, executed negative tests, findings and final limits will be appended
after the author publishes the module. No PASS has been inferred from this plan.

## Completed independent review

Read the entire final module and42 author tests before writing the separate20
reviewer tests. No source edits were made by this reviewer. Final author source
SHA256: `1db0dc462e69b2cfd067a608b6c3e53c8901920217ecaa719460b4a82786ec4b`.

The implementation rejects linked ancestors, repository roots, migrations
parents, individual migration directories and SQL paths; exact79 ordered names
are pinned independently of filesystem enumeration order. Reviewer tests created
only uniquely named temporary fixtures and junctions within owned temporary
paths, then removed those exact verified temporary roots. No actual migration
file, remote resource, receipt or deployment input was changed.

The comparison accepts rows in arbitrary input order but returns canonical
ordinal order. It demands exactly70 distinct known historical names, five closed
columns, a finite canonical finished timestamp, rolled_back_at exactlynull and a
positive integer applied_steps_count. Unknown/pending/missing/duplicate or invalid
states refuse. Hidden metadata/accessors, exotic array shapes and Date subclasses
are refused without using attacker-supplied accessor functions in these tests.

Strict UTF-8, nonempty/max262144bytes, BOM/NUL refusal and exact newline policy
were tested. Mixed/bare/doubled CR and invalid UTF-8 refuse; SQL whitespace,
comments, case and Unicode normalization differences remain different hashes.
The catalog is a byte inventory, not an SQL parser or populated-data safety proof.

## Retained19/1 result and explicit contract clarification

At17:11:17, reviewer20 produced **19 PASS / 1 FAIL**. The failing oracle expected
the comparator to reject a caller-supplied manifest whose alternate newline hash
was invented while the raw observed hash/size stayed unchanged and the public
catalog digest was recomputed. The comparator accepted matching supplied rows.

The controller explicitly retained the pure comparison of TWO supplied JSON
inputs; it does not authenticate the catalog's origin. Therefore that failing
oracle required a stronger provenance contract than the approved API. It is
recorded here, not presented as a security defect fixed by validation. The author
added the explicit `catalogProvenanceVerified:false` result field and clarified
the caller obligation, without a WeakSet/new authority design. The reviewer test
now preserves the same forged/rehashed input and asserts acceptance together with
all provenance/remote/backup/drift/execution flags false.

Operational use must build the catalog from actual local files and compare in
the same controlled process with source-hash receipts. Importing and rehashing a
third-party manifest does not establish local bytes, a reviewed commit or newline
equivalence from absent bytes. This is a documented limitation, not a cryptographic
attestation. A successful70-row match also cannot establish that future tables,
triggers, constraints or indexes are absent/present or correct; drift is separate.

## Validation and verdict

- Author separately reported42/42 and an earlier41/1 ancestor-junction finding
  corrected before this review. That RED was not independently run by this lane.
- Reviewer run17:11:17:19/1, retained and classified precisely above.
- Fresh combined run17:12:11: **62/62 PASS** (42 author +20 reviewer).
- Reviewer ESLint exit0. Subsequent TypeScript callback annotations address the
  `.mjs` inferred-any boundary only; no test assertion was changed by those types.
- Fresh complete TypeScript `--noEmit` check exit0 after those annotations.
- Controller independently reports62/62 PASS17:13:40 after reading all20 peer
  tests; author also reports62/62 PASS17:13:06. These are separate local reruns,
  not independent remote observations. Peer test SHA256:
  `ed17d4e75e2ea5a8d9c1d1d6cd2e0eb6136b985fa6827002e0457591ed5df875`.
- No additional actionable defect found within the approved local comparison
  scope. The review used the code-review skill's correctness/security checks.

No remote identity, backup, restore rehearsal, populated migration outcome,
schema drift, APK compatibility, provider readiness or deployment authority is
proved. Migration79 and all historical files remain unchanged. No network or DB
was opened, no credential read, no global test/build/native campaign launched.
