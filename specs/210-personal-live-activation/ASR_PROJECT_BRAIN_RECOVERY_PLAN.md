# Project Brain voice — bounded OFF crash recovery

Status: design approved by parent and peer; local OFF module/unit slice written,
implementation counter-review pending, no native recovery run yet.
No provider, model invocation, source media, credential, route publication, new
queue or new ledger. No migration is required by the proposed transitions.

## 1. Confirmed code gap and what is not known

`project-brain-admission.ts` commits one `AiOperation` running/attempt1 with a
private fencing token and a prepared/not_dispatched gateway attempt. The PB
dispatcher subsequently commits dispatched/unaccounted before its private
synthetic invocation. Its in-process `retain` can record a failure only while
that process survives and retains its admission snapshot.

The generic AiOperation claim/success/failure/superseded handlers deliberately
exclude PB. Personal-intent recovery joins PersonalAssistantOperation and does
not cover voice. Therefore a vanished process can leave a PB running claim and
held spend indefinitely. This is a static lifecycle gap, not a newly reproduced
OS-crash experiment. Native synthetic dispatch passing does not prove recovery.

## 2. Exact durable meaning

| Durable expired state | Recovery terminal | Knowledge |
| --- | --- | --- |
| attempt prepared + not_dispatched; segment registered | attempt cancelled_before_dispatch + not_dispatched; gateway refused; segment failed | The durable dispatch gate was never crossed. No invocation by this attempt. |
| attempt dispatched + unaccounted; segment running | attempt uncertain + unaccounted; gateway uncertain; segment uncertain | Invocation may or may not have started. The committed marker alone does not prove it began. |

The durable recovery label is OUTCOME_NOT_OBSERVED_AFTER_LEASE_EXPIRY: expiration
does not prove an OS/process crash; the original worker may merely be slow.

Both branches abandon the existing AI operation, keep attempts=1 and retain the
entire hold without release or settlement. They never insert transcript or
AiUsage rows. `resultContractStatus` stays not_evaluated. A session still
transcribing moves to incomplete (known not dispatched) or uncertain; an
already closed/cancelled/purged session is not reopened or overwritten.

An actual settled/failed/uncertain/cancelled attempt is never recovered again.
Contradictory combinations, an existing transcript/result, missing or changed
bindings, or a non-held hold are excluded and reported as skipped, not repaired
by guessing. No generic cleanup or failAiOperation call is used.

## 3. Minimal files and public surface

- NEW `src/server/model-gateway/voice/project-brain-recovery.ts`.
- NEW `test/project-brain-voice-recovery.test.ts`.
- NEW `specs/210-personal-live-activation/project-brain-voice-recovery.postgres.test.ts`
  after the unit/API review; controller alone runs it.
- No route/worker/tick wiring in this first slice. No schema, migration, generic
  AI-handler, dispatcher, owner permission or source-reader behavior change.

One internal server/controller function:

```ts
recoverExpiredProjectBrainVoiceAttempts({
  enabled?: boolean,             // exact true, otherwise no DB
  environment?: "local",        // required; never enabled in production
  batchSize?: number,            // default 10, integer 1..25
  deadlineAt?: number,           // finite absolute milliseconds, capped 2.5s
  abortSignal?: AbortSignal
})
```

Return immutable counts/status, `executionAuthorized:false`,
`automaticRetry:false`, `budgetReservationReleased:false`, and
`transportPerformedByRecovery:false`. Do not use a generic
externalTransportPerformed=false to describe the historical attempt. Return no
audio, text, storage key, owner identity or fencing token. Missing enable/local
mode returns DISABLED before database access. Production NODE_ENV refuses.

## 4. Candidate and exact lineage

Select at most 25 expired running/attempt1 AI candidates in lease/id order,
without row locks yet. Require nonnull fencing token and expired nonnull lease
using `clock_timestamp() AT TIME ZONE 'UTC'`. Never use the caller's clock to
decide that a DB lease expired.

