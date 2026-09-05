# Data Model: Corrected OpenRouter Retest

## Reused durable records

- `ProviderLaneControl`: global disabled/enabled state with versioned transitions.
- `ProviderActivationGrant`: model, workspace, call/spend ceilings, case fingerprints, expiry, status and version.
- `ProviderSpendAttempt`: reservation, settlement, idempotency key and exact cost.

## New evidence records

- `credential-free-preflight.json`: readiness booleans, fixed request version, exact ceilings, immutable prior hash and replay state; never secret material.
- `campaign-lock.json`: one immutable claim containing campaign ID, timestamp and zero-retry policy.
- `observed-provider-report.json`: the frozen R37 campaign report schema written only under feature 194.
- `.scratch/r37-corrected-openrouter-retest/*.json`: per-observation evidence, excluded from Git.

No migration or reinterpretation of historical data is required.
