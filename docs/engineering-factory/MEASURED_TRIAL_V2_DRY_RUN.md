# Engineering Factory / measured dry-run v2

## Status

**LOCAL ONLY — scheduling and evidence gates only; no candidate run has started.**

V2 exists because DevBench v1 has one real frozen seed per focused case, not
one shared seed for all eight. It never retroactively changes V1 evidence or
converts historical candidate results into a measured comparison.

## What V2 freezes

- exactly two declared candidates;
- one distinct, 40-character frozen commit for every catalog case;
- a participant-neutral focused packet fingerprint per case;
- four full passes: Codex, Claude, Claude, Codex;
- evaluator-owned monotonic elapsed time and intervention count;
- a fixed `unavailable` cost source with `costCents: null`.

The final rule is deliberate: a subscription/quota dry-run can compare
accepted technical evidence and elapsed time, but must not claim a cost rank.

## Local manifest lifecycle

The ignored local file is
`.scratch/engineering-factory/dry-run-trial-config/dry-run-trial-config.json`.

1. Write a create-only `DRAFT` template.
2. The evaluator supplies the eight verified seed commits and two non-secret
   candidate descriptors.
3. The evaluator explicitly changes `status` to `APPROVED`.
4. `npm run devbench:dry-run:preflight` emits the 32-slot schedule only. It
   does not invoke a model, provider, network request or deployment.

The manifest rejects prompts, outputs, secrets, tokens, attachments and API
keys recursively. A supplied result is accepted only if its candidate fields,
focused case, seed, required command evidence, mutation, scope, elapsed clock
and unavailable-cost declaration match its frozen slot exactly.

## Explicit non-claims

- V2 does not rank cost, choose a winner or adopt a provider/model.
- It does not make a provider call, use a gateway, change production or push.
- It does not replace independent human review of a completed candidate run.
