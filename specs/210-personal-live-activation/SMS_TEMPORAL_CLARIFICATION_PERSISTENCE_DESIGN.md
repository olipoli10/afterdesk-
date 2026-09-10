# SMS temporal clarification — OFF persistence and two-source seam

Status: design only, 2026-09-10. No schema, flags, DB adapters, dispatch or provider calls are enabled by this document. Parent owns migration scheduling; the voice lane currently owns Prisma and migration `20260910120000`.

## Verified current seams

- `model-worker.personalModelReviewReply` now delegates to the pure versioned full-wire formatter. The pure clarification question request matches a single CLARIFY review exactly, including prefix/footer; the UI question stays short.
- `sms-worker` prepares the ordinary `reply:<sourceId>` outbox and completes its source in one Serializable transaction. `outbox.requireCurrentReplySource` requires that exact key, sender pair and `source.result.reply === request.text`. Keep those guards unchanged.
- Dispatch stores an **inspected proposal object** in the model child JSON result, not the original provider-response bytes. Its canonical result fingerprint equals the gateway and attempt evidence references. Review consumer then re-inspects `JSON.stringify(stored.proposal)` against the real original source.
- The current gateway v1 has one source and contiguous UTF-16 spans. A CLARIFY-only action has a reason but no title/date/start/end spans. Correlation alone cannot turn that reason into a calendar draft.

## Smallest durable table proposed

`PersonalSmsTemporalClarification`, with no executable operation kind or provider dispatcher of its own:

| Immutable binding | Purpose |
| --- | --- |
| id, workspaceId, userId, identityId, namespace | Owner and permanent verified sender/service-pair scope. Namespace includes workspace/user and the phone pair; re-pairing does not reset limits. |
| sourceOperationId, modelChildOperationId, modelGatewayOperationId, actionId | Exact existing source/candidate lineage, not caller-supplied substitutes. |
| questionOutboundOperationId, questionRequestHash | Existing ordinary self-reply, unique; never a second question SMS. |
| preparedJson, preparedHash, bindingHash, reviewSnapshot | Strict pure packet, current permission epochs, exact single-action review frozen at source commit. |
| proposalSerializationVersion, proposalEvidenceRef | Deterministically reconstructed inspected proposal, with its actual child/gateway evidence chain. Never label it original wire evidence. |
| questionHash, wireTextHash, wireFormatterVersion | Short UI question plus exact full SMS payload contract. |
| createdAt, expiresAt | DB UTC clock, lifetime >0 and <=10 minutes. |

Lifecycle fields: phase `PREPARED` / `WAITING` / `CONSUMED` / `EXPIRED` / `REFUSED`; accepted outbound SID/time and waiting packet/hash; consumed reply operation/SID/request hash, exact source claim snapshot, correlated packet/hash; rejection count. All calendar/provider execution and authority flags remain false.

Constraints required before integration:

1. Composite source/child/question/reply FKs `(id, workspaceId, createdByUserId)` with Restrict. Identity FK on identity id only plus immutable snapshot/current authority checks, so disconnect/revocation is not blocked by historical constraints.
2. Unique `(sourceOperationId, actionId)`, unique question outbox id, permanent unique consumed inbound id/SID, and partial unique namespace for `PREPARED`/`WAITING`. No time-dependent partial-index predicate. A consumed row frees the namespace but stays durably terminal.
3. Strict scalar/JSON agreement, bounded JSON/text sizes, immutable proposal/review/source/question bindings, closed transitions, TTL check. No deletion/reuse of consumed-source identity. Permanent durable uniqueness, not a JS Set, supplies replay resistance.
4. Deferred constraint re-reads the CURRENT row at commit: original source is completed with exact review/reply, child and gateway match evidence, question request/hash/key are exact. The original source may be processing while preparing inside the transaction, but cannot remain so at commit.
5. WAITING requires exact completed question outbox receipt, accepted SID and server acceptance time; accepted does not mean delivered/read. CONSUMED requires a new currently processing attempt-1 source with live exact lease during transition and completed exact correlation result at deferred commit. Future calendar effects are not inferred from that source completion.
6. Current membership/grants/identity are reloaded at transitions, not enforced as everlasting foreign-key conditions that prevent revocation. Serializing and locking rows must not make a stale permission valid.
7. Five creations/hour per permanent namespace and at most five distinct rejected replies per waiting question. A durable rejection-receipt record is needed if rejected sources can race/replay; alternatively bind each rejection to its source final CAS in an existing durable source result and query it under the same namespace lock. Do not claim a counter alone is replay-safe. Decide the exact SQL form before migration.

