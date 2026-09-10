# Correlated-calendar private read integration — controller evidence

2026-09-10. Worktree C:/dev/endvera-astra-r03. Baseline9830bc09;
local schema78 is unchanged. This record does not authorize activation.

## Current native results

- `postgres-native-1789058247735`:92/92 PASS16:38:32.583Z, STOPPED.
  Seven new item-reader cases compared to the85-case preparation baseline.
- `postgres-native-1789058422654`:93/93 PASS16:41:34.890Z, STOPPED.
  Added actual ACCESS EXCLUSIVE table lock during initial discovery. A200ms
  original context refuses the query before the holder's2s guard; after release,
  the same immutable review remains readable. This supplies the SQL reproduction
  which the earlier author mock-order regression did not establish by itself.
- `postgres-native-1789059270069`:99/99 PASS16:56:00.636Z, STOPPED.
  Six collection cases: active owner empty vs foreign/revoked refusal; actual
  accepted two-SMS receipt → committed preparation → list without manual id;
  Google grant revoked after preparation; actual short expiry with no renewal;
  concurrent readers preserve one relation; pre-aborted caller refusal.
- `postgres-native-1789059511365`:296/296 PASS in20 separate migrated clones,
  exit0 at17:01:55.365Z, STOPPED. Every clone uses
  `78:9d69f861d1884ca2b789ed72a691b5c2`. Temporal suite is now100/100: an additional
  real uncommitted member revocation allows the initial MVCC owner snapshot but
  blocks the final shared-lock recheck. pg_stat_activity confirms the actual
  waiting query before releasing the holder. After revocation commits, no old
  successful empty collection is returned. This is a real native race, not a
  mock proving a SQL string. No claim of global deadlock freedom follows.

The common native fixture injects only synthetic model/HTTP transports while
running actual persisted worker/outbox/receipt/preparation code. It is not an
observed Twilio request, second model call, real delivery, phone or Google write.
Explicit synthetic uncertain-status mutations test display only. Reader calls
leave operations, question, source receipts, expectation ledger and budget
unchanged. Retained clusters are not deleted; owned servers were stopped.

## HTTP adapter and broad checks

The new GET has verified-client session authentication, one strict workspaceId,
per-user30/minute rate allowance, original deadline/signal, strict response DTO,
private/no-store headers and opaque errors. No preparer, action, credential or
provider function is called. It does not promise cancellation of a hung auth
promise; it refuses disclosure after its deadline when an awaited call returns.

Controller first route run47 PASS/3 positive503 failures: an import-name mismatch
with the simultaneously written collection schema. Corrected import passed64/64
author+peer route tests12:53:24. A later crossed export rename caused the peer's
58 PASS/6 FAIL; canonical ResponseSchema plus identical Schema alias stabilized
the interface. No security validation was weakened. Peer combined collection
and route suite113/113 PASS12:56:31, with independent25 rerun after TypeScript
fixture narrowing. See the separate peer audit for exact limitations.

`root-1789059393875`:5119 PASS/3 historical skips across392 passing files,
exit0 at16:57:43.616Z. This is the broad local unit suite, not native SQL or
real-client coverage. Next build `build-1789059753208` passed17:06:06.600Z,
buildId `_ubSTK1_56VZQHBfrMUJA`. Built HTTP OFF receipt
`correlated-calendar-review-http-1789060078877` passed7 real HTTP checks at
17:07:58.876Z: GET/HEAD404 private/no-store, OPTIONS204 read-only allow,
POST/DELETE405. Owned PID54816 stopped, TCP ECONNREFUSED confirmed. No database
configured or authenticated read observed in that separate HTTP probe.

## Mobile integration and continuation

The owner-screen list and common API abort propagation passed separate review.
Reentrant pause/reload during LOADING, caller abort after private-request cleanup
and slow-device-clock stale display were reproduced and corrected; no native
Samsung observation exists. Final mobile receipt `mobile-1789060008457` passes
637/637 in64 files17:06:55.031Z, TypeScript/lint pass. Android Hermes export
`mobile-export-1789060079952` passes17:08:40.296Z, bundle
`entry-7af57615fc9e0372afeddc3954126e52.hbc`. This is local packaging, not a signed
APK, store release or functional phone connection.

The next bounded plan is SMS_CORRELATED_CALENDAR_WORKER_HOOK_PLAN.md: one local
preparation after the accepted receipt's known commit, without reopening source,
rewriting acknowledgment, granting approval, second model call or automatic retry.
Its helper may be developed separately; actual worker wiring waits for this read
batch's verification/checkpoint. The three-minute heartbeat remains ACTIVE.

Historical dashboard remains roadmap22%, local build46.75%, C2 18/18,
real provider/customer-test NO-GO, Verified-E2E0%. No rubric has been promoted.
