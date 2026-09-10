# Individual correlated approval — mobile patch plan

2026-09-10. READ-ONLY DESIGN. No mobile, API, backend, schema, test or activation
change made by this document. Controller owns the running native campaign; no
runtime result is inferred from this inspection.

## Decision and existing seams

Use the accepted 19:22Z addendum: select an existing V1 card, GET its individual
approval offer, display that exact returned review, then require a separate
explicit approval gesture. Never use the generic calendar approval endpoint.
The V1 wire contract, parser, read lifecycle and pure evidence card remain intact.

Inspected implementation:

- `apps/mobile/src/app/(app)/personal-service.tsx` mounts the correlated list in
  the existing personal service screen, after model reviews.
- `components/personal-correlated-calendar-review-list.tsx` scopes by verified
  mobile identity/session/workspace/OWNER, clears data on pause, and renders only
  READY cards. It currently has no selection seam.
- `lib/personal-correlated-calendar-list-lifecycle.ts` has cancellation,
  generation fences, sticky expiration and a one-shot invalidation timer. It
  deliberately does not preserve expired source text or perform writes.
- The pure V1 card renders both full SMS, citations/provenance, exact draft and
  local/UTC times. Its notice says no action is available **in this card**.
- `MobileApi.request` already combines caller abort and bounded fetch/body
  deadlines with credential handling and cleanup. The existing correlated list
  method checks the original signal both after request and after parsing.
- The legacy `createPersonalCalendarApprovalFence` is only screen-local and
  keyed by executable operationId. Copying it would lose the new attempt latch
  on unmount and expose the wrong identifier domain.
- Existing SecureStore adapters are reusable mechanisms, not approval authority.
  The general outbox stores commands; the voice journal stores a voice workflow.
  Neither should gain a correlated-approval command or send/replay branch.

## Exact proposed ownership

New mobile files, after controller authorization:

| File under `apps/mobile/src` | Responsibility |
| --- | --- |
| `lib/personal-correlated-calendar-approval.ts` | Strict copied/frozen offer, command and historical-result DTOs; scope/binding checks; exact command construction from displayed offer only. |
| `lib/personal-correlated-calendar-approval-lifecycle.ts` | Selection/read/expiry/attempt/result state machine with injected API, wall/monotone clocks, timer and scope snapshot. No React or storage authority. |
| `lib/personal-correlated-calendar-approval-attempts.ts` | Bounded metadata-only attempt registry above card/list lifetime. No queued commands or automatic transport. Persistence is separately arbitrated below. |
| `components/personal-correlated-calendar-approval.tsx` | Session-scoped wrapper, selected exact-offer evidence display, explicit button and historical result panel. |

Targeted existing-file seams requiring explicit ownership:

1. `lib/api.ts`: add only the three methods below; preserve shared request and all
   old methods. Do not widen the generic calendar API.
2. `components/personal-correlated-calendar-review-list.tsx`: a presentation-only
   optional sibling renderer, e.g. `renderReviewControls(review)`, default absent,
   immediately outside each unchanged V1 card. This is a required new UI seam,
   not a V1 payload/version change. The wrapper supplies a selection control;
   ordinary callers remain exactly read-only. If this source seam is disallowed,
   use a new list wrapper that reuses the same parser/lifecycle/card; do not run
   two independent list fetches or duplicate the visible list.
3. `app/(app)/personal-service.tsx`: replace the correlated-list mounting component
   with the wrapper at the same location. No new route/page, guide or ID field.
4. An application/session-level registry provider only if necessary to retain
   attempts above screen remounts. Do not add unrelated logic to the large
   `mobile-session.tsx`; prefer a narrow sibling provider or bounded module store
   with an explicit session lifecycle interface.

New dedicated tests follow each new module plus API/component integration tests.
Backend C2a/C2b/C2c/C3, server routes, migrations and native fixtures remain owned
by their current authors/controller.

## API interfaces and blockers

Proposed methods use encoded IDs obtained only from the selected server card:

```ts
personalCorrelatedCalendarApprovalOffer(workspaceId, reviewId, signal?)
approvePersonalCorrelatedCalendar(command, signal?)
personalCorrelatedCalendarApprovalResult(workspaceId, reviewId, signal?)
```

