# Full function-definition reconciliation — native local capture

Date: 2026-09-10. Scope: the retained owned synthetic PostgreSQL17.11 cluster and supplied PG18 snapshot, not a remote connection or a schema-wide equivalence decision.

## Verdict

**64/64 common application functions reconcile at the full `pg_get_functiondef` SHA-256 boundary:38 exact raw,26 historical-checksum-corroborated CRLF-to-LF. Zero unexplained common function-definition hashes.** Every fresh native raw hash first matches the retained catalog70 hash:64/64.

This extends `PILOT_FUNCTION_HASH_RECONCILIATION.md` beyond its body-only result. The comparator and both original snapshots remain untouched. No trim, generic whitespace removal, SQL formatter, identifier rewriting or Unicode normalization was applied. `fullSchemaEquivalent:false`, `remoteProvenanceVerified:false`, `backupVerified:false`, `executionAuthorized:false`.

The exact-input native run exited1 because its first oracle incorrectly demanded64 global LF matches. That failed receipt is preserved. The native capture itself completed and the server stopped; only the subsequent pure qualification was corrected. There was **no second database run**.

## Exact ownership and local mutation

Controller explicitly authorized one additional local inspection database, after inspection showed baseline70 was sealed with `ALLOW_CONNECTIONS false`. The baseline was not reopened. No existing database was reset, migrated or dropped.

- Cluster: `C:/dev/endvera-astra-r03/.scratch/personal-pg-native-15b8389313f549c8b912fde2f657acb9`.
- Runtime: `C:/dev/endvera-astra-r03/.scratch/postgres-native-17.11-3/runtime/pgsql`.
- Original startup parameters read from `data/postmaster.opts`: loopback127.0.0.1,port54754,SSLoff, statement/connection/disconnection logging disabled. Those same settings were used.
- Sealed baseline: `endvera_personal_210_3bc830c1027d44aba7320251b97c2104`.
- Existing upgraded database, not targeted: `endvera_personal_210_95f266aa635145b8a908fee97bec609a`.
- Sole SQL write: `CREATE DATABASE endvera_function_definition_review_20260910 TEMPLATE endvera_personal_210_3bc830c1027d44aba7320251b97c2104;`.
- The inspection clone remains retained. No cleanup/deletion was performed. Startup/shutdown produced normal owned PostgreSQL files and a separate run log/receipt.

Before startup: inspected the original successful rehearsal receipt, database manifest, port/startup options and clean shutdown log; current ACL showed protected inheritance and only the local owner FullControl. The runner rejected existing PID/receipt, checked regular ancestors and pinned runtime executables, snapshot files and database manifest. It required `pg_ctl status=3`. An exact-port listener inventory returned no listener before execution.

After startup, the read-only identity query required exact `data_directory`, port54754, version170011, `baselineSealed:true`, and `cloneExists:false`. The explicitly allowed synthetic password file was consumed only inside the runner for the private psql child environment. Its value was never printed, sent to the model, placed in arguments, copied to this audit or fetched remotely. Environment inheritance was limited to ordinary OS fields. No provider/remote credential was read.

## Native evidence and failed oracle

Receipt: `.scratch/personal-pg-native-15b8389313f549c8b912fde2f657acb9/function-definition-reconciliation.json`.

SHA-256: `284e822d3a6c500754f3fba254d1130be26d543a60e73a2bee9e706fab5322fb`.

- Started:2026-09-10T22:28:52.647Z.
- Finished:2026-09-10T22:28:56.529Z.
- Query SHA-256: `37358364fb167ea5d7f79d3adb5f9204d7f5ebce2a31384f6d45ee0705a0c16a`.
- Capture identity: inspection database exact, version170011, transaction read-only `on`,70 actual migration records.
- Native raw→catalog70:64/64.
- Native raw→supplied PG18:38/64.
- Native full-definition LF→supplied PG18:28/64.
- Of the26 raw mismatches:26/26 full-definition LF matches.
- `pg_ctl stop` exit0; subsequent exact-data status3; PID file absent. Separate server log reports shutdown complete at2026-09-10 18:28:56.434 EDT.

