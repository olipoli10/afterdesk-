# Correlated SMS receipt → calendar draft: proposed forward 78

2026-09-10. **PERSISTENCE DESIGN ONLY — NOT MIGRATED, NOT ACTIVATED.** Only the separately approved pure UUID/reference-envelope helpers are implemented locally; no preparation adapter or persistence exists for this subject.

Reconciled against source HEAD `57c69c44e66ee54acfce4990bc229bf915c4ca73`, the current worktree's receipt loader, schema through migration 77, and the complete `SMS_CORRELATED_RECEIPT_REVIEW_PLAN.md`. The controller owns migration numbering and later execution. “78” denotes the proposed next forward migration, not a file created by this document. No SQL, Prisma, product, route or mobile edits accompany this plan.

## Decision and exact missing seam

Reuse the accepted two-source receipt loader and `preparePersonalCalendarInTransaction`. Add one immutable review relation and one nullable provenance marker on the existing calendar operation. Do not create another gateway, action ledger, AiOperation, reservation, source claim, parser or execution path.

The current generic `personalCalendarActions` lists all owner-scoped `calendar_write` operations and returns only id/hash/status/draft. `PersonalGoogleConnection` can approve any returned pending row through `POST /personal/google/actions` (`APPROVE_AND_INSERT`). The backend claim currently checks calendar authority, not the new receipt provenance. `PersonalModelReviewList` is a separate, one-source review and uses that same approval API.

This is a **future integration risk**, not an observed disclosure of a correlated draft: this subject currently creates no draft. Creating one without the changes below would make it actionable without its two-source explanation. Filtering the UI alone would not prevent approval by a known operation id.

**Prerequisite before creating the first marked draft:** globally exclude marked/related operations from the generic list, and reject them in the canonical backend calendar claim/execution boundary. The first tranche keeps correlated approval unavailable, even to the owner. A later typed review/approval change must be separately reviewed; this plan does not authorize it.

## Alternatives considered

1. Put the result into original `personalModelReview`: rejected. It would replace protected historical CLARIFY evidence and pretend a one-source/live-processing interpretation.
2. Add provenance to `request` or version the existing calendar request: rejected. The strict stored schema and historical SHA-256 over schema-ordered `JSON.stringify` would change, affecting existing approvals and replays. No migration of old hashes is justified.
3. Relation only: insufficient for the strongest orphan invariant. A relation can hide a committed linked operation, but the operation itself has no durable origin discriminator when the relation is absent or creation fails. Relying on a UUID convention or a caller-supplied “correlated” Boolean is not sufficient.
4. **Chosen:** immutable nullable receipt marker at operation INSERT, plus an append-only relation required by a deferred final-state guard. Request bytes/hash remain unchanged. A marked orphan cannot commit, and the generic boundary refuses both a marker and any relation, independently.

The marker is provenance, **never authorization**. It is not a new status, approval token, budget or action claim.

## Proposed Prisma/SQL surface

All existing migrations remain unchanged. No backfill, date rewrite, reconstructed receipt, constraint relaxation or new state enum.

### Existing receipt: one scoped unique key

Add `@@unique([id, workspaceId, userId])` on `PersonalSmsTemporalClarificationReply`, backed by a simple SQL UNIQUE named `PersonalSmsTemporalClarificationReply_id_workspaceId_userId_key`. Its existing id, sourceOperationId and providerSid uniqueness remain intact. This enables tenant/owner-scoped foreign keys; it does not alter receipt immutability or consumption.

### Existing operation: one nullable marker

Add `PersonalAssistantOperation.correlatedTemporalReceiptId String? @unique` with no default other than NULL. Proposed SQL names:

