# Incoming temporal SMS — initial independent design review

2026-09-10. Read SMS_TEMPORAL_INCOMING_ROUTER_PLAN.md and the current SMS worker,
canonical temporal authority and existing question/consumer seams. This first
checkpoint is design only; classifier/lower implementation review remains pending.

**GREEN for bounded OFF classifier/lower implementation**, with no new calendar
action authority. Reserved calendar-confirmation wording keeps unconditional
priority. The exact whole-message calendar-day read stays independent; unrelated
commands must not burn a temporal rejection attempt. Active temporal context uses
a fixed non-consuming reply for unrelated commands, not an automatic model
fallback. Only a closed time-shaped answer may enter the existing consumer.

Reservation inspection must survive processing switches being OFF. Lookup failure
is not absence, foreign/ambiguous context cannot expose someone else's question,
and no active question plus a bare explicit hour gets a deterministic missing-
context answer. The existing namespace must precede source/question locks.

Receipt/question transition/source completion and exact self-acknowledgment belong
to one transaction. A successful handled result cannot fall through to another
source CAS or interpreter. Ambiguous or accepted correlation remains evidence,
not a calendar draft, Google execution or user approval. The future durable
two-source gateway subject is explicitly outside this routing slice.

## Calendar-day grammar extraction

Compared the complete old smsCalendarDay function from Git HEAD in sms-worker.ts
with the new sms-calendar-routing.ts body by exact string equality, not visual
approximation: SMS_CALENDAR_DAY_EXACT_FUNCTION_IDENTITY_PASS. Worker import and
re-export preserve the existing API. Fresh10:42:55:25/25 PASS (worker4,
question-preparation15, worker-review6). No source edits by this reviewer and no
calendar/provider calls. No grammar expansion is certified by this extraction.

## Shared time-literal classifier

Reviewed the additive classifySmsTemporalTimeLiteral export and the old private
parser's delegation. Original trim, whitespace normalization, two regexes and
numeric bounds remain unchanged. The private wrapper retains its original two
error codes and hour/minute return shape; the routing export distinguishes a
nonliteral sentence from an ambiguous/invalid but time-shaped literal.

Added test/sms-temporal-time-literal-review.test.ts: exhaustive20000 two-digit
colon/French-minute combinations (2160 exact;17840 ambiguous/invalid), exact
numeric values retained, plus sentence/quoted/multi-command nonliteral controls.
Fresh10:46:53:113/113 PASS (38 classifier,58 correlator,15 earlier review,
2 new reviewer cases). Root TypeScript and reviewer lint passed10:47.

Classifier GREEN as a closed lexical discriminator only. It deliberately does
not recognize every way to express a time and does not authorize consumption,
calendar access or execution. Incoming lower/worker routing still needs its own
source/transaction and native proof.

## Standalone reply lower: independent RED then repair

Read complete sms-temporal-reply-worker.ts, its dedicated plan and39 author
cases. The router reloads the exact claimed inbound envelope before inspecting
the shared namespace; only the existing consumer owns question/receipt/source
completion. The acknowledgment is self-only, exact text/hash and inserted in the
same transaction. Fixed and dedicated bypass results do not claim source completion.

**Independent10:56:00:1RED/6controls PASS.** An active CALENDAR_CONFIRMATION
ledger plus a complete nonliteral command returned NOT_TEMPORAL_CONTEXT, which
could permit an interpreter fallback without validating that calendar context.
The controller selected a conservative rule: after reserved wording and the
independent day-read bypass, every other message while CAL context is active gets
fixed OTHER_CONTEXT, without consumption or model fallback. This does not add a
new calendar-authority reader or a cancel/new-task grammar.

The author changed that branch accordingly. Reinspected the branch and ran
**10:56:54:86/86 PASS** (lower39, independent lower7, classifier38, classifier-review2).
Six reviewer controls preserve reserved/day bypasses, whole-transaction rollback
on acknowledgment failure or late flag withdrawal, propagation of an unknown
commit acknowledgement without retry, and exact Unicode acknowledgment text/hash.
The staged transaction model does not itself prove PostgreSQL atomicity.

**GREEN for the bounded standalone lower after this repair.** Its integration
into the main SMS worker is not covered here. Future integration must handle the
explicit result discriminant, not generic truthiness or committed:true, and must
not run a second source CAS/model after a handled result. Fixed responses still
need the existing worker's authenticated self-reply finalization. No calendar
draft, provider action or user approval is created by this lower.
