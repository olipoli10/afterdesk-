# Local evaluation contracts: scope and replay

These are G0-prepared contracts, not G1/G5/G7 observations. G0 self-tests do not
count toward phase gates. Freeze them at CAMPAIGN_HEAD before measured runs.

## Canonical source and five metric rubrics

`local-roadmap-baseline.md` is the exact 13,609-byte Git blob from Brain commit
`3a4e31d837ed4f53f8326d865fca43cc54eb4c3e`, path
`ROADMAP_PROGRESS_MODEL.md`, SHA-256
`07b26884f862f00a940af12b60f9ffc8715d086f012115ab14e0e6fe9aa88b7b`.
The live Brain source and its committed blob were byte-compared in G0.

`local-metrics.mjs --revalidation-replay <metric> <commandId> <finalSnapshotPath>`
emits one METRIC_CALCULATION. Metric names are `roadmap`, `localBuildReadiness`,
`c2`, `realProviderCustomerReadiness`, and `verifiedE2E`.

The source arithmetic is 13 phase rows totaling 100 weighted points and 22
earned points; build credit is 22 plus 8*0.75 + 9*0.75 + 10*0.75 + 9*0.50 =
46.75. C2 checks all 18 frozen enumerated preparation gates. Current canonical
NO-GO and zero current-HEAD observed E2E are retained separately. The six values
are therefore 22, 46.75, 18, 18, NO-GO, 0. Provider-call count is NOT a sixth
rubric and must separately be derived from the actual campaign command ledger.

At G7, capture a fresh exact canonical Brain ROADMAP_PROGRESS_MODEL.md copy as
RUN_GENERATED supporting evidence at a separate path. Include this snapshot
and the frozen baseline in `replay.readPaths`; declare all contracts normally.
Bind the snapshot's provenance to the observed Brain HEAD/TREE and closure
evidence. The calculator recomputes the accepted canonical planning ledger,
not source-code maturity from scratch. It rejects a changed value because this
local-only contract has no accepted gate-transition/real-denominator review
package. A change requires a separately reviewed calculation contract and new
campaign freeze, not a fabricated unchanged or crossed rubric.

## Synthetic corpus policy

`local-corpus-no-pii.mjs --revalidation-replay <commandId> <corpusManifestPath>`
emits INVARIANT_RESULT and uses exit 0 only for PASS. Its readPaths must include
the manifest and every one of the 96 input paths. It verifies each hash and ID,
8*8 development / 8*4 hidden distribution, synthetic markers, allowed field
vocabulary, syn- entity IDs, Simulation contact labels, reserved-domain email,
no populated phone field, no network URLs and common numeric/postal patterns.

This is a bounded policy for purpose-written synthetic fixtures, not a claim
that regexes can detect every person's identity or all PII in arbitrary text.
The frozen authored corpus provenance and content review remain necessary.
Changing its vocabulary/inputs after freeze invalidates the campaign.

## Hidden-oracle denial boundary

`local-oracle-denial.mjs --revalidation-replay <commandId> <corpusManifestPath> <oracleManifestPath>`
must be observed under Node `--permission` from the initial measured run, not
merely during seal replay. Grant reads only to its entrypoint, the two metadata
manifests, and other declared non-oracle dependencies. Do not grant hidden
oracle files, their parent directories, the repository root or `.git`.

The probe checks `process.permission.has` and actually attempts a read for all
32 hidden entries. Only ERR_ACCESS_DENIED with FileSystemRead qualifies; lack
of Node permission enforcement or ordinary ENOENT never qualifies. The seal
validator separately verifies the manifested oracle files exist and match
their frozen bytes. Include the two manifests in replay.readPaths, NOT the
hidden entries. Metadata may be read by this audit probe but must not be given
to the actual candidate, whose input-only export is separately defined.

This is evidence of the tested local Node permission boundary, not OS-user,
Codex-session or provider-harness isolation. No runtime candidate was called.
Do not attest a future runtime's hidden protection solely from this probe.
To grant G5 PASS, the actual candidate-facing path must use the same restricted
input-only boundary and prove it has no alternate transport/file/Git access.
Otherwise retain G5 REWORK and describe the scope of the observed probe.

## Seal integration hazards identified in G0

- The canonical validator is under `specs/206-gpt6-astra-endvera-reverification/scripts/`,
  not repository-root `scripts/` as the plan's shorthand invocation suggests.
- The validator grants every EVALUATION_CONTRACT as a readable dependency.
  Hidden oracle entries must stay outside that role and outside that directory.
- RUN_GENERATED paths cannot be committed at FINAL_HEAD. Frozen contracts must
  equal CAMPAIGN_HEAD blobs byte for byte, including line endings.
- Even a non-green local seal requires five G7 metric calculations and Brain
  closure. BRAIN_PACKET is invalid while Brain is clean; a checkpoint/validation
  path is then required. Do not dirty Brain merely to make a packet acceptable.
- Verified baseline/retest constraint: validator lines 604-609 count failures
  across every historical DETERMINISTIC_TEST, PHASE_CHECK and INVARIANT_CHECK;
  lines 1335-1362 require every local phase PASS and no such historical failure
  for terminal local completion. Thus a retained red G1 baseline forces
  LOCAL_REVALIDATION_REWORK even after PRODUCT_COHERENCE_RETEST=PASS. Keep both
  facts; do not change expected exit codes, discard the baseline, or weaken the
  validator to manufacture a green campaign. This campaign intentionally keeps
  the strict existing rule, and may finish with truthful validated REWORK.
- These self-tests use child processes to validate the permission boundary in
  G0. Do not use the self-test entrypoint as an INVARIANT_CHECK replay contract;
  measured invariant entrypoints themselves do not spawn subprocesses.
