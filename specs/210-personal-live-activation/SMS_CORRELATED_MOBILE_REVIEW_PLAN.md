# Two-SMS calendar review in the existing mobile workflow

## Controller execution decision — 2026-09-10 16:53Z

The item reader and standalone card have been implemented and cross-reviewed.
Native receipt `postgres-native-1789058422654` passes93 cases, including8 new
item-reader cases; it uses actual persisted synthetic SMS processing under78.
The owned PostgreSQL server stopped. The initial table-discovery SELECT is now
bounded before executing; a real exclusive-table-lock test confirms refusal
inside the original short deadline. This is not live-provider/Samsung proof.

The next authorized local tranche connects that same read-only representation
to the existing owner personal-service screen. Controller owns the private GET
and native integration; separate author owns the list transaction, mobile author
owns screen/API cancellation and rendering, and a peer reviews both boundaries.
No credential, provider, permission activation or deployment is included.

Selected endpoint: GET `/api/endvera/v1/personal/model/correlated-calendar-reviews`.
Its only query field is workspaceId; actor comes from the verified session.
REVIEW switch OFF returns404 before authentication. All responses are private,
no-store; errors never echo source text/SQL or become a successful empty list.
Only a strict versioned list DTO can cross the route. Existing V1 stays unchanged.

For this bounded first tranche, choose one SERIALIZABLE transaction (five-second
database budget), latest five scoped rows ordered createdAt descending/id
descending and a sixth row solely for hasMore. Every displayed item reuses the
frozen reader. Initial active owner/member check precedes discovery; final
shared-lock owner/member epoch check follows canonical item locks. Final DB time
and conservative monotonic elapsed time guard every expiry through publication.
No nested transactions, autonomous retries, preparation or partial successes.

This deliberately replaces the earlier proposed per-item partial-list design
with **all-or-unavailable**. One expired/revoked/corrupt item rejects this small
list; it is not skipped or falsely called absent. It is not permanent history:
the original short preparation window still applies. Latest-order locking can
contend across unusual multiple historical namespaces; bounded rollback is an
availability limitation, not proof that deadlocks are impossible. A future
history reader or typed approval path requires its own explicit design/review.

The phone validates <=5 unique reviews and exact workspace, clears stale values
before reload/scope/background changes, discards late responses and supports
request cancellation. An expiry timer may hide data, never poll or trigger an
action. A local clock check is only presentation freshness, not action authority.
The screen will show both original texts and the exact draft with no approval
button, manual identifier entry or new permission. Common API cancellation
changes require regression tests and a separate peer review.

Verification gates: native empty/nonowner/revoked/expired/concurrent reads;
strict endpoint auth/query/kill-switch/abort/deadline/no-store tests; actual DTO
compatibility and mobile lifecycle/cancellation tests; root/mobile build checks.
First GET run47 PASS/3 positive503 failures was an integration import-name
mismatch (ResponseSchema vs Schema). Corrected import passes64 author+peer
tests at12:53:24 local. No validation was relaxed; failures remain recorded.

Campaign remains IN_PROGRESS. A working local reader is not an activated phone,
Google event, new APK, live model, delivery receipt or project completion.

Date: 2026-09-10. Status: **PROPOSED — DESIGN ONLY, NO ACTIVATION**.
Decision owner: campaign controller. Schema design is coordinated with `SMS_CORRELATED_CALENDAR_SCHEMA_PLAN.md`; this document does not reserve or modify a migration.

## Initial design snapshot (superseded where noted by the 78 addendum below)

The accepted temporal receipt currently proves a closed two-source calculation; it does not itself create a calendar draft. The read-only durable loader never fabricates a processing source or a current lease. This interface plan is downstream of a future typed receipt-to-calendar relation and prepare-only adapter from `SMS_CORRELATED_RECEIPT_REVIEW_PLAN.md`.

Inspected paths:

