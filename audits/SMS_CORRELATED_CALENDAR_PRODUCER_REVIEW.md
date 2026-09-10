# Correlated calendar producer — bounded cross-review

## Scope and verdict

2026-09-10: source review GREEN for the prepare-only internal boundary, with the explicit native-validation limits below. This is a same-model peer review, not independent model-quality certification. No provider execution, activation, database launch, generation, migration or author-source edit was performed by this reviewer.

Read the whole `correlated-calendar-review.ts` producer, the full current `correlated-receipt-subject.ts` loader and its Git delta, the actual pure proof producers, and the preparation/isolation ordering in `SMS_CORRELATED_CALENDAR_SCHEMA_PLAN.md`.

The parent had already added stored-proof preflight before canonical serialization and the new-row lower bound `createdAt >= inspectedAt` before the reviewer tests ran. Their regression tests are GREEN-first; no independent RED is claimed for these fixes.

## Contracts checked

- Default OFF and explicit caller opt-in; exact pilot/authority and original deadline/signal checked after awaited boundaries. Actor and deadline are copied before loading the subject.
- The real loader retains namespace-first SERIALIZABLE/current permission/source/receipt/hash inspection. Its additive reference is built by the actual pure durable inspector from the same checked facts, not a caller object merely labeled inspected. Existing clock monotonicity and final TTL guards remain.
- The producer's only caller draft is the inspected reference draft. The existing six-field preparer serialization/request hash and stable receipt-derived UUID remain unchanged.
- An occupied idempotency key without its exact relation is refused, never adopted or marked. Exact relation replay avoids the preparer entirely and reports the current operation status as a replay, not a fresh unsent operation.
- New preparation and relation insertion share the caller transaction. Stored relation/proof/scalars, actual operation marker/account/request/hash and initial pending state are checked; new creation cannot predate inspection. Final DB time must stay monotonic and inside expiry.
- The transaction function returns `committed:false`. Only the bounded SERIALIZABLE wrapper changes it after commit acknowledgment. Unknown commit throws without retry, new UUID or claimed fresh success. A late flag withdrawal also throws rather than returning success; that does not prove an already committed write was rolled back.
- Output remains frozen, `approvalAvailable:false`, `executionAuthorized:false`; no model call, provider effect or new budget is introduced.

## Reviewer execution

New file: `test/personal-correlated-calendar-review-boundary.test.ts`.

- First run 12:22:42 local: **18/18 PASS**, 1.94 s.
- Expanded run 12:23:15 local: **91/91 PASS**, five files, 2.44 s. Includes the existing real loader tests, earlier receipt counter-tests and actual pure reference tests.
- Scoped ESLint run after removing one unused fixture-hook parameter: no production source edit.

Reviewed producer SHA256: `66d26263093a9335e63609989b91986368e6ad9509719b30b0e874bd1bc921b0`.
Reviewed additive subject-loader SHA256: `b50ba50b74ca20388056360419ecc42166738c529d21264e86eb82cb6ffbed5e`.
Scoped ESLint exited 0 without warnings on the final reviewer test file.

The 18 reviewer cases cover provisional frozen success, OFF/root-client rejection, orphan conflict, four terminal/current replay statuses, foreign relation scope, mismatched persisted marker, new-vs-replay creation time, malformed stored proof getter refusal, final DB backward/expiry limits, caller mutation, mid-preparer flag withdrawal, wrapper isolation/known commit, lost acknowledgment and post-commit flag withdrawal.

## Limits and next validation

The new reviewer fixture mocks the subject loader/Prisma transaction and canonical preparer, but builds its reference through the real durable pure proof functions. It asserts the producer's actual SQL parameter/hash shape and control flow. It **does not prove SQL syntax, deferred-trigger behavior, rollback atomicity, two-backend contention, grant-lock retention, PostgreSQL timestamp conversion or provider behavior**.

The expanded loader suite is still mocked DB testing. Previous native completed-receipt proof is not automatically proof of this new additive producer. Parent-controlled native tests must execute the real preparer/loader and migration78 guards, including rollback, expiry, both source pins, exact concurrent uniqueness and nonactionability through generic paths. No route, worker, typed approval or mobile action should infer authority from this prepare receipt.
