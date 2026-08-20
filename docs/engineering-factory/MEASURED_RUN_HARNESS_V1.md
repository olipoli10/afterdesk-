# Engineering Factory / measured-run harness v1

## Status

**LOCAL ONLY — measurement plumbing ready; no candidate trial has run.**

`src/lib/engineering-factory/measured-run.ts` provides the evaluator-side
envelope for a DevBench run. It is deliberately not a provider client, agent
runner, sandbox, gateway or deployment path.

## What the harness owns

- The declared candidate label, model label, harness label, reasoning effort,
  frozen-checkout context mode and no-network declaration.
- Elapsed time from an evaluator-supplied monotonic clock, measured outside
  the candidate callback.
- A single non-negative intervention count declared by the evaluator.
- A supported meter value, or an explicit null/unavailable cost value.
- Create-only local storage with a SHA-256 integrity check.

Only outcomes and the independent reviewer verdict may return from the
candidate callback. Extra callback fields are discarded; they cannot replace
the declared identity, elapsed time, cost or intervention count.

## What it refuses

- Non-monotonic evaluator time, invalid evidence or unsupported measurement
  values.
- Numeric cost paired with `unavailable` cost source.
- Sensitive metadata fields already rejected by `DevBenchRun`, including
  prompt, output, secret, token, authorization, attachment and content.
- Unsafe artifact names, artifact path escape and replacement of an existing
  run artifact.
- Changed local evidence whose SHA-256 no longer matches the stored run.

An unavailable cost remains honest technical evidence but cannot be used for a
cost or speed ranking by the existing scorecard.

## Operating boundary

The caller must execute the candidate in the independently controlled process
or environment required by the trial protocol, then call `captureMeasuredRun`
from the evaluator. This module does not itself create a process boundary and
does not make network/provider calls. A future trial needs an approved,
metered candidate configuration and frozen equivalent task packets before it
can produce a comparison.

## Local artifact rule

The default artifact directory is `.scratch/engineering-factory/measured-runs`,
which is local and ignored. Artifact files are create-only. Their payload is
the existing privacy-validated `DevBenchRun` envelope plus an integrity hash;
they must never carry raw provider traffic or customer data.
