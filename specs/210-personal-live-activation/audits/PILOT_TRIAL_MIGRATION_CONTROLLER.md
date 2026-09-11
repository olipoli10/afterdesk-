# Single trial migration — controller preparation and retained evidence

2026-09-10 local /2026-09-11 UTC. Existing100CAD personal setup mandate;
only retained trial T may be migrated by this procedure. No original main,
pilot, checkpoint A, deployment, APK or provider action is implied.

## Real departure state, before any migration

Corrected private PREFLIGHT70 at1981817c passed25508ms. Its receipt and the
original refused result remain separate. Prisma client strict-TLS policy is
source-bound; observed backend SSLfalse is retained, not certificate proof.

Fresh metadata before read-only recapture: T parentA, both forkLSN0/293B828,
parent timestamp2026-09-10T22:16:47Z, fixed endpoint0.25CU. A has no compute.
Project remainsFree_v3; reported compute1755seconds/transfer5896659bytes and
logical45162496bytes are lag-prone counters, not an invoice or zero-cost proof.

Actual prewrite aggregate query used the original15-statement transaction,
query/plan/catalog pins unchanged. Private capture
`.scratch/pilot-trial-data-prewrite70-20260911T0003Z.json`, SHA
82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac.
Strict supplied comparison against retained3137a7b4 baseline:
SUPPLIED_OLD_COLUMN_AGGREGATES_MATCH,183tables/2624columns, zero changed tables,
counts or digests. Original baseline was not replaced. No application rows or
per-row digests were returned.

First prewrite catalog wrapper incorrectly changed search_path to pg_catalog;
its receipt correctly reported513 differences (512 definitions and1environment)
because PostgreSQL deparsers qualify visible names differently. Capture retained:
`.scratch/pilot-trial-schema-prewrite70-20260911T0003Z.json`, SHA
0a3dd0eedc4166f6218d71cb133775c138e072edd7bc957ef450f3eefe93ebc8.
No comparator or capture was patched to hide the differences. Re-executing the
same fixed SELECT with the original default search_path, READ ONLY transaction
and bounded timeouts returned the exact original bytes:7474objects,
SHA05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4,
normalizedb1c8f9902f0d30d6f0da0c1534f66e72d839a50c5f20af93fff58c2909fd1966.
New file `.scratch/pilot-trial-schema-prewrite70-default-20260911T0006Z.json`;
zero definition/environment/guard/unsupported differences. Its filename is a
controller label, not authoritative query time. Provider suspension timestamp
2026-09-11T00:05:30Z and fresh endpointidle confirmed. Preserve the original
catalog query context for after79 rather than reuse aggregate-only settings.

## Narrow implementation review

Main read full runner, migration diff, bridge diff and peer tests/audit.
Author30+bridge40+peer5 initially passed75. Peer retained3PASS/2RED proving
late receipt-write deadline and PGpatch-version mismatch; both fixed. A history
receipt already persisted before late failure remains immutable, with terminal
failure-outcome.json separately recorded and no success stdout. Marker is fixed
wx in the controlled checkout; no retry, reset, fresh-root bypass or claim of a
distributed lock. Existing preflight remains compatible.

Nested-property ordering exploration40PASS/3FAIL was outside the agreed root
canonical/closed-values contract. Main rejected expanding that contract; only
those three exploratory expectations were removed. No field, value, identity or
authority guard was weakened. Producer-to-bridge parity remains tested.

Controller authorized source-only opening of exact migration CLI after peer
review and real prewrite matches. Final runner4f1513de and bridge49b79df3,
97 targeted tests PASS, main TypeScript52211 exit0. First full root
root-1789085341411 retained6949PASS/1timeout in the existing R37M public-source
graph test with concurrent checks. Unchanged rerun root-1789085511165 ran alone:
6950PASS/3historicalskips,454passedfiles,113.32s, exit0 at00:13:45.130Z.
No timeout or oracle was relaxed. This is not an actual migration result;
committed clean execution pins follow before invocation. No source flag or
supplied evidence authorizes itself.

## Prepared postconditions

Native70/79 retained catalogs give583 changed-or-added objects, zero removals:
189ACL,151columns,97constraints,48functions,53indexes,7tables,38triggers.
Of these,22 modify existing objects:16 timestamp defaults, one nullable clientId,
five check definitions. Other timestamp-default checks include new columns.
The complete four-capture local analysis script is retained privately with
SHA df6f26e4beceb5f01b289ff4e9964ad389bdef8d02f24f8a225036033657f1a5.
Self-pair smoke reports zero discrepancy; this is not remote preservation proof.
After79 requires original old-column aggregates, added-state query and complete
catalog delta reconciliation, including environment-specific ACLs and function
hashes. Never infer these from Prisma exit0/history79 alone.

Project remainsIN_PROGRESS; heartbeatACTIVE. Dashboard22%roadmap/46.75%localbuild/
C2 preparation18of18/real-testNO-GO/Verified-E2E0% unchanged.