- `apps/mobile/src/app/(app)/personal-service.tsx` already contains the owner-only `PersonalModelReviewList`. This is the review location to reuse; no new public page is needed.
- `components/personal-model-reviews.tsx` displays one complete original SMS, current draft state and explicit Google approval. Its lifecycle guards and synchronous attempt fence are useful existing foundations.
- `lib/personal-model-reviews.ts` validates a strict version-1, single-source response. Adding a new subject or unknown fields directly to that response would make installed clients reject the entire payload. Existing historical reviews must remain byte-compatible.
- `components/personal-calendar-draft-times.tsx` formats exact instants using the draft timezone and workspace locale, retaining raw values. It has no device-timezone fallback and explicitly handles unavailable Intl/invalid values.
- `personalGoogleActions` / `personalCalendarActions` currently list all scoped `calendar_write` records. `PersonalGoogleConnection` offers approval for these generic pending rows without showing original SMS provenance. This would expose a correlated draft through a second, provenance-free path unless the backend excludes it first.
- `lib/prepared-actions.ts` and `/mobile/prepared-actions` handle the separate prepared outbound-message workflow. They are not a substitute Google calendar pipeline.

No mobile behavior, API, schema, consent, permission or provider setting is changed by this document. No Samsung behavior has been observed in this design task.

The schema author's complete `SMS_CORRELATED_CALENDAR_SCHEMA_PLAN.md` has now been read for alignment. Its proposed `PersonalSmsCorrelatedCalendarReview`, INSERT-only `PersonalAssistantOperation.correlatedTemporalReceiptId`, global marker-or-relation isolation and first-tranche `approvalAvailable:false` match this plan. Its 16 KiB proof retains references and UTF-16 citation offsets rather than full SMS copies; the projection must reload both full texts. Proposed migration 78 is not created or applied by either design document. The generic-list issue is explicitly a **future integration risk**, not an observed disclosure: there is currently no correlated draft to expose.

## Decision

Add a typed two-source review card within the existing personal-service review section only after durable linkage and a private read-only projection exist. **The first card is read-only with literal `approvalAvailable:false`; it contains no approval button or action.** Preserve the old single-source review, including its original CLARIFY result; do not rewrite it into a new interpretation. Both cards can remain historical records. A later separately reviewed typed approval tranche could offer the exact eligible correlated draft's approval control; the current plan does not make it available.

The phone still sends an ordinary SMS to ENDVERA. No handset SMS-reading permission, copied technical id, new model call or hidden calendar action is involved in reviewing the result.

### Required ordering before any draft becomes user-actionable

1. Persist the typed relation and an immutable operation marker atomically with draft creation, as proposed by the schema author. Pin the existing calendar request/hash unchanged.
2. Exclude marked **or globally related** calendar operations from the legacy generic calendar list. The relation existence check must not be scoped to the current actor: a foreign or invalid relation must not fall back to a naked generic draft. Hide such rows from the old one-source projection if another path could select them.
3. Keep backend approval of this subject closed until the typed correlated review/approval path is ready. A hidden button or a GET exclusion is not action authority: an old client can still possess an operation id/hash.
4. Add a versioned private projection and strict mobile parser, then render the read-only two-source card. The explicit approval flow described below is a later tranche requiring its own backend contract and review; no default activation follows these code changes.

These safeguards must not alter ordinary uncorrelated draft behavior or weaken the existing approval executor. Rejecting a broken relation is preferable to silently adopting or re-preparing its draft.

## Private projection contract to align with schema

Prefer an explicit opt-in version/discriminated response on the existing private review workflow, with legacy V1 unchanged. Exact route/version choice belongs to the controller and API author. A separately named private GET can be used if negotiation is more complex than a small dedicated projection; it must not require a new mobile page or public listing. Never append an unknown variant to V1 without negotiation.

Proposed logical fields, subject to the final schema, not a shipped DTO:

- Stable review id and subject `personal_sms_temporal_receipt`; immutable receipt id and clarification id, for internal binding, not manual user entry.
- Authenticated responsible owner/workspace binding. Authorization uses the server actor, never an actor in a query/body or the model packet.
- Two distinct ordered source objects: `ORIGINAL_REQUEST` and `CLARIFICATION_REPLY`, each with the exact full text, operation id, request hash and recorded received timestamp. Reload source text through scoped immutable references instead of duplicating it into a free-form review snapshot.
- Exact citation offsets/quotes associated with their specific source id/hash, clarified slot, original intake anchor and original timezone. The standalone reply must not be shown as if it independently supplied the date/title/duration.
- Original proposal/packet/evidence/resolution hashes and supported proof/resolver versions, retained as machine-verifiable lineage. Do not print technical hashes as a substitute for human-readable evidence.
- Exact current calendar operation id/request hash/status and four-field draft: title, startsAt, endsAt, timezone. Expose approval identifiers only when the projection proves the exact current draft and relation. Missing/changed/foreign/damaged evidence is unavailable and non-actionable.
- Read-only projection and `executionAuthorized:false`; semantic interpretation remains unverified. A deterministic closed calculation is not a general semantic-comprehension certificate.
- Recorded candidate transport mode, if available from the authenticated immutable chain. `SYNTHETIC_LOCAL` must not be labeled a real model result. An external candidate mode likewise does not certify actual SMS delivery or a real-device test. If provenance cannot be established, report unavailable/unknown; never invent a boolean claiming a live end-to-end run.

