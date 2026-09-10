# Accepted SMS receipt → one bounded calendar preparation hook

2026-09-10. **HELPER IMPLEMENTED; WORKER WIRING NOT YET IMPLEMENTED**. No worker, source result, schema78, flag, provider or
approval change by this plan. Decision owner: controller. Scope is making the
existing prepare-only producer useful from the real accepted reply path, not a
second interpretation or executor.

## Actual seam and mandatory completion boundary

`processSmsTemporalReply` commits the canonical receipt, source completion and
exact unsent acknowledgment together. Its successful wrapper returns
`TEMPORAL_REPLY_HANDLED_NOT_EXECUTED`, `committed:true`, `sourceCompleted:true`,
`outcome`, `receiptId`, `packetHash` and acknowledgment id. `sms-worker.ts` currently
returns `COMPLETED_REPLY_PREPARED` immediately for that handled source at line114.

Only `outcome === CORRELATED_NOT_EXECUTED` is the accepted correlated candidate.
REFUSED/ordinary/reserved/day-read paths remain unchanged. Neither receipt id nor
draft is accepted from the SMS text, model metadata, public input or a query list.
The hook's scope comes only from the admitted source claim and this known committed
result. Before invoking the producer, a bounded scoped lookup must bind the exact
accepted receipt to the completed answer operation, actor, original request hash,
packet hash and source result receipt/hash. This protects against a malformed
internal result; the actual producer then repeats current canonical receipt proof.

**Important existing timer interaction:** appending an awaited producer call to
the handled branch alone is unsafe reporting. `withinDeadline(work,deadlineAt)`
can win while the extra call runs, and both inner/outer catches currently attempt
`retainSourceUncertain`, returning REVIEW_REQUIRED even though the source was
already committed. Its CAS would not reopen a completed source, but the response
would still misreport that known completion.

Before any post-commit await, latch a closed completion receipt derived only from
the known handled/committed result. Both deadline/error exits must consult this
latch and return the established `COMPLETED_REPLY_PREPARED` outcome without another
source CAS. The latch is about source/ack completion, **not calendar preparation**.
Do not use it when the consumption commit acknowledgment itself is unknown.

## Proposed inline first implementation

1. Snapshot explicit calendar-PREPARE/STORE eligibility at entry to processing the
   claimed source, before the temporal consumption await. Initial OFF stays OFF
   for this execution even if the environment changes later. Recheck current flags
   immediately before/through preparation; ON→OFF stops preparation, never undoes
   a known accepted receipt.
2. On the exact known accepted result, set the completion latch first. Derive the
   hook deadline as `min(original source/batch deadline, hookStart + 5000)` and
   retain the original cancellation signal. No new 35-second allowance or revived
   source lease. If no time remains, skip the hook and preserve known completion.
3. The hook owns a **new, separate SERIALIZABLE transaction** because the answer
   is already committed. Set isolation/timeouts before the initial scoped lookup
   (no row lock yet). In this same new transaction call the actual unchanged
   `prepareCorrelatedPersonalCalendarReviewInTransaction` with its typed receipt
   subject and copied actor/context: it owns canonical namespace-first locking.
   Then repeat the exact receipt/completed-source/ACK binding with shared locks
   and a final live check before commit. This avoids an unbounded separate lookup
   or lookup→wrapper TOCTOU. Never pass the consumed source's old transaction or
   restore its old processing lease; the recorded lease is an identity pin only.
4. No second source CAS, source-result append, ACK-body rewrite, second model,
   outbox send, budget reservation, Google insertion or approval. The original ACK
   said what it knew at consumption time and remains immutable even if preparation
   later succeeds. The read-only correlated card discovers the new relation.
5. Await only within the remaining original budget. On failure/expiry/abort or lost
   preparation commit acknowledgment, preserve `COMPLETED_REPLY_PREPARED` for the
   source and do not report a created draft. Catch errors inside the post-commit
   hook and keep both worker catch latches as an outer-race defense. No detached
   untracked promise and no immediate retry. The producer's stable request UUID,
   atomic relation and global generic isolation remain unchanged.

