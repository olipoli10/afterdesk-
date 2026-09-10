# C2a gate — peer code review

2026-09-10. Local code/contract review and synthetic counter-tests only. This peer review is not independent model-quality validation or a provider authorization.

## Scope and verdict

Read backend approval plan sections 4–6, frozen SQL79, actual receipt/item readers, current temporal proof/Google READ and token prerequisites, strict approval contracts, and the complete new gate. Reviewed gate SHA256 after fixes: `b2791cc62d9db0914b2066bd7f8d53d1d5ec22420c572bb594afcccd7c78325d`.

**No remaining actionable critical defect observed in this bounded gate after the fixes below.** No sources, existing tests, SQL, schema or native fixtures were edited by this reviewer. Owned additions: `test/correlated-calendar-approval-gate-review.test.ts` and this audit.

## Review changes and reproduced finding

Before stable tests, source review identified two additional explicit bindings: compare the complete displayed evidence (both sources, citations, anchor and slot), not only its draft; and require pre-snapshot committed review/operation/approval rows. The author added both. These were preventive review observations, not claimed RED tests.

At **14:49:16 America/Toronto**, the ten reviewer tests produced **8 PASS / 2 FAIL**. Both failures execute the real gate with real pure two-source proof builders and mocked durable readers/DB:

1. Change `ENDVERA_EXTERNAL_AUTHORITY_REF` to another nonempty reference during the final DB-clock await.
2. Change the fixed pilot expiration to a different future date during that same await.

Both returned `CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED`. The existing Google configuration helper only required a nonempty authority reference and a future pilot date; it did not enforce the exact canonical values required by the active receipt readers. The author fixed the gate's per-boundary `live()` check to require both exact values, including after the final await. No effect occurred in the reproduction.

The author separately reported and fixed two monotonic-time regressions (short original budget / 5-second cap with wall clock moved backwards). The reviewer read the resulting entry-budget snapshot and `performance.now()` deadline guard and reran those author tests. Their original RED receipt belongs to the author, not this reviewer.

## Fresh validation

`node node_modules/vitest/vitest.mjs run test/correlated-calendar-approval-gate-review.test.ts test/correlated-calendar-approval-gate.test.ts`

**84/84 PASS**, 2 files (10 reviewer + 74 author), started **14:50:28 America/Toronto**. Reviewer TypeScript `--noEmit` and scoped ESLint completed exit 0 during this review.

The independent counter-tests cover the positive exact Unicode/read-only envelope; the two late canonical-env changes; missing READ identity despite available WRITE; nonboolean commit markers; globally discovered foreign approval; swapped full source texts with unchanged draft; final-await abort using the original signal; and backward DB time. Author tests additionally cover both live claim phases, exact immutable approval/state/authority pins and source/item comparisons.

## Boundaries retained

- Namespace/current proof locks precede calendar locks. READ prerequisite is metadata-only on the same Google account; it does not replace WRITE or owner-only authority.
- The unchanged item remains `approvalAvailable:false`; the new gate returns provisional inspection, not a human decision, persisted approval, dispatch handle acknowledged by a transaction, or permission to skip a later gate.
- No token/ciphertext, provider, calendar mutation, reservation or retry is invoked by the gate.
- Offer refuses pending-state anomalies and any global approval. Effect-gate mode rechecks the precise stored claim phase, nonce, origin, authority, lease and committed-row markers.
- Final DB chronology/expiry and per-await flags, signal and original bounded time budget are retained.

Mock SQL rows do not establish real ownership, row-lock ordering, MVCC `xmin` behavior, transaction durability or an actual human click. Native C2a tests remain controlled separately by the parent. No Google/human/native coverage is inferred from these 84 tests.

## Follow-up — operation-state snapshot before approval lookup

The controller identified the remaining `row.result` alias across the approval-query await. The author reported a RED at 14:51:54 where an initially wrong phase was mutated to the expected phase during that await, then fixed it by parsing/freezing through the strict A state schema immediately after the operation row is read. Offer mode captures strict null; effect mode validates the captured state after the immutable approval lookup.

This reviewer read that narrow delta and added an inverse regression: a valid initial CLAIMED state mutated to DISPATCH_CLAIMED during approval lookup must still inspect the original CLAIMED snapshot. **87/87 PASS** (11 reviewer + 76 author), fresh at **14:53:29 America/Toronto**, scoped reviewer lint exit 0. This reviewer did not claim the author's original RED as independently observed. Latest reviewed source SHA256: `c7690b347d8cb5d856828872c36aff4b6acdbaea8bb35ca0bfc4eff7ecb1d56d`.
