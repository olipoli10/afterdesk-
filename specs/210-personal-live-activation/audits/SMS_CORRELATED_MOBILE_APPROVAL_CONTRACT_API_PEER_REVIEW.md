# Mobile correlated approval — contract/API peer review

Date: 2026-09-10. Reviewer: personal_gateway_subject. Scope: new approval contract and three API methods only. Lifecycle, attempt storage, UI, routes, SQL and executor have separate owners/reviews.

## Method and ownership

The engineering code-review skill guided a boundary-focused review: inspect actual producers and consumers, preserve falsifiable counterexamples, and distinguish mocks from runtime evidence. Production mobile imports no server code. Only the new root test imports both the real server schemas/projection and the mobile parser; that test is not part of the mobile bundle.

Owned files are `test/mobile-correlated-calendar-approval-parity-review.test.ts`, `apps/mobile/test/personal-correlated-calendar-approval-api-review.test.ts`, and this audit. No author source, existing test, database, migration, generated client or dependency was edited by this reviewer.

The root fixture derives the correlated receipt/proof and offer through existing pure fixtures and the actual server offer projection. The database transaction and current gate remain mocks: this does not prove SQL authorization or a real provider operation. API tests use injected fetch and controlled promises, never real HTTP.

## Preserved findings and corrections

1. **Getter preflight — observed RED at 16:13:47, 22 PASS / 3 FAIL.** Command construction read workspace/review identifiers before rejecting accessor-bearing objects. Each accessor ran once. Author changed command construction to snapshot/strictly parse before any scope access. The original three countertests passed afterward; no global prototype mutation or external exploit was claimed.
2. **Aggregate serialization budget — observed RED at 16:14:34.** A safe approximately 160 KiB fixture (five 32768-character strings) was rejected only after one composite `JSON.stringify`. The oracle requires rejection before composite serialization; it did not allocate a theoretical maximal tree or attempt OOM. Author added cumulative UTF-8 JSON scalar/key/delimiter accounting during the walk, retaining the final exact byte check. The unchanged countertest passed.
3. **Offer provenance parity — observed RED at 16:20:25, 26 PASS / 1 FAIL.** Changing the real offer fixture's provenance to `SYNTHETIC_LOCAL` is refused by the actual server offer schema (`UNKNOWN` literal) but accepted by the new mobile offer parser through the broader local-preview parser. This is a strict transport-contract discrepancy, not demonstrated calendar authority or tenant bypass. The author was asked to narrow only the new offer parser; the old local-preview variant must remain available for its own separate use.

## Fresh checks before provenance correction

- Actual server/mobile parity after the first two corrections: 26/26 PASS at 16:16:35.
- API reviewer 16 + author 13: 29/29 PASS at 16:16:20.
- Root TypeScript and scoped root/mobile reviewer ESLint: PASS after explicitly narrowing the confirmed response union in one reviewer assertion.
- Mobile TypeScript using its own installed compiler: PASS. An earlier invocation of the root compiler from the mobile directory reported an existing URL overload incompatibility in an old voice test; that wrong-runtime result is not attributed to the new code, and the old test was not changed.
- Contract hash at first two corrections: `32a5add65a7ccbfb18dbb01fc87b061971a0383c00d0783b9ae373076e80eca1`.
- API hash: `7c109d620a24585309ee2fa7445c7fa8d2b7669d8ea8c20dd1607821fe017e50`.

## Covered invariants

Actual server projection to mobile preserves the two source texts, UTF-16 citations, displayed fingerprint and exact five-field command. The peer matrix covers all four historical outcomes and five UNKNOWN reasons, deterministic event receipt shape, false execution/provider/retry flags, nested and outer scope bindings, immutable copies, and historical results without local freshness inference.

API tests cover original abort during an unresolved response body, invalid/opaque success bodies, accessor refusal without invocation, original 15-second GET bounds, private command copy before asynchronous cookie acquisition, cookie-failure cleanup, browser-managed cookie behavior, query escaping, and detached immutable offer data. No test grants retry authority after a timeout or treats HTTP failure as proof that an operation did not commit.

## Boundary of verdict

The provenance countertest is still RED at this checkpoint; final acceptance awaits the narrow correction and rerun. Even a final GREEN here is only bounded contract/API evidence. It does not certify lifecycle/storage/UI, human approval, production authentication, database concurrency, device behavior, actual Google service state or activation. Hashes are opaque bindings in the mobile parser, not cryptographic provenance verified on-device. No flags were activated and no provider calls were made.

## Final correction and bounded GREEN — 16:23

Author added `review.evidence.provenance !== "UNKNOWN"` to the new offer parser's refusal conditions. The existing local-preview parser was not edited. The narrow delta and the unchanged API diff were read again by this reviewer.

- Actual server/mobile parity: **27/27 PASS at 16:22:57**, including all five original RED cases (three accessor variants, aggregate byte preflight, offer provenance).
- Mobile author contract 37 + author API 13 + peer API 16: **66/66 PASS at 16:23:01**.
- Combined scope: **93 passing tests**, across separate root and mobile runners, not a global suite claim.
- Final contract SHA256: `0bfbfc7775444217cfcc87440a5638a3cb4a91c2d9147eacdaae418a15abe54f`.
- API SHA256 remains `7c109d620a24585309ee2fa7445c7fa8d2b7669d8ea8c20dd1607821fe017e50`.

Verdict: **GREEN for this bounded contract/API review**. No remaining concrete finding in this scope. Earlier RED receipts remain above and are not replaced by final totals. This is a separate-agent cross-review, not a claim of independent model-family quality or real provider/human evidence. The lifecycle, storage and UI work is explicitly outside this verdict.
