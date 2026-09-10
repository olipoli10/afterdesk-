# C2b — transaction-only immutable approval and claim

2026-09-10. Parent baseline C2a/C3 commit `2ce2c115`, following C0/C1 `95809c09122b84142b067aebdcb2ea37f20ec747`. Author scope is only new `correlated-calendar-approval.ts`, `correlated-calendar-approval-claim.test.ts` and this audit. No existing executor, C2a/C3 reader, SQL79, recovery, route, mobile, dependency or generated client was edited.

## API and caller obligations

`createCorrelatedCalendarApprovalClaimBudget({deadlineAt,signal?})` must be called once BEFORE opening the transaction. It captures absolute and monotone total deadlines (maximum 25 seconds), claim-phase deadlines (maximum 5 seconds), and `transactionOptions` with SERIALIZABLE, bounded maxWait and timeout. `maxWait + timeout` never exceeds that phase budget. Queue time counts against the captured deadline. The existing caller is not implemented in C2b; C2c must use these options and retain the original total deadlines for execution.

`claimCorrelatedCalendarApprovalInTransaction(tx, commandA, actor, env, budget)` requires the caller's SERIALIZABLE transaction. It snapshots the strict command, actor, original signal and bounded timing fields. An actual root client is rejected. OFF returns DISABLED without a query.

The only successful new-write result is `CLAIM_CREATED_NOT_COMMITTED`, containing a private immutable A claim/view and final inspection time, with `committed:false` and `executionAuthorized:false`. It is NOT a commit acknowledgement or a human-action proof. The caller must await its own transaction successfully before considering execution. C2b has no transaction wrapper, history call, token load, provider call or executor import.

An existing choice produces only `ALREADY_ATTEMPTED`, `committed:false`, `executionAuthorized:false`: no approval/operation handle, nonce, claim or prior receipt is exposed. The later wrapper must finish this transaction and invoke the independently protected C3 reader. The marker itself does not authenticate the current owner; C3 performs that current authorization. No C3 call under a calendar lock and no automatic execution of an existing claim.

## Replay and new-claim paths

After isolation and LOCAL timeout setup, an unlocked metadata lookup is scoped by review/workspace/user and uses the global approval relation `(reviewId OR calendarOperationId)`. It reconstructs the SQL79 descriptor; A validates its shape/hash and exact command/actor binding before any replay disposition. Prior approval requires true pre-snapshot visibility, exact immutable binding and valid closed state, attempts1 and correct processing/terminal lease/transport structure. Missing, duplicate, foreign, malformed or conflicting provenance refuses. This path does not require a live Google grant, pilot or source-store switch merely to distinguish the prior immutable choice; the REVIEW/APPROVAL switches, original cancellation and deadline still apply, and C3 is not bypassed.

For a pristine pending record, the actual C2a gate acquires the canonical namespace/source/current-owner/READ+WRITE locks. The view and command are re-compared. An explicit `FOR UPDATE OF o` then upgrades the calendar operation BEFORE approval insertion, checking exact scope/account/request/hash/receipt, pending0/null-result/null-lease/no-transport and global absence of approval. No calendar lock is acquired ahead of the canonical gate.

The approval INSERT uses server UUID/token, immutable scope/fingerprint/authority, and SQL-derived original expiry. `approvedAt`, expiry and lease are consumed from `RETURNING` as UTC instants, copied to strings before the next await. A reconstructs the exact claim and CLAIMED state. The operation CAS requires exact request JSON/hash/scope/account/receipt, pending0/null fields and no mixed origin/budget. Its result must be exactly 1; zero, negative, multirow or NaN acknowledgement throws. Final DB time must be within the approved lease/expiry, while the original absolute/monotone phase and exact configuration remain live.

SQL79 remains the atomic/deferred final-state guard. No approximation of successful commit is introduced. Unexpected driver errors propagate; this transaction-only function does not relabel a connection/acknowledgement failure as a known rollback.

## Fixed DB-clock lease ceiling

The lease ceiling is calculated once after the operation lock as:

`gate.inspectedAt (DB instant) + min(original absolute remaining, original monotone remaining)`.

The gate's DB instant precedes this calculation, making it conservative. INSERT receives that fixed UTC timestamp and uses `LEAST(original preparation expiry, pilot expiry, fixed deadline)`. It no longer calculates a new deadline from INSERT's later `clock_timestamp()`. DB queue/query latency therefore shortens the available lease instead of extending the original budget. The returned lease is checked against that fixed ceiling and A's maximum 25 seconds. C2c must still enforce the original total execution budget; a durable lease is not permission to restart a timer.

## Fresh validation and failures retained

1. First author unit run: 61/61 PASS at 15:16:45. The following TypeScript run exposed a malformed `it.each` table for three lock cases: arrays had been spread as argument tuples, allowing generic TypeErrors to satisfy the loose rejection assertion. This was an oracle defect, not proof of those three intended guards.
2. Corrected those cases to explicit `{rows}` objects, required the exact `CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED` code and a reached-lock sentinel before asserting no INSERT. No production guard was relaxed. 150/150 PASS at 15:17:50 (61 author + 89 A); TypeScript PASS.
3. Peer/main identified that the original `DB clock at INSERT + remaining duration sampled before await` could extend the lease. Author RED at **15:19:00**: a synthetic 1-second INSERT delay returned a lease at +26 seconds instead of at most +25 seconds (`1789099346000 > 1789099345000`). No DB was executed; the mock explicitly models the old/new SQL timing distinction.
4. Replaced the duration with the fixed UTC ceiling described above; preserved the latency regression. **151/151 PASS at 15:19:30** (62 author + 89 A), TypeScript exit0 and scoped ESLint exit0. Source/tests frozen for the parent's C3 build snapshot after those checks.

Tests cover exact replay phases, malformed/global provenance, command/actor drift, READ/WRITE gate refusal, explicit lock-before-insert, exact DB-returned values, CAS failure, late switch/pilot/authority changes, abort, caller-object mutation, absolute/monotone/queue bounds, fixed lease timing, and commit ambiguity. Rollback tests use a clearly labeled simulated caller transaction restoring its fixture state; they are not proof of native rollback, FK or trigger execution.

## Remaining gate

Parent and peer reread, then parent-owned native actual claim/replay/rollback tests are still required. No provider request, activation, build, full-root test, native database or migration run was performed by this author. C2c and the route remain absent. Cross-review uses another agent of the same model, not independent model-quality validation.

Frozen SHA-256: source `7f1eff053d3f2317a5f6a97462dd1ae44b09d990eedb5a65299d7f0bf333aa25`; author test `ab2bf28cb7ec1d5ce8db236fecafdaa7acd8f20e1370b538554fb62118f124b2`.