The server, not the phone, reconstructs and verifies these fields against the exact relation and source records. The mobile strict schema adds defense against malformed/incomplete responses but cannot authenticate a self-declared proof. No source/body/hash is accepted back from the UI as calendar authority.

## Card contents and interaction

Keep the hierarchy compact and readable, in this order:

1. **Ta demande initiale** — full original SMS and recorded received time.
2. **Ta précision** — full reply SMS and received time. Show the fixed question/clarified slot when its exact persisted wire/question binding is available; never generate a new paraphrase as evidence.
3. **Brouillon proposé — pas encore ajouté** only for the exact current `pending` state — exact title, local start/end date and time with numeric offsets, explicit draft timezone, then exact raw startsAt/endsAt/timezone. For processing/completed/uncertain/refused, use the actual state instead; never reuse the pending wording. Keep both full messages accessible, not only excerpts or collapsed summaries.
4. Actual state and limits, with `approvalAvailable:false` and no button in the first card. Only in a later approved typed-action tranche could an eligible pending card show **Approuver ce rendez-vous exact et l’ajouter à Google Agenda** below both sources.

Do not merge the two messages into a fictitious SMS. Citation emphasis may supplement the full text, not replace or trim it. Any title trimming already performed by the existing draft schema is visibly distinguishable from the source quote. No title/date/end-time repair occurs in the UI.

Reuse `PersonalCalendarDraftTimes` and its explicit-zone formatter. Use workspace locale for French/English labels, not the phone timezone for event calculations. With unavailable local-time rendering, retain exact raw values and show a fixed notice; initial correlated approval remains disabled rather than guessing how a user should interpret them. The display does not resolve DST folds or gaps: those remain the closed backend resolver's responsibility.

The user never copies a receipt id, UUID, hash or timestamp. A verified card captures its immutable approval binding internally. A checkbox or visible source panel cannot prove that a person actually read the text; claim only explicit approval of the shown exact draft.

## Approval and lifecycle boundaries

The final server contract must reuse the existing guarded calendar executor. Do not expose the current generic approval POST for correlated rows until it can distinguish this subject and enforce its required provenance/current bindings. Whether this requires an extra typed review id in a strict approval variant or server lookup through the immutable marker is a backend decision. It must not change the existing calendar request/hash merely to fit the UI.

- No POST from GET, rendering, AppState refresh, receipt arrival or a model proposal. Only an explicit user gesture may start the approval request.
- Eligibility requires a supported two-source variant, intact source/relation proof, the exact current pending draft, required current server controls and no local in-flight/unknown attempt. A stale pending label is not sufficient.
- Preserve synchronous busy/attempt fences before the first await. Capture workspace/review/operation/hash as one immutable action binding. On unmount, workspace change, reload generation or changed draft, discard late UI results.
- Reinspect on AppState return and explicit refresh. Hide stale actionable data while checking; a failed lookup is unavailable, not an empty successful review.
- A response lost after approval means unknown, never “failed safely” or automatic retry. Keep the item non-actionable until a current server read establishes its status. The existing in-memory attempt fence does not survive app restart; durable backend one-attempt/claim/replay controls must supply that guarantee.
- Processing/uncertain/completed/refused rows show their actual state; do not regenerate a pending copy. Claim “ajout confirmé” only after the strict existing confirmed receipt (or an equally strict typed successor), not a generic HTTP 200 or a local draft id.
- Reading old proof after its preparation window expires does not reopen the window or grant Google authority. Projection and execution freshness policies remain distinct and explicit.

## Options and tradeoffs

**Selected:** existing review section, separate strict two-source variant, same date component and guarded executor. This minimizes duplicate UI while keeping the subject boundary explicit.

