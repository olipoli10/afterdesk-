# R37C/R37F — Current authority and candidate-bound reservation

Post-freeze correction context, 2026-09-09. Historical seals, fingerprints and R37 evidence reports are unchanged. Scope: R37C-CURRENT-GRANT-001, R37F-LEASE-CLOCK-002, R37C-CANDIDATE-BINDING-003 from `evidence/commands/g3-architecture-correction-review-r2/stdout.txt`.

## Evidence classification

All runtime checks here use synthetic fixtures, in-memory database doubles and the local network guard. They are not live providers, real PostgreSQL rollback evidence, independent model-performance evidence, credential isolation or production validation. Application cancellation is cooperative; trusted in-process callbacks are not an OS sandbox. Candidate behavior remains UNPROBED.

`g3-r37cf-authority-before` recorded 9 failed / 1 passed before this patch. Eight failures directly established product behavior: four callbacks invoked after authority/lease loss during claim completion, three accepted evidence results after grant/lane loss in the callback, one accepted wrong-candidate grant. The ninth delivery test also hit an author fixture error: mocked Prisma.DbNull was not converted to database null during failure cleanup. It is not presented alone as a complete R37F runtime reproduction. The normal success/replay control passed.

The separate `g3-r37f-lease-paired` test removed that ambiguity: exact historical delivery source with dependency seams mocked invokes a callback after delayed lease lookup (callback count 1, `LOCAL_FIXTURE_INVOKED`), while current source rejects first (callback count 0, `R37F_ACTIVE_LEASE_REQUIRED`). The baseline source is pinned in the test to pre-patch campaign revision `a9c4c01fdb2fcdff3838a6966f1560832bc32553` rather than a moving HEAD. The fixture callback deliberately throws before normalization; no normalization/cleanup mock can conceal whether it ran.

## Correction boundary

- R37C `assertCurrentControlledRunAuthority` rereads run, grant and lane and only then samples trusted time. It verifies current lease token/state/expiry, run and sealed fingerprints, workspace/grant/idempotency, exact model, executor, allowed case and provider candidate; grant must be ACTIVE and lane ENABLED.
- The common check runs before direct adapter invocation and before terminal evidence acceptance. R37F repeats it after its extra DB lookup, before its fixture callback and before canonical evidence writes. R37F separately rejects an already-expired returned lease immediately after its awaited lookup.
- Lease expiry and a cooperative execution deadline are capped at both grant and sealed-authorization expiry. Abort state is rechecked after asynchronous pre-callback work, and late completion cannot become successful evidence. This does not attest that arbitrary synchronous/external work stopped.
- `adapterInvoked` tracks the actual direct callback entry; a pre-use refusal reports false. R37F preserves its separate fixtureAdapterInvoked flag.
- R37B spend reservation requires explicit candidateKey, includes it in the request fingerprint and checks it against the grant before reuse or creation. Both real callers (R37C coordinator and R37 campaign) provide the exact candidate. No schema migration was needed.
- Existing completed run replay remains readable; new exact reservations replay without a second spend. Legacy unfinished reservations whose stored request fingerprint omitted candidateKey fail closed instead of silently reinterpreting historical authority. Existing release/settlement commands are unchanged.

## Verification records

Every listed ID has an immutable launch descriptor and command/stdout/stderr record; HEAD/tree timestamps are observed separately per command because other authorized lanes committed during this work.

| ID | Result |
| --- | --- |
| `g3-r37cf-authority-before` | 9 fail / 1 pass, including one fixture ambiguity described above |
| `g3-r37cf-authority-after` | 45/45 pass, stderr empty |
| `g3-r37cf-authority-after-r2` | 50/50 pass, stderr empty |
| `g3-r37cf-authority-after-r3` | 53/53 pass, stderr empty |
| `g3-r37f-lease-paired` | 2/2 paired checks pass, stderr empty |
| `g3-r37cf-authority-typecheck` | Initial test-mock type mismatch plus other lane's temporary release-test errors; not green |
| `g3-r37cf-authority-typecheck-r2` | Global typecheck exit 0, stdout/stderr empty |
| `g3-r37cf-authority-typecheck-r3` | Global typecheck after compatibility caller update exit 0, stdout/stderr empty |
| `g3-r37cf-authority-lint-r2` | All owned product/test files and compatibility caller pass, stdout/stderr empty |

