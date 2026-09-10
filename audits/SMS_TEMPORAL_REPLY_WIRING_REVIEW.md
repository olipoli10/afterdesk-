# Independent existing-worker temporal reply wiring review

2026-09-10. Reviewer `/root/personal_gateway_subject`. Scope: controller-owned
`sms-worker.ts` integration and `SMS_TEMPORAL_REPLY_WIRING_PLAN.md`, with an
independently mocked lower and staged finalization transaction. No production
source edits, database runs, provider calls or live activation by this reviewer.

## Contract review

Verified ingress and exact source claim precede routing. Reserved confirmation
and closed day-read grammar precede temporal inspection. Other messages inspect
the durable namespace even with temporal processing OFF. A thrown/missing-schema
lower never becomes permission for a model fallback. Only exact
`NOT_TEMPORAL_CONTEXT` plus `sourceCompleted:false` may proceed to that branch.
Exact HANDLED plus `sourceCompleted:true` returns before another source CAS or
deadline check; this is important after a known commit. A read-only transaction's
`committed:true` is not mistaken for source completion. Fixed responses use the
existing current identity check and final source CAS, without interpretation.

## Observed defensive-contract RED

At 11:02:44 local, independent wiring tests plus the earlier question review
produced 16 PASS / 1 FAIL. A mocked lower returned FIXED_RESPONSE and
`sourceCompleted:false` but omitted `reply`. Assignment left the optional
`temporalFixedReply` undefined; the worker reached the model and returned
COMPLETED_REPLY_PREPARED instead of refusing. The current real lower always
returns its typed fixed strings: this is a reproducible internal-contract
closure issue, not evidence of an attacker-controlled public result or live
provider execution. Requested fix: reject a fixed text unless it is a string
of length 1 through 1500 before using the optional routing sentinel.

Other independent cases pass: HANDLED rejects false/undefined/1/string-true;
no-context rejects true/undefined/zero; fixed source-CAS loss rolls back the
staged acknowledgment; known handled completion survives a later server switch
change without another mutation; unknown commit plus failed cleanup CAS remains
REVIEW_REQUIRED/recorded:false/no retry. The earlier question review changes
only its new lower mock to explicit NOT_TEMPORAL_CONTEXT; all six old oracles
are unchanged and pass.

Reviewer-owned files: `test/sms-temporal-reply-wiring-review.test.ts`, this note,
and the single mock addition in `test/sms-temporal-worker-question-review.test.ts`.
Parent-reported native 63 PASS is separate evidence; this review's mocks do not
prove PostgreSQL locking, provider delivery or source completion in production.
No final GREEN on this boundary until the defensive-contract regression closes.

## Reinspection after controller fix

The controller added the requested string and 1..1500 bounds directly inside
the exact FIXED branch, before setting the optional sentinel. No fallback or
source-claim check was relaxed. Fresh reviewer run at 11:03:58: 50/50 PASS
(author wiring18, independent wiring11, author question15, prior question6).
The original 16 PASS / 1 FAIL observation is retained above. Bounded code/test
verdict: GREEN for this integration; no new live or native proof is claimed.
The initial typecheck caught an overly broad reviewer mock type; the review
test now keeps a concretely typed model mock instead of casting the production
contract. Final type/lint results are recorded separately below when complete.

Final root TypeScript and reviewer-file ESLint checks both exited 0 after the
mock type correction. Read the four parent-owned actual-worker PostgreSQL
cases (14h, ambiguous 3h, unrelated command, processing OFF): actual ingress and
claim, strict consumer/source/ack, no second interpreter, no budget mutation,
exact source result/unsent acknowledgment text, and replay NOT_PENDING with
one acknowledgment. Read recorded native receipt/output
`evidence/postgres-native-1789052457335`: 63/63 PASS, exit0,
finished 2026-09-10T15:01:44.263Z, explicit server STOPPED. This run predates
the malformed mocked FIXED result hardening, and does not prove that new
synthetic malformed-result oracle in PostgreSQL. The lower's earlier 59-case
receipt `postgres-native-1789052213075` also records exit0 at
2026-09-10T14:57:33.192Z. These were controller executions reviewed as recorded
evidence, not new reviewer DB runs. No real provider execution is authorized.
