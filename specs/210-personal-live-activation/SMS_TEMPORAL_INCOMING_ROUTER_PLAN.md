# Incoming SMS temporal clarification — design only

2026-09-10. Controller-requested analysis after the durable registry, question lower and ordinary-outbox hook. No router, worker, schema, dispatcher or flag change is implemented by this document. No provider call or calendar draft is authorized here.

## Demonstrated current seam

- `sms-worker.ts` owns verified ingress re-admission and the exact inbound received0→processing1 lease. It currently checks the reserved calendar-confirmation phrase first, then exact calendar-day read, then the model/legacy branch. The new temporal question preparation happens later in source finalization.
- `consumeSmsTemporalClarificationInTransaction` already reloads the current owner/identity/SMS/model/calendar proof, exact new source claim, one active shared expectation, canonical question acceptance and causal ingress time. It invokes the existing two-source closed resolver, persists a permanent ACCEPTED/REFUSED receipt, changes the question phase/counter, and completes the reply source with its exact live lease CAS **in the same transaction**. It returns a provisional receipt id/hash/reply, not a calendar draft.
- Only `RESOLVED_NOT_AUTHORIZED` is accepted. The existing registry return status `CORRELATED_NOT_EXECUTED` does not mean Google was contacted. Source completion is already owned by the consumer; another generic final-CAS/model pass would be a duplicate processing bug.
- `acceptedAt` is the DB-recorded observation of provider acceptance, not delivery or reading. A bare hour after delayed SMS delivery can remain semantically ambiguous even though its persisted causal checks pass. Current non-executable status must remain explicit.

## Proposed routing decision — before any interpreter

Order after source claim: existing reserved `CONFIRME ENDVERA AGENDA` predicate/handler first; the existing closed whole-message calendar-day read may run independently without consuming any temporal attempt; temporal reservation inspection precedes every model/legacy path. No temporal failure/disabled/ambiguous result becomes permission to fall through.

Use only the actual claimed inbound id/owner/workspace/attempt1/lease plus original deadline and signal as input. Reload its exact stored envelope/hash/createdAt, verify current source claim and SMS identity under existing server-side checks, then derive the existing shared namespace from ownerNumber/endveraNumber. Never take a clarification id, reply text, account, target time or action from model output or caller-supplied text.

1. Read the pair without a source row lock, acquire the shared namespace advisory lock, then inspect `PersonalSmsConversationExpectation` for that namespace with LIMIT2. Re-read before any consumption. Do not lock the ledger before its concrete question: existing consume order is namespace→question→bound current proof→reply source→ledger. The router must not introduce the reverse order.
2. Join the concrete subject by the ledger's typed FK and validate its exact namespace, active mirror, actor/identity and phase/expiry using DB time. Read only minimum ids/phase/pins; a row owned by another actor is an unavailable context, never permission to reveal that actor's question or consume it. More than one active row or a broken mirror is an invariant refusal, not selection of the newest row.
3. Reserved calendar vocabulary retains unconditional priority, including quoted/malformed/negative variants and OFF states. A plain hour is never a calendar-confirmation approval. An active CALENDAR_CONFIRMATION subject is not interpreted as a temporal question. After reserved-vocabulary and independent-day-read priority, any remaining message with an active calendar expectation receives fixed `OTHER_CONTEXT`, without model fallback or attempt consumption. New-command/cancellation grammar while that context remains active is separate scope.
4. Active owned temporal WAITING + exact current consume switches: route only a closed whole-message **time-shaped reply**, not every unrelated command, through the existing temporal consumer. Share a narrowly reviewed shape classification with the existing `explicitTimeLiteral` parser (valid / ambiguous-or-invalid time literal / not a time literal); do not duplicate its regex. This permits `14h` and treats `3h` as a bounded ambiguity refusal without mistaking a complete unrelated command for an answer. Exact calendar-day reads remain independent and burn no attempt. Other full commands while a temporal question is active need a separate explicit routing decision; the initial conservative proposal is a fixed message asking which request to continue, with **no consume/counter increment and no model fallback**, rather than silently treating them as clarification attempts. Cancel/new-task grammar is separate scope.
5. PREPARED/not accepted, expired-but-unmaintained, foreign/revised identity, no unique subject, revoked controls or OFF consumer: return a fixed context-unavailable disposition and no model fallback. Do not burn an attempt on a non-causal or unauthenticated reply. OFF reservation inspection must still detect existing durable questions; feature switches may stop processing, not erase the namespace.
6. With no active temporal question, a bare explicit hour such as `14h` or `14:00` should receive a fixed missing-context response rather than incur an AI call, whether or not a past question exists. This also prevents maintenance from erasing the routing protection by marking a question EXPIRED. Reuse/export the existing closed explicit-time lexical helper after a narrow review; do not duplicate its grammar. No claim is made to recognize every malformed time-like phrase. Full new commands with no active temporal context may proceed through the unchanged normal interpreter path.
7. A DB lookup failure is not proof that no question exists. Fail closed and preserve source uncertainty; never run the model on that same source as a recovery strategy. A lookup finding no active subject is not enough to ignore the closed bare-hour guard.

## OFF/flag contract

