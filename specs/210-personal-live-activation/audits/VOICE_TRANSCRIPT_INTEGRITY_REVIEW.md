# Voice transcript integrity and actor binding — independent review

2026-09-10. Scope: transcript assembly/read fixes, subsequent explicitly authorized persistence snapshot and five Server Action argument guards. Production changes belong to the parent; reviewer added only tests and this note.

## Reproduction and closure

At 04:36 local runtime clock, 11 integrity controls passed and six independent regressions failed:

- Five real Server Action functions, with authenticated-user and downstream-runtime mocks, passed an injected `actor` instead of the authenticated CLIENT. The old `{ actor: authenticated, ...input }` ordering let the extra serialized property overwrite that identity. This was an executable unit reproduction, not an observed public exploit. The real runtime is explicitly OFF; an additional test calls the actual runtime and observes `disabled`, no transcript.
- During the real `persistVoiceTranscriptSegment` function's awaited synthetic authorization query, mutating caller-owned text caused the subsequent captured INSERT to contain changed text with the original text fingerprint. No actual database write was executed.

The parent replaced each action's spread with an explicit allowlist and an authenticated actor. The persistence function now snapshots actor primitives, IDs, text, reported usage/cost and a private Date before awaiting authorization. The reviewer reread all deltas and reran the original failures.

Assembly and protected read recompute the canonical string fingerprint rather than trusting the stored value. Assembly also rejects malformed audio fingerprints. No normalization of accents, supplementary characters, whitespace or newline evidence is introduced. Corrupt text cannot progress through assembly to the consumer's later `ready` outcome; the portal fills its composer only on a successful runtime result and does not auto-send the transcript.

## Current evidence

26/26 independent tests PASS at 04:42 local runtime clock. Earlier combined run with assembly and portal runtime tests was 33/33 before adding the actual-OFF-runtime control. Tests cover original RED cases, exact allowed action fields, dropped privileged extras, auth refusal, legitimate calls, mutation of IDs/actor/Date/usage/cost, Unicode/whitespace hashes, maximum length, changed evidence, ownership, expiry and purge. Final root TypeScript and scoped lint passed after the OFF-runtime control was added.

No live session, provider, real user data, deployed endpoint, SQL migration, changed actor policy, provider activation or external action was involved. Database/client mocks and the known OFF runtime are not proof of live cross-account exploitability or provider transcription correctness.
