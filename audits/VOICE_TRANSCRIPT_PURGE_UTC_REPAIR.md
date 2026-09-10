# Bounded voice transcript purge UTC repair

2026-09-10. Controller-authorized scope: only
`purgeExpiredVoiceIntakeContent` in `voice/transcripts.ts`, focused tests and this
audit. Structured debugging skill used: reproduce, isolate, fix, prevent.
No existing application content was purged. Native execution belongs to the
controller; this lane only authored and read the receipts.

## Reproduction retained

Initial unit run 11:15:21 local: 7 PASS / 1 FAIL, missing explicit UTC conversion
in the actual generated SQL. This alone was not a PostgreSQL behavior proof.

Controller native receipt `evidence/postgres-native-1789053401742`, read in full:
finished 2026-09-10T15:17:00.674Z, exit1, 4 PASS / 2 FAIL, exact server STOPPED.
The three retained old-SQL controls passed. The actual old maintenance function
passed UTC but failed New York (zero rows instead of one) and Tokyo (two rows
instead of one). All 77 migrations applied first. Tests use three session-local
TEMP tables with the exact referenced names and Timestamp(3) types, verify
`pg_temp` resolution, and roll the transaction back. This proves the real SQL
date behavior, not full application FK/trigger or production purge coverage.

For the synthetic instant 2026-09-10T16:00:00Z, one transcript expires at15:00
UTC and another at17:00 UTC. The implicit Date parameter is inferred against
naive columns in the session timezone. New York consequently misses the due
text; Tokyo purges the still-live text too and stores01:00 the following day
instead of16:00 UTC. The global PostgreSQL timezone was not changed to conceal
the defect; each test sets its own transaction-local zone.

Additional unit reproduction 11:17:32: 7 PASS / 2 FAIL. A caller-held Date was
changed from16:00 to23:00 while waiting for transaction acquisition, and the old
function passed23:00 to SQL. This is a same-process mutable input issue, not
proof of an exposed untrusted clock endpoint.

## Fix and prevention

Exactly two production lines changed: copy the Date epoch before the first
await, and normalize both raw SQL `$1` uses with
`($1::timestamptz AT TIME ZONE 'UTC')`. The expiration predicate, terminal-session
predicate, maximum batch, SKIP LOCKED, content-first emptying and idempotence
otherwise remain byte-identical (unit normalization oracle verifies this).
No schema/default/retention/grant or other reader/persist helper changed.

Fresh local 11:18:05: 90/90 PASS (purge9, existing integrity13, R1 author58,
R1 reviewer10). Root TypeScript and scoped production/test ESLint both exit0.
The native fixture preserves its old-SQL controls and unchanged six assertions
for the controller's separate corrected run. Pending until its receipt is read:
do not call a unit pass proof of corrected PostgreSQL behavior.

Peer reviewed the complete native fixture before execution: TEMP namespace,
rollback, real SQL/function delegation and exact timezone oracles. No compiler,
provider, audio, native server or real purge was launched by this lane.
Same-model peer review is code cross-review, not independent model-quality proof.

Adjacent legacy raw Date INSERTs in `persistVoiceTranscriptSegment` remain
reported to controller but intentionally outside this bounded purge patch.

## Corrected native receipt read

Controller rerun `evidence/postgres-native-1789053521315`: 6/6 PASS, exit0,
finished 2026-09-10T15:19:00.399Z, all77 migrations applied, same fingerprint
`77:f072fe1fe84f1d2f87bd61dfc0d642ef`, explicit disposable server STOPPED.
The old SQL controls still show the original timezone divergence, while the
unchanged actual-function oracles now purge exactly the due text once in all
three zones, preserve the future text, and round-trip purgedAt16:00UTC through
both SQL formatting and Prisma Date. Both result.json and output.txt were read.
This closes corrected real-SQL behavior for these synthetic TEMP fixtures;
the retained initial native4PASS/2FAIL is not rewritten or relabeled successful.

Final source cross-review by the OpenRouter lane confirmed the exact two-line
patch: copied Date epoch and both UTC-naive expressions, all other selection,
batch, SKIP LOCKED and atomic purge guards preserved. Controller independently
read the same patch and fixture. This is peer code review, not an independent
model-quality or speech-transcription validation.
