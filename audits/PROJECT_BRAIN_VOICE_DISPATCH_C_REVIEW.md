# Project Brain voice C — independent bounded review

2026-09-10. Reviewer read the complete `voice/project-brain-dispatch.ts`, its
canonical `dispatchVoiceGatewayAttempt` integration and author tests. No production
source edit, DB execution or external/native transport by this reviewer.

## Contract observed

C remains OFF/default and local-only. The actor discriminant selects the internal
PB branch at the existing gateway entry; it is not itself authentication. The
branch reloads owner/source/session/manifest, canonical request/policy/privacy,
breakers and held spend under its transaction. The persisted joined predicate
binds PB subject, AI nonce/attempt/lease, operation/decision/attempt and hold.
Raw dates and clocks used for Timestamp(3) writes/comparisons are explicitly UTC.
The session advisory lock precedes its inspector/row lock acquisition.

The initial claim must commit before the second gate can invoke the private
deterministic function. Only three closed synthetic scenarios exist, with no
caller-supplied transport callback. A rejection-handled promise is boxed so the
transaction does not await simulated latency. A third transaction reinspects the
same facts before success writes. Known no-invocation retains the hold and records
cancellation; unknown invocation retains uncertainty. Lost or uncertain initial
commit does not grant cleanup authority or a retry.

The success text says `SYNTHETIC_LOCAL — no speech was transcribed`. Zero settlement
belongs only to this deterministic synthetic function, not measured provider
billing or actual speech-recognition quality. Actual gateway/AI success statuses
therefore do not by themselves establish a real ASR success.

## Reviewer regression oracles

New `test/project-brain-voice-dispatch-review.test.ts` deliberately reuses the
author's fake transactional scaffold and fixture, with four reviewer-authored
oracles against real C/policy code:

- Remove or reduce the cap during the final awaited held lookup: no settlement,
  no transcript, uncertainty and original hold retained.
- Expire privacy during the awaited terminal audit: the proposed success writes
  roll back together and the hold remains retained.
- Mutate caller-reachable actor, AI claim and audio after the first await: only
  the captured original subject/audio can complete.

The author independently saved the cap-before-await and final privacy-fence fix
at 09:41 before these tests were run. Thus these are GREEN regression checks;
**no reviewer-observed RED is claimed for those two timing risks**. The two earlier
actual RED legacy/PB binding defects remain in the separate B review.

09:42:50: C4 + author22 = **26/26 PASS** against the then-private C function.
09:44:06: the reviewer now calls the canonical dispatch entry; C author tests
expanded to26. C4 + author26 + B review3 + legacy24 + migration77 static3 =
**60/60 PASS**. Root TypeScript and scoped reviewer ESLint then passed.

## Verdict and limits

**GREEN bounded source/synthetic review, suitable for parent-controlled native
validation; not native transaction proof or product/live-ASR readiness.** The
fake transaction scaffold serializes callbacks and does not prove PostgreSQL row
locking, schema/enum acceptance, real overlapping process behavior, or cleanup
under actual commit-ack loss. Native tests must retain those distinctions. No
model-quality, provider-cost, customer-data or external-execution claim is made.

## Settlement postcondition delta

Author reported an additional RED at09:54:48: the canonical settlement helper
returns void even when its held-row update changes zero rows. A no-op helper could
therefore previously accompany synthetic_succeeded. This RED is author evidence,
not a separate reviewer reproduction of the old code.

Reviewer read the actual void helper and corrected C. `current` now acquires the
exact held-row UPDATE lock only AFTER the canonical provider/day advisory acquired
by the shared reservation helper; the initial owner join still does not lock h.
After settlement, the same transaction requires the exact id, synthetic provider,
operation key, attempt1, original amount, settled status and settledMicros0 before
attempt/transcript completion. A missing postcondition rolls the transaction back
and retains uncertainty rather than accepting success.

Fresh independent **09:59:44: 31/31 PASS** (author27 + reviewer4). GREEN bounded
delta for parent-controlled native tests; no new PostgreSQL or provider proof by
this reviewer. The native hook25/25 result reported by parent belongs to the SMS
lane and must not be substituted for C's pending native verification.

## Legacy enum binding prerequisite

Parent/author reported C native12 as11 PASS/1 FAIL at the legitimate CLIENT control:
PostgreSQL42804 because legacy session INSERT bound languageHint as text into
VoiceIntakeLanguage. Reviewer read the exact one-token SQL repair
`$3` -> `$3::"VoiceIntakeLanguage"`; actor, consent, budget, dates and every other
parameter remain untouched. The existing raw Date handling in this legacy function
is not certified by that enum-only repair.

The native generic-runner exclusion fixture now makes the PB AI lease genuinely
expired before taking its before-snapshot. A null generic claim can no longer pass
that oracle merely because the lease was still future. Reviewer inspected that
delta without running DB. Enum7 tests freshly passed at10:08:54 within a111-test
run. The old native42804 and author4RED/3controls are not reviewer reproductions.

## Controller native receipt

2026-09-10 14:11:36Z: `postgres-native-1789049425151` ran all16 files on native
PostgreSQL17.11 with77 migrations. C's12/12 PASS, including the real CLIENT
positive-control session after the enum conversion and the expired generic lease.
The complete working-tree run was173 PASS/3 FAIL, NOT a global PASS: recovery
tests used a global queue and counted expired fixtures from preceding files.
Per-file database isolation is the next harness correction; no recovery
production predicate or assertion is weakened. The preceding native11/12
`postgres-native-1789048834534` remains as the actual42804 failure receipt.

This native receipt proves only the fixed synthetic gateway runner and SQL
boundaries. No ASR provider, personal audio, actual transcription, Samsung
execution, hosted rollout or model quality is demonstrated. Protected transcript
review and crash recovery remain separate work. Other uncommitted SMS code in
the all-file snapshot is not certified by this voice checkpoint.