For each candidate, reacquire and compare all exact persistent bindings:

- AI purpose intake_voice_transcription, taskId and personalAssistantOperationId
  NULL, exact VoiceIntakeSegment FK and canonical voiceOperationKey.
- Session subjectKind project_brain_voice, clientId NULL, exact requested owner,
  workspace/project/intake/source composite FK, sourceBinding and manifest hashes.
- Source kind VOICE_NOTE and source ownership/context matching the immutable
  session binding. No current active membership, source TTL, unpurged-file,
  consent freshness, published-policy or budget-cap authorization is required
  merely to retain evidence after revocation/expiry. No file contents are read.
- Gateway operation AI FK, tenant construction-workspace:<workspace>, voice
  operation type, admitted status, request/output hash pins.
- Decision belongs to that operation, attempt1, authorized disposition and
  historically bound synthetic route/profile/hash (even if later revoked).
- Attempt exact decision FK + hold FK, coherent phase pair as above, no result
  evidence, usage, provider request or transcript success attached.
- Hold exact provider synthetic + operationKey + attempt1 + positive amount
  matching the gateway bound; status held and no settlement.

Reuse `projectBrainVoiceGatewaySubjectSchema`,
`fingerprintVoiceGatewayProjection` and `voiceOperationKey` on metadata loaded
from the locked rows. No manufactured bytes, fake CLIENT or active admission
object. Recompute immutable source/manifest hashes canonically; source snapshots
are not new consent and do not authorize dispatch.

## 5. Locks, CAS, timing and preservation

One bounded Serializable transaction, SQL statement timeout <=2s and lock
timeout <=250ms, overall caller deadline <=2.5s, checks before/after awaits.
No transaction retry. Any write/acknowledgement error rolls back the batch;
unknown commit is not reported as recovered.

1. Take `pg_try_advisory_xact_lock(hashtext('voice-session-spend:<sessionId>'))`
   BEFORE any mutable row locks. Skip a busy session rather than blocking its
   dispatcher. Reuse the exact admission/dispatch advisory namespace.
2. Re-query the complete joined candidate with exact nonce/lease/IDs, lock
   mutable AI/session/segment/gateway/attempt rows FOR UPDATE SKIP LOCKED.
   Lock relevant immutable source/decision/route rows only after this ordering.
3. Lock the exact held row FOR SHARE after the mutable lineage locks. Recovery
   never acquires the provider/day advisory and never invokes reserve/settle;
   it thus does not introduce a hold-row -> provider/day lock inversion.
4. Recompute metadata fingerprints and phase consistency under those locks.
   A skipped/changed candidate produces no mutation.
5. Every terminal UPDATE includes exact original IDs, nonce, attempt1, original
   phase, exact lease equality and still-expired DB clock; assert count1 for
   each expected update or rollback. No successor can be overwritten.
6. Preserve request evidence, hold, source, immutable session/manifest fields,
   existing audit history and prior errors/results. Keep the expired nonce,
   lockedAt and lease on the now-abandoned AI row as forensic claim provenance;
   status abandoned makes them non-active. This is a proposed preservation
   choice for parent review, not a generic-claim change. Do not clear or repurpose
   old evidence to manufacture a successful transcript.
7. Append existing typed gateway audit events with stable reason and canonical
   recovery evidence hash of the exact prior claim/phase/IDs/hold. Link final
   gateway attempt/evidence. No audit schema extension or new free-form content.
8. Recheck deadline/abort before commit; count only acknowledged durable changes.

Raw Date parameters compared/written to Timestamp(3) use
`($n::timestamptz AT TIME ZONE 'UTC')`. SELECT clock_timestamp and recorded
instant representations keep timezone semantics. No historical date repair.

## 6. Required verification before checkpoint

Unit/synthetic transaction tests:

- OFF and production no DB; invalid batch/deadline; abort before and during tx.
- prepared versus dispatched exact knowledge, phase pairs and separate counts.
- coherent PB only; CLIENT/Task/personal subjects untouched; missing token,
  lease null/future, attempt0/2, settled/released hold and partial result refused.
