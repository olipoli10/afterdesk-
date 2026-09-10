# Accepted temporal receipt → guarded calendar draft review

2026-09-10. **DESIGN ONLY.** This document changes no code, schema, feature switch, worker, budget or execution authority. No provider/model/device call. The requested next result is one `calendar_write` draft in `pending`, shown as `PREPARED_UNSENT`, never an approved or executed event.

## Facts inspected

- The registry consumer already stores an immutable `PersonalSmsTemporalClarificationReply` with outcome `ACCEPTED` only for `RESOLVED_NOT_AUTHORIZED`. In its transaction, the question becomes `CONSUMED`, `consumedReplyId` is pinned, and the new inbound SMS becomes `completed` with the exact receipt id/packet hash. The incoming lower inserts its ordinary acknowledgment in that same transaction.
- The resolved packet includes both actual SMS sources, exact source hashes/citations, original intake anchor/timezone, raw-proposal hash, evidence hash, resolution hash, closed-parser version and UTC boundaries. Its `executionAuthorized:false` and `persistencePerformed:false` describe the pure computation, not whether a later database receipt exists. Do not rewrite these historical bytes or their hashes.
- `temporalRegistryStoredProof` and `temporalRegistryCurrentProof` already inspect the immutable prepared snapshot and current owner/phone/model/Google bindings against an original source which is **completed**. These are reusable read-only foundations. The latter checks canonical model authority, credential/grant state, gateway/AI evidence and original review snapshot; no credential bytes are returned.
- `loadStoredPersonalIntentReviewProof` and `prepareStoredPersonalIntentReview` serve a **live processing source** and a one-source candidate. They are not directly callable for this completed two-source receipt. The pure existing correlator also demands current WAITING/processing state and a live lease; supplying invented values would misrepresent the durable state.
- `preparePersonalCalendarInTransaction` already creates the exact local calendar draft and supports replay by request UUID/hash. It does not execute Google. It validates a broader owner/admin scope, so the new upstream subject must retain its stricter current owner-only checks. It does not itself store two-source receipt provenance.
- Existing original-source `personalModelReview` remains a CLARIFY review and is protected by registry SQL invariants. There is no typed durable receipt→calendar draft relation in the current schema. Appending or replacing that historical source review is not a safe substitute.

## Decision: one new subject inside the existing personal-intent gateway

Proposed caller input, strict and frozen:

```ts
{
  subject: { kind: "personal_sms_temporal_receipt", receiptId: string },
  actor: { userId: string, workspaceId: string },
  deadlineAt: number,
  signal?: AbortSignal
}
```

The actor comes from authenticated server context or the verified worker claim, never model arguments. Only the receipt id is supplied. The caller supplies no source text, dates, title, account id, proposal, evidence hash, binding flags or fake source lease. A new explicitly OFF preparation switch would be proposed separately; this document does not activate or add one. No new model gateway attempt, AiOperation, token read, reservation, settlement or paid inference is needed.

Add a typed read-only receipt-subject loader and prepare-only adapter under the existing `model-gateway/personal-intent` area. Do not widen the existing processing-source loader into accepting arbitrary terminal sources. Share narrowly extracted pure validation/calculation functions with the existing correlated modules; no second parser or copied grammar.

## Durable proof and current-state boundary

One bounded SERIALIZABLE transaction, original caller deadline/signal, short SQL timeouts, no network await:

