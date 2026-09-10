# Temporal question expiry — independent bounded review

2026-09-10. Read the full helper, plan and37 author tests. Reviewer owns only
test/sms-temporal-maintenance-review.test.ts and this note. No production edits,
database/server, migration, provider or credential activity by this reviewer.

## Verdict and fresh evidence

**GREEN for local standalone bookkeeping source; native validation pending.**
Fresh **10:24:33:42/42 PASS**, comprising37 author cases and5 independent cases.
Reviewer scoped ESLint passed. The staged transaction double explicitly models
rollback/commit ordering; it is not PostgreSQL concurrency or trigger evidence.

Expanded rerun **10:25:39:66/66 PASS**, adding24 legacy calendar-confirmation
maintenance cases to the42 above. Root TypeScript noEmit also passed at10:25.

Five added oracles cover failure on the second CAS rolling back the first;
deadline expiration during the final CAS; mutation of a discovered object during
namespace acquisition; mismatched locked-row id; and accurate reporting of a
known successful commit when the switch changes only after the callback commits.
No new production defect was reproduced by these tests.

## Boundaries checked

OFF precedes input parsing/DB use. Captured strict actor scope and batch1..25
bound the discovery. Actual SERIALIZABLE is required, with local statement/lock
timeouts. The existing permanent namespace is acquired without waiting before
question row locks; stale/busy rows are skipped. The update repeats exact owner,
workspace, namespace, phase, hash and database UTC expiry predicates. Only phase
and UTC updatedAt change. Invalid CAS counts throw; errors/abort/deadline and
switch revocation after awaited tentative writes are checked within the callback.

No current grant is required merely to expire a historical question. This does
not revive action authority, consume an inbound message, send/cancel an outbox
item, release a budget, delete history or retry an uncertain effect. Existing
registry triggers still decide legal phase/ledger transitions.

The standalone wrapper reports committed counts only after a known successful
database commit. A caller-owned transaction receives an explicitly provisional
count and must preserve the documented namespace-first ordering. JavaScript
checks cannot make external flag changes atomic with COMMIT acknowledgement.
SQL timeouts bound statements; these tests do not measure physical cancellation
latency. Future integration must not mistake expiry/correlation for user approval.

## Native fixture pre-run review

Read the controller's four added tests in temporal-registry.postgres.test.ts.
The three modes create actual1000ms TTL, wait against the database clock without
rewriting expiry, preserve complete source/question/registry payloads and budget,
check the inactive permanent ledger mirror and verify a zero-change replay.
The fourth uses overlapping distinct backend IDs and requires total expired1.

Sent one test-oracle hardening request before execution: the concurrency case
must not discard arbitrary rejected outcomes merely because one winner expired
the row. Only the expected serialization conflict may be accepted for a loser;
timeouts/unrelated SQL errors must fail. Successful callback results should also
retain the explicit provisional status. No native run by this reviewer.

Follow-up source reinspection at10:39 confirms this request is implemented:
each fulfilled result has the provisional status/committedfalse, while rejected
outcomes must be P2034 or P2010 with underlying40001. Unexpected SQL errors or
timeouts no longer disappear from the concurrency oracle. Fixture review GREEN;
the controller owns execution and its resulting native receipt.
