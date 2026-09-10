# Completed two-SMS receipt subject — bounded code cross-review

2026-09-10. Read full `SMS_CORRELATED_RECEIPT_REVIEW_PLAN.md`; only its first
pure proof + read-only durable subject slice is implemented/reviewed. Reviewer
owns `test/personal-correlated-receipt-review.test.ts` and this audit only.
No draft, relation/migration, worker, route, DB or provider execution by reviewer.

## Source review

The existing live correlator keeps its phase/processing/lease checks. Its exact
phase-independent evidence serialization is shared by a distinct durable
inspector that requires two completed attempt1/leaseNULL sources. Historical
WAITING transition bytes and original lease remain evidence, not a new live
claim. Original packet bytes are rehashed and recomputed through the unchanged
time-slot classifier/resolver; no concatenated source, inferred end or receipt
UTC string is blindly adopted. Pure results explicitly do not authenticate DB.

The subject loader strictly copies actor/receipt IDs, stays explicitly OFF,
requires caller SERIALIZABLE, original bounded deadline and live pilot/store
controls. Existing namespace-first question/current-proof readers are reused;
the receipt is exact accepted/consumed and actor-scoped, both stored SMS rows
must agree with it, source result receipt/hash is checked, and the permanent
expectation must be inactive without requiring other questions to disappear.
Current owner/identity/model/Google checks are not substituted with assertions
from the candidate. No source, receipt, expectation or budget mutation exists.

Read the real receipt/expectation Prisma fields and shared query helpers; new
Timestamp(3) receipt/source SELECTs convert UTC-naive values into actual instants
explicitly. No repeated mistaken AiUsage relation-field inference is used.
The loader returns committed:false under its caller-owned transaction; it does
not pretend to have observed commit or prepare an actionable operation.

## Falsifiable finding and fix

Independent final-clock test: first DB clock04:02 validates receipt04:01:02;
final clock04:00 wrongly returned a proof inspected at04:00. Initial test authoring
run11:29:26 also contained two reviewer fixture mistakes (nested evidence path,
strict packet argument with extra fields); these were corrected, not reported
as product defects. Isolated11:29:46:6 PASS / 1 FAIL confirmed the real loader
guard gap with only synthetic asserted DB results.

Author added `finalNow < now` refusal `CORRELATED_RECEIPT_CLOCK_MOVED_BACKWARD`
immediately after the final clock/live check. It does not replace DB time with
Date.now, extend TTL or alter packet hashes. The unchanged positive equal-clock
oracle remains valid. Other reviewer cases: original deadline cannot be extended
through caller mutation; final store revocation refuses; duplicate original/answer
source id refuses; missing permanent ledger is not recreated; changed historical
lease cannot retain the old packet; no returned draft or commit authority.

Types and reviewer ESLint pass. The author's reported132/132 includes the54
new proof/subject cases, seven reviewer cases and71 legacy pure cases. Reviewer
rerun of the61 new cases is recorded separately after correction. Native receipt
proof/current-SQL/lock integration is still a controller gate, not inferred from
these mocks. Same-model cross-review is not independent model-quality validation.

One additional unproven timing observation sent to author: canonical current
proof has its own `loaded.now` before the loader's first clock, which is not yet
part of the monotonic comparison. No additional native failure or exploit is
claimed, and no unapproved source edit was made from that observation.

## Follow-up clock reproduction and closure

The observation above became a separate falsifiable test at11:32:46:7 PASS /
1 FAIL. Current canonical proof had inspected DB04:03, while both loader clocks
were04:02; the loader returned a proof instead of refusing. Author now requires
loaded.now to be a finite Date, copies its millisecond epoch before the next
await, rejects now below that epoch, then still rejects finalNow below now.
This adds no wall-clock substitution, retention extension or authority.
Reviewer read the exact guards and reran proof24 + subject33 + reviewer8:
**65/65 PASS at11:36:33**. The earlier61/61 run at11:32:14 covered only the first
clock correction. Both RED observations remain recorded above.

Native fixture review: actualAnsweredQuestion uses the real dispatcher/hook,
enqueuePersonalSms and processPersonalSms, with only HTTP replaced by a synthetic
response. No fake source-completed UPDATE creates the accepted receipt. The ten
new loader cases cover three zones, repeated exact packet/no domain writes,
wrong actor/workspace, actually refused answer, current Google/model revocation,
real short TTL, later active question preservation and owner revocation blocked
using pg_blocking_pids. The reader barrier is after the completed read, before
commit. The final next-read oracle is the specific current-binding refusal.
Controller reported71/71 native PASS before the second clock guard, then72 PASS /
1 FAIL in the extended73-case run: the refusal was correct but the test regex
omitted BINDING. That assertion was changed to its exact code, with no production
change. A fresh full controller campaign is still pending here; none was run by
this reviewer. Mocked-clock regressions specifically prove the new lower-bound
checks; ordinary native clocks do not reproduce an OS clock adjustment.

Reviewer subsequently read both controller result.json files and output summaries:
71/71 at15:31:59.443Z exit0 and72/73 at15:35:17.109Z exit1, each exact server
STOPPED. The latter output names TEMPORAL_REGISTRY_CURRENT_BINDING_REQUIRED as
the actual refusal; the changed exact-code oracle agrees with that evidence.
TypeScript and scoped reviewer ESLint also pass after the second clock guard.

## Subsequent full native closure (controller-run, receipt read by reviewer)

Read evidence/postgres-native-1789054544302/result.json and output.txt. Exit0 at
15:38:38.305Z, exact server STOPPED. All19 per-file clone receipts have exit0 and
the same77:f072fe1fe84f1d2f87bd61dfc0d642ef migration fingerprint. Temporal file
now73/73 PASS, including the specific owner-revocation next-read refusal. Full
campaign249/249 PASS as recorded by controller; no DB was run by this reviewer.
The earlier72/73 failed-oracle receipt remains above and is not relabeled PASS.
