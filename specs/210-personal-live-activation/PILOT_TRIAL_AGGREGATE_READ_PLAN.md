# Managed trial T old-data baseline — one read-only capture

Controller procedure after native PG17 preservation PASS and peer review. Fresh
metadata must re-confirm projectwithered-mud-08129552, trialbr-holy-brook-ax7k68oh,
ep-crimson-violet-axmmwtjw, parentcheckpointbr-long-waterfall-ax3zhqtl and fixed
0.25CU on the existing Free plan. No pilot/main/A connection or configuration.
Existing dedicated100CAD setup covers this bounded compatibility rehearsal.

Generate the already-reviewed old-data builder against the actual private trial
PG18 catalog captured22:22Z, not a substituted local catalog. Preserve its raw
SHA05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4 and normalized
b1c8f9902f0d30d6f0da0c1534f66e72d839a50c5f20af93fff58c2909fd1966. Validate
183tables/2624columns and all immutable79 migration inputs. Source/query hashes
and the generated transaction statement list must be inspected before execution.

Use managed SQL transaction connector for a single explicit T/neondb transaction.
Translate only the builder's exact BEGIN wrapper into SET TRANSACTION ISOLATION
LEVEL REPEATABLE READ READ ONLY as the first connector statement, retain every
SET LOCAL exactly, and omit only the final COMMIT supplied by the connector.
Do not split arbitrary SQL on semicolons. The complete fixed aggregate SELECT
is one statement. No writes, application delegates, arbitrary filters or remote
stored procedure invocation. Every oldtable included, including old70 history.
Query30s/transaction45s/lock2s/4MBworkmem/max500000rows per table remain intact.
Before the aggregate, read bounded sizing/identity/history metadata only if
needed. Refuse unexpected branch, schema/catalog or oversized resource estimates.

Retain returned table counts/aggregate hashes privately through server-side tool
orchestration; never expose user rows, per-row hashes, text, audio or credentials.
Validate a complete capture against the generated plan; output a content-free
receipt containing source/endpoint/plan/capture hashes, coverage and statuses.
Self-comparing this baseline only proves shape/completeness, not preservation
across migration. A separately observed after79 capture is still required.
No migration/history mutation/reset/resolve is permitted by this procedure.
Suspend only T endpoint after the bounded capture. No automatic retry on unknown
connector outcome; reconcile any error before further execution. Keep A/T and
private baseline retained for the later independently gated rehearsal.
