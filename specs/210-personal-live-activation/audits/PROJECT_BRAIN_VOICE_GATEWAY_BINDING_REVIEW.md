# Project Brain voice typed gateway binding — independent review

2026-09-10. Reviewed `model-gateway/types.ts`, `privacy.ts`, `operations.ts`, the 41 new binding tests, and the proposed typed-admission plan. No production edits, route/policy publication, reservations, database, provider or native execution by reviewer.

Verdict: GREEN for the bounded metadata/type/ledger-binding delta. This is not admission or dispatch authority. The next admission step requires the conditions below before implementation.

## Reviewed current delta

- The existing voice operation type and protected-content reference remain in use. Project Brain adds an explicit subject discriminant and actor/workspace/project/intake/source/session/segment/hash pins; it does not fabricate a Task or CLIENT.
- The legacy request fingerprint keeps its original exact minimum projection. Project Brain fingerprints include the separate strict subject. A legacy fingerprint cannot bind a Project Brain row.
- Both operation binding and attempt creation reload the existing AiOperation/session/segment linkage with row locks and reconstruct Project Brain metadata fingerprints. Legacy rows require the original client tenant and NULL Project Brain fields. Purpose, fake Task/personal link, tenant and subject mixtures are refused before writes.
- Fresh targeted rerun: 70/70 PASS (41 new binding tests plus legacy projection/subject/claim-revalidation suites), 04:45 local runtime clock. This is independent source inspection and rerun of the author tests, not 70 new reviewer-authored tests or native constraint proof.

## Required admission sequence

1. Current authenticated owner/source/session/manifest inspection and exact byte verification; policy, synthetic route, privacy, breaker and all cost bounds before creating an AiOperation. A type discriminant or local consent does not permit provider processing.
2. One transaction with a documented lock order and no transport: immutable subject binding, canonical session/account exposure, existing ledger operation, and PB-only `reserved/attempts=0` to `running/attempts=1` CAS. No lease reclaim or fallback retry.
3. Exclude Project Brain rows from the generic retrying claim **and** generic Task terminal/usage paths. `ai-operations.ts` currently excludes the personal-intent purpose, not Project Brain voice, from `failAiOperation` and `recordSupersededUsage`. The latter can otherwise produce Task/Anthropic-shaped accounting. Inspect the persisted subject; a caller-supplied purpose is insufficient. The existing voice terminal path remains the intended ledger path.
4. Before actual use, privately snapshot and rehash audio bytes. Existing `voice/projection.ts` stores the caller's Uint8Array reference, and existing voice dispatch compares metadata fingerprints but does not rehash that array before the adapter call. Freezing the enclosing object does not freeze the bytes. Treat this as a prerequisite, not existing byte-immutability proof.
5. Absolute deadline, exact attempt/lease/subject/route/budget reinspection after latency, durable dispatch marker and one terminal owner. Unknown dispatch/commit outcome keeps exposure and cannot be automatically retried or released.

## UTC-naive SQL inventory for the next reused voice path

No new timestamp write was introduced by the reviewed metadata binding. Shared `model-gateway/operations.ts` clock writes already use explicit UTC-naive conversion.

Before Project Brain calls existing voice paths, normalize the actual reused Timestamp(3) expressions, without changing instant-return SELECTs or globally setting test timezone:

- `voice/operations.ts:67`: AiOperation creation uses raw Date `$4` for createdAt/updatedAt.
- `voice/dispatch.ts`: close/refusal/claim cleanup branches (125,131,142,271,275,286,301,326), dispatch markers (450,474), uncertain/failure/terminal branches (514–634) write unconverted `now()`; final transcript INSERT also passes raw Date `$9` for expiresAt. These must be reviewed by branch rather than mechanically treating all dates as instants.
- `voice/transcripts.ts:76`: expiry/creation Date parameters `$9/$10`; purge at 146 compares and assigns raw `$1`. If those shared paths are adopted, their UTC handling belongs in the same reviewed scope.
- Existing `voice/sessions.ts` lifecycle helpers also use raw Date parameters. They remain CLIENT-only; any chosen shared lifecycle transition must be inventoried and corrected when actually adopted, not silently enabled for PB.

The source/session unique does not replace one-attempt fencing. Metadata matching does not authenticate a current user, validate source decoding, settle spend, or authorize real transport. Native concurrency, rollback, UTC/New_York/Tokyo and no-retry tests remain parent-owned prerequisites.
