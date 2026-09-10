# Forward78 correlated calendar provenance — SQL/Prisma code cross-review

2026-09-10. Read the entire migration, the complete52-line additive Prisma delta,
the prior76/77 source/reply/final guards, actual proof/citation/request producers
and the controller native serializer fixture. Reviewed final migration SHA256:
dd8d09a78d5b313661e3f9e226271180790ed0eab112d1c197e6a4b3d26400c3.
No SQL execution, database, Prisma generation or migration application by reviewer.

## Verdict

GREEN for controller-run local migration/native validation; not native SQL proof
or authorization to expose/approve a correlated draft. Static contract suite
8/8 PASS12:13:24. Actual application/native direct-SQL negative/atomic/concurrency
tests remain required before producer integration. Existing generic isolation
implementation is a separate code review, described below.

## Constraints and lifecycle

The scoped receipt unique key is a real FK target. Marker and review reference
receipt/workspace/owner restrictively; original/reply/model child/calendar use
actual operation scoped keys. The marker and relation each uniquely bind their
receipt/calendar identity, with no parser-version-dependent reuse. Gateway and
account links are rechecked through final scoped lineage. No mutable membership,
grant or account-version FK freezes revocation. Existing legacy markers remain
NULL without backfill, historical data rewrite or budget creation.

Immediate operation guard prevents every marker change, including NULL adoption,
and requires fresh pending/attempt0/leaseNULL/resultNULL/no transport/no budget.
Marked request/scope/account/key/createdAt/model-origin identity stays immutable;
legitimate later terminal/status fields are not permanently frozen. The review
is append-only and blocks truncate. Restrictive FKs prevent deleting its linked
operation/receipt. This is not protection against privileged trigger disabling.

Both creation sides have initially deferred final guards. Explicit table IF
dispatch avoids the old polymorphic NEW CASE error. Current review/question/
receipt/calendar rows are reloaded; missing/orphan/swapped identity cannot pass.
Final operation must still be the exact pending/no-effect/no-budget request.
These pending checks run only on INSERT, not every later status mutation.

The accepted/consumed question/reply lineage is exact; original and answer are
distinct completed attempt1/leaseNULL SMS sources. Full source envelope hashes,
recorded timestamps, protected original review, reply receipt/result, child,
gateway/AI/final attempt and decision are bound to actual persisted columns.
Permanent namespace mirror must be this question's inactive typed row; another
later active question is not forbidden. No new live source claim is fabricated.

## JSON, clocks and review findings closed before native

Exact-key predicates coalesce unknown/missing shape to false. Required JSON types,
false booleans and comparisons use IS DISTINCT FROM where NULL could otherwise
pass. Table scalar columns are NOT NULL; proof hashes, UUIDv8, versions and pilot
constants have exact checks. Query-based lineage requires selected valid=true,
so missing joined values do not silently qualify. Malformed casts may refuse
with PostgreSQL type errors rather than a bespoke message; native tests must
assert the intended refusal rather than count arbitrary exceptions as proof.

The eight-key proof hash reconstructs the actual pure receipt producer object,
with originalPacket=resolution=the immutable resolved packet. This comparison
does not prove an inspector was invoked or establish current authority. Exact
draft fields bind to packet values; title uses the full ECMAScript trim set.

During review, title citation integrity was raised: packet top-level citations
needed equality to evidence and original candidate fields. Author's self-review
patch crossed that message; no independent RED/native exploit was observed.
Final source now compares top-level/evidence citations, unique original action
id/kind/dependsOn and title/start/end tuples with source ID/hash. Reply citation
is exact complete answer with UTF16 length, and both source objects are exact.
No PostgreSQL code-point substring or French grammar implementation is invented.

Review.createdAt is forcibly assigned UTC clock truncated to milliseconds, not
merely defaulted. Parent-authorized pilot reference/expiry literals match existing
authority constants. Final clock is captured once after all lineage queries,
requiring createdAt<=clock<min(question expiry,pilot expiry). Reviewer requested
this single snapshot to avoid comparing against two different clock reads.
Naive storage comparisons are UTC; genuine JSON instants retain zoned casts.

Reviewer measured the initial owner index name at71 characters. Author replaced
it with sms_correlated_calendar_owner_created_idx in both SQL and explicit Prisma
map; final inspection confirms the same name. No PostgreSQL truncation/drift is
claimed actually executed—the mismatch was corrected before application.

## Existing native serializer evidence, distinct from this migration

Read controller result/output postgres-native-1789056118672:18/18 PASS, exit0,
16:02:17.201Z and exact server STOPPED. The actual existing calendar preparer
produces9 titles across3 transaction timezones; SQL pg_temp functions match its
six-field JS bytes and hash, including escapes/controls/astral text/trim variants.
UUIDv8 vectors, default-btrim counterexample, JSON NUL/surrogate refusal and bad
envelope/version types are separately checked. Temporary functions and prepared
rows roll back; this is not migration78 syntax/trigger proof. Final78 promotes
those serializers with strengthened null-safe shape tests and UTF16 ID bounds.

## Integration follow-up not disguised as a SQL verdict

Raw canonical lockWrite uses marker NULL plus global NOT EXISTS by calendar ID,
which also guards forged legacy execute calls. The reviewed-in-progress ORM list
and replay paths initially used the composite reverse relation. That join normally
includes workspace/user, so it does not by itself meet the plan's stronger global
any-relation defense for a malformed foreign relation. Healthy FKs forbid such
rows, but the plan intentionally requires defense independent of that assumption.
Reviewer alerted isolation author to use scalar calendarOperationId lookups/raw
global exclusion before LIMIT; no current foreign-row bypass was executed.

Native controller must still test exact orphan/final-state rejection, immutable
marker, cross-tenant FKs, proof/request/citation tampering, createdAt override,
real expiry, concurrent same-receipt preparation and ordinary legacy behavior.
No reviewer claim of model accuracy, Google insertion, provider or real-user E2E.

## Addendum — explicit composite unique keys after Prisma P1012

Parent reported Prisma validation P1012 for the singular composite relations.
The initial SHA and static verdict above are retained, not rewritten as a passing
Prisma validation. Reviewer then read all three new SQL indexes and their exact
Prisma `@@unique` maps:

- `sms_correlated_calendar_marker_scope_key`: operation marker/workspace/creator.
- `sms_correlated_calendar_receipt_scope_key`: review receipt/workspace/user.
- `sms_correlated_calendar_draft_scope_key`: review calendar operation/workspace/user.

All original single-column unique constraints remain, so global non-reuse and
global calendar-ID lookup are not weakened by making the ORM singular composite
relations explicit. These are not mutable authority-version foreign keys.

Current migration SHA256:
`2517fa32d1d4bb1ef2d8888ea82cf1df09cf0c6fe0c07549de12f447bf8b98ef`.
Read-only removal of exactly the three newly added `CREATE UNIQUE INDEX` lines
and hashing the remaining UTF-8 text yields the original reviewed SHA
`dd8d09a78d5b313661e3f9e226271180790ed0eab112d1c197e6a4b3d26400c3`.
Thus this addendum does not silently certify an uninspected trigger-body change.

Parent reports Prisma validate/generate PASS after this correction. No such
command or database run was executed by this reviewer. Native producer/guard
results are separately controller-owned and are not inferred from this hash
comparison. GREEN for the three-key schema/SQL delta; earlier limitations remain.
