# OFF temporal SMS registry — exact store and migration proposal

2026-09-10. Parent approved local OFF implementation and migration76 after the PB75 checkpoint. This document itself authorizes no database application or feature activation. The pure inspector/resolver is frozen and independently reviewed.

Implementation checkpoint: canonical read-only `review-proof` extraction, current owner/model/calendar reinspection and registry/store are written. Parent native receipts are preserved: migration76/outbox16 PASS (`evidence/postgres-native-1789046929790`); initial registry fixture1 PASS/16 FAIL before registry due a missing synthetic Google external-account hash (`evidence/postgres-native-1789047345889`); corrected fixture exposed the trigger's polymorphic `NEW` field error,12 FAIL/5 PASS (`evidence/postgres-native-1789047473968`). The approved forward migration77 fixes only trigger-table dispatch and retains every final proof check. The next native registry run reached16 PASS/1 fixture-only failure (`evidence/postgres-native-1789047793676`, revoked grant lacked empty grantedScopes). Both fixture errors were corrected without weakening production constraints. The extended suite then passed **19/19 on native PostgreSQL**, finished2026-09-10T13:48:21.061Z (`evidence/postgres-native-1789048079444`), including cross-owner/workspace pair reuse and two-backend last-slot cap contention. Its disposable server stopped cleanly;77 migrations applied. This is local SQL/injected-adapter evidence, not actual model/Twilio/Google or device proof. Both applied migrations remain immutable.

## Scope and public store contract

New `personal-assistant/sms-temporal-clarification-store.ts`; focused unit tests and a proposed native PostgreSQL fixture. No live worker, route, model dispatch, Google action or additional SMS preparation. Default return before any DB query is `{status:"DISABLED",executionAuthorized:false}` unless the future local `ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED` is exactly `true`. Merely implementing this check does not set the flag anywhere.

All InTransaction methods require a real caller-owned SERIALIZABLE transaction, original finite deadline and optional signal; SQL `statement_timeout`/`lock_timeout` are bounded by remaining worker time (maximum 2 seconds). They do not start nested transactions or wait for a network request.

Proposed signatures:

```ts
prepareSmsTemporalClarificationInTransaction(tx, {
  actor: {userId, workspaceId}, sourceClaim,
  modelChildOperationId, reviewActionId, questionOutboundOperationId,
  ttlMs?: number // >0, <=600000
}, env, {deadlineAt, signal?})
// PREPARED_FOR_SOURCE_COMMIT + id, requiredSourceReview, preparedHash;
// no new outbox/draft. Existing source final CAS is a required deferred condition.

markSmsTemporalClarificationAskedInTransaction(tx, {
  actor, clarificationId, questionOutboundOperationId
}, env, {deadlineAt, signal?})
// WAITING only with a CURRENT exact completed-outbox receipt carrying an
// immutable acceptedAt already persisted by ordinary outbox (415cfdf9).
// The automatic atomic WAITING hook is not yet integrated.

consumeSmsTemporalClarificationInTransaction(tx, {
  actor, clarificationId, replySourceClaim
}, env, {deadlineAt, signal?})
// CORRELATED_NOT_EXECUTED / REFUSED with fixed message and no calendar draft.
// Reload both sources/current bindings, replay pure inspection/resolution,
// consume source + question + permanent reply receipt atomically.
```

No method accepts caller-prepared identity/grants/proposal/receipt body/UTC event. Load them from current DB rows. The selected implementation extracts the existing read-only `review-proof` loader; it never invokes the draft-producing consumer. Inspect the locked child candidate and require one temporal clarification, then bind the exact review/question and full-wire pure packet. The original consumer delegates to the same loader with its existing draft loop unchanged; no second gateway is introduced.

Preparation loads the source's exact processing/attempt1/lease claim, owner/member/workspace epochs, unique current verified identity + COMMAND, SMS account/inbound grant, model account/grant, current Google account/write grant and source timezone. It inspects the existing child/gateway/Ai/decision/result evidence chain. Reconstructed proposal bytes use an explicitly versioned canonical serialization; original provider wire bytes are not claimed. All comparisons recur at WAITING and consumption; no historical binding revives a grant.

## Namespace — correction to early ADR

Use the EXACT legacy formula:

`sha256(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", ownerNumber, endveraNumber]))`

