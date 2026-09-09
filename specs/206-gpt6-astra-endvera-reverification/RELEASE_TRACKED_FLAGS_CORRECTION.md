# PRR2-007 — Authoritative tracked-source comparison

2026-09-09, local-only correction in `C:\dev\endvera-astra-reverification`. No commit, provider, credential access, migration, lockfile or historical release-proof mutation by this lane.

## Finding and reproduced boundary

Finding source: `evidence/commands/g3-release-binding-correction-review-r3/stdout.txt`, PRR2-007 HIGH, source-only Sol review. `git diff --name-only HEAD` can hide a changed tracked working file under assume-unchanged or skip-worktree. Input-only manifest binding does not cover a non-input file such as `src/app/layout.tsx`.

`g3-release-tracked-flags-before` records 4 failed / 6 passed before the correction, using actual temporary Git repositories only. Both flagged mutations of a non-input layout passed the old gate while Git diff was empty. A staged index blob differing from the source while working bytes were restored to source also passed; CRCRLF hidden under assume-unchanged passed. Unchanged flagged files and ordinary tracked changes supplied controls.

## Narrow correction

Only product file changed by this lane: `scripts/endvera-release-source-binding.mjs`, whole-tracked portion of assertReleaseSourceBinding. Existing regular-file/mode guards, input-only binding and exact CRLF equivalence are unchanged.

1. Enumerate source commit tree and index separately using NUL-delimited ls-tree and ls-files --stage.
2. Exclude exactly `release/endvera-construction-v1/release-manifest-v3.json` from each view. Its absence from source and presence in the final projection index is allowed. Similar prefixes/suffixes remain checked.
3. Require identical tracked path sets, regular Git blob modes and object IDs. Unmerged entries and stage/mode/content drift fail closed. Index suppression flags are neither trusted nor changed.
4. Read each remaining working file directly using the existing regular-file guard, and compare raw bytes with Git blobs returned by bounded cat-file batches (128 objects). For whole-tracked paths only, permit exact all-CRLF checkout when Git classifies the index blob as LF text and no exact `-text` attribute token applies. Classification is read only after index object IDs and modes are proven equal to the source tree. Git's working-file `w/*` classification is ignored for authority. UTF8 roundtrip, no NUL, no committed CR, no mixed/lone/doubled CR and exact normalized equality remain mandatory. The original input-binding extension whitelist is unchanged.
5. On POSIX, compare executable bits with Git mode. On Windows, NTFS executable semantics are not represented by Node POSIX mode bits: the guarantee is regular-file type plus exact source/index Git mode, not native executable permissions.

No claim covers untracked files, node_modules, Git object-store integrity, filesystem races/TOCTOU, malicious in-process code, OS isolation or deployed route behavior. Large batch output fails closed at the fixed buffer bound instead of truncating/reinterpreting it.

## Verification

All tests ran with the campaign network guard. Temporary Git repositories were created under the OS temp directory with a unique prefix and removed only after validating their exact cleanup scope. No flags, commits or working files in the real repository were changed by these reproductions.

- `g3-release-tracked-flags-before`: 4 fail / 6 pass, reproduced bypasses.
- `g3-release-tracked-flags-after`: 56/56 tests pass across 5 suites. Stderr consists of Git CRLF warnings from an existing working-tree comparison test; not suppressed or presented as empty.
- `g3-release-tracked-flags-final-tests`: 60/60 tests pass across 5 suites, including both exact projection source/index lifecycle cases, missing skipped file and raw binary comparisons across batch boundaries.
- `g3-release-tracked-flags-lint`: exit 0, stdout/stderr empty.
- `g3-release-tracked-flags-typecheck`: global exit 0, stdout/stderr empty.
- Node syntax check and final diff check pass.

## Portability correction found in parent re-read

The first whole-tracked implementation reused the narrower manifest-input text extension whitelist. Parent inspection found actual PowerShell/SQL sources with ordinary CRLF checkouts that this rejected. `g3-release-tracked-text-before` reproduced that regression: 6 failed / 15 passed for ps1, sql, prisma, toml, .gitignore and LICENSE. No historical files were normalized or rewritten to make them pass.

Whole-tracked equivalence now uses the source-bound Git index text classification described in step 4. Manifest input binding still uses its original whitelist, and explicitly binary `-text` paths never receive the added allowance. `g3-release-tracked-text-after` passed 67/67 tests. Final validation added actual committed PowerShell, baseline SQL, Prisma schema and TOML bytes, copied to a temporary Git repository and converted to CRLF only there; none of those programs/migrations was executed. NUL and invalid UTF8 fixtures also remain rejected even when Git `text` is forced.

- `g3-release-tracked-text-final-tests`: 70/70 tests across 5 suites, including all flags, index/source, projection, byte-mode and actual-source portability controls. Existing test Git CRLF warnings remain in raw stderr.
- `g3-release-tracked-text-final-lint`: exit 0, stdout/stderr empty.
- `g3-release-tracked-text-final-typecheck`: global exit 0, stdout/stderr empty.

The product helper was frozen before these final runs; parent re-read found no new blocker within scope. The parent still owns final Sol review and release orchestration.

Parent g0_invariants performed a bounded read-only source review of the final helper and reported no new blocker. The parent owns the requested final Sol review and release/closeout orchestration. No release-generation command was run by this lane against the dirty shared checkout.

Owned new test: `test/unit/release-tracked-flags.test.ts`. Native launch descriptors and immutable recorder outputs use the command IDs above. Parent source changes made before this lane are preserved.