GET offer and result siblings now exist. Offer is the exact
`personal-correlated-calendar-approval-offer-v1` envelope: `review` plus strict
eligible `approvalOffer`, original expiry, DB inspectedAt and two expected hashes.
Parse with the existing mobile V1 review parser, without rewriting any evidence
or booleans. Preserve source `operationId` fields already in V1; do not introduce
calendar operationId, approvalId, nonce, accountId or authority handles.

Command fields are exactly version, workspaceId, reviewId, expectedRequestHash,
expectedReviewFingerprint. Snapshot them from the **displayed returned offer**;
never combine old card text with a newer fingerprint. No mobile hashing replaces
the server's legacy/canonical hashes. A structurally valid hash is not authority.

The POST sibling does not exist at this inspection. Its public response schema,
status mapping, review/fingerprint binding and C2c terminal semantics must be
frozen before the mobile command parser/button is implemented. Do not leak the
private C2b claim through a convenience DTO. Suggested bounded client timeout is
30 seconds for a server workflow capped at 25 seconds; this is a proposal to
arbitrate, not a current guarantee. GETs can retain the existing 15-second client
bound. All three methods check original cancellation after request and parsing.

C3 results use the already implemented strict result-v1 contract:
NOT_ATTEMPTED, PENDING_RESULT, UNKNOWN or CONFIRMED. Every result is read-only,
automaticRetry:false and providerStateVerified:false. CONFIRMED means a durable
recorded receipt, not a fresh query proving the event still exists in Google.
Do not invent a fingerprint field in C3: bind its response to the requested
workspace/review and current owner/session; use the stronger POST binding only
when actually present in that future response.

## Foreground flow and exact state fences

1. Existing V1 card → explicit `Vérifier cet ajout` control. Select its reviewId,
   copy current user/session/workspace and generation, clear any prior offer.
   One selection/read at a time; switching cards aborts the obsolete read.
2. Read historical result first for a selected review with uncertain local
   history or after fresh process initialization. Anything except a successfully
   parsed NOT_ATTEMPTED closes new approval. A local attempted latch is never
   cleared by NOT_ATTEMPTED, refresh, a new fingerprint or an opaque error.
3. GET offer. Check generation/scope/focus/foreground and both clocks after each
   await and after parsing. Replace the selected evidence panel with the offer's
   exact V1 review. Render its two sources, citations, UNKNOWN/SYNTHETIC labels,
   normalization, dates and UTC/fuseau before enabling the separate action.
4. `Ajouter cet événement exact à Google Agenda` is a distinct explicit tap.
   Recheck selected review, current identity scope, pending state, unchanged
   displayed offer and original freshness. Synchronously reserve the one-use
   local latch **before the first await**. Capacity/storage refusal sends nothing.
5. If a persistent marker is approved, persist it before POST; after that await
   recheck scope, generation, original expiry and abort. An aborted/expired
   pre-send attempt remains closed locally, conservatively. Send exactly once.
6. Any network loss, timeout, abort, malformed response, missing binding or
   uncertain commit becomes UNKNOWN and keeps the latch. No POST from refresh,
   focus, timer, hydration, reconnect, historical read or remount. An error must
   not say nothing happened. Only a valid bound confirmed response shows success.
7. `Vérifier le résultat enregistré` performs C3 GET only. Keep this metadata-only
   panel reachable after the V1 card expires/unmounts. Never restore expired SMS
   text to provide context. No new preparation or approval from result states.

Display expiry is conservative: record wall and monotone instants before offer
read; take the server-declared `approvalExpiresAt - inspectedAt` as an upper
remaining bound **from read start**, including transport/parsing latency. Require
both wall absolute expiry and monotone remaining bound at every tap/getSnapshot.
Clock rollback invalidates sticky, forward movement may shorten, never extend.
One timer invalidates; no timer fetch. New read may replace an unattempted offer,
never refresh the original expiry or clear a prior attempt.

Blur, background, unmount, signout, pending identity, user/session/workspace/role
change clear displayed evidence and invalidate pending completions. They do not
erase a possibly sent attempt. Late responses cannot populate a different scope.
A known connector/account change invalidates an offer; unseen server revocation
is caught by the authoritative POST gate, not claimed detectable by local UI.
The server switch cannot be monitored magically; any observed OFF/refusal closes
the offer. No client env flag is treated as execution permission.

## Restart/history seam — controller decision received

