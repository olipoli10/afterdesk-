# Pilot migration catalog — local preparation

Date: 2026-09-10. Scope: the approved `PILOT_BACKEND_APK_UPGRADE_PLAN.md` local inventory tranche only.

## Contract and limits

New `deployment/pilot-migration-catalog.mjs` inventories exactly 79 ordered migration names, with the first 70 designated as the historical baseline and nine as pending relative to that baseline. It hashes actual SQL bytes and independently records only the exact LF and CRLF representations. It does not normalize SQL, whitespace, comments, Unicode or statement order. Mixed endings, bare CR, BOM, invalid UTF-8 and NUL refuse.

`buildPilotMigrationCatalog(root?)` reads local files only. It reuses `assertReleaseRegularFile` unchanged, rejects linked ancestors as well as linked roots/descendants, and rejects extra directory contents, nonregular files, traversal, unexpected names/order/count and files over 262144 bytes. The source-binding module's transitive imports include child-process utilities, but the catalog invokes no Git or subprocess helper. The CLI prints one JSON catalog to stdout; unknown arguments fail with a constant error and no raw filesystem data. No remote CLI is implemented.

`compareSuppliedPilotMigrationRows(catalog, rows)` compares exactly 70 supplied rows containing only `migration_name`, `checksum`, `finished_at`, `rolled_back_at` and `applied_steps_count`. It rejects unknown/pending names, duplicates, missing/extra rows, unfinished or rolled-back state, invalid step counts and unmatched checksums. A completion value must be a finite plain Date or canonical UTC-millisecond-Z string. A match is explicitly labeled `SUPPLIED_ROWS_MATCH_HISTORICAL_70_ONLY`.

Both outputs retain `remoteObserved:false`, `executionAuthorized:false`, `backupVerified:false` and `driftVerified:false`. Supplying real metadata later does not make this pure comparator a remote identity, backup or schema-drift verifier. The catalog hash binds observed file bytes, not a Git commit. Caller-supplied internally consistent catalog metadata is not authenticated against a checkout. Filesystem checks are read-only observations, not an atomic hostile-filesystem snapshot; execution/deployment must bind its own frozen source separately.

## Observed local inventory

- Ordered-name SHA256: `84ebabbc759dd8aeca8ebaae742dbddf1228629b4f5c81d1b62aba6066ba4f79`.
- Local catalog SHA256: `a9ebecf12c010c42090b01c64c5683e275fcf779c432467a56eb06ad5e2a1f93`.
- First: `20260730000000_baseline`.
- Historical position 70: `20260910002000_personal_outbound_budget`.
- Last: `20260910180000_sms_correlated_calendar_approval`.
- Count: 79 total / 70 historical baseline / 9 pending. Largest observed SQL: 41920 bytes.

Pending names in order: `20260910030000_personal_gateway_subject`, `20260910040000_personal_model_gateway_admission`, `20260910050000_calendar_sms_confirmation_store_off`, `20260910100000_personal_utc_naive_datetime_fix`, `20260910120000_project_brain_voice_sessions_off`, `20260910130000_sms_temporal_clarification_registry`, `20260910140000_sms_temporal_trigger_record_dispatch`, `20260910160000_sms_correlated_calendar_review`, `20260910180000_sms_correlated_calendar_approval`.

## Evidence, preserving the initial failure

- Author suite: 41/41 PASS at 17:07:39 local, including actual local inventory and child-process CLI stdout/refusal smoke.
- Controller identified the linked-ancestor gap in the shared regular-file helper's scope. New author regression at 17:08:04: **41 PASS / 1 FAIL**, proving a regular repository root beneath a junction was accepted.
- Minimal new-module-only ancestor walk fix; unchanged shared helper. The exact regression and author suite passed **42/42 at 17:08:19**.
- Scoped ESLint exit 0. TypeScript check was still running at this initial audit entry; no full-root suite was launched.
- Frozen source SHA256: `4d60155a1bb0d56702189a9d30f5444027bd725db18319a88a721dec73ded665`.

Tests use synthetic successful rows and bounded temporary filesystem fixtures. Only those owned temporary fixtures are removed by test cleanup. No existing migration, application data, release metadata, provisioning script or credential file was modified or deleted. No DB, network, deployment, APK build or provider action occurred in this author tranche. Independent review is pending at this entry; controller owns any real-metadata evidence and global checks.

## Supplied-manifest clarification and final source

The reviewer highlighted that an imported JSON catalog can be recomputed with invented alternate newline hashes and a correspondingly recomputed catalog hash. This is a real limitation of two supplied inputs, not evidence of local byte observation. Controller explicitly retained the pure JSON comparison contract instead of introducing identity/capability branding. The comparator now also emits `catalogProvenanceVerified:false`; its comment requires rebuilding the local catalog before operational use. A comparison result alone must never be used to attest deployment source bytes. The controller's intended operation builds and compares in the same local process and records source hashes separately.

After this clarification: author **42/42 PASS at 17:11:21**, scoped ESLint exit 0. Final source SHA256: `1db0dc462e69b2cfd067a608b6c3e53c8901920217ecaa719460b4a82786ec4b`. TypeScript initially reported five implicit-any callbacks in the new test file because the imported MJS helper returns broad types; annotations were added (first rerun retained one of those diagnostics, then that final callback was annotated). No production behavior was changed by the test annotations; final type check is pending at this append.

Independent reviewer added 20 cases in its own file. Author read that complete file and reran both suites: **62/62 PASS at 17:13:06**. The reviewer's initial 19 PASS / 1 FAIL on the stronger supplied-manifest-provenance expectation is preserved as a contract clarification, not falsely reported as a fixed security vulnerability. Root/descendant links, strict rows, unsafe object shapes, exact Unicode/SQL bytes, bounded inputs and the explicit unverified-provenance result are covered. TypeScript's subsequent four diagnostics were confined to the reviewer's new MJS callbacks; reviewer annotated them without production edits.

Final root TypeScript `--noEmit --pretty false` exited 0 after both test files' annotations. Scoped lint exited 0. Author tranche is frozen and locally GREEN; this verdict does not authorize applying migrations or producing/releasing an APK. Controller's live metadata comparison is a separate receipt and was not executed or certified by this author.