**Why exit1:**36 functions already matched raw but would cease matching if LF were applied indiscriminately; two match both representations;26 require the corroborated LF representation. The first runner required `lfRemoteMatches===64`, an overly strong reviewer oracle. Its `unmatched` array therefore retains those36 counterexamples. Do not reinterpret that original array or overwrite the receipt as a native PASS.

The corrected pure qualification preserves raw equality first. Only a differing function may use LF, and only after its exact final source is corroborated by whole-migration history and both captured body hashes. Corrected result: `selectedRepresentationMatches:64`, `explainedDeltas:26`, `unmatched:[]`.

## Historical corroboration, not opportunistic normalization

`corroborateHistoricalLf` rebuilds the exact regular-file migration catalog and verifies the supplied70 migration rows with the existing strict comparison helper. It pins the historical metadata receipt, then for each migration checks that the entire raw text or solely CRLF-to-LF text equals its recorded historical checksum. No transformation is selected from the desired full-definition hash.

The narrow concrete SQL extractor tracks final direct CREATE/CREATE OR REPLACE function bodies across the first70 files. All64 final bodies must match native catalog70; the history-selected bodies must also match all64 supplied remote body hashes. Names must be unambiguous and approved LF identities use the complete snapshot tuple including input-type signature. This is not a general SQL parser. The native/body hashes check its selection against these actual inputs.

Only after those checks does the full-definition qualifier accept38 raw hashes and26 selected LF hashes. Missing/duplicate signatures, wrong database/version/history/read-only mode, unknown raw mutations and uncorroborated LF deltas refuse or remain explicitly unmatched.

## Pinned files

| Input | SHA-256 |
|---|---|
| Retained local `migration-rehearsal/catalog-70.json` | `c65354c20ba3a8b0e32f3887c835fa7e8b2219b79c871da9ac95b87487de01a3` |
| `.scratch/pilot-schema-remote-20260910T2204Z.json` | `05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4` |
| `rehearsal-databases.json` | `4c7d8260e7745381d6eb8e5ab31619eb88a64c457835c97aff30e2d2d937c05f` |
| Historical migration metadata receipt | `010bf6c0eb2fc3e7d558764c54d7005a0d39de899918cf10d08c09aa40827d09` |
| Previous body-only audit | `799306e746bd38291ff944ba1bf097d9f61ec78f08d91d15500d6ea66add3b6c` |
| Final corrected helper `deployment/pilot-function-definition-reconciliation.mjs` | `887e02f7e956a4eff5fd2ebaa28e8a02242ef15a8bf805f93dea87db7d80e35f` |
| Final tests `test/personal-pilot-function-definition-reconciliation.test.mjs` | `703d2c2abae39af05c17efc060a2db339d76ddc501971bb811436ee3857c546f` |

The final corrected helper hash describes the post-native pure qualification revision, not a claim that the revised runner was executed a second time. The SQL query hash is unchanged.

The controller-requested catalog path under `evidence/postgres-native-1789077747031/migration-rehearsal/` does not exist; the first local read produced ENOENT. The retained original catalog under the exact cluster above was used instead, after its hash matched the body audit. No substitute capture was manufactured.

## Verification and remaining boundaries

- Initial pure suite6/6 before native execution.
- Corrected pure suite7/7:36 raw-only,2 raw-and-LF,26 historically selectedLF; absent corroboration refuses26; unknown raw/remote hashes remain unmatched; duplicate/missing identities and wrong native context refuse; SQL asserts whole deparser and only CRLF replacement.
- Fresh pure qualification of the unchanged actual native receipt returned64/64 selected matches and no unexplained entries. No database startup for that step.
- Scoped ESLint helper/tests exit0. No full-root, build, migration generation or remote call.
- No conclusion about the remote extra `show_db_tree`, its ACL, `cloud_admin` default ACLs, other catalog differences, owner/extension/collation behavior, customer records, provider execution or backup restoration.
- This proves equality of the complete reported function-definition hashes under the exact independently corroborated historical representation. It does not authenticate the remote snapshot transport or establish equivalent runtime behavior across PostgreSQL17 and18.

Only the new helper, tests and this audit are authored here. Existing comparator, supplied snapshots, applied migrations and historical failure receipts are unchanged. The one additional synthetic inspection clone is retained and the exact owned server is stopped.