FACT: V1 only exposes the latest five currently readable cards, and C3 needs a
reviewId. An expired unknown attempt can disappear from that list. An in-memory
registry therefore cannot make it discoverable after an app process restart.
Neither SQL one-use safety nor a historical endpoint alone solves discovery.

Controller approved metadata-only persistence through the existing SecureStore
adapter, separate from outgoing queues, with code release still gated on C2c and
its public response proof. Proposed exact journal protocol:

- One account-scoped blob/key, not a separate index plus independently mutable
  entries. Key `endvera.correlated.attempts.v1.<owner-encoding>` uses a bounded,
  deterministic SecureStore-safe encoding of the exact owner ID; use UTF-8 hex
  if no already installed portable digest is suitable. Validate full key length
  against platform support before implementation; never truncate/collide IDs.
- The blob is the index: strict version, exact ownerId and at most 20 entries.
  Each entry contains exact workspaceId, reviewId, expectedRequestHash,
  expectedReviewFingerprint, command/fingerprint versions and closed
  `ATTEMPT_RESERVED` marker. No SMS/draft/receipt/token/claim nonce/command body.
  IDs bounded 191, hashes 64 lowercase hex, exact versions; unique review scope;
  encoded blob bounded 24 KiB before parsing/writing. If native SecureStore's
  tested item-size limit is smaller, reduce cap or adopt a tested transactional
  journal protocol; do not ignore storage failure or claim atomicity unproved.
- A per-owner serialized promise chain in the single foreground JS runtime
  guards read/validate/check-cap/write/read-back. Reserve the synchronous
  in-memory latch before entering this chain. Persist and validate read-back
  before the first POST; failure leaves the latch closed and sends nothing.
  No cross-process/browser-tab CAS guarantee is claimed; server SQL one-use
  approval remains authoritative for cross-device/process races.
- On remount/restart load only authenticated own-account entries; display them
  in a separate metadata-only result panel regardless of V1 latest-five/expiry.
  Hydration permits bounded C3 GET only, never POST. Unknown remains unresolved
  even when source text expires or the server read is unavailable.
- No automatic eviction, expiry or logout deletion. The 21st unresolved attempt
  is refused before sending. A freshly read terminal server outcome can allow
  explicit local dismissal; it is not server deletion or renewed authorization.
  An opaque UNKNOWN is not automatically terminal/dismissible: wait for a
  controller-defined terminal distinction or retain conservatively. A same-user
  new login reloads its marker and reads C3; another user sees none of its IDs.
- Local marker presence is not evidence of ownership, transmission, a claim or
  outcome. Removing a terminal marker never re-enables an old review: all fresh
  selections check current C3 before an offer, and SQL remains one-use.

No global history endpoint or dispatchable outbox extension is needed. Browser
storage support must be tested separately: if SecureStore is unavailable there,
approval stays disabled rather than silently downgrading to memory-only safety.

## Minimum falsifiable tests / sequence

- Contract parity from real synthetic server offer/result fixtures; V1 unchanged,
  strict nested fields, wrong review/workspace, forbidden executable handles,
  old text/new fingerprint mix, unknown versions and malformed states rejected.
- API fake fetch: exact three URLs/body, existing credentials unchanged, original
  signal captured, pre-abort/body delay/abort between await and parse, cleanup on
  every status. Exactly one POST; no POST from any GET/error path.
- Lifecycle: double tap in same turn, listener reentrancy, selected A→B during
  each await, queue/read latency consumes TTL, slow/fast/backward phone clocks,
  expiry at tap, foreground/focus/session/owner/workspace changes, late response.
- Attempt registry: remount preserves unknown, result read cannot rearm, new
  fingerprint does not bypass review latch, bounded capacity refuses without
  eviction, no cross-user display. If journal approved: persist failure means
  zero POST; crash before/after persist and lost response allow GET only.
- Components: both exact offered sources visible before button; original V1 card
  stays read-only; no manual ID; expired source disappears while historical
  metadata remains; UNKNOWN explicitly no retry; CONFIRMED copy distinguishes
  recorded receipt from current provider verification.
- Parent-controlled backend POST/C2c and native proofs precede enabling button;
  local mobile tests/export are not Samsung, real provider or customer proof.

Implementation order after approval: strict DTO/API methods → independent tests
→ lifecycle/registry decision → isolated component tests → tiny mounting seam
→ independent review → controller full checks/export. No source was changed or
test run by this design pass. Real provider/customer-data use remains NO-GO.
