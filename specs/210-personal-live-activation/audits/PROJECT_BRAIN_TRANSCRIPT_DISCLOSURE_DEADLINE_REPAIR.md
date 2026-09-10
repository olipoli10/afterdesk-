# Project Brain protected transcript disclosure deadline repair

Date: 2026-09-10. Scope: local OFF reader hardening, not ASR activation.

## Authority and ownership

The controller approved the20:37Z addendum and publication refinement in
`ASR_PROJECT_BRAIN_TRANSCRIPT_REVIEW_PLAN.md`. This lane changed only the existing
`src/server/model-gateway/voice/project-brain-transcript-review.ts`, added
`test/project-brain-voice-transcript-review-deadline.test.ts`, and adjusted the
single existing transaction-options assertion in
`test/project-brain-voice-transcript-review.test.ts` after explicit controller
authorization. The GET belongs to the separate route author. Native fixtures and
all database runs belong to the controller. No schema/migration, provider,
credentials, network, source discovery, session creation or mobile UI changes.

## Retained failures

- Author observed RED at16:40:32: **2 PASS / 6 FAIL**, eight tests of the actual
  reader with simulated Prisma settlement and canonical synthetic producer rows.
  Protected content was returned after commit-time transcript expiry, original
  abort, already-expired caller context, mutable context signal replacement,
  elapsed local7s budget, and wall rollback. The positive producer result and
  commit-error/no-retry controls passed. These are not independent database tests.
- Controller reported native baseline RED at20:40:19.537Z:
  `evidence/postgres-native-1789072774657`, **12 PASS / 3 FAIL**. Actual successful
  commit followed by database expiry still disclosed under UTC/New_York/Tokyo.
  Cluster stopped, retained. This lane did not launch that run.
- First repair run16:41:40: **76 PASS / 1 FAIL**. All eight new deadline tests
  passed. The existing positive test required exact maxWait2000 although the
  elapsed original budget reduced it to1999. With controller approval the oracle
  now requires Serializable, positive timeout<=5000, positive maxWait<=2000,
  sum<=7000. A new deterministic unconsumed-budget test still requires the exact
  original5000/2000 options. No deadline was relaxed to satisfy the old assertion.
- Separate route peer retained **7 PASS / 1 FAIL** at16:42:26: serialization could
  cross protected expiry while the outer10s route budget remained live. This
  prompted the controller-approved exact-identity publication guard. That peer
  reproduction is not this author's independent reproduction.

## Implemented contract

An optional third `ProjectBrainTranscriptReviewContext` accepts the original
`deadlineAt`, `monotoneDeadlineAt` and `signal`. These references and request IDs
are copied before awaiting. Local budget is at most7s and at most the caller's
remaining wall/monotone budget. No context means the same local7s ceiling. OFF
returns before parsing or consulting context/DB.

Positive bounded transaction options fit the remaining total budget. SQL limits
remain at most2000ms statement and250ms lock, reduced for shorter remaining time.
Checks run before SQL after transaction admission, after each awaited phase and
after actual transaction settlement. Both clocks must be finite and cannot
retreat from their last observed value; original cancellation remains binding.
There is no automatic retry or Promise.race claim of forced Prisma cancellation.

The existing final database clock is copied to a scalar. Its query's monotone
start is sampled before awaiting the query. All query/commit latency is charged
conservatively against the DB-derived remaining expiry. No comparison assumes
application wall time equals database wall time. The SQL ledger joins, shared
lock order, authority inspector, producer fingerprints, strict result grammar,
ordered evidence and public review fingerprint are unchanged.

After known successful commit, the exact frozen public result is registered in a
module-private WeakMap with a closure holding only the original live guard and
DB-derived monotone expiry. The exported synchronous
`assertProjectBrainVoiceTranscriptReviewPublication(value)` accepts only that
registered identity while both guards remain live. Copied/forged/disabled values
and provisional failed-commit results refuse. No wire field or authority token
is added; no strong result registry is maintained. The GET author applies this
guard before and after JSON serialization, in addition to its own original10s
route budget. This is an in-process publication check, not an execution grant.

## Local validation and freeze

-16:43:15: **40/40 PASS** (29 new deadline cases +11 existing boundary cases).
-16:44:24: **109/109 PASS** (40 new author cases +58 existing reader cases +11
  existing independent boundary cases). Covers every await, queue/commit delay,
  short original budgets, clock rollback, immutable original signal/context,
  failed commit, unchanged output/fingerprint, exact map identity and DB/app wall
  offset without trusting wire time.
- Scoped ESLint exit0, no suppression added.
- Frozen reader SHA256:
  `665336638041b4f5a899da599005361fc819822f0ff2c7569b9eb58334ae01a3`.
- TypeScript and independent true-reader/GET parity results are appended after
  completion. Controller owns the subsequent native17 and full validations.

## Limits

The content remains deterministic `SYNTHETIC_LOCAL`, explicitly not speech
transcription, semantic validation or project facts. A refused late response does
not mean the database read never ran internally. No guarantee is made about
downstream network-consumption time, cross-process guards, heap erasure or hard
cancellation of hung external promises. Existing real-ASR/privacy/consent and
source-to-session discovery prerequisites remain unchanged. No activation or real
provider/customer-data test authorization is supplied by this patch.