The author also ran one unrecorded intermediate Vitest development command during mock repair. It failed on missing candidateKey fixtures and mock Prisma.DbNull handling; it is not used as acceptance evidence. Durable before/after acceptance is represented only by the records above and the final records appended below.

Source-only Sol high correction review is recorded separately as `g3-r37cf-authority-critical-review`; served model is unverified. Its findings must be reconciled, not treated as runtime proof.

## Completed review cycle and final validation

The single source-only review returned CHANGES_REQUIRED with R37-REV-001 (evidence update can finish after the checked deadline) and R37-REV-002 (settlement/release crash replay changes expectedVersion). Both were confirmed by the author before correction: `g3-r37cf-review-findings-before` recorded 3 failed / 15 passed. R37-REV-001 returned success after a delayed evidence write; R37-REV-002 rejected both SETTLED and RELEASED retries after the spend transition committed but the run update failed.

R37-REV-001: C and F now record evidence inside `recordControlledRunEvidence`, a Prisma transaction. The full current-authority check precedes the write; after its await, grant/lane are read again and trusted time/abort/deadline are checked before the transaction returns. A failed check rolls back that write. The transaction's commit itself is not claimed to freeze time or revoke external work atomically.

R37-REV-002: `terminalCommandVersion` accepts only RESERVED/version 1 or the matching terminal state/version 2 and always reuses original command version 1. The source-backed lifecycle is `prisma/schema.prisma:3558` (default state RESERVED, version 1); the only source create/update writers found in `src` and `scripts` are `r37b/activation.ts` reservation create and terminalAttempt. terminalAttempt requires RESERVED and increments exactly once. Unknown states/versions fail closed. Historical records, seals and fingerprints were not rewritten; terminal API fingerprint comparison is unchanged. Tests simulate the lost coordinating-run update and verify byte-equivalent terminal command input on retry, single adapter invocation and no duplicate effect.

| Final record | Result |
| --- | --- |
| `g3-r37cf-review-findings-before` | 3 fail / 15 pass, actual scoped review reproductions |
| `g3-r37cf-review-findings-after` | 26/26 pass |
| `g3-r37cf-authority-final-tests` | Pre-review reconciliation checkpoint, 55/55 pass |
| `g3-r37cf-authority-final-lint` | Pre-review reconciliation checkpoint, exit 0 |
| `g3-r37cf-authority-final-typecheck` | Pre-review reconciliation checkpoint, global exit 0 |
| `g3-r37cf-authority-postreview-tests` | Final 61/61 pass across 11 suites, stderr empty |
| `g3-r37cf-authority-postreview-lint` | Final owned files pass, stdout/stderr empty |
| `g3-r37cf-authority-postreview-typecheck` | Final global typecheck exit 0, stdout/stderr empty |

The final tests additionally cover revocation/lane disable during the evidence write, canonical-delivery write rollback, exact success/replay, post-use refusal, grant-capped timeout, late callback completion, reservation candidate mismatch and immutable terminal command replay. The author inspected the final diff and direct callers. The initial review cycle was completed by resolving both concrete findings with executed local tests.

The parent then explicitly requested a final review limited to REV001/REV002. Native record `g3-r37cf-postreview-final-review` returned APPROVE with no findings; requested Sol high, served model null. It is a source-only approval and explicitly does not independently verify the 61 tests, database behavior, transaction isolation or external atomicity. Product source did not change between the postreview test run and this final approval.

## Compatibility and remaining limits

Current application reads are not a distributed atomic guarantee against revocation after the last read. No network, signer, deployment, provider, customer data or production effect was authorized. Unit mocks test release-after-refusal and exact replay/single settlement, not actual PostgreSQL transaction isolation. Two existing integration fixtures were updated for explicit candidateKey, but no real DB integration suite was run in this lane. No historical R37 report/seal or lockfile/database schema was modified.
