# Engineering Factory / measured trial protocol v1

## Status

**LOCAL ONLY — protocol executable; no provider trial has run and no candidate is selected.**

This is the execution layer above `MEASURED_RUN_HARNESS_V1.md`. It validates
the structure of a fair two-candidate comparison without storing credentials,
customer material, prompts, outputs or provider traffic.

## Before an evaluator may run a trial

The evaluator must supply exactly two approved candidate configurations. Each
one declares only:

- participant (`Codex` or `Claude`);
- safe candidate label, model label and harness label;
- reasoning effort;
- one supported cost source: `harness-meter` or `provider-billing-export`.

Both use the same frozen 40-character commit, sanitized checkout, no-network
rule, eight-case DevBench packet and intervention rule. The plan rejects a
missing meter, duplicate participant, identical declared configurations,
unsafe descriptors and unequal packets before any candidate result is ranked.

## Counterbalanced schedule

Each candidate performs the same packet twice:

| Round | First | Second |
| --- | --- | --- |
| 1 | Candidate A | Candidate B |
| 2 | Candidate B | Candidate A |

The order limits first-run and environment-warmup bias. A replacement run is
not silently substituted: it needs a new explicitly approved plan.

## Per-slot operating procedure

1. Confirm the worktree is at the plan's frozen commit and the generated
   candidate packets remain byte-equivalent except for participant label.
2. Start the evaluator-owned monotonic clock outside the candidate process.
3. Provide exactly the frozen packet and approved local environment.
4. Count every evaluator action that changes candidate input, scope,
   environment or result. Ordinary start, stop and observation do not count.
5. Capture only test/mutation/scope/reviewer evidence through the measured-run
   harness. Do not put prompts, outputs, credentials, attachments or provider
   traffic into the record.
6. Before scorecard comparison, call `assertRunMatchesMeasuredTrial`. It
   rejects any changed commit, model label, harness label, reasoning effort,
   sanitized/no-network condition, cost source, catalog or outcome set.
7. An accepted technical run is rankable only if both evaluator monotonic time
   and a supported cost measurement are present. Otherwise it is evidence, not
   a cost/speed comparison.

## Explicit boundaries

- The plan never invokes a model, provider, gateway or network request.
- It does not create process isolation; the evaluator must provide that
  isolation before invoking the local harness.
- It does not adopt a provider, model, gateway, tool bundle or workflow.
- It does not authorize a push, build bypass, Preview or Production action.
