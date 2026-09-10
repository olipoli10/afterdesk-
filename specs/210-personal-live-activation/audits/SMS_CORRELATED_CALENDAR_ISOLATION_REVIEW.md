# Independent code review: correlated calendar generic isolation

2026-09-10. Reviewer lane `openrouter_disabled_adapter`, separate from the isolation author. **GREEN in the bounded local code-review scope; no critical regression confirmed.** This is not an independent assessment of model quality, SQL concurrency, device behavior or provider execution.

## Source inspected

- `personal-assistant/calendar-actions.ts`: generic replay refusal, internal origin/Serializable requirement, INSERT-only marker, exact linked replay, raw generic listing, and shared `lockWrite` exclusion used at initial claim and each executor reload.
- `personal-assistant/calendar-confirmation-authority.ts`: marker and global relation exclusion in the common source/current-calendar binding, used by summary/bridge/consumption paths.
- `personal-assistant/outbound-queue.ts`: confirmation branch excludes the same origins before final oldest-first LIMIT; ordinary reply/temporal-question branches retain their existing boundaries.
- `model-gateway/personal-intent/review-projection.ts`: globally scoped relation lookup by bounded draft ids, marker filter, unchanged historical review and omission of actionable identifiers for unavailable drafts.
- Author's complete `personal-correlated-calendar-isolation.test.ts`, plus the related mobile approval rendering and existing backend executor behavior.

The exclusion is marker **OR any relation by calendarOperationId**, not a scoped reverse relation that could hide a malformed foreign attachment. List filtering occurs before LIMIT rather than dropping entries after pagination. The persisted marker cannot be attached later to a legacy operation under migration78, so a generic read cannot legitimately become a correlated operation through a later NULL→marker update. No current grant is turned into an immutable FK.

The one-source review can retain its historical proposed draft as `UNAVAILABLE_OR_CHANGED`, but does not return an operationId/requestHash for approval when the current row is excluded. Completed/uncertain legacy actions preserve their actual current status. New internal preparation does not overwrite an old review, reset a terminal draft, claim execution or bypass the deferred mandatory relation; public PREPARE cannot supply its internal origin parameter.

## New reviewer tests and observed results

Added only `test/personal-correlated-calendar-isolation-review.test.ts` (6 cases). It uses a fresh synthetic DB scaffold, real projection/preparer functions, and distinct assertions:

1. Mixed source review: remove only the correlated actionable id; keep the original source, an ordinary pending calendar, completed SMS and uncertain call unchanged.
2. CLARIFY-only history does not load unrelated relations/drafts.
3. Failed relation lookup aborts projection without generic fallback.
4. Failed relation lookup cannot return or recreate an ordinary UUID replay.
5. Owner refusal precedes the global calendar list query.
6. Generic terminal status mapping is retained; emitted SQL has both global exclusions before LIMIT 30.

Fresh run at **12:23:57 local**: reviewer 6 + author 36 = **42/42 PASS**. Scoped ESLint and full TypeScript check subsequently exited 0. No RED finding or source fix is claimed for this isolation review. No author production file was edited by the reviewer.

Mock query responses and emitted-query assertions do **not** execute PostgreSQL pagination, constraints or locks. Native evidence is owned by the controller and must be cited separately. The reviewer did not run native PostgreSQL, the full root test suite, provider calls, credentials, deployment or activation. Migration78 was already applied by the controller and was not modified during this review.

## Remaining integration gate

No correlated approval workflow is exposed by this change. A future two-source projection and explicit typed approval need their own reviewed current-authority and exact-draft contract; removing the generic refusal is not an acceptable shortcut. Provider/customer-data readiness is not established by these unit tests.