There is no workspace, actor, identity id or new protocol version in this namespace. Access checks remain owner/workspace-scoped, but uniqueness and limits apply to the visible pair globally. Never reset the existing confirmation phrase registry or rename its namespace. Validate E.164 before computing. SQL must reproduce JSON compact bytes, not a spaced `json_build_array(...)::text` representation.

## Three proposed durable tables

1. **PersonalSmsTemporalClarification**: id/actor/identity, source/child/gateway/action ids, existing ordinary question-outbox id, strict prepared/review snapshot/hash, canonical proposal version/evidence reference, question/request/full-wire hashes/version, phase PREPARED/WAITING/CONSUMED/EXPIRED/REFUSED, created/expires/accepted times, accepted SID, waiting packet/hash, consumed reply id, rejection count. TTL <=10 minutes. Scalar fields must agree with strict JSON. Source/child/question/reply FKs are composite `(id,workspaceId,createdByUserId)`; identity id FK alone must not freeze revocation/epoch changes.
2. **PersonalSmsTemporalClarificationReply**: permanent immutable outcome receipt, unique inbound operation id and SID; clarification+actor, exact input request hash/claim, ingress time, ACCEPTED or REFUSED, correlated packet/hash or closed refusal reason, createdAt. Composite FK to original reply operation and clarification. This makes each rejected SMS consume at most one of five attempts and prevents accepted/rejected source reuse after expiration. No deletion, truncate or identity-changing updates.
3. **PersonalSmsConversationExpectation**: shared ledger for both existing confirmations and new clarifications. Each row points to exactly one concrete subject through exclusive nullable FKs (confirmationId or clarificationId), has immutable id/namespace/createdAt/kind and mutable `active` mirror only. Historical rows cannot be deleted/truncated or reassigned. Partial `UNIQUE(namespace) WHERE active` enforces cross-type exclusivity in all workspaces. Creation history remains after terminal states, so rate limits cannot be reset by deleting a challenge.

Use UTC-naive PostgreSQL timestamps consistently: `clock_timestamp() AT TIME ZONE 'UTC'` for values, `(parameter::timestamptz AT TIME ZONE 'UTC')` for explicit instants; normalized returned instants. Test sessions UTC/New_York/Tokyo. No global cast/default changes.

## Shared ledger synchronization / five-per-hour guarantee

