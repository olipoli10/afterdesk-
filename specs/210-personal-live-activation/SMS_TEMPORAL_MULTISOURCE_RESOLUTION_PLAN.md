# Two-source temporal resolution — bounded pure extension

Authorized local scope, 2026-09-10. Previous inspection seam: 168/168 focused tests and independent bounded review GREEN. No persistence or provider evidence follows from those tests.

## Order and invariant

1. Preserve the inspected two-source contract. Re-run it at resolution entry; CLARIFY-only, incomplete/unsafe templates, two ambiguous slots and stale/unverified asserted context never become events.
2. Refactor the existing private `parseWall` narrowly to accept an optional explicit time override. Use that override only when its existing `time` parser returns `AMBIGUOUS_TIME`; all date extraction remains the existing original quote plus original receipt anchor. No replaced source span, concatenated SMS, guessed duration or substituted receipt date.
3. Keep the legacy public resolver signature and default behavior unchanged. Factor its implementation with an optional typed slot override; validate the extra pure entry strictly and re-inspect the original proposal. The non-selected slot is parsed unchanged. Existing uniqueUtc, date validity, timezone agreement and end-after-start checks are reused, not copied.
4. Expose a new gateway pure resolution function taking the original correlator input. It internally repeats inspection, applies only the correlated explicit reply hour/minute to the single demonstrated slot, and returns a frozen `RESOLVED_NOT_AUTHORIZED` result with exact two-source evidence/citations/hashes and original anchor. It prepares no draft, performs no persistence and grants no action authority.
5. Test START and END clarification, original-relative date across midnight, Toronto DST gap/fold, half-hour transitions, invalid date/end-before-start, incomplete template, two slots, source/hash/context/replay corruption and legacy parity. Independent review of private refactor and full focused suites before completion.

## Ownership and stop boundary

Files: `personal-intent/temporal.ts` narrow shared refactor; new `personal-intent/correlated-temporal-resolution.ts`; dedicated resolution tests; this plan. Inspection module is frozen unless the review identifies a concrete defect. No Prisma, routes, worker/outbox, candidate calls, budgets, flags or deploy changes. Success is a pure deterministic non-authorized result, not an observed Google or SMS action. Stop on a field the original source/candidate cannot prove instead of inventing it.