**Rejected:** expose the draft in the generic Google list and add optional SMS text later. Old clients could approve without the required evidence, and a malformed relation could silently degrade into a generic draft.

**Rejected:** overwrite the original single-source CLARIFY review or display concatenated SMS text. This changes historical interpretation/provenance and hides which source supplied the clarification.

**Deferred:** a new page, editing/rephrasing the event in this card, SMS confirmation of this newly correlated draft, third-party recipients and multi-action scheduling. None is necessary for the bounded exact review.

## Falsifiable verification plan — future implementation, not tests run here

1. Compatibility: unchanged V1 fixtures still parse; unsupported/malformed correlated variants cannot enable approval or break the old negotiated view silently.
2. Provenance: both full Unicode texts survive exactly; missing/duplicate/swapped source ids, changed hashes/citations, unsupported proof versions and a changed draft yield no actionable binding. No synthetic merged text is displayed.
3. Generic escape: native SQL/API tests create valid, foreign, orphan-marker and damaged correlated relations. Every marked/globally related operation is excluded from the legacy listing and denied by the unavailable typed approval path before any reservation/transport.
4. Display: Toronto winter/summer, midnight crossing and fractional instants render from the explicit zone with raw values unchanged; invalid zone/Intl unavailable refuses approval. Locale changes cannot change the request id/hash or event instants.
5. Lifecycle: double tap starts one request; workspace/unmount/AppState refresh/draft replacement during await cannot update or approve a different card. Unknown response does not auto-retry, including after a fresh read of processing/uncertain.
6. Server: current owner mismatch, revoked Google/model bindings, changed request hash, stale relation and replay remain governed by the canonical backend. UI-only tests cannot prove database locks or current authority.
7. Labels: stored `SYNTHETIC_LOCAL` is visibly synthetic; acceptedAt is server observation of acceptance, not delivery; no test fixture is counted as Samsung or live-provider verification. Successful draft preparation is never called an inserted Google event.

## Proposed implementation ownership and stop conditions

After controller acceptance of the schema/projection contract, a bounded mobile lane can own new typed review parser/component tests, `lib/api.ts` method negotiation and insertion in the existing review section. Existing calendar date formatting should be reused unchanged unless a reproduced display defect requires a narrow separately reviewed fix. Backend author owns global exclusions, projection integrity and approval discrimination first. No mobile implementation is authorized by this document alone.

Stop exposure if the typed relation is absent, legacy clients can bypass it, either source cannot be reloaded exactly, transport provenance is being guessed, or a completed historical source must be pretended to be processing. Missing relation/projection is an integration dependency, not a reason to weaken the current guards. This plan makes no product-readiness percentage, provider GO or whole-product completion claim.

## Technical addendum after local schema 78 — read-only projection proposal

2026-09-10. This section is design only; no route, screen or new projection implementation accompanies it. The controller reports native application of 78 and has generated the local client. The working tree now contains the marked-operation/review relation, an unimported prepare-only producer and global generic isolation. Those replace the initial design's absence-of-schema assumptions, not the old historical evidence or the prohibition on approval.

### Actual stored shape, not the earlier proposed expanded snapshot

`PersonalSmsCorrelatedCalendarReview` stores scoped source/receipt/child/gateway/calendar references, packet/request/proof hashes, account/version and preparation timestamps. Its actual strict proof is **eight keys**: version, inspectedReceiptProofHash, receiptProofVersion, draft, titleNormalization, executionAuthorized, semanticInterpretationVerified, sourceAuthority. It does NOT store the two source texts or four citation references inside that compact proof. Its 16 KiB bound is not permission to invent additional keys.

The real `loadCorrelatedPersonalReceiptSubject` now returns `proof`, the builder-derived `reference` and locked `preparationContext`. `proof.resolution` contains the authenticated-and-recomputed packet's two sources/citations/anchor/UTC boundaries. `reference` is generated by the real `buildCorrelatedCalendarReferenceProof`, not by casting the saved compact object into an authenticated subject. Preserve this distinction in the projection.

### Minimal server seam

Propose a new **read-only** module under the existing personal-intent gateway, tentatively `correlated-calendar-projection.ts`. Its caller supplies authenticated actor/workspace, optional strict bounded cursor, original deadline/signal and an explicit local enable option. It supplies no SMS, receipt proof, operation hash, dates or approval. Do not call `prepareCorrelatedPersonalCalendarReview*` or either calendar preparer from this module, including on missing/replayed rows.

