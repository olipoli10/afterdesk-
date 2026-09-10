# Independent review: one correlated calendar item

2026-09-10. Reviewer `openrouter_disabled_adapter`, distinct from the projection author. **GREEN for the bounded server-only read-only slice; no actionable critical defect found.** No PostgreSQL, device, provider or authorization claim follows from this review.

## Scope and trace

Read the full `src/server/model-gateway/personal-intent/correlated-calendar-projection.ts`, all current author tests, the canonical receipt loader's returned proof/reference/preparation context, transaction/clock helpers, compact eight-key proof builder and existing six-field calendar request schema.

- Explicit REVIEW opt-in and existing STORE/pilot gates precede work. Parsed actor/review id and capped deadline are copied before awaits. The caller-owned transaction is checked and bounded **before initial discovery**, following the controller's earlier finding/fix; this reviewer did not reproduce that historical defect.
- Discovery is scoped but takes no calendar lock ahead of the canonical receipt namespace. The real receipt loader owns source/current-owner/member/workspace/identity/grant checks and the question namespace. The reader then locks the scoped immutable review and globally joined calendar/review with shared row locks.
- Stored relation scalars and all eight compact proof fields are compared to the reference freshly rebuilt by the canonical loader. The inspection fingerprint is not accepted as evidence that inspection happened merely because its value is present in JSON. The canonical reader is called, not replaced by a caller-supplied proof.
- The exact six-field request is parsed in the existing producer order and hashed with existing JSON.stringify semantics. JSONB property ordering is tolerated; altered bytes, silent trimming or substituted origin/global relation are not. UTC-naive stored dates are explicitly selected as instants and copied to strings before another await.
- Final DB time must not precede the canonical loader's inspection or review creation and must remain strictly before the question/pilot minimum expiry. Signal, policy flag and local deadline are checked after awaits, including successful wrapper commit. Commit failure is not retried or converted into a successful read.
- Result data is a frozen review-only envelope. Source text and citations remain provenance `UNKNOWN`, semantic interpretation unverified, approval unavailable and execution unauthorized. It exposes the review identifier but no linked calendar action id, calendar request hash or approval token. Actual supported current statuses are projected rather than rewritten as a new preparation/success receipt. Unsupported states and nonnull budgets are conservatively refused in this OFF foundation, not interpreted as future execution support.
- No preparation, approval, insert, provider, model or credential function is invoked. Transaction-local timeout configuration and locks are expected; no durable business rows are written.

## Independent tests

New file: `test/personal-correlated-calendar-projection-review.test.ts`, **12 cases**. A separately authored synthetic query scaffold uses the existing pure receipt fixture and real proof builders. The canonical DB receipt loader is mocked deliberately, so these cases do not independently prove its current-owner/grant behavior or SQL locks.

Coverage: all three stored Date objects mutated after parse; source/status/request objects mutated during the last clock wait; missing/duplicate review and globally joined operation rows; wrong loader actor; producer fingerprint mismatch; abort during final query; timeout-install failure before discovery; unknown commit/no retry; immutable non-actionable output.

First run **12:40:20 local: 70 PASS / 1 FAIL** (59 author + 12 reviewer). The failure was the reviewer's array-shape oracle: `toMatchObject` was supplied one source while the correct result contained both sources. It was corrected to assert the first source field explicitly without removing the second. This was **not a production defect or production RED→GREEN**.

Fresh rerun **12:40:48 local: 71/71 PASS** (59 author + 12 reviewer). Full TypeScript check and scoped ESLint subsequently exited 0. No author source, migration78, native fixture or deployment was modified by this reviewer.

Native SQL result types, exact row locking, concurrency and actual database timezone behavior remain controller-owned validation. The unchanged conservative source expiry/current-grant requirements mean this is not a newly authorized permanent-history viewer or approval workflow.
