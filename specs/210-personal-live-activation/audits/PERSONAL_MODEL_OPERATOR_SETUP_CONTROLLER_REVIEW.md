# Personal model setup Stage A — controller evidence

2026-09-11. APPROVED LOCAL CORE ONLY. No production caller, configured manifest,
real key, provider call, activation, new consent, migration or budget mutation.
This review is a second-agent/code/native check, not independent model quality
certification. Existing user tsconfig.json and drafts remain untouched.

## Implementation and limits

Read full revised plan, production diff, operator module, peer review and native
fixture. The core maps existing prepared artifacts to actual immutable published
route/policy columns and an initial encrypted credential inside its caller's
Serializable transaction. The old provision wrapper retains its rotation scope.
Full manifest hash binds setup/owner/workspace; supplied hashes are not deployment
attestation. Current verified owner, prior active grant, no historical credential,
bounded clocks and current authority are required. Current consent is not created.

The helper returns provisional success only. Historical reconstruction requires
the full retained artifact, and does not prove joint transaction provenance from
matching rows alone. No spending ledger is consulted to certify availability:
budgetAvailabilityVerified=false; all admission/reservation guards remain runtime
responsibilities. Stage B durable claim/archive/commit receipt is separate work.

## Reproductions retained

- Initial controller TSC: four fixture errors (missing NODE_ENV in three places
  and invalid hash template type); corrected without weakening runtime checks.
- Peer 2 PASS /3 FAIL: two nonfinite current clocks after credential writes, plus
  a Proxy reflection trap. Author additional clock/nested-proxy REDs retained in
  plan. Current samples are now finite/nonbackward and proxies refuse before
  reflection. These injected in-process cases are not remote HTTP exploits.
- Full intermediate root: 7146 PASS /1 FAIL /3 historical skips, receipt
  `evidence/root-1789093279321`. The failure was the historical inventory count20
  after adding native suite21. The replacement asserts every exact historical
  basename plus the reviewed new suite, and retains rehearsal mode/filter guards.
  It does not skip the new test, weaken a behavioral oracle or alter migrations.

## Fresh results

- Legacy credential native: 12/12 PASS02:12:30Z,
  `evidence/postgres-native-1789092720800` (pre-final new-core corrections).
- Initial new core native: 26/26 PASS02:20:20Z,
  `evidence/postgres-native-1789093193178` (pre-peer correction).
- FINAL corrected core native: 26/26 PASS02:25:43Z,
  `evidence/postgres-native-1789093516639`. Three timezones, exact mappings/cipher
  binding, unchanged grants/holds, four real-write rollback points, historical
  expiry/revocation, collision/replay and two concurrent native backend cases.
  ACK loss is an injected caller failure after real commit, not a network outage.
  PostgreSQL17.11; exact79 fingerprint; loopback synthetic clone; server stopped.
- Final author/peer/controller affected group:79/79 PASS; peer independently
  reran its five unchanged counter-tests; focused lint PASS.
- Final global TSC with --noEmit --incremental false: exit0 (controller42050).
- Rehearsal inventory tests31/31 PASS after exact-list correction.
- Final Stage A root inventory:7157 PASS /3 historical skips,464 passing files,
  `evidence/root-1789093638910`, finished02:29:18.809Z. This inventory precedes
  the separate Stage B HTTP/configuration/orchestration changes, not their proof.

Final reviewed SHA256:
- operator-setup.ts:7781fc82b86cf074657d49c7cb16710b4ac47e68db75fe4009381d142537af1b
- model-connection.ts:3943b61bb45b925952306d7c36863787f48fa08a477112d53308bce43f10b88d

No claim of actual owner consent, deployed operator setup, valid provider key or
inference. Android5 and Calendar-only deployed backend receipts stay separate.
Metrics remain roadmap22%, local build46.75%, C2 preparation18/18,
real-testNO-GO, Verified-E2E0%. Existing heartbeat remains ACTIVE. Continue Stage B.