Helper outcomes are internal: SKIPPED/UNAVAILABLE before entering the producer;
OUTCOME_UNKNOWN conservatively after producer entry when a generic exception does
not establish rollback; COMMITTED only after acknowledged transaction resolution.
A known commit remains factual even if the local deadline, abort or flag changes
while commit acknowledgment returns (`expiredNotActionable:true`). A false value
of that local signal does not certify the question TTL after commit: all outcomes
carry `actionable:false`, `freshnessVerified:false`, no approval and no execution.
The worker never exposes this provisional/late helper metadata as a fresh draft.
No error body or credential data is included in an outcome.

This creates one actual production call on the usual accepted reply path while
keeping calendar approval unavailable. It is not an exactly-once job claim or
guaranteed automatic recovery after a process crash.

## Durable recovery decision — do not hide the missing invariant

The accepted receipt and optional review are durable. But **an accepted receipt
without a review does not reveal whether preparation was never started, refused,
or committed with an unknown acknowledgment**. Existing `automaticRetry:false`
facts and source completion cannot be rewritten to manufacture that distinction.
No new kind should be smuggled into the existing operation table under an unrelated
kind; no existing packet/proof/ACK field should be repurposed as a work queue.

Recommended bounded first choice: **inline attempt plus read-only reconciliation**.
After process interruption, reconcile an existing review by its exact receipt and
stable request identity; never scan `ACCEPTED AND no review` and automatically call
the producer. If the exact relation is absent, leave preparation unavailable and
retain the source/receipt history. A future explicit authorized preparation action
may call the same idempotent producer, but is a separate seam, not a silent retry.
The normal non-interrupted SMS path still performs the real preparation once.

If the controller requires **automatic crash recovery with one claimed attempt**,
approve a separate durable intent design before coding that recovery: insertion
of an exact owner/source/receipt/packet-bound preparation intent in the consumption
transaction when the initial flag is ON; immutable uniqueness; one claim CAS and
bounded lease; terminal known-success/refused/unknown states; reconciliation-only
after a claimed unknown attempt. That requires new reviewed persistence (a forward
migration after78, not editing78), explicit deadline/retention semantics and native
tests. It cannot truthfully be promised using the present receipt alone. This plan
does not authorize that migration, queue, scheduler or new flag.

## Falsifiable gates before wiring

- Unit: accepted committed only; REFUSED never calls; initial OFF then ON never
  calls; ON→OFF/abort/budget exhausted never reopens source; wrong receipt/source/
  actor/hash fails the hook; one producer call with exact receipt and original
  deadline/signal; no caller draft or arbitrary receipt id.
- Timer races: producer throw, commit-unknown and unresolved/late callback past the
  original deadline preserve known source completion and perform **zero second
  source CAS**. Unknown consumption commit must still retain existing uncertain
  handling, never set the completion latch by inference from receipt shape.
- Native: actual question/outbox accepted receipt + existing incoming worker to
  committed source/ACK + real producer; one marked draft/review, no changes to
  source/ACK/receipt/expectation/budgets. Repeated source delivery remains NOT_PENDING
  and does not call the hook again. Deferred-trigger failure affects only the new
  preparation transaction. Revocation between commits rejects preparation while
  source remains completed. Original TTL expiration preserves history.
- Cross-review the full existing `withinDeadline`/inner/outer catch paths, not only
  the new helper. Record synthetic injected provider transport separately; no real
  SMS delivery or Google action is established by this local preparation.

Stop if implementation needs a fresh source lease, mutates an immutable result,
changes an ACK after commit, calls the model again, gains generic Google approval,
or silently retries missing provenance. Controller arbitrates the recovery choice
before any worker code; the inline hook and durable recovery are not equivalent.
