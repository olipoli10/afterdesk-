# Engineering Factory / trial configuration manifest v1

## Status

**LOCAL ONLY — operator input template, not trial evidence.**

The manifest lives by default at
`.scratch/engineering-factory/trial-config/trial-config.json`. It is ignored
by Git on purpose. It contains no credential and must never contain prompts,
outputs, attachments, customer data, tokens, secrets or provider traffic.

## Lifecycle

1. `writeTrialManifestTemplate` creates one create-only `DRAFT` file with
   visible placeholders.
2. An evaluator replaces every placeholder with two approved, non-secret
   candidate descriptions and chooses a supported cost source for each.
3. The evaluator explicitly changes `status` to `APPROVED`.
4. `npm run devbench:trial:preflight` validates the file and only then
   produces the counterbalanced measured-trial plan for inspection. It prints
   `PREFLIGHT_READY` only for an approved configuration; otherwise it exits
   non-zero without launching a candidate, provider or network request.

An edited manifest is configuration input, not a historical run record. The
measured-run harness remains the create-only, integrity-checked record of a
completed trial.

## Required fields

```json
{
  "schemaVersion": 1,
  "status": "APPROVED",
  "startingCommit": "40-character-frozen-commit",
  "candidates": [
    {
      "participant": "Codex",
      "label": "non-secret-candidate-a",
      "modelLabel": "approved-model-label",
      "harnessLabel": "approved-local-harness-label",
      "reasoningEffort": "high",
      "costSource": "harness-meter"
    },
    {
      "participant": "Claude",
      "label": "non-secret-candidate-b",
      "modelLabel": "approved-model-label",
      "harnessLabel": "approved-local-harness-label",
      "reasoningEffort": "high",
      "costSource": "provider-billing-export"
    }
  ]
}
```

This JSON is illustrative only. It does not authorize those labels, providers
or a trial.

## Fail-closed rules

- `DRAFT` never creates an executable plan.
- Every placeholder blocks approval.
- Exactly two distinct participants/configurations are required.
- Each candidate needs a real supported cost source; `unavailable` blocks the
  plan before any run is recorded.
- Unknown sensitive-looking fields, including `apiKey`, `secret`, `token`,
  `prompt`, `output`, `content` and `attachment`, are rejected recursively.
- The file is create-only at its default location; an evaluator must choose
  deliberately to edit the existing local draft rather than silently replace
  it.

## Not authorized

The manifest neither invokes a model nor validates credentials, metering,
network controls or process isolation. It cannot authorize provider adoption,
gateway integration, a production release, push, Preview or deployment.
