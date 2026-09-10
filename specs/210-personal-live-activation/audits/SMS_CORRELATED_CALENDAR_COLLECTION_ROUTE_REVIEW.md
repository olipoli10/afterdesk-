# Independent collection and GET review

2026-09-10. Reviewer `openrouter_disabled_adapter`. **GREEN in the bounded code/test scope for the collection and protected GET.** The separate mobile caller cancellation finding is not covered by this verdict.

## Inspected contract and implementation

Read the full collection, protected GET, existing personal API authentication helper and session/rate implementation, canonical item/receipt reader, author collection38 and route50 tests, plus relevant installed Next route-handler guidance. The code-review and Next.js skills guided lifecycle and transport-boundary checks; no deployment or framework HTTP server was run by this reviewer.

- Explicit OFF gives 404 before authentication. Only an authenticated CLIENT with verified email and a bounded id supplies the actor. Workspace is a unique bounded query field; headers, cursor, arbitrary review ids and extra query fields do not create authority. Rate allowance must be literal true at 30/minute per user.
- The GET owns one absolute deadline from entry and forwards the original request signal. Checks after authentication, rate limiting and the reader refuse late disclosure. This is **not** a guarantee that a hung authentication promise is forcibly cancelled or that HTTP always terminates within five seconds.
- The strict response schema rejects additional nested action handles, wrong workspace, excess/duplicate review items and authority flags. It is a shape filter, not a replacement for canonical source authentication. All response paths are private/no-store, vary Cookie and Authorization, with opaque errors rather than SQL/source text. No implicit CORS allowance is added.
- The collection uses one Serializable transaction, owner/member inspection before scoped discovery, latest five plus a sixth hasMore probe, then the unchanged canonical item reader. Failure of any selected item aborts the complete collection; no partial-success or successful-empty fallback. Empty results still require both owner checks and final DB time.
- Owner revisions are copied before awaits, candidates and each parsed item are copied before the next item, and final owner rows are shared-locked and compared. Final DB time and post-commit monotonic elapsed protect the earliest item/pilot expiry. No retry, action, budget, preparation or durable mutation is added.

## Lock-order limitation — not a claimed reproduction

The first owner lookup does not take an owner row lock ahead of canonical item namespaces; the final owner shared lock follows item inspection. Items keep namespace/evidence locks until commit and are processed in stable latest order for a given collection.

A global deadlock-free claim would be too strong. Distinct workspaces with historical opposite namespace ordering could contend before the canonical current-binding check refuses a stale item. Active phone identity uniqueness means the hypothesized stale cross-workspace collections would already be unavailable; no lost authorized success or bypass was demonstrated. This is an explicitly unproven bounded contention possibility, not a confirmed critical defect or justification for a new prelocking authority path. Native lock/concurrency evidence is controller-owned.

## Reviewer files and observations

- `test/personal-correlated-calendar-review-list-review.test.ts`: 11 new tests with a separate mocked-SQL scaffold and real pure DTO construction. Checks schema alias identity, copied owner Date epochs, attempted Date mutation to disguise a final revision change, empty owner refusal, copied DB clock epoch across commit, backward monotonic time, five-without-sixth ordering, copied discovered ids, and opaque discovery/final-owner/clock failure.
- `test/personal-correlated-calendar-reviews-route-review.test.ts`: 14 new tests using the real strict response schema and nonempty two-source DTO from a pure receipt fixture. Checks non-authoritative headers, strict rate booleans, logout without prior result reuse, cumulative auth/rate deadline, abort during rate limiting, nested action handles, max five, duplicate ids, nested authorization flags, identical opaque failure body and no CORS/cache leakage.

Observed first combined route run: **58 PASS / 6 FAIL** while two authors crossed the Schema/ResponseSchema export rename. All six positive cases returned 503. This was a real integration mismatch during construction, not a business-boundary bypass. The final canonical ResponseSchema and compatibility Schema alias now refer to the exact same object; a reviewer test pins that equality.

Fresh four-suite run **12:56:31 local: 113/113 PASS** (collection38 + route50 + reviewer25). TypeScript then identified missing discriminant narrowing in the reviewer's two pure fixture builders; exact RESOLVED_NOT_AUTHORIZED guards were added. Reviewer rerun **12:59:52: 25/25 PASS**; full TypeScript and scoped ESLint then exited 0. No author source, SQL78, native fixture or production configuration was edited by this reviewer.

No provider, customer data, native PostgreSQL, full root suite, actual HTTP runtime or device evidence is claimed here. Controller native receipts remain separate from these mocks.
