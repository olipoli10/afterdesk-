# Voice projection ownership and PB admission plan — independent review

Date: 2026-09-10. Scope: local static review and synthetic unit execution only.

## Projection verdict

GREEN for the bounded change in `src/server/model-gateway/voice/projection.ts`.
The builder copies the exact bounded Uint8Array before hashing. Buffer and subarray
inputs no longer retain writable aliases into the stored projection. The new
point-of-use helper copies again and verifies hash, length, operation type and
canonical MIME before returning that private copy.

Fresh independent execution at 04:52:57: **52/52 PASS** across
`voice-projection-byte-ownership.test.ts`, `model-gateway-voice-projection.test.ts`
and `project-brain-voice-gateway-binding.test.ts`. These are the existing author's
tests independently rerun, not 52 newly authored countertests. The original three
RED ownership cases were observed by the author at 04:47:51, not rerun against old
source by this reviewer.

The returned byte array remains mutable. The helper is not yet connected to the
dispatcher. Adoption requires copying/rehashing immediately before the trusted
adapter receives bytes, without an intervening await or exposure of that new
copy to a holder of the earlier admission object. This does not grant ownership,
consent, provider authorization, or semantic validity by itself.

## Admission plan review

Read the complete `ASR_PROJECT_BRAIN_SYNTHETIC_ADMISSION_PLAN.md` and the current
canonical account-spend, voice reservation, synthetic adapter and dispatch helpers.
The planned same-gateway, policy-before-reservation, one-attempt CAS, current
authority reinspection and UTC-naive repair are coherent. No admission code or
native SQL was executed in this review.

Three implementation requirements were returned to the author and parent:

1. An explicit synthetic environment ceiling alone is insufficient. The shared
   helper currently restricts positive/type validation and strict existing-held
   replay checks to OpenRouter. Synthetic must also reject changed amount/day,
   missing or withdrawn ceiling, and excess current held-plus-settled exposure.
   An old hold is exposure, not fresh dispatch authorization.
2. The current synthetic adapter factory accepts an arbitrary injected callback.
   Branding that factory result cannot prove that callback has no network side
   effects. The bounded runner should construct a private deterministic adapter,
   or retain an explicit trusted-harness-only claim without calling it a sandbox.
   A caller-modifiable string key is not a sufficient admission predicate.
3. A committed dispatch claim followed by no callback requires an exact
   not-dispatched, non-retry terminal with retained exposure. Do not reuse the
   legacy close/refusal paths that release holds or place an operation into a
   retryable failed state. After a callback or unknown commit acknowledgment,
   preserve uncertainty and do not call again.

The earlier gateway-binding review retains the exact raw Timestamp(3) inventory
and the requirement to exclude PB subjects from generic claim/succeed/fail and
superseded Task/Anthropic usage paths. This review does not certify those future
changes before implementation and native tests.

No provider, personal data, credential, deployment, migration or live DB access.

### Plan follow-up

The author incorporated the three requirements into the plan and section 7;
that delta was read again. The injected callback is explicitly trusted-harness
only, not a network sandbox. The known no-callback terminal now distinguishes
attempt cancelled/not-dispatched, gateway refused, AI abandoned and a permanently
non-reclaimable segment, while retaining the hold. A proposed opt-in strict-ceiling
parameter on the shared helper remains subject to parent ownership approval.
These are design decisions, not verification of an implementation yet.

## Adjacent read-only proof extraction

The new `personal-intent/review-proof.ts` and the consumer delegation diff were
read in preparation for registry76 review. The previous query, validations and
call order are preserved; the new helper does not prepare calendar/outbox drafts.
Fresh independent execution at 04:55:30: **73/73 PASS** across existing consumer,
projection, JSONB projection and review-route tests. This does not certify the
unfinished SMS registry or its deferred SQL guards. The extracted existing
`CURRENT_TIMESTAMP`/`now()` retain transaction-start semantics; the future caller
must not describe them as a new point-of-use deadline check.
