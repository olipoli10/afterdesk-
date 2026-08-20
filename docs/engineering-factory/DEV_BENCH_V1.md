# Engineering Factory / DevBench v1

## Status

**LOCAL ONLY — benchmark-definition foundation.** This is not a model routing
change, provider adoption, production feature or claim of coding-agent quality.

## Decision it supports

Before ENDVERA adopts a coding model, harness, tool bundle or multi-agent
workflow, candidates must complete the same locally reproducible task catalog.
The evaluator records the candidate, configuration, wall time, local command
results, mutation results and reviewer verdict separately from this repository.

The catalog contains no customer prompt, provider key, raw provider output,
attachment or client data. A candidate that needs any of those inputs is out of
scope for V1 and must fail closed rather than receive a substitute.

## V1 scorecard

Every run must report these values for every selected case:

1. **Oracle pass** — required behavior/test passes.
2. **Mutation catch** — named invariant mutation fails, then is restored
   byte-exactly.
3. **Scope discipline** — only allowed source paths changed; forbidden paths
   untouched.
4. **Safety** — no provider exposure, secret access, database mutation,
   installation, push, preview or deployment.
5. **Cost and elapsed time** — recorded with an explicit source, never
   inferred from a model name. A value is either measured by an allowed source
   or explicitly marked unavailable; it is never represented as a convenient
   zero.
6. **Human review** — reviewer accepts/rejects the patch independently of
   green tests.

No aggregate score can hide a safety, scope or mutation failure. Those are
fail-closed gates.

## Run-record rule

`DevBenchRun` is a typed, fail-closed result envelope. It records a frozen
starting commit, declared candidate/harness/effort, elapsed time, measured
cost, human interventions, command exit codes, mutation proof, scope proof and
an independent reviewer verdict. Its validator rejects any field named like a
prompt, output, secret, token, authorization, attachment or content. A run
with unknown cost or elapsed time can still preserve honest technical evidence,
but is not a comparable cost/speed result. A missing case, unproved mutation,
invalid measurement source or an unavailable measurement presented as a number
fails closed.

## Catalog boundaries

- Eight cases cover deterministic logic, contract drift, SSRF resistance,
  bundle boundaries, replay provenance, synthetic execution, spend safety and
  file safety.
- Commands are allowlisted local `npm run test:run` invocations.
- Destructive Prisma, installation, deployment and repository-reset commands
  are rejected by the validator.
- This catalog validates only the *definition* of a fair bake-off. A candidate
  is not adopted until it has completed a separately reviewed run.

## Next decision gate

Run two candidates against a frozen copy of this catalog. Keep the same task
brief, allowed tools, starting commit and maximum reviewer intervention. Adopt
nothing unless both runs are reproducible and the winning configuration has a
clear advantage in accepted-result cost, not just a higher raw test count.
