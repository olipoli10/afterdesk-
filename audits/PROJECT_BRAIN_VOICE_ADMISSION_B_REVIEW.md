# PB synthetic admission B — independent review

2026-09-10. Read the new `voice/project-brain-admission.ts`, reservation/CAS helper
and existing dispatcher integration. No production edits or native DB by reviewer.

## Admission inspection

The bounded branch copies actor/IDs/bytes/deadline before awaits; requires OFF/local
gates, explicit synthetic cap and source/owner/session inspection. A session
advisory lock precedes the shared inspector and session UPDATE lock. Policy,
synthetic route and breakers precede AiOperation creation; holds and gateway
bindings are in one Serializable transaction. Fresh-clock privacy and strict
daily-hold reinspection occur before returning prepared_synthetic_not_dispatched.
No callback implementation was added to B. These observations are not native
transaction proof.

## Independently reproduced legacy-boundary defects

1. **09:24:37 one RED**, expanded to two RED at 09:25:43: a clone of a PB admission
   changed request.subject.kind to voice_intake_segment. With rollout OFF, the
   real dispatcher entered legacy cleanup and called release on the PB hold,
   also attempting AI/attempt updates. The mock DB would have returned a persisted
   PB/null-client subject, but no subject lookup happened before cleanup. Both a
   prepared_synthetic_not_dispatched and forged authorized status reproduced it.
   This demonstrates unsafe internal dispatcher behavior under synthetic DB, not
   a public endpoint exploit or a real database mutation.

   Author repair: same-transaction lookup joins exact AI, session/segment,
   gateway/decision/attempt/hold and verifies persisted legacy discriminant/client
   before cleanup. It takes UPDATE on the attempt first (existing legacy order),
   avoiding SHARE-to-UPDATE lock upgrade on mutable rows. Fresh independent
   two-countertest run at 09:27:47 passed.

2. **09:29:36 one new RED / two previous PASS**: the positive legacy branch still
   checked the claimed AiOperation separately from the request's session/segment.
   A forged request substituted another owned CLIENT session while retaining PB
   operation/attempt/hold identity. The real dispatcher called the injected fake
   adapter once. DB, policy resolution and breaker boundaries are synthetic;
   this is not a provider/network observation. The actual AI subject returned
   PB/null-client/its own segment, but the code only tested row count. The missing
   joined predicate must also protect positive dispatch acquisition, not just
   refusal cleanup. Sent to author and parent.

   Author repair independently read: shared `lockLegacyVoiceAdmission` is now
   called both before cleanup CAS and before positive dispatch CAS. Its joined
   predicate binds AI nonce/key/attempt, persisted CLIENT subject/session/segment,
   gateway/decision/attempt/hold, request fingerprint, policy/route hashes, tenant,
   request evidence, output contract and billing provider. The TS boundary also
   checks the selected persisted subject kind and client. Only the attempt gets
   the first UPDATE lock; existing AI lock/CAS follows. No SHARE lock upgrade was
   introduced by this helper.

## Final bounded verdict

**GREEN source + synthetic regression review for B, not C or native DB proof.**
Fresh independent run at **09:36:03: 64/64 PASS**, covering review3, admission24,
claim13 and historical legacy24. The three reviewer fixtures now include the
complete policy/hash/evidence fields and assert the joined query's exact eighteen
bound parameters. This prevents an incomplete fixture from passing solely via an
early structural refusal. No adapter, release or mutation occurs for those forged
persisted PB subjects. Existing legitimate and concurrent legacy controls pass.

The old legacy dispatcher still contains raw `now()` writes to naive DateTime
columns (cleanup/dispatch/terminal). This review does not certify them as UTC-safe
or change them; they were already reported in the gateway-binding UTC inventory.
The PB admission branch's newly added raw Date/clock expressions are explicitly
UTC-naive. A native concurrency run remains parent-owned, and C's execution and
terminal handling require their own review.

Reviewer test: `test/project-brain-voice-admission-review.test.ts`. Existing
historical RED evidence is retained here. No provider calls, live data, migration
execution or production edits were performed by this reviewer.