## Transactions and ordering

### Prepare in original source finalization

The future adapter accepts only the actual source claim and actual inspected review, never prepared JSON from an HTTP caller. Re-run current source/model/calendar/inbound authority and inspect the locked child result/evidence. Produce a stable serialization by strict proposal parsing and recursive ASCII-key canonicalization (version `personal-inspected-proposal-canonical-v1`); pass those exact reconstructed bytes to the existing pure preparation and persist them. This avoids JSONB key-order dependence. Preserve the child result evidence separately.

Capture the id returned by the existing ordinary outbox create. Require its full request to equal `smsTemporalClarificationQuestionRequest(prepared)` byte-for-byte in the existing request field order. Create the clarification in the **same** final transaction. Source final CAS must succeed; otherwise reply and clarification roll back together. No nested transaction, no I/O/provider, no new budget reservation, no second interpretation.

Before creating a question, expire old namespace rows with DB clock under bounded locks. If existing live calendar-confirmation or another temporal question makes a bare reply ambiguous, refuse activation of a second conversational expectation. Namespace locking across these two tables needs an agreed shared deterministic transaction lock or shared namespace row; independent partial unique indexes cannot enforce cross-table exclusivity.

### Waiting / reply correlation

Audit result: ordinary outbox completion stores `providerSid`, `providerStatus`, `delivered:false`, `acceptedByProvider:true` and `approvalHash`, but no immutable acceptance timestamp. `updatedAt` is not a dedicated immutable receipt timestamp. Therefore a later catch-up transaction cannot safely reconstruct the original acceptance instant. Preferred integration is a narrow hook in the **existing completed-outbox transaction** that marks the attached temporal clarification WAITING with DB `clock_timestamp()`, just as the existing calendar confirmation branch does. This changes no ordinary source equality, approval, budget, network call or dispatch authority. A rollback after a provider result stays uncertain and does not resend. Do not substitute source read time, queue time or infer acceptance time from a SID. An alternative immutable ordinary receipt timestamp would need its own reviewed change before catch-up is viable.

The adapter locks namespace, clarification, original source/child/question, then incoming source and current authority in a consistent order. A reply's original DB ingress time must be strictly after durable question acceptance and before expiry, even when WAITING was materialized later. Receipt persistence failure after provider outcome stays uncertain/no question re-send. If a current receipt is unknown, the reply cannot consume the question.

If a temporal question is active, route its narrow time-answer namespace exclusively before model execution. Invalid/ambiguous time answers record a fixed refusal/question and exact source result; they do not fall through to a paid or mutating interpreter. No active question means a bare time never inherits arbitrary history. Compare across calendar-confirmation expectations too; multiple interpretations refuse.

For success, call the pure correlator with authoritative snapshots and DB time, CAS WAITING to CONSUMED with exact waiting hash, persist the two-source packet, and complete the incoming source with its exact claim in one transaction. A final CAS loss rolls back all of it. No model/provider call occurs under these locks. Statement/lock timeout and signal honor the original worker deadline. Expiry maintenance is bounded <=25; no retry or release of external spend.

## Proposed typed gateway change — not implemented

Do not widen `PersonalIntentInput` v1 to accept fabricated stitched text. Add an explicitly named pure inspection seam **inside the existing** `model-gateway/personal-intent` folder. Do not register a second gateway or permit model-origin authority fields.

