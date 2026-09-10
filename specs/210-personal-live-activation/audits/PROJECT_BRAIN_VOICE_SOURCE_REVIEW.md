# Independent review: local Project Brain voice source and synthetic manifest

Date: 2026-09-10. Reviewer lane: personal_gateway_subject.

## Scope and verdict

Reviewed `voice/project-brain-subject.ts`, `voice/source-segments.ts`, and the internal-reader extraction in `construction-operating-assistant-r36v/project-brain-intake.ts`. The resolver's existing membership, workspace and byte-reader dependencies were also inspected. No production file was changed by this reviewer.

No actionable critical defect found within this OFF-default, non-authorizing local preparation contract. This is not media-decoder validation, model admission, a tenancy migration, consent or a provider test. The resolver accepts an actor identifier only from an authenticated internal server caller; this review does not create a public caller or authenticate an HTTP request.

## Checks

- The resolver loads the current owner/member, workspace, project, intake and source/file association before reading. It recomputes the actual bytes' hash and compares a freshly loaded subject fingerprint after reading. Tests reject changed revisions, owner, intake version, file association, purge/submission binding and changed content metadata.
- The copied output buffer remains mutable by JavaScript design. The next local manifest inspector hashes the bytes again; mutation between the resolver and manifest inspection is refused. Persisted metadata is detached and frozen, with no mutable byte buffer included in the manifest.
- Initial resolver and final resolver loads surround the real existing internal byte reader. That reader preserves its own two authorization checks without inventing a public `download` audit. The public wrapper still records exactly one download after its checks.
- Subject and manifest results carry no invented Client/Task/session or grant identity. `executionAuthorized` and `externalTransportPerformed` remain false.
- Segment ordinals, contiguous timing, exact tail coverage, hashes and MIME/format agreement are checked. Array traversal is bounded before schema traversal. Transformer mode is exactly `SYNTHETIC_LOCAL`; `mediaDecodingVerified` stays false even for a self-consistent manifest. Unrelated synthetic segment content is not misrepresented as an observed derivation from source audio.

## Independent proof and limits

Added `test/project-brain-voice-source-review.test.ts`: 22 tests passed in a fresh run. Unlike tests mocking the internal reader, these execute the real resolver, real extracted byte reader and real manifest inspector together, with synthetic Prisma/storage/membership dependencies. Positive public-audit and successful local-resolution controls are included.

These tests do not establish real PostgreSQL isolation/locking, actual filesystem race resistance, media decoding, Samsung behavior or provider execution. Read-time snapshots are local preparation facts, not authority for a future delayed dispatch; any persistence/admission lane must independently reload its subject and enforce its own authority checks. No PostgreSQL process, model call, credential, deployment or production source edit was performed by this reviewer.
