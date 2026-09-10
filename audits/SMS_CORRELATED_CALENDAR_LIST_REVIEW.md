# Latest-five correlated calendar list — bounded implementation

2026-09-10. Own files: new `correlated-calendar-review-list.ts`, its unit tests and this audit. The frozen item reader, producer, loader, migration78, native fixture, route and mobile sources were not edited by this lane. Parent separately owns route and native integration.

## Contract and all-or-unavailable choice

Input is explicit enabled option plus authenticated actor `{userId,workspaceId}` and original deadline/signal. No caller review ids, cursor, draft or proof. OFF performs no DB read. Success is only the strict `personal-correlated-calendar-review-list-v1` DTO: workspaceId, readOnly true, approvalAvailable false, executionAuthorized false, exact item reviews (maximum five), hasMore. It has no provisional status or commit field. OFF is a separate DISABLED result.

One SERIALIZABLE transaction has a maximum five-second total wall/deadline and monotonic elapsed budget. SQL isolation/statement/lock timeouts are configured before the first owner read. Initial active workspace owner/member authorization takes no row lock. Scoped id-only discovery orders createdAt descending then id descending, LIMIT 6. The sixth id determines hasMore but is not loaded. The first five use the actual unchanged item transaction function sequentially, without nested transactions or preparing anything.

Each item remains subject to the canonical namespace/source/current-authority/proof checks. A late expired, revoked, corrupt or unsupported item fails the entire collection. No skipping, partial list or silently empty success is returned. An older expired row within the latest five can therefore suppress otherwise readable newer items; this is the expressly accepted bounded first implementation, not a permanent historical-reading capability.

After all items, owner/member are re-read FOR SHARE and exact identity/updatedAt epochs compared with the initial snapshot. Empty results undergo both owner checks too. Final finite DB clock must not precede any item's inspection and must remain before every expiry/pilot. Publication after commit adds elapsed monotonic time, sampled before that DB clock SELECT, to the DB instant; it does not substitute a host/device wall-clock for TTL. Gates/deadline/abort are rechecked after commit. Lost acknowledgment, withdrawal or late expiry throws a single opaque `CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE` without retry.

The strict wire schema repeats only the frozen DTO's presentation shape, not any model/receipt/proof validation. It is exported under canonical `correlatedCalendarReviewListResponseSchema`, with `correlatedCalendarReviewListSchema` an alias of the same object. A pure opaque parser is also exported; neither authenticates arbitrary supplied evidence. Actual production items still come exclusively from the authenticated item reader.

## Lock ordering and availability limitation

Initial owner authorization/discovery do not lock owner/review/calendar rows ahead of a namespace. Each item retains its canonical namespace and evidence locks until the single transaction commits. The final owner SHARE locks follow those established item locks; no new write or lock upgrade is performed by the list.

The latest-created ordering is deterministic, but is not a globally sorted namespace ordering. Historical identities in different workspaces can in principle yield opposite multi-namespace orders before a stale identity is refused. Peer raised that risk; no native deadlock was reproduced by this lane and the code does not claim universal deadlock freedom. Existing short SQL lock/statement timeout and total transaction timeout make contention an opaque failed read/rollback, not partial publication or a bypass. A future availability optimization would need a separately reviewed canonical-namespace discovery contract rather than silently reordering or skipping items.

## Local execution and integration evidence

- First new unit suite **38/38 PASS**, 12:53:41.
- Scoped source/test ESLint PASS, zero warnings.
- Expanded item/producer/receipt suite **148/148 PASS**, four files, 12:55:28.
- Includes one fixture that calls the real unchanged item reader, validates its resulting list against the wire schema, then passes the actual emitted item to the real mobile item parser. DB/receipt loading remain mocked; pure reference proofs are produced by the real durable inspector.
- Covered empty authorization, latest5/hasMore/sequential order, strict selectors, initial/final owner refusal and epochs, duplicate/excess discovery, second-item failure, malformed item/provisional values, late expiry before and after commit, original cancellation/deadline/caller snapshots, single monotonic budget and no retry/effects.

During parallel integration, Schema versus ResponseSchema naming messages crossed. Parent/peer reported positive route cases becoming 503 due to the missing export. This was an integration naming mismatch, not a bypass or business-rule defect. Both stable export names now reference exactly the same strict schema object; route retains ResponseSchema. No validation was relaxed to make those cases pass.

Source SHA256 at initial freeze:
`34705c621785baa3fbb53fd8a6abccdab44dd31540ece9bc36797af5d737598f`.

No DB/server, full-root suite, provider, credential, schema/generation, route or mobile mutation was executed by this lane. Parent's forthcoming native cases and peer counter-tests must be recorded separately rather than inferred from these mocks.

## Parent native result read after freeze

Read result/output `postgres-native-1789059270069` and all six new collection
cases with their helpers: **99/99 PASS**, exit 0, **16:56:00.636Z**, exact disposable
server STOPPED. Six new cases (not 99 new collection cases) cover authorized
empty vs foreign/revoked owner, real committed preparation to list, current grant
revocation producing unavailability rather than empty success, real expiry with
history unchanged, two concurrent collection calls, and pre-abort refusal.

The two-reader test uses concurrent promises and checks identical immutable
review/history, but does not assert two distinct backend PIDs or a barrier at a
contended lock. Do not label it proof of the hypothetical cross-namespace cycle's
absence. The accepted SMS/preparation fixture is real DB logic with injected HTTP;
the reader does not add a provider call. No database was launched by this lane.
