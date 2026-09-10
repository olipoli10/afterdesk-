# Temporal question lower — independent review

2026-09-10. Read plan, lower source, canonical proof-loader contract and the minimal
unsafe-context export. No production edits, DB, worker invocation or provider.

## Bounded verdict

**GREEN local source/units, not worker integration or native proof.** Eligibility
is read-only under caller SERIALIZABLE transaction. Namespace acquisition precedes
the source/child-locking canonical proof reader. Exactly one complete calendar
PREPARE action without dependencies must produce AMBIGUOUS_TIME; exactly one slot
is ambiguous and the other explicit. The current owner/source lease, envelope,
anchor and timezone are reloaded before returning frozen non-authorizing metadata.
No invented second SMS, UTC result, draft, model call or consent is created.

Post-question attachment reinspects instead of trusting caller eligibility,
delegates to the existing strict registry and requires its exact full question.
Author tightened initial OFF attachment to throw before parsing/DB; inspection
still returns DISABLED while OFF. That correction preceded reviewer execution, so
no reviewer-observed RED is claimed. Revocation after question insertion therefore
requires caller rollback rather than returning a harmless-looking disabled result.

## Evidence

- Independent mechanical comparison with Git HEAD confirms the exported unsafe
  regex literal and its normalizer are unchanged. This is the existing closed
  lexical guard, not new general-language comprehension.
- New `test/sms-temporal-question-preparation-review.test.ts` adds seven oracles
  using the author's canonical candidate fixture and explicitly mocked persisted
  readers: parsed actor/claim/id snapshot; changed timezone; abort during namespace;
  current grant revocation after inspection; OFF attachment; disabled store result;
  and switch withdrawal during store await. No DB transaction rollback is inferred
  from those mocks.
- 10:07:02: lower author26 + reviewer7 = **33/33 PASS**. Scoped ESLint and root
  TypeScript passed. 10:08:54: correlated evidence/resolution legacy suites plus
  lower33 and the unrelated enum7 = **111/111 PASS**; enum coverage is not counted
  as temporal behavior coverage.

## Worker-plan review, before implementation

Single CLARIFY does not establish calendar domain. Restrict initial worker wiring
to a canonical PREPARE_CALENDAR_EVENT action whose review is a single CLARIFY;
preserve ordinary SMS/voice/read and CLARIFY-only paths. A model's temporal reason
alone contains no calendar spans and must not silently turn an unrelated request
into a rendezvous reformulation. Parent accepted that narrower route.

The existing canonical review already contains modelChildOperationId; no new
model-worker metadata API is needed. Acquire namespace before finalizeReview's
source locks, then let lower reload/validate this child id. Decide enabled state
before the closure: an OFF-to-ON flip must not retroactively enter the lower after
source locks were acquired without namespace. An ON-to-OFF flip must roll back a
question rather than leave it unbound. Parent was notified before implementation.

Exact eligible wire, question insert, fresh attachment and source CAS must share
one transaction, with no truncation, ordinary fallback or flag activation. The
prior native registry19/19 and outbox25/25 receipts reported by parent are separate
evidence, not proof of this newly added lower or future worker wiring.
