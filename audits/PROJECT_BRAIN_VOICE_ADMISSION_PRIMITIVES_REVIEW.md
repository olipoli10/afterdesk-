# PB voice admission primitives — independent review

2026-09-10. Scope: `ai-operations.ts`, `account-spend.ts`, the transaction-scoped
session reader extraction and their synthetic unit tests. No admission runner
implemented or native database executed by this reviewer.

## Source review

- Generic claim/succeed/fail embed the closed persisted relation filter:
  no voice segment, or a segment whose session is the original `voice_intake`.
  Existing personal-operation exclusion remains. PB cannot obtain the legacy
  two-attempt behavior by changing a caller purpose/key. Success excludes before
  invoking its business write. Failure's superseded-usage fallback reloads the
  actual voice FK/session discriminant and refuses PB before false Task/Anthropic
  usage creation. Null/missing relation on a non-null voice FK fails closed.
- Synthetic now always requires its dedicated explicit budget, positive bounded
  reservation shape and exact held-replay day/amount. Current cap and aggregate
  held-plus-settled exposure are rechecked. This is not an optional boolean that
  a caller can omit. Other provider paths retain their previous semantics.
- The transaction-scoped PB session inspector retains the existing joined
  source/owner checks, strict manifest/segment comparisons and final database
  clock validation. The public reader retains OFF-before-DB, copied input and
  bounded Serializable transaction settings. Internal callers own their timeout
  and transaction; the returned metadata is not provider authorization.

No actionable source defect found in these bounded deltas. Native Prisma relation
filters and concurrency still require the parent's real database verification.

## Test evidence

05:04:19: **34/34 PASS** (PB exclusion10, synthetic budget12, personal operations12).

05:04:30: broader **144 PASS / 1 FAIL** across seven files, 145 total. The failure
is `account-spend-ceiling.test.ts:233`: a static source-order assertion searches
the previous literal OpenRouter condition; production now uses `strict` for
OpenRouter OR synthetic. Reported to author for a precise assertion update
retaining check-before-create and validating the strict definition. This review
does not erase that red run or describe the whole set as passing before rerun.

05:05:43: **145/145 PASS**, independent rerun of the same seven files after the
author's static assertion correction. The two-line diff was read: it explicitly
pins OpenRouter OR synthetic and still checks the ceiling condition precedes
hold creation. Verdict GREEN for these primitives, not a future dispatch runner.

No provider, real media, credentials, database, build, commit or deployment.