- owner/workspace/source/manifest/request/operationKey/hold mismatch refused.
- revoked/expired authority does not block evidence-only terminal bookkeeping.
- lost exact CAS and deadline after audit roll back; no hold/usage/transcript
  writes; original source and prior evidence unchanged; second sweep zero.
- session advisory precedes mutable locks; busy session skipped; no account
  reserve/settle/release import, callback or external adapter.

Native PostgreSQL (controller-only, independent per-file clone):

- Real PB admission then expired prepared claim: precise cancellation, hold
  unchanged, no transcript, no generic reclaim; replay zero.
- Real durable dispatch marker then simulated process loss: uncertain, hold
  unchanged; no claim that an OS process or provider actually crashed.
- UTC/America-New_York/Asia-Tokyo transaction-local expiry comparisons.
- Two real backends racing recovery produce one terminal/audit outcome; a held
  session advisory causes skip, and late dispatcher cannot replace recovery.
- Batch cap25 over >25 independent sessions; untouched ineligible/legacy rows.
- Wrong source/hold linkage and terminal result remain unchanged.

Passing these checks establishes local bookkeeping and fences only. Actual
speech recognition, provider availability, live policy consent, billing, owner
review UX and product readiness remain outside this slice.

## Local implementation checkpoint, 2026-09-10

Only the new recovery module and its new unit file were added. No existing
gateway, schema, route, worker or native-file inventory changed. The historical
AiOperation nonce/lease/lockedAt/priorError remain intact after abandonment.
The locked query also excludes any AiUsage linked directly to the AI operation,
any transcript linked to segment OR attempt, all partial result pointers and
non-null terminal timestamps. Session open/finishing/ready combinations are
excluded rather than repaired; only transcribing moves to a terminal state.

49 recovery tests +31 existing dispatch tests +10 generic-exclusion tests passed
at10:35:43 local. These use synthetic transaction acknowledgements and source
contract assertions, not real PostgreSQL SQL execution. Global TypeScript and
scoped ESLint passed before the final additional timestamp-null SQL guard.
Independent code/counter-test review and controller-native verification remain.

Controller review during native-fixture preparation found a physical SQL column
error missed by the previous 96-test/review scope: AiUsage uses `operationId`,
not `aiOperationId`. TypeScript caught the new fixture's analogous ORM field;
it cannot validate raw SQL strings. A schema-pinned regression reproduced
50 PASS/1 FAIL at10:45:09, before correcting both source SQL and fixture. The
prior GREEN is preserved as unit/static coverage, not SQL compatibility proof.

Native fixture preparation (not executed by this agent): 11 cases now use the
existing real source/session/admission path with only synthetic object storage.
The helper assigns a short future lease of200ms, then waits against the DB clock
with bounded pg_sleep; it does not backdate a timestamp or alter the caller's
admission to impersonate a different lease. A test-created dispatch marker is
explicitly a simulation of committed durable state, not proof of invocation.
The two-backend test requires both real transactions to rendezvous before its
bounded release timer expires. An existing-usage contradiction remains last and
retained, not cleaned up for other fixtures. The new helper registers no tests.

Preparation check caught an accidental duplicated12-byte sequence while copying
the small audio fixture; it was corrected before any database run. Three new
static fixture tests pin the identical770bytes/SHA256, future-lease wait and
physical usage field (3/3 PASS10:50:42). Source/helper/native suite TypeScript and
lint passed. Native11 still requires the controller's run and receipt.

Controller execution now recorded at `evidence/postgres-native-1789051849182`:
11/11 native tests PASS, exit0 and normal server STOPPED at
2026-09-10T14:51:21.161Z. Peer independently read this receipt and the complete
fixture. No actual crash, provider call, ASR quality or release activation was
observed. This standalone bookkeeping module remains OFF and unconnected.
