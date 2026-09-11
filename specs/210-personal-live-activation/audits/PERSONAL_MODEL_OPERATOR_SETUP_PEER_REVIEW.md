# Personal model operator setup — bounded peer review

2026-09-11. Scope: Stage A only; no production caller, provider invocation or
activation. Review uses the engineering code-review skill. A separate agent's
review is not an independent-model certification or real owner consent evidence.

## Reviewed baseline

- `src/server/model-gateway/personal-intent/operator-setup.ts`:
  `1d08e8470395c625c27f735783edb075b33728565bf03eabc49502a49fd88dca`.
- `src/server/personal-assistant/model-connection.ts`:
  `a338dcc1cb17a2099fad0274e70d6baf799fde1ca57f28e183a811403841e903`.
- Full revised setup plan; 45 author tests and 16 controller tests; the controller's
  26-case native fixture source. Native execution and typecheck remain controller
  responsibilities; reading those tests is not a fresh execution result.

The full manifest hash is independently required in the invocation context and
binds setup/owner/workspace, not just the artifact. Draft-to-persisted mapping strips
only the non-column review metadata while preserving the existing canonical hashes.
Full archived input remains necessary for historical reconstruction at publishedAt.

Current owner/member/user and grant rows are shared-locked, then the account is
update-locked and rechecked. Existing credentials, including revoked historical
ones, refuse initial setup. The shared legacy writer keeps rotation confined to
the old wrapper. Advisory locks are not falsely presented as locks honored by all
old callers. Serialization/deadlock failures refuse without retry.

The core result remains provisional (`committed:false`); historical equality also
keeps `setupTransactionProvenanceVerified:false`, avoiding proof of a joint commit
from separately matching rows. No inference/budget availability/consent authenticity
is claimed. The separate Stage B design supplies durable attempt/archive custody,
not a retroactive claim that Stage A already implements it.

## Reproductions on the frozen baseline

New owned file: `test/personal-model-operator-setup-review.test.ts`.
Command: `node node_modules/vitest/vitest.mjs run test/personal-model-operator-setup-review.test.ts`.
Observed at local 22:21:29: **2 PASS / 3 FAIL**, process exit 1.

1. Current `Date.now()` becomes NaN at the final clock query, after credential and
   account writes: the real initial helper resolves `credentialPrepared:true`.
2. Current `performance.now()` becomes NaN at the same boundary: same unexpected
   provisional success. The live guards check stored deadlines for finiteness but
   not current samples; comparisons with NaN are false. The publisher's live guard
   has the same source pattern, although these two reproductions invoke the actual
   initial helper, not the full publisher.
3. An input Proxy executes its `getPrototypeOf` trap during pure snapshot inspection
   before shape refusal. The data-only/no-executable-input boundary needs proxy
   refusal before reflection, not merely accessor descriptor checks.

The two controls pass: the real initial helper/cipher returns the exact provisional
false-authority result on ordinary inputs; replacing the caller's mutable signal
while aborting its original signal is still refused. SQL responses are simulated;
the tests deliberately do not claim database rollback, hostile network exploitation
or a naturally occurring NaN platform clock. The Proxy test is an in-process input
boundary, not a JSON HTTP payload exploit. All three findings were sent to the
author/controller before any production edit; this reviewer changed no source.

## Final correction and bounded verdict

The author corrected current wall/monotonic samples in both live guards: finite,
nonbackward against the prior observed sample, below the original capped deadline.
Timeout arithmetic uses validated samples. `types.isProxy` now refuses nested
proxies before reflection. These exact deltas were reread; no other production
changes were made by this reviewer. The author separately reported and retained
four REDs at 22:23:11 for nested Proxy and final publisher clocks, then added the
remaining wall-backward control. Those are author reproductions, not peer findings
independently executed on the former baseline.

Final source hashes:

- operator-setup.ts:
  `7781fc82b86cf074657d49c7cb16710b4ac47e68db75fe4009381d142537af1b`;
- model-connection.ts:
  `3943b61bb45b925952306d7c36863787f48fa08a477112d53308bce43f10b88d`.

Fresh reviewer run at 22:25:46: **79/79 PASS**, exit 0, four files: peer 5,
author 50, controller 16, legacy `test/unit/personal-model-connection.test.ts` 8.
The original five peer assertions are unchanged. Reviewer lint exit 0. An earlier
22:25:27 invocation named the legacy file at the wrong directory and therefore
ran only three files/71 tests; it is not counted as the 79-test compatibility run.
The corrected explicit path produced the result above. No independent TSC was
started alongside the controller. The controller reported a prior baseline native
26 PASS and TSC PASS; final post-correction native/type results remain its evidence.

Verdict: **APPROVE for this locally reviewed Stage A scope**, with all three peer
REDs closed and no other concrete defect found. Not authorization to invoke Stage A
on the pilot, activate inference, certify owner review, or treat historical matching
rows as proof of one setup transaction. The revised plan explicitly states budget
availability is not read/verified and the caller must propagate transaction errors.

## Additional controller test-only inventory delta

Read the full diff of `test/personal-pilot-upgrade-rehearsal.test.ts`: the former
count-only 20-suite assertion is replaced by the exact 20 historical basenames
plus `personal-model-operator-setup`. The historical list was compared with actual
HEAD `git ls-tree` output: all 20 are retained. Exact sorted identity comparison
rejects deletion/replacement/additions, and the rehearsal/filter/argument guards
remain. No harness, migration or execution behavior is changed by that test delta.
No finding. Controller reported the preceding full-root inventory failure and
31 targeted PASS after the correction; this reviewer did not rerun the root suite.

No credential lookup, network, database, provider, deployment, root suite or commit
was performed in this review. Existing user/other-agent changes were preserved.
