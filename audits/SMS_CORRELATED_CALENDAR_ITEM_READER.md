# Single correlated-calendar item reader — local implementation

2026-09-10. Own scope: new `correlated-calendar-projection.ts`, its targeted test file and this audit. No producer/receipt-loader/schema/migration/route/collection change. Full `SMS_CORRELATED_MOBILE_REVIEW_PLAN.md`, including the technical addendum, was read before implementation.

## Implemented contract

- Explicit caller opt-in and exact `ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED=true`, with the unchanged STORE/pilot/current-authority gates. PREPARE activation is not required to read.
- One review id and copied authenticated actor; maximum five-second original deadline/signal. Caller must be a SERIALIZABLE transaction. Isolation and statement/lock timeouts are configured **before discovery**.
- Scoped discovery contains only receipt id and takes no review/calendar lock. The real unchanged receipt loader acquires canonical namespace/question/receipt/current-source-authority locks. Only then does the reader lock the exact relation, then the actual calendar operation and its globally joined relation FOR SHARE.
- Every relation scalar, compact proof and hash, reconstructed six-field request/hash, canonical receipt UUID, marker, account/version, null model origins and no-budget pins must match. Current status has the closed pending/processing/completed/uncertain/refused set. No preparer/producer invocation on any branch.
- Final finite DB time is monotonic, preparation cannot precede the reply or be in the future, and the original question/pilot expiry remains in force. The existing loader deliberately refuses expired/revoked history; no old clock or renewed window is supplied.
- Exact DTO under `review`, version `personal-correlated-calendar-review-v1`; literal read-only/false approval/execution/semantic flags. Exact two full SMS texts, UTF-16 quotes and source hashes, original anchor, START/END slot and draft map to the existing local-preview envelope. Provenance is always UNKNOWN. No calendar operation id or approval hash is exposed.
- The internal envelope reports `committed:false`. Only the wrapper reports true after its bounded SERIALIZABLE transaction completes and final gates pass. Unknown commit acknowledgment throws without retries. All returned nested objects are frozen private values.

Source SHA256 at freeze:
`6c88bf836f350ebd1b61c39ea7d3492301216a2339aaadf1b957fcd0e87bb51b`.

## Reproduction and local tests

Parent review found that initial discovery preceded `temporalRegistryTransaction`; a caller's longer transaction could therefore leave that first table SELECT without the intended statement/lock timeout. A mock-boundary regression at **12:36:23** failed (1 RED, 54 skipped). Since the mocked loader bypassed its own existing later isolation check, this is not evidence that the real loader accepted a nonserializable transaction, nor a real DDL-lock reproduction. The precise defect was ordering before first discovery.

Fix: call the existing isolation/timeouts helper and the live gate before discovery. No namespace/calendar lock was added by the setup. Explicit tests now cover rejected isolation and deadline expiration during timeout setup before any discovery.

- 56/56 author tests passed 12:36:48 after the fix.
- Expanded six-file suite passed **147/147** at 12:37:31 (before three additive cases).
- Final new suite **59/59 PASS** at 12:39:34, including copied Date epochs, original cancellation signal, foreign loader actor and real mobile strict-parser compatibility of the emitted item. The internal committed envelope is intentionally rejected by that mobile parser.
- Scoped source/test ESLint passed with no warnings both before and after the final additive test cases; no full-root or generation was run by this lane.

Most reader tests mock DB/subject loading but build the pure proof with the actual durable inspector and check actual emitted SELECT shapes/parameters. They are not by themselves SQL, rollback, lock-contention or provider evidence. Effect spies remain zero; no privileged side effect is claimed to be blocked by an OS sandbox.

## Parent native result, read by this lane

Read `evidence/postgres-native-1789058247735/result.json`, output and all seven new reader cases plus their actual answered-question/preparation helper. **92/92 PASS**, exit 0, finished **2026-09-10T16:38:32.583Z**, exact disposable server reported STOPPED. This is the parent's run, not this lane's execution.

Seven new cases cover UTC/New_York/Tokyo exact sources/citations/draft/naive-time reads, missing/OFF/foreign-owner refusal, real short expiry without renewing saved provenance, current Google revocation, and a deliberately synthetic uncertain status displayed as uncertain. The uncertain state was explicitly written by the fixture to test display, not observed as a provider outcome. Preparation is real and committed under migration78; accepted SMS facts come through the actual outbox/worker with an injected HTTP response, not fabricated completed-source phases. No additional transport call occurs during the read.

The old 85 cases and the seven new ones sharing this native suite must not be called 92 new reader tests. The current native batch does not yet supply a dedicated DDL-lock-before-discovery or item-specific two-reader/late-revocation barrier proof. Peer review and parent control decide any further local integration. No route, collection, permission activation, Samsung proof, real Google insertion or provider authorization follows.

## Peer cross-review completed

OpenRouter lane reports bounded GREEN after full source/test reading and 12 distinct counter-tests: **71/71 PASS** including this lane's 59, at 12:40:48; TypeScript/scoped lint PASS. See `SMS_CORRELATED_CALENDAR_PROJECTION_REVIEW.md`. Tests include mutation of all three stored Date values and source/status objects during the final clock without altering the detached response. The peer retains its own initial fixture-oracle failure as a test error, not a production RED. This is cross-review within the same-model campaign, not independent model-quality certification. No peer source edit or DB run was needed.
