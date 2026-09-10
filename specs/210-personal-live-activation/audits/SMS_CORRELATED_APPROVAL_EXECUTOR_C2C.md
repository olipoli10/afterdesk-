# C2c — same executor and explicit-command wrapper

2026-09-10, author lane `personal_gateway_subject`, checkout `C:/dev/endvera-astra-r03`.
State: **CODE + TARGETED SYNTHETIC TESTS; native/reviewer pending at this receipt**.
No flag activation, provider call, user token/audio/data, PostgreSQL execution,
schema/client generation, deployment or push was performed by this lane.

## Scope and final source snapshot

- `src/server/personal-assistant/calendar-actions.ts`: one existing executor,
  strictly parsed legacy or typed A claim, canonical C2a effect gates. Global
  marker/review/**approval** exclusion also covers generic replay/list/claim.
- `src/server/personal-assistant/correlated-calendar-approval.ts`: existing C2b
  transaction function unchanged; add wrapper, scoped closed response schema and
  optional original monotone deadline in the budget factory (controller approved).
- New tests: `correlated-calendar-approval-executor.test.ts` (33),
  `correlated-calendar-approval-wrapper.test.ts` (21), and
  `correlated-calendar-approval-legacy-isolation.test.ts` (4).
- Authorized old-test adjustments only: C2b static assertion now inspects the
  nonempty exact claim-function slice; old isolation fixture adds the new global
  approval delegate returning null. Behavioral assertions are unchanged.

Final frozen SHA256, read directly from disk at 15:54:47 local:

| Source | SHA256 |
|---|---|
| calendar-actions.ts | `4fe68c46a386e684bac1d2d988b67dfe947ff6be0bb64e89707452a22e0b89b9` |
| correlated-calendar-approval.ts | `ea5f2bc79b35627236f1ac2a593a797dceecdf3af16cf5645079773a5fe638a2` |

C2a/C3/SQL79/recovery/shared queue/native fixtures were not edited by this lane.

## Execution/commit boundaries

1. The wrapper snapshots strict command, actor, original signal and both deadlines
   before awaiting its one SERIALIZABLE claim transaction. Queue time is included.
   The budget factory samples wall/monotone time, then uses the minimum of both
   original remaining budgets and 25 seconds. The original monotone deadline is
   not converted to wall time and resampled into a longer budget.
2. Only a newly returned claim **after transaction resolution** reaches the
   existing executor. An exact prior attempt ends that transaction before C3
   authorizes historical disclosure. No nested C3 transaction or re-execution.
3. The existing executor commits the one-use typed `DISPATCH_CLAIMED` CAS before
   token loading. Only an acknowledged winner owns conservative cleanup. Unknown
   marker acknowledgement does not authorize token loading or cleanup of a winner.
4. The same `googleTokensForOwner` and `GoogleCalendarClient.insertEvent` are used.
   C2a acquires canonical namespace/authority locks before calendar locks. READ
   is checked in addition to WRITE, on the same account/credential; the token
   loader's copied READ receipt must match both pre-HTTP and terminal gates.
5. The actual insert Promise is boxed inside the locked admission transaction;
   network latency is awaited outside it. The transport-attempt counter is read
   in `finally`, including a synchronous injected throw after its increment.
6. Current C2a inspection precedes terminal CAS. The A terminal schema binds the
   deterministic event id and original immutable approval origin. A success with
   no observed write transport cannot be persisted as `CONFIRMED`.
7. Deadline/abort/unknown outcomes never retry or reopen. Cleanup matches the
   exact processing/nonce/lease/request/result predicate; terminal/recovery wins
   cannot be overwritten. Its legacy SERIALIZABLE 1s maxWait + 2s timeout is a
   **separate bounded bookkeeping grace**, not additional effect authority.
8. A known terminal commit response stays factual even when delivered late.
   Unknown acknowledgement stays unknown. The sibling HTTP route may withhold a
   late response; it must not rewrite the durable result or retry the command.

Each typed effect transaction and the pre-HTTP synchronous fence retain the
original absolute and monotone budget. C2a's DB UTC sample further tightens the
remaining durable lease using a conservative monotone anchor before gate work;
app and DB wall clocks are not assumed equal. Legacy clock/claim semantics remain
unchanged aside from added typed-origin exclusion and preserving a synchronous
observed transport attempt.

## API / response contract

`approveCorrelatedCalendarReview(commandA, actor, env, context, client?)`.
`context` has `deadlineAt`, optional `monotoneDeadlineAt`, and original `signal`.
The optional fifth client is the same existing client dependency for controlled
tests; the production route does not pass one.

`correlatedCalendarApprovalResponseSchema`, version
`personal-correlated-calendar-approval-response-v1`, is strict at every level:
workspaceId, reviewId, expectedReviewFingerprint, expectedRequestHash,
automaticRetry:false, executionAuthorized:false, providerStateVerified:false,
and either CONFIRMED + receipt, or ALREADY_ATTEMPTED + exact scoped C3 result.
DISABLED is separate and contains no claim. No nonce, approval id, operation id,
credential/write-authority material or provisional commit flag is disclosed.
These labels describe a recorded outcome, not proof of a human gesture or the
provider's current state. All SQL guards remain required; pure parsing is not
authorization.

## Observed test history (do not flatten into one green claim)

- First combined run: **90 PASS / 1 FAIL** (15:46:12). Executor29 passed; the
  pre-wrapper C2b static assertion prohibited any executor/history import in the
  entire module. Controller authorized narrowing to the nonempty exact claim
  function, preserving no query/execute/history invocation there.
- First legacy-expanded run: **151 PASS / 8 FAIL** (15:47:40). Eight old isolation
  cases lacked the new approval delegate. Controller authorized that mock only;
  no behavioral assertion relaxed. New approval-only fault + legitimate legacy
  controls cover the added exclusion; mocks are not physical FK corruption proof.
- Wrapper first run: **48 PASS / 1 FAIL** (15:49:54). The fixture's returned gate
  actor aliased the caller actor under the mutation test. It was changed to a
  private copy, matching the real immutable gate. No product fix claimed.
- **RED 15:50:39**: synchronous injected insert incremented transportAttempts then
  threw; cleanup stored externalTransportPerformed:false. `try/finally` preserves
  the observed counter. This is synthetic injected behavior, not a provider event.
- Main identified a false-positive wrapper50ms oracle: its hardcoded RETURNING
  lease20s caused C2b to refuse before reaching the commit hook, while a substring
  error assertion matched that unrelated failure. Fixture now caps RETURNING
  lease to the actual fixed UTC INSERT deadline and asserts commitHookReached,
  commits===1 and the exact post-commit error. No earlier mono coverage claimed.
- **RED 15:52:41**: successive monotone clock samples yielded deadline24101 when
  the entry deadline was24100. Passing the exact original bound into the factory
  fixes the renewal; same test passes without changing the expected bound.
- **RED 15:54:19**: READ grant revision after HTTP returned a confirmed receipt
  using an older read-disclosure pin. Reusing the exact READ comparison at the
  terminal current gate fixes it; result becomes UNCERTAIN, origin retained.
- **188/188 PASS**, 9 targeted files, **15:54:47**. Includes C2b62, peer8, new58,
  legacy fencing/provenance and both isolation suites.
- Fresh `tsc --noEmit --pretty false` and scoped ESLint both exit0 after the final
  READ comparison patch (same frozen sources). No full-root/build/native by agent.

The executor author DB mock automatically rolls back a thrown transaction; that
alone does **not** prove persistence with lost acknowledgement. The peer's
separate real-client/injected-HTTP fixture intentionally preserves committed
state despite lost ACK. Parent owns actual PostgreSQL proof and can report it
only after its receipt and cleanup are observed. Native170 was starting against
the frozen hashes when this audit was written; it is not claimed PASS here.

### Cross-lane review receipt read by author

`CORRELATED_CALENDAR_C2C_EXECUTION_REVIEW.md` was read in full after publication:
peer reports 8/8 new real-client/injected-HTTP tests at15:56:01 and 74/74 combined
at15:56:45, TypeScript/scoped lint exit0, same two source hashes. Its persisted
marker/terminal-with-lost-ACK storage model complements the author's rollback
mock. Initial peer8 failures were JSON key-order sensitivity in the mock, then
corrected to canonical equality; no product RED attributed to those failures.
This is cross-lane code review, not independent model-quality or real-provider
proof. Native proof remains controlled and reported separately by main.

### First native receipt read, not launched by this lane

Main's `evidence/postgres-native-1789070126831/result.json` and failure output were
read: **169 PASS /1 FAIL**, exit1 at **19:57:18.059Z**. The failed assertion was
expiryObserved:false in the deliberately abort-ignoring late-response fixture.
The executor can stop conservatively before DB expiry, so the caller's UNKNOWN
return does not imply the injected callback has already reached its DB-expiry
sentinel. This was an ordering gap in the fixture, not justification to extend
execution authority or await HTTP while holding locks.

Main's correction was read: retain that callback Promise, await its bounded late
completion **after** observing wrapper UNKNOWN, then require actual expiry and
unchanged historical outcome/replay/no second POST. Main also added real terminal
commit acknowledgement loss: the committed CONFIRMED row survives cleanup CAS0
and is later read through C3 without re-execution. Native171 against the same
frozen product sources was running at this addendum; no PASS inferred yet.