1. Discover the exact receipt/question and scope without granting authority. Acquire the existing permanent phone-pair namespace first, then the concrete clarification, then immutable receipt, then the current proof's established source/child/account locks. Reject mismatched discoveries after lock. Do not lock the ledger before the question or create/reactivate an expectation.
2. Require exact scoped receipt outcome `ACCEPTED`, question phase `CONSUMED`, and `question.consumedReplyId === receipt.id`. Require the permanent ledger record still mirrors this question but is **inactive**; another current question is allowed and is not consumed by this review. Require both distinct source ids, provider SIDs, owner/identity/phone pair and request hashes exactly as persisted.
3. Reload original source and answer source from DB. Both must be `personal_sms_inbound`, `completed`, attempt 1, lease null and actor/workspace scoped. Recheck exact envelopes, hashes, original source review, answer result receipt id/hash and the immutable receipt's historical sourceClaim. A recorded historical lease is evidence of the completed transition, never a current lease or action permission.
4. Reuse `temporalRegistryStoredProof` and current-proof inspection, with exact frozen prepared/current binding equality: active owner/member/workspace/identity epochs, SMS inbound identity/account/grant, current canonical model account/credential/grant fingerprint and pilot controls, Google account/credential/write grant and timezone. Compare all scalar lineage pins and original gateway/AI/decision/attempt evidence. A source completed before the review remains completed throughout.
5. Validate the packet through a strict versioned resolved-only schema, bounded serialized bytes, canonical packet/evidence/resolution hashes, historical question acceptance, question id/waiting hash, historical required transition and both source citations. AcceptedAt remains DB observation of provider acceptance, **not delivery**. Historical accepted/received/consumed times must be internally causal; current DB time cannot be substituted for the original intake anchor.
6. Recalculate the result using the original template and the separate exact hour answer. Inspect the original candidate again against the original SMS only. Exactly one calendar action, no dependencies/unsafe context, complete title/start/end evidence and exactly one originally ambiguous time slot. Use the shared explicit-time classifier and the same `resolvePersonalCalendarTemporalClarifiedSlot`; original date and timezone stay original. Recompute and compare all semantic outputs and citations to the immutable packet. Never concatenate a synthetic SMS, reconstruct a fictitious source, invent an end/duration/date/title or trust the stored UTC strings alone.
7. Feed the validated title quote and exact recomputed boundaries into `personalCalendarDraftSchema` and the existing transaction-aware calendar preparer. Preserve the original quote even if the existing draft schema trims its title: display that explicit normalization, do not alter the source. Re-read exact operation kind/actor/account/request/hash/state before recording the review relation.
8. Persist the typed review relation and proof snapshot in the **same transaction** as the draft. Recheck current controls/deadline after each preparation/write await and just before callback return. On failure roll back both, do not rewrite either completed SMS, consume again, create an acknowledgment, or fall back to the model. A known commit is returned as such; unknown commit is not automatically retried as a new request.

### Required pure refactor before this loader can prepare

Separate the reusable **phase-independent two-source evidence/calculation** from the live correlator's pre-consumption WAITING/processing/lease gates. The new receipt loader authenticates completed durable lineage; it must never call the old public correlator with `currentPhase:"WAITING"`, `alreadyConsumed:false` or a fabricated fresh lease. Keep the old public API and all its checks unchanged. Share source/proposal/citation/time grammar internals, then expose a distinct durable-subject pure inspection input with a label such as `DURABLE_RECEIPT_INSPECTED_NOT_AUTHORIZED`. Pure inputs still do not authenticate DB state by themselves.

The stored packet's historical `requiredAtomicTransition` remains an immutable record to compare with the receipt and completed source; it is not replayed. Historical evidence hash recomputation uses the original immutable structure, while any new durable-review envelope receives its own version/hash. Do not change old packet versions to make the new workflow pass.

## Freshness and retention decision for the first bounded implementation

Proposed conservative first rule: create a new draft only while current DB time is before both the original question `expiresAt` and the current pilot expiry, and while the exact current bindings still match. This deliberately means a receipt accepted just before expiry may be retained but not converted automatically after expiry. Do not silently substitute a new ten-minute window or revive an expired authorization.

An already created review remains readable after that window with its actual current draft status. Viewing historical evidence never reauthorizes a draft or repeats its preparation. A later extension allowing delayed preparation needs an explicit new freshness policy. Keep the existing permanent receipt/non-reuse ledger; no deletion or retention-policy change in this tranche. Do not duplicate phone/text data beyond the bounded exact proof required for review, and do not put it in diagnostic logs.

## Proposed minimal schema addition — needs arbitration before any edit

One append-only `PersonalSmsCorrelatedCalendarReview` relation, not a new execution engine:

