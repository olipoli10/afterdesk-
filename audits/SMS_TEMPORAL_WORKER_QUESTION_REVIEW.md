# Temporal question worker wiring — independent review

2026-09-10. Read the worker diff and its 15 author tests. Reviewer owns only
`test/sms-temporal-worker-question-review.test.ts` and this note. No DB/provider
or production-source edits.

## Scope observed

The worker uses the existing canonical review child id, not a new model metadata
API. It acquires namespace before finalizeReview when preparation starts enabled,
and only a single calendar PREPARE action with CLARIFY enters the lower helper.
Other domains and multi-action/resolved reviews retain their previous path. OFF
at transaction entry does not enable midway after source locks; ON revocation
is intended to abort. Eligible full wire cannot be silently truncated. Question
creation, fresh attachment, canonical whole-review equality and source CAS share
the final transaction.

## Actual independent RED: final awaited source CAS

**10:15:25: two RED / four controls PASS.** The synchronous temporal/clock check was
only before the awaited final source CAS. Reviewer test one changes the preparation
switch during that await: callback commits its staged question and returns
COMPLETED_REPLY_PREPARED. Test two expires the deadline during the same await:
callback still commits the question, then the outside-transaction live check returns
REVIEW_REQUIRED too late to roll it back. The explicit staged fake transaction
demonstrates callback ordering, not PostgreSQL commit timing or real SMS behavior.

Sent to parent: recheck temporal epoch/live after source CAS and after any final
bridge await, before returning from the transaction callback. This does not promise
atomicity with a later external configuration change during database COMMIT itself.

Four reviewer controls pass: canonical review equality permits key-order changes;
actual SELF_CALL stays outside calendar preparation; model reply without canonical
finalizer cannot acquire correlated authority; DISABLED attachment after question
insertion rolls back before source CAS. Reviewer ESLint passed.

No GREEN worker verdict until the two RED cases are repaired and rerun. Source,
lower, outbox and voice native receipts from earlier slices are not substitutes
for this worker transaction's own proof.

## Subsequent repair and independent GREEN

The parent added the current temporal epoch/deadline check immediately after the
awaited source CAS and again after the optional bridge, at the end of the final
transaction callback. Both originally failing cases now roll back the staged
question. The historical RED above is retained deliberately.

Fresh independent rerun at **10:17:32: 80/80 PASS**, comprising reviewer6,
author worker15, legacy SMS45, source fencing4 and model worker10. The six reviewer
cases include the four positive/refusal controls listed above. No production
source was edited by this reviewer. Verdict: **GREEN for this bounded local
worker ordering repair**, not PostgreSQL commit timing, provider delivery or
live activation. A switch change during the database COMMIT acknowledgement is
not made atomic by a JavaScript pre-commit check.
