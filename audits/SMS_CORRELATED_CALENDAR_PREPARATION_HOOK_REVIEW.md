# Completed SMS → bounded local calendar preparation helper

2026-09-10. Author implementation and tests; peer cross-review pending. No worker
wiring, schema/migration, provider, production activation or native DB run by this
lane. Existing source/receipt/ACK completion precedes this helper transaction.

## Implemented contract

New `src/server/personal-assistant/sms-correlated-calendar-preparation-hook.ts`
exports `prepareCorrelatedCalendarAfterCommittedSms`. It accepts only the captured
initial enablement, claim identity, original source request hash, exact known
handled/committed result, original deadline and cancellation signal. A REFUSED
result or initial OFF never calls the producer. No arbitrary draft/receipt text,
new source lease, model call, source CAS, ACK update, transport or retry is added.

One separate SERIALIZABLE transaction is capped at the smaller of the remaining
original budget and five seconds. The existing temporal transaction setup runs
before the first SELECT. Initial discovery is scoped and unlocked; the actual
unchanged producer InTransaction then obtains canonical namespace-first authority
locks. A final receipt/source/ACK lookup uses FOR SHARE after that producer, checks
the same immutable snapshot and current deadline/flags before commit. No nested
transaction or source-row lock ahead of the canonical namespace is introduced.

The reply table is `PersonalSmsTemporalClarificationReply`, not a table named
Receipt. The first source draft used that wrong table name; direct schema/store
inspection corrected it before any test or database execution. A schema-to-SQL
regression now checks the physical model name and all selected receipt fields.
The old claim lease is matched exactly after ISO normalization but never required
live: the source must already be completed, attempts=1, lease=NULL. Its original
wire hash/idempotency, result receipt/packet pins and false-authority flags are
checked. The exact ACK ID/scope/account/idempotency/request and original wire-order
hash must match the persisted source result text. ACK status is deliberately not
required pending: this helper neither claims delivery nor interferes with drain.

## Outcomes and failure limits

- SKIPPED: initial/current feature ineligible or known refused consumption.
- UNAVAILABLE: invalid binding/control or failure before entering the producer;
  this helper has performed no write.
- OUTCOME_UNKNOWN: any generic transaction/producer exception after producer
  entry. Even where a normal callback throw would roll back, generic Prisma
  rejection does not prove that acknowledgment; this conservative label never
  triggers an automatic retry or source rewrite.
- COMMITTED: transaction resolution acknowledged. If local deadline/abort/flags
  changed while commit returned, that fact remains COMMITTED with
  expiredNotActionable=true. Its false value is not a postcommit TTL certificate:
  all outcomes retain actionable=false/freshnessVerified=false and no authority.

These results are internal metadata without draft, calendar operation ID, request
hash or errors/secrets. Worker integration still requires the separately reviewed
known-source-completion latch across both deadline catches. No detached scheduling
or recovery scanner is implemented. Missing review after interruption remains
unavailable, never an invitation to retry.

## Recorded local verification

- First new suite: **63/63 PASS**, 2026-09-10 13:10:23 America/Toronto.
- Expanded helper + actual lower's tests + producer boundary suite: **120/120
  PASS**, 13:11:59. Final helper adds explicit non-actionable/freshness flags.
- Scoped ESLint for helper/new test and root TypeScript completed exit 0.
- Tests use mocked transaction/producer, but the real existing source-envelope
  checker, claim parser and transaction-timeout setup. They verify invocation
  order, exact SQL parameters, physical schema, malformed/mutated scope/hash/ACK,
  no effect calls, missing/duplicate rows, old lease pins, original budget,
  canceled/disabled controls, producer/commit failures and known late commit.
- This is not native SQL validation, actual producer integration, worker timer
  proof, real SMS delivery or calendar execution. Parent owns those next gates.

The code-review skill guided schema/effect/order checks; it did not supply a
separate model-quality or runtime-isolation proof.
