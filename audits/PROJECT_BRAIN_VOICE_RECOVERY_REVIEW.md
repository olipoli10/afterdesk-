# Project Brain voice recovery — independent review

2026-09-10. First checkpoint is design-only. Read recovery plan, current PB
admission/dispatcher, metadata fingerprint seam, relevant AI/gateway schema and
voice session triggers (legacy plus75). No production edits or DB/provider run.

## Plan verdict

**GREEN for the proposed OFF local module and unit-test implementation.**
This is not a source, concurrency, recovery-run or native test verdict.

The two durable phase pairs carry different knowledge: prepared/not_dispatched
can close as cancelled before dispatch; dispatched/unaccounted remains uncertain.
Neither authorizes retry, hold release, accounting settlement or transcript
creation. Existing transcribing-to-incomplete/uncertain session transitions are
legal. Terminal/cancelled/purged sessions must remain unchanged.

The existing AI schema permits an abandoned row to retain its expired fencing
token/lease for provenance. Status abandoned is not an active claim. This is
deliberately different from the current in-process retain helper, which clears
these fields; generic claim behavior must not change as part of this slice.

The session try-advisory precedes mutable row locks, matching PB admission and
dispatch. Recovery does not take the provider/day advisory or call account
reserve/settle/release. The held-row check comes after lineage locks, so the
proposed recovery does not add a hold-to-provider/day inversion.

## Requirements sent to author before code

- Reinspect historical immutable metadata without the live consent/session
  reader: expired or revoked authority must not prevent evidence-only closure.
  Do not read a file or invent audio bytes for fingerprinting.
- Explicitly exclude pre-existing AI resultKind/resultId; gateway finalAttemptId
  or resultEvidenceRef; attempt responseEvidenceRef, aiUsageId, providerRequestRef
  or evaluated contract; and transcripts linked through either segment or attempt.
  Preserve prior errors/evidence rather than overwriting contradictory outcomes.
- Every mutable terminal write must remain fenced to exact original claim and
  phase; lost CAS/deadline after the last audit must abort the transaction. The
  acknowledged count is not proof of an OS process crash or provider invocation.

Next review: actual module and independently added countertests once the author
declares source stable. Native expiry, overlapping backends and late-dispatch
fencing remain controller-owned future proof, not supplied by this plan review.

## Source and independent test checkpoint

Read the complete project-brain-recovery.ts and50 author tests, including the
last finishedAt/no-result guards. Added test/project-brain-voice-recovery-review.test.ts
with five independent transaction/commit oracles. Fresh **10:38:33:96/96 PASS**:
recovery50, reviewer5, dispatcher27, dispatcher-review4, legacy exclusions10.
Root TypeScript noEmit and reviewer scoped ESLint passed.

The added cases verify whole-batch rollback after a second audit failure;
unknown commit acknowledgement without count/compensation/retry; historical
held period without a new reservation; every AI terminal nonce/UTC lease pin
while preserving forensic fields; and no deadline extension by caller mutation.
These use a staged synthetic transaction model, not actual PostgreSQL commit or
crash execution. No new control-bypass defect was reproduced.

One evidence-label finding was sent and fixed before this checkpoint:
UNKNOWN_AFTER_PROCESS_LOSS inferred a dead process merely from lease expiry.
It is now OUTCOME_NOT_OBSERVED_AFTER_LEASE_EXPIRY. A still-running slow worker can
also lose its lease; neither the marker nor this sweeper proves an OS crash.
The author's new50th test pins this corrected wording; no historical RED test
was claimed for that wording correction.

**GREEN for this bounded local recovery implementation**, pending native SQL,
true competing-backend, terminal-session and late-dispatch validation. It stays
OFF, unwired to a route/worker, with no provider or accounting authority. The
reviewer ran no database, provider or native process.

## Parent schema finding after the unit checkpoint

The parent found that AiUsage's physical FK is operationId, not aiOperationId.
The initial recovery SQL used the latter nonexistent column. This reviewer had
also recommended that wrong name without checking the actual AiUsage schema:
that was a review error. The96-test GREEN above was mocked evidence and failed
to catch a real raw-SQL incompatibility; it must not be read as SQL/native proof.

The author reports a schema-linked RED at10:45:09 (50PASS/1FAIL), then corrected
the source and ORM fixture. Reviewer added a separate schema-derived oracle
checking every quoted lineage column against stored primitive/enum Prisma fields
and the actual migration FK. By its first run the author fix was already on disk,
so this review does not claim its own observed pre-fix RED.

Reinspected source now queries AiUsage.operationId. Fresh independent
10:45:53:57/57 PASS (author51, reviewer6), reviewer ESLint PASS. The new test
also excludes virtual relation-field aliases when checking stored columns.
These strengthen schema consistency, but still cannot replace execution of the
raw SQL and concurrency cases on the native disposable database.

## Native fixture and recorded execution review

Read both complete project-brain-voice-recovery.fixture.ts and the native test
file after the controller run. The fixture uses real source/session/admission
rows and a synthetic byte-map storage adapter. It shortens a lease to a future
200ms value and waits against the database clock, rather than backdating a claim.
The dispatched case writes a clearly test-created durable marker; this is not
a killed-process experiment or proof of an invocation.

Independently read result.json and output.txt in
specs/210-personal-live-activation/evidence/postgres-native-1789051849182:
**11/11 native tests PASS, exit0, finished2026-09-10T14:51:21.161Z**, explicit
PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED,77 migrations in the cloned database.
Controller ran it; reviewer performed read-only verification afterward.

Covered: three transaction-local timezones; prepared/dispatched terminals;
exact late former-owner CAS refusing after abandonment; OFF; two overlapping
distinct backends with bounded rendezvous and only expected serialization losers;
occupied session advisory; revoked membership; actual prior synthetic success;
25-of26 bounded sweep; and the physical AiUsage.operationId exclusion with no
attempt usage FK. Existing source, hold, nonce/lease, history and transcript/usage
evidence are compared, not replaced to clean fixtures.

This closes native SQL execution for the tested recovery cases. It does not
establish real speech recognition, provider execution, operating-system crash
behavior, all terminal-session permutations or production readiness. The late
writer oracle uses the exact persisted short lease in a raw CAS; it is not an
in-flight real provider dispatcher scenario.
