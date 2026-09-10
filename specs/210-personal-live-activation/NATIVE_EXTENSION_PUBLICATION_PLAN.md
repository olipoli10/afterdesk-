# Native pgvector publication — observed; native validation incomplete

State: `PUBLISHED_43_FILES / ALL_NATIVE_MIGRATIONS_APPLIED / GOOGLE_7_OF_11_PASS`. Controller reviewed and ran validation then publication. Receipt `.scratch/personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3/runtime-publication-f31c260de5cd4ce6a8f94e23ef8c6f2a.json` records43/43 published, no overwrite, no auto-retry or deletion. The later native Google run `evidence/postgres-native-1789024560494/output.txt` applied every migration, verified17.11 and distinct simultaneous backend PIDs, then reported7PASS4FAIL and stopped its owned server. Full validation is incomplete; next diagnostic concerns timezone-sensitive lease predicates, not a missing vector library. No live provider test is implied.

## Evidence and exact scope

- First build `personal-pgvector-build-f6faa4a8282842bb8e77ebfc6801c3fb`: failed at `LNK1104 OLDNAMES.lib`; original logs retained, owned Job stopped. It remains a failure.
- Second build `personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3`: exit 0, 5733 ms, no timeout, owned Job stopped. Static AMD64 inspection found `postgres.exe` and `KERNEL32.dll` eager imports, no delayed imports, and `Pg_magic_func`. This does not establish loader or SQL compatibility.
- DLL SHA256: `1d54ce81495fc481da3d261edf4f797c837340a51648d3456afa3d72e4431cef`.
- Versioned SQL SHA256: `7fb5bb279ef83bf9204bfac7405bb5c9a05e49f5ac7d64d1eb4464d103b80f32`.
- Control SHA256: `f1e1717c0c1da9c200ff3a53acf1d14eba5e3f70da928a723b247b0b1059417d`.
- All 40 upgrade scripts come directly from the fully pinned official source archive, not an unrestricted filesystem glob. Each derived byte array gets its own SHA256 in the publication receipt. The generated base SQL, control and DLL use the reviewed fixed hashes above.
- Source commit remains `8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c`; no Makefile, compiler flags or migrations changed for this dependency.
- Preserve provenance limits in `OLDNAMES_PUBLISHER_PACKAGE_CANDIDATE.md`: full catalog digest mismatch unresolved; CRT certificate currently expired; individual archive pins and signed-manifest verification are separate evidence. No user license click or network sandbox is claimed.

The only target is `C:\dev\endvera-astra-r03\.scratch\postgres-native-17.11-3\runtime\pgsql`:

1. `lib\vector.dll`.
2. `share\extension\vector--0.8.6.sql` plus 40 original upgrade SQL files.
3. `share\extension\vector.control`, published last.

No SDK headers, binaries in `bin`, or PostgreSQL installation elsewhere are modified. Existing original packages and notices remain intact.

## Publication contract

Default invocation validates every source pin, exact destination, no-reparse ancestry, absence of all 43 target names and unchanged four PostgreSQL core hashes. It writes nothing. `-Publish` is the separate explicitly reviewed mutation step.

All content is prevalidated before staging. Every temporary output is `CreateNew` in its destination directory; bytes are flushed and rehashed. Same-directory `File.Move(..., false)` makes each final name visible without overwriting any existing target. Control is last. Atomicity is **per file only**, never a transaction spanning 43 files. No PostgreSQL process should be running from this disposable runtime during publication; controller coordinates the runtime slot.

A fresh exclusive receipt under the exact second build root records stage, all staging paths and names already published, even on an ordinary exception. No automatic deletion, replacement, resume or retry occurs. A crash or interrupted receipt remains an uncertainty to inspect before any later run. Partial files remain recoverable; request a separately reviewed cleanup or choose another disposable runtime, never force replacement. Merely copying files does not load an extension.

## Native validation order after reviewed publication

Controller alone runs the existing `check-local.mjs postgres-native` harness with the exact approved PowerShell/runtime paths. Do not start overlapping PG runs.

1. Run `google.postgres.test.ts` first. Harness must report native PostgreSQL 17.11, distinct simultaneous backend PIDs, and apply **all current migrations unchanged** to a fresh isolated database. Failure at any migration stops this run; do not skip the vector migration or substitute a DB baseline. Fresh native evidence must distinguish actual PostgreSQL from historical PGlite results.
2. The Google suite must preserve real contention assertions: two simultaneous owner approvals produce exactly one winner and one fake insert; deadline refusal causes no HTTP attempt; recovery or revocation wins against a late fake response. An increase in timeouts, weakened assertion or automatic replay is not a fix.
3. Run `outbox.postgres.test.ts` separately against another fresh isolated DB. Verify same-operation/advisory contention, exact source/approval identity, stale grant refusal and retained uncertain holds, with fake transports only.
4. Run the full current native suite only once current migration/schema/fixtures are coherent. Include model subject/accounting/consent, inbound/outbound recovery, calendar read, confirmation/maintenance/worker tests. Do not label filtered runs a full suite; capture manifest, native backend and test counts.
5. Each run must prove exact owned-server shutdown through the existing harness. Retain redacted logs and disposable data on failure. No provider, OAuth, billing, real SMS, phone call or production data is authorized by these tests.

Success criterion: all migrations succeed with the extension actually available, all selected tests pass under native multibackend PostgreSQL, and owned server cleanup succeeds. Extension smoke proof and full application tests are distinct; neither means the product is live or independently validates model quality.
