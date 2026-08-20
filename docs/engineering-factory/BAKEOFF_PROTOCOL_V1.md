# Engineering Factory / Bake-off Protocol v1

## Purpose

This protocol compares two **candidates**, not deployed providers. It creates
two equal task packets from the frozen DevBench catalog and accepts a result
only when every safety, scope, oracle, mutation and review gate passes.

## Before either candidate starts

1. Create two isolated copies at the same starting commit.
2. Generate both packets:
   - `npm run devbench:packet -- Codex`
   - `npm run devbench:packet -- Claude`
3. Confirm `packetsAreEquivalent(...) === true` before sharing either packet.
   `npm run devbench:bakeoff:validate` executes that proof locally.
4. Set the same wall-time and evaluator cost ceiling outside the repository.
5. Provide no client data, production credentials, prompt corpus, attachment
   or network access. A sanitized frozen checkout is the only allowed context.
6. Record elapsed time and cost with their source. Only
   `harness-monotonic` elapsed time and `harness-meter` or
   `provider-billing-export` cost can enter a ranking. If either is
   unavailable, record `null` with source `unavailable`; the technical result
   remains reviewable but has no price or speed rank.

## Focused trial before the full benchmark

The first trial may exercise one case only when it uses
`createFocusedCandidatePacket(...)` and `scoreFocusedDevBenchRun(...)` with
the same catalog and one explicit case ID. This is not a shortcut around the
full benchmark:

- both packets must have the same one-case tree and the same starting commit;
- the run record must contain that case and no additional case;
- it is rejected by the same privacy, scope, mutation, command and reviewer
  gates as a full run;
- a focused result is evidence about that case only. It never adopts a model,
  provider, gateway or general-purpose coding workflow.

## Candidate rules

- One case at a time, in the frozen catalog order.
- Only listed source paths may be changed; listed forbidden paths are off
  limits.
- Each named mutation must fail and then be restored byte-exactly.
- No package install, lockfile change, migration, database write, deployment,
  push, external provider call or access to production credentials.
- The evaluator records elapsed seconds, measured cost and human interventions.

## Decision order

1. Reject a run with any validator error. It is **not comparable**.
2. Compare only accepted runs by: accepted cases, human interventions, cost per
   accepted case, then elapsed time.
3. Human review makes the final accept/reject decision. A lower cost never
   overrides a rejected review or an unproved mutation.

## What V1 does not prove

- It does not adopt Codex, Claude, a model gateway or a tool bundle.
- It does not measure real provider reliability, token accounting or customer
  outcomes.
- It does not authorize production integration.
