# Correlated explicit approval — POST HTTP boundary

2026-09-10. Local OFF implementation; no provider call, database migration,
native launch, deployment, credential access or mobile button in this slice.

## Scope / decisions

New route only:
`src/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approve/route.ts`.
New dedicated test: `test/correlated-calendar-approve-route.test.ts`.
Existing auth helper, body helper, gate, claim wrapper and executor unchanged by
this author. The controller explicitly accepted this boundary before coding.

Next.js skill and its route/async/runtime references read fully, together with
the installed Route Handlers guide. Skill use selected a Node route handler,
not a page/server-action substitute for the existing native mobile API family.
Only POST is exported; other framework methods do not invoke approval. Unit
export assertions are not a real framework HTTP/OPTIONS test.

## Exact boundaries

- REVIEW and APPROVAL switches must both be exact true. OFF404 precedes auth or
  body reading. All responses private,no-store with Vary Cookie,Authorization;
  no CORS grant or public cache is introduced.
- Snapshot request signal/URL/method/body/origin/content headers and configured
  BETTER_AUTH_URL before first await. CLIENT, emailVerified===true and bounded
  trimmed session ID are required. Actor ID is copied before rate-limit await;
  workspace comes only from the strict command and is authorized by backend.
- Origin semantics deliberately match existing personalApiUser: absent/empty
  Origin and exact endvera:// accepted, configured BETTER_AUTH_URL origin
  accepted, foreign origins (including literal null) refused. Request Host and
  forwarded-host never choose trusted origin. The trusted configuration is
  compared unchanged again before effect and response. This preserves existing
  policy, not a claim of additional CSRF coverage for every no-Origin client.
- Dedicated per-user rate20/min requires literal true. No URL query accepted;
  application/json with optional UTF-8 charset only. Announced content-length
  checked, but actual stream bound4096 bytes is authoritative. Fatal UTF-8 decode
  and canonical strict A command schema; no userId/actionid/nonce/proof/freefields.
- At most4096 stream chunks. Zero-byte chunks are counted, not retained. A hung
  stream races the original entry timer or original request abort; cancellation
  is initiated without awaiting an untrusted cancel promise. Timer/listener and
  reader lock cleanup are bounded. This closes the controller's static finding
  of unbounded zero-byte chunk-array growth; no pre-fix runtime RED is claimed.
- Wall and monotone deadlines start once at route entry, total25s including
  auth/rate/body. The exact original deadlineAt/monotoneDeadlineAt/signal reach
  approveCorrelatedCalendarReview. Clock rollback closes conservatively. Auth
  and underlying driver promises are not forcibly terminated by this handler;
  their continuation cannot start an effect after the original budget. This is
  not an unconditional HTTP wall-time guarantee for an uncooperative dependency.
- Exactly one typed wrapper call, no generic approver or direct client. All
  post-wrapper responses parse the exported closed response schema and match
  workspace, review, expected request hash and expected view fingerprint.
  CONFIRMED and ALREADY_ATTEMPTED with strict same-scope C3 history return200.
  No private claim/authority material escapes. No retry, compensation, DB write
  or claim adoption is implemented at this HTTP layer.
- Controller chose strict no-late-disclosure: aborted, expired or switch/config
  invalid after wrapper => opaque503 UNKNOWN/automaticRetry:false, including a
  late internally known CONFIRMED. That response never overwrites its durable DB
  fact; the separate owner-authorized C3 reader can reconcile it. It does not
  assert nothing happened. Malformed response and uncertain commit also remain
  opaque UNKNOWN with no automatic second attempt.

## Evidence and limits

- First author run15:53:54: **98 PASS / 1 FAIL**,99tests. Failed oracle expected
  cancellation during owned body read, but ReadableStream default prefetch called
  pull and aborted before the reader was acquired. Fixture changed to
  highWaterMark:0 to force the intended read boundary; no production guard was
  weakened. Empty-array test parameters were also explicitly tuple-wrapped.
- Fresh focused run15:54:17: **99/99 PASS**, safeEnvironment. Real route/A/response
  parsers, mocked session/rate/wrapper, synthetic Request/streams. Covers origins,
  actor snapshots, OFF, strict schemas, size/chunk bounds, hang/abort/cancel,
  original budget, late receipt refusal, wrong bindings and no second invocation.
- TypeScript global and scoped ESLint subsequently both exit0. No full root or
  native campaign was launched by this author; no SQL/provider proof is inferred
  from route mocks. Independent review and controller HTTP/build checks remain
  separate evidence stages.

Future mobile mapping is documented separately in
`SMS_CORRELATED_MOBILE_APPROVAL_IMPLEMENTATION_PLAN.md`: exact one-use command,
durable metadata marker before POST, no retry, historical result after unknown.
That document does not activate a mobile button or authorize real transport.

## Independent stream-ownership finding and narrow repair

Peer run15:59:33 recorded **6 PASS / 1 FAIL** in the separate
`test/correlated-calendar-approve-route-review.test.ts`. A real synthetic Request
with a highWaterMark:0 ReadableStream supplied a Buffer chunk, then mutated that
Buffer on the next pull. The author's `next.value.slice()` retained shared bytes
for Buffer (unlike Uint8Array), allowing the parsed reviewId to change before the
wrapper call. This is a reproduced JavaScript producer-ownership defect, not a
demonstrated HTTP/tenant authorization exploit; the canonical backend gates
remain required and were not exercised by this mock-wrapper test.

Controller authorized exactly `Uint8Array.from(next.value)` for an unconditional
private byte copy. No shared serializer, C2c source or test oracle was changed.
Fresh run16:01:31: **106/106 PASS** (99 author +7 unchanged peer). The initial peer
RED remains in its audit/history; no synthetic provider/database proof follows
from this repair. Fresh TypeScript and scoped ESLint both exit0 after the repair.
