# Project Brain voice GET — original disclosure deadline

Date: 2026-09-10. Author: personal_gateway_subject. Authority: controller addendum 20:37Z in `ASR_PROJECT_BRAIN_TRANSCRIPT_REVIEW_PLAN.md`.

## Scope and method

Only the existing `src/app/api/endvera/v1/mobile/project-brain-intake/voice-review/route.ts`, a new focused test, three legacy signature assertions, and this audit were changed by this author. The reader's independent deadline/expiry repair belongs to openrouter_disabled_adapter. No new API, session, discovery, mobile UI, provider, schema, dependency, generated client or migration is included.

The engineering debug skill required reproduction before correction. The Next.js skill and its route-handler, async and runtime references, plus the complete installed `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, were read before editing. The implementation keeps Node runtime, dynamic GET and private no-store responses. Direct-handler tests do not attest framework-generated HEAD/OPTIONS or real HTTP behavior.

## Observed RED

`test/project-brain-voice-review-route-deadline.test.ts`: **3 PASS / 24 FAIL at 16:38:17** before source correction.

The old handler published HTTP 200 after authentication, limiter or reader settled at the ten-second original wall/monotone deadline; it also published after original request abort and backward clock movement. A late serialization callback could disable the flag or exhaust the budget without suppressing the already-created successful response. The context propagation assertion failed because the reader received only its original two arguments. Positive untouched-body, 9999ms and OFF controls passed.

These are synthetic direct-handler reproductions with mocked auth/rate/reader and injected clocks. No external disclosure or native database behavior was claimed observed.

## Narrow correction

- OFF remains before authentication, rate limiting and reader work.
- Capture initial wall/monotone clocks and original request signal once before authentication; freeze `{deadlineAt,monotoneDeadlineAt,signal}` with a ten-second total budget.
- Check finite clocks, each clock's nondecreasing progression, original abort, and both original deadlines before auth and after every awaited stage. Equality at either deadline refuses.
- Pass the exact frozen context as the reader's third argument. No conversion from monotone to wall and no renewed budget at the reader call.
- Recheck before JSON serialization and after it, then return the constructed response only while the switch and budget remain valid.
- No Promise.race, timer, background scheduling, retries or forced-cancellation claim. An unresolved authentication call remains unresolved; when it settles after deadline its content is refused and no later stage starts. Reader transaction limits are separately implemented/tested by its owner.
- Existing output grammar, fingerprints, labels, query validation, actor derivation, rate policy and error bodies are unchanged.

## Regression results

First combined run after source correction: **92 PASS / 3 FAIL at 16:38:56**. All 27 new tests passed; the three failures were old two-argument mock expectations. Only those assertions were updated to include an exact third context shape (two numeric deadlines, original real AbortSignal or undefined for the existing minimal request double). Original actor/workspace/session/options and invocation counts were preserved.

Fresh combined route suite: **95/95 PASS at 16:39:24** (27 new + 54 original author + 14 original peer).

Scoped ESLint: PASS. TypeScript must wait for the coordinated reader's third-argument signature; no claim of full-root types at this checkpoint.

Route SHA256 at freeze: `b5666cf9977c58eed4c23d024e7533e9bdf6bfadafd2d55304e69c16e981285c`.

## Limits and remaining verification

Android peer review requested against the frozen route. Controller owns actual reader/GET integration, native expiry/commit evidence, full-root and HTTP checks. This route does not recompute DB content expiry using the machine wall clock; the reader owns DB-derived expiry and post-commit freshness. The route additionally suppresses late/aborted work across auth, rate, reader and serialization. No network-delivery cancellation or guarantee about when a remote client consumes already-returned bytes is inferred.

No feature flag was activated. All text remains visibly synthetic, `realTranscriptionAvailable:false`, `executionAuthorized:false`, and no provider transport occurred. This is protected-read hardening, not ASR readiness or a mobile transcription feature.

## Coordinated signature check

After the reader's third context argument became available, root TypeScript completed with exit 0 (run begun at approximately 16:43). No type suppression or existing code outside the declared route/test scope was needed.

Peer Android is separately investigating content TTL expiring during JSON serialization while the ten-second request budget remains live. The current route deliberately does not compare DB expiry to application `Date.now()`. Until that investigation and a possible private reader publication fence are resolved, the 95-test result is not a final all-boundaries GREEN.

## Publication refinement and frozen source — 16:45

Android retained **7 PASS / 1 FAIL at 16:42:26**: the read was valid one millisecond before content expiry, and JSON serialization advanced clocks by two milliseconds, yielding HTTP 200. This aligned-clock mock reproduction is not proof that app and database clocks agree.

The controller approved the private reader publication assertion. The reader owner implemented a module-private WeakMap associating only exact committed immutable result objects with a synchronous original-budget/signal and DB-derived monotone-expiry guard. No expiry authority was added to the wire. The route calls `assertProjectBrainVoiceTranscriptReviewPublication(result)` immediately before and after JSON serialization, alongside its own deadline checks. It never substitutes a reconstructed object or compares wire expiry to app wall time.

The two old route fixtures explicitly stub this new assertion; their historical access/query assertions remain intact, but those mocks do not certify the private map. Three added author tests prove exact reference identity and the order guard → JSON → guard, refusal before serialization, and discarding an already-serialized response when the second assertion refuses. Real-reader private-map tests belong to the reader author/peer.

- Route suites: **98/98 PASS at 16:44:23** (30 new + 54 original + 14 original peer).
- Reader + route suites: **207/207 PASS at 16:45:19**, six files; no native database or real HTTP in this command.
- Scoped route/test ESLint: PASS.
- Latest shared TypeScript run saw only a peer-owned test fixture literal-number type error; Android was notified. The earlier signature-only TypeScript PASS above remains separately dated, not presented as a later full-tree result.
- Final frozen route SHA256: `a91b30a452f3f626658ef8b9da8f292ecd7026d2adca2c29fa0da628599979d9`.

Controller informed that the route is frozen for full checks/build. No further production edit is pending in this author's scope. The historical 95-test checkpoint and peer TTL RED are preserved above.