- Stable id; unique `receiptId` (one preparation per accepted receipt, not one per implementation version).
- Exact `clarificationId`, workspace/user, original source id, reply source id, original model child/gateway/action ids; composite scoped foreign keys wherever available. Add a scoped unique key to the existing receipt table if required for its composite FK, without weakening current constraints.
- Packet/evidence/resolution/prepared/binding hashes and explicit proof/resolver versions; immutable bounded review snapshot including both full source texts and citations or exact source references reloaded for every projection. Never accept a caller-supplied snapshot.
- Unique calendar operation id, exact request UUID/hash and connector account/version pin. Immutable relation; referenced calendar operation may transition normally under existing approval/execution/recovery, but its request/actor/account/hash must not be changed behind this relation.
- UTC DB-created timestamp. The relation is only inserted atomically after a pending attempt-0, lease-null, no-external-transport calendar draft exists. No persistent `processing` phase or separate lease is needed for this local atomic preparation.

Forward SQL guards should enforce accepted/consumed receipt linkage, exact two completed sources, scope/FKs, immutable evidence pins and draft-request identity. Deferred validation checks the final transaction state; immediate identity/immutability guards must not block legitimate later calendar status changes, revocations or recovery. No retroactive backfill certifies old receipts. No migration name or version is reserved by this design.

The existing calendar request payload/hash format remains unchanged; provenance lives in the new relation. Do not overload `sourcePersonalOperationId` or model child columns with an incompatible subject or change the original candidate review JSON.

## Idempotence and workflow

- Deterministic namespaced request UUID derived from the durable receipt id plus a fixed preparation namespace, distinct from the original one-source review key. Keep the UUID stable across retries and parser upgrades; upgraded proof that changes the same receipt's result must refuse, not create a second event.
- Lock the existing question/receipt, then inspect the unique review relation. Exact replay returns the same draft/review with its **actual** current status. Only `pending` with exact request can be labeled `PREPARED_UNSENT`; processing/completed/uncertain/failed is never represented as pending, and no replacement draft is created.
- If a matching calendar operation exists without the typed relation, refuse an orphan/conflicting replay instead of silently adopting it. If a relation exists but the operation/hash/body changed, refuse integrity and expose no actionable id.
- Concurrent requests for one receipt must converge on one relation/draft or get a safe serialization/refusal. No automatic retry may change the request id or repeat consumption; an operator may repeat a local read/reinspection of the same durable key after uncertainty, without new effects.
- First preparation should be a separate transaction **after** the reply receipt's known commit, or a future bounded authenticated local sweep. It must not turn failure to create a draft into uncertainty about an already completed incoming SMS. No new daemon/cron/route is authorized by this plan.
- The mobile review projection must gain an explicit two-source subject variant before exposing this draft for approval: both full SMS messages, original date anchor/timezone, exact quote links, clarified slot, local-time display and raw UTC, current draft hash/status. The historical original CLARIFY review stays intact. Until this surface exists, do not advertise the preparation as a usable approval workflow or expose a provenance-free actionable row through the generic draft list.
- Existing explicit calendar approval remains the only later write path. Do not start Google, synthesize a confirmation phrase, add a new shared expectation or automatically approve from this packet. A future SMS confirmation of the resulting exact draft is separate scope.

## Minimum falsifiable contracts and tests

1. Pure refactor: every existing live correlation/resolution test unchanged; completed-receipt input cannot enter live-source admission. Original/answer Unicode hashes and both exact citations survive. No source concatenation, fake phase/lease, changed year/date anchor, default duration or invented title.
2. Positive: complete one-ambiguous-slot original + exact accepted hour → same recomputed event and one pending draft, all authority/provider flags false. MINUTE/DST fold/gap, midnight reply, different timezone and two-ambiguous-slot inputs preserve existing closed behavior.
3. Reject REFUSED/CLARIFY/INSUFFICIENT packets, forged outcome/hash, alternate consumedReplyId, replay SID, wrong source/actor/workspace/identity, stale model fingerprint/credential/grants, changed Google account/timezone, altered original candidate, future/late acceptance, malformed historical lease and noncausal timestamps before any draft insert.
4. Native SQL: direct forged relation cannot bypass final exact linkage; late mutation after insert fails; legitimate calendar pending→processing→completed/uncertain and account revoke remain possible. UTC/New_York/Tokyo sessions produce equal stored values. No relaxed constraints or generic rejection oracle counted as proof.
5. Native two-backend concurrency: same receipt yields one relation/draft; cross-workspace same id refused; unrelated active shared question untouched; all existing permanent receipts/nonces and reserved USD/CAD budgets byte/value unchanged.
6. Fault injection: draft insert then relation failure rolls back draft; controls/deadline withdrawn after final write roll back; known commit/replay returns one exact id; unknown commit has no new request id or source rewrite. Parser-version mismatch refuses instead of guessing or regenerating history.
7. Projection/approval: both sources visible, raw/exact draft preserved, edited/missing draft not actionable, completed draft not offered again. Current approval backend receives its existing operation id/hash only after explicit user action; no provider call is part of this test campaign.