```ts
type SourceCitation = Readonly<{
  sourceOperationId: string;
  requestHash: string;
  start: number; end: number; quote: string; // exact UTF-16 slice of that source
}>;

type CorrelatedTemporalEvidenceV1 = Readonly<{
  schemaVersion: 1;
  operation: "personal_calendar_correlated_evidence_v1";
  clarificationId: string;
  correlationHash: string;
  originalProposalHash: string;
  actionId: string;
  anchorReceivedAt: string; // ORIGINAL receipt, never answer receipt
  timezone: string; // current pinned DB setting, never handset/model
  sources: readonly [VerifiedSourceSnapshot, VerifiedSourceSnapshot];
  answer: SourceCitation;
  template:
    | { kind: "AMBIGUOUS_START"; title: SourceCitation;
        originalStart: SourceCitation; originalEnd: SourceCitation }
    | { kind: "AMBIGUOUS_END"; title: SourceCitation;
        originalStart: SourceCitation; originalEnd: SourceCitation }
    | { kind: "INSUFFICIENT_ORIGINAL_TEMPLATE" };
  executionAuthorized: false;
}>;
```

`VerifiedSourceSnapshot` above means the existing source packet **asserted by the authoritative adapter**, not verification performed by the type. Strict runtime schemas, exact canonical fingerprints and current DB checks are mandatory.

Proposed function `inspectCorrelatedPersonalTemporalEvidence(packet)` replays original candidate inspection and pure correlation, checks exactly which ONE original slot was ambiguous, and verifies every source citation separately. It returns only inspected non-authorized evidence. Candidate free text may not select the slot. If both start and end are ambiguous, or the original action was CLARIFY-only, return `INSUFFICIENT_ORIGINAL_TEMPLATE`. The short question alone does not determine which slot a new time replaces.

A subsequent `resolveCorrelatedPersonalCalendarTemporal` can share the existing closed wall-time/date/DST primitives from `temporal.ts`, while keeping single-source public behavior unchanged. It must derive date from the original verified temporal span anchored to original receipt, and hour/minute only from the new verified reply. Do not build a fake single SMS and pass it through v1. Preserve exact provenance in the result and downstream review. Existing whole-source negative/conditional/dependency/timezone guards apply to **both** original and reply, not just chosen spans.

MISSING_END_TIME is currently often a CLARIFY-only proposal; v1 `PREPARE_CALENDAR_EVENT` requires an end span. Therefore the first durable correlation phase must stop at evidence, not silently extract title/start from prose. Supporting that case requires a separately reviewed, versioned **partial non-executable candidate template** carrying source-cited title/start/missing-end, or a new explicitly authorized candidate call. Neither is created by this design. No default duration/year/calendar/recipient is allowed.

## Proof gates before any activation

- Native PostgreSQL multi-backend: source final CAS rollback, competing replies, competing question creation, JSONB reorder, old receipt/new answer ordering, grant revoke/regrant, wrong owner/tenant, deadline/lock timeout, one counter increment per rejected source, permanent replay, both namespace types conflicting, expiry frees only expired row.
- Formatter/request parity and complete review equality; legacy ordinary replies and calendar confirmations unchanged.
- Gateway pure tests: midnight rollover anchored to original day; DST gap/fold; two ambiguous slots; incomplete CLARIFY; missing date/title/end; source-boundary/Unicode/hash tampering; negation/conditional/date/timezone injection in either message; same source/SID replay.
- One model interpretation maximum per source; no extra candidate call to fill missing template. Correlated evidence is not an event draft. A later exact draft remains subject to existing deterministic review and current Google approval/confirmation gateway.

Current result: pure formatting/correlation only. The receipt audit found no immutable acceptance instant for ordinary replies; the atomic WAITING hook is a prerequisite. Persistence, shared namespace arbitration, two-source resolution and real SMS/device/provider observations remain unimplemented or unobserved. No readiness metric changes follow from this document.
