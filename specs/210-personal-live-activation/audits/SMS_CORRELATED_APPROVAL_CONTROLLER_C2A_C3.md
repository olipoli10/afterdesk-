# Controller verification — C2a current gate and C3 historical result

2026-09-10. Local synthetic campaign only. No credentials decrypted, actual
Google/Twilio/model call, new APK, deployment or remote migration in this tranche.
SQL78/79 remain frozen; local fingerprint79:41de317b70655965d494f1c3e0ea5940.

## Scope and review

Controller fully read both production modules, author tests/audits and separate
reviewer tests/audits. Separate code authors/reviewers are not independent model
quality validation. C2a SHA256 c7690b347d8cb5d856828872c36aff4b6acdbaea8bb35ca0bfc4eff7ecb1d56d;
C3 SHA256 9a6da6a594a14d0027134b33e5dbd8bd706d94c613d2edf20227ec5924d5cc06.

C2a reconstructs current canonical two-source proof under namespace/authority
locks, requires distinct current READ and WRITE consent, checks committed selected
tuples, and matches immutable approval/current typed phase. It neither approves
nor executes. Author/peer fixed retained monotone-budget, late environment-pin and
JSON alias findings. Peer87 tests passed at14:53:29 America/Toronto.

C3 reads immutable historical metadata and current OWNER, with REVIEW alone.
Expired source/pilot or disconnected Google/model does not revive active authority
or hide a coherent historical outcome. The strict result has no replay handle,
source text or invented confirmedAt. CONFIRMED means DURABLE_RECORDED_RESULT;
providerStateVerified stays false. Peer81 tests passed at14:55:54.

## Actual PostgreSQL evidence

- `postgres-native-1789066195425`:139 PASS, finished18:51:35.978Z, owned server
  STOPPED. Eight added C3 cases include three time zones, expired unattempted and
  processing, actual C1 recovery, recorded unknown, ownership transfer and real
  concurrent member revocation. Distinct PIDs/pg_blocking_pids prove lock contention.
- `postgres-native-1789066545968`:139 PASS /7 FAIL, finished18:57:29.421Z,
  STOPPED. All seven new C2a fixtures omitted the required REVIEW flag, so the
  initial live gate correctly refused before database inspection. Controller
  changed only that fixture configuration; no production gate was weakened.
- `postgres-native-1789067010602`:146 PASS, finished19:05:17.619Z, STOPPED.
  Seven C2a cases cover exact offers in three zones, missing READ then granted READ,
  committed CLAIMED/DISPATCH_CLAIMED then READ revocation, and own-transaction tuple
  mutation refusal with complete rollback. No executor was invoked.

Following peer fixture review, controller added explicit count2/readback assertions
for Google/model revocations and an assertion that workspace epoch really changed.
Full native validation of that strengthened snapshot passed below.
This does not retroactively strengthen the already recorded139/146 receipts.

Root `root-1789067163764`:5557 PASS /3 historical skips across407 passing files,
finished19:07:16.323Z. Global TypeScript and scoped ESLint passed. New unimported
C2b and private C3 HTTP files were assigned only after this root run completed;
they are not covered by this receipt.

Full native `postgres-native-1789067153648`:342 PASS across20 distinct database
clones; all20 receipt exitCodes0 and the same79 fingerprint independently counted
by controller. Finished19:10:19.676Z, owned server STOPPED; retained cluster
`personal-pg-native-a18fdda4b0ed410ca15da7814c6a4b05`. Includes strengthened146
temporal cases. New C2b/HTTP files were not imported by this frozen native graph.

## Limits and continuation

Native approval states are TEST-CREATED SQL fixtures, not an observed human tap or
Google event. These gate tests start their context within the transaction: they
do not prove C2b's total entry/maxWait budget or concurrent grant revocation during
an executor call. Those belong to the next same-executor tranche.

Next: C2b atomic command/approval/claim, C2c the existing executor with closed typed
state and original budget, private offer/result routes, then mobile explicit
approval. No second executor, automatic retry or renewed lease. Dashboard unchanged:
roadmap22%, local build46.75%, C2 preparation18of18, real-test NO-GO,
Verified-E2E0%. This is not project completion.
