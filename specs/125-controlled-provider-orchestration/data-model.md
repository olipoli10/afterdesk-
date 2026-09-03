# Data Model: Controlled Provider Orchestration R37C

## ControlledProviderRun

- identity: workspace, grant, idempotency key and command fingerprint;
- immutable binding: sealed attempt, case, exact model and executor fingerprint;
- ownership: lease token and expiry;
- lifecycle: `PREPARED -> RUNNING -> EVIDENCE_RECORDED -> SUCCEEDED` or `RUNNING -> RELEASE_PENDING -> FAILED`;
- finance: one linked R37B spend attempt;
- result: stored R37A evidence or bounded failure code;
- version and timestamps for recovery/audit.

## Invariants

- one run per grant and idempotency key;
- one spend attempt per run;
- evidence exists only for `EVIDENCE_RECORDED` or `SUCCEEDED`;
- terminal success cannot be rewritten;
- lease reclaim requires expiry and synthetic-only binding.
