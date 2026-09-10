# Native per-file database isolation — independent static review

2026-09-10. Reviewed the complete native validation script and its subsequent
remaining-deadline delta, the canonical Vitest include and the static tests.
No PostgreSQL server, migration, provider or downloaded executable was launched
by this reviewer.

## Decision

**GREEN for the bounded local native launch, pending its actual receipts.**
Fresh independent run at **10:22:33: 10/10 static tests PASS**: five isolation
tests plus five existing native-harness tests. This is source/static evidence,
not evidence that the new cloning loop has run successfully.

The harness freezes the complete flat test inventory, migrates one private base,
records the completed migration digest, forbids connections to that base and
requires zero remaining sessions. Each file then receives a separate randomly
named database cloned from the base and a new Vitest process. The clone digest
must match. Per-file failures accumulate and cannot be overwritten by later
successes. Test files and assertions are not removed. Databases/logs are retained;
only the exact owned server is stopped. No global installation or production
database is in scope.

PostgreSQL17 permits the owner/superuser to copy an ordinary database; an idle
template is required, and the new database permits connections by default. Thus
the connection-disabled source is not a reason to silently reconnect the base.
Sources checked: [CREATE DATABASE](https://www.postgresql.org/docs/17/sql-createdatabase.html)
and [template databases](https://www.postgresql.org/docs/17/manage-ag-templatedbs.html).

## Finding closed before execution

Initial source bounded Vitest by the remaining600s but allowed clone and digest
commands their separate30s default. The final iteration could therefore exceed
the intended test-campaign allowance before checking it again. The author added
Get-NativeCampaignRemainingMs, called before clone, before digest and before
Vitest. The first two receive min(30000, remaining600000); the test receives the
remaining allowance. Cleanup remains separately bounded. This is not a claim
that process startup/termination or filesystem operations have zero duration.

## Limits

Isolation prevents one fixture's global sweeper from consuming another file's
rows; it does not itself test intended cross-file workflows. The prior shared-DB
failures remain historical evidence, not erased failures. Native backend
concurrency, trigger execution, cloned-database behavior and server cleanup must
be read from the next actual native receipts. The harness is not a network sandbox.

## Subsequent shutdown allowance review

The controller's receipt postgres-native-1789050288734/cleanup-observation.json
records16 files/179 tests passing, but the original campaign exit remains1:
the15s graceful-stop wait elapsed during a17.687s checkpoint. Its later read-only
observation records stopped status, not a retroactive successful campaign.

Reviewed the narrow replacement with pg_ctl fast/wait45s and child envelope55s.
Exact target validation and failure exit remain, with no immediate shutdown or
server force-kill added. This only enlarges the separately bounded cleanup
allowance; the600s test-campaign budget is unchanged.

At10:29:35 the old static oracle still expected15s:10PASS/1FAIL. After the parent
updated that exact assertion, independent rerun **10:32:35:11/11 PASS**. GREEN for
the narrow source change; a fresh successful native run remains required.
