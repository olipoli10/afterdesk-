# Pilot70 application catalog comparison — read-only preparation

2026-09-10. Continuation of PILOT_BACKEND_APK_UPGRADE_PLAN.md, not new external
authority. Native populated70-to79 rehearsal has passed; remote definitions,
backup/restore and compatible backend remain separate prerequisites.

## Exact next implementation

Create deployment/pilot-schema-drift.mjs and focused tests. Export only a fixed
read-only PostgreSQL catalog query and a pure bounded snapshot comparator. No
database connection, subprocess, credentials, migration, network or deployment
inside this module. The controller will review and run later observations; tests
of supplied JSON never authenticate their origin. Do not modify the frozen
rehearsal/helper/harness, existing migration catalog, applied SQL or shared deps.

Inventory all non-extension-owned application objects in public, not just
personal tables. Fixed SQL returns metadata and server-side hashes of expressions
and function bodies, never application rows, secret values, comments, pg_authid,
foreign-server/user-mapping options or connection strings. Identify extension
membership through pg_depend; retain extension identity/version separately.

Required families: tables/columns with qualified type and nullability/generation;
constraints keyed by qualified table plus name, ordered columns/FK targets and
actions/deferral/validation/enforcement; indexes and validity/readiness/definition;
functions keyed by complete identity signature with language, return type,
volatility/strictness/security-definer/config and body/default-definition hashes;
triggers keyed by table/name with enabled state/function/events/definition hash;
enum values in order; schema/table/column/function/default ACL and RLS/policies.
Inventory unexpected domains/composites/views/sequences/rules/partitions or other
unsupported families as coverage gaps, never silently certify them.

Use qualified identities, not physical OIDs. Normalize NOT NULL structurally by
column across PG17 and18: PG18 adds pg_constraint rows and conenforced/conperiod;
PG17 absent enforcement field must be an explicit version rule, not a default for
malformed input. Preserve stored/virtual generated distinctions. Use non-pretty
pg_get_* output where needed; differing hashes/rendering remain differences, not
automatic whitespace or SQL normalization. Missing/duplicate/truncated/unknown
metadata must refuse. Restrict supported server major versions explicitly.

Do not automatically ignore role ownership, ACL, collation, extension-version or
Windows/Linux differences. Report them separately with full coverage flags false
until explicitly adjudicated. No broad role-name replacement and no user-supplied
allowlist that can manufacture equivalence. Bound object counts, bytes, string
lengths and output. Reject accessors/prototypes/unknown fields before comparing.

Controller arbitration21:51Z: retain mathematical equality separately from
visible guard review. Two identical snapshots with an unenforced/unvalidated
constraint or NOT NULL, invalid/not-ready/nonlive index, or D/R trigger must
surface knownGuardReviewCount and GUARD_REVIEW_REQUIRED, not an unqualified
supplied-match status. This is not complete health certification: RLSfalse and
SECURITY DEFINERtrue are not universally invalid. Check dense-array length bound
before descriptor enumeration so oversized input does not require enumerating
all of its indexed properties first.

## Verification and reporting

Positive modeled snapshots plus independent negative cases for changed columns,
FK action, constraint enforcement/validation, disabled trigger, missing/invalid
index, function/security-definer/config change, ACL/RLS, enum order and unsupported
objects. Author and distinct reviewer own separate tests; main reviews SQL before
any real database use. Existing frozen rehearsal remains untouched in this step.

Any equivalence label refers only to the declared comparison scope. Always retain
executionAuthorized:false, backupVerified:false and snapshotProvenanceVerified:
false for supplied inputs. Count-only fresh remote receipt shows PG18.6,183tables,
676indexes,65application functions and vector0.8.6; it is not definition proof.
No rubric or APK/version/environment/provider change.

## Controller capture continuation — 2026-09-10T22:00Z

After the two distinct reviews and controller's full source read, extend only the
existing private native MigrationRehearsal branch and staging helper. Stage the
fixed catalog query as exact bytes and include its SHA256 in inputs.json; verify
those bytes before each capture. Capture schema70 before sealing the baseline
and schema79 after migrate deploy, using the existing bounded psql subprocess.
Validate each snapshot through self-comparison, retaining coverage/guard flags,
and save a separate controller receipt without claiming cross-version equality.
No new launcher, unsealing, shared dependencies, applied SQL changes or remote
write. Re-run the native synthetic rehearsal to establish real PG17 parsing.
Only then may the controller perform a separately reviewed metadata-only PG18
capture through the already authorized read-only connection.

Primary documentation checked by controller2026-09-10:
- https://www.postgresql.org/docs/17/catalog-pg-constraint.html
- https://www.postgresql.org/docs/18/catalog-pg-constraint.html
- https://www.postgresql.org/docs/18/catalog-pg-attribute.html
- https://www.postgresql.org/docs/18/functions-info.html