## Proposed implementation order and stop gates

First controller review of this document and freshness/schema decisions; then narrowly reviewed pure refactor + durable proof loader, still no draft. Next approve the minimal forward schema and transaction-aware prepare adapter with unit/direct-SQL/native concurrency tests. Finally add the typed read-only projection and bounded caller integration. Stop if completed-source proof requires pretending a live lease, an unsupported template needs invented fields, exact provenance cannot reach the review surface, or existing guards would need weakening. Do not activate external providers, broaden consent, change billing or market the whole product as ready.

## Approved tranche 1 implementation checkpoint

The controller approved only the pure extraction and typed read-only loader, including the conservative original expiry/pilot rule. `correlated-receipt-proof.ts` and `correlated-receipt-subject.ts` now implement this bounded inspection; no schema, draft preparation, caller, route, scheduler or approval integration was added. The loader requires explicit `enabled:true` and an existing STORE-enabled bounded SERIALIZABLE transaction, otherwise stays disabled or refuses. It does not create an execution flag.

The live APIs retain their checks and share only their evidence serialization/calculation. A real stored historical waiting snapshot is revalidated; the new current subject explicitly requires CONSUMED and two completed, attempt-1, lease-null sources. The recorded old claim is checked at its historical receipt time, not extended to the review time. The old packet, hashes and false pure-authority flags remain unchanged. The loader returns a provisional inspected subject (`committed:false`, `draft:null`), not a prepared action.

At 11:24:36 local on 2026-09-10, 24 new pure tests plus 30 loader tests passed (54/54), with root TypeScript and scoped ESLint passing. An earlier 10-failure test run was a harness error: the full fixture was passed to the strict packet-envelope schema; selecting its exact packet/hash fixed the test inputs, without weakening source validation. The older live evidence/resolution suites passed 71/71 after their core extraction at 11:15:47. Loader current-proof/SQL access is mocked in the new tests, so these receipts do not prove native SQL locks or database authentication. Independent source review is underway; the controller owns any later native run. No real provider or device was used.

Independent review reproduced a DB-clock regression at 11:29:46: 1 FAIL / 6 PASS, where the final clock moved backward before the already validated receipt and the loader returned an incoherent `inspectedAt`. The final read now refuses `finalNow < now` with `CORRELATED_RECEIPT_CLOCK_MOVED_BACKWARD`; it does not invent an adjusted time. At 11:30:27, author rerun of 54 new tests, 7 independent review tests and 71 legacy calculation tests passed 132/132. The reviewer preserves the isolated RED and is rechecking the exact fix. The controller is preparing native coverage through actual local outbox acceptance (injected synthetic HTTP) and the real incoming SMS consumer, not direct fabricated completed states.

The controller subsequently reported native 71/71 PASS and clean STOPPED at 15:31:59.443Z (`evidence/postgres-native-1789054275032`), including 8 real-local pipeline cases for this loader: synthetic HTTP acceptance → actual incoming SMS consumption → read-only proof under three session timezones, repeated read, refused receipt, owner/revocation/expiry. This remains synthetic provider transport, not a live provider test.

A second independent clock regression was reproduced at 11:32:46 (7 PASS / 1 FAIL): canonical current-proof time could precede a backward first loader-clock transition without being compared. The loader now requires a finite current-proof Date, immediately captures its millisecond value privately, and requires `currentProofTime <= firstClock <= finalClock`. Invalid or backward clocks refuse; mutation of the original Date during a later await cannot rewrite that boundary. At 11:33:54, 33 loader tests + 24 pure tests + 8 independent tests + 71 legacy tests passed 136/136. These changes postdate the 71-case native receipt and require its next coordinated native run before claiming native validation of the final source snapshot.