- AFTER INSERT triggers on BOTH subject tables create exactly one ledger row; existing confirmation code does not get to skip the guard. Take the same `pg_advisory_xact_lock(hashtextextended(namespace,0))` before checking history. Enforce `current_setting('transaction_isolation') = 'serializable'` for NEW subject creation: an advisory lock alone is not claimed to refresh a fixed transaction snapshot. Count all ledger creations in the prior hour; reject the sixth. Native overlapping cross-type/cross-workspace tests must prove one winner and no retries.
- Partial unique active namespace is an independent DB conflict fence. It applies even if application code misses a check. Existing confirmation phases PREPARED/WAITING/**CONSUMED** stay active until COMPLETED/UNCERTAIN/EXPIRED/REFUSED; temporal PREPARED/WAITING stay active, and terminal CONSUMED releases only after durable source correlation (no external action is in flight).
- AFTER UPDATE phase triggers mirror active status. A deferred ledger constraint re-reads CURRENT subject state and exact namespace, preventing hand-written ledger deactivation or orphan references. No terminal subject can be reactivated. Application may not directly rewrite ledger identity or history.
- Backfill all existing confirmation rows before enabling new triggers. Retain their original createdAt for historical counting and current active phases. Abort migration on contradictory active history rather than picking a winner or deleting records. Existing nonce tables/FKs/permanent phrase behavior remain unchanged.
- Enforcing SERIALIZABLE on creation can require updates to synthetic fixture transactions; it must not be silently relaxed to pass tests. Confirm production creation callers already meet the contract. No change is made until parent approves the migration scope.

## Source-final-CAS / immutable proof guards

- Prepare creates ONLY the registry row attached to the already-existing `reply:<sourceId>` outbox. Its exact request must equal the versioned full-wire question, matching `source.result.reply` at deferred commit. Source may be processing transiently but must complete with exact review and live claim CAS in the same transaction. A lost CAS rolls back outbox/registry/ledger together.
- BEFORE UPDATE guards freeze referenced source/child/question requests, identities and hashes; AFTER/DEFERRABLE checks freeze the relevant source review after first exact completion without blocking legitimate status/account/grant revocation. Query the CURRENT row at deferred time, not stale NEW values captured before subsequent updates.
- WAITING checks current authority, exact full outbox request/approval hash/completed attempt1/provider SID and immutable canonical `acceptedAt`. Ordinary outbox now persists this field atomically from its database clock (415cfdf9). It is not inferred from `updatedAt`. A future narrowly reviewed completed-outbox hook must attach WAITING in that same transaction. Native fixtures create synthetic exact receipts, labeled accordingly; they do not prove actual Twilio acceptance or delivery.
- Consume locks namespace, clarification, existing source/child/question, reply source and current authority in agreed order. Reply is newly verified, received strictly after acceptedAt, before expiry, with exact live attempt1 lease. Wrong/replayed/context-changed messages must not invoke any fallback model. A rejection receipt + counter + source final CAS are one transaction; success receipt + correlated result + CONSUMED + source final CAS are one transaction. Deferred source checks bind the exact receipt and final result. No calendar claim, operation, token, draft or execution is created.
- Current authority changes and SQL deadline/abort cause rollback. Expired question stays non-executable; bounded expiry bookkeeping can be a later separate function or reuse approved maintenance style. No grant, budget, nonce or provider hold is deleted/released.

## Falsifiable tests before declaring the registry complete

Unit: OFF before DB, malformed actor/claims, non-Serializable context, deadline before query/after lock, exact pair namespace parity, unsupported raw candidate refused before review consumer, full question equality, reordered canonical JSON evidence, missing acceptedAt, fake approvalHash/SID, changed membership/identity/model/Google grants, two-source hash mismatch, copied/expired/replayed reply, no draft/preparer/provider dependency invocation.

Native PostgreSQL (separate approved slot): complete migration application; exact source final-CAS rollback; partial source/child FK corruption; same pair/different owner/workspace and clarification-vs-confirmation race; one-active across kinds; six sequential creations across kinds with terminals between them; sixth concurrent creation race with five-history boundary; nonce/history preserved after expiry; cannot delete ledger/receipt or reactivate terminal question; old source ingress before receipt refused; missing immutable receipt refused; accepted/rejected reply replay increments once; fifth rejection closes question; consume/source CAS race leaves one receipt; UTC/NY/Tokyo timestamps; grant revocation not blocked by history; unchanged budget/operations except bounded registry and source receipt writes.

Native concurrency evidence is required. Unit SQL mocks or single-connection PGlite are not substitutes. No actual provider call, customer data, SMS, phone, OAuth, expense, build, push or publication is authorized here.

## Exact remaining limits before integration

- Only `RESOLVED_NOT_AUTHORIZED` can become an ACCEPTED correlation receipt. `INSUFFICIENT_ORIGINAL_TEMPLATE`, including CLARIFY-only or missing-end templates, remains REFUSED; no title/date/duration is invented. Preparation currently can preserve such a question, but it is **not** a functional missing-end recovery path. A later worker must prefer an immediate full-reformulation message or narrow eligible preparation rather than repeatedly asking for an hour it cannot use.
- Question TTL is capped by both10 minutes and the current pilot's end. Current model consent uses the existing canonical fingerprint helper, plus a locked non-revoked credential reference; no credential content is read. Lease strings are normalized to canonical ISO UTC before durable comparison.
- SQL checks packet status, hashes, immutable source lineage and time ordering. It does not implement a second temporal parser or claim that hashes authenticate an AI interpretation. The existing closed pure resolver is still the only date calculation path, and all result packets remain non-executable.
- The parent added DB-recorded `acceptedAt` to ordinary outbound completion separately. This registry has no automatic outbox-completion hook, inbound routing, selection/expiry maintenance, approval or execution integration. No runtime flag is activated.

## Subsequent controller integration checkpoint — 2026-09-10 14:43Z

The original boundary above describes the initial registry-only slice. The
working snapshot now contains the reviewed ordinary-outbox WAITING hook,
single-calendar question preparation in the existing SMS worker, standalone
OFF expiry maintenance and pre-LIMIT outbound scheduling exclusions. Native
`postgres-native-1789051241146` passes192/192 in16 isolated files with normal
cleanup, including45 temporal cases. Applied migrations76/77 remain immutable.
No runtime flags were activated. Incoming reply routing and protected
two-source calendar review remain separate unfinished steps. No provider
acceptance, delivery, human test or Google execution is claimed by these tests.
