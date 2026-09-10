# Pilot schema drift SQL: independent review

Date:2026-09-10. Status: GREEN for the reviewed fixed-query source contract and
pure targeted tests only. No native parser/runtime or remote-observation claim.

## Mandate

Read `PILOT_SCHEMA_DRIFT_PLAN.md` in full. This lane reviews only fixed SQL17/18
projection, object coverage, extension membership, enum ordering, enforcement,
read-only behavior and absence of raw sensitive definitions. The other peer owns
supplied-snapshot shape/provenance/comparison review. Reviewer writes only this
audit and optionally `test/personal-pilot-schema-drift-sql-review.test.ts`.
No DB/MCP/credentials/provider access or rehearsal/harness/migration edits.

## Primary-source checks used for review

PostgreSQL17 records relational nullability in pg_attribute; PostgreSQL18 adds
NOT NULL entries and enforcement/period information in pg_constraint. Constraint
names alone are not unique. Both version projections must preserve the enforced
and validated semantics, keyed by qualified table/name or normalized column.
[PG17 constraint catalog](https://www.postgresql.org/docs/17/catalog-pg-constraint.html),
[PG18 constraint catalog](https://www.postgresql.org/docs/18/catalog-pg-constraint.html).

Extension membership must match classid/object/subobject and dependency type e;
type x is an automatic extension dependency, not membership and not a reason to
hide an application object.
[pg_depend](https://www.postgresql.org/docs/18/catalog-pg-depend.html).

Automatic relation composite types and array types should not be mistaken for
independent unsupported objects; actual standalone composites/domains/ranges
must not disappear from coverage. Enum order is enumsortorder, not label sorting
or OIDs. Generated stored/virtual columns remain distinct.
[pg_type](https://www.postgresql.org/docs/18/catalog-pg-type.html),
[pg_enum](https://www.postgresql.org/docs/18/catalog-pg-enum.html),
[pg_attribute](https://www.postgresql.org/docs/18/catalog-pg-attribute.html).

pg_get_* values are reconstructed definitions, not original migration text.
Definition mismatch is not automatically equivalent across server versions;
do not collapse spaces, literals or SQL syntax to force equality.
[System information functions](https://www.postgresql.org/docs/18/functions-info.html).

## Pre-freeze questions communicated to the author

- Function proconfig can contain sensitive custom GUC values. Return keys and
  a server-side configuration hash, not arbitrary raw setting values. Function
  bodies/defaults and expression literals must also be hashed inside PostgreSQL.
- Extension exclusion must be real pg_depend membership, not naming heuristics.
- PG18 NOT NULL enforcement/validation cannot be silently coalesced true when
  data is absent; PG17's absent field must be an explicit version rule.
- Required empty families must be emitted explicitly and remain distinguishable
  from missing/truncated metadata. Unknown unsupported objects must be counted
  and block any full-scope equivalence label.

The preparation below preceded source publication. No existing native rehearsal
or root result is rerun or represented as this proof.

## Planned independent SQL-shape oracles

These checks will inspect the actual exported fixed queries, not execute SQL or
claim PostgreSQL parser/runtime proof. Positive query-version controls accompany
negative assertions so a missing export or entirely empty query cannot pass.

1. Version17 never references physical PG18-only fields; version18 preserves
   enforced/period and normalized per-column NOT NULL validation. Unsupported
   versions refuse instead of selecting a nearest version.
2. Extension membership binds the catalog class and whole object with dependency
   type `e`; ordinary extension-dependent (`x`) application objects stay in scope.
3. Ordered enum labels and ordered FK column identities are retained. Object
   identities are qualified names/signatures, not server-local object OIDs.
4. Defaults, expressions, function definitions/configuration and trigger/policy
   predicates are hashed before JSON output; no raw function body/config values,
   comments, application rows or secret-bearing catalog options are projected.
5. Every required family is emitted, including an explicit empty array, and
   unsupported objects remain a positive coverage gap. Automatic enum arrays and
   table row types must not spuriously create a gap; genuine standalone types do.
6. Index validity/readiness, trigger enablement, ACL and RLS flags survive the
   projection. An aggregate must not reach unsupported `pg_get_functiondef` usage;
   a non-supported routine category must remain visibly unassessed.
7. Fixed query text is read-only and catalog-only, with no supplied identifiers,
   user-defined routine execution, connection, process or network capability.

## First complete source review and retained counter-tests

Read the complete initial module and author test file. On2026-09-10 at17:51:22
America/Toronto, the new independent SQL-shape suite ran **17 PASS / 2 FAIL**.
At17:53:26, two additional SQL-shape oracles yielded **17 PASS / 4 FAIL**.
Scoped reviewer ESLint then exited0. These are fixed-query-text contract tests;
they do not execute PostgreSQL or demonstrate an exploit/catalog corruption.

Four exact points were sent to the author before any reviewer source edit:

1. The output lacked a closed per-family count manifest. Total objectCount cannot
   distinguish an omitted family projection from a genuinely empty family.
2. Extension membership included classid/objid/deptype=e but did not explicitly
   pin whole-object objsubid=0 and refclassid=pg_extension. This is a precise
   query contract strengthening, not a claim that ordinary PostgreSQL allows
   arbitrary contradictory membership rows.
3. PG18 NOT NULL rows are excluded from generic constraint projection, while the
   column projection preserved only count/enforced/validated. Their connoinherit
   distinction could disappear. A visible unsupported gap is sufficient; no
   broad normalization of non-inheritable/inherited variants is requested.
4. A public non-extension index on an extension-owned table remains in app_rel
   as relkind=i, but its parent table is absent: the supported index branch and
   unsupported relation branch both omit it. Nonmember triggers/constraints/rules
   on excluded parents require analogous review. Report gaps instead of silently
   broadening the extension-membership exclusion to all descendants.

No evidence says the pilot currently contains these unusual objects. The primary
PG18 constraint documentation above supports the retained inheritance distinction.
Author owns all module fixes; the reviewer owns only tests and this audit.

## Final delta review and bounded verdict

All four original SQL-shape oracles are unchanged and now pass. Re-read the exact
author changes: whole-object extension membership; eleven explicit familyCounts
including zeros checked against actual supplied entries; unsupported nonmember
children/indexes of excluded extension parents; complex PG18 NOT NULL gaps for
non-inheritable/nonlocal/inherited/deferrable/deferred/period variants. These gaps
conservatively withhold coverage, without asserting who created the objects.

Fresh safeEnvironment execution at **17:55:21 America/Toronto**:

- Independent SQL-shape reviewer: **21/21 PASS**.
- Author supplied-snapshot suite: **42/42 PASS**.
- Independent comparator/provenance reviewer: **41/41 PASS**.
- Combined: **104/104 PASS**, three files, no database access.
- Scoped reviewer ESLint exited0. No full-root/build/generation/native run here.

Reviewed module SHA256:
`db9e0781825e7924bf712fe0f00d260cea13ffad68dc71a12f4e8e26caf7e290`.
Reviewer test SHA256:
`af3cfb8d7a50e91c89d23f1732253f4b34325908b49222e1e6aace22da2a17e0`.

No concrete blocking source finding remains in this declared projection. The
query uses catalog metadata and server-side SHA256, not raw source/configuration,
application records, comments or credential catalog options. It preserves enum
and FK ordering, qualified identities, enforcement/index/trigger state, ownership,
ACL/RLS, versions and conservative unsupported gaps. SQL built-ins are qualified;
no migration, DDL/DML, application routine call or process/network capability is
introduced by this module.

The public PostgreSQL17 implementation also confirms that constraint-trigger
rows have a defined pg_get_constraintdef output; their actual trigger semantics
remain separately projected rather than inferred from that abbreviated text.
[PG17 ruleutils implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/ruleutils.c).

Before relying on a capture, the controller still owns real PG17/18 parsing,
permissions, statement/output bounds, fixed-query/source hashes, complete input
collection and observation provenance. Deparser/rendering, role/ACL, locale,
extension and server differences remain differences requiring explicit review.
Two self-consistent supplied snapshots can be fabricated; neither hashes nor
familyCounts attest their origin. This review supplies no backup/restore proof,
remote drift verdict, release authority or provider authorization. Existing
rehearsal/harness, migrations, schema and all product sources remain untouched.

### Final SQL-only addendum

Re-read the subsequent single SQL delta: localeHash now hashes the JSON tuple
`[datlocale,daticurules]` inside PostgreSQL, returning null only when both are null.
Neither ICU setting is projected raw. No other SQL projection changed. No new
blocking finding; the comparator output-cap changes belong to the other peer.
Final module SHA256:
`566843fd685e259b3fe28d4231c9d5a62ce1474de18fd663712fe948556a8368`.
Author-provided fixed-query SHA256:
`42ea51fe77898de0e2697f09d0bcea2b6f633d4f1657d2c1fb032f10d1612a7e`.
This addendum is a source reread, not a new native or remote observation.

### First native parser failure retained

Controller receipt postgres-native-1789077665225 finished22:01:23.653Z with exit1
at REHEARSAL_CATALOG_70; the exact private cluster was stopped and retained.
Reviewer read the receipt, output and catalog-70.log: PostgreSQL17.11 rejected
`'RELKIND_' || c.relkind` because unknown concatenated with internal char had an
ambiguous operator. Our static review had not established parser compatibility.
Controller added ::text for relkind, typtype and prokind label expressions. The
three new reviewer oracles passed after the fix (24/24 SQL checks within69/69 at
18:02:27); no reviewer-before-fix RED or successful native rerun is claimed here.
Module SHA256 after this narrow correction:
`a27b1c23750cf22b5e71ef89c1d6a83606afa0a7b8b3fa583826f409d695cf3d`.
