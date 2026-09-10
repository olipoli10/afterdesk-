# Independent standalone hook and future completion-latch review

2026-09-10. Reviewer `openrouter_disabled_adapter`. **GREEN for the standalone hook and subsequently authorized worker integration's bounded local source/test scope.** The original pre-integration observations below are retained as historical evidence; the integration result is appended at the end. No PostgreSQL, durable source/ACK mutation, provider or real SMS was run by this reviewer.

## Full trace inspected

Read the complete SMS_CORRELATED_CALENDAR_WORKER_HOOK_PLAN.md, current sms-worker withinDeadline/claim/temporal handled branch and both catches, actual processSmsTemporalReply transaction/known-commit return, canonical correlated calendar producer's transaction variant, standalone sms-correlated-calendar-preparation-hook.ts, and the author's full 63-test suite.

The hook accepts only explicit entry eligibility and a strict acknowledged source-completion result. REFUSED skips, false committed/sourceCompleted/acknowledgmentPrepared and contradictory authority flags refuse. It copies the actor/claim, historical lease, request/packet hashes and original capped deadline/signal before awaits. That lease is an identity pin on the historical receipt, never a renewed processing lease.

One new Serializable transaction installs bounded SQL controls, reads exact completed source/receipt/ACK binding without acquiring those row locks ahead of the canonical conversation namespace, invokes the **existing** producer transaction variant, then rechecks the same binding with shared row locks before commit. The producer continues to own the canonical current authority and namespace order. Source text/envelope hash, receipt source and packet hash, original source claim, ACK exact body/direction/account/idempotency and hash remain bound. No source result append or ACK rewrite is introduced.

Exceptions after entering the producer are conservatively OUTCOME_UNKNOWN; neither a thrown database result nor absence of a new review is used as permission to retry. Acknowledged commit remains COMMITTED metadata after a subsequent local deadline/abort/flag change. I raised a labeling limitation: expiredNotActionable=false does not prove question TTL freshness after the final awaited binding (especially a replay with no new insert trigger). Author clarified that field and added unconditional actionable:false and freshnessVerified:false. This metadata is not an approval/fresh-reader substitute; no new TTL extension is performed.

## Current worker boundary — do not invent a pre-integration defect

Added `test/sms-correlated-completion-baseline-review.test.ts` (4). These call the real current worker with a mocked temporal helper and a synthetic source-CAS scaffold:

1. Known handled completion returns immediately and performs no second source CAS.
2. Known result returned after a wall-clock advance still preserves completion, without a postcommit requireLive.
3. Lost consumption acknowledgment remains unknown to the worker even if mocked storage committed; retention CAS cannot reopen completed storage and duplicate source returns NOT_PENDING.
4. A temporal helper that has not returned is not a known completion merely because its later result succeeds. Outer timeout retains unknown reporting; no second execution occurs.

Fresh baseline **13:09:43: 4/4 PASS**. The current worker has no postcommit hook await, so no current post-hook reporting bug or RED is claimed.

## Independent standalone hook tests

Added `test/sms-correlated-calendar-preparation-hook-review.test.ts` (7), with separately authored SQL/producer mocks and the real source-envelope/hash validator. Oracles cover same-new-transaction ordering, original signal despite caller replacement, source Date mutation between bindings, duplicate final binding, contradictory provider/budget counters, and historical claim mutation without refreshing any lease. These mocks do not execute the producer, PostgreSQL locks or deferred constraints.

Fresh run **13:12:51 local: 74/74 PASS** (author63 + reviewer7 + baseline4); full TypeScript and scoped reviewer ESLint then exited 0. No reviewer edit to worker, hook author source, SQL78 or native fixtures.

## Mandatory regression matrix before future worker wiring

The future worker must set a closed known-completion latch only after the canonical temporal result has actually returned with known committed/sourceCompleted/ACK semantics, and **before any new hook await**. Both inner error handling and outer deadline races must consult it; the latch speaks only about the already committed source and ACK, never draft creation.

- Accepted known result, then hook throws or reports OUTCOME_UNKNOWN: return the established COMPLETED_REPLY_PREPARED, with zero second source-CAS/ACK/model calls.
- Accepted known result, then hook remains unresolved past original deadline: outer catch returns the latched source outcome and aborts original context; late hook settlement/inner catch cannot reopen the source or replace the known outcome.
- REFUSED known result: no producer hook, preserve known source completion.
- Consumption throws/never returns: no latch or hook, existing uncertain handling remains; do not infer known completion from a receipt-shaped object or a later storage lookup.
- Initial eligibility OFF, switched ON while consuming: never enter hook for this execution. ON→OFF after known completion may skip preparation but must not undo known source completion.
- Duplicate completed source: NOT_PENDING, no new hook, no automatic accepted-receipt-without-review scan.

These postcommit-await cases are specified, not yet claimed executable against the current worker. They must be exercised after controller-authorized integration; native same-source/ACK/history/no-budget checks and transaction-loss evidence remain separate controller gates.

## Authorized worker integration — independent follow-up

After controller authorization, read the complete 26-line worker diff and all 22 author wiring cases. Entry eligibility is captured before the first await; the source request hash is copied before admission and reused in the initial claim and hook. The known-completion latch is local to each invocation and established only after the actual temporal helper returns HANDLED, sourceCompleted:true and committed:true. Only accepted results with entry and current flags and original remaining deadline enter the hook. Inner and outer catches consult the latch before cleanup. Hook metadata is discarded, not interpreted as source/draft/approval success.

Added `test/sms-correlated-calendar-worker-hook-review.test.ts` (6) with a separate synthetic storage-state scaffold and the real worker. This checks a duplicate arriving while the first hook is suspended, then both late resolve and reject; per-invocation latch isolation from another source with unknown consumption; hook rejection triggered by the original deadline abort; authority-looking metadata getters never read; and entry OFF→ON followed by duplicate delivery. Original deadline/signal are identical in the temporal and hook calls. Completed storage is never rewritten by a second cleanup CAS. No new model, engine or normal source-finalization transaction is called.

Fresh **13:20:23 local: 102/102 PASS** across author hook63, standalone reviewer7, author wiring22, new worker reviewer6 and preserved baseline4. Full root TypeScript and scoped new reviewer ESLint subsequently exited 0. The baseline unknown-consumption cases still pass, while the new postcommit hang exercises the outer latch. No historical RED is claimed for the wiring because the author implementation preceded these runs. This is synthetic collaborator/timer proof, not database transaction, actual transport cancellation or production workflow proof. Controller owns native hook/receipt/ACK/history and budget preservation validation separately.