- `PersonalAssistantOperation_correlatedTemporalReceiptId_key`: simple UNIQUE, many legacy NULLs allowed.
- `personal_correlated_calendar_operation_receipt_fk`: `(correlatedTemporalReceiptId, workspaceId, createdByUserId)` → receipt `(id, workspaceId, userId)`, `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- `personal_correlated_calendar_marker_kind_check`: non-NULL marker implies `kind='calendar_write'`, `sourcePersonalOperationId IS NULL`, and `modelGatewayOperationId IS NULL`.

Only a new calendar operation may receive this marker, **at INSERT**. An immediate guard prohibits changing it, including NULL→receipt, receipt→NULL, and receipt A→B. No retroactive adoption of an old generic draft. Every existing operation remains NULL and follows its existing behavior.

The source/child columns reserved for model candidates remain NULL. A calendar operation does not become an AiOperation or a new model subject merely because its provenance references the original model result.

### New `PersonalSmsCorrelatedCalendarReview`

An append-only preparation receipt, not an execution queue. Exact proposed scalar columns:

| Columns | Type and purpose |
| --- | --- |
| `id` | TEXT primary key, server-generated stable review id |
| `workspaceId`, `userId` | TEXT authenticated scope |
| `receiptId` | TEXT UNIQUE, one preparation per accepted receipt permanently |
| `clarificationId` | TEXT exact original question |
| `originalSourceOperationId`, `replySourceOperationId` | TEXT, distinct real completed SMS sources |
| `modelChildOperationId`, `modelGatewayOperationId`, `reviewActionId` | TEXT exact historical candidate/action lineage, not new execution |
| `calendarOperationId` | TEXT UNIQUE, exact existing calendar draft |
| `calendarRequestId` | TEXT canonical UUID, kept compatible with the existing request payload |
| `calendarRequestHash` | TEXT lowercase 64-hex historical request hash |
| `connectorAccountId`, `accountVersion` | TEXT + INTEGER exact Google account snapshot, version positive |
| `packetHash` | TEXT lowercase 64-hex, equal to the immutable accepted reply packet hash |
| `reviewVersion` | TEXT literal `personal-sms-correlated-calendar-review-v1` |
| `proof` | JSONB strict minimal eight-key envelope described below |
| `proofHash` | TEXT lowercase 64-hex, hash of canonical `proof` only |
| `authorityRef`, `pilotExpiresAt` | TEXT + TIMESTAMP(3), exact current pilot mandate pinned as scalars, never inferred from an environment inside SQL |
| `createdAt` | TIMESTAMP(3), assigned by BEFORE INSERT trigger to millisecond-truncated UTC `clock_timestamp()`; caller backdates cannot survive |
| `preparationExpiresAt` | TIMESTAMP(3), exact minimum of original question expiry and pinned current pilot expiry |

No phase, lease, attempts, approval, billing, transcript, recipient or full SMS columns. Actual action status is always reloaded from the calendar operation.

Scoped FKs, all restrictive (not cascading history deletion):

- `personal_correlated_calendar_review_receipt_fk`: `(receiptId,workspaceId,userId)` → reply `(id,workspaceId,userId)`.
- `personal_correlated_calendar_review_question_fk`: `(clarificationId,workspaceId,userId)` → clarification `(id,workspaceId,userId)`.
- Four separately named FKs `personal_correlated_calendar_review_{original,reply,child,calendar}_fk`: corresponding operation id plus workspace/user → operation `(id,workspaceId,createdByUserId)`.
- `personal_correlated_calendar_review_gateway_fk`: `modelGatewayOperationId` → existing gateway id; final guard validates its tenant, original AiOperation and child relationship.
- `personal_correlated_calendar_review_account_fk`: `(connectorAccountId,workspaceId)` → connector account `(id,workspaceId)`.

Simple UNIQUE names on `receiptId` and `calendarOperationId` follow Prisma's table/column convention. Index `(workspaceId,userId,createdAt,id)` supports a bounded future owner projection. The calendar operation's existing idempotency key already enforces request UUID uniqueness per workspace; no redundant global UNIQUE on calendarRequestId is needed.

All new identifier inputs use the existing registry's nonempty, maximum-191-character bound; fixed hashes/UUIDs/versions have their exact narrower formats. Add CHECKs for positive accountVersion, different source ids, strict hash forms, the fixed reviewVersion, and `createdAt < preparationExpiresAt`. The database independently validates JSON byte/type bounds; a TypeScript-only schema is not a SQL integrity guard.

Do **not** create foreign keys to mutable account/grant versions or membership epochs. Those are compared at use time, not constrained to stay valid forever. Revocation/reconnection/membership updates must remain possible.

## Reference-only proof format

Controller arbitration reduces duplication: strict envelope, maximum 16 KiB canonical UTF-8 serialization, **exactly eight keys**:

1. `version: 'personal-sms-correlated-calendar-reference-v1'`.
2. `receiptProofVersion: 'personal-correlated-receipt-proof-v1'` (the actual producer version).
3. `inspectedReceiptProofHash`: lowercase 64-hex hash returned by the canonical receipt inspector. This is a comparison pin, **not proof that inspection occurred**.
4. `titleNormalization: 'EXISTING_SCHEMA_TRIM_ONLY'`.
5. `draft`: exact normalized title/start/end/timezone proposed for the existing preparer.
6. `executionAuthorized: false`.
7. `semanticInterpretationVerified: false`.
8. `sourceAuthority: 'NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT'`.

Do not repeat sources/citations, prepared/binding/evidence/resolution hashes, anchor/timezone, receiptId/packetHash or resolver/grammar versions in this JSON. The receipt/question/packet already preserve them and the relation's scalars bind them. Reload both sources and citations from those immutable references during future projection. The source citation offsets retain their original JavaScript UTF-16 convention; never reinterpret them as PostgreSQL character offsets. The builder returns receiptId/packetHash **beside** this envelope for future scalar insertion, not as additional proof fields.

`authorityRef` and `pilotExpiresAt` are scalar pins checked against the exact approved mandate and question expiry; the SQL trigger cannot consult a fictitious environment. SQL checks exact JSON shape/byte bounds/hash and exact draft equality to the operation and historical resolved packet. Existing deterministic TypeScript inspection must reconstruct the receipt and the minimal envelope before insertion and at future typed projection; standalone shape/hash validation does not establish current DB authority or semantic validity. No token, credential, phone number, SID or full SMS copy.

For request integrity, do not hash raw JSONB text or canonical sorted JSON as a substitute for the existing calendar hash. Reconstruct the existing six fields in exact producer order (`title, startsAt, endsAt, timezone, accountVersion, requestId`) using exact JSON string encoding and strict types, then hash. Strings containing NUL or lone UTF-16 surrogates are refused before persistence because PostgreSQL JSONB cannot represent them. Title mapping must match the complete ECMAScript String.trim whitespace set, including NBSP/BOM; default btrim is not equivalent. Native tests must compare SQL reconstruction to the existing JS producer for reordered JSONB, accents, astral characters, escapes, controls and whitespace. If exact serializer/trim parity cannot be demonstrated, stop rather than rewrite historical hashes.

## Proposed trigger contract, not SQL implementation

### Immediate immutability and initial shape

New functions/triggers use a distinct `sms_correlated_calendar_` prefix; no replacement of the migration-77 polymorphic trigger is necessary.

1. `sms_correlated_calendar_review_guard`: before INSERT/UPDATE/DELETE. Only INSERT allowed; strict scalar/proof shape/hash, distinct sources and scoped pins required. A separate statement trigger rejects TRUNCATE. FK restrictions preserve referenced rows; this does not grant general protection against a privileged database administrator.
2. `sms_correlated_calendar_operation_guard`: before INSERT/UPDATE. Reject marker changes. Marked INSERT must be `calendar_write`, pending, attempts 0, lease NULL, result NULL, externalTransportPerformed false, budgetId/reservedCadMicros NULL, with the unchanged request schema/hash and stable idempotency key. On later UPDATE preserve id/scope/actor/account/kind/request/hash/key/createdAt/marker/model-lineage columns, but do not freeze legitimate status/result/lease/attempt changes forever.
3. First implementation's backend rejects marked calendar claims and forged executions unconditionally. SQL need not invent an approval phase or mutable consent Boolean to represent a future feature. Before enabling typed approvals later, review all transitions and add the actual typed claim proof to the existing canonical execution path; no generic bypass switch.

### Deferred final transaction checks

`sms_correlated_calendar_final_binding`, invoked by constraint triggers after review INSERT and marked operation INSERT, `DEFERRABLE INITIALLY DEFERRED`:

- Dispatch by `TG_TABLE_NAME` with explicit IF branches; never reference a field absent from the current trigger row through a polymorphic CASE. Reload the **current final row** by the original trigger row id, not the stale queued NEW snapshot.
- If invoked for an operation, require exact `NEW.id = review.calendarOperationId` and marker equals review.receiptId. If invoked for a review, require that exact review id still exists. Require exactly one review and exactly one marked operation; orphan marker/relation, alternate review, replacement or attaching a second draft fails commit.
- Receipt is accepted, clarification is CONSUMED and consumedReplyId is that receipt; scalar scope, question, action, child/gateway ids equal the actual immutable question/packet. Original and answer sources are distinct completed attempt-1 lease-null inbound operations; both exact envelopes/hashes and the answer's result receipt/hash match. Compare the original protected CLARIFY review unchanged. Reuse established hash helper semantics and the migration-77 lineage predicates, not a fabricated historical claim.
- Permanent expectation `temporal:<questionId>` exists, names this question/namespace and is inactive. Do not require the entire namespace to have no other active expectation; a later unrelated question must be unaffected.
- The calendar operation is still exact pending/attempt-0/lease-null/result-null/no transport/no new budget in the final transaction state. Same scope/account/version/request UUID/body/hash as the relation and recomputed snapshot; marker exact. An insert followed by an attempted claim in the same transaction cannot commit as a prepared review.
- `createdAt` is forcibly assigned by BEFORE INSERT to DB UTC clock truncated to milliseconds, not a default alone and not supplied from an old SMS. At final check, `createdAt <= DB now < preparationExpiresAt`; expiry equals the exact minimum of question expiry and the scalar pinned pilot expiry. `authorityRef` and `pilotExpiresAt` must match the approved literal mandate; an arbitrary proof or caller date cannot extend it. All raw Date-to-naive bindings use `($n::timestamptz AT TIME ZONE 'UTC')`; naive comparisons use UTC clock expression. SELECT instants/JSON ISO values retain timezone semantics.

These deferred checks run on initial creation, **not every later action status change**. A later authorized processing/completed/uncertain transition, or current account/grant revocation, must not fail because an immutable preparation once required pending/current permissions. Current-authority checks remain server-owned, row-locked and reloaded; SQL history checks do not replace them.

The existing registry already protects source/child requests and completed source results. Add only narrow calendar request/marker identity protection for this relation; do not broaden source immutable triggers to block account disconnect or legitimately mutable authorities. Do not rewrite original review JSON, old packet flags, source result, gateway/AiOperation, expectation or historical claim.

## OFF preparation adapter and exact ordering

Proposed new server-only module `model-gateway/personal-intent/correlated-calendar-review.ts`. Proposed explicit gate `ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED === 'true'`, default OFF, in addition to the existing registry STORE and exact current pilot gates. No environment activation, worker import, route, scheduler or public API in the persistence tranche.

Public-to-server input remains actor + typed receipt id + bounded deadline/signal and explicit enabled option. No caller draft, dates, request UUID, proof, account, marker or source lease. Copy/parse inputs before awaits.

One SERIALIZABLE transaction, existing bounded SQL timeouts, no network:

1. Discover receipt scoped, use existing namespace advisory → question UPDATE lock → receipt SHARE lock → existing current binding/evidence lock order. Do not add a provider/day advisory or acquire a calendar row ahead of the canonical question/source order.
2. Inspect unique relation under this serialization. An existing relation follows a **read-only exact-replay path**, returning the same actual operation state after authenticated ownership/integrity checks. It does not call the preparer or extend expiry. Historical viewing after creation expiry needs a distinct reviewed read boundary; until available, conservative refusal is acceptable, not a fresh draft.
3. For first creation, invoke the real completed-receipt loader, including both current-proof and final DB clock monotonic checks. Recompute the exact one-action draft from its inspected evidence; no concatenation, default duration or reused live-source lease.
4. Proposed deterministic request UUID algorithm: SHA-256 of UTF-8 `personal-sms-correlated-calendar:v1` followed by one NUL byte and the exact receipt id; take the first 16 digest bytes, set the UUID version nibble to 8 and the RFC variant bits to `10`, then format lowercase canonical UUID. This fixed preparation namespace is independent of parser/review versions and never rotates to reset uniqueness. A SQL helper and TypeScript helper must share test vectors, including Unicode and id bounds. Query the existing full idempotency key. If any operation exists without the matching review, refuse orphan/conflict; do not adopt, mark, reset or delete it.
5. Extend **only the internal transaction-aware preparer** with a narrowly typed optional origin `{kind:'personal_sms_temporal_receipt',receiptId}`. It must set the marker at creation, verify matching marker on replay, and reject any public/unmarked call attempting to replay a marked operation. The public ordinary PREPARE schema/wrapper remains unable to accept origin. Request construction/hash and all legacy behavior remain unchanged for origin absent.
6. Insert the marked operation through that preparer, then re-read exact request/actor/account/state and create the immutable relation. No new budget or model call. Failure of either insert or any later check rolls back both.
7. Current owner/account/grant evidence locks remain held until commit. Recheck literal gates, original deadline/signal and finite monotonic DB time after awaits and before returning from the transaction. Unknown commit yields no claimed fresh success and no automatic retry or new UUID; only a later exact read may resolve it.

Return only a known-commit receipt such as `CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT`, review id and exact draft status, `executionAuthorized:false`, `preparationProviderCalls:0`, `newBudgetReservations:0`, `approvalAvailable:false`. Do not describe the whole historical pipeline as zero-provider or synthetic unless actual evidence says so. Callback-local result is provisional until transaction commit resolves.

## Required generic isolation and later typed review

Before any producer can create a marked operation:

- `personalCalendarActions`: include only operations with marker NULL **and** no review relation by calendarOperationId. The exclusion subquery is global, not restricted to the relation's claimed actor/workspace. A malformed or foreign relation must hide/refuse, never fall back to generic display. Apply exclusion before LIMIT.
- Canonical `lockWrite`/claim and execution reload: reject non-NULL marker **or any relation** before claim/effect, including direct POST operationId/hash and forged legacy claim objects. Recheck persisted origin, not a caller kind. Keep legacy NULL/no-relation actions unchanged.
- Ordinary PREPARE must not return a marked operation through the existing UUID replay branch. Merely hiding GET is insufficient.
- Do not add the new draft to the old source's model-review actions, SMS ACK, confirmation summary, shared expectation or automatic outbox.

Future owner-only typed projection can return review/receipt id, both exact SMS texts loaded from source references, their source ids/hashes/receivedAt, original anchor/timezone, exact citations, clarified slot, normalized title with original quote, raw UTC/local display and current exact calendar request/hash/status. It must fail closed if any source/draft/evidence is unavailable or changed. Request/global actor context and UI in-flight epochs must remain pinned. The existing one-source UI does not meet that contract merely by showing the latest reply.

No “synthetic transport” label may be inferred from SID shape, no “delivered” claim from acceptedByProvider. Use actual recorded provenance, or UNKNOWN. A read is not semantic verification, approval or receipt consumption. Later typed approval must bind this review and exact draft, revalidate current authority and route through the existing one-attempt executor; that change remains out of scope.

## Minimal implementation/review sequence and tests

1. Controller arbitrate marker + table + freshness/retention; no implementation before that decision. Coordinate sole Prisma/migration ownership, generate only local client, read SQL independently before any native run.
2. Implement generic list/replay/claim/forged-execution exclusion **with producer still OFF and unimported**, then internal marker-aware preparer, immutable relation and prepared-only adapter. No mobile action or worker wiring.
3. Unit tests: OFF before DB, strict actor/subject, exact existing producer request hash, Unicode citation/title normalization, all old preparer cases unchanged; changed packet/current authority/clock/expiry refuses before insert; late gate withdrawal rolls back; same-receipt replay never prepares again.
4. Native direct-SQL negatives: wrong owner/workspace/scoped FK, alternate question/reply/child/gateway, changed scalar/proof hash, duplicate receipt/calendar/marker, NULL→marker adoption, marker removal, orphan operation/relation, second relation with copied ids, claim-before-preparation-commit, stale expiry, update/delete/truncate refusal. Assert exact expected constraint/error, not generic rejection.
5. Native atomicity: relation failure rolls back new draft; changed source/draft after insertion cannot commit; unrelated active expectation preserved; no old result/request/AiOperation/hold/ledger bytes or amounts changed.
6. Native two-backend race with real barriers: concurrent same-receipt prepares produce one exact relation/draft or a safe serialization error, never two; exact replay after unknown-commit observation returns that one row without new consumption/reservation. No automatic retry or modified idempotency key.
7. Native three transaction timezones UTC/New_York/Tokyo: same Date binding/storage/hash, expiry at real DB time, JSONB reordered hash parity including supplementary Unicode. No UTC-forcing harness to conceal implicit conversion.
8. Generic boundary tests: marked pending row, valid relation, malformed/foreign relation, known operationId/hash and ordinary UUID replay cannot become actionable; ordinary unrelated drafts remain visible/approvable under their old contract. Test backend before effect, not just mobile button absence.
9. Revocation remains possible; no composite mutable-version FK. Historical request/marker remains immutable. When future typed approval is approved, add positive real one-attempt processing→completed/uncertain and recovery compatibility tests; do not falsely count current unconditional claim refusal as proof of a usable correlated approval workflow.
10. Only after schema/adapter/native/generic isolation are reviewed, separately implement bounded typed read-only projection and mobile two-source display. Enabling preparation, scheduling it, typed approval and provider execution remain separate explicit decisions.

## Retention and stop criteria

Keep existing permanent question/reply/non-reuse history. New storage contains scalar references, the minimal proof hash envelope and necessary exact draft, not copied citations, full texts or phone numbers. This does not reduce or extend existing source retention. If current retention makes a referenced payload unavailable, projection refuses actionable output; do not recreate text from the model. A future lawful deletion/retention design needs its own reviewed tombstone/FK policy and must not silently delete non-reuse history.

Stop if preserving the relation requires editing historical result/hash bytes, fake processing leases, new cost reservations, a second executor, unsupported semantic reconstruction, current permission epochs made permanently immutable, or creation of an actionable generic row before two-source review. No product-wide readiness, live provider success or billing settlement follows from this local design.

## Approved pure-helper checkpoint, before persistence

The controller approved only `correlated-calendar-id.ts`, `correlated-calendar-proof.ts` and their new unit tests, with the eight-key proof reduction above. The builder invokes the real durable receipt inspector on private snapshots; it returns receiptId/packetHash for future scalar bindings and a proposed request UUID, but `calendarOperationId:null`, `approvalAvailable:false`, `persistencePerformed:false` and no execution authority. The standalone proof validator checks structure/canonical bytes/hash only; a caller can compute a hash, so this does not prove a DB inspection occurred. Future adapters/readers must reconstruct from current authenticated durable facts.

At 11:59:04 local, 34 new helper tests and 24 unchanged durable-receipt tests passed (58/58); full TypeScript and scoped ESLint then exited 0. UUIDv8 compatibility is exercised against the installed Zod UUID validator. Tests include fixed Unicode/191-character identifier vectors, invalid identifier NUL/surrogate rejection, exact eight-key JSON, no source/quote/phone/SID copies, accessor/cycle/UTF-8 bound refusal, actual receipt hash/semantic reinspection, and NBSP/BOM/tab/newline/U+2028/U+2029 trim through the real existing draft schema. These are local synthetic unit tests, not SQL/DB authentication or provider proof. Independent helper review and the controller's separate native serializer probe are pending; no migration, schema, adapter, preparer or caller change is included in this checkpoint.
