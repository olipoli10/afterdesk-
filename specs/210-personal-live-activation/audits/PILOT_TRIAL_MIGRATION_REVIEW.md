# Trial migration — bounded peer review

2026-09-10. Distinct-agent code review, **not independent model-quality
certification**. No SQL, database, network, credential, real subprocess or migration
was executed by this reviewer. Engineering code-review guidance used.

## Scope and source

Read the complete `PILOT_TRIAL_MIGRATION_PLAN.md`, runner/bridge changes, supporting
source/history/staging/environment paths and both migration author test files.
The plan's original departure refusal is historical; the controller separately
reported a corrected real PREFLIGHT at1981817c. That report is not new execution
evidence from these tests and does not release either migration CLI.

- Runner reviewed after fixes:
  `a360016142001c94ec7ec3fd374b858e25602361dd7851f927cf3a24abb8768e`.
- Bridge:
  `23338ffddc734b11101969a20fb1b640e61ee62851876f4a94c114fc4765b69a`.
- Peer file `test/personal-pilot-trial-migration-review.test.ts`:
  `ddcda55a94e1c7e6450fbdc033b9a95e473cc415ce40008d624ee10ce0fcb86f`.

Only the peer test and this audit are reviewer-owned. No production changes.

## Reproduced defects and resolution

Initial frozen runner53a50351, peer run20:00:32: **3 PASS / 2 FAIL**.

1. A synchronous receipt write could exhaust the original180s budget, yet the
   function returned `MIGRATION_HISTORY_79_VERIFIED` with an earlier elapsed value.
   Fixed by checking the same original budget after persistence, before return.
   A late failure leaves the history receipt immutable and writes a separate
   `failure-outcome.json` exclusively after verifying the complete stage plus
   the exact just-written receipt bytes. No overwrite, retry or marker removal.
2. PreflightPG180006 and postflightPG180007 were accepted by the runner but the
   bridge correctly refused their mismatch. The runner now requires equal
   `versionNum` as well as the exact prior70 fingerprint before publishing.

Original peer assertions unchanged. Fresh two-file run20:03:06:
**35/35 PASS** (30 author +5 peer). Peer ESLint exit0. Intermediate20:02:08 run
was33/34 while author published the additional failure-outcome source edit at
approximately20:02:13: one author overflow case refused before spawn. This is a
retained unstable-source run, not another confirmed product defect; the fresh
stable rerun passes.

## What the five peer tests establish

- The actual runner return, serialized in actual property order, is accepted by
  the actual migration bridge validator. Neither producer nor parser is mocked.
- Both defects above refuse as uncertain after one simulated migration call.
- A lost acknowledgement retains the exact fixed target marker; a subsequent
  invocation refuses before private input or another migration call, despite a
  possible new staging UUID.
- Environment is copied and inspected **at invocation**, not merely after the
  runner scrubs its mutable environment object. Exact target URLs and closed
  keys are used; injected NODE_OPTIONS/PGOPTIONS do not propagate.

These tests simulate filesystem writes, Git/source-binding processes, Prisma
responses and runtime fingerprints. Exactly two known synthetic byte sequences
stand in for the private baseline/history hashes; all other hashes are real.
They do not prove those private bytes, target identity, TLS on a network, actual
SQL, Windows ACLs, process termination, migration completion or data preservation.

## Reviewed limits and decision

The marker is exclusive and fixed to T within the controlled checkout, not a
distributed lock or a defense against an operator copying a checkout/deleting
evidence. Controller must retain that checkout/marker and reconcile any previous
attempt, rather than switch roots to retry. No automatic UUID bypass exists in
the reviewed invocation path.

The180s runner budget retains the140s pre-spawn requirement (120s child +20s
postflight reserve). Slow source checks legitimately refuse before writing;
postflight timeout remains uncertain. No relaxation is recommended.

At the initial review checkpoint, CLI entries were hard-disabled for migration;
the controller-approved opening is reviewed separately below. Callable APIs are
tested only with simulated processes. A success receipt proves neither backup,
schema nor old-column preservation: their false literals remain exact and those
controller gates remain separate. A history receipt retained alongside a final
failure is not an overall successful invocation. If recording failure also fails,
the thrown uncertain result and retained attempt still prohibit automatic retry.

No other concrete blocking defect found in the reviewed frozen implementation.
This is a **local mocked review GREEN**, not execution authorization.

### Final targeted run

Fresh three-file run20:05:08, exit0: **75/75 PASS** (runner author30, bridge
author40, peer5),13.84s. The bridge author test at that run was
`2bf6149051a3ae31bf2709e06d25131e2d3038652a6824ce9850020be7a436bf`.
Its full source and the later exit-nonzero, ingress-source-change and45s timeout
cases were read. Bridge author reported fresh shared TypeScript19445 exit0 after
fixture-only annotations; no duplicate typecheck was launched by this reviewer.
This typecheck preceded the author's additional nested-order exploration.

The author separately explored whether nested JSON key order must be canonical
as well as the root order. Source remained unchanged. Accepting a different order
of already-closed nested fields does not itself change a pin or authorize an
effect. It is a serialization-contract decision for the controller, not an
additional authority defect established by this review.

## Controller-approved closed CLI opening

The controller explicitly authorized only the two exact CLI entries after the
initial review. Final source reread:

- Runner `4f1513dec14fd2d05d69bc9b462ebc3058da0fa6d810cfc7b95e9277f60d2ac2`.
- Bridge `49b79df3614cb9e317caacee44cab118511e3859273f7dd76592fd8eaa81f7cc`.
- Extended peer9 tests:
  `bfbecdb8d86e0bab50e80b5c2986554e534c75ec8ddf281b1b23ca235f688c84`.

Runner now parses only6 arguments for PREFLIGHT_70 or10 for MIGRATE_70_TO_79,
with immutable validated expected pins, then invokes the unchanged guarded
runner once. Bridge preserves its10-argument preflight grammar and accepts only
the separate15-argument migration grammar. Its migration CLI directly calls
the same reviewed one-shot transport after parsing. No environment release
flag, arbitrary target, option bag, executable or retry path was introduced.
Recursive canonicalization of nested JSON was not added: the author's exploratory
40PASS/3FAIL20:05:53 concerned an out-of-contract expectation, not an authority
defect. Those exploratory assertions were removed by their author/controller.

Four additional peer cases verify the old/new grammar separation, complete-pair
reordering, duplicate flags, extra target arguments, unsupported modes and an
ineffective environment GO flag. Parsing failures occur before source work,
filesystem writes or any simulated child. Fresh three-file run20:09:30:
**97/97 PASS** (48 runner author +40 bridge author +9 peer),27.34s, exit0.
Peer lint exit0. Author-reported bridge TSC20956 exit0 predates these four new
peer cases; no newer all-file typecheck is asserted by this reviewer yet.

**Verdict: closed CLI delta GREEN under simulated tests.** It makes the reviewed
path callable; it does not establish that migration, preservation, suspension or
backup has occurred. Actual target execution remains the controller's separate
single-attempt responsibility. No execution was performed by this reviewer.