Recommend a dedicated authenticated GET under the existing personal model workflow, tentatively `/personal/model/correlated-calendar-reviews`, rather than adding an unknown variant to strict V1. This is a proposed future transport adapter, not authorization to write the route now. Use the same verified-client/owner access boundary as the current model review GET, private/no-store headers and Cookie/Authorization variation. No POST/approval method. No new public page. Existing V1 stays unchanged.

Bound the first collection to **five discovered rows** and a **five-second total controller deadline**. Each source inspection gets its own short SERIALIZABLE transaction (proposal: maxWait 100 ms, timeout and source deadline at most one second and no later than the remaining total deadline). No parallel namespace locking and no five-second allowance multiplied by the row count. Measure these proposed bounds in native tests before integration. If the bound prevents completing an item, return explicit partial/unavailable state, never imply an empty successful list; do not skip arbitrarily forward without recording pagination progress.

1. Verify current active workspace owner/member before discovery. Select only the actor's review rows, deterministic `(createdAt DESC,id DESC)` keyset, limit five. The cursor is untrusted, strictly decoded/size-bounded and bound to this scope; it supplies no authority. Do not load full SMS text into this discovery query or diagnostics.
2. Within each bounded transaction, discover this scoped immutable review by id without a lock only to obtain its receipt id. Then call the existing receipt loader to acquire its canonical namespace → question → receipt → current evidence/source locks. Do not lock the calendar or relation ahead of that established order.
3. Require the loader's exact inspected discriminant; re-read the exact scoped relation with `FOR SHARE` afterward. Parse its strict real columns, using explicit UTC conversion for naive timestamps as the producer already does. Revalidate the compact proof with `inspectCorrelatedCalendarReferenceProof` and compare it, its hash, packet hash and every scalar pin to the newly built loader reference/context. A valid compact proof hash alone is insufficient.
4. Reload the actual calendar operation by id under a SHARE lock, with its globally unique review relation. Check marker equals receipt id; relation id/receipt id/calendar id/scope exactly match; kind/account/version/idempotency key and six-field request match the verified reference. Reconstruct the established request hash from schema-ordered parsed fields, never JSONB text or sorted canonical JSON. A foreign/global conflicting relation refuses, not a generic fallback.
5. Require immutable model-lineage columns on the calendar operation to remain NULL and the existing no-budget pins intact. Read actual operation status, never the relation's original pending assumption. Reject unknown states; distinguish pending/processing/completed/uncertain/refused without changing any status. For a nonpending state, do not label it PREPARED_UNSENT or claim fresh external success.
6. Recheck owner/current loader controls, deadline and finite monotonic DB clock before returning the item and after awaited reads. Returned read data is provisional until its transaction successfully finishes. Collection expiry/failure cannot be hidden behind an earlier successful item; mark partial state explicitly.

**Freshness restriction for the first implementation:** reuse the current receipt loader unchanged. It rejects after the original question expiry/current pilot or revoked bindings. Therefore a successfully persisted review can become unavailable for full-text inspection after that window; expose a fixed “preuve actuellement indisponible” state, not fabricated history or a new ten-minute window. The earlier aspiration to read complete historical proof after expiry requires a separately reviewed historical read boundary. Do not pass an old `now`, fake WAITING/processing state, or call the producer to achieve it. This conservative UX limit must be acknowledged before wiring; it does not authorize broadening the loader now. PREPARE's enable flag governs creation, not this read; the existing loader's STORE/current-policy gates still apply.

### Proposed read response and exact adapter mapping

Use a new literal response version (tentative `personal-correlated-calendar-reviews-v1`), `readOnly:true`, `approvalAvailable:false`, `executionAuthorized:false`, `semanticInterpretationVerified:false`, bounded entries/unavailable count, explicit partial state and a scope-bound cursor. The response is not the mobile local-preview envelope and must get its own strict transport parser when approved.

