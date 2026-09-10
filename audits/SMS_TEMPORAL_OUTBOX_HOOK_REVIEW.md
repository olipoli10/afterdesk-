# Temporal ordinary-outbox hook — independent review

2026-09-10. Read the complete new `sms-temporal-outbound-authority.ts`, modified
`outbox.ts` paths, lower proof reader, hook plan and lower-authority unit tests.
Reviewer owns only `test/sms-temporal-outbox-hook-review.test.ts` and this note.
No DB, provider, native executable or production-source edit by reviewer.

## Reproduced defect and repair

**09:52:47: one RED / four controls PASS.** The real dispatcher classified a source
as ordinary when temporal discovery initially returned null. Its post-claim gates
then skipped temporal discovery for ordinary claims. A newly visible attached/OFF
restriction therefore was never inspected; the injected fake HTTP ran and the
dispatcher returned its ordinary result. This proves a missing point-of-use check
under controlled DB/authority mocks, not a native insertion race or public exploit.

Parent repaired `withOutboundClaim` to discover temporal attachment for every
non-calendar-confirmation claim before common outbound locks. A temporal claim
requires the identical fingerprint; an ordinary/null claim refuses any new
attachment instead of ignoring it or changing the claim's meaning. The repaired
source was reread. **09:53:47: eight reviewer tests PASS**, including that original
RED and additional TTL and lock-order checks.

## Verified source boundaries and regression oracles

- Lower discovery runs even when flags are OFF; present-but-disabled, foreign,
  inconsistent or expired attachment throws instead of becoming ordinary fallback.
- Namespace/question proof precedes common outbound locks. Current source/model/
  Google authority and shared active expectation are mandatory, as are the old
  ordinary reply's exact text/recipient/source and disclosure checks.
- Captured immutable temporal fingerprint includes namespace, prepared/binding/
  question hashes, source, actor/workspace and expiry. The claim lease is bounded
  by expiry, and proof/TTL are rechecked before and after HTTP.
- Changed pre-HTTP fingerprint invokes no fake transport; changed post-HTTP proof
  does not attach WAITING. Both retain uncertainty and the existing reservation.
- The completion CAS and `markAsked` share one transaction. DISABLED is explicitly
  rejected; the review test reaches completed-before-mark then simulates rollback
  and verifies uncertain state, one invocation and one reservation.
- Expiry before reservation and after fake HTTP refuses. Call-order oracle verifies
  temporal inspection precedes common outbound locks in both post-claim gates.

Fresh **09:55:17: 56/56 PASS**: reviewer8, lower-authority16, historical Google
disclosure7 and calendar-confirmation outbox25. Scoped reviewer ESLint passed.
Root typecheck at09:54 reported only the separate WIP
`sms-temporal-question-preparation.ts` fields (`input.text`/`sourceRequestHash`);
therefore no whole-tree typecheck PASS is claimed by this checkpoint.

## Verdict and limits

**GREEN bounded source + synthetic regression review for parent native validation.**
The reviewer scaffold reuses the existing Google-reply mock fixtures, replaces
temporal proof/mark boundaries explicitly, and adds a local rollback simulation.
It does not prove actual PostgreSQL constraints, rollback, lock coexistence or a
late attachment's native feasibility. Those need the parent's native fixture.
No activation, real SMS, delivery confirmation or automatic model authority is
implied. The new question-preparation worker is a separate, unreviewed scope.
