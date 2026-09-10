# Controller schema comparison and real capture — 2026-09-10

## Implemented and reviewed

Fixed single catalog SELECT plus strict supplied-snapshot comparator; qualified
identities, server-side hashes, complete family counts, bounded inputs/outputs,
explicit PG17/18 rules and conservative coverage/guard review. Author and two
separately owned peer suites are not different-model validation. Main read the
complete module, both reviews, helper/harness and capture review. No applied SQL
or shared dependencies changed.

Peer REDs retained: orphan ACLs, length check after descriptor enumeration,
identical disabled guards, whole-response128KiB overflow, extension membership,
missing empty-family manifest and unsupported extension-child/NOTNULL variants.
Final pure cohort before capture:117PASS. Main capture/rehearsal cohort214PASS;
later peer adds14capture and3SQL-cast checks. TypeScript, scoped lint and PS parser
PASS. Earlier local auth no-store correction18c514c8 is included in regressions.

## Actual PostgreSQL capture, not just supplied fixtures

First native run `evidence/postgres-native-1789077665225/result.json` failed at
REHEARSAL_CATALOG_70,22:01:23.653Z. PostgreSQL17.11 rejected unknown||internalchar.
Three explicit ::text casts for label generation fix that ambiguity, with new
regression oracles; no weakened assertion or SQL migration rewrite. Retained
cluster636219b60a524cabb9b167988bba5039 was gracefully stopped.

Rerun `evidence/postgres-native-1789077747031/result.json` PASS22:02:56.562Z:
actual70 migrations,14 seeded legacy rows, catalog70 capture, sealed baseline,
clone,79 actual migrations, catalog79 capture and preservation verification.
Seven proof tables remain empty. Cluster15b8389313f549c8b912fde2f657acb9 stopped;
both absence of postmaster.pid and shutdown output checked. It remains private
and retained. Captures are metadata only; the older row-preservation oracle
contains synthetic fixtures only, never remote customer records.

- Catalog70:7470objects,183tables,2624columns,676indexes,64functions;
  file SHA c65354c20ba3a8b0e32f3887c835fa7e8b2219b79c871da9ac95b87487de01a3.
- Catalog79:8031objects,190tables,2758columns,729indexes,112functions;
  file SHA 2b16a0287ab05397949268f8c1d569ae9938c48b67cb1f1438c24d52bfb20c34.
- Both shape-valid, zero declared unsupported objects or known guard reviews.
  This is not full database equivalence, external restore or phone E2E.
- Query SHA4a22d4adf2d74a48a4bc6d4d42bce6558ac2cef2f59ca44b9c64c7e6cd6be338.

## Actual managed pilot read and unresolved differences

The same fixed query then ran via the authenticated managed Neon connector,
explicit projectwithered-mud-08129552/branchbr-nameless-moon-ax8nmuwj/neondb,
within the capture window recorded in pilot-schema-capture-20260910T2205Z.json.
No connection string, raw body/configuration or application row was requested.
PG18.6 output7474objects was complete, retained privately and validated locally.
Raw metadata SHA05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4.

Comparison remains DIFFERENT:30definition-object and2961environment-object
differences, not an inflated MATCH. Full result detail is deliberately bounded;
the controller inspected all validated entries separately for diagnostic grouping.
26 common functions differ only bodyHash/definitionHash; one extra show_db_tree
function plus its ACL and two cloud_admin default ACL records are also present.
Other observed deltas are ownership and server environment; explicit17/18
nullability/enforcement normalization remains in the declared comparator only.

Separate source reconciliation proves64/64 shared function bodies match their
last canonical migration definition and the historical whole-file checksum's
selected line endings:47exactfiles/23LFfiles. All26 differing body hashes are
accounted for exactly. See PILOT_FUNCTION_HASH_RECONCILIATION.md for each hash.
Full deparsed definition hashes and extra objects are not silently cleared.

## Regression record and continuation

Full root run1789077914664 retained6423PASS/1FAIL/3historicalskips: a preexisting
public-source-graph guard exceeded5000ms. Unchanged full rerun1789078051933 passes
6424tests/438files plus3historicalskips at22:09:10.651Z; no timeout/assertion edited.
Local webpack build1789078193220 separately PASS22:13:45.684Z, including the
auth no-store fix. This is compilation/prerender proof, not a published backend.

Prepare bounded pilot checkpoint/reconstruction with current quota checks,
then reviewed migration/compatible backend and coherent APK. Current EAS is
still code4; no new build submitted. Parent pilot70 and original main68 untouched.
No external WRITE, provider call, new purchase, credential display or deployment
in this tranche. Dashboard unchanged22%/46.75%/C2 preparation18of18/real-test
NO-GO/Verified-E2E0%. Global service remains IN_PROGRESS; ACTIVE3min heartbeat
unchanged. Future child backup is same-provider recovery, not disaster recovery.