| Presentation field | Verified source of value |
| --- | --- |
| Internal review/receipt identity | Scoped immutable relation and exact loader subject equality; no user-entered ids |
| Original/reply full texts, operation ids, declared request hashes, receivedAt | `subject.proof.resolution.sources[0/1]`, already compared against two actual completed source rows by the loader; map `body` to `text`, no trim/concatenation |
| Four quotes and UTF-16 offsets | `subject.proof.resolution.citations.{title,originalStart,originalEnd,answer}`; retain each specific source id/hash |
| Original anchor and timezone | `subject.proof.resolution.anchorReceivedAt` and `.timezone`; never current phone clock |
| Clarified slot | `subject.proof.resolution.evidence.slot`, mapped explicitly to the local helper's START/END literals; reject unsupported values |
| Exact four-field draft | Relation's compact draft only after equality with loader `reference.proof.draft` and current operation's parsed request |
| Current status and recorded request hash | Actual locked calendar operation; hash is diagnostic/integrity data, not an action token in this tranche |
| Preparation timestamp/expiry | Parsed immutable relation timestamps, not a fresh date generated by GET |
| Provenance label | First read-only scope can use explicit UNKNOWN. Only emit SYNTHETIC_LOCAL after separately reloading and validating the original candidate's recorded transport mode against the exact child/gateway chain. Never infer from provider SID shape, fake-test identifiers, acceptedAt or the absence of a call during this GET |

To minimize accidental action wiring, omit calendar approval operation id/expectedRequestHash from the mobile action-facing structure; an integrity hash may be exposed under clearly read-only evidence metadata if required. The stable review id is sufficient as a React key. If a future transport returns the operation id for diagnostics, the strict local preview adapter must not pass it through and there must still be no action handler.

The local helper accepts only explicit SYNTHETIC_LOCAL or UNKNOWN, so a separately verified external model mode must not be relabeled synthetic; keep UNKNOWN in this bounded presentation and do not claim the whole pipeline was live. A later richer provenance union needs independent contract review.

### Mobile connection, after server reconciliation only

Add a strict private-response parser and an explicit adapter to the already tested local preview helper. Do not relax its version or false-approval literal to accept an incompatible response. Adapt only the verified source/draft fields in the table, and keep actual operation status outside the local helper: it validates evidence structure, not pending state. Show “pas encore ajouté” only for exact pending. The initial card has no Google button even when pending, no hidden callback and no call to `approvePersonalCalendar`.

Reuse the existing personal-service owner/workspace lifecycle and date component. Display both exact sources in order and raw values even if local Intl rendering is unavailable. Clear prior read data on scope/unmount/reload generation changes; a late response for another workspace cannot overwrite this card. No new native permissions, background work or automatic API mutation.

### Falsifiable implementation gates

- Native read path starts from an actual accepted reply and committed relation, never manually fabricated completed source state. Exercise three DB session timezones, exact Unicode citations and current state changes.
- Rehashed altered compact proof, wrong receipt/source/calendar marker, global foreign relation, invalid timestamp, missing payload and request/hash change yield unavailable/refusal without prepare/update/credential/provider calls.
- Current expiry/revocation and total deadline produce explicit unavailable/partial results. No resetting TTL, consumption, draft regeneration or fallback to old generic listing. Unknown transaction outcome is not a successful inspected item.
- Native barriers cover current owner changes, namespace contention, relation/calendar mutation and late deadline. Mock query tests are not lock/SQL evidence.
- Response/parser compatibility keeps V1 intact. Mobile tests assert exact field mapping, full texts, statuses, all false approval markers, no action callback, stale context discard and synthetic/UNKNOWN distinction.
- Verify imports and call sites: the GET/projection/card never invokes a preparer, dispatcher, credential decryptor, approval API or provider adapter. Existing pure builders import the calendar draft schema from a module which also exports preparers; that transitive module presence is not an effect call and does not authorize invoking those functions. Spy-based tests must assert zero calls on the actual effect boundaries, rather than claiming the entire transitive module graph is effect-free.

### Validation performed before this addendum

With the controller-generated 78 client, root TypeScript and scoped backend ESLint passed. On 2026-09-10 at 12:23:20 local, nine targeted backend files (legacy receipt readers plus actual new reference builder, isolation and legacy review projection) passed **178/178**. At 12:23:38, mobile preview/independent preview/date formatter/existing read-review card tests passed **115/115**; mobile TypeScript and scoped ESLint also passed. No mock/source correction was needed in this validation pass. These are local unit/serialization results; this lane ran no DB, full-root suite, provider or device and does not claim native validation of the proposed projection.
