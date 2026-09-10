# Temporal question → ordinary outbound → WAITING: proposed atomic hook

2026-09-10. Local implementation in progress by the main controller; no activation. The existing ordinary completion records `acceptedAt` using its database clock (415cfdf9). Registry76 with forward correction77 passed19 native cases. The question remains a strict `reply:<originalSourceId>` outbound, not a new sending capability or a calendar approval.

## Closed source classification

An ordinary outbound can optionally be attached through the unique `questionOutboundOperationId` to one temporal registry row. Always discover this attachment before authorizing an existing row: when an attached registry exists but its feature/bridge switch is OFF, refuse the send rather than falling back to the ordinary branch. A missing attachment preserves the current ordinary behavior. No text matching or model proposal may fabricate an attachment.

Proposed frozen proof (never execution authority):

```ts
{
  kind: "TEMPORAL_CLARIFICATION",
  clarificationId, namespace, preparedHash, bindingHash,
  questionRequestHash, sourceOperationId,
  expiresAt, fingerprint,
  ordinarySource: { id, requestHash, requestJson, resultJson },
  executionAuthorized: false
}
```

The ordinary equality checks stay mandatory: owner/workspace, current verified self number, `request.sourceOperationId`, exact `reply:` key, exact original source `result.reply`, both numbers and full request hash. Current model/Google authority and prepared proof checks are **additional** restrictions, not substitutes. Existing standing self-SMS response consent and budget controls remain required; no auto-consent, reminders, third parties or group messages.

The common registry reader lives in `sms-temporal-clarification-proof.ts`, above the existing lower authority module and below store/outbox consumers. This avoids an import cycle while extracting the store's private reinspection helpers without changing their checks. The outbox must not import a future worker or create a second gateway/registry. The full-wire formatter and version remain unchanged.

## Lock order and one-attempt fencing

1. Read the outbound attachment without a row lock to identify its stored namespace; then acquire that namespace's advisory transaction lock.
2. Lock the temporal question, then current original source/child/owner/identity/grants and immutable evidence. Verify PREPARED, TTL, actor, exact full question and shared active ledger.
3. Only then take the common outbox authority/approval/budget locks and retain the existing exact ordinary source proof. The initial claim, pre-HTTP gate and post-response transaction must all use this order. Adding the registry check **after** the common outbox lock creates a lock-order inversion against preparation/consumption.
4. Pin the temporal proof in the existing immutable claim. Bound its lease to `min(original deadline, approval expiry, temporal expiresAt)` as done for calendar-confirmation sources. Recheck exact fingerprint and expiry under locks, followed by a final synchronous live/flag check immediately before the callback.
5. Preserve the existing unique claim nonce, exact result/attempt/lease CAS, maximum one provider invocation, full reserved budget and uncertainty on unknown outcomes. Do not await network I/O inside a database transaction.

## Atomic accepted receipt attachment

Inside the existing post-response `withOutboundClaim` transaction:

1. Reinspect the same temporal proof and current grants before terminalization.
2. Existing exact outbound CAS records completed/attempt1/leaseNULL, validated SID/approval hash and DB-observed `acceptedAt`.
3. Invoke `markSmsTemporalClarificationAskedInTransaction` with the exact actor/question/outbound ids and **the same original deadline/signal**. It reads that just-written receipt and sets WAITING; there is no nested transaction. Require its status to equal `WAITING_FOR_TEMPORAL_REPLY`; a `DISABLED` return is a refusal, not successful completion.
4. Recheck live flags/deadline, then commit once. Failure of WAITING/source/authority/deadline rolls the receipt CAS back too. The existing uncertainty cleanup retains the one-attempt fence and full budget; it must not send again or claim that the SMS was delivered.

If HTTP accepted the message but the final transaction fails, the registry stays PREPARED and the outbound becomes uncertain. This deliberately does not fabricate a durable accepted question. A future inbound classifier must not fall back to the model when an unresolved attached conversation owns the pair. Expiry/reconciliation is a separate bounded bookkeeping step, never a resend.

`acceptedAt` is when the DB recorded the validated REST receipt, not the provider's exact acceptance time. A reply received before that recorded instant cannot prove causal response to this question; refuse it. Never replace it with `updatedAt`, current application time or claimed delivery time.

## Required local tests before wiring can be accepted

- Normal ordinary reply with no temporal attachment remains byte-for-byte unchanged; read-disclosure and reserved calendar-confirmation text guards remain active.
- Attached but OFF/expired/revoked/mismatched question refuses before approval/pre-HTTP; no ordinary fallback.
- Exact attached PREPARED question succeeds through real outbox gates with injected HTTP only; one transaction commits completed receipt and WAITING.
- Failed/unknown REST response, timeout, post-response grant revocation, expiry during the last lock wait or WAITING CAS failure never yields WAITING, never retries, and retains full reservation.
- Duplicate dispatch/nonce collision and two simultaneous claims still permit at most one callback.
- Two real native backends prove lock ordering/coexistence with temporal preparation, consume and the shared calendar-confirmation namespace. No provider call is needed.
- Source finalization creates the registry and question in one transaction before this hook can discover either; no draft is created by a temporal clarification alone.

This design is not a completed integration or real SMS proof. Missing-end/CLARIFY-only templates currently cannot be resolved by the closed multisource resolver; the future preparation worker must give a truthful full-reformulation response rather than advertise that path as functional.

## Implementation and falsification record

The store's private immutable/current proof readers moved to
`sms-temporal-clarification-proof.ts`, above the existing authority module and
below both store/outbound consumers. No import cycle or second authority engine.
Independent code review and74 unit cases passed; no original untracked snapshot
was retained, so independent byte-for-byte equivalence is not claimed. The later
native registry19/19 run includes this extraction.

New `sms-temporal-outbound-authority.ts` discovers attachments even while OFF,
checks the original deadline, then locks namespace/question/current evidence.
It returns a frozen non-executable hash of the full question/owner/binding/TTL.
The ordinary reply equality and Google disclosure checks remain additional.

Peer09:52:47 local: one RED/four controls PASS reproduced an ordinary claim that
did not rediscover an attachment before the callback. This uses synthetic DB
responses; actual concurrent insertion feasibility was not demonstrated. Fix:
every non-confirmation claim rediscovers before common locks, refusing a new
attachment instead of changing claim meaning. Peer8 tests subsequently pass.
Root lower16 + peer8 + Google7 + existing confirmation25 pass56/56 at09:53:58.
Earlier six Google-test failures came from an overly broad synthetic SQL matcher
returning a source row for the new attachment query. It now returns no attachment
for that query only; all seven original disclosure tests and assertions remain.

Six new native outbox-hook cases are prepared in the registry fixture: three
transaction-local timezones, attached/OFF approval, revoked Google authority
after a fake HTTP response, and negative REST outcome/no retry. Fresh native
**25/25 PASS** at2026-09-10T13:57:58.078Z,
`evidence/postgres-native-1789048652155`, includes these six and the earlier19
registry cases. The six exercise the actual outbox and temporal store; HTTP is
injected synthetic. The earlier19 use explicitly test-created receipts.
Owned PostgreSQL cluster9ac9a63e788342fb93552cff31e7ac78 stopped and retained.
Broader regression suite, question preparation and inbound worker routing remain.
