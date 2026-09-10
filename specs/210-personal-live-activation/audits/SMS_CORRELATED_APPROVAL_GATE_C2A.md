# C2a — canonical read-only approval gate

2026-09-10. Author slice in `C:/dev/endvera-astra-r03`, following accepted C2 design and C0/C1 commit `95809c09122b84142b067aebdcb2ea37f20ec747`. Scope: one new gate, dedicated unit tests and this audit only. No caller, claim insertion, operation mutation, execution, route, migration or generation.

## Interfaces and authority boundary

- `inspectCorrelatedCalendarApprovalOfferInTransaction(tx, {enabled:true,actor:{userId,workspaceId},reviewId}, env, context)` inspects a committed pending/0/null-result/null-lease/nontransport operation with no global approval.
- `lockCorrelatedCalendarApprovalWriteInTransaction(tx, claimA, env, context, phase)` accepts only `CLAIMED` or `DISPATCH_CLAIMED`, reloads the exact immutable approval, and compares the A claim/state and current authority. It does not perform the caller's one-use CAS.

Success is provisional `CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED`, `committed:false`, `executionAuthorized:false`, `persistencePerformed:false`, `providerCallPerformed:false`. It contains internal operation metadata, view/fingerprint, original request, current WRITE authority, READ prerequisite, the exact read-only item, and final inspectedAt/approvalExpiresAt. These are not an authenticated tap, a provider receipt, or permission to skip the later dispatch CAS. OFF returns DISABLED without querying.

The gate has no import of calendar-actions. Its real reader dependencies remain unchanged; transitive imports include Prisma/configuration code. No claim of a DB-free import graph. The architecture skill informed the bounded separation, not an authorization to change adjacent code.

## Lock and data order

Caller SERIALIZABLE/timeouts → scoped discovery with no calendar lock → real receipt loader (canonical conversation namespace, question, sources, owner and WRITE authority) → metadata-only READ/WRITE/owner shared locks → unchanged real item reader under the same namespace/deadline → review/operation locks → global approval lookup by reviewId OR calendarOperationId → final DB clock.

The deliberate second canonical inspection avoids changing the frozen reader and acquires the READ prerequisite before calendar locks. Offer uses calendar SHARE; write gate upgrades to UPDATE only after the canonical namespace. No callback, token loader, credential decryption, ciphertext selector or provider request. The credential table is joined solely for its ID, ownership and revoked state.

READ is a separate active `calendar_read` grant on the same account/credential. It must contain events.readonly or events scope; WRITE independently requires events scope on account and write grant. Merely calling `requireGoogleReadAuthority` would not prove scopes, so the metadata query has explicit predicates and the returned scope arrays are checked. Workspace owner identity and active owner membership are explicit; legacy admin permissions are not imported.

Committed-row checks reuse the already-applied SQL79 `sms_correlated_approval_pre_snapshot` on actually selected review/operation/approval xmin under SERIALIZABLE. This is the existing bounded visibility contract, not a new universal transaction-age theorem. The gate does not replace SQL79's own final-row/transition guards or attest any human action.

The complete displayed evidence (both texts, source refs/hashes/times, citations, anchor, slot, draft and version/false-authority labels) is compared to the first canonical subject. Operation/review/request identity, six-field request hash, compact proof hash, deterministic UUID, current account, immutable approval token/times/authority and exact result phase are compared separately. All caller data and result Dates are copied to primitive snapshots before subsequent awaits.

## Validation history retained

1. Initial author suite: 71 PASS / 1 FAIL at 14:46:38. The sole failing static oracle matched the word `decryption` in a comment, not an invocation. Narrowed that detector to a `decrypt(` call; no source relaxation.
2. Three-file author run: 192/192 PASS at 14:47:09 (72 gate + 89 A + 31 C0). Scoped lint PASS. Typecheck then found two fixture-only literal-array typing errors; scope arrays were explicitly typed string[], without changing assertions.
3. Main identified missing monotone elapsed-budget enforcement. Author reproduced two RED cases at 14:48:21: 100ms and 5000ms original deadlines, wall clock moved backward while monotone budget elapsed, provisional gate incorrectly resolved. This failure is retained independently of the prior green functional coverage.

Cross-review is by another agent of the same model, not independent model-quality evidence. Native validation is owned by the parent and is not yet included in this audit. No unit mock result is a SQL execution or provider proof.

## Review corrections and new receipts

4. Peer reproduced two late-environment failures at 14:49:16 (8 controls PASS / 2 FAIL): changing the authority reference to a different nonempty value or the pilot expiry to a different future value during the final clock await incorrectly resolved the gate. `live` now pins the canonical authority and exact pilot expiry at every boundary. It also enforces one `performance.now()` deadline established from `min(5000, originalAbsoluteDeadline - entryWallClock)`. Both clocks can shorten acceptance; wall-clock rollback cannot extend it. Readers still receive the same absolute deadline, not a renewed budget.
5. Corrected four-file run: 204/204 PASS at 14:50:07, scoped lint and TypeScript exit 0. Additional real-graph import test, without the subject/item/DB/token module mocks, increased the same run to 205/205 PASS at 14:51:19. This import test performs only an OFF gate call and asserts zero SQL queries.
6. Main noted `z.unknown()` left `row.result` aliased until the approval lookup. Author reproduced RED at 14:51:54: a DISPATCH_CLAIMED object changed in memory to CLAIMED during that await was adopted by the CLAIMED gate. The existing bounded A state parser now copies/validates the state immediately after row parsing, before any further await (offer separately requires literal null). No shared parser was changed. The resulting state binding uses that captured snapshot, never a recursive or late mutable result.
7. Latest author run: **206/206 PASS at 14:52:13** (76 gate, 10 peer, 89 A, 31 C0), scoped lint exit 0; TypeScript exit 0. No existing tests or production files outside the new gate changed. Earlier RED and oracle/type failures above remain recorded.

Author implementation is frozen pending the peer's narrow final snapshot reread and parent native validation. No native proof is claimed here. C2b/c are still absent: successful inspection alone cannot write a calendar event.
