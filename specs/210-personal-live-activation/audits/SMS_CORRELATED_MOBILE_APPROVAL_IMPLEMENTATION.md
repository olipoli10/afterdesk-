# Correlated approval — usable mobile slice, local OFF

2026-09-10. Implementation authorized after controller native backend milestone
171 PASS. No provider/production activation, credential access, migration or
native launch by this author. Parent owns full mobile/export/device checks.

## Actual delivered scope

New mobile modules under `apps/mobile/src`:

- `lib/personal-correlated-calendar-approval.ts`: strict copied/frozen offer,
  five-field command, POST response and C3 historical-result contracts. No server
  import, hashing authority or executable operation ID. The exact offered V1
  evidence is retained; wire provenance must be UNKNOWN, unlike the broader
  synthetic local preview parser which is unchanged.
- `lib/personal-correlated-calendar-approval-attempts.ts`: separate SecureStore
  metadata journal; no outgoing queue or automatic transport.
- `lib/personal-correlated-calendar-approval-lifecycle.ts`: one authenticated
  scope per instance, selection/history/offer, explicit one-use send, expiry,
  generation/abort checks and metadata-only result retrieval.
- `components/personal-correlated-calendar-approval.tsx`: same-screen selection,
  exact offered two-source card, explicit add button, bilingual recorded-result
  notices and retained-attempt panel without raw IDs or expired source text.

Authorized existing seams only: three typed methods in `lib/api.ts` (GETs15s,
POST30s bounded client wait), optional sibling controls in the V1 list (default
absent), wrapper mounted at the previous list position in `personal-service`.
The shared request implementation, old APIs, V1 parser/lifecycle and evidence
card are unchanged. The old V1 default remains one refresh button/read-only.

React skill use kept per-panel event listeners and an external lifecycle store;
no hooks per card. Lint caught render-ref writes in the first component draft;
they were replaced with memoized external scope/foreground fences updated by
layout/focus cleanup, without disabling the rule. An intermediate inline-factory
lint requirement was also corrected. These were lint failures, not native defects.

## Storage protocol and its limits

Key: `endvera.correlated.attempts.v1.<UTF8hex(canonicalApiOrigin)>.<UTF8hex(owner)>`.
Malformed surrogate pairs/NUL are rejected before UTF-8 conversion; NFC/NFD
remain distinct. The exact API origin prevents a retained ID from silently
moving to a different backend. Keys use installed SecureStore-safe characters.
No undocumented native key-length success is assumed: storage failure closes
approval. No new dependency or existing outbox/voice-journal modification.

One strict blob per key contains version, exact ownerId/apiOrigin and entries
with command/fingerprint versions, workspaceId, reviewId, requestHash,
reviewFingerprint and ATTEMPT_RESERVED. No SMS, draft, token, claim nonce, receipt
or provider state. It is capped at **2000 UTF-8 bytes and at most20 entries**;
actual capacity can be lower. This follows a conservative existing local bound,
not proof that this payload/key works on a physical device.

The synchronous attempt latch precedes the first await. Storage read/check-cap,
write and exact full-string read-back must complete before the first POST. Every
failure keeps the local latch; no attempted marker is rolled back after timeout.
After write, a late scope/expiry failure retains the persisted marker, sends
nothing and can recover metadata only. No signout deletion, timer eviction or
automatic resend. Restart uses the same account/origin marker then C3 GET only.
Unknown records remain available beyond V1 latest-five/source expiry. Explicit
dismissal re-reads current scoped C3 and accepts CONFIRMED only; it never trusts
a cached POST result and never removes the same-runtime attempt latch.

Memory bounds:20 identity tombstones per scope with sticky saturation;20 runtime
owner/origin scopes, thereafter sticky overflow disables new reserves rather
than evicting old identities. Pending serialized operations are bounded to20 per
key and20 simultaneous keys. Saturation does not create a send path: historical
loads remain possible when pending I/O capacity is available. These are single
foreground-JS-runtime protections, **not cross-process/tab/device CAS**. Durable
SQL one-use authority remains required. SecureStore unavailable on a platform
means approval closed, not a fallback to memory-only persistence.

## Display / one-use behavior

