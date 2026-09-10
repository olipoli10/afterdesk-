# R1 protected Project Brain synthetic transcript reader — independent review

2026-09-10. Reviewer `/root/personal_gateway_subject` read the complete
`ASR_PROJECT_BRAIN_TRANSCRIPT_REVIEW_PLAN.md` and new reader, then inspected
the canonical source/session inspector, actual synthetic C producer, assembly,
privacy helper, route registry and physical Prisma models. Scope is R1 server
only. No R2, route, mobile, migration, database run, provider or audio invocation.

## Bounded verdict

GREEN for reviewed code and local synthetic oracles. Native joins, Decimal
conversion, timezones and read/revoke/purge contention remain controller-run
verification gates; passing mocks do not prove these. No critical R1 defect
was reproduced in this review.

Actor IDs are strictly copied before any await; OFF returns without parsing or
DB. Shared canonical session advisory precedes the existing current-source
inspector and result row locks. Owner/member/source/intake/consent/manifest
checks are delegated to that inspector, not replaced with a fake CLIENT. The
SQL retains PB discriminator, NULL legacy/personal subjects, exact AI result,
gateway final attempt, decision/policy/route and transcript links, settled
synthetic hold zero, and no `AiUsage.operationId` contradiction. Every quoted
SQL reference for eleven aliases was checked against actual scalar fields and
their possible Prisma maps, rather than assuming relation field names.

Producer request/output and response fingerprints are reconstructed; protected
text is rehashed exactly and must equal the private runner's synthetic message.
This is not a general transcription loader. The route's stored canonical hash
is tied to the historical decision; adapter/provider/intermediary match the
actual C producer guard. This reader does not renew current route execution
permission or claim that a retired policy authorizes another model call.

The producer writes transcript expiry equal to its session; the reader requires
that exact equality, so it does not extend a shorter expiry. Final real DB clock
is monotonic against the inspector clock and strictly before expiry. Current
source/result locks remain held until commit; no returned text before commit
success, no retries or domain writes. Assembly and review objects retain exact
immutable text/hash evidence and false quality/fact/execution labels.

The additive privacy helper returns a string hash of the private output
contract. It neither returns that object's nested references nor changes the
legacy builder fingerprint. No new mutable contract object is exported.

## Independent tests and receipts

New `test/project-brain-voice-transcript-review-boundary.test.ts` has ten cases:
physical columns, result-row mutation during final awaited clock cannot change
the already-copied result, four invalid SQL duration shapes refuse, unexpected
raw storage fields refuse, session cost ceiling, final clock error/no retry,
and nonliteral truthy enable remains OFF. Author's 58 plus reviewer's 10:
68/68 PASS at 11:10:12 local. Root TypeScript and scoped ESLint both exit0.
All are mocked DB/canonical inspector or static tests, not new native evidence.

## Adjacent issue reported separately, not a R1 regression

While tracing purge overlap, `voice/transcripts.ts` lines145-147 still used
raw Date `$1` both against `expiresAt` and to assign `purgedAt`, without the
explicit UTC-naive conversion required by existing Timestamp(3) storage.
The earlier native UTC repair campaign already demonstrated this inference
hazard in New York/Tokyo. This turn did not execute that purge against PG,
and R1 never invokes it. Reported to controller for an independently bounded
reproduction/correction before interpreting purge timing tests. No source edit
or claim of a new observed native failure by this reviewer.

Protected-read readiness does not imply an HTTP endpoint or a real speech
transcription service. R2 fact proposal/retention and route/mobile work remain
outside this reviewed slice.

## Native failure supersedes the initial mock-only GREEN

Controller receipt `evidence/postgres-native-1789053596395`, result/output read:
12 tests, 3 PASS / 9 FAIL, exit1, finished2026-09-10T15:20:18.342Z, exact server
STOPPED. The first shared advisory SELECT returns PostgreSQL `void`, which
Prisma queryRaw cannot deserialize. Earlier unit/static review—including this
reviewer's physical-column checks—missed that return-type incompatibility.
No current native R1 success is claimed. The three passing broad-refusal tests
can pass on this unrelated infrastructure error and are being strengthened by
the author to require intended refusal codes before the next run.

Requested native test improvement separately: put the two-reader rendezvous
after each complete read callback but before its transaction commits, so both
readers demonstrably retain their shared locks together. The earlier barrier
before work proved two simultaneous backends, not shared-lock coexistence.
This is an oracle improvement, not a reproduced product locking failure.

## Cast/oracle correction re-reviewed

Independent shape test added before the correction: 11:22:05 local,
10 PASS / 1 FAIL, queryRaw advisory expression lacked the supported text cast.
Author changed only the returned advisory type to `::text`, preserving the
shared lock and namespace. Re-read that source and strengthened native fixture:
two callbacks now complete before either releases its shared locks, exact
completedUnderLocks=2, distinct PIDs, !timeout, and allSettled prevents leaked
pending reads; broad negative cases now require their intended refusal codes.

Fresh 11:23:07 reviewer run: 78/78 PASS (R1 author58+reviewer11, purge9).
Code/oracle delta is GREEN for the next controller native run. This does not
erase the initial9 native failures or manufacture an already-passing rerun.

## Corrected native evidence

Read controller result/output `evidence/postgres-native-1789053808936`:
12/12 PASS, exit0, finished2026-09-10T15:23:59.112Z and exact disposable server
STOPPED. These are real application synthetic gateway/session/transcript rows,
not the separate purge TEMP-table fixture. The suite verifies three transaction
timezones and Decimal duration conversion, exact unchanged repeat reads, owner
and epoch refusal, immutable/purged content, actual8s expiry, two completed
read callbacks holding locks together, and a current-owner read blocking
revocation until its transaction commits with the following read refused.
This closes the corrected R1 server native slice. It remains synthetic-only:
no speech recognition, HTTP/UI endpoint, R2 fact admission or provider proof.
