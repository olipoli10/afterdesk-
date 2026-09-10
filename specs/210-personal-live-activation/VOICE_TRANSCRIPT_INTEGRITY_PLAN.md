# Transcript integrity — bounded local correction

2026-09-10. The existing voice assembly and protected transcript reader return
text with a stored textFingerprint without recomputing the text hash. The
existing producer computes canonicalFingerprint(text); consumers must verify
that same contract before displaying or assembling text.

1. Reproduce changed text with an unchanged valid fingerprint in both consumers.
   Use injected synthetic rows and the actual pure assembly/reader functions.
2. Add exact hash verification at both read boundaries, keeping existing owner,
   expiry, cancellation, count, ordering and size checks. No text normalization,
   model call, source rewrite, or weaker evidence/approval check.
3. Correct old unit fixtures that used decorative, non-derived fingerprints;
   preserve their behavioral assertions and record why the fixtures change.
4. Peer-review the two consumers, regressions, and unchanged assembly fingerprint
   shape. Validate typecheck, focused tests and affected legacy runtime tests.

Scope excludes SQL timestamps, permissions, gateway subjects, ASR dispatch and
semantic verification. A matching hash demonstrates internal text consistency,
not that a transcript accurately describes audio or can authorize an action.

Reproduction at04:32:57 local: two failures/one control pass. Assembly returned
altered text with the original fingerprint, and protected read resolved the
altered text instead of rejecting. Fixtures contain only synthetic sentences.
Both consumers now recompute the canonical text fingerprint; old decorative
hash fixtures are replaced by actual derived hashes, with original assertions
unchanged. Assembly also rejects malformed audio evidence, without claiming to
read or verify the original audio bytes. Validation/review follows separately.

## Adjacent reproduced entry-point and producer defects

Peer reproduction at04:36:03: 11 integrity/control tests passed; five actual
Server Action exports forwarded an injected extra actor over the authenticated
client, and one producer test inserted mutated text with its pre-await hash.
The runtime was mocked for the action tests, remains hard OFF, and no public
cross-client exploitation or provider dispatch was observed.

Bounded correction: explicitly select the allowed fields in all five voice
Server Actions and derive actor only from requireRole. Do not spread serialized
caller properties. Capture producer identity, IDs, text, timing and cost
primitives before the first await; authorize, hash, insert and check replay
against those same captured values. Preserve runtime gates, APIs and SQL shape.
Peer keeps the six original failures, adds exact field/control coverage and
reviews the corrections. These local fixes do not activate a permission,
provider, microphone, billing, deployment or new founder session.

Controller focused run04:41:21:59/59 across seven affected files PASS.
Subsequent peer expansion:26/26 independent regressions, TypeScript and scoped
lint PASS; audit VOICE_TRANSCRIPT_INTEGRITY_REVIEW.md records the original six
RED outcomes and verifies exact allowed fields, genuine runtime OFF, snapshots,
and unchanged legitimate behavior. Full-root revalidation remains a separate
later campaign receipt; no live endpoint exploit or ASR quality is claimed.