- Mount/focus never posts. Selection first reads C3; only a parsed NOT_ATTEMPTED
  with no local prior latch may read an individual offer. The offered review,
  not old list text with a new fingerprint, is shown above the explicit button.
- Local state changes to SENDING synchronously, then the durable reservation is
  verified. Only one typed command is posted. Refresh, timer, resume, remount and
  historical reads cannot reset a prior attempt or create a new send.
- Server remaining TTL is counted from the **start** of the offer request with
  wall and monotone clocks. Latency consumes it; rollback invalidates sticky.
  Freshness is rechecked after response and parsing even if a JS timer is late.
  Expired attempted work remains UNKNOWN; no late success display is invented.
- Pause, blur, account/session/workspace/origin changes clear offers/results and
  visible markers. A late completed local storage write may refresh metadata only
  for the same active scope/selection/generation, never overwrite a new read.
- C3 outcomes are recorded facts with providerStateVerified:false. Confirmation
  copy says a confirmation is recorded, not that the event still exists now.
  UNKNOWN has no retry button. The selected result button remains available even
  if a late marker was not yet listed; neither result control reveals a raw ID.

## RED history retained, not flattened into a first-pass claim

Independent contract reviewer used real server schemas/fixtures in a root-only
test (no server bundle import). Reproduced command getters before preflight,
aggregate allocation before composite byte-limit refusal, and mobile acceptance
of SYNTHETIC_LOCAL where the actual offer wire requires UNKNOWN. Narrow repairs:
snapshot before scope fields; running primitive/key/punctuation UTF-8 accounting;
UNKNOWN literal in offer parser only. Final reviewer **27/27 PASS16:22:57**;
separate mobile contract/API reviewer16 adds focused fake-HTTP tests. See peer
audit `SMS_CORRELATED_MOBILE_APPROVAL_CONTRACT_API_PEER_REVIEW.md` for exact runs.

Storage peer **6 PASS/2 FAIL16:12:48** reproduced the21st failed review/owner still
reaching storage; bounded tombstones/scopes and pending queues close it.
Lifecycle peer **2 PASS/2 FAIL16:16:01** reproduced late-expired confirmation
publication and stale RESULT/marker scope disclosure without an offer; both
closed. Peer **6 PASS/1 FAIL16:18:22** found late persistent marker absent from the
active expired panel; metadata-only finally reload closes it. Peer **9 PASS/1
FAIL16:24:21** found old send cancellation could invalidate a reactivated new
generation; separating stale-generation return from same-generation expiry
closes it. Unchanged peer tests remain in their independent files/audit.

## Focused evidence

- Author contract37 +API13:50/50 PASS16:11:43 before later peer fixes.
- Author durable registry15 tests, including actual same synthetic store across
  module reset, byte/read-back failure, pending-I/O bounds and no queue.
- Author lifecycle12/12 PASS16:21:56: real registry, module reset+same store→C3
  only, double tap, exact read-back before send, expiry/pause and changed selection.
- Combined130/130 PASS16:23:16: author77 +storage/lifecycle peer17 +controller
  rendered18 +existing V1 render18. This run predates the final reentrancy fix.
- After final reentrancy/layout-fence changes: peer lifecycle10 +author12 +
  controller rendered18 =40/40 PASS16:25:08. Existing V1 render18 separately
  remained PASS after the component scope-fence change.
- Mobile TypeScript exit0; final scoped lint exit0 with no suppressions. Full
  mobile suite, export and native-app usability remain controller stages.

Current frozen hashes (SHA256):

- contract `0bfbfc7775444217cfcc87440a5638a3cb4a91c2d9147eacdaae418a15abe54f`
- attempts `b4caafa68ac38fa6f975090d9d1d8cf3096de9ff06188d1330e671b3b9f74110`
- lifecycle `48179afc105de0f6ce2d92d4f1a7f86cdc99b6330684bb67146b36fc192a0870`
- component `b641cb73d07b8ded9865fd69a864bed56d508edd524723a798a1b19853b94933`
- API `7c109d620a24585309ee2fa7445c7fa8d2b7669d8ea8c20dd1607821fe017e50`

These proofs use synthetic storage/HTTP and rendered hooks mocks. They are not
real SMS, Google, Samsung, SecureStore device durability or deployment evidence.
Real provider/customer-data use remains NO-GO.