- Reservation inspection is a safety discriminator for the installed registry and must not disappear when STORE/BRIDGE/REPLY processing flags are OFF. It never mutates a question or approves anything. A deployment without the required schema fails closed, not a hidden old-router fallback.
- Proposed consumer gate: existing `ENDVERA_PERSONAL_SMS_WORKER_ENABLED`, `ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED`, `ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED`, and new `ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED` all exact `true`, plus existing current pilot/authority checks. No flags are set by this work.
- `ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED` governs creation of new questions, not permission to fabricate/replace an answer. Whether turning it off should also stop existing replies is a controller policy choice; default proposed reply processing is governed by its own explicit gate. Turning STORE/BRIDGE/REPLY off between selection and completion must abort the transaction.
- Pin the chosen route before awaited work; do not enter a new branch retroactively on an OFF→ON transition. Recheck OFF/deadline/abort after every await, after outbox insertion and after the source CAS, immediately before returning from the transaction.

## Atomic outcome and acknowledgment

Use a small dedicated lower worker in `personal-assistant`, not another gateway/interpreter. Its SERIALIZABLE transaction has bounded SQL timeouts, namespace-first order and the existing original process35s/batch50s deadlines; no renewed independent timeout.

For an eligible WAITING question:

1. Call `consumeSmsTemporalClarificationInTransaction` with the exact reloaded actor/question id/source claim.
2. Require only `CORRELATED_NOT_EXECUTED` or `REFUSED`, never generic truthiness/DISABLED. The consumer's receipt + question counter/phase + reply source completion are still provisional.
3. Insert the existing ordinary self-only acknowledgment outbox request (`reply:<newSourceId>`) with **exactly** `result.reply`, from/to from the authenticated new envelope, and exact request hash. No registration of this acknowledgment as another temporal question; no truncation or replacement that breaks source.result.reply equality.
4. Check current flags/deadline/signal after the awaited insert and before transaction return. If any assertion or insertion fails, rollback the receipt, question transition, source completion and acknowledgment together. Never catch and rerun the model inside this source's outer flow.
5. Only after known commit return `TEMPORAL_REPLY_HANDLED_NOT_EXECUTED` (internal proposed status) with acknowledgmentPrepared and receipt id/hash. The outer SMS worker returns its existing completed result immediately: no second source CAS, model, legacy engine, Google read, calendar prepare or provider dispatch.

For fixed unavailable/no-context outcomes, reuse the existing authenticated self-reply finalization path, explicitly marking the branch handled and no interpretation performed. Where current identity/send consent is revoked, do not create an acknowledgment to an unverified recipient. The inbound operation can be retained uncertain/refused using its existing exact lease-preserving path; failure is not action authority. Do not write a fake temporal receipt for a source that the consumer refused as non-causal.

Replay: a completed source never claims again. An existing permanent receipt prevents a second consume and a duplicate rejection count. Unknown commit/timeout is not retried; existing inbound recovery may retain uncertainty, but cannot release the question/budget or re-run an interpreter. The ordinary outbound dispatcher retains its own approval/hold/one-use/deadline rules, separate from acknowledgment preparation.

## Correlated review is a later canonical gateway step, not part of routing

The current stored packet is evidence, not an accepted calendar intent/action. A later `personal-intent` review entry must reload the permanent reply receipt, registry snapshot, original proposal/gateway/AI lineage and both distinct sources; revalidate their exact hashes/citations/original anchor, plus current owner/model/calendar permissions. It must have an explicit typed **durable correlated-receipt subject**, not a fabricated single SMS or a pretend processing claim for a source already completed.

Historical replay of the original pure resolution must be labeled historical and use the recorded claim/receipt/time proofs; current authority must be checked independently. Never pass a hand-written `status:'processing'`/`alreadyConsumed:false` merely to satisfy the live correlator after consumption. The canonical draft-preparation contract must explicitly accept two-source provenance and bind the actual prepared draft/hash back to that receipt before any UI approval. Whether this needs an additional operation relation/SQL guard is a separate design decision.

Until that typed gateway seam and its proof are implemented, the answer says only that the precision was saved with the original request and that no calendar event was created or sent to Google. Do not call `preparePersonalCalendar*`, the legacy review consumer with synthesized source text, Google APIs, or the calendar-confirmation executor from this router. No second model call is necessary to correlate a closed explicit hour.

## Required falsifiable tests before wiring

- Reserved calendar phrase always wins over active temporal context; plain hour never confirms calendar action.
- Active WAITING→real consume→receipt/source CAS/outbox atomic commit for accepted and rejected time-shaped replies; exact acknowledgment equals stored source reply. Replay changes neither counter nor outbox count. An exact independent day read and an unrelated full command do not burn temporal attempts.
- OFF existing question, PREPARED without acceptance, expired/terminal question, foreign actor/shared namespace, revised identity, multiple/broken ledger, lookup failure: **zero model/legacy/calendar/provider calls** and no accidental attempt consumption.
- No active context + bare explicit hour has deterministic no-context result even after expiry maintenance; unrelated full command without temporal context preserves current behavior.
- Withdrawal/deadline after lookup, after consume CAS, during acknowledgment insert and immediately before callback return rolls back all provisional writes. No post-commit fallthrough after callback/transport uncertainty.
- Real native PostgreSQL distinct-backend concurrent replies and unique shared namespace, same source replay, current grant revoke and exact lease expiry, UTC/New_York/Tokyo. Preserve existing source fencing35s/batch50s and all prior calendar/read/model tests.
- Bound snapshot and byte-preserved French/Unicode source quotes; no fake date/title/duration, draft or Google approval.

## Separate queue concern already reported

The original `outbound-queue.ts` ordinary reply branch lacked temporal-state exclusion, so an expired attached question could remain oldest pending while the locked outbound gate correctly refused it. The separate scheduling-only selector tranche now filters terminal/expired/OFF attached questions before the limit; its scope and remaining scheduling limits are recorded in `SMS_TEMPORAL_OUTBOUND_SELECTION_PLAN.md`. This selector is never authority and does not replace locked current checks.
