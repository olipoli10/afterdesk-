# Engineering Factory / DevBench v1 — Closeout

**Date:** 2026-08-20
**Status:** `TECHNICAL CATALOG COMPLETE — NO ADOPTION`

## Executive decision

DevBench v1 completed eight focused, independently reviewed local bake-off
cases. It does **not** identify an overall winning coding model or harness.

- Candidate A (Codex) has three narrow technical wins.
- Candidate B (Claude) has three narrow technical wins.
- Two cases are ties, including one exact final-tree tie.
- No focused run persisted a complete `DevBenchRun` record with exact model,
  harness, reasoning effort, human interventions and supported cost/time
  measurements.

**Decision: do not adopt or route to either candidate from V1 evidence.** The
catalog proves useful technical differences and the viability of the review
protocol. It does not prove accepted-result economics, stable configuration
quality or end-to-end operating reliability.

## Case results

| Case | Family | Technical result | Deciding evidence |
| --- | --- | --- | --- |
| EF-001 | deterministic core | tie | Both fail closed on malformed access counts; no demonstrated safety or correctness difference. |
| EF-002 | contract drift | Codex | Same isolation behavior with the repository's existing `structuredClone`, less bespoke clone logic. |
| EF-003 | network safety | Claude | Structural NAT64 handling also blocks the expanded equivalent literal missed by the shorter text-specific patch. |
| EF-004 | client/server boundary | exact tie | Identical source blob and final Git tree. |
| EF-005 | replay provenance | Claude | Malformed stored `tools` remains part of identity and fails closed instead of aliasing an empty tools list. |
| EF-006 | synthetic execution | Codex | Equivalent boundary check expressed once as a concise reusable typed predicate. |
| EF-007 | spend safety | Codex | Equivalent conflict guard without attaching operation-correlated identifiers to the error object. |
| EF-008 | file security | Claude | Typed primitive-to-suffix mapping prevents a future CSV/XLSX caller inversion from compiling as readily. |

The 3–3–2 count is descriptive only. The cases are neither random samples nor
equally weighted measurements, and several decisions depend on independent
reviewer oracles beyond the seed test. Counting wins cannot substitute for a
validated scorecard.

## Fresh closeout verification

The closeout rechecked the historical evidence without editing any candidate:

- all 16 reviewed candidate commits have their documented frozen seed as
  their direct parent;
- all 16 reviewed candidate worktrees are clean;
- every candidate lockfile is byte-identical to its corresponding seed;
- all 16 candidate full suites pass on their final commits:
  - EF-001: 1217/1217 for both candidates;
  - EF-002: 1217/1217 for both candidates;
  - EF-003: 1209/1209 for both candidates;
  - EF-004: 1216/1216 for both candidates;
  - EF-005: 1217/1217 for both candidates;
  - EF-006 repaired seed: 1217/1217 for both candidates;
  - EF-007: 1219/1219 for both candidates;
  - EF-008: 1219/1219 for both candidates.

One EF-002 Claude suite timed out in a global source-inspection test while four
full suites were deliberately run concurrently. The same commit passed
1217/1217 immediately when rerun alone. This is recorded as evaluator-induced
load, not a candidate failure.

The named mutation evidence remains the evidence recorded and independently
reviewed in each case report. The closeout did not mutate the historical
candidate worktrees again.

## What V1 demonstrates

### Demonstrated

- Equal, frozen case packets can expose meaningful implementation differences
  even when both candidates satisfy the seeded test.
- Independent review adds value: EF-003 and EF-005 were decided by equivalent
  or malformed forms that the narrow seed did not fully distinguish.
- Both candidates can produce locally scoped, test-passing corrections across
  all eight represented families.
- The fail-closed ordering of oracle, mutation, scope and reviewer gates is a
  sound benchmark foundation.

### Inference, not adoption evidence

- Codex showed a recurring advantage in concise, repository-consistent
  implementations and smaller data surfaces on three cases.
- Claude showed a recurring advantage in broader structural handling at three
  security or provenance boundaries, sometimes with substantially more code
  and commentary.
- A future workflow might benefit from one implementation candidate plus an
  adversarial reviewer, but V1 did not test that workflow and cannot authorize
  it.

### Unknown

- Exact model/version and reasoning-effort stability across all eight runs.
- Cost per accepted case.
- Monotonic elapsed time under an equal machine load.
- Number and duration of human interventions under one consistent definition.
- Performance when all eight cases are attempted by one unchanged candidate
  configuration in catalog order.
- Reliability on real repositories, longer tasks, provider outages or customer
  outcomes.

## Method limitations

1. The cases were focused trials performed sequentially, not one persisted
   eight-case run by each unchanged candidate configuration.
2. The review documents label candidates as Codex and Claude but do not
   consistently persist exact model, harness and effort fields required by
   `DevBenchRun`.
3. No run record has a supported `harness-monotonic` elapsed source or
   `harness-meter` / `provider-billing-export` cost source. Therefore the
   bake-off scorecard is non-comparable on speed and cost by design.
4. EF-003 had a stale seed SHA in its challenge prose. EF-006 required a
   repaired seed after the original seed test failed to typecheck. The reviews
   correctly froze the repaired authorities, but these are process defects.
5. The suite grew from 1209 to 1219 tests across the series. Within each case
   the candidates were equal; across cases the repository state was not one
   fixed full-catalog starting point.
6. Human reviewer judgment intentionally decided several narrow ties. V1 has
   no blinded second reviewer or inter-rater calibration.

## Excluded historical residue

The obsolete `C:\dev\nightlexicon-devbench-ef006-codex` worktree is dirty with
the later synthetic-response guard. That worktree is based on the invalid
EF-006 seed and was explicitly excluded from the reviewed evidence before the
R2 candidates were created. It was not modified or cleaned during closeout.
The admissible `ef006-codex-r2` and `ef006-claude-r2` worktrees are clean.

## Required next gate

Do not create EF-009 inside V1 and do not start a provider adoption trial yet.
First build a local **measured-run harness** that:

1. persists a valid `DevBenchRun` record for every candidate;
2. freezes exact model, harness, effort and context mode before execution;
3. records monotonic elapsed time outside the candidate process;
4. records meter-backed cost or honestly marks cost unavailable;
5. counts human interventions with one predeclared rule;
6. runs equivalent packets under controlled machine load;
7. preserves mutation, scope, privacy and independent-review gates;
8. produces a scorecard that remains non-comparable when any required meter or
   gate is absent.

Only after that harness is mutation-proven should the Control Tower run one
consolidated, measured comparison and decide whether a separate adoption trial
is justified.

## Local-only statement

No candidate was merged or adopted. No push, Preview, Production action,
provider call, database operation, migration, credential access, package
installation or protected product-worktree modification occurred during this
closeout.
