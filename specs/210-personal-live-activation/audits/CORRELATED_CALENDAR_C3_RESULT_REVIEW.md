# C3 historical result — peer code review

2026-09-10. Reviewed complete `correlated-calendar-approval-result.ts`, C3 plan/audit and backend plan section 7, with frozen SQL79 and the actual strict A/reference contracts already read for C1/C2a.

Source SHA256 unchanged during this review: `9a6da6a594a14d0027134b33e5dbd8bd706d94c613d2edf20227ec5924d5cc06`.

## Verdict

**No additional actionable critical defect found in this bounded historical reader.** This is peer code review, not independent model-quality validation, native SQL execution by the reviewer, a human-approval observation, or a Google event verification.

Owned additions only: `test/correlated-calendar-approval-result-review.test.ts` and this audit. No production/schema/native fixtures, existing tests, source authority or activation was modified. No test failures were observed in this review's initial run; no RED-to-GREEN product finding is claimed.

## Fresh reviewer evidence

Command: `node node_modules/vitest/vitest.mjs run test/correlated-calendar-approval-result-review.test.ts test/correlated-calendar-approval-result.test.ts`

**81/81 PASS** (10 reviewer + 71 author), started **14:55:54 America/Toronto**, exit 0. Scoped ESLint for both new C2a/C3 reviewer tests completed exit 0. Global TypeScript `--noEmit` subsequently completed exit 0.

The ten separate reviewer cases use a fresh fixture built from real pure historical two-source reference/fingerprint contracts, with the database boundary mocked. They cover NFD/UTF-16 identity preservation versus silently normalized lineage; confirmed history with only REVIEW despite expired pilot and disabled STORE/APPROVAL/Google; replacement current membership versus forbidden admin; globally foreign approval never hidden as no attempt; JSON state captured before approval-query latency; late REVIEW withdrawal; unknown commit without retry or SQL-detail leakage; original abort signal through commit; impossible future observation; and exact frozen output keys without replay handles.

## Boundaries checked

- Namespace discovery uses immutable question metadata, not phone identity, SMS bodies or a fresh active receipt loader. Namespace locks precede current OWNER/member locks and calendar state locks. No recovery call or namespace revival is introduced.
- Current owner/membership is required, but its timestamps need not equal historical WRITE authority epochs. READ/WRITE/model credentials and the active pilot are deliberately not reauthorized for this history read.
- Review/request/proof hashes, deterministic request ID, global operation/review mapping, approval origin/nonce/fingerprint and strict state must agree. An absent or malformed approval never certifies an arbitrary terminal result.
- CONFIRMED requires the deterministic recorded event ID and matching durable completed state. It remains `confirmationBasis:DURABLE_RECORDED_RESULT` / `providerStateVerified:false`, without an invented confirmedAt or assertion that the Google event still exists.
- Exact processing with an expired lease maps to UNKNOWN without C1 mutation. NOT_ATTEMPTED is reserved for coherent untouched pending state with no global approval. PENDING_RESULT is a snapshot according to DB `observedAt`, not a continuing provider-status check or permission to retry.
- State/Date snapshots precede later awaits; errors are opaque, time/signal/REVIEW remain checked after transaction resolution, and no silent retry occurs.

The controller separately reported native 139/139 and clean stop at `2026-09-10T18:51:35.978Z` in `postgres-native-1789066195425`. This reviewer did not execute or inspect that receipt in this tranche; it is not counted as a fresh reviewer run. SQL joins/locks, owner revocation contention and physical timestamp behavior require the controller's separately recorded native evidence.
